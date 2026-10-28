/*
 * ai.js — Triply's AI helpers, with a spending cap.
 *   read(trip, input)      read a booking (PDF, photo, screenshot or pasted email) -> flights, hotels, tours…
 *   flight(trip, query)    find a real flight by number ("AC 880, Jun 4") or route ("YVR to Paris, Jun 4") with web search
 *   plan(trip, wishes)     a whole draft trip + a rough cost, using real places found with web search
 * Calendar files (.ics) are read for free, without AI.
 *
 * Money: every call's real cost (tokens + web searches) is saved in ai_usage. Before a call, an estimate is reserved,
 * so the whole site never goes over TRIPLY_AI_DAILY_USD (default US$1) per day. Each trip also has small daily limits.
 * The API key stays on the server and never reaches the browser.
 */
'use strict';

const M = require('./models');
const { ApiError, bad } = require('./mini');

// Prices in US$ per million tokens [input, output]. Unknown models are priced high, so the cap stays safe.
function priceOf(model, inputTokens) {
  const m = String(model).toLowerCase();
  if (m.includes('haiku')) return inputTokens > 100000 ? [0.5, 2.5] : [0.1, 0.5];
  if (m.includes('sonnet')) return [2, 10];
  return [15, 75];
}
const SEARCH_USD = 0.01;
// What each kind of use may cost at most (reserved before the call) and how often a trip may use it per day.
const KINDS = {
  read:   { reserve: 0.02, perTrip: 40, label: 'reading bookings' },
  flight: { reserve: 0.05, perTrip: 20, label: 'flight look-ups' },
  plan:   { reserve: 0.6,  perTrip: 5,  label: 'trip plans' }
};
const micro = (usd) => Math.round(usd * 1e6);
const FREE_PLANS = 2; // "Plan my trip" uses per person, ever (Make it cheaper / Go fancier count too). The site owner can give more.

function createAi(cfg, db) {
  const A = cfg.ai;
  const enabled = () => !!(A.key || A.fake) && A.dailyUsd > 0;
  const today = async () => (await db.q('select (now() at time zone $1)::date::text as d', [A.timeZone])).rows[0].d;

  async function status(tripId, memberId) {
    if (!enabled()) return { enabled: false, resting: false, left: {} };
    const day = await today();
    const spent = Number((await db.q('select coalesce(sum(micro_usd), 0)::bigint as n from ai_usage where day = $1', [day])).rows[0].n);
    const used = (await db.q('select kind, count(*)::int as n from ai_usage where day = $1 and trip_id = $2 group by kind', [day, tripId])).rows;
    const left = {};
    Object.keys(KINDS).forEach((k) => { const u = used.find((x) => x.kind === k); left[k] = Math.max(0, KINDS[k].perTrip - (u ? u.n : 0)); });
    if (memberId) {
      left.myPlans = await plansLeft(memberId);
      left.asked = (await db.q("select count(*)::int as n from ai_requests where member_id = $1 and status = 'open'", [memberId])).rows[0].n > 0;
    }
    return { enabled: true, resting: spent + micro(KINDS.read.reserve) > micro(A.dailyUsd), left };
  }

  // How many free trip plans this person has left (2, plus any the site owner gave them).
  async function plansLeft(memberId, client) {
    const qq = client ? (t, p) => client.query(t, p) : db.q;
    const used = (await qq("select count(*)::int as n from ai_usage where member_id = $1 and kind = 'plan'", [memberId])).rows[0].n;
    const g = (await qq('select extra from ai_grants where member_id = $1', [memberId])).rows[0];
    return Math.max(0, FREE_PLANS + (g ? g.extra : 0) - used);
  }

  // Reserve the most this use can cost, or refuse. Returns the usage row id.
  async function reserve(kind, trip, member) {
    if (!enabled()) throw new ApiError(503, 'ai_off', 'AI help is not turned on for this site. You can still add everything by hand.');
    const K = Object.assign({}, KINDS[kind]);
    // A plan's most likely cost depends on the model: Haiku about 35¢ at most, bigger models more.
    if (kind === 'plan') K.reserve = /haiku/i.test(A.planModel) ? 0.35 : 1.2;
    return db.tx(async (cl) => {
      await cl.query('select pg_advisory_xact_lock(7331)'); // one reservation at a time, so the cap holds
      const day = (await cl.query('select (now() at time zone $1)::date::text as d', [A.timeZone])).rows[0].d;
      const spent = Number((await cl.query('select coalesce(sum(micro_usd), 0)::bigint as n from ai_usage where day = $1', [day])).rows[0].n);
      if (spent + micro(K.reserve) > micro(A.dailyUsd)) throw new ApiError(429, 'ai_resting', 'AI help is resting until tomorrow. Lots of trips used it today. You can still add things by hand.');
      const n = (await cl.query('select count(*)::int as n from ai_usage where day = $1 and trip_id = $2 and kind = $3', [day, trip.id, kind])).rows[0].n;
      if (n >= K.perTrip) throw new ApiError(429, 'ai_trip_limit', 'This trip used all of today’s ' + K.label + '. Try again tomorrow, or add it by hand.');
      if (kind === 'plan' && (await plansLeft(member.id, cl)) < 1) throw new ApiError(429, 'ai_user_limit', 'You have used your free trip plans. You can ask for more, or plan by hand.');
      const r = await cl.query('insert into ai_usage (day, trip_id, member_id, kind, micro_usd) values ($1,$2,$3,$4,$5) returning id', [day, trip.id, member.id, kind, micro(K.reserve)]);
      return r.rows[0].id;
    });
  }
  // Keep the real cost. A use that failed does not count against the trip or the person.
  const settle = (id, usd, failed) => db.q("update ai_usage set micro_usd = $2, kind = case when $3 then kind || '_failed' else kind end where id = $1", [id, micro(usd), !!failed]).catch(() => {});

  /* ---------- talking to Claude ---------- */
  async function ask({ model, system, content, searches, maxTokens, kind }) {
    if (A.fake) {
      const out = await require(A.fake)({ kind, system, content });
      return { text: out.text, usd: out.usd || 0 };
    }
    const tools = searches ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: searches }] : undefined;
    const messages = [{ role: 'user', content }];
    let inTok = 0, outTok = 0, nSearch = 0, text = '';
    for (let turn = 0; turn < 4; turn++) { // long web searches can pause; continue them
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 110000);
      let r;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': A.key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools })
        });
      } catch (e) { throw new ApiError(504, 'ai_slow', 'The AI took too long. Please try again.'); }
      finally { clearTimeout(t); }
      if (r.status === 429 || r.status === 529) throw new ApiError(503, 'ai_busy', 'The AI is busy right now. Please try again in a minute.');
      if (!r.ok) { if (cfg.log) cfg.log.error('[triply] ai', r.status, (await r.text()).slice(0, 300)); throw new ApiError(502, 'ai_failed', 'The AI could not help right now. Please try again.'); }
      const j = await r.json();
      const u = j.usage || {};
      inTok += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); outTok += u.output_tokens || 0;
      nSearch += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
      text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (j.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: j.content });
    }
    const [pin, pout] = priceOf(model, inTok);
    return { text, usd: (inTok * pin + outTok * pout) / 1e6 + nSearch * SEARCH_USD };
  }

  function json(text) {
    const s = String(text || '');
    const tries = [s.trim()];
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) tries.push(fence[1]);
    const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a > -1 && b > a) tries.push(s.slice(a, b + 1));
    for (const t of tries) { try { return JSON.parse(t); } catch (e) { /* next */ } }
    throw new ApiError(502, 'ai_failed', 'The answer came back in a strange shape. Please try again.');
  }

  async function run(kind, trip, member, call) {
    const id = await reserve(kind, trip, member);
    let usd = 0, failed = false;
    try { const r = await call(); usd = r.usd; return json(r.text); }
    catch (e) { failed = true; if (!usd) usd = 0.002; throw e; }
    finally { settle(id, usd, failed); }
  }

  /* ---------- turning answers into plans the trip can save ---------- */
  const T = (v, n) => M.text(v, n || 160);
  const money = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const cur = (v) => { const c = T(v, 3).toUpperCase().replace(/[^A-Z]/g, ''); return c.length === 3 ? c : ''; };
  // One booking from the AI -> { item, price, currency, passengers } (or null when it cannot be a valid plan)
  function toPlan(b) {
    if (!b || typeof b !== 'object') return null;
    const type = ['flight', 'hotel', 'car', 'cruise', 'activity', 'restaurant', 'place', 'note'].includes(b.type) ? b.type : b.type === 'train' || b.type === 'transfer' || b.type === 'bus' ? 'car' : b.type === 'tour' ? 'activity' : null;
    if (!type) return null;
    const data = {};
    if (type === 'flight') Object.assign(data, { airline: T(b.airline, 60), flightNo: T(b.flightNo || b.flight_number, 20), from: T(b.from, 80), to: T(b.to, 80), terminal: T(b.terminal, 20), seat: T(b.seat, 20) });
    if (type === 'hotel') Object.assign(data, { room: T(b.room, 120), contact: T(b.phone || b.contact, 160) });
    if (type === 'car') Object.assign(data, { company: T(b.company, 80), vehicle: T(b.vehicle, 80), dropoffLocation: T(b.dropoff || b.to, 160) });
    if (type === 'activity' && money(b.price || b.est_cost)) Object.assign(data, { cost: money(b.price || b.est_cost), currency: cur(b.currency) });
    if (type === 'restaurant' && b.people) data.people = b.people;
    let title = T(b.title, 120);
    if (type === 'flight' && !title) title = data.from && data.to ? data.from + ' → ' + data.to : [data.airline, data.flightNo].filter(Boolean).join(' ');
    if (type === 'car' && !title) title = data.company || 'Transfer';
    const notes = [T(b.notes, 600), b.passengers ? 'Passengers: ' + T([].concat(b.passengers).join(', '), 300) : ''].filter(Boolean).join('\n');
    const tm = (v) => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})/); return m && +m[1] < 24 ? m[1].padStart(2, '0') + ':' + m[2] : null; };
    const dt = (v) => (M.isDate(String(v || '').slice(0, 10)) ? String(v).slice(0, 10) : null);
    const base = { type, title, start_date: dt(b.start_date), start_time: tm(b.start_time), end_date: dt(b.end_date), end_time: tm(b.end_time),
      location: T(b.location || b.address || (type === 'car' ? b.from : ''), 200), confirmation: T(b.confirmation, 60), notes, data };
    const out = (item) => ({ item, price: money(b.price), currency: cur(b.currency), passengers: Array.isArray(b.passengers) ? b.passengers.length : parseInt(b.passengers, 10) || null });
    try { return out(M.item(base, null)); } catch (e) { /* try once more without the end, which is often the odd part */ }
    try { return out(M.item(Object.assign({}, base, { end_date: null, end_time: null }), null)); } catch (e) { return null; }
  }

  /* ---------- free: calendar files ---------- */
  // "Booking reference: 7XK2PQ" -> 7XK2PQ (the first code-looking word after one of these words)
  function confOf(text) {
    const m = String(text).match(/(confirmation|booking|reference|pnr|record locator)/i);
    if (!m) return '';
    const after = String(text).slice(m.index + m[0].length, m.index + m[0].length + 60).split(/[^A-Za-z0-9-]+/);
    return after.find((w) => /^[A-Z0-9-]{5,12}$/.test(w) && /\d|^[A-Z]{6}$/.test(w)) || '';
  }
  function readIcs(text) {
    const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let ev = null;
    const dt = (v) => { const m = String(v || '').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/); return m ? { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] ? m[4] + ':' + m[5] : null } : {}; };
    const un = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    for (const l of lines) {
      if (l === 'BEGIN:VEVENT') ev = {};
      else if (l === 'END:VEVENT' && ev) { out.push(ev); ev = null; }
      else if (ev) { const i = l.indexOf(':'); if (i > 0) ev[l.slice(0, i).split(';')[0].toUpperCase()] = l.slice(i + 1); }
    }
    return out.slice(0, 30).map((e) => {
      const s = dt(e.DTSTART), en = dt(e.DTEND), title = un(e.SUMMARY), desc = un(e.DESCRIPTION);
      const fl = title.match(/\b([A-Z0-9]{2})\s?(\d{1,4})\b/);
      const type = /flight|✈/i.test(title) || (fl && /→|->| to |\([A-Z]{3}\)/.test(title)) ? 'flight' : /hotel|check.?in|stay|resort|inn\b|suites?\b/i.test(title + ' ' + desc) ? 'hotel' : 'activity';
      return toPlan({ type, title, start_date: s.date, start_time: s.time, end_date: en.date, end_time: en.time, location: un(e.LOCATION), notes: desc.slice(0, 600),
        airline: '', flightNo: type === 'flight' && fl ? fl[1] + ' ' + fl[2] : '', confirmation: confOf(desc) });
    }).filter(Boolean);
  }

  /* ---------- the three helpers ---------- */
  const tripLine = (trip) => 'The trip is "' + trip.name + '", ' + trip.start_date + ' to ' + trip.end_date + (trip.destination ? ', ' + trip.destination : '') + '.';
  const BOOKING_SHAPE = '{"bookings":[{"type":"flight|hotel|car|activity|restaurant","title":"","airline":"","flightNo":"AC 880","from":"Vancouver (YVR)","to":"Paris (CDG)",' +
    '"start_date":"YYYY-MM-DD","start_time":"HH:MM","end_date":"YYYY-MM-DD","end_time":"HH:MM","terminal":"","seat":"","room":"","phone":"","address":"","company":"","vehicle":"",' +
    '"confirmation":"","passengers":["Name"],"price":0,"currency":"EUR","notes":""}]}';

  async function read(trip, member, input) {
    // Free first: calendar files
    if (input.text && /BEGIN:VCALENDAR/.test(input.text)) return { source: 'calendar', found: readIcs(input.text), cost: 0 };
    const content = [];
    if (input.file) {
      const { mime, bytes } = input.file;
      if (mime === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: mime, data: bytes.toString('base64') } });
      else if (/^image\/(jpeg|png|gif|webp)$/.test(mime)) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: bytes.toString('base64') } });
      else if (mime === 'text/plain') content.push({ type: 'text', text: bytes.toString('utf8').slice(0, 40000) });
      else throw bad('unsupported', 'Upload a PDF, a photo or a screenshot of the booking.');
    }
    if (input.text) content.push({ type: 'text', text: 'Booking email:\n' + String(input.text).slice(0, 40000) });
    if (!content.length) throw bad('invalid', 'Add a booking first.');
    content.push({ type: 'text', text: tripLine(trip) + ' Read the travel booking above and list every booking in it: each flight leg separately (connections and return flights too), ' +
      'each hotel stay (check-in = start, check-out = end), trains or transfers (type "car"), tours (type "activity") and restaurant bookings. Use local times, 24-hour HH:MM, ' +
      'and dates as YYYY-MM-DD (use the trip dates to work out a missing year). price is the total paid for that booking, if shown. Leave out anything not in the booking. ' +
      'Reply with ONLY JSON like ' + BOOKING_SHAPE + ' and {"bookings":[]} if it is not a travel booking.' });
    const res = await run('read', trip, member, () => ask({ kind: 'read', model: A.model, maxTokens: 4000, content,
      system: 'You read travel booking confirmations and turn them into structured data. Never invent details that are not in the document. Reply with JSON only.' }));
    return { source: 'ai', found: (Array.isArray(res.bookings) ? res.bookings : []).slice(0, 30).map(toPlan).filter(Boolean) };
  }

  async function flight(trip, member, query) {
    const q = M.text(query, 120);
    if (q.length < 3) throw bad('invalid', 'Type a flight number and date, like “AC 880, Jun 4”.');
    const res = await run('flight', trip, member, () => ask({ kind: 'flight', model: A.model, maxTokens: 2000, searches: 3,
      system: 'You look up real scheduled airline flights with web search. Never make up a flight. Reply with JSON only.',
      content: [{ type: 'text', text: tripLine(trip) + ' Find this flight: "' + q + '". If it is a flight number, return that flight on that date. If it is a route, return up to 3 real flights ' +
        'that day (nonstop first). Local times, 24-hour. Reply with ONLY JSON like {"flights":[{"airline":"Air Canada","flightNo":"AC 880","from":"Vancouver (YVR)","to":"Paris (CDG)",' +
        '"start_date":"YYYY-MM-DD","start_time":"HH:MM","end_date":"YYYY-MM-DD","end_time":"HH:MM","terminal":"","duration":"9 h 35 min","aircraft":""}]} or {"flights":[]} if you cannot find it.' }] }));
    return { found: (Array.isArray(res.flights) ? res.flights : []).slice(0, 3).map((f) => {
      const p = toPlan(Object.assign({ type: 'flight' }, f));
      if (p) p.extra = [M.text(f.duration, 30), M.text(f.aircraft, 40)].filter(Boolean).join(' · ');
      return p;
    }).filter(Boolean) };
  }

  async function plan(trip, member, w) {
    const days = Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 864e5) + 1;
    const level = ['save', 'comfortable', 'fancy'].includes(w.level) ? w.level : 'comfortable';
    const given = parseInt(w.travelers, 10) > 0 ? Math.min(40, parseInt(w.travelers, 10)) : null;
    const cities = (Array.isArray(w.cities) ? w.cities : []).map((c) => M.text(c, 40)).filter(Boolean).slice(0, 8);
    const ask_ = 'Plan this trip. ' + tripLine(trip) + ' It is ' + days + ' days long (day 1 = ' + trip.start_date + '). ' + (given ? 'Travelers: ' + given + '.' : 'Work out how many travelers from the description (say it in "travelers").') + '\n' +
      'What they want: ' + M.text(w.description, 1500) + '\n' + (cities.length ? 'Cities, in order: ' + cities.join(', ') + '.\n' : '') +
      'Between cities: ' + (M.text(w.transport, 20) || 'whatever is best') + '. Budget style: ' + level + '.\n' +
      'Use web search to pick real, well reviewed hotels, tours and restaurants, and real flights if they fly. Make a relaxed, realistic day-by-day plan: ' +
      'flights at the start and end, one hotel per city, transfers or trains between cities, 1–2 activities and 1 dinner most days, free time too. ' +
      'Also give a rough cost for the whole group and a short packing list. Prices are estimates.\n' +
      'Reply with ONLY JSON like {"summary":"one sentence","travelers":4,"cities":[{"name":"Paris","from_day":1,"to_day":4,"highlights":"Louvre, Seine cruise"}],' +
      '"items":[{"type":"flight|hotel|car|activity|restaurant|place","title":"","day":1,"start_time":"HH:MM","end_day":1,"end_time":"HH:MM","location":"","notes":"",' +
      '"airline":"","flightNo":"","from":"","to":"","room":"","company":"","vehicle":"","est_cost":0,"currency":"EUR"}],' +
      '"cost":{"currency":"EUR","flights":0,"hotels":0,"tours":0,"food":0,"transport":0,"low":0,"high":0},"packing":["Plug adapters"]}';
    const res = await run('plan', trip, member, () => ask({ kind: 'plan', model: A.planModel, maxTokens: 12000, searches: A.planSearches,
      system: 'You are a careful, friendly family travel planner. Use real places. Times are local, 24-hour. Reply with JSON only.',
      content: [{ type: 'text', text: ask_ }] }));
    const dayDate = (n) => { const d = new Date(Date.parse(trip.start_date + 'T00:00:00Z') + (Math.min(days, Math.max(1, parseInt(n, 10) || 1)) - 1) * 864e5); return d.toISOString().slice(0, 10); };
    const items = (Array.isArray(res.items) ? res.items : []).slice(0, 120).map((x) => {
      const b = Object.assign({}, x, { start_date: x.day ? dayDate(x.day) : null, end_date: x.end_day ? dayDate(x.end_day) : null });
      const p = toPlan(b);
      if (p) { p.day = Math.min(days, Math.max(1, parseInt(x.day, 10) || 1)); p.est = money(x.est_cost); p.currency = cur(x.currency); }
      return p;
    }).filter(Boolean);
    const c = res.cost || {}, num = (v) => money(v) || 0;
    return {
      summary: M.text(res.summary, 300),
      cities: (Array.isArray(res.cities) ? res.cities : []).slice(0, 10).map((x) => ({ name: M.text(x.name, 40), from_day: parseInt(x.from_day, 10) || 1, to_day: parseInt(x.to_day, 10) || 1, highlights: M.text(x.highlights, 200) })),
      items,
      cost: { currency: cur(c.currency) || 'CAD', flights: num(c.flights), hotels: num(c.hotels), tours: num(c.tours), food: num(c.food), transport: num(c.transport), low: num(c.low), high: num(c.high) },
      packing: (Array.isArray(res.packing) ? res.packing : []).map((x) => M.text(x, 100)).filter(Boolean).slice(0, 30),
      level, travelers: given || Math.min(40, Math.max(1, parseInt(res.travelers, 10) || 2))
    };
  }

  // "Can I have more free plans?" — goes to the site owner (Kalendaryo owner view).
  async function ask4more(trip, member, message) {
    const open = (await db.q("select count(*)::int as n from ai_requests where member_id = $1 and status = 'open'", [member.id])).rows[0].n;
    if (open) throw bad('already_asked', 'You already asked. The site owner will look at it soon.');
    await db.q('insert into ai_requests (trip_id, member_id, name, message) values ($1,$2,$3,$4)', [trip.id, member.id, M.text(member.name, 40), M.text(message, 500)]);
    return { ok: true };
  }

  return { enabled, status, read, flight, plan, readIcs, priceOf, ask4more, FREE_PLANS };
}

module.exports = { createAi, KINDS };
