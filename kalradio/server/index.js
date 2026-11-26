/*
 * KalRadio — server part, for Kalendaryo.  Version 2: Approved Stations Only.
 *
 * Only stations the site owner has approved play inside Kalendaryo. Every other station from the
 * Radio Browser directory is shown with a link to its own website. A station owner can remove a
 * station at once (a reason is required); the site owner gets a phone alert and can restore it.
 *
 * Public:
 *   GET  /radio                    the KalRadio page (public/radio.html, made by kalradio/build.js)
 *   POST /api/radio/status         status of up to 80 stations for this visitor (may it play here?)
 *   POST /api/radio/play           counts one play of an approved station (per station per day, never per person)
 *   POST /api/radio/remove         "Station owner? Remove this station" (reason required, 3 per visitor per day)
 *   POST /api/radio/requests       "Broadcaster? Ask to be added"
 * A home (Kalendaryo link):
 *   GET  /api/radio/favs           the home's "Our stations"
 *   POST /api/radio/favs/add       add an APPROVED station (V3: any station not removed) (Editors and Owners)
 *   POST /api/radio/favs/remove    remove a station (Editors and Owners)
 * Site owner (X-Owner-Key, the same key as the owner view):
 *   GET  /api/owner/radio          the KalRadio section of the owner view
 *   GET  /api/owner/radio/station  one station's review record and history
 *   POST /api/owner/radio/station  save / approve / reject / remove / restore
 *   POST /api/owner/radio/settings country rules
 *   POST /api/owner/radio/request  mark an "add my station" request as done
 *   GET  /radio/owner-section.js   the owner view's KalRadio section (added by TOUCH POINT R6)
 *
 * Settings (environment):
 *   KALRADIO_GEO=0            turn off the visitor-country lookup (then nothing can play: country unknown)
 *   KALRADIO_COUNTRY_HEADER   read the visitor's country from this request header instead (e.g. cf-ipcountry)
 *   KALRADIO_APPROVED_ONLY=1  Version 2 rules: only approved stations play. Without it (Version 3, the default),
 *                             every station plays from its own https link, like the first Netlify test; removed
 *                             stations stay hidden. For testing only: switch this on before sharing /radio.
 *
 * Tables (made on first use): kalradio_favs, kalradio_stations, kalradio_log, kalradio_requests,
 * kalradio_plays, kalradio_settings. A station with no kalradio_stations row is "pending".
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PAGE = path.join(__dirname, '..', 'public', 'radio.html');
const OWNER_JS = path.join(__dirname, 'owner-section.js');
const MAX = 30;                       // stations per home
const PUBLIC_REMOVALS_PER_DAY = 3;    // per visitor
const DEFAULT_RESTRICTED = ['GB'];    // listeners here may only play stations from their own country (TuneIn ruling)

// The radio page may talk to the station list (Radio Browser) and play streams from any https site.
// This is only for /radio. Kalendaryo's own pages keep their stricter rules.
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self' https://*.api.radio-browser.info",
  "media-src https:", "frame-ancestors 'self'", "base-uri 'none'", "form-action 'self'"].join('; ');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kalradio_favs (
  family_id TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  favs JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kalradio_stations (
  station_uuid TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','removed')),
  prev_status TEXT,
  name TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  official_website TEXT NOT NULL DEFAULT '',
  official_stream_url TEXT NOT NULL DEFAULT '',
  permission_received BOOLEAN NOT NULL DEFAULT false,
  permission_date DATE,
  territories_allowed TEXT NOT NULL DEFAULT '*',
  owner_contact TEXT NOT NULL DEFAULT '',
  review_notes TEXT NOT NULL DEFAULT '',
  removal_reason TEXT NOT NULL DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kalradio_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  station_uuid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  by_whom TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  who TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS kalradio_log_at ON kalradio_log(at);
CREATE INDEX IF NOT EXISTS kalradio_log_station ON kalradio_log(station_uuid);
CREATE INDEX IF NOT EXISTS kalradio_log_who ON kalradio_log(who, at);
CREATE TABLE IF NOT EXISTS kalradio_requests (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  station_name TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  stream_url TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  done BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS kalradio_plays (
  day DATE NOT NULL,
  station_uuid TEXT NOT NULL,
  n INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, station_uuid));
ALTER TABLE kalradio_plays ADD COLUMN IF NOT EXISTS name TEXT;    -- V3: names of stations that have no review record
ALTER TABLE kalradio_plays ADD COLUMN IF NOT EXISTS country TEXT;
CREATE TABLE IF NOT EXISTS kalradio_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);`;

const UUID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const openMode = () => process.env.KALRADIO_APPROVED_ONLY !== '1'; // Version 3: every station plays (see the settings above)
const CC_RE = /^[A-Z]{2}$/;

module.exports = function createKalRadio({ r, db, auth, need, json, send, fail, clean, owner, ownerGuard, ownerPush, ipOf, limit }) {
  let table = null;
  const ready = () => table || (table = db.q(SCHEMA).catch((e) => { table = null; throw e; }));
  const alert = (msg) => { if (ownerPush) ownerPush.notify(Object.assign({ url: '/owner#kalradio' }, msg)).catch(() => {}); };
  // The visitor's address. Behind Render's proxy (TRUST_PROXY not 0) the proxy ADDS the real address at the END of
  // X-Forwarded-For; anything before it was sent by the visitor and can be faked, so only the last entry is used.
  const ip = (req) => {
    if (process.env.TRUST_PROXY !== '0') { const xs = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean); if (xs.length) return xs[xs.length - 1]; }
    return req.socket.remoteAddress || '';
  };
  const hits = (key, max, ms) => (limit ? limit(key, max, ms) : true);
  // A one-way code for "this visitor today" (for the removal limit). Never the address itself.
  const visitorCode = (req) => crypto.createHash('sha256').update('kalradio:' + new Date().toISOString().slice(0, 10) + ':' + ip(req)).digest('hex').slice(0, 16);
  const guard = (req) => { if (ownerGuard) ownerGuard(req); else fail(404, 'not_found', 'Not found.'); };

  /* ---------- small cleaners ---------- */
  const httpUrl = (v, max) => { const s = String(v || '').trim(); return /^https?:\/\/[^\s"'<>]{3,}$/i.test(s) && s.length <= (max || 500) ? s : ''; };
  const httpsUrl = (v) => { const s = httpUrl(v); return /^https:\/\//i.test(s) ? s : ''; };
  const cc = (v) => { const s = String(v || '').trim().toUpperCase(); return CC_RE.test(s) ? s : ''; };
  const ccList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(cc).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 60);
  const territories = (v) => { const s = String(v == null ? '*' : v).trim(); if (s === '*' || s === '') return '*'; const l = ccList(s); return l.length ? l.join(',') : '*'; };

  /* ---------- settings ---------- */
  let settingsCache = null;
  async function settings() {
    if (settingsCache && Date.now() - settingsCache.at < 30000) return settingsCache.v;
    await ready();
    const q = await db.q("SELECT value FROM kalradio_settings WHERE key='rules'");
    const v = Object.assign({ restricted: DEFAULT_RESTRICTED }, q.rows[0] ? q.rows[0].value : {});
    settingsCache = { at: Date.now(), v };
    return v;
  }

  /* ---------- the visitor's country ----------
   * Looked up from the address (ipwho.is, then ipapi.co — the same services the owner view uses), kept in memory
   * for 12 hours, never saved. If it can't be found, the country is "unknown" and nothing plays inside Kalendaryo. */
  const geo = new Map(), inflight = new Map();
  const isPrivate = (a) => !a || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80|::ffff:127\.|::ffff:10\.|::ffff:192\.168\.)/i.test(a);
  async function lookupCountry(addr) {
    const tries = [['https://ipwho.is/' + encodeURIComponent(addr) + '?fields=success,country_code', (d) => (d.success ? d.country_code : '')],
      ['https://ipapi.co/' + encodeURIComponent(addr) + '/country/', null]];
    for (const [url, pick] of tries) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3500), headers: { 'User-Agent': 'KalRadio/2.0 (kalendaryo.co)' } });
        if (!res.ok) continue;
        const got = cc(pick ? pick(await res.json()) : (await res.text()).trim());
        if (got) return got;
      } catch (e) { /* try the next one */ }
    }
    return '';
  }
  async function countryOf(req) {
    const header = process.env.KALRADIO_COUNTRY_HEADER;
    if (header) return cc(req.headers[header.toLowerCase()]) || null;
    if (process.env.KALRADIO_GEO === '0') return null;
    const addr = ip(req);
    if (isPrivate(addr)) return null;
    const hit = geo.get(addr);
    if (hit && Date.now() - hit.at < (hit.cc ? 12 * 3600000 : 5 * 60000)) return hit.cc || null; // a failed lookup is tried again after 5 minutes
    if (!inflight.has(addr)) inflight.set(addr, lookupCountry(addr).then((got) => {
      geo.set(addr, { cc: got, at: Date.now() }); inflight.delete(addr);
      if (geo.size > 20000) geo.delete(geo.keys().next().value);
      return got;
    }));
    return (await inflight.get(addr)) || null;
  }
  setInterval(() => { const t = Date.now() - 12 * 3600000; for (const [k, v] of geo) if (v.at < t) geo.delete(k); }, 3600000).unref();

  // May this approved station play for a listener in country `where`?  -> null (yes) or the reason it can't.
  function blockReason(st, where, rules) {
    if (!where) return 'unknown';
    if (st.territories_allowed && st.territories_allowed !== '*' && !st.territories_allowed.split(',').includes(where)) return 'country';
    if ((rules.restricted || []).includes(where) && st.country_code !== where) return 'country';
    return null;
  }

  /* ---------- the page ---------- */
  r.get('/radio', async (req, res) => {
    if (owner) { owner.cookie(req, res); owner.countPage(req, 'radio'); }
    let html = fs.readFileSync(PAGE, 'utf8');
    if (owner) html = html.replace('</head>', '<script src="/hi.js" defer></script></head>');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Kalendaryo shows this page inside a home
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : html);
  });
  r.get('/radio/owner-section.js', async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(OWNER_JS));
  });

  /* ---------- status: what may play here ---------- */
  r.post('/api/radio/status', json, async (req, res) => {
    if (!hits('kr-status:' + ip(req), 600, 600000)) fail(429, 'rate_limited', 'Too many requests. Please wait a little.');
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(String).filter((x) => UUID_RE.test(x)).slice(0, 80);
    await ready();
    const [where, rules, rows] = await Promise.all([countryOf(req), settings(),
      ids.length ? db.q('SELECT * FROM kalradio_stations WHERE station_uuid = ANY($1)', [ids]) : { rows: [] }]);
    const stations = {};
    const open = openMode();
    if (open) ids.forEach((id) => { stations[id] = { s: 'pending', play: true }; });   // V3: plays from its own https link
    for (const st of rows.rows) {
      if (open && st.status !== 'removed') {
        stations[st.station_uuid] = st.status === 'approved' && st.official_stream_url
          ? { s: 'approved', play: true, web: st.official_website || '', stream: st.official_stream_url } : { s: st.status, play: true, web: st.official_website || '' };
        continue;
      }
      if (st.status === 'approved') {
        const why = st.official_stream_url ? blockReason(st, where, rules) : 'not_approved';
        stations[st.station_uuid] = { s: 'approved', play: !why, why, web: st.official_website || '', stream: why ? undefined : st.official_stream_url };
      } else stations[st.station_uuid] = { s: st.status, play: false, why: 'not_approved', web: st.status === 'removed' ? '' : st.official_website || '' };
    }
    send(res, 200, { country: where, open, stations });
  });

  /* ---------- counting plays (per station per day; who listened is never saved) ---------- */
  r.post('/api/radio/play', json, async (req, res) => {
    const id = String(req.body.id || '');
    if (!UUID_RE.test(id) || !hits('kr-play:' + ip(req), 120, 3600000)) return send(res, 200, { ok: false });
    await ready();
    if (openMode()) await db.q(`INSERT INTO kalradio_plays (day, station_uuid, n, name, country) SELECT CURRENT_DATE, $1, 1, $2, $3
      WHERE NOT EXISTS (SELECT 1 FROM kalradio_stations WHERE station_uuid=$1 AND status='removed')
      ON CONFLICT (day, station_uuid) DO UPDATE SET n = kalradio_plays.n + 1, name = COALESCE(kalradio_plays.name, EXCLUDED.name), country = COALESCE(kalradio_plays.country, EXCLUDED.country)`,
      [id, clean(req.body.name, 80) || null, clean(req.body.country, 60) || null]);
    else await db.q(`INSERT INTO kalradio_plays (day, station_uuid, n) SELECT CURRENT_DATE, station_uuid, 1 FROM kalradio_stations WHERE station_uuid=$1 AND status='approved'
      ON CONFLICT (day, station_uuid) DO UPDATE SET n = kalradio_plays.n + 1`, [id]);
    send(res, 200, { ok: true });
  });

  /* ---------- "Station owner? Remove this station" ---------- */
  const reasonOk = (s) => s.length >= 8 && s.split(/\s+/).filter(Boolean).length >= 2;
  r.post('/api/radio/remove', json, async (req, res) => {
    const id = String(req.body.id || ''), reason = clean(req.body.reason, 500);
    if (!UUID_RE.test(id)) fail(400, 'bad_request', 'Bad request.');
    if (!reasonOk(reason)) fail(400, 'need_reason', 'Please tell us why, in a few words.');
    if (!hits('kr-remove:' + ip(req), 10, 3600000)) fail(429, 'rate_limited', 'Too many tries. Please wait a little.');
    await ready();
    const who = visitorCode(req);
    const name = clean(req.body.name, 80) || 'A station';
    const info = [name, cc(req.body.cc), clean(req.body.country, 60), clean(req.body.city, 60)]; // never a website: anyone can send this
    const before = await db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['kalradio-remove:' + who]); // one removal at a time per visitor
      const n = Number((await c.query("SELECT count(*) FROM kalradio_log WHERE by_whom='public' AND action='removed' AND who=$1 AND at > now() - interval '1 day'", [who])).rows[0].count);
      if (n >= PUBLIC_REMOVALS_PER_DAY) fail(429, 'too_many', 'You can remove up to ' + PUBLIC_REMOVALS_PER_DAY + ' stations a day. To remove more, use “Broadcaster? Ask to be added” and tell us.');
      const q = await c.query('SELECT status FROM kalradio_stations WHERE station_uuid=$1 FOR UPDATE', [id]);
      if (q.rows[0] && q.rows[0].status === 'removed') return 'removed';
      if (q.rows[0]) await c.query("UPDATE kalradio_stations SET prev_status=status, status='removed', removal_reason=$2, updated_at=now() WHERE station_uuid=$1", [id, reason]);
      else await c.query(`INSERT INTO kalradio_stations (station_uuid, status, prev_status, name, country_code, country, city, removal_reason)
        VALUES ($1,'removed','pending',$2,$3,$4,$5,$6)`, [id, ...info, reason]);
      await c.query("INSERT INTO kalradio_log (station_uuid, name, action, by_whom, reason, who) VALUES ($1,$2,'removed','public',$3,$4)", [id, name, reason, who]);
      return q.rows[0] ? q.rows[0].status : 'pending';
    });
    if (before !== 'removed') alert({ title: 'KalRadio: station removed', body: name + ' was removed by someone who said they own it. Reason: ' + reason.slice(0, 140) });
    send(res, 200, { ok: true });
  });

  /* ---------- "Broadcaster? Ask to be added" ---------- */
  r.post('/api/radio/requests', json, async (req, res) => {
    const b = req.body || {};
    const station = clean(b.station_name, 80), email = clean(b.email, 120);
    if (!station) fail(400, 'bad_request', 'Please type the station name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail(400, 'bad_email', 'Please type an email address we can reply to.');
    if (String(b.hp || '')) return send(res, 200, { ok: true }); // a hidden field only robots fill in
    if (!hits('kr-request:' + ip(req), 5, 86400000)) fail(429, 'rate_limited', 'Thank you. We already have your request.');
    await ready();
    await db.q('INSERT INTO kalradio_requests (station_name, website, stream_url, contact_name, email, message) VALUES ($1,$2,$3,$4,$5,$6)',
      [station, httpUrl(b.website), httpUrl(b.stream_url), clean(b.contact_name, 80), email, clean(b.message, 1000)]);
    alert({ title: 'KalRadio: a station asks to be added', body: station + ' (' + email + ')' });
    send(res, 200, { ok: true });
  });

  /* ---------- a home's "Our stations" ---------- */
  const noCare = async (req) => { if (req.me.care) fail(403, 'read_only', 'The Care board cannot do that.'); };
  const canEdit = (me) => !me.care && !me.viewing && (me.role === 'editor' || me.role === 'owner');
  r.get('/api/radio/favs', auth, noCare, async (req, res) => {
    await ready();
    const q = await db.q('SELECT favs FROM kalradio_favs WHERE family_id=$1', [req.me.family_id]);
    send(res, 200, { favs: q.rows[0] ? q.rows[0].favs : [], canEdit: canEdit(req.me) });
  });
  const num = (v, lim) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) && Math.abs(Number(v)) <= lim ? Math.round(Number(v) * 1e4) / 1e4 : null);
  async function changeList(familyId, change) {
    await ready();
    return db.tx(async (c) => {
      await c.query('INSERT INTO kalradio_favs (family_id) VALUES ($1) ON CONFLICT DO NOTHING', [familyId]);
      const q = await c.query('SELECT favs FROM kalradio_favs WHERE family_id=$1 FOR UPDATE', [familyId]);
      const favs = change(Array.isArray(q.rows[0].favs) ? q.rows[0].favs : []);
      await c.query('UPDATE kalradio_favs SET favs=$2, updated_at=now() WHERE family_id=$1', [familyId, JSON.stringify(favs)]);
      return favs;
    });
  }
  const editor = [json, auth, noCare, need('editor'), async (req) => { if (req.me.viewing) fail(403, 'read_only', 'This view is read-only.'); }];
  r.post('/api/radio/favs/add', ...editor, async (req, res) => {
    const f = req.body.fav || {}, id = String(f.id || '');
    if (!UUID_RE.test(id)) fail(400, 'bad_station', 'This station cannot be saved.');
    await ready();
    const st = (await db.q("SELECT * FROM kalradio_stations WHERE station_uuid=$1 AND status='approved'", [id])).rows[0];
    let fav;
    if (st) {
      // What is saved comes from our approval record, not from the browser.
      fav = { id, name: st.name || clean(f.name, 80) || 'Station', url: st.official_stream_url, city: st.city || clean(f.city, 60), country: st.country || clean(f.country, 60),
        lat: num(f.lat, 90), lon: num(f.lon, 180) };
    } else if (openMode()) {
      // V3: any station that is not removed, with its own https stream link.
      const gone = (await db.q("SELECT 1 FROM kalradio_stations WHERE station_uuid=$1 AND status='removed'", [id])).rows[0];
      const url = httpsUrl(f.url);
      if (gone || !url) fail(400, 'bad_station', 'This station cannot be saved.');
      fav = { id, name: clean(f.name, 80) || 'Station', url, city: clean(f.city, 60), country: clean(f.country, 60), lat: num(f.lat, 90), lon: num(f.lon, 180) };
    } else fail(400, 'not_approved', 'Only approved stations can be added.');
    const at = Number.isInteger(req.body.at) ? req.body.at : null;
    const favs = await changeList(req.me.family_id, (list) => {
      if (list.some((x) => x.id === id)) return list;
      if (list.length >= MAX) fail(400, 'too_many', MAX + ' stations is the limit. Remove one first.');
      const out = list.slice(); out.splice(at === null ? out.length : Math.max(0, Math.min(at, out.length)), 0, fav); return out;
    });
    send(res, 200, { favs });
  });
  r.post('/api/radio/favs/remove', ...editor, async (req, res) => {
    const id = String(req.body.id || '');
    const favs = await changeList(req.me.family_id, (list) => list.filter((x) => x.id !== id));
    send(res, 200, { favs });
  });

  /* ---------- site owner ---------- */
  const fields = ['name', 'country_code', 'country', 'city', 'official_website', 'official_stream_url', 'permission_received', 'permission_date', 'territories_allowed', 'owner_contact', 'review_notes'];
  function cleanRecord(b) {
    const d = String(b.permission_date || '').slice(0, 10);
    return {
      name: clean(b.name, 80), country_code: cc(b.country_code), country: clean(b.country, 60), city: clean(b.city, 60),
      official_website: httpUrl(b.official_website), official_stream_url: httpsUrl(b.official_stream_url),
      permission_received: !!b.permission_received, permission_date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
      territories_allowed: territories(b.territories_allowed), owner_contact: clean(b.owner_contact, 200), review_notes: clean(b.review_notes, 2000)
    };
  }
  r.get('/api/owner/radio/station', async (req, res) => {
    guard(req); await ready();
    const id = String(req.query.id || ''); if (!UUID_RE.test(id)) fail(400, 'bad_request', 'Bad request.');
    const st = (await db.q('SELECT *, permission_date::text AS permission_date FROM kalradio_stations WHERE station_uuid=$1', [id])).rows[0] || null;
    const log = (await db.q('SELECT extract(epoch FROM at)*1000 AS at, action, by_whom, reason FROM kalradio_log WHERE station_uuid=$1 ORDER BY at DESC LIMIT 50', [id])).rows;
    send(res, 200, { station: st, log });
  });
  const ACTIONS = { save: null, approve: 'approved', reject: 'rejected', remove: 'removed', restore: 'restore', pending: 'pending' };
  r.post('/api/owner/radio/station', json, async (req, res) => {
    guard(req); await ready();
    const b = req.body || {}, id = String(b.id || ''), action = String(b.action || 'save');
    if (!UUID_RE.test(id) || !(action in ACTIONS)) fail(400, 'bad_request', 'Bad request.');
    const rec = cleanRecord(b), note = clean(b.reason, 500);
    const terr = String(b.territories_allowed == null ? '*' : b.territories_allowed).trim();
    if (terr && terr !== '*' && String(terr).split(/[\s,;]+/).filter(Boolean).some((x) => !cc(x))) fail(400, 'bad_countries', 'Use 2-letter country codes, like CA, US, PH. Or * for everywhere.');
    if (String(b.official_stream_url || '').trim() && !rec.official_stream_url) fail(400, 'bad_stream', 'The stream link must start with https://');
    if (String(b.official_website || '').trim() && !rec.official_website) fail(400, 'bad_website', 'The website must start with https:// or http://');
    if (action === 'approve') {
      if (!rec.official_stream_url) fail(400, 'need_stream', 'Add the official stream link (https) before approving.');
      if (!rec.official_website) fail(400, 'need_website', 'Add the official website before approving.');
    }
    if (action === 'remove' && !reasonOk(note)) fail(400, 'need_reason', 'Write a reason (a few words) before removing.');
    const out = await db.tx(async (c) => {
      const old = (await c.query('SELECT * FROM kalradio_stations WHERE station_uuid=$1 FOR UPDATE', [id])).rows[0];
      let status = old ? old.status : 'pending', prev = old ? old.prev_status : null;
      if (action === 'restore') { if (!old || old.status !== 'removed') fail(400, 'not_removed', 'This station is not removed.'); status = old.prev_status || 'pending'; prev = 'removed'; }
      else if (ACTIONS[action] && ACTIONS[action] !== status) { prev = status; status = ACTIONS[action]; }
      const vals = fields.map((f) => rec[f]);
      await c.query(`INSERT INTO kalradio_stations (station_uuid, status, prev_status, ${fields.join(', ')}, removal_reason, reviewed_at, updated_at)
        VALUES ($1,$2,$3,${fields.map((_, i) => '$' + (i + 4)).join(',')},$${fields.length + 4}, now(), now())
        ON CONFLICT (station_uuid) DO UPDATE SET status=EXCLUDED.status, prev_status=EXCLUDED.prev_status, ${fields.map((f) => f + '=EXCLUDED.' + f).join(', ')},
          removal_reason=EXCLUDED.removal_reason, reviewed_at=now(), updated_at=now()`,
      [id, status, prev, ...vals, action === 'remove' ? note : action === 'restore' ? '' : (old ? old.removal_reason : '')]);
      const logged = { save: 'saved', approve: 'approved', reject: 'rejected', remove: 'removed', restore: 'restored', pending: 'set to pending' }[action];
      await c.query("INSERT INTO kalradio_log (station_uuid, name, action, by_whom, reason) VALUES ($1,$2,$3,'owner',$4)", [id, rec.name || (old && old.name) || '', logged, note]);
      return (await c.query('SELECT *, permission_date::text AS permission_date FROM kalradio_stations WHERE station_uuid=$1', [id])).rows[0];
    });
    send(res, 200, { station: out });
  });
  r.post('/api/owner/radio/settings', json, async (req, res) => {
    guard(req); await ready();
    const restricted = ccList(req.body.restricted);
    await db.q("INSERT INTO kalradio_settings (key, value) VALUES ('rules', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [JSON.stringify({ restricted })]);
    settingsCache = null;
    send(res, 200, { restricted });
  });
  r.post('/api/owner/radio/request', json, async (req, res) => {
    guard(req); await ready();
    await db.q('UPDATE kalradio_requests SET done=$2 WHERE id=$1', [Number(req.body.id) || 0, req.body.done !== false]);
    send(res, 200, { ok: true });
  });
  r.get('/api/owner/radio', async (req, res) => {
    guard(req); await ready();
    const q = (t, p) => db.q(t, p).then((x) => x.rows);
    const [visitors, places, plays7, plays30, top7, top30, approved, removed, rejected, requests, history, rules] = await Promise.all([
      q(`SELECT count(DISTINCT vid)::int AS n7, count(DISTINCT vid) FILTER (WHERE at > now() - interval '1 day')::int AS n1 FROM visit_log WHERE page='radio' AND real AND at > now() - interval '7 days'`).catch(() => [{ n7: 0, n1: 0 }]),
      q(`SELECT COALESCE(city,'') AS city, country, cc, count(DISTINCT vid)::int AS n FROM visit_log WHERE page='radio' AND real AND at > now() - interval '30 days' AND country IS NOT NULL AND country <> ''
         GROUP BY 1,2,3 ORDER BY n DESC LIMIT 10`).catch(() => []),
      q("SELECT COALESCE(sum(n),0)::int AS n FROM kalradio_plays WHERE day > CURRENT_DATE - 7"),
      q("SELECT COALESCE(sum(n),0)::int AS n FROM kalradio_plays WHERE day > CURRENT_DATE - 30"),
      q(`SELECT p.station_uuid AS id, COALESCE(max(s.name), max(p.name)) AS name, COALESCE(max(s.country), max(p.country)) AS country, sum(p.n)::int AS n
         FROM kalradio_plays p LEFT JOIN kalradio_stations s USING (station_uuid) WHERE p.day > CURRENT_DATE - 7 GROUP BY 1 ORDER BY n DESC LIMIT 10`),
      q(`SELECT p.station_uuid AS id, COALESCE(max(s.name), max(p.name)) AS name, COALESCE(max(s.country), max(p.country)) AS country, sum(p.n)::int AS n
         FROM kalradio_plays p LEFT JOIN kalradio_stations s USING (station_uuid) WHERE p.day > CURRENT_DATE - 30 GROUP BY 1 ORDER BY n DESC LIMIT 10`),
      q(`SELECT station_uuid AS id, name, country, country_code, city, territories_allowed, permission_received, official_website, extract(epoch FROM reviewed_at)*1000 AS at
         FROM kalradio_stations WHERE status='approved' ORDER BY name`),
      q(`SELECT s.station_uuid AS id, s.name, s.country, s.removal_reason AS reason, s.prev_status, extract(epoch FROM s.updated_at)*1000 AS at,
         (SELECT by_whom FROM kalradio_log l WHERE l.station_uuid=s.station_uuid AND l.action='removed' ORDER BY at DESC LIMIT 1) AS by_whom
         FROM kalradio_stations s WHERE status='removed' ORDER BY s.updated_at DESC LIMIT 200`),
      q("SELECT station_uuid AS id, name, country, review_notes AS note FROM kalradio_stations WHERE status='rejected' ORDER BY updated_at DESC LIMIT 100"),
      q("SELECT id, extract(epoch FROM at)*1000 AS at, station_name, website, stream_url, contact_name, email, message, done FROM kalradio_requests ORDER BY done, at DESC LIMIT 50"),
      q("SELECT extract(epoch FROM at)*1000 AS at, station_uuid AS id, name, action, by_whom, reason FROM kalradio_log ORDER BY at DESC LIMIT 60"),
      settings()
    ]);
    send(res, 200, { visitors: visitors[0] || { n7: 0, n1: 0 }, places, plays7: plays7[0].n, plays30: plays30[0].n, top7, top30,
      approved, removed, rejected, requests, history, rules });
  });

  return { page: PAGE };
};
