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
const COLLS = new Set(['settings', 'members', 'events', 'chores', 'completions', 'routines', 'rlogs', 'rewards', 'redemptions', 'lists', 'listitems', 'recipes', 'meals', 'countdowns', 'photos', 'holidays', 'notes']);
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
  if (!token || token.length > 100) fail(401, 'no_access', 'This link is not valid.');
  const r = await db.q('SELECT a.id, a.family_id, a.name, a.role, a.last_seen, a.member_id, f.name AS family_name FROM access a JOIN families f ON f.id = a.family_id WHERE a.token_hash = $1', [hash(token)]);
  if (!r.rowCount) fail(401, 'no_access', 'This link is not valid anymore. Ask an owner of the family for a new invite.');
  req.me = r.rows[0];
  owner.noteUse(req, 'home', req.me.family_id);
  if (!req.me.last_seen || Date.now() - new Date(req.me.last_seen).getTime() > 3600000) db.q('UPDATE access SET last_seen = now() WHERE id=$1', [req.me.id]).catch(() => {});
}
const need = (role) => async (req) => {
  if (RANK[req.me.role] < RANK[role]) fail(403, 'read_only', role === 'owner' ? 'Only an owner of this family can do that.' : 'You can only view this family. Ask an owner to make you an Editor.');
};
const json = jsonBody(200 * 1024);
const r = router();

/* ---------- create a family ---------- */
r.post('/api/families', json, async (req, res) => {
  if (!limit('create:' + ipOf(req), 10, 3600000)) fail(429, 'rate_limited', 'Too many new families from here. Please try again later.');
  const familyName = clean(req.body.familyName, 40) || 'Our home';
  const yourName = clean(req.body.yourName, 30);
  if (!yourName) fail(400, 'bad_request', 'Please type your name.');
  const familyId = hexId(), accessId = hexId(), token = rand(24);
  await db.tx(async (c) => {
    await c.query('INSERT INTO families (id, name) VALUES ($1, $2)', [familyId, familyName]);
    await c.query("INSERT INTO docs (family_id, col, id, data) VALUES ($1, 'settings', 'main', $2)", [familyId, JSON.stringify({ householdName: familyName })]);
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
    await c.query('UPDATE invites SET used_at = now(), used_by = $1 WHERE id = $2', [accessId, i.id]);
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
  send(res, 200, { me: { id: req.me.id, name: req.me.name, role: req.me.role, viewing: !!req.me.viewing, memberId: req.me.member_id || null }, family: { id: req.me.family_id, name: req.me.family_name },
    ai: { enabled: ai.enabled(), left: await ai.left(req.me.family_id) } });
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
      if (!(await getMember(c, req.me.family_id, id))) return 'That person is not in this family.';
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
  if (!data) fail(400, 'bad_request', 'Your link is not linked to a family profile yet.');
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
    if (!p) return 'That person is not in this family.';
    if (p.role === 'owner' && role !== 'owner' && (await ownerCount(c, req.me.family_id)) <= 1) return 'A family needs at least one owner. Make someone else an owner first.';
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
  if (!self && req.me.role !== 'owner') fail(403, 'read_only', 'Only an owner of this family can do that.');
  const msg = await db.tx(async (c) => {
    const p = await lockPerson(c, req);
    if (!p) return 'That person is not in this family.';
    if (p.role === 'owner' && (await ownerCount(c, req.me.family_id)) <= 1) return 'A family needs at least one owner. Make someone else an owner first.';
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
  const q = await db.q('SELECT id, role, label, created_at, expires_at, member_id FROM invites WHERE family_id=$1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC', [req.me.family_id]);
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
    if (!m) fail(400, 'bad_request', 'That person is not in this family anymore.');
    memberId = clean(req.body.memberId, 120);
    label = label || clean(m.name, 40);
  }
  await db.q('INSERT INTO invites (id, family_id, code_hash, role, label, created_by, expires_at, member_id) VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(days => $7), $8)',
    [hexId(), req.me.family_id, hash(code), role, label, req.me.id, INVITE_DAYS(), memberId]);
  send(res, 200, { code, days: INVITE_DAYS() });
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
  send(res, 200, { docs });
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
  const data = req.body && req.body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'bad_request', 'Nothing to save.');
  if (!(await withinQuota(req.me.family_id))) fail(400, 'quota_exceeded', 'This family has too many items saved. Delete some old items and try again.');
  await db.q(`INSERT INTO docs (family_id, col, id, data, updated_at) VALUES ($1,$2,$3,$4, now())
              ON CONFLICT (family_id, col, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [req.me.family_id, req.params.col, id, JSON.stringify(data)]);
  live.send(req.me.family_id, 'doc', { col: req.params.col, id, data });
  send(res, 200, { id });
}
r.post('/api/docs/:col', auth, json, need('editor'), (req, res) => save(req, res, hexId()));
r.put('/api/docs/:col/:id', auth, json, need('editor'), (req, res) => save(req, res, req.params.id));
r.delete('/api/docs/:col/:id', auth, need('editor'), async (req, res) => {
  checkDoc(req);
  await db.q('DELETE FROM docs WHERE family_id=$1 AND col=$2 AND id=$3', [req.me.family_id, req.params.col, req.params.id]);
  live.send(req.me.family_id, 'doc', { col: req.params.col, id: req.params.id, data: null });
  send(res, 200, { ok: true });
});

/* ---------- live updates ---------- */
r.get('/api/stream', auth, async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res._kalStream = true;
  res.write('retry: 3000\nevent: hello\ndata: {}\n\n');
  const leave = live.join(req.me.family_id, req.me.id, res);
  req.on('close', leave);
});

/* ---------- photos ---------- */
r.post('/api/blobs', auth, need('editor'), rawBody(4 * 1024 * 1024), async (req, res) => {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type) || !req.body.length) fail(400, 'bad_request', 'Please pick a photo (JPEG, PNG, WebP or GIF).');
  const n = Number((await db.q('SELECT count(*) FROM blobs WHERE family_id=$1', [req.me.family_id])).rows[0].count);
  if (n >= MAX_PHOTOS) fail(400, 'quota_exceeded', 'This family has the most photos it can keep (' + MAX_PHOTOS + '). Remove some first.');
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
  if (!(await ai.take(req.me.family_id))) fail(429, 'daily_limit', 'Your family used all of today’s AI ideas. Try again tomorrow.');
  const day = await ai.reserve();
  if (!day) { await ai.giveBack(req.me.family_id); fail(429, 'ai_resting', 'AI help is resting until tomorrow. Lots of homes used it today. You can still do everything by hand.'); }
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
  maxBlobMb: Number(process.env.TRIPLY_MAX_FILE_MB) || 5
}) : null;

/* ---------- owner view (see server/owner.js) ---------- */
const owner = require('./owner').createOwner({ db, live, ipOf, fail, triplySchema: triply ? (process.env.TRIPLY_SCHEMA || 'triply') : null });
owner.install(r, json, send);
const OWNER_PAGE = path.join(__dirname, '..', 'public', 'owner.html');
r.get('/owner', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(OWNER_PAGE));
});

/* ---------- pages ---------- */
r.get('/healthz', async (req, res) => send(res, 200, { ok: true }));
const INDEX = path.join(__dirname, '..', 'public', 'index.html');
let indexHtml = null;
const page = async (req, res) => {
  owner.cookie(req, res);
  owner.countPage(req, req.path.startsWith('/c/') ? 'home' : req.path.startsWith('/join/') ? 'invite' : req.path.startsWith('/demo') ? 'demo' : 'start');
  if (!indexHtml || process.env.NODE_ENV !== 'production') {
    indexHtml = fs.readFileSync(INDEX);
    // TOUCH POINT A (server, part 2): lets the start page show the home/trip choice. Nothing is added when Triply is off.
    if (triply) indexHtml = Buffer.from(indexHtml.toString('utf8').replace('</head>', '<script>window.KAL_TRIPLY=true;</script></head>'));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : indexHtml);
};
r.get('/', page); r.get('/c/:token', page); r.get('/join/:code', page); r.get('/demo', page);

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
