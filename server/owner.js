/*
 * owner.js — the owner view (only for the site owner, like Polybot's).
 *
 *   Set OWNER_KEY in Render (Environment). Then open  /owner?key=<your key>.
 *   Without the right key the owner API answers 404, as if nothing is there.
 *
 * What it counts:
 *   - Visitors: one per device per day. A device is a one-way hash of (address + browser), never the address itself.
 *   - Where: city and country only, looked up in the background from the address (ipwho.is, then ipapi.co).
 *     The address is never saved.
 *   - Visitors now: devices that asked the site for anything in the last 2 minutes, or have a page open with live updates.
 *   - Bots, search engines, link previews (Messenger, WhatsApp, Slack…) and scripts are not counted.
 *   - Recent visitors: the latest page opens (start page, a home, a trip), with city and country, kept 30 days.
 *   - Homes and trips: names, people, last active, how much they store. Read straight from the database.
 * Viewing: the owner can open any home read-only with a short-lived viewing link (2 hours, kept in memory).
 *   The visit is not saved as theirs, and every change is refused.
 */
const crypto = require('crypto');

const NOW_WINDOW = 2 * 60 * 1000;
const VIEW_TTL = 2 * 60 * 60 * 1000;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// Robots that open pages: search engines, link-preview makers in chat apps, monitors and scripts.
const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|meta-external|whatsapp|telegram|discord|slack|skype|line\/|vkshare|embedly|quora link|pinterest|redditbot|applebot|bingpreview|google-?(inspectiontool|read-aloud|site-verification)|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient|postman|insomnia|uptime|pingdom|monitor|statuscake|render|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|amazonbot|yandex|baidu|duckduck|sogou|exabot|seznam|zgrab|masscan|nmap|scan/i;
const isBot = (req) => { const ua = String(req.headers['user-agent'] || ''); return !ua || ua.length < 12 || BOT_RE.test(ua); };

function createOwner({ db, live, ipOf, fail, triplySchema }) {
  const KEY = () => String(process.env.OWNER_KEY || '');
  const SALT = sha('kalendaryo-visits:' + (process.env.DATABASE_URL || ''));
  const geoOn = process.env.OWNER_GEO !== '0';

  const seen = new Map();      // device -> last request time
  const streams = new Map();   // device -> open live connections
  const located = new Map();   // device -> [city, country, cc]
  const pending = new Set();
  const placeNoted = new Map(); // kind:ref:device -> time
  const homeActive = new Map(); // familyId -> last request time (finer than access.last_seen)
  const tripActive = new Map(); // tripId -> last request time
  const views = new Map();      // viewing token -> { familyId, exp }

  function isOwnerKey(k) {
    const key = KEY();
    if (!key || !k) return false;
    const a = Buffer.from(String(k)), b = Buffer.from(key);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const deviceOf = (req) => sha(SALT + '|' + ipOf(req) + '|' + (req.headers['user-agent'] || '')).slice(0, 24);
  const isOwnerRequest = (req) => isOwnerKey(req.headers['x-owner-key']);

  /* ---------- where (city and country) ---------- */
  function publicIp(ip) {
    const s = String(ip || '').replace(/^::ffff:/, '');
    if (!s || s === '::1' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80)/i.test(s)) return null;
    return s;
  }
  async function lookup(ip) {
    const sources = [
      ['https://ipwho.is/' + encodeURIComponent(ip) + '?fields=success,city,country,country_code', (d) => (d.success ? [d.city || '', d.country || '', d.country_code || ''] : null)],
      ['https://ipapi.co/' + encodeURIComponent(ip) + '/json/', (d) => (d.error ? null : [d.city || '', d.country_name || '', d.country_code || ''])]
    ];
    for (const [url, parse] of sources) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Mozilla/5.0' } });
        const out = parse(await r.json());
        if (out && (out[0] || out[1])) return out.map((x) => String(x).slice(0, 60));
      } catch (e) { /* try the next one */ }
    }
    return null;
  }
  // Calls back with [city, country, cc] when known. Never waits on the page.
  function locate(req, device, done) {
    if (located.has(device)) return done(located.get(device));
    if (!geoOn || pending.has(device)) return;
    const ip = publicIp(ipOf(req));
    if (!ip) return;
    pending.add(device);
    lookup(ip).then((loc) => { if (loc) { located.set(device, loc); done(loc); } }).finally(() => pending.delete(device));
  }

  /* ---------- counting ---------- */
  // Every request (except the owner's own) marks the device as active now.
  function touch(req) {
    if (isOwnerRequest(req) || String(req.url).startsWith('/owner') || isBot(req)) return;
    const device = deviceOf(req);
    seen.set(device, Date.now());
    // Live update connections count as "here now" while they stay open.
    if (/\/stream(\?|$)/.test(String(req.url).split('#')[0]) && !viewingToken(req)) {
      streams.set(device, (streams.get(device) || 0) + 1);
      req.on('close', () => { const n = (streams.get(device) || 1) - 1; if (n > 0) streams.set(device, n); else streams.delete(device); });
    }
  }
  // A page was opened: one visit per device per day, plus a line in "Recent visitors"
  // (the same device opening the same kind of page again within 10 minutes is not listed twice).
  const logged = new Map(); // device|page -> time
  function countPage(req, page) {
    if (req.method !== 'GET' || viewingToken(req) || isBot(req)) return;
    const device = deviceOf(req);
    db.q('INSERT INTO visits (day, vid) VALUES (CURRENT_DATE, $1) ON CONFLICT DO NOTHING', [device]).catch(() => {});
    const k = device + '|' + page, now = Date.now();
    const log = now - (logged.get(k) || 0) > 600000;
    if (log) logged.set(k, now);
    const logId = log ? db.q('INSERT INTO visit_log (vid, page) VALUES ($1, $2) RETURNING id', [device, page]).then((r) => r.rows[0].id, () => null) : Promise.resolve(null);
    locate(req, device, (loc) => {
      db.q('UPDATE visits SET city=$2, country=$3, cc=$4 WHERE day=CURRENT_DATE AND vid=$1 AND country IS NULL', [device, ...loc]).catch(() => {});
      logId.then((id) => id && db.q('UPDATE visit_log SET city=$2, country=$3, cc=$4 WHERE id=$1', [id, ...loc]).catch(() => {}));
    });
    if (Math.random() < 0.01) db.q("DELETE FROM visit_log WHERE at < now() - interval '30 days'").catch(() => {});
    if (logged.size > 5000) for (const [kk, t] of logged) if (now - t > 600000) logged.delete(kk);
  }
  // Someone used a home or a trip: remember when, and roughly where (once an hour per device).
  function noteUse(req, kind, ref) {
    if (!ref || viewingToken(req)) return;
    (kind === 'home' ? homeActive : tripActive).set(ref, Date.now());
    const device = deviceOf(req), k = kind + ':' + ref + ':' + device;
    if (Date.now() - (placeNoted.get(k) || 0) < 3600000) return;
    placeNoted.set(k, Date.now());
    locate(req, device, (loc) => db.q(`INSERT INTO places (kind, ref, city, country, cc, updated_at) VALUES ($1,$2,$3,$4,$5, now())
      ON CONFLICT (kind, ref) DO UPDATE SET city=EXCLUDED.city, country=EXCLUDED.country, cc=EXCLUDED.cc, updated_at=now()`, [kind, String(ref), ...loc]).catch(() => {}));
  }
  // Trip use is seen from the address: /triply/api/trips/<id>/...
  function noteTrip(req) {
    const m = String(req.url).match(/^\/triply\/api\/trips\/([0-9a-f-]{36})(\/|\?|$)/i);
    if (m) noteUse(req, 'trip', m[1].toLowerCase());
  }
  function visitorsNow() {
    const now = Date.now(), out = new Set(streams.keys());
    for (const [d, t] of seen) { if (now - t <= NOW_WINDOW) out.add(d); else if (now - t > 86400000) seen.delete(d); }
    return out.size;
  }

  /* ---------- viewing a home as owner ---------- */
  function viewingToken(req) {
    const h = req.headers.authorization || '';
    let t = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!t) { const m = String(req.url).match(/[?&]t=([^&]+)/); t = m ? decodeURIComponent(m[1]) : ''; }
    if (!t) { const m = String(req.url).match(/^\/c\/([A-Za-z0-9_-]+)/); t = m ? m[1] : ''; }
    return t.startsWith('ov') && views.has(t) ? t : null;
  }
  // Used by Kalendaryo's auth: returns a read-only "me" for a viewing link, or null.
  async function viewer(token, req) {
    const v = views.get(token);
    if (!v) return null;
    if (v.exp < Date.now()) { views.delete(token); return null; }
    if (req.method !== 'GET' && req.method !== 'HEAD') fail(403, 'read_only', 'You are viewing this home as the site owner. Nothing can be changed.');
    const f = await db.q('SELECT name FROM families WHERE id=$1', [v.familyId]);
    if (!f.rowCount) { views.delete(token); return null; }
    return { id: 'owner-view', family_id: v.familyId, name: 'Site owner (viewing)', role: 'viewer', family_name: f.rows[0].name, viewing: true };
  }

  /* ---------- the owner API ---------- */
  function guard(req) { if (!isOwnerRequest(req)) fail(404, 'not_found', 'Not found.'); }

  async function summary() {
    const one = async (sql, p) => (await db.q(sql, p)).rows[0];
    const tiles = await one(`SELECT
        (SELECT count(*) FROM visits WHERE day = CURRENT_DATE)::int AS today,
        (SELECT count(DISTINCT vid) FROM visits WHERE day > CURRENT_DATE - 7)::int AS week,
        (SELECT count(*) FROM families)::int AS homes,
        (SELECT count(*) FROM families WHERE created_at > now() - interval '7 days')::int AS homes_week,
        (SELECT count(*) FROM access)::int AS people,
        (SELECT COALESCE(sum(ai_count), 0) FROM families WHERE ai_day = CURRENT_DATE)::int AS ai_today,
        pg_database_size(current_database())::bigint AS db_bytes`);
    const days = (await db.q(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(v.n, 0)::int AS n
        FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') d
        LEFT JOIN (SELECT day, count(*) n FROM visits GROUP BY day) v ON v.day = d::date ORDER BY d`)).rows;
    const countries = (await db.q(`SELECT COALESCE(city, '') AS city, country, cc, count(DISTINCT vid)::int AS n FROM visits
        WHERE day > CURRENT_DATE - 30 AND country IS NOT NULL AND country <> '' GROUP BY city, country, cc ORDER BY n DESC, country LIMIT 10`)).rows;
    const recent = (await db.q(`SELECT extract(epoch FROM at) * 1000 AS at, page, city, country, cc, substr(vid, 1, 6) AS who
        FROM visit_log ORDER BY at DESC LIMIT 20`)).rows.map((r) => Object.assign(r, { at: Number(r.at) }));
    const homes = (await db.q(`SELECT f.id, f.name, f.created_at,
        (SELECT count(*) FROM access a WHERE a.family_id = f.id)::int AS people,
        (SELECT max(last_seen) FROM access a WHERE a.family_id = f.id) AS last_seen,
        (SELECT count(*) FROM docs d WHERE d.family_id = f.id)::int AS items,
        (SELECT COALESCE(sum(size), 0) FROM blobs b WHERE b.family_id = f.id)::bigint AS photo_bytes,
        p.city, p.country, p.cc
        FROM families f LEFT JOIN places p ON p.kind = 'home' AND p.ref = f.id`)).rows;
    const online = live.online ? live.online() : new Map();
    for (const h of homes) {
      const mem = homeActive.get(h.id);
      const db1 = h.last_seen ? new Date(h.last_seen).getTime() : 0;
      h.last_active = Math.max(mem || 0, db1) || null;
      h.online = (online.get(h.id) || 0) > 0;
      delete h.last_seen;
    }
    homes.sort((a, b) => (b.last_active || 0) - (a.last_active || 0));

    let trips = null;
    if (triplySchema) {
      const s = triplySchema;
      try {
        trips = (await db.q(`SELECT t.id::text AS id, t.name, t.start_date, t.end_date, t.created_at,
            (SELECT count(*) FROM ${s}.members m WHERE m.trip_id = t.id)::int AS people,
            (SELECT max(m.last_seen_at) FROM ${s}.members m WHERE m.trip_id = t.id) AS last_seen,
            (SELECT count(*) FROM ${s}.items i WHERE i.trip_id = t.id)::int AS plans,
            (SELECT COALESCE(sum(b.size), 0) FROM ${s}.blobs b WHERE b.trip_id = t.id)::bigint AS file_bytes,
            p.city, p.country, p.cc
            FROM ${s}.trips t LEFT JOIN places p ON p.kind = 'trip' AND p.ref = t.id::text`)).rows;
        for (const t of trips) {
          const mem = tripActive.get(t.id);
          t.last_active = Math.max(mem || 0, t.last_seen ? new Date(t.last_seen).getTime() : 0) || null;
          delete t.last_seen;
        }
        trips.sort((a, b) => (b.last_active || 0) - (a.last_active || 0));
        tiles.trips = trips.length;
        tiles.trips_week = trips.filter((t) => Date.now() - new Date(t.created_at).getTime() < 7 * 86400000).length;
        tiles.people += trips.reduce((n, t) => n + t.people, 0);
      } catch (e) { trips = null; } // Triply's tables are not there yet
    }
    return { now: Date.now(), visitors_now: visitorsNow(), tiles, days, countries, recent, homes, trips, ai_on: !!process.env.ANTHROPIC_API_KEY };
  }

  function install(r, json, send) {
    r.get('/api/owner/summary', async (req, res) => { guard(req); send(res, 200, await summary()); });
    r.post('/api/owner/view', json, async (req, res) => {
      guard(req);
      const familyId = String((req.body && req.body.familyId) || '');
      const f = await db.q('SELECT id FROM families WHERE id=$1', [familyId]);
      if (!f.rowCount) fail(404, 'not_found', 'That home does not exist anymore.');
      for (const [t, v] of views) if (v.exp < Date.now()) views.delete(t);
      const token = 'ov' + crypto.randomBytes(24).toString('base64url');
      views.set(token, { familyId, exp: Date.now() + VIEW_TTL });
      send(res, 200, { link: '/c/' + token });
    });
  }

  return { touch, countPage, noteUse, noteTrip, viewer, viewingToken, install, isOwnerKey, visitorsNow };
}

module.exports = { createOwner };
