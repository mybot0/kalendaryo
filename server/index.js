/*
 * Kalendaryo web server.
 *   - Every family has its own space. People get in with a personal link (/c/<token>).
 *   - Owners make invite links (/join/<code>) with a role: viewer, editor or owner.
 *   - The family's data is saved as documents (calendar, chores, meals…) and sent live to open pages.
 * Settings (environment variables):
 *   DATABASE_URL        Postgres connection string (required)
 *   PORT                port to listen on (Render sets it)
 *   ANTHROPIC_API_KEY   optional, turns on AI ideas
 *   ANTHROPIC_MODEL     optional, default claude-haiku-5-5
 *   AI_DAILY_LIMIT      optional, AI requests per family per day (default 20)
 *   AI_DAILY_USD        optional, most the whole site spends on AI per day, in US$ (default 1; 0 = AI off).
 *                       Triply has its own: TRIPLY_AI_DAILY_USD (default 1)
 *   INVITE_DAYS         optional, days before an invite link expires (default 7)
 *   OWNER_KEY           optional, turns on the owner view at /owner?key=<OWNER_KEY>
 *   HOLIDAYS_API        optional, the public holiday list (default https://date.nager.at/api/v3)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const db = require('./db');
const live = require('./live');
const ai = require('./ai');
const { router, jsonBody, rawBody, send, HttpError } = require('./mini');

/* ---------- helpers ---------- */
const rand = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const hexId = () => crypto.randomBytes(12).toString('hex');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const ROLES = ['viewer', 'editor', 'owner'];
const RANK = { viewer: 0, editor: 1, owner: 2 };
const COLLS = new Set(['settings', 'members', 'events', 'chores', 'completions', 'routines', 'rlogs', 'rewards', 'redemptions', 'lists', 'listitems', 'recipes', 'meals', 'countdowns', 'photos', 'holidays', 'notes', 'meds', 'doses', 'carelog']);
const ID_RE = /^[A-Za-z0-9_~.\-]{1,120}$/;
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const INVITE_DAYS = () => Math.min(90, Math.max(1, parseInt(process.env.INVITE_DAYS || '7', 10) || 7));
const MAX_PHOTOS = 500;
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const ipOf = (req) => (process.env.TRUST_PROXY === '0' ? '' : String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';

// Small in-memory rate limiter (per IP), enough for one server.
const hits = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(k); }, 600000).unref();

const SECURITY = {
  'Referrer-Policy': 'no-referrer', // links carry keys; never leak them to other sites
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' blob: data: https://images.unsplash.com", "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com",
    "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'"].join('; ')
};

/* ---------- family profiles (members docs) linked to people's links ---------- */
const PALETTE = ['#F4A59A', '#A8CDEA', '#B4D9AA', '#F6C28E', '#C7B7EA', '#9ED8C6', '#EFB2CB', '#F1DC8B'];
const isKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
async function getMember(c, familyId, id) {
  if (!id || !ID_RE.test(id)) return null;
  const q = await c.query("SELECT data FROM docs WHERE family_id=$1 AND col='members' AND id=$2", [familyId, id]);
  return q.rows[0] ? q.rows[0].data : null;
}
// Make a new family profile. Returns [id, data].
async function newMember(c, familyId, name, role) {
  const n = Number((await c.query("SELECT count(*) FROM docs WHERE family_id=$1 AND col='members'", [familyId])).rows[0].count);
  const id = hexId(), data = { name: clean(name, 30) || 'Family member', role: role || 'other', avatar: '', color: PALETTE[n % PALETTE.length], birthday: '' };
  await c.query("INSERT INTO docs (family_id, col, id, data) VALUES ($1, 'members', $2, $3)", [familyId, id, JSON.stringify(data)]);
  return [id, data];
}
const dbc = { query: (t, p) => db.q(t, p) }; // the same shape as a transaction client
const profileView = (m) => (m ? { name: m.name || '', avatar: m.avatar || '', color: m.color || '', birthday: m.birthday || '' } : null);

/* ---------- who is asking ---------- */
async function auth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.t || '');
  const viewing = token && token.startsWith('ov') ? await owner.viewer(token, req) : null; // the site owner viewing, read-only
  if (viewing) { req.me = viewing; return; }
  if (care.isCareToken(token)) { // a Care board link: only its own person's Care board (server/care.js)
    req.me = await care.who(token);
    if (!care.allowed(req)) fail(403, 'read_only', 'The Care board cannot do that.');
    return;
  }
  if (!token || token.length > 100) fail(401, 'no_access', 'This link is not valid.');
  const r = await db.q('SELECT a.id, a.family_id, a.name, a.role, a.last_seen, a.member_id, a.theme, f.name AS family_name FROM access a JOIN families f ON f.id = a.family_id WHERE a.token_hash = $1', [hash(token)]);
  if (!r.rowCount) fail(401, 'no_access', 'This link is not valid anymore. Ask an owner of the hub for a new invite.');
  req.me = r.rows[0];
  owner.noteUse(req, 'home', req.me.family_id);
  if (!req.me.last_seen || Date.now() - new Date(req.me.last_seen).getTime() > 3600000) db.q('UPDATE access SET last_seen = now() WHERE id=$1', [req.me.id]).catch(() => {});
}
// careOk: a Care board link may also use this route (its own rules are checked in save/delete).
const need = (role, careOk) => async (req) => {
  if (req.me.care) { if (careOk) return; fail(403, 'read_only', 'The Care board cannot do that.'); }
  if (!(RANK[req.me.role] >= RANK[role])) fail(403, 'read_only', role === 'owner' ? 'Only an owner of this hub can do that.' : 'You can only view this hub. Ask an owner to make you an Editor.');
};
const json = jsonBody(200 * 1024);
const r = router();
const care = require('./care')({ db, live, fail, send, json, clean, auth, need, hexId });

/* ---------- create a family ---------- */
// The home's time zone, from the browser of the person who starts it (they can change it in Settings).
function zoneOf(z) {
  if (typeof z !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(z) || z.length > 64) return {};
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return { timeZone: z }; } catch (e) { return {}; }
}
// The city picked when the hub is made: { name, lat, lon, tz }. Sets the hub's time zone and the weather place.
function placeOf(p) {
  if (!p || typeof p !== 'object') return null;
  const name = clean(p.name, 80), lat = Number(p.lat), lon = Number(p.lon);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
}
r.post('/api/families', json, async (req, res) => {
  if (!limit('create:' + ipOf(req), 10, 3600000)) fail(429, 'rate_limited', 'Too many new hubs from here. Please try again later.');
  const familyName = clean(req.body.familyName, 40) || 'Our hub';
  const yourName = clean(req.body.yourName, 30);
  if (!yourName) fail(400, 'bad_request', 'Please type your name.');
  const familyId = hexId(), accessId = hexId(), token = rand(24);
  await db.tx(async (c) => {
    await c.query('INSERT INTO families (id, name) VALUES ($1, $2)', [familyId, familyName]);
    await c.query("INSERT INTO docs (family_id, col, id, data) VALUES ($1, 'settings', 'main', $2)", [familyId, JSON.stringify(Object.assign({ householdName: familyName }, zoneOf(req.body.timeZone), placeOf(req.body.place) ? { weatherPlace: placeOf(req.body.place) } : {}))]);
    const [memberId] = await newMember(c, familyId, yourName, 'parent'); // the person who starts the home is in the family right away
    await c.query('INSERT INTO access (id, family_id, token_hash, name, role, last_seen, member_id) VALUES ($1,$2,$3,$4,$5, now(), $6)', [accessId, familyId, hash(token), yourName, 'owner', memberId]);
  });
  send(res, 200, { token });
});

/* ---------- invites: look and join (no link needed) ---------- */
r.get('/api/invites/peek/:code', async (req, res) => {
  if (!limit('peek:' + ipOf(req), 60, 600000)) fail(429, 'rate_limited', 'Too many tries. Please wait a little.');
  const code = req.params.code;
  const q = code.length <= 100 ? await db.q('SELECT i.*, f.name AS family_name FROM invites i JOIN families f ON f.id = i.family_id WHERE i.code_hash = $1', [hash(code)]) : { rows: [] };
  const inv = q.rows[0];
  if (!inv) return send(res, 200, { valid: false, reason: 'This invite link is not valid. Ask for a new one.' });
  if (inv.used_at) return send(res, 200, { valid: false, reason: 'This invite link was already used. Ask for a new one.' });
  if (new Date(inv.expires_at) < new Date()) return send(res, 200, { valid: false, reason: 'This invite link has expired. Ask for a new one.' });
  const member = profileView(await getMember(dbc, inv.family_id, inv.member_id));
  const by = inv.created_by ? (await db.q('SELECT name FROM access WHERE id=$1', [inv.created_by])).rows[0] : null;
  send(res, 200, { valid: true, familyName: inv.family_name, role: inv.role, member, by: by ? by.name : '' });
});
r.post('/api/join', json, async (req, res) => {
  if (!limit('join:' + ipOf(req), 30, 600000)) fail(429, 'rate_limited', 'Too many tries. Please wait a little.');
  const typed = clean(req.body.name, 30);
  const token = rand(24), accessId = hexId();
  let made = null;
  const inv = await db.tx(async (c) => {
    // Lock the invite so one link is used only once, even if two people press Join at the same time.
    const q = await c.query('SELECT * FROM invites WHERE code_hash = $1 FOR UPDATE', [hash(clean(req.body.code, 100))]);
    const i = q.rows[0];
    if (!i || i.used_at || new Date(i.expires_at) < new Date()) return null;
    // An invite made for a family member links to that profile; otherwise a new profile is made for the new person.
    let memberId = null, name = typed;
    const m = await getMember(c, i.family_id, i.member_id);
    if (m) { memberId = i.member_id; name = clean(m.name, 30) || typed; }
    if (!name) return 'name';
    if (!memberId) { const [id, data] = await newMember(c, i.family_id, name, 'other'); memberId = id; made = { id, data, family: i.family_id }; }
    await c.query('INSERT INTO access (id, family_id, token_hash, name, role, last_seen, member_id) VALUES ($1,$2,$3,$4,$5, now(), $6)', [accessId, i.family_id, hash(token), name, i.role, memberId]);
    await c.query('UPDATE invites SET used_at = now(), used_by = $1, code_keep = NULL WHERE id = $2', [accessId, i.id]);
    return i;
  });
  if (inv === 'name') fail(400, 'bad_request', 'Please type your name.');
  if (!inv) fail(410, 'invite_gone', 'This invite link cannot be used anymore. Ask for a new one.');
  if (made) live.send(made.family, 'doc', { col: 'members', id: made.id, data: made.data });
  live.send(inv.family_id, 'people', {});
  send(res, 200, { token });
});

/* ---------- everything below needs a personal link ---------- */
r.get('/api/me', auth, async (req, res) => {
  if (req.me.care) return send(res, 200, { me: { id: req.me.id, name: req.me.name, role: 'care', care: true, viewing: false, memberId: req.me.member_id }, family: { id: req.me.family_id, name: req.me.family_name }, ai: { enabled: false, left: 0 } });
  send(res, 200, { me: { id: req.me.id, name: req.me.name, role: req.me.role, viewing: !!req.me.viewing, memberId: req.me.member_id || null, theme: req.me.theme || null }, family: { id: req.me.family_id, name: req.me.family_name },
    ai: { enabled: ai.enabled(), left: await ai.left(req.me.family_id) } });
});
// Light / dark / auto, saved to the person so it follows them on every device.
r.patch('/api/me/theme', auth, json, async (req, res) => {
  if (req.me.viewing) fail(403, 'read_only', 'Viewing only.');
  const t = ['light', 'dark', 'auto'].includes(req.body.theme) ? req.body.theme : 'light';
  await db.q('UPDATE access SET theme=$1 WHERE id=$2', [t, req.me.id]);
  send(res, 200, { ok: true, theme: t });
});
r.patch('/api/me', auth, json, async (req, res) => {
  if (req.me.viewing) fail(403, 'read_only', 'Viewing only.');
  const name = clean(req.body.name, 30);
  if (!name) fail(400, 'bad_request', 'Please type your name.');
  await db.q('UPDATE access SET name=$1 WHERE id=$2', [name, req.me.id]);
  live.send(req.me.family_id, 'people', {});
  send(res, 200, { ok: true });
});
// "Which one are you?" — link my link to a family profile, or make a new one for me.
r.post('/api/me/member', auth, json, async (req, res) => {
  if (req.me.viewing) fail(403, 'read_only', 'Viewing only.');
  let made = null;
  const msg = await db.tx(async (c) => {
    let id = req.body.memberId ? clean(req.body.memberId, 120) : '';
    if (id) {
      if (!(await getMember(c, req.me.family_id, id))) return 'That person is not in this hub.';
      const taken = await c.query('SELECT 1 FROM access WHERE family_id=$1 AND member_id=$2 AND id<>$3', [req.me.family_id, id, req.me.id]);
      if (taken.rowCount) return 'Someone else is already linked to that name.';
    } else { const [nid, data] = await newMember(c, req.me.family_id, req.me.name, 'other'); id = nid; made = { id: nid, data }; }
    await c.query('UPDATE access SET member_id=$1 WHERE id=$2', [id, req.me.id]);
    return '';
  });
  if (msg) fail(400, 'bad_request', msg);
  if (made) live.send(req.me.family_id, 'doc', { col: 'members', id: made.id, data: made.data });
  live.send(req.me.family_id, 'people', {});
  send(res, 200, { ok: true });
});
// "That's you": anyone (viewers too) may set their OWN color, icon and birthday.
r.put('/api/me/profile', auth, json, async (req, res) => {
  if (req.me.viewing) fail(403, 'read_only', 'Viewing only.');
  const b = req.body || {};
  const data = await db.tx(async (c) => {
    const m = await getMember(c, req.me.family_id, req.me.member_id);
    if (!m) return null;
    const next = Object.assign({}, m);
    if (b.name !== undefined && clean(b.name, 30)) next.name = clean(b.name, 30);
    if (b.avatar !== undefined) next.avatar = clean(b.avatar, 8);
    if (b.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(b.color)) next.color = b.color;
    if (b.birthday !== undefined) next.birthday = isKey(b.birthday) ? b.birthday : '';
    await c.query("UPDATE docs SET data=$1, updated_at=now() WHERE family_id=$2 AND col='members' AND id=$3", [JSON.stringify(next), req.me.family_id, req.me.member_id]);
    if (next.name !== m.name) await c.query('UPDATE access SET name=$1 WHERE id=$2', [next.name, req.me.id]);
    return next;
  });
  if (!data) fail(400, 'bad_request', 'Your link is not linked to a person in the hub yet.');
  live.send(req.me.family_id, 'doc', { col: 'members', id: req.me.member_id, data });
  live.send(req.me.family_id, 'people', {});
  send(res, 200, { ok: true });
});

/* people with access */
r.get('/api/people', auth, async (req, res) => {
  const q = await db.q('SELECT id, name, role, created_at, last_seen, member_id FROM access WHERE family_id=$1 ORDER BY created_at', [req.me.family_id]);
  send(res, 200, { people: q.rows.map((p) => Object.assign(p, { isMe: p.id === req.me.id })) });
});
async function ownerCount(c, familyId) { return Number((await c.query("SELECT count(*) FROM access WHERE family_id=$1 AND role='owner'", [familyId])).rows[0].count); }
async function lockPerson(c, req) {
  await c.query("SELECT id FROM access WHERE family_id=$1 AND role='owner' FOR UPDATE", [req.me.family_id]); // stop two owners demoting each other at once
  const q = await c.query('SELECT id, role FROM access WHERE id=$1 AND family_id=$2 FOR UPDATE', [req.params.id, req.me.family_id]);
  return q.rows[0] || null;
}
r.patch('/api/people/:id', auth, json, need('owner'), async (req, res) => {
  const role = req.body.role;
  if (!ROLES.includes(role)) fail(400, 'bad_request', 'Pick viewer, editor or owner.');
  const msg = await db.tx(async (c) => {
    const p = await lockPerson(c, req);
    if (!p) return 'That person is not in this hub.';
    if (p.role === 'owner' && role !== 'owner' && (await ownerCount(c, req.me.family_id)) <= 1) return 'A hub needs at least one owner. Make someone else an owner first.';
    await c.query('UPDATE access SET role=$1 WHERE id=$2', [role, p.id]);
    return '';
  });
  if (msg) fail(400, 'bad_request', msg);
  live.send(req.me.family_id, 'people', {});
  live.send(req.me.family_id, 'me', {}, req.params.id);
  send(res, 200, { ok: true });
});
r.delete('/api/people/:id', auth, async (req, res) => {
  const self = req.params.id === req.me.id; // anyone may leave; only owners remove others
  if (!self && req.me.role !== 'owner') fail(403, 'read_only', 'Only an owner of this hub can do that.');
  const msg = await db.tx(async (c) => {
    const p = await lockPerson(c, req);
    if (!p) return 'That person is not in this hub.';
    if (p.role === 'owner' && (await ownerCount(c, req.me.family_id)) <= 1) return 'A hub needs at least one owner. Make someone else an owner first.';
    await c.query('DELETE FROM access WHERE id=$1', [p.id]);
    return '';
  });
  if (msg) fail(400, 'bad_request', msg);
  live.kick(req.me.family_id, req.params.id);
  live.send(req.me.family_id, 'people', {});
  send(res, 200, { ok: true });
});

/* invites (owners) */
r.get('/api/invites', auth, need('owner'), async (req, res) => {
  const q = await db.q('SELECT id, role, label, created_at, expires_at, member_id, (code_keep IS NOT NULL) AS kept FROM invites WHERE family_id=$1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC', [req.me.family_id]);
  send(res, 200, { invites: q.rows });
});
r.post('/api/invites', auth, json, need('owner'), async (req, res) => {
  const role = req.body.role;
  if (!ROLES.includes(role)) fail(400, 'bad_request', 'Pick viewer, editor or owner.');
  const n = Number((await db.q('SELECT count(*) FROM invites WHERE family_id=$1 AND used_at IS NULL AND expires_at > now()', [req.me.family_id])).rows[0].count);
  if (n >= 50) fail(400, 'bad_request', 'There are too many open invites. Cancel some first.');
  const code = rand(18);
  let memberId = null, label = clean(req.body.label, 40);
  if (req.body.memberId) {
    const m = await getMember(dbc, req.me.family_id, clean(req.body.memberId, 120));
    if (!m) fail(400, 'bad_request', 'That person is not in this hub anymore.');
    memberId = clean(req.body.memberId, 120);
    label = label || clean(m.name, 40);
  }
  await db.q('INSERT INTO invites (id, family_id, code_hash, role, label, created_by, expires_at, member_id) VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(days => $7), $8)',
    [hexId(), req.me.family_id, hash(code), role, label, req.me.id, INVITE_DAYS(), memberId]);
  send(res, 200, { code, days: INVITE_DAYS() });
});
// "Copy link" for someone in the hub who has not joined yet. The same link is given every time until they
// join (it is kept locked with a server key, never in plain text). If it expired, a new one is made.
const KEEP_DAYS = () => Math.max(30, INVITE_DAYS());
const keepKey = () => crypto.createHash('sha256').update('kal-invite-keep:' + (process.env.OWNER_KEY || process.env.DATABASE_URL || 'kal')).digest();
function lock(code) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keepKey(), iv);
  const out = Buffer.concat([c.update(code, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), out].map((b) => b.toString('base64url')).join('.');
}
function unlock(box) {
  try {
    const [iv, tag, data] = String(box).split('.').map((x) => Buffer.from(x, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', keepKey(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch (e) { return null; }
}
r.post('/api/invites/member', auth, json, need('owner'), async (req, res) => {
  const memberId = clean(req.body.memberId, 120);
  const m = await getMember(dbc, req.me.family_id, memberId);
  if (!m) fail(400, 'bad_request', 'That person is not in this hub anymore.');
  if (m.role === 'pet') fail(400, 'bad_request', 'Pets do not need a link.');
  const joined = await db.q('SELECT 1 FROM access WHERE family_id=$1 AND member_id=$2', [req.me.family_id, memberId]);
  if (joined.rowCount) fail(400, 'bad_request', (m.name || 'They') + ' already joined.');
  const role = ['viewer', 'editor', 'owner'].includes(req.body.role) ? req.body.role : (['viewer', 'editor'].includes(m.access) ? m.access : 'viewer');
  const open = await db.q('SELECT id, role, code_keep FROM invites WHERE family_id=$1 AND member_id=$2 AND used_at IS NULL AND expires_at > now() AND code_keep IS NOT NULL ORDER BY created_at DESC LIMIT 1', [req.me.family_id, memberId]);
  const kept = open.rows[0] && unlock(open.rows[0].code_keep);
  if (kept && open.rows[0].role === role) return send(res, 200, { code: kept, role });
  if (open.rows[0]) await db.q('DELETE FROM invites WHERE id=$1', [open.rows[0].id]); // the role changed: the old link stops, a new one is made
  const n = Number((await db.q('SELECT count(*) FROM invites WHERE family_id=$1 AND used_at IS NULL AND expires_at > now()', [req.me.family_id])).rows[0].count);
  if (n >= 50) fail(400, 'bad_request', 'There are too many open invites. Cancel some first.');
  const code = rand(18);
  await db.q('INSERT INTO invites (id, family_id, code_hash, role, label, created_by, expires_at, member_id, code_keep) VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(days => $7), $8, $9)',
    [hexId(), req.me.family_id, hash(code), role, clean(m.name, 40), req.me.id, KEEP_DAYS(), memberId, lock(code)]);
  send(res, 200, { code, role });
});
r.delete('/api/invites/:id', auth, need('owner'), async (req, res) => {
  await db.q('DELETE FROM invites WHERE id=$1 AND family_id=$2', [req.params.id, req.me.family_id]);
  send(res, 200, { ok: true });
});

/* delete the whole family (owners) */
r.delete('/api/family', auth, json, need('owner'), async (req, res) => {
  if (clean(req.body.confirm, 40) !== 'DELETE') fail(400, 'bad_request', 'Type DELETE to confirm.');
  await db.q('DELETE FROM families WHERE id=$1', [req.me.family_id]);
  live.closeFamily(req.me.family_id);
  send(res, 200, { ok: true });
});

/* ---------- the family's documents ---------- */
r.get('/api/state', auth, async (req, res) => {
  const q = await db.q('SELECT col, id, data FROM docs WHERE family_id=$1', [req.me.family_id]);
  const docs = {};
  for (const row of q.rows) (docs[row.col] = docs[row.col] || []).push({ id: row.id, data: row.data });
  send(res, 200, { docs: req.me.care ? care.filterState(req.me, docs) : docs });
});
function checkDoc(req) {
  if (!COLLS.has(req.params.col)) fail(400, 'bad_request', 'Unknown kind of item.');
  if (req.params.id !== undefined && !ID_RE.test(req.params.id)) fail(400, 'bad_request', 'Bad item id.');
}
const quotaCache = new Map();
async function withinQuota(familyId) {
  const c = quotaCache.get(familyId);
  if (c && Date.now() - c.at < 60000) return c.ok;
  const ok = Number((await db.q('SELECT count(*) FROM docs WHERE family_id=$1', [familyId])).rows[0].count) < 50000;
  quotaCache.set(familyId, { at: Date.now(), ok });
  return ok;
}
async function save(req, res, id) {
  checkDoc(req);
  let data = req.body && req.body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'bad_request', 'Nothing to save.');
  if (req.me.care) data = await care.checkWrite(req, id, data);
  if (!(await withinQuota(req.me.family_id))) fail(400, 'quota_exceeded', 'This hub has too many items saved. Delete some old items and try again.');
  await db.q(`INSERT INTO docs (family_id, col, id, data, updated_at) VALUES ($1,$2,$3,$4, now())
              ON CONFLICT (family_id, col, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [req.me.family_id, req.params.col, id, JSON.stringify(data)]);
  live.send(req.me.family_id, 'doc', { col: req.params.col, id, data });
  send(res, 200, { id });
}
r.post('/api/docs/:col', auth, json, need('editor', true), (req, res) => save(req, res, hexId()));
r.put('/api/docs/:col/:id', auth, json, need('editor', true), (req, res) => save(req, res, req.params.id));
r.delete('/api/docs/:col/:id', auth, need('editor', true), async (req, res) => {
  checkDoc(req);
  if (req.me.care) await care.checkDelete(req);
  await db.q('DELETE FROM docs WHERE family_id=$1 AND col=$2 AND id=$3', [req.me.family_id, req.params.col, req.params.id]);
  live.send(req.me.family_id, 'doc', { col: req.params.col, id: req.params.id, data: null });
  send(res, 200, { ok: true });
});

/* ---------- live updates ---------- */
r.get('/api/stream', auth, async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res._kalStream = true;
  res.write('retry: 3000\nevent: hello\ndata: {}\n\n');
  const leave = live.join(req.me.family_id, req.me.id, res, req.me.care ? care.streamFilter(req.me.member_id) : undefined);
  req.on('close', leave);
});

/* ---------- photos ---------- */
r.post('/api/blobs', auth, need('editor'), rawBody(4 * 1024 * 1024), async (req, res) => {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type) || !req.body.length) fail(400, 'bad_request', 'Please pick a photo (JPEG, PNG, WebP or GIF).');
  const n = Number((await db.q('SELECT count(*) FROM blobs WHERE family_id=$1', [req.me.family_id])).rows[0].count);
  if (n >= MAX_PHOTOS) fail(400, 'quota_exceeded', 'This hub has the most photos it can keep (' + MAX_PHOTOS + '). Remove some first.');
  const id = hexId();
  await db.q('INSERT INTO blobs (id, family_id, content_type, size, bytes) VALUES ($1,$2,$3,$4,$5)', [id, req.me.family_id, type, req.body.length, req.body]);
  send(res, 200, { id, url: '/api/blobs/' + id, sizeBytes: req.body.length, contentType: type });
});
r.get('/api/blobs/:id', auth, async (req, res) => {
  const q = /^[0-9a-f]{24}$/.test(req.params.id) ? await db.q('SELECT content_type, bytes FROM blobs WHERE id=$1 AND family_id=$2', [req.params.id, req.me.family_id]) : { rowCount: 0 };
  if (!q.rowCount) fail(404, 'not_found', 'Not found.');
  res.writeHead(200, { 'Content-Type': q.rows[0].content_type, 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Length': q.rows[0].bytes.length });
  res.end(q.rows[0].bytes);
});
r.delete('/api/blobs/:id', auth, need('editor'), async (req, res) => {
  await db.q('DELETE FROM blobs WHERE id=$1 AND family_id=$2', [req.params.id, req.me.family_id]);
  send(res, 200, { ok: true });
});

/* ---------- AI ---------- */
r.post('/api/ai', auth, json, need('editor'), async (req, res) => {
  if (!ai.enabled()) fail(503, 'unavailable', 'AI ideas are not turned on for this site.');
  const prompt = clean(req.body.prompt, 6000);
  if (!prompt) fail(400, 'bad_request', 'Nothing to ask.');
  if (!(await ai.take(req.me.family_id))) fail(429, 'daily_limit', 'Your hub used all of today’s AI ideas. Try again tomorrow.');
  const day = await ai.reserve();
  if (!day) { await ai.giveBack(req.me.family_id); fail(429, 'ai_resting', 'AI help is resting until tomorrow. Lots of hubs used it today. You can still do everything by hand.'); }
  let text, usd = 0.0005;
  try { const r = await ai.ask(prompt); text = r.text; usd = r.usd; }
  catch (e) {
    await ai.giveBack(req.me.family_id);
    console.error('ai', e.message);
    if (e.code === 'rate_limited') fail(429, 'rate_limited', 'The AI is busy. Please try again in a minute.');
    fail(502, 'ai_failed', 'Could not get ideas right now. Please try again.');
  } finally { await ai.settle(day, usd); }
  send(res, 200, { text, left: await ai.left(req.me.family_id) });
});

/* ---------- public holidays (from the free list at date.nager.at, kept for a day) ---------- */
const HOLIDAYS_API = () => (process.env.HOLIDAYS_API || 'https://date.nager.at/api/v3').replace(/\/$/, '');
const holidayCache = new Map();
async function holidayList(p) {
  const c = holidayCache.get(p);
  if (c && Date.now() - c.at < 86400000) return c.data;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  let r;
  try { r = await fetch(HOLIDAYS_API() + p, { signal: ctl.signal, headers: { Accept: 'application/json' } }); }
  catch (e) { fail(502, 'holidays_down', 'Could not reach the holiday list. Please try again.'); }
  finally { clearTimeout(t); }
  let data = null;
  if (r.status === 200) { try { data = await r.json(); } catch (e) { data = null; } }
  else if (r.status >= 500) fail(502, 'holidays_down', 'The holiday list is not answering. Please try again.');
  if (holidayCache.size > 500) holidayCache.clear();
  holidayCache.set(p, { at: Date.now(), data });
  return data;
}
r.get('/api/holidays/countries', async (req, res) => {
  const list = await holidayList('/AvailableCountries');
  send(res, 200, { countries: (Array.isArray(list) ? list : []).map((c) => ({ code: clean(c.countryCode, 2), name: clean(c.name, 60) })) });
});
r.get('/api/holidays/:year/:cc', async (req, res) => { // no link needed: public dates only (the demo home uses it too)
  const year = parseInt(req.params.year, 10);
  if (!(year >= 2000 && year <= 2100) || !/^[A-Z]{2}$/.test(req.params.cc)) fail(400, 'bad_request', 'Pick a country and a year.');
  if (!limit('hol:' + ipOf(req), 120, 3600000)) fail(429, 'rate_limited', 'Too many tries. Please wait a little.');
  const list = await holidayList('/PublicHolidays/' + year + '/' + req.params.cc);
  if (!Array.isArray(list) || !list.length) fail(404, 'not_found', 'This place is not on the public holiday list.');
  send(res, 200, { holidays: list.map((x) => ({ date: clean(x.date, 10), name: clean(x.name, 80), localName: clean(x.localName, 80), global: x.global !== false,
    counties: Array.isArray(x.counties) ? x.counties.map((c) => clean(c, 10)) : null, types: Array.isArray(x.types) ? x.types.map((c) => clean(c, 20)) : [] })) });
});

/* ---------- Triply (test only; see triply/INTEGRATION.md) ---------- */
// TOUCH POINT A (server). Off unless TRIPLY_ENABLED is 1/true/on/yes. When off, Triply's code is never loaded.
const TRIPLY_ON = /^(1|true|on|yes)$/i.test(String(process.env.TRIPLY_ENABLED || '').trim());
const triply = TRIPLY_ON ? require('../triply/server/handler').createTriply({
  basePath: '/triply',
  databaseUrl: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === '1' || (process.env.PGSSL !== '0' && /render\.com/.test(process.env.DATABASE_URL || '')), // same rule as server/db.js
  maxTripMb: Number(process.env.TRIPLY_MAX_TRIP_MB) || 20, // low while testing: shares the 1 GB database
  maxBlobMb: Number(process.env.TRIPLY_MAX_FILE_MB) || 5,
  ownerView: (token) => owner.tripViewer(token), // the owner page's read-only trip links
  headExtra: '<script src="/hi.js" defer></script>', // owner view: real-person check (server/owner.js)
  support: () => support.forTrip                  // Help & ideas chat (server/support.js)
}) : null;

/* ---------- owner view (see server/owner.js) ---------- */
const owner = require('./owner').createOwner({ db, live, ipOf, fail, triplySchema: triply ? (process.env.TRIPLY_SCHEMA || 'triply') : null });
owner.install(r, json, send);

/* ---------- Help & ideas (see server/support.js) ---------- */
const ownerGuard = (req) => { if (!owner.isOwnerKey(req.headers['x-owner-key'])) fail(404, 'not_found', 'Not found.'); };
/* Owner alerts: a phone notification when someone writes (server/ownerpush.js). */
const ownerPush = require('./ownerpush').createOwnerPush({ db });
ownerPush.install(r, { json, send, ownerGuard });
const TAG_ICON = { problem: '🐞 ', idea: '💡 ', question: '❓ ' };
const alerted = new Map(); // thread -> last alert time: at most one alert per chat per minute, so a burst of messages buzzes once
setInterval(() => { const old = Date.now() - 60000; for (const [k, t] of alerted) if (t < old) alerted.delete(k); }, 600000).unref();
const support = require('./support').createSupport({ db, fail, onUserMessage: (m) => {
  if (Date.now() - (alerted.get(m.threadId) || 0) < 60000) return;
  alerted.set(m.threadId, Date.now());
  const text = Array.from(m.text || ''); // whole characters, so an emoji is never cut in half
  return ownerPush.notify({
    title: (m.name || 'Someone') + ' · ' + (m.app === 'trip' ? 'Triply' : 'Kalendaryo') + (m.place ? ' · ' + m.place : ''),
    body: (TAG_ICON[m.tag] || '') + (text.length ? text.slice(0, 140).join('') + (text.length > 140 ? '…' : '') : '📎 Sent a screenshot'),
    url: '/owner#t=' + m.threadId, tag: 'thread-' + m.threadId });
} });
support.install(r, { auth, json, send, helpJson: jsonBody(1200 * 1024), ownerGuard });
const OWNER_PAGE = path.join(__dirname, '..', 'public', 'owner.html');
// The owner page's service worker (alerts) and Home Screen app files. No key needed: they hold nothing private.
const OWNER_SW = `self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Kalendaryo', { body: d.body || '', tag: d.tag || 'kal', renotify: true, icon: '/owner-icons/192.png', badge: '/owner-icons/192.png', data: { url: d.url || '/owner' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/owner';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => new URL(c.url).pathname === '/owner');
    if (w) { w.postMessage({ open: url }); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
`;
r.get('/owner-sw.js', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/owner' });
  res.end(req.method === 'HEAD' ? undefined : OWNER_SW);
});
const OWNER_MANIFEST = JSON.stringify({ name: 'Kalendaryo Owner', short_name: 'Owner', start_url: '/owner', scope: '/owner', display: 'standalone',
  background_color: '#F4F3EE', theme_color: '#3F7360', icons: [192, 512].map((n) => ({ src: '/owner-icons/' + n + '.png', sizes: n + 'x' + n, type: 'image/png' })) });
r.get('/owner.webmanifest', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : OWNER_MANIFEST);
});
r.get('/owner-icons/:size', async (req, res) => {
  const m = /^(180|192|512)\.png$/.exec(req.params.size);
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(__dirname, '..', 'public', 'owner-icon-' + m[1] + '.png')));
});
r.get('/owner', async (req, res) => {
  owner.cookie(req, res); // same browser ID as the site, so the owner's own visits are left out
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(OWNER_PAGE));
});

/* ---------- Care (server/care.js) ---------- */
care.routes(r);

/* ---------- pages ---------- */
r.get('/healthz', async (req, res) => send(res, 200, { ok: true }));
// The Care board's home-screen icons (public/care-icon-180.png, -192, -512).
r.get('/care-icons/:size', async (req, res) => {
  const m = /^(180|192|512)\.png$/.exec(req.params.size);
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(__dirname, '..', 'public', 'care-icon-' + m[1] + '.png')));
});
// The link preview (Facebook, Messenger, WhatsApp, iMessage…): a title, a line and the picture public/og.png.
// It says nothing about a hub, so private links (/c/…, /join/…) show the same general card.
function linkPreview(req) {
  const host = /^[A-Za-z0-9.\-]+(:\d+)?$/.test(String(req.headers.host || '')) ? req.headers.host : 'kalendaryo.co';
  const base = (/^(localhost|127\.)/.test(host) ? 'http://' : 'https://') + host;
  const title = 'Kalendaryo · Your people, in sync, wherever they are';
  const desc = 'A shared calendar, chores, meals, lists and a digital photo frame for your people, near or far. Free during early access. No sign-up, no ads.';
  return ['<meta name="description" content="' + desc + '">', '<meta property="og:type" content="website">', '<meta property="og:site_name" content="Kalendaryo">',
    '<meta property="og:title" content="' + title + '">', '<meta property="og:description" content="' + desc + '">', '<meta property="og:url" content="' + base + '/">',
    '<meta property="og:image" content="' + base + '/og.png">', '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Kalendaryo: Your people, in sync, wherever they are. Free during early access.">', '<meta name="twitter:card" content="summary_large_image">'].join('');
}
r.get('/og.png', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(__dirname, '..', 'public', 'og.png')));
});
const INDEX = path.join(__dirname, '..', 'public', 'index.html');
let indexHtml = null;
const page = async (req, res) => {
  owner.cookie(req, res);
  owner.countPage(req, req.path.startsWith('/c/') || req.path.startsWith('/care/') ? 'home' : req.path.startsWith('/join/') ? 'invite' : req.path.startsWith('/demo') ? 'demo' : 'start');
  if (!indexHtml || process.env.NODE_ENV !== 'production') {
    indexHtml = fs.readFileSync(INDEX);
    // TOUCH POINT A (server, part 2): lets the start page show the home/trip choice. Nothing is added when Triply is off.
    if (triply) indexHtml = Buffer.from(indexHtml.toString('utf8').replace('</head>', '<script>window.KAL_TRIPLY=true;</script></head>'));
    // Owner view: tells the server a real person is here, and where they came from (server/owner.js, HI_JS).
    indexHtml = Buffer.from(indexHtml.toString('utf8').replace('</head>', '<script src="/hi.js" defer></script></head>'));
  }
  let html = indexHtml;
  // A Care board link: its own name and home-screen icon ("Care board"), so it feels like its own app.
  if (req.params && req.params.board) {
    if (!care.isCareToken(req.params.board)) { res.writeHead(302, { Location: '/' }); return res.end(); }
    html = Buffer.from(html.toString('utf8').replace('<title>Kalendaryo</title>', care.headFor(req.params.board)));
  } else html = Buffer.from(html.toString('utf8').replace('</head>', linkPreview(req) + '</head>'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : html);
};
r.get('/', page); r.get('/c/:token', page); r.get('/join/:code', page); r.get('/demo', page);
r.get('/care/:board/app.webmanifest', async (req, res) => {
  if (!care.isCareToken(req.params.board)) { res.writeHead(404); return res.end(); }
  care.manifest(req, res, req.params.board);
});
r.get('/care/:board', page);
// kalendaryo.co/games: the kids' games on their own page (public/games.html, made by client/build.js).
const GAMES_PAGE = path.join(__dirname, '..', 'public', 'games.html');
r.get('/games', async (req, res) => {
  owner.cookie(req, res);
  owner.countPage(req, 'games');
  const html = fs.readFileSync(GAMES_PAGE, 'utf8').replace('</head>', '<script src="/hi.js" defer></script></head>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : html);
});
// kalendaryo.co/brain-train: the Brain Train trivia game (public/brain-train/index.html), sent byte-for-byte as it is:
// no build step, no /hi.js, nothing added. Games → Brain Train shows this page in a frame, so only this page may be
// framed, and only by Kalendaryo itself (same site). The rest of the security rules stay the same.
const BRAIN_TRAIN = path.join(__dirname, '..', 'public', 'brain-train', 'index.html');
const brainTrain = async (req, res) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', SECURITY['Content-Security-Policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'")
    .replace('font-src https://fonts.gstatic.com', "font-src 'self' https://fonts.gstatic.com"));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(BRAIN_TRAIN));
};
r.get('/brain-train', brainTrain); r.get('/brain-train/index.html', brainTrain);
// Brain Train's two fonts (Lilita One, Nunito; OFL) are self-hosted copies in public/brain-train/fonts, so the game
// needs nothing from outside kalendaryo.co. Only these three files are served.
const BRAIN_TRAIN_FONTS = new Set(['lilita-one-latin-400-normal.woff2', 'nunito-latin-600-normal.woff2', 'nunito-latin-800-normal.woff2']);
r.get('/brain-train/fonts/:name', async (req, res) => {
  if (!BRAIN_TRAIN_FONTS.has(req.params.name)) fail(404, 'not_found', 'Not found.');
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'public', 'brain-train', 'fonts', req.params.name));
  res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Length': bytes.length });
  res.end(req.method === 'HEAD' ? undefined : bytes);
});

const server = http.createServer(async (req, res) => {
  owner.touch(req);
  if (triply && triply.owns(req.url)) { // TOUCH POINT A: the mount line
    owner.noteTrip(req);
    if (req.method === 'GET' && /^\/triply\/?(\?|$)/.test(req.url)) { owner.cookie(req, res); owner.countPage(req, 'trip'); }
    return triply.handle(req, res);
  }
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  try {
    const found = await r.handle(req, res);
    if (!found) {
      if (req.url.startsWith('/api/')) send(res, 404, { error: 'not_found', message: 'Not found.' });
      else { res.writeHead(302, { Location: '/' }); res.end(); }
    }
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
    console.error(e);
    send(res, 500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }
});
server.requestTimeout = 120000;
server.headersTimeout = 30000;

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  db.migrate().then(() => server.listen(PORT, () => console.log('Kalendaryo is running on port ' + PORT)))
    .catch((e) => { console.error('Could not start:', e.message); process.exit(1); });
}
module.exports = { server };
