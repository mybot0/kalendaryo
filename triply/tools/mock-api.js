/*
 * mock-api.js — DEMO ONLY. A tiny stand-in for the Triply server that lives in the browser (localStorage),
 * so the page can be tried without a server or database. It answers the same /api routes with the same shapes.
 * Not used by the real app. Build the demo page with: node tools/build-demo.js
 */
(function () {
  const KEY = 'tr.demo.db.v1';
  const memory = {};
  const MAX_FILE = 900 * 1024; // demo limit: files are kept in the browser's own storage
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return memory[KEY] || null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) { memory[KEY] = v; } }
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(16).slice(2) + Date.now());
  const tok = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d + n); return key(t); };
  const now = () => new Date().toISOString();
  const PALETTE = ['#F4A59A', '#F6C28E', '#F1DC8B', '#B4D9AA', '#9ED8C6', '#A8CDEA', '#C7B7EA', '#EFB2CB'];

  const ROLE_PERMS = {
    owner: ['trip.read', 'trip.edit', 'trip.delete', 'members.manage', 'invites.manage', 'items.write', 'chat.write', 'files.write'],
    editor: ['trip.read', 'items.write', 'chat.write', 'files.write'],
    viewer: ['trip.read', 'chat.write', 'files.write']
  };
  const ROLES = [{ id: 'owner', label: 'Owner', blurb: '' }, { id: 'editor', label: 'Editor', blurb: '' }, { id: 'viewer', label: 'Viewer', blurb: '' }];
  const FIELDS = {
    flight: ['airline', 'flightNo', 'from', 'to', 'terminal', 'gate', 'seat'], hotel: ['room', 'contact'], car: ['company', 'dropoffLocation', 'vehicle'],
    cruise: ['cruiseLine', 'ship', 'disembarkLocation', 'cabin'], activity: ['cost', 'currency'], restaurant: ['people'], place: ['website'], note: []
  };
  const NEEDS_START = { flight: 1, hotel: 1, car: 1, cruise: 1, restaurant: 1 };
  const LABEL = { flight: 'flight', hotel: 'hotel', car: 'car rental', cruise: 'cruise', activity: 'activity', restaurant: 'restaurant', place: 'place', note: 'note' };

  let db, seq;
  function save() { if (window.TRIPLY_DEMO && window.TRIPLY_DEMO.seed) return; store.set(JSON.stringify(db)); } // a seeded demo lives in memory only

  /* ---------- seed: a trip that is already planned ---------- */
  function seed() {
    const today = key(new Date());
    const s = addDays(today, 12), d = (n) => addDays(s, n);
    const t = { id: uid(), name: 'Spain & Mediterranean Cruise', destination: 'Spain', route: ['Vancouver', 'Madrid', 'Barcelona', 'Mediterranean'], start_date: s, end_date: d(13),
      description: 'Two weeks: Madrid first, then Barcelona and a week at sea. Bring the good walking shoes.', cover_emoji: '🚢', cover_color: '#A8CDEA', cover_blob: null, viewers_chat: true, created_at: now(), updated_at: now() };
    const mk = (name, avatar, color, role) => ({ id: uid(), trip_id: t.id, name, avatar, color, role, token: tok(), joined_at: now(), last_seen_at: now() });
    const maya = mk('Maya', '🦊', PALETTE[0], 'owner'), bern = mk('Leah', '🦄', PALETTE[1], 'editor'), marco = mk('Marco', '🐙', PALETTE[2], 'viewer');
    maya.token = 'demo-maya-0000000000000000';
    const it = (type, title, o) => Object.assign({ id: uid(), trip_id: t.id, type, title, start_date: null, start_time: null, end_date: null, end_time: null, location: '', confirmation: '', notes: '', data: {}, version: 1, created_by: maya.id, updated_by: maya.id, created_at: now(), updated_at: now() }, o);
    const items = [
      it('flight', 'Vancouver (YVR) → Madrid (MAD)', { start_date: s, start_time: '16:40', end_date: d(1), end_time: '11:05', confirmation: 'KX7P2Q', data: { airline: 'Air Canada', flightNo: 'AC836', from: 'Vancouver (YVR)', to: 'Madrid (MAD)', terminal: '3', seat: '24A, 24B' } }),
      it('hotel', 'Hotel Gran Vía Madrid', { start_date: d(1), start_time: '15:00', end_date: d(4), end_time: '11:00', location: 'Gran Vía 41, Madrid', confirmation: 'HM-778821', data: { room: 'Double, city view' } }),
      it('restaurant', 'Casa Lucio', { start_date: d(2), start_time: '20:30', location: 'Calle Cava Baja 35, Madrid', confirmation: 'CL-4410', data: { people: 3 }, notes: 'Famous for the huevos rotos. Ask for a table downstairs.' }),
      it('activity', 'Prado Museum guided tour', { start_date: d(3), start_time: '10:00', end_time: '12:30', location: 'Museo del Prado', data: { cost: 45, currency: 'EUR' }, created_by: bern.id, updated_by: bern.id }),
      it('car', 'Hertz, Madrid to Barcelona', { start_date: d(4), start_time: '11:30', end_date: d(5), end_time: '18:00', location: 'Atocha Station, Madrid', confirmation: 'HZ-90311', data: { company: 'Hertz', vehicle: 'Fiat 500', dropoffLocation: 'Barcelona Sants' } }),
      it('cruise', 'Harmony of the Seas', { start_date: d(6), start_time: '16:00', end_date: d(13), end_time: '08:00', location: 'Port of Barcelona', confirmation: 'RC-554120', data: { cruiseLine: 'Royal Caribbean', ship: 'Harmony of the Seas', cabin: '9312', disembarkLocation: 'Barcelona' } }),
      it('place', 'Sagrada Família', { location: 'Carrer de Mallorca 401, Barcelona', data: { website: 'https://sagradafamilia.org' }, notes: 'Book tower tickets ahead.', created_by: bern.id, updated_by: bern.id }),
      it('note', 'Packing reminder', { notes: 'Power adapters (type C/F), sunscreen, printed cruise documents.' })
    ];
    db = { trips: { [t.id]: t }, members: { [maya.id]: maya, [bern.id]: bern, [marco.id]: marco }, items: Object.fromEntries(items.map((x) => [x.id, x])), messages: [], invites: {}, reads: {}, blobs: {}, expenses: {}, packing: {}, seq: 0 };
    const ex = (title, amount, cur, payer, split, on, extra) => { const e = Object.assign({ id: uid(), trip_id: t.id, title, amount, currency: cur, paid_by: payer.id, split: split.map((x) => x.id), spent_on: on, item_id: null, note: '', created_by: payer.id, created_at: now() }, extra || {}); db.expenses[e.id] = e; };
    ex('Hotel Gran Vía deposit', 240, 'EUR', maya, [maya, bern, marco], d(1), { item_id: items[1].id });
    ex('Casa Lucio dinner', 118.5, 'EUR', bern, [maya, bern, marco], d(2), { item_id: items[2].id });
    ex('Prado Museum tour', 90, 'EUR', bern, [maya, bern], d(3), { item_id: items[3].id });
    ex('Airport taxi', 42, 'EUR', marco, [maya, bern, marco], d(1));
    const pk = (title, category, who, done) => { const x = { id: uid(), trip_id: t.id, title, category, assigned_to: who ? who.id : null, done: !!done, done_by: done ? (who || maya).id : null, created_by: maya.id, created_at: now() }; db.packing[x.id] = x; };
    pk('Passports', 'Documents', maya, true); pk('Cruise boarding passes (printed)', 'Documents', bern, false); pk('Travel insurance papers', 'Documents', null, false);
    pk('Walking shoes', 'Clothes', null, true); pk('Light rain jacket', 'Clothes', marco, false); pk('Swimsuits', 'Clothes', null, false);
    pk('Power adapters (type C/F)', 'Tech', maya, false); pk('Phone chargers', 'Tech', null, true); pk('Sunscreen', 'Toiletries', bern, false); pk('Motion sickness tablets', 'Health', null, false);
    const msg = (sender, body, kind, extra) => { db.seq++; db.messages.push(Object.assign({ id: String(db.seq), trip_id: t.id, sender_id: sender.id, to_member: null, kind: kind || 'text', body: body || '', mentions: [], blob: null, item_id: null, meta: {}, created_at: now() }, extra || {})); };
    msg(bern, 'joined', 'activity', { meta: { event: 'joined' } });
    msg(maya, '', 'activity', { item_id: items[1].id, meta: { event: 'added', type: 'hotel', title: items[1].title, date: items[1].start_date } });
    msg(bern, 'I found a guided Prado tour on day 4, added it. Okay with everyone?');
    msg(marco, 'Looks great 👍 can I just follow along on the plan?');
    msg(maya, 'Yes! Everything is in the Itinerary tab. @Leah can you look at dinner on the 2nd?', 'text', { mentions: [bern.id] });
    // this device already has Maya's link, like a real returning visitor
    try { localStorage.setItem('tr.trips', JSON.stringify([{ tripId: t.id, token: maya.token, added: Date.now() }])); localStorage.setItem('tr.profile', JSON.stringify({ name: 'Maya', avatar: '🦊' })); } catch (e) { /* ignore */ }
    save();
  }
  // A page can bring its own story: window.TRIPLY_DEMO = { seed(helpers) -> { db, token, tripId }, bot, banner }.
  // (The live site's /triply/demo uses tools/demo-europe.js. It keeps everything in memory, so it resets on reload.)
  const DEMO = window.TRIPLY_DEMO || null;
  if (DEMO && DEMO.seed) {
    const r = DEMO.seed({ uid, tok, key, addDays, now, PALETTE });
    db = r.db; if (!db.seq) db.seq = 0;
    try { localStorage.setItem('tr.trips', JSON.stringify([{ tripId: r.tripId, token: r.token, added: Date.now() }])); } catch (e) { /* ignore */ }
    if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/trip/' + r.tripId + '/overview';
  } else {
    try { const raw = store.get(); db = raw ? JSON.parse(raw) : null; } catch (e) { db = null; }
    if (db && (!db.expenses || !db.packing)) db = null; // an older demo copy: start over so the new sections have sample data
    if (!db) seed();
  }
  seq = () => ++db.seq;

  /* ---------- shapes ---------- */
  const tripOut = (t) => Object.assign({}, t);
  const memberOut = (m, self) => ({ id: m.id, name: m.name, avatar: m.avatar, color: m.color, role: m.role, joined_at: m.joined_at, last_seen_at: m.last_seen_at, you: m.id === self });
  const expOut = (e) => { const o = Object.assign({}, e); delete o.trip_id; return o; };
  const itemOut = (i) => { const o = Object.assign({}, i); delete o.trip_id; return o; };
  const members = (tid) => Object.values(db.members).filter((m) => m.trip_id === tid);
  const can = (m, p) => ROLE_PERMS[m.role].includes(p) && (p !== 'chat.write' || m.role !== 'viewer' || db.trips[m.trip_id].viewers_chat);
  const permsOf = (m) => Object.fromEntries(ROLE_PERMS.owner.map((p) => [p, can(m, p)]));
  const unread = (tid, mid) => {
    const r = (db.reads[mid] = db.reads[mid] || {});
    const out = { trip: 0, mentions: 0, dm: {} };
    db.messages.filter((m) => m.trip_id === tid && m.kind === 'text' && m.sender_id !== mid).forEach((m) => {
      if (!m.to_member) { if (Number(m.id) > Number(r.trip || 0)) { out.trip++; if (m.mentions.includes(mid)) out.mentions++; } }
      else if (m.to_member === mid && Number(m.id) > Number(r[m.sender_id] || 0)) out.dm[m.sender_id] = (out.dm[m.sender_id] || 0) + 1;
    });
    return out;
  };

  /* ---------- live stream ---------- */
  const streams = [];
  const enc = new TextEncoder();
  function emit(tid, payload, to) {
    streams.forEach((s) => { if (s.tid === tid && (!to || to.includes(s.mid))) { try { s.c.enqueue(enc.encode('event: change\ndata: ' + JSON.stringify(payload) + '\n\n')); } catch (e) { /* closed */ } } });
  }
  function openStream(tid, mid, signal) {
    let ctl;
    const body = new ReadableStream({ start(c) { ctl = c; c.enqueue(enc.encode('event: hello\ndata: {}\n\n')); } });
    const s = { tid, mid, get c() { return ctl; } };
    streams.push(s);
    signal && signal.addEventListener('abort', () => { const i = streams.indexOf(s); if (i > -1) streams.splice(i, 1); });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  /* ---------- helpers ---------- */
  class Err extends Error { constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; } }
  const bad = (m) => new Err(400, 'invalid', m);
  const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  function auth(token, tid) {
    const m = Object.values(db.members).find((x) => x.token && x.token === token);
    if (!m) throw new Err(401, 'unauthorized', 'This link does not work. Ask the trip owner for a new invitation.');
    if (tid && m.trip_id !== tid) throw new Err(404, 'not_found', 'That trip could not be found.');
    return m;
  }
  function need(m, perm, msg) { if (!can(m, perm)) throw new Err(403, 'forbidden', msg || 'You are not allowed to do that.'); }
  function activity(tid, sender, ev, item) {
    const meta = { event: ev };
    if (item) { meta.type = item.type; meta.title = item.title; if (item.start_date) meta.date = item.start_date; if (item.start_time) meta.time = item.start_time; }
    const m = { id: String(seq()), trip_id: tid, sender_id: sender, to_member: null, kind: 'activity', body: '', mentions: [], blob: null, item_id: ev === 'removed' || !item ? null : item.id, meta, created_at: now() };
    db.messages.push(m); emit(tid, { kind: 'chat', thread: 'trip', message: m });
  }
  function cleanTrip(b, base) {
    const g = (k, d) => (b[k] !== undefined ? b[k] : base ? base[k] : d);
    const name = txt(g('name', ''), 80); if (!name) throw bad('Please give the trip a name.');
    let route = g('route', []); if (typeof route === 'string') route = route.split(/→|->|,/);
    route = (route || []).map((x) => txt(x, 60)).filter(Boolean).slice(0, 12);
    const sd = g('start_date', null) || null, ed = g('end_date', null) || null;
    if (sd && !isDate(sd)) throw bad('That start date does not look right.');
    if (ed && !isDate(ed)) throw bad('That end date does not look right.');
    if (sd && ed && ed < sd) throw bad('The trip cannot end before it starts.');
    const bud = g('budget', null), budget = bud === null || bud === '' || !(Number(bud) > 0) ? null : Math.min(1e9, Math.round(Number(bud) * 100) / 100);
    return { name, destination: txt(g('destination', ''), 120), route, start_date: sd, end_date: ed, description: txt(g('description', ''), 600), cover_emoji: txt(g('cover_emoji', '✈️'), 8) || '✈️', cover_color: g('cover_color', '#F6C28E'), viewers_chat: g('viewers_chat', true) !== false,
      budget, budget_currency: budget ? (txt(g('budget_currency', 'CAD'), 3).toUpperCase().replace(/[^A-Z]/g, '') || 'CAD') : '' };
  }
  function cleanItem(b, base) {
    const type = base ? base.type : b.type;
    if (!FIELDS[type]) throw bad('Pick what kind of plan this is.');
    const pick = (k, d) => (b[k] !== undefined ? b[k] : base ? base[k] : d);
    const raw = Object.assign({}, base ? base.data : {}, b.data || {}), data = {};
    FIELDS[type].forEach((k) => { let v = raw[k]; if (k === 'cost') v = v === '' || v == null || isNaN(Number(v)) ? '' : Math.round(Number(v) * 100) / 100; else if (k === 'people') { v = parseInt(v, 10); if (!(v >= 1)) v = ''; } else v = txt(v, 160); if (v !== '' && v != null) data[k] = v; });
    let title = txt(pick('title', ''), 120);
    if (!title) title = type === 'flight' ? [data.from, data.to].filter(Boolean).join(' → ') || [data.airline, data.flightNo].filter(Boolean).join(' ') : type === 'car' ? data.company : type === 'cruise' ? data.ship || data.cruiseLine : type === 'note' ? 'Note' : '';
    if (!title) throw bad('Please add a name for this ' + LABEL[type] + '.');
    const c = (v) => (v === '' || v == null ? null : v);
    const sd = c(pick('start_date', null)), st = c(pick('start_time', null)); let ed = c(pick('end_date', null)); const et = c(pick('end_time', null));
    [sd, ed].forEach((v) => { if (v && !isDate(v)) throw bad('That date does not look right.'); }); [st, et].forEach((v) => { if (v && !isTime(v)) throw bad('That time does not look right.'); });
    if (NEEDS_START[type] && !sd) throw bad('Please pick a day for this ' + LABEL[type] + '.');
    if (!sd && (st || ed || et)) throw bad('Pick a day first, or clear the times.');
    if (et && !ed) ed = sd;
    if (ed && ed < sd) throw bad('The end day cannot be before the start day.');
    return { type, title, start_date: sd, start_time: sd ? st : null, end_date: ed, end_time: ed ? et : null, location: txt(pick('location', ''), 200), confirmation: txt(pick('confirmation', ''), 60), notes: txt(pick('notes', ''), 4000), data };
  }
  const link = (p) => (window.TRIPLY.publicUrl || '') + p;

  /* ---------- the bot: makes the demo chat feel alive ---------- */
  const REPLIES = ['Sounds good to me!', 'Ooh nice, adding that to my list too.', 'Can we do that after the museum?', 'Love it 😍', 'I will check the opening hours and report back.', 'Perfect, thank you!'];
  function botReply(tid, thread, meId) {
    const bern = members(tid).find((m) => m.name === ((window.TRIPLY_DEMO && window.TRIPLY_DEMO.bot) || 'Leah')); if (!bern || bern.id === meId) return;
    setTimeout(() => {
      const m = { id: String(seq()), trip_id: tid, sender_id: bern.id, to_member: thread === 'trip' ? null : meId, kind: 'text', body: REPLIES[Math.floor(Math.random() * REPLIES.length)], mentions: [], blob: null, item_id: null, meta: {}, created_at: now() };
      db.messages.push(m); save();
      emit(tid, { kind: 'chat', thread: thread === 'trip' ? 'trip' : 'dm', message: m }, thread === 'trip' ? null : [meId, bern.id]);
    }, 2200);
  }

  /* ---------- routes ---------- */
  const routes = [];
  const R = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

  R('POST', '/trips', (c) => {
    const t = Object.assign({ id: uid(), cover_blob: null, created_at: now(), updated_at: now() }, cleanTrip(c.body, null));
    const o = c.body.owner || {}; const name = txt(o.name, 40); if (!name) throw bad('Please add your name.');
    const m = { id: uid(), trip_id: t.id, name, avatar: txt(o.avatar, 8), color: PALETTE[0], role: 'owner', token: tok(), joined_at: now(), last_seen_at: now() };
    db.trips[t.id] = t; db.members[m.id] = m;
    return { trip: tripOut(t), member: memberOut(m, m.id), token: m.token, link: link('/#/t/' + m.token) };
  });
  R('POST', '/my-trips', (c) => {
    const trips = [], gone = [];
    (c.body.tokens || []).forEach((tk, i) => {
      const m = Object.values(db.members).find((x) => x.token === tk);
      if (!m) return gone.push(i);
      const t = db.trips[m.trip_id], u = unread(t.id, m.id), mem = members(t.id);
      trips.push(Object.assign(tripOut(t), { i, role: m.role, member_id: m.id, travelers: mem.length, owner_name: (mem.find((x) => x.role === 'owner') || {}).name || '', unread: u.trip + Object.values(u.dm).reduce((a, b) => a + b, 0) }));
    });
    return { trips, gone };
  });
  R('GET', '/me', (c) => { const m = auth(c.token); return { member: memberOut(m, m.id), trip: tripOut(db.trips[m.trip_id]) }; });
  R('GET', '/trips/:id/state', (c) => {
    const m = auth(c.token, c.p.id), t = db.trips[m.trip_id];
    const items = Object.values(db.items).filter((i) => i.trip_id === t.id).sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999') || (a.start_time || '').localeCompare(b.start_time || ''));
    return { trip: tripOut(t), me: memberOut(m, m.id), perms: permsOf(m), members: members(t.id).map((x) => memberOut(x, m.id)), items: items.map(itemOut),
      invites: can(m, 'invites.manage') ? Object.values(db.invites).filter((v) => v.trip_id === t.id).map((v) => ({ id: v.id, role: v.role, label: v.label, created_by: v.created_by, created_at: v.created_at, expires_at: v.expires_at })) : [],
      expenses: Object.values(db.expenses).filter((x) => x.trip_id === t.id).sort((a, b) => (b.spent_on || '').localeCompare(a.spent_on || '') || b.created_at.localeCompare(a.created_at)).map(expOut),
      packing: Object.values(db.packing).filter((x) => x.trip_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((x) => Object.assign({}, x, { trip_id: undefined })),
      unread: unread(t.id, m.id), roles: ROLES };
  });
  R('PATCH', '/trips/:id', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'trip.edit', 'Only an owner can change the trip details.');
    const t = db.trips[c.p.id]; Object.assign(t, cleanTrip(c.body, t), { updated_at: now() });
    if (c.body.cover_blob !== undefined) { const b = c.body.cover_blob && db.blobs[c.body.cover_blob]; if (c.body.cover_blob && (!b || b.trip_id !== t.id)) throw bad('That photo could not be found.'); if (t.cover_blob && t.cover_blob !== c.body.cover_blob) delete db.blobs[t.cover_blob]; t.cover_blob = c.body.cover_blob || null; }
    emit(t.id, { kind: 'trip' }); return { trip: tripOut(t) };
  });
  R('DELETE', '/trips/:id', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'trip.delete', 'Only an owner can delete the trip.');
    const id = c.p.id; delete db.trips[id];
    Object.keys(db.members).forEach((k) => { if (db.members[k].trip_id === id) delete db.members[k]; });
    Object.keys(db.items).forEach((k) => { if (db.items[k].trip_id === id) delete db.items[k]; });
    Object.keys(db.expenses).forEach((k) => { if (db.expenses[k].trip_id === id) delete db.expenses[k]; }); Object.keys(db.packing).forEach((k) => { if (db.packing[k].trip_id === id) delete db.packing[k]; }); Object.keys(db.blobs).forEach((k) => { if (db.blobs[k].trip_id === id) delete db.blobs[k]; });
    db.messages = db.messages.filter((x) => x.trip_id !== id); emit(id, { kind: 'trip_deleted' }); return {};
  });
  R('PATCH', '/trips/:id/members/me', (c) => {
    const m = auth(c.token, c.p.id);
    if (c.body.name !== undefined) { const n = txt(c.body.name, 40); if (!n) throw bad('Please add your name.'); m.name = n; }
    if (c.body.avatar !== undefined) m.avatar = txt(c.body.avatar, 8);
    emit(m.trip_id, { kind: 'members' }); return { member: memberOut(m, m.id) };
  });
  R('PATCH', '/trips/:id/members/:mid', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'members.manage', 'Only an owner can change roles.');
    const t = db.members[c.p.mid]; if (!t || t.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That person is not on this trip.');
    if (!ROLE_PERMS[c.body.role]) throw bad('Pick a role.');
    if (t.role === 'owner' && c.body.role !== 'owner' && members(m.trip_id).filter((x) => x.role === 'owner').length < 2) throw new Err(409, 'last_owner', 'A trip needs at least one owner.');
    t.role = c.body.role; emit(m.trip_id, { kind: 'members' }); return { member: memberOut(t, m.id) };
  });
  R('DELETE', '/trips/:id/members/:mid', (c) => {
    const m = auth(c.token, c.p.id), target = c.p.mid === 'me' ? m : db.members[c.p.mid];
    if (!target || target.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That person is not on this trip.');
    if (target.id !== m.id) need(m, 'members.manage', 'Only an owner can remove people.');
    if (target.role === 'owner' && members(m.trip_id).filter((x) => x.role === 'owner').length < 2) throw new Err(409, 'last_owner', 'You are the only owner.');
    db.messages = db.messages.filter((x) => !(x.to_member && (x.sender_id === target.id || x.to_member === target.id)));
    delete db.members[target.id]; emit(m.trip_id, { kind: target.id === m.id ? 'members' : 'kicked' }, target.id === m.id ? null : [target.id]); emit(m.trip_id, { kind: 'members' });
    return { removed: target.id };
  });
  R('POST', '/trips/:id/invites', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'invites.manage', 'Only an owner can invite people.');
    const code = tok().slice(0, 16), role = ROLE_PERMS[c.body.role] ? c.body.role : 'editor';
    const v = { id: uid(), trip_id: m.trip_id, code, role, label: txt(c.body.label, 60), created_by: m.id, created_at: now(), expires_at: new Date(Date.now() + 14 * 864e5).toISOString() };
    db.invites[v.id] = v; emit(m.trip_id, { kind: 'invites' });
    return { invite: { id: v.id, role, label: v.label, created_by: m.id, created_at: v.created_at, expires_at: v.expires_at }, code, link: link('/#/join/' + code) };
  });
  R('DELETE', '/trips/:id/invites/:iid', (c) => { const m = auth(c.token, c.p.id); need(m, 'invites.manage'); delete db.invites[c.p.iid]; emit(m.trip_id, { kind: 'invites' }); return {}; });
  const findInvite = (code) => { const v = Object.values(db.invites).find((x) => x.code === code); if (!v) throw new Err(404, 'invite_invalid', 'This invitation link is not valid.'); if (new Date(v.expires_at) < new Date()) throw new Err(410, 'invite_expired', 'This invitation has expired. Ask for a new one.'); return v; };
  R('GET', '/invites/peek/:code', (c) => {
    const v = findInvite(c.p.code), t = db.trips[v.trip_id], by = db.members[v.created_by];
    return { trip: tripOut(t), role: v.role, label: v.label, inviter: by ? by.name : null, role_label: v.role[0].toUpperCase() + v.role.slice(1) };
  });
  R('POST', '/join', (c) => {
    const v = findInvite(c.body.code), name = txt(c.body.name, 40); if (!name) throw bad('Please add your name.');
    const used = new Set(members(v.trip_id).map((x) => x.color));
    const m = { id: uid(), trip_id: v.trip_id, name, avatar: txt(c.body.avatar, 8), color: PALETTE.find((x) => !used.has(x)) || PALETTE[0], role: v.role, token: tok(), joined_at: now(), last_seen_at: now() };
    db.members[m.id] = m; delete db.invites[v.id];
    emit(v.trip_id, { kind: 'members' }); emit(v.trip_id, { kind: 'invites' }); activity(v.trip_id, m.id, 'joined');
    return { tripId: v.trip_id, member: memberOut(m, m.id), token: m.token, link: link('/#/t/' + m.token) };
  });
  R('POST', '/trips/:id/items', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the plans but not change them.');
    const i = Object.assign({ id: uid(), trip_id: m.trip_id, version: 1, created_by: m.id, updated_by: m.id, created_at: now(), updated_at: now() }, cleanItem(c.body, null));
    db.items[i.id] = i; emit(m.trip_id, { kind: 'items' }); activity(m.trip_id, m.id, 'added', i); return { item: itemOut(i) };
  });
  R('PATCH', '/trips/:id/items/:iid', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the plans but not change them.');
    const cur = db.items[c.p.iid]; if (!cur || cur.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That plan was removed.');
    if (parseInt(c.body.version, 10) !== cur.version) throw new Err(409, 'version_conflict', 'Someone else just changed this plan.', { item: itemOut(cur) });
    Object.assign(cur, cleanItem(c.body, cur), { version: cur.version + 1, updated_by: m.id, updated_at: now() });
    emit(m.trip_id, { kind: 'items' }); activity(m.trip_id, m.id, 'updated', cur); return { item: itemOut(cur) };
  });
  R('DELETE', '/trips/:id/items/:iid', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the plans but not change them.');
    const cur = db.items[c.p.iid]; if (!cur || cur.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That plan was removed.');
    delete db.items[cur.id]; db.messages.forEach((x) => { if (x.item_id === cur.id) x.item_id = null; });
    emit(m.trip_id, { kind: 'items' }); activity(m.trip_id, m.id, 'removed', cur); return {};
  });
  R('GET', '/trips/:id/messages', (c) => {
    const m = auth(c.token, c.p.id), th = c.q.get('thread') || 'trip', limit = Math.min(100, parseInt(c.q.get('limit'), 10) || 50), before = c.q.get('before');
    let list = db.messages.filter((x) => x.trip_id === m.trip_id && (th === 'trip' ? !x.to_member : x.to_member && ((x.sender_id === m.id && x.to_member === th) || (x.sender_id === th && x.to_member === m.id))));
    if (before) list = list.filter((x) => Number(x.id) < Number(before));
    const more = list.length > limit; list = list.slice(-limit);
    return { messages: list.map((x) => Object.assign({}, x, { trip_id: undefined })), more };
  });
  R('POST', '/trips/:id/messages', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'chat.write', 'The trip owner has turned chat off for viewers.');
    const th = c.body.thread || 'trip', body = txt(c.body.body, 2000);
    let blob = null;
    if (c.body.blobId) { const b = db.blobs[c.body.blobId]; if (!b || b.trip_id !== m.trip_id || b.created_by !== m.id) throw bad('That attachment could not be found.'); blob = { id: b.id, mime: b.mime, name: b.name, size: b.size }; }
    if (!body && !blob) throw bad('Type a message first.');
    if (th !== 'trip' && (!db.members[th] || th === m.id)) throw new Err(404, 'not_found', 'That person is not on this trip.');
    const mentions = th === 'trip' ? members(m.trip_id).filter((x) => x.id !== m.id && new RegExp('@' + x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'u').test(body)).map((x) => x.id) : [];
    const msg = { id: String(seq()), trip_id: m.trip_id, sender_id: m.id, to_member: th === 'trip' ? null : th, kind: 'text', body, mentions, blob, item_id: null, meta: {}, created_at: now() };
    db.messages.push(msg);
    const out = Object.assign({}, msg, { trip_id: undefined });
    emit(m.trip_id, { kind: 'chat', thread: th === 'trip' ? 'trip' : 'dm', message: out }, th === 'trip' ? null : [m.id, th]);
    (db.reads[m.id] = db.reads[m.id] || {})[th] = msg.id;
    if (th === 'trip' || (db.members[th] && db.members[th].name === ((window.TRIPLY_DEMO && window.TRIPLY_DEMO.bot) || 'Leah'))) botReply(m.trip_id, th === 'trip' ? 'trip' : 'dm', m.id);
    return { message: out };
  });
  R('POST', '/trips/:id/reads', (c) => { const m = auth(c.token, c.p.id); const r = (db.reads[m.id] = db.reads[m.id] || {}); const k = c.body.thread; r[k] = String(Math.max(Number(r[k] || 0), Number(c.body.lastId) || 0)); return {}; });
  R('POST', '/trips/:id/blobs', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'files.write', 'You cannot add files to this trip.');
    const f = c.blob; if (!f || !f.size) throw bad('That file is empty.');
    if (f.size > MAX_FILE) throw bad('Files are limited to 900 KB in the demo (the real app allows 8 MB).');
    const b = { id: uid(), trip_id: m.trip_id, mime: c.mime, name: txt(c.name, 120), size: f.size, created_by: m.id, created_at: now(), url: c.dataUrl };
    db.blobs[b.id] = b; return { blob: { id: b.id, mime: b.mime, name: b.name, size: b.size } };
  });
  R('GET', '/trips/:id/files', (c) => {
    const m = auth(c.token, c.p.id), t = db.trips[m.trip_id];
    return { files: Object.values(db.blobs).filter((b) => b.trip_id === t.id && b.id !== t.cover_blob).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((b) => ({ id: b.id, mime: b.mime, name: b.name, size: b.size, created_by: b.created_by, created_at: b.created_at })) };
  });
  R('DELETE', '/trips/:id/files/:fid', (c) => {
    const m = auth(c.token, c.p.id), f = db.blobs[c.p.fid];
    if (!f || f.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That file could not be found.');
    if (f.created_by !== m.id) need(m, 'trip.edit', 'Only the person who added a file, or an owner, can remove it.');
    db.messages = db.messages.filter((x) => !(x.blob && x.blob.id === f.id && !x.body)); db.messages.forEach((x) => { if (x.blob && x.blob.id === f.id) x.blob = null; });
    delete db.blobs[f.id]; return {};
  });
  const cleanExp = (b, tid, base) => {
    const g = (k, d) => (b[k] !== undefined ? b[k] : base ? base[k] : d);
    const title = txt(g('title', ''), 120); if (!title) throw bad('Please say what the cost was for.');
    const amount = Math.round(Number(g('amount', NaN)) * 100) / 100; if (!(amount > 0) || amount > 1e7) throw bad('Enter an amount above zero.');
    const ids = members(tid).map((x) => x.id);
    if (!ids.includes(g('paid_by', null))) throw bad('Pick who paid.');
    const split = [...new Set((g('split', []) || []).filter((x) => ids.includes(x)))]; if (!split.length) throw bad('Pick at least one person to share the cost.');
    const on = g('spent_on', null) || null; if (on && !isDate(on)) throw bad('That date does not look right.');
    const it = g('item_id', null); return { title, amount, currency: txt(g('currency', 'CAD'), 3).toUpperCase().replace(/[^A-Z]/g, '') || 'CAD', paid_by: g('paid_by', null), split, spent_on: on, item_id: it && db.items[it] && db.items[it].trip_id === tid ? it : null, note: txt(g('note', ''), 500) };
  };
  R('POST', '/trips/:id/expenses', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the costs but not change them.');
    const e = Object.assign({ id: uid(), trip_id: m.trip_id, created_by: m.id, created_at: now() }, cleanExp(c.body, m.trip_id, null));
    db.expenses[e.id] = e; emit(m.trip_id, { kind: 'expenses' }); return { expense: expOut(e) };
  });
  R('PATCH', '/trips/:id/expenses/:eid', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the costs but not change them.');
    const cur = db.expenses[c.p.eid]; if (!cur || cur.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That cost was removed.');
    Object.assign(cur, cleanExp(c.body, m.trip_id, cur)); emit(m.trip_id, { kind: 'expenses' }); return { expense: expOut(cur) };
  });
  R('DELETE', '/trips/:id/expenses/:eid', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the costs but not change them.');
    if (!db.expenses[c.p.eid] || db.expenses[c.p.eid].trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That cost was removed.');
    delete db.expenses[c.p.eid]; emit(m.trip_id, { kind: 'expenses' }); return {};
  });

  /* ---------- packing and search ---------- */
  const CATS = ['Documents', 'Clothes', 'Toiletries', 'Tech', 'Health', 'Other'];
  const packOut = (x) => Object.assign({}, x, { trip_id: undefined });
  const packWho = (tid, id) => { if (!id) return null; if (!db.members[id] || db.members[id].trip_id !== tid) throw bad('Pick someone who is on this trip.'); return id; };
  R('POST', '/trips/:id/packing', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the packing list but not add to it.');
    const title = txt(c.body.title, 100); if (!title) throw bad('Type what to pack.');
    if (Object.values(db.packing).filter((x) => x.trip_id === m.trip_id).length >= 300) throw bad('The packing list can hold up to 300 things.');
    const x = { id: uid(), trip_id: m.trip_id, title, category: CATS.includes(c.body.category) ? c.body.category : '', assigned_to: packWho(m.trip_id, c.body.assigned_to), done: false, done_by: null, created_by: m.id, created_at: now() };
    db.packing[x.id] = x; emit(m.trip_id, { kind: 'packing' }); return { item: packOut(x) };
  });
  R('PATCH', '/trips/:id/packing/:pid', (c) => {
    const m = auth(c.token, c.p.id), x = db.packing[c.p.pid];
    if (!x || x.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That item was removed.');
    const b = c.body;
    if (['title', 'category', 'assigned_to'].some((k) => b[k] !== undefined)) need(m, 'items.write', 'Viewers can look at the packing list but not change it.');
    if (b.done !== undefined) need(m, 'chat.write', 'You cannot tick things off on this trip.');
    if (b.title !== undefined) { const t = txt(b.title, 100); if (!t) throw bad('Type what to pack.'); x.title = t; }
    if (b.category !== undefined) x.category = CATS.includes(b.category) ? b.category : '';
    if (b.assigned_to !== undefined) x.assigned_to = packWho(m.trip_id, b.assigned_to);
    if (b.done !== undefined) { x.done = !!b.done; x.done_by = x.done ? m.id : null; }
    emit(m.trip_id, { kind: 'packing' }); return { item: packOut(x) };
  });
  R('DELETE', '/trips/:id/packing/:pid', (c) => {
    const m = auth(c.token, c.p.id); need(m, 'items.write', 'Viewers can look at the packing list but not change it.');
    const x = db.packing[c.p.pid]; if (!x || x.trip_id !== m.trip_id) throw new Err(404, 'not_found', 'That item was removed.');
    delete db.packing[x.id]; emit(m.trip_id, { kind: 'packing' }); return {};
  });
  R('GET', '/trips/:id/search', (c) => {
    const m = auth(c.token, c.p.id), q = txt(c.q.get('q'), 60).toLowerCase();
    if (q.length < 2) return { messages: [] };
    const hits = db.messages.filter((x) => x.trip_id === m.trip_id && x.kind === 'text' && x.body.toLowerCase().includes(q) && (!x.to_member || x.to_member === m.id || x.sender_id === m.id));
    return { messages: hits.slice(-20).reverse().map((x) => Object.assign({}, x, { trip_id: undefined })) };
  });

  /* ---------- fetch takeover ---------- */
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href), i = url.pathname.indexOf('/api/');
    if (i === -1) return realFetch(input, init);
    const path = url.pathname.slice(i + 4), o = init || {}, method = (o.method || 'GET').toUpperCase();
    const h = o.headers || {}, a = h.Authorization || h.authorization || '', token = a.replace(/^Bearer /, '');
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    return new Promise((resolve) => {
      const readBlob = (o.body && typeof o.body !== 'string' && o.body.size !== undefined)
        ? new Promise((done) => { const fr = new FileReader(); fr.onload = () => done(fr.result); fr.onerror = () => done(''); fr.readAsDataURL(o.body); })
        : Promise.resolve(null);
      readBlob.then((dataUrl) => setTimeout(() => {
        try {
          const sm = /^\/trips\/([^/]+)\/stream$/.exec(path);
          if (sm) { const m = auth(token, sm[1]); return resolve(openStream(sm[1], m.id, o.signal)); }
          for (const r of routes) {
            if (r.method !== method) continue;
            const mm = r.re.exec(path); if (!mm) continue;
            let body = {}; if (o.body && typeof o.body === 'string') { try { body = JSON.parse(o.body); } catch (e) { /* none */ } }
            let name = ''; try { name = decodeURIComponent(h['X-Filename'] || ''); } catch (e) { /* none */ }
            const out = r.fn({ p: mm.groups || {}, body, token, q: url.searchParams, blob: dataUrl ? o.body : null, dataUrl, mime: h['Content-Type'] || (o.body && o.body.type) || '', name });
            save(); return resolve(json(200, out));
          }
          resolve(json(404, { error: { code: 'not_found', message: 'That does not exist.' } }));
        } catch (e) {
          if (e instanceof Err) resolve(json(e.status, { error: Object.assign({ code: e.code, message: e.message }, e.extra || {}) }));
          else { console.error(e); resolve(json(500, { error: { code: 'error', message: 'Demo error: ' + e.message } })); }
        }
      }, 40));
    });
  };

  // Small banner so nobody mistakes this for the real thing, plus a reset.
  window.addEventListener('DOMContentLoaded', () => {
    window.TR.blobUrl = (id) => (db.blobs[id] && db.blobs[id].url) || '';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:28px;background:#26302B;color:#fff;font:600 .78rem Figtree,system-ui,sans-serif;display:flex;gap:10px;align-items:center;justify-content:center';
    const B = (window.TRIPLY_DEMO && window.TRIPLY_DEMO.banner) || null;
    const t = document.createElement('span'); t.textContent = B ? B.text : 'Demo with sample data, saved only in this browser';
    const b = document.createElement(B ? 'a' : 'button'); b.textContent = B ? B.link : 'Reset'; if (B) { b.href = B.href; b.style.textDecoration = 'none'; } b.style.cssText = 'border:0;border-radius:999px;background:#F8E7E0;color:#B8583A;font:700 .72rem Figtree,system-ui,sans-serif;padding:1px 10px;cursor:pointer';
    if (!B) b.onclick = () => { try { localStorage.clear(); } catch (e) { /* ignore */ } memory[KEY] = null; location.hash = '#/'; location.reload(); };
    const st = document.createElement('style'); st.textContent = '.chat-wrap{height:calc(100dvh - 12px - 62px - 28px - env(safe-area-inset-bottom)) !important}@media (min-width:900px){.chat-wrap{height:calc(100vh - 36px - 28px) !important}}'; document.head.append(st);
    bar.append(t, b); document.body.prepend(bar);
  });
})();
