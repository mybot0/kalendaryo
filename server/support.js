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
`;

const TEAM = { home: 'Kalendaryo team', trip: 'Triply team' };
const DEFAULT_WELCOME = {
  home: 'Hi {name}! 👋 Thank you for using Kalendaryo. It means a lot to us. We build it around what families actually need, so if anything is confusing, missing, or could be better, just reply here. Every message is read, and many of our updates come straight from ideas like yours. 💛',
  trip: 'Hi {name}! 👋 Thank you for planning your trip with Triply. It means a lot to us. We build it around what travelers actually need, so if anything is confusing, missing, or could be better, just reply here. Every message is read, and many of our updates come straight from ideas like yours. ✈️💛'
};
const TAGS = ['problem', 'idea', 'question'];
const MAX_IMAGE = 900 * 1024;

function createSupport({ db, fail }) {
  const ready = db.q(SCHEMA).catch((e) => { console.error('[help] tables', e.message); });
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const first = (name) => (clean(name, 40).split(/\s+/)[0] || 'there');

  async function welcomeText(app) {
    const r = await db.q('SELECT value FROM help_settings WHERE key = $1', ['welcome_' + app]);
    return r.rowCount ? r.rows[0].value : DEFAULT_WELCOME[app];
  }

  // Find (or start) this person's conversation. A new conversation gets the welcome message.
  async function open(app, person, placeId, placeName, name) {
    await ready;
    if (!TEAM[app] || !person) fail(400, 'bad_request', 'Bad request.');
    const r = await db.q(`INSERT INTO help_threads (app, person, place_id, place_name, name) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (app, person) DO UPDATE SET place_id = EXCLUDED.place_id, place_name = EXCLUDED.place_name, name = EXCLUDED.name
      RETURNING id, user_unread, (xmax = 0) AS created`, [app, String(person), String(placeId), clean(placeName, 80), clean(name, 40)]);
    const t = r.rows[0];
    if (t.created) {
      const text = (await welcomeText(app)).replace(/\{name\}/g, first(name));
      await db.q('INSERT INTO help_messages (thread_id, from_team, auto, body) VALUES ($1, true, true, $2)', [t.id, text]);
      await db.q('UPDATE help_threads SET user_unread = 1 WHERE id = $1', [t.id]);
      t.user_unread = 1;
    }
    return { id: t.id, unread: t.user_unread };
  }

  const msgOut = (m, app) => ({ id: Number(m.id), team: m.from_team, auto: m.auto, by: m.from_team ? TEAM[app] : '', tag: m.tag, body: m.body, image: m.image || null, at: m.created_at });
  async function messages(threadId, app) {
    const r = await db.q('SELECT * FROM help_messages WHERE thread_id = $1 ORDER BY id DESC LIMIT 200', [threadId]);
    return r.rows.reverse().map((m) => msgOut(m, app));
  }

  // What the person sees: their whole conversation.
  async function forUser(app, person, placeId, placeName, name) {
    const t = await open(app, person, placeId, placeName, name);
    return { unread: t.unread, team: TEAM[app], messages: await messages(t.id, app) };
  }
  async function userSend(app, person, placeId, placeName, name, body) {
    const t = await open(app, person, placeId, placeName, name);
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
    await db.q('UPDATE help_threads SET user_unread = 0 WHERE app = $1 AND person = $2', [app, String(person)]);
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
  async function getWelcome() { return { home: await welcomeText('home'), trip: await welcomeText('trip') }; }
  async function setWelcome(app, text) {
    if (!TEAM[app]) fail(400, 'bad_request', 'Bad request.');
    const v = clean(text, 2000);
    if (!v) await db.q('DELETE FROM help_settings WHERE key = $1', ['welcome_' + app]); // empty = back to the default text
    else await db.q('INSERT INTO help_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', ['welcome_' + app, v]);
    return getWelcome();
  }

  // Kalendaryo's routes (people in a home) and the owner page's routes.
  function install(r, { auth, helpJson, json, ownerGuard, send }) {
    const homeArgs = (req) => ['home', req.me.id, req.me.family_id, req.me.family_name, req.me.name];
    const noOwnerView = (req) => { if (req.me.viewing) fail(403, 'read_only', 'Help & ideas is for the people in this home.'); };
    r.get('/api/help', auth, async (req, res) => { noOwnerView(req); send(res, 200, await forUser(...homeArgs(req))); });
    r.get('/api/help/unread', auth, async (req, res) => { if (req.me.viewing) return send(res, 200, { unread: 0 }); const t = await open(...homeArgs(req)); send(res, 200, { unread: t.unread }); });
    r.post('/api/help', auth, helpJson, async (req, res) => { noOwnerView(req); send(res, 200, await userSend(...homeArgs(req), req.body)); });
    r.post('/api/help/seen', auth, async (req, res) => { noOwnerView(req); send(res, 200, await userSeen('home', req.me.id)); });

    r.get('/api/owner/help', async (req, res) => { ownerGuard(req); send(res, 200, Object.assign(await inbox(req.query.filter), { welcome: await getWelcome() })); });
    r.get('/api/owner/help/:id', async (req, res) => { ownerGuard(req); send(res, 200, await ownerThread(Number(req.params.id) || 0)); });
    r.post('/api/owner/help/:id/reply', json, async (req, res) => { ownerGuard(req); send(res, 200, await ownerReply(Number(req.params.id) || 0, req.body && req.body.body)); });
    r.post('/api/owner/help/:id/status', json, async (req, res) => { ownerGuard(req); send(res, 200, await ownerStatus(Number(req.params.id) || 0, req.body && req.body.status)); });
    r.post('/api/owner/help-welcome', json, async (req, res) => { ownerGuard(req); send(res, 200, await setWelcome(req.body && req.body.app, req.body && req.body.text)); });
  }

  // For Triply (see triply/server/routes/help.js).
  const forTrip = {
    get: (m, trip) => forUser('trip', m.id, trip.id, trip.name, m.name),
    unread: async (m, trip) => ({ unread: (await open('trip', m.id, trip.id, trip.name, m.name)).unread }),
    send: (m, trip, body) => userSend('trip', m.id, trip.id, trip.name, m.name, body),
    seen: (m) => userSeen('trip', m.id)
  };

  return { install, forTrip, open, inbox, ownerThread, ownerReply, ownerStatus, getWelcome, setWelcome, DEFAULT_WELCOME };
}

module.exports = { createSupport };
