/*
 * support.js — "Help & ideas": a private chat between each person and the site's team, for both
 * Kalendaryo and Triply. Messages are kept in Kalendaryo's database (help_* tables).
 *
 *   - Every person gets one welcome message the first time they open the app (new and existing users).
 *     The text can be edited on the owner page; {name} becomes the person's first name.
 *   - The team's replies are signed "Kalendaryo team" or "Triply team". No personal names.
 *   - The owner page Inbox lists conversations where the person wrote something (welcome-only ones stay out).
 *
 * Kalendaryo uses install(); Triply gets the same functions through createTriply({ support }).
 */
'use strict';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS help_threads (
  id BIGSERIAL PRIMARY KEY,
  app TEXT NOT NULL,                -- 'home' (Kalendaryo) or 'trip' (Triply)
  person TEXT NOT NULL,             -- access id (home) or member id (trip)
  place_id TEXT NOT NULL,           -- family id or trip id
  place_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  user_unread INT NOT NULL DEFAULT 0,
  owner_unread INT NOT NULL DEFAULT 0,
  wrote BOOLEAN NOT NULL DEFAULT false,
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app, person)
);
CREATE TABLE IF NOT EXISTS help_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES help_threads(id) ON DELETE CASCADE,
  from_team BOOLEAN NOT NULL DEFAULT false,
  auto BOOLEAN NOT NULL DEFAULT false,
  tag TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image TEXT,                       -- a small screenshot as a data: URL (shrunk in the browser)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS help_messages_thread ON help_messages(thread_id, id);
CREATE TABLE IF NOT EXISTS help_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- automatic messages that open the chat once (welcome, thank-you check-ins), and what has been sent
ALTER TABLE help_threads ADD COLUMN IF NOT EXISTS popup BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE help_threads ADD COLUMN IF NOT EXISTS last_day DATE;
ALTER TABLE help_threads ADD COLUMN IF NOT EXISTS days_used INT NOT NULL DEFAULT 0;      -- days used since the last automatic message
ALTER TABLE help_threads ADD COLUMN IF NOT EXISTS last_auto_at TIMESTAMPTZ;
ALTER TABLE help_threads ADD COLUMN IF NOT EXISTS sent TEXT[] NOT NULL DEFAULT '{}';     -- which automatic messages went out
`;

const TEAM = { home: 'Kalendaryo team', trip: 'Triply team' };
// The automatic messages. Each one opens the chat once. Editable on the owner page; {name} = first name.
//   Kalendaryo: welcome on first open, then a thank-you at most every 14 days (after 3+ days of use since the last one).
//   Triply (per trip): welcome on first open, a thank-you after 3 different days of planning (before the trip starts),
//   nothing during the trip, and a "welcome back" from the day after the trip ends.
const AUTO = {
  welcome_home: { app: 'home', label: 'Kalendaryo · welcome (first visit)', text: 'Hi {name}! 👋 Thank you for using Kalendaryo. It means a lot to us. We build it around what families actually need, so if anything is confusing, missing, or could be better, just reply here. Every message is read, and many of our updates come straight from ideas like yours. 💛' },
  checkin_home: { app: 'home', label: 'Kalendaryo · thank-you (every 2 weeks)', text: 'Thank you for using Kalendaryo, {name}! 💛 If you have any feedback, ideas or questions, we’d love to hear them. Just reply here.' },
  welcome_trip: { app: 'trip', label: 'Triply · welcome (first visit)', text: 'Hi {name}! 👋 Thank you for planning your trip with Triply. It means a lot to us. We build it around what travelers actually need, so if anything is confusing, missing, or could be better, just reply here. Every message is read, and many of our updates come straight from ideas like yours. ✈️💛' },
  planning_trip: { app: 'trip', label: 'Triply · thank-you (after 3 days of planning)', text: 'Thank you again for using Triply, {name}! 💛 If you have any feedback or ideas, we’d love to hear them. Just reply here.' },
  after_trip: { app: 'trip', label: 'Triply · welcome back (day after the trip)', text: 'Welcome back, {name}! 🧳 We hope you had a wonderful trip. Thank you for planning it with Triply. If you have any feedback, we’d love to hear it. Just reply here.' }
};
const DEFAULT_WELCOME = { home: AUTO.welcome_home.text, trip: AUTO.welcome_trip.text };
const CHECKIN_DAYS = 14, MIN_DAYS_USED = 3;
const TAGS = ['problem', 'idea', 'question'];
const MAX_IMAGE = 900 * 1024;

function createSupport({ db, fail }) {
  const ready = db.q(SCHEMA).catch((e) => { console.error('[help] tables', e.message); });
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const first = (name) => (clean(name, 40).split(/\s+/)[0] || 'there');

  async function autoText(key) {
    const r = await db.q('SELECT value FROM help_settings WHERE key = $1', [key]);
    return r.rowCount ? r.rows[0].value : AUTO[key].text;
  }
  const welcomeText = (app) => autoText('welcome_' + app);
  // Add an automatic message that opens the chat once.
  async function sendAuto(t, key, name) {
    const text = (await autoText(key)).replace(/\{name\}/g, first(name));
    await db.q('INSERT INTO help_messages (thread_id, from_team, auto, body) VALUES ($1, true, true, $2)', [t.id, text]);
    await db.q('UPDATE help_threads SET user_unread = user_unread + 1, popup = true, last_auto_at = now(), days_used = 0, sent = array_append(sent, $2) WHERE id = $1', [t.id, key]);
  }

  // Find (or start) this person's conversation, count the day as used, and add any automatic message that is due.
  // trip (Triply only): { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
  async function open(app, person, placeId, placeName, name, trip) {
    await ready;
    if (!TEAM[app] || !person) fail(400, 'bad_request', 'Bad request.');
    const r = await db.q(`INSERT INTO help_threads (app, person, place_id, place_name, name) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (app, person) DO UPDATE SET place_id = EXCLUDED.place_id, place_name = EXCLUDED.place_name, name = EXCLUDED.name
      RETURNING id, (xmax = 0) AS created`, [app, String(person), String(placeId), clean(placeName, 80), clean(name, 40)]);
    const t = r.rows[0];
    if (t.created) await sendAuto(t, 'welcome_' + app, name);
    else {
      // A new day of use (the family's time zone isn't known here; Vancouver's day is close enough for counting days).
      const day = await db.q(`UPDATE help_threads SET days_used = days_used + 1, last_day = (now() AT TIME ZONE 'America/Vancouver')::date
        WHERE id = $1 AND last_day IS DISTINCT FROM (now() AT TIME ZONE 'America/Vancouver')::date
        RETURNING days_used, last_auto_at, sent, (now() AT TIME ZONE 'America/Vancouver')::date::text AS today,
          EXISTS (SELECT 1 FROM help_messages m WHERE m.thread_id = $1 AND NOT m.from_team AND m.created_at > now() - interval '7 days') AS wrote_lately`, [t.id]);
      const d = day.rows[0];
      if (d && !d.wrote_lately) {
        const since = d.last_auto_at ? (Date.now() - new Date(d.last_auto_at).getTime()) / 86400000 : 999;
        if (app === 'home' && since >= CHECKIN_DAYS && d.days_used >= MIN_DAYS_USED) await sendAuto(t, 'checkin_home', name);
        if (app === 'trip' && trip) {
          const ended = trip.end && d.today > trip.end;                 // from the day after the last day
          const started = trip.start && d.today >= trip.start;
          if (ended && !d.sent.includes('after_trip')) await sendAuto(t, 'after_trip', name);
          else if (!started && !ended && d.days_used >= MIN_DAYS_USED && !d.sent.includes('planning_trip')) await sendAuto(t, 'planning_trip', name);
          // during the trip: nothing, let them enjoy it
        }
      }
    }
    const s = await db.q('SELECT user_unread, popup FROM help_threads WHERE id = $1', [t.id]);
    return { id: t.id, unread: s.rows[0].user_unread, popup: s.rows[0].popup };
  }

  const msgOut = (m, app) => ({ id: Number(m.id), team: m.from_team, auto: m.auto, by: m.from_team ? TEAM[app] : '', tag: m.tag, body: m.body, image: m.image || null, at: m.created_at });
  async function messages(threadId, app) {
    const r = await db.q('SELECT * FROM help_messages WHERE thread_id = $1 ORDER BY id DESC LIMIT 200', [threadId]);
    return r.rows.reverse().map((m) => msgOut(m, app));
  }

  // What the person sees: their whole conversation.
  async function forUser(app, person, placeId, placeName, name, trip) {
    const t = await open(app, person, placeId, placeName, name, trip);
    await db.q('UPDATE help_threads SET popup = false WHERE id = $1', [t.id]); // they are looking at it now
    return { unread: t.unread, team: TEAM[app], messages: await messages(t.id, app) };
  }
  async function userSend(app, person, placeId, placeName, name, body, trip) {
    const t = await open(app, person, placeId, placeName, name, trip);
    const text = clean(body && body.body, 2000), tag = TAGS.includes(body && body.tag) ? body.tag : '';
    let image = body && typeof body.image === 'string' ? body.image : null;
    if (image && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE)) fail(400, 'bad_image', 'That picture could not be added. Try a smaller screenshot.');
    if (!text && !image) fail(400, 'bad_request', 'Type a message first.');
    const m = await db.q('INSERT INTO help_messages (thread_id, tag, body, image) VALUES ($1,$2,$3,$4) RETURNING *', [t.id, tag, text, image]);
    await db.q("UPDATE help_threads SET owner_unread = owner_unread + 1, wrote = true, status = 'open', last_at = now() WHERE id = $1", [t.id]);
    return { message: msgOut(m.rows[0], app) };
  }
  async function userSeen(app, person) {
    await ready;
    await db.q('UPDATE help_threads SET user_unread = 0, popup = false WHERE app = $1 AND person = $2', [app, String(person)]);
    return { ok: true };
  }

  /* ---------- the owner page ---------- */
  async function inbox(filter) {
    await ready;
    const where = filter === 'done' ? "AND t.status = 'done'" : filter === 'all' ? '' : "AND t.status = 'open'";
    const r = await db.q(`SELECT t.id, t.app, t.place_id, t.place_name, t.name, t.status, t.owner_unread, t.last_at,
        (SELECT body FROM help_messages m WHERE m.thread_id = t.id AND NOT m.auto ORDER BY id DESC LIMIT 1) AS last_body,
        (SELECT image IS NOT NULL FROM help_messages m WHERE m.thread_id = t.id AND NOT m.auto ORDER BY id DESC LIMIT 1) AS last_image,
        (SELECT tag FROM help_messages m WHERE m.thread_id = t.id AND NOT m.from_team AND tag <> '' ORDER BY id DESC LIMIT 1) AS tag
      FROM help_threads t WHERE t.wrote ${where} ORDER BY t.owner_unread > 0 DESC, t.last_at DESC LIMIT 200`);
    const n = await db.q("SELECT count(*)::int AS n FROM help_threads WHERE wrote AND owner_unread > 0");
    return { threads: r.rows.map((x) => Object.assign(x, { id: Number(x.id), team: TEAM[x.app] })), unread: n.rows[0].n };
  }
  async function ownerThread(id) {
    await ready;
    const t = await db.q('SELECT * FROM help_threads WHERE id = $1', [id]);
    if (!t.rowCount) fail(404, 'not_found', 'That conversation is gone.');
    await db.q('UPDATE help_threads SET owner_unread = 0 WHERE id = $1', [id]);
    const th = t.rows[0];
    return { thread: { id: Number(th.id), app: th.app, place_id: th.place_id, place_name: th.place_name, name: th.name, status: th.status, team: TEAM[th.app] }, messages: await messages(id, th.app) };
  }
  async function ownerReply(id, body) {
    await ready;
    const text = clean(body, 2000);
    if (!text) fail(400, 'bad_request', 'Type a reply first.');
    const t = await db.q('SELECT app FROM help_threads WHERE id = $1', [id]);
    if (!t.rowCount) fail(404, 'not_found', 'That conversation is gone.');
    const m = await db.q('INSERT INTO help_messages (thread_id, from_team, body) VALUES ($1, true, $2) RETURNING *', [id, text]);
    await db.q('UPDATE help_threads SET user_unread = user_unread + 1, last_at = now() WHERE id = $1', [id]);
    return { message: msgOut(m.rows[0], t.rows[0].app) };
  }
  async function ownerStatus(id, status) {
    await ready;
    await db.q('UPDATE help_threads SET status = $2 WHERE id = $1', [id, status === 'done' ? 'done' : 'open']);
    return { ok: true };
  }
  // All automatic messages for the owner page editor: [{ key, label, app, text }]
  async function getWelcome() { const out = []; for (const k of Object.keys(AUTO)) out.push({ key: k, label: AUTO[k].label, app: AUTO[k].app, text: await autoText(k) }); return out; }
  async function setWelcome(key, text) {
    if (key === 'home' || key === 'trip') key = 'welcome_' + key; // older page
    if (!AUTO[key]) fail(400, 'bad_request', 'Bad request.');
    const v = clean(text, 2000);
    if (!v) await db.q('DELETE FROM help_settings WHERE key = $1', [key]); // empty = back to the original text
    else await db.q('INSERT INTO help_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, v]);
    return getWelcome();
  }

  // Kalendaryo's routes (people in a home) and the owner page's routes.
  function install(r, { auth, helpJson, json, ownerGuard, send }) {
    const homeArgs = (req) => ['home', req.me.id, req.me.family_id, req.me.family_name, req.me.name];
    const noOwnerView = (req) => { if (req.me.viewing) fail(403, 'read_only', 'Help & ideas is for the people in this home.'); };
    r.get('/api/help', auth, async (req, res) => { noOwnerView(req); send(res, 200, await forUser(...homeArgs(req))); });
    r.get('/api/help/unread', auth, async (req, res) => { if (req.me.viewing) return send(res, 200, { unread: 0 }); const t = await open(...homeArgs(req)); send(res, 200, { unread: t.unread, popup: t.popup }); });
    r.post('/api/help', auth, helpJson, async (req, res) => { noOwnerView(req); send(res, 200, await userSend(...homeArgs(req), req.body)); });
    r.post('/api/help/seen', auth, async (req, res) => { noOwnerView(req); send(res, 200, await userSeen('home', req.me.id)); });

    r.get('/api/owner/help', async (req, res) => { ownerGuard(req); send(res, 200, Object.assign(await inbox(req.query.filter), { welcome: await getWelcome() })); });
    r.get('/api/owner/help/:id', async (req, res) => { ownerGuard(req); send(res, 200, await ownerThread(Number(req.params.id) || 0)); });
    r.post('/api/owner/help/:id/reply', json, async (req, res) => { ownerGuard(req); send(res, 200, await ownerReply(Number(req.params.id) || 0, req.body && req.body.body)); });
    r.post('/api/owner/help/:id/status', json, async (req, res) => { ownerGuard(req); send(res, 200, await ownerStatus(Number(req.params.id) || 0, req.body && req.body.status)); });
    r.post('/api/owner/help-welcome', json, async (req, res) => { ownerGuard(req); send(res, 200, await setWelcome(req.body && (req.body.key || req.body.app), req.body && req.body.text)); });
  }

  // For Triply (see triply/server/routes/help.js).
  const dates = (trip) => ({ start: trip.start_date ? String(trip.start_date).slice(0, 10) : '', end: trip.end_date ? String(trip.end_date).slice(0, 10) : '' });
  const forTrip = {
    get: (m, trip) => forUser('trip', m.id, trip.id, trip.name, m.name, dates(trip)),
    unread: async (m, trip) => { const t = await open('trip', m.id, trip.id, trip.name, m.name, dates(trip)); return { unread: t.unread, popup: t.popup }; },
    send: (m, trip, body) => userSend('trip', m.id, trip.id, trip.name, m.name, body, dates(trip)),
    seen: (m) => userSeen('trip', m.id)
  };

  return { install, forTrip, open, inbox, ownerThread, ownerReply, ownerStatus, getWelcome, setWelcome, DEFAULT_WELCOME };
}

module.exports = { createSupport };
