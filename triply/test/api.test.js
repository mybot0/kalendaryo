/*
 * api.test.js — tests the real server against a real Postgres.
 *   DATABASE_URL=postgres://... node --test test/api.test.js
 * Each run uses its own schema (triply_t_<random>) and drops it at the end.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTriply } = require('../server/handler');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL to run the tests.'); process.exit(1); }

const schema = 'triply_t_' + crypto.randomBytes(4).toString('hex');
const htmlPath = path.join(os.tmpdir(), schema + '.html');
fs.writeFileSync(htmlPath, '<!doctype html><title>Triply</title><!--TRIPLY_CONFIG--><body>ok</body>');

let triply, server, base;
const quiet = { log() {}, error() {} };
const BIG = { aiPlan: { windowMs: 1000, max: 100000 }, ai: { windowMs: 1000, max: 100000 }, aiAddr: { windowMs: 1000, max: 100000 }, create: { windowMs: 1000, max: 100000 }, invite: { windowMs: 1000, max: 100000 }, message: { windowMs: 1000, max: 100000 }, upload: { windowMs: 1000, max: 100000 }, lookup: { windowMs: 1000, max: 100000 } };

test.before(async () => {
  triply = createTriply({ databaseUrl: DATABASE_URL, schema, log: quiet, htmlPath, limits: BIG, maxBlobMb: 1, maxTripMb: 3, publicUrl: '',
    aiFake: path.join(__dirname, 'fakes', 'ai.js'), aiDailyUsd: 2 }); // AI answers come from the stand-in; the cap is $2 a day here
  await triply.ready;
  server = http.createServer((req, res) => (triply.owns(req.url) ? triply.handle(req, res) : (res.writeHead(404), res.end())));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  server.closeAllConnections && server.closeAllConnections();
  await new Promise((r) => server.close(r));
  try { await triply.db.q('drop schema ' + schema + ' cascade'); } catch (e) { /* ignore */ }
  await triply.close();
  fs.rmSync(htmlPath, { force: true });
});

/* ---------- helpers ---------- */
async function call(method, url, o) {
  const opts = o || {};
  const headers = Object.assign({}, opts.headers || {});
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  let body;
  if (opts.raw) body = opts.raw;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(base + url, { method, headers, body });
  const ctype = res.headers.get('content-type') || '';
  const data = ctype.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, json: data, headers: res.headers };
}
const api = (m, p, o) => call(m, '/api' + p, o);

const tripBody = (over) => Object.assign({ name: 'Spain & Mediterranean Cruise', destination: 'Spain', route: ['Vancouver', 'Madrid', 'Barcelona'], start_date: '2027-07-23', end_date: '2027-08-05', owner: { name: 'Maya', avatar: '🦊' } }, over || {});

async function newTrip(over) {
  const r = await api('POST', '/trips', { body: tripBody(over) });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { id: r.json.trip.id, token: r.json.token, me: r.json.member, trip: r.json.trip, link: r.json.link };
}
async function invite(t, role, label) {
  const r = await api('POST', '/trips/' + t.id + '/invites', { token: t.token, body: { role, label } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}
async function joined(t, role, name) {
  const inv = await invite(t, role);
  const r = await api('POST', '/join', { body: { code: inv.code, name: name || 'Guest', avatar: '🐼' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { token: r.json.token, member: r.json.member, id: r.json.member.id };
}
const flight = (over) => Object.assign({ type: 'flight', data: { airline: 'Air Canada', flightNo: 'AC123', from: 'Vancouver (YVR)', to: 'Montreal (YUL)' }, start_date: '2027-07-23', start_time: '07:00', end_date: '2027-07-23', end_time: '14:30', confirmation: 'ABC123' }, over || {});

/* ---------- the page ---------- */
test('serves the page with its settings and safe headers', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  const html = r.json.toString();
  assert.match(html, /window\.TRIPLY=\{"base":""/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await call('GET', '/nope')).status, 404);
  assert.equal((await call('GET', '/healthz')).status, 200);
});

/* ---------- trips ---------- */
test('creates a trip with an owner, and never leaks secrets', async () => {
  const t = await newTrip();
  assert.equal(t.me.role, 'owner');
  assert.ok(t.token.length >= 30);
  assert.match(t.link, /#\/t\//);
  const s = await api('GET', '/trips/' + t.id + '/state', { token: t.token });
  assert.equal(s.status, 200);
  assert.equal(s.json.trip.name, 'Spain & Mediterranean Cruise');
  assert.deepEqual(s.json.trip.route, ['Vancouver', 'Madrid', 'Barcelona']);
  assert.equal(s.json.members.length, 1);
  assert.equal(s.json.perms['trip.delete'], true);
  const text = JSON.stringify(s.json);
  assert.ok(!/token_hash|code_hash|bytes/.test(text), 'no secrets in state');
  const hash = crypto.createHash('sha256').update(t.token).digest('hex');
  const stored = await triply.db.q('select token_hash from members where id = $1', [t.me.id]);
  assert.equal(stored.rows[0].token_hash, hash, 'only the hash is stored');
});

test('checks trip details', async () => {
  const bads = [
    { name: '' }, { name: 'x', start_date: 'nope' }, { name: 'x', end_date: '2027-07-01' },
    { name: 'x', start_date: '2027-02-30' }, { name: 'x', end_date: '2029-01-01' }, { owner: { name: '' } }
  ];
  for (const b of bads) {
    const r = await api('POST', '/trips', { body: tripBody(b) });
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.equal(r.json.error.code, 'invalid');
  }
  const r = await api('POST', '/trips', { body: tripBody({ name: '<b>Hi</b>', route: 'A → B -> C,D' }) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.trip.route, ['A', 'B', 'C', 'D']);
});

test('needs the right token for the right trip', async () => {
  const a = await newTrip(), b = await newTrip();
  assert.equal((await api('GET', '/trips/' + a.id + '/state')).status, 401);
  assert.equal((await api('GET', '/trips/' + a.id + '/state', { token: 'x'.repeat(30) })).status, 401);
  assert.equal((await api('GET', '/trips/' + a.id + '/state', { token: b.token })).status, 404);
  assert.equal((await api('GET', '/trips/not-a-uuid/state', { token: a.token })).status, 404);
  const me = await api('GET', '/me', { token: a.token });
  assert.equal(me.json.trip.id, a.id);
});

test('only an owner edits and deletes the trip', async () => {
  const t = await newTrip();
  const ed = await joined(t, 'editor', 'Ed');
  const r1 = await api('PATCH', '/trips/' + t.id, { token: ed.token, body: { name: 'Hacked' } });
  assert.equal(r1.status, 403);
  const r2 = await api('PATCH', '/trips/' + t.id, { token: t.token, body: { name: 'Spain 2027', viewers_chat: false, route: ['Madrid', 'Rome'] } });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.trip.name, 'Spain 2027');
  assert.equal(r2.json.trip.viewers_chat, false);
  assert.equal((await api('PATCH', '/trips/' + t.id, { token: t.token, body: { end_date: '2020-01-01' } })).status, 400);
  assert.equal((await api('DELETE', '/trips/' + t.id, { token: ed.token })).status, 403);
  assert.equal((await api('DELETE', '/trips/' + t.id, { token: t.token })).status, 200);
  assert.equal((await api('GET', '/trips/' + t.id + '/state', { token: t.token })).status, 401);
  const left = await triply.db.q('select (select count(*) from members where trip_id=$1) m, (select count(*) from messages where trip_id=$1) x', [t.id]);
  assert.equal(Number(left.rows[0].m) + Number(left.rows[0].x), 0, 'everything cascades');
});

test('My Trips lists working tokens and reports the gone ones', async () => {
  const a = await newTrip({ name: 'A' }), b = await newTrip({ name: 'B' });
  const guest = await joined(a, 'viewer', 'Vi');
  await api('DELETE', '/trips/' + b.id, { token: b.token });
  const r = await api('POST', '/my-trips', { body: { tokens: [a.token, b.token, guest.token, 'bad'] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.trips.map((x) => x.i).sort(), [0, 2]);
  assert.deepEqual(r.json.gone, [1]);
  const mine = r.json.trips.find((x) => x.i === 0);
  assert.equal(mine.name, 'A'); assert.equal(mine.role, 'owner'); assert.equal(mine.travelers, 2); assert.equal(mine.owner_name, 'Maya');
  assert.equal(r.json.trips.find((x) => x.i === 2).role, 'viewer');
  assert.ok(!JSON.stringify(r.json).includes('token'));
});

/* ---------- itinerary ---------- */
test('adds, changes and deletes plans of every type', async () => {
  const t = await newTrip();
  const make = async (b) => { const r = await api('POST', '/trips/' + t.id + '/items', { token: t.token, body: b }); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json.item; };
  const f = await make(flight());
  assert.equal(f.title, 'Vancouver (YVR) → Montreal (YUL)');
  assert.equal(f.confirmation, 'ABC123'); assert.equal(f.version, 1);
  const h = await make({ type: 'hotel', title: 'Hotel Madrid', location: 'Gran Via 1', start_date: '2027-07-24', start_time: '15:00', end_date: '2027-07-27', end_time: '11:00', confirmation: 'H-77', data: { room: 'Double' } });
  assert.equal(h.data.room, 'Double');
  const car = await make({ type: 'car', data: { company: 'Hertz', vehicle: 'Fiat 500' }, start_date: '2027-07-28' });
  assert.equal(car.title, 'Hertz');
  const cr = await make({ type: 'cruise', data: { ship: 'Harmony of the Seas' }, start_date: '2027-07-29', end_date: '2027-08-04' });
  assert.equal(cr.title, 'Harmony of the Seas');
  const act = await make({ type: 'activity', title: 'City tour', start_date: '2027-07-25', start_time: '10:00', end_time: '14:00', data: { cost: '45.456', currency: 'eur' } });
  assert.equal(act.end_date, '2027-07-25'); assert.equal(act.data.cost, 45.46); assert.equal(act.data.currency, 'EUR');
  const rest = await make({ type: 'restaurant', title: 'Casa Lucio', start_date: '2027-07-25', start_time: '19:30', data: { people: '4' } });
  assert.equal(rest.data.people, 4);
  const place = await make({ type: 'place', title: 'Prado Museum', data: { website: 'museodelprado.es' } });
  assert.equal(place.start_date, null); assert.equal(place.data.website, 'https://museodelprado.es');
  const note = await make({ type: 'note', notes: 'Bring adapters' });
  assert.equal(note.title, 'Note');

  const up = await api('PATCH', '/trips/' + t.id + '/items/' + f.id, { token: t.token, body: { version: 1, title: 'AC123 to Montreal', data: { gate: 'B12' } } });
  assert.equal(up.status, 200);
  assert.equal(up.json.item.version, 2); assert.equal(up.json.item.data.gate, 'B12'); assert.equal(up.json.item.data.airline, 'Air Canada', 'old fields are kept');
  const s = await api('GET', '/trips/' + t.id + '/state', { token: t.token });
  assert.equal(s.json.items.length, 8);
  assert.equal(s.json.items[0].start_date, '2027-07-23', 'sorted by day');
  assert.equal(s.json.items[s.json.items.length - 1].start_date, null, 'unscheduled last');
  assert.equal((await api('DELETE', '/trips/' + t.id + '/items/' + note.id, { token: t.token })).status, 200);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/items/' + note.id, { token: t.token })).status, 404);
});

test('checks plans', async () => {
  const t = await newTrip();
  const post = (b) => api('POST', '/trips/' + t.id + '/items', { token: t.token, body: b });
  assert.equal((await post({ type: 'dragon', title: 'x' })).status, 400);
  assert.equal((await post({ type: 'hotel', title: 'No day' })).status, 400);
  assert.equal((await post({ type: 'hotel', start_date: '2027-07-24' })).status, 400, 'needs a name');
  assert.equal((await post({ type: 'hotel', title: 'x', start_date: '2027-07-24', end_date: '2027-07-23' })).status, 400);
  assert.equal((await post({ type: 'activity', title: 'x', start_date: '2027-07-24', start_time: '25:00' })).status, 400);
  assert.equal((await post({ type: 'activity', title: 'x', start_date: '2027-07-24', start_time: '14:00', end_time: '13:00' })).status, 400);
  assert.equal((await post({ type: 'activity', title: 'x', start_time: '14:00' })).status, 400, 'time without a day');
  // A flight may land "earlier" on the clock the same day (it crosses time zones).
  assert.equal((await post(flight({ start_time: '17:00', end_time: '10:00' }))).status, 200);
  const x = await post({ type: 'activity', title: 'Extra', start_date: '2027-07-24', data: { hacker: 'yes', cost: 'abc' } });
  assert.equal(x.status, 200);
  assert.deepEqual(x.json.item.data, {}, 'unknown and invalid fields are dropped');
  const long = await post({ type: 'note', title: 'x'.repeat(500), notes: 'n'.repeat(9000) });
  assert.equal(long.json.item.title.length, 120); assert.equal(long.json.item.notes.length, 4000);
});

test('two people editing the same plan do not overwrite each other', async () => {
  const t = await newTrip();
  const ed = await joined(t, 'editor', 'Ed');
  const it = (await api('POST', '/trips/' + t.id + '/items', { token: t.token, body: flight() })).json.item;
  const a = await api('PATCH', '/trips/' + t.id + '/items/' + it.id, { token: t.token, body: { version: 1, notes: 'from Maya' } });
  assert.equal(a.status, 200);
  const b = await api('PATCH', '/trips/' + t.id + '/items/' + it.id, { token: ed.token, body: { version: 1, notes: 'from Ed' } });
  assert.equal(b.status, 409);
  assert.equal(b.json.error.code, 'version_conflict');
  assert.equal(b.json.error.item.notes, 'from Maya');
  assert.equal((await api('PATCH', '/trips/' + t.id + '/items/' + it.id, { token: ed.token, body: { notes: 'no version' } })).status, 400);
  const c = await api('PATCH', '/trips/' + t.id + '/items/' + it.id, { token: ed.token, body: { version: 2, notes: 'from Ed' } });
  assert.equal(c.status, 200); assert.equal(c.json.item.version, 3);
});

/* ---------- people, roles, invitations ---------- */
test('invitations work once, and expire', async () => {
  const t = await newTrip();
  const inv = await invite(t, 'editor', 'For Leah');
  assert.match(inv.link, /#\/join\//);
  const peek = await api('GET', '/invites/peek/' + inv.code);
  assert.equal(peek.status, 200);
  assert.equal(peek.json.trip.name, 'Spain & Mediterranean Cruise');
  assert.equal(peek.json.inviter, 'Maya'); assert.equal(peek.json.role, 'editor'); assert.equal(peek.json.label, 'For Leah');
  assert.equal((await api('POST', '/join', { body: { code: inv.code, name: '' } })).status, 400, 'a name is needed');
  const j = await api('POST', '/join', { body: { code: inv.code, name: 'Leah', avatar: '🦄' } });
  assert.equal(j.status, 200);
  assert.equal(j.json.member.role, 'editor');
  assert.notEqual(j.json.member.color, t.me.color, 'gets their own color');
  assert.equal((await api('POST', '/join', { body: { code: inv.code, name: 'Again' } })).status, 410);
  assert.equal((await api('GET', '/invites/peek/' + inv.code)).json.error.code, 'invite_used');
  assert.equal((await api('GET', '/invites/peek/' + 'a'.repeat(16))).status, 404);
  assert.equal((await api('GET', '/invites/peek/short')).status, 404);
  const two = await invite(t, 'viewer');
  await triply.db.q("update invites set expires_at = now() - interval '1 minute' where trip_id = $1 and used_at is null", [t.id]);
  assert.equal((await api('POST', '/join', { body: { code: two.code, name: 'Late' } })).json.error.code, 'invite_expired');
  const three = await invite(t, 'viewer');
  const s = await api('GET', '/trips/' + t.id + '/state', { token: t.token });
  assert.equal(s.json.invites.length, 1, 'only open invitations are listed');
  assert.equal((await api('DELETE', '/trips/' + t.id + '/invites/' + s.json.invites[0].id, { token: t.token })).status, 200);
  assert.equal((await api('POST', '/join', { body: { code: three.code, name: 'Revoked' } })).status, 404);
  const bern = j.json.token;
  assert.equal((await api('POST', '/trips/' + t.id + '/invites', { token: bern, body: { role: 'viewer' } })).status, 403, 'editors cannot invite');
  const state = await api('GET', '/trips/' + t.id + '/state', { token: bern });
  assert.deepEqual(state.json.invites, [], 'editors do not see invitations');
});

test('viewers look, editors plan, owners run the trip', async () => {
  const t = await newTrip();
  const ed = await joined(t, 'editor', 'Ed'), vw = await joined(t, 'viewer', 'Vi');
  const item = (await api('POST', '/trips/' + t.id + '/items', { token: ed.token, body: flight() })).json.item;
  assert.equal((await api('POST', '/trips/' + t.id + '/items', { token: vw.token, body: flight() })).status, 403);
  assert.equal((await api('PATCH', '/trips/' + t.id + '/items/' + item.id, { token: vw.token, body: { version: 1, notes: 'x' } })).status, 403);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/items/' + item.id, { token: vw.token })).status, 403);
  assert.equal((await api('GET', '/trips/' + t.id + '/state', { token: vw.token })).json.items.length, 1);
  assert.equal((await api('PATCH', '/trips/' + t.id + '/members/' + ed.id, { token: ed.token, body: { role: 'owner' } })).status, 403, 'no self-promotion');
  assert.equal((await api('DELETE', '/trips/' + t.id + '/members/' + vw.id, { token: ed.token })).status, 403);
  const perms = (await api('GET', '/trips/' + t.id + '/state', { token: vw.token })).json.perms;
  assert.equal(perms['items.write'], false); assert.equal(perms['chat.write'], true);
  const promote = await api('PATCH', '/trips/' + t.id + '/members/' + vw.id, { token: t.token, body: { role: 'editor' } });
  assert.equal(promote.json.member.role, 'editor');
  assert.equal((await api('POST', '/trips/' + t.id + '/items', { token: vw.token, body: flight() })).status, 200, 'new role works at once');
  assert.equal((await api('PATCH', '/trips/' + t.id + '/members/' + vw.id, { token: t.token, body: { role: 'boss' } })).status, 400);
});

test('a trip always keeps one owner', async () => {
  const t = await newTrip();
  const ed = await joined(t, 'editor', 'Ed');
  assert.equal((await api('PATCH', '/trips/' + t.id + '/members/' + t.me.id, { token: t.token, body: { role: 'editor' } })).json.error.code, 'last_owner');
  assert.equal((await api('DELETE', '/trips/' + t.id + '/members/me', { token: t.token })).json.error.code, 'last_owner');
  assert.equal((await api('PATCH', '/trips/' + t.id + '/members/' + ed.id, { token: t.token, body: { role: 'owner' } })).status, 200);
  const left = await api('DELETE', '/trips/' + t.id + '/members/me', { token: t.token });
  assert.equal(left.status, 200);
  assert.equal((await api('GET', '/trips/' + t.id + '/state', { token: t.token })).status, 401, 'their link stops working');
  assert.equal((await api('DELETE', '/trips/' + t.id + '/members/me', { token: ed.token })).json.error.code, 'last_owner');
  // two owners leaving at the same moment: exactly one may succeed
  const t2 = await newTrip(); const o2 = await joined(t2, 'owner', 'Second');
  const both = await Promise.all([api('DELETE', '/trips/' + t2.id + '/members/me', { token: t2.token }), api('DELETE', '/trips/' + t2.id + '/members/me', { token: o2.token })]);
  assert.deepEqual(both.map((x) => x.status).sort(), [200, 409]);
});

test('removing a person ends their access and their private messages', async () => {
  const t = await newTrip();
  const a = await joined(t, 'editor', 'Amy'), b = await joined(t, 'editor', 'Bo');
  await api('POST', '/trips/' + t.id + '/messages', { token: a.token, body: { thread: b.id, body: 'secret plan' } });
  await api('POST', '/trips/' + t.id + '/messages', { token: a.token, body: { thread: 'trip', body: 'hello all' } });
  assert.equal((await api('DELETE', '/trips/' + t.id + '/members/' + a.id, { token: t.token })).status, 200);
  assert.equal((await api('GET', '/trips/' + t.id + '/state', { token: a.token })).status, 401);
  const dm = await api('GET', '/trips/' + t.id + '/messages?thread=' + a.id, { token: b.token });
  assert.equal(dm.status, 404, 'that person is gone');
  const group = await api('GET', '/trips/' + t.id + '/messages?thread=trip', { token: b.token });
  assert.ok(group.json.messages.some((m) => m.body === 'hello all' && m.sender_id === null), 'group history stays, sender unknown');
  const left = await triply.db.q("select count(*)::int n from messages where trip_id=$1 and to_member is not null", [t.id]);
  assert.equal(left.rows[0].n, 0);
});

test('people can change their own name and picture', async () => {
  const t = await newTrip();
  const r = await api('PATCH', '/trips/' + t.id + '/members/me', { token: t.token, body: { name: 'Maya R', avatar: '🐯' } });
  assert.equal(r.json.member.name, 'Maya R'); assert.equal(r.json.member.avatar, '🐯');
  assert.equal((await api('PATCH', '/trips/' + t.id + '/members/me', { token: t.token, body: { name: '  ' } })).status, 400);
  const bad = await api('PATCH', '/trips/' + t.id + '/members/me', { token: t.token, body: { avatar: '<script>' } });
  assert.equal(bad.json.member.avatar, '', 'letters and markup are not accepted as a picture');
});

/* ---------- chat ---------- */
test('group chat: messages, mentions, unread and read marks', async () => {
  const t = await newTrip();
  const bern = await joined(t, 'editor', 'Leah');
  const send = (tok, body, thread) => api('POST', '/trips/' + t.id + '/messages', { token: tok, body: { thread: thread || 'trip', body } });
  const m1 = await send(t.token, 'Should we book the 7:30 dinner? @Leah');
  assert.equal(m1.status, 200);
  assert.deepEqual(m1.json.message.mentions, [bern.id]);
  assert.equal((await send(t.token, '@Maya talking to myself')).json.message.mentions.length, 0, 'no self mentions');
  assert.equal((await send(t.token, '@Leahs is not her')).json.message.mentions.length, 0, 'whole names only');
  assert.equal((await send(t.token, '   ')).status, 400);
  let st = await api('GET', '/trips/' + t.id + '/state', { token: bern.token });
  assert.equal(st.json.unread.trip, 3); assert.equal(st.json.unread.mentions, 1);
  await send(bern.token, 'Yeah 👍');
  st = await api('GET', '/trips/' + t.id + '/state', { token: bern.token });
  assert.equal(st.json.unread.trip, 0, 'sending a message marks the chat read');
  st = await api('GET', '/trips/' + t.id + '/state', { token: t.token });
  assert.equal(st.json.unread.trip, 1, 'own messages are not unread');
  const list = await api('GET', '/trips/' + t.id + '/messages?thread=trip', { token: bern.token });
  const texts = list.json.messages.filter((m) => m.kind === 'text');
  assert.equal(texts.length, 4);
  assert.ok(Number(texts[0].id) < Number(texts[3].id), 'oldest first');
  const last = texts[texts.length - 1].id;
  assert.equal((await api('POST', '/trips/' + t.id + '/reads', { token: bern.token, body: { thread: 'trip', lastId: last } })).status, 200);
  st = await api('GET', '/trips/' + t.id + '/state', { token: bern.token });
  assert.equal(st.json.unread.trip, 0); assert.equal(st.json.unread.mentions, 0);
  const page = await api('GET', '/trips/' + t.id + '/messages?thread=trip&limit=2', { token: t.token });
  assert.equal(page.json.messages.length, 2); assert.equal(page.json.more, true);
  const older = await api('GET', '/trips/' + t.id + '/messages?thread=trip&limit=50&before=' + page.json.messages[0].id, { token: t.token });
  assert.ok(older.json.messages.every((m) => Number(m.id) < Number(page.json.messages[0].id)));
});

test('direct messages are private', async () => {
  const t = await newTrip();
  const a = await joined(t, 'editor', 'Amy'), b = await joined(t, 'viewer', 'Bo');
  const send = (tok, to, body) => api('POST', '/trips/' + t.id + '/messages', { token: tok, body: { thread: to, body } });
  assert.equal((await send(t.token, a.id, 'Maya to Amy')).status, 200);
  const early = await api('GET', '/trips/' + t.id + '/state', { token: a.token });
  assert.equal(early.json.unread.dm[t.me.id], 1); assert.equal(early.json.unread.trip, 0);
  assert.equal((await send(a.token, t.me.id, 'Amy to Maya')).status, 200);
  assert.equal((await send(t.token, t.me.id, 'to myself')).status, 400);
  assert.equal((await send(t.token, '00000000-0000-4000-8000-000000000000', 'nobody')).status, 404);
  const read = (tok, thread) => api('GET', '/trips/' + t.id + '/messages?thread=' + thread, { token: tok });
  assert.deepEqual((await read(t.token, a.id)).json.messages.map((m) => m.body), ['Maya to Amy', 'Amy to Maya']);
  assert.deepEqual((await read(a.token, t.me.id)).json.messages.map((m) => m.body), ['Maya to Amy', 'Amy to Maya']);
  assert.deepEqual((await read(b.token, t.me.id)).json.messages, [], 'Bo sees nothing of Maya and Amy');
  assert.deepEqual((await read(b.token, a.id)).json.messages, []);
  assert.ok(!(await read(b.token, 'trip')).json.messages.some((m) => /Maya to Amy/.test(m.body)), 'never in the group chat');
  const lastId = (await read(a.token, t.me.id)).json.messages.slice(-1)[0].id;
  await api('POST', '/trips/' + t.id + '/reads', { token: a.token, body: { thread: t.me.id, lastId } });
  assert.deepEqual((await api('GET', '/trips/' + t.id + '/state', { token: a.token })).json.unread.dm, {});
  const sum = await api('POST', '/my-trips', { body: { tokens: [t.token] } });
  assert.equal(sum.json.trips[0].unread, 1, 'My Trips shows unread');
});

test('viewers can chat only when the owner allows it', async () => {
  const t = await newTrip({ });
  const vw = await joined(t, 'viewer', 'Vi');
  const send = (tok) => api('POST', '/trips/' + t.id + '/messages', { token: tok, body: { thread: 'trip', body: 'hi' } });
  assert.equal((await send(vw.token)).status, 200);
  await api('PATCH', '/trips/' + t.id, { token: t.token, body: { viewers_chat: false } });
  assert.equal((await send(vw.token)).status, 403);
  assert.equal((await api('GET', '/trips/' + t.id + '/messages?thread=trip', { token: vw.token })).status, 200, 'they can still read');
  assert.equal((await api('GET', '/trips/' + t.id + '/state', { token: vw.token })).json.perms['chat.write'], false);
  assert.equal((await send(t.token)).status, 200);
});

test('plans post to the chat, without nagging', async () => {
  const t = await newTrip();
  const it = (await api('POST', '/trips/' + t.id + '/items', { token: t.token, body: { type: 'restaurant', title: 'Dinner', start_date: '2027-07-25', start_time: '19:30' } })).json.item;
  await api('PATCH', '/trips/' + t.id + '/items/' + it.id, { token: t.token, body: { version: 1, notes: 'a' } });
  await api('PATCH', '/trips/' + t.id + '/items/' + it.id, { token: t.token, body: { version: 2, notes: 'b' } });
  let msgs = (await api('GET', '/trips/' + t.id + '/messages?thread=trip', { token: t.token })).json.messages.filter((m) => m.kind === 'activity');
  assert.deepEqual(msgs.map((m) => m.meta.event), ['added'], 'quick edits by the same person are not reposted');
  assert.equal(msgs[0].item_id, it.id); assert.equal(msgs[0].meta.title, 'Dinner'); assert.equal(msgs[0].meta.time, '19:30');
  await api('DELETE', '/trips/' + t.id + '/items/' + it.id, { token: t.token });
  msgs = (await api('GET', '/trips/' + t.id + '/messages?thread=trip', { token: t.token })).json.messages.filter((m) => m.kind === 'activity');
  assert.deepEqual(msgs.map((m) => m.meta.event), ['added', 'removed']);
  assert.equal(msgs[0].item_id, null, 'no link to a plan that is gone');
  const bo = await joined(t, 'viewer', 'Bo');
  msgs = (await api('GET', '/trips/' + t.id + '/messages?thread=trip', { token: bo.token })).json.messages;
  assert.equal(msgs[msgs.length - 1].meta.event, 'joined');
  const st = await api('GET', '/trips/' + t.id + '/state', { token: bo.token });
  assert.equal(st.json.unread.trip, 0, 'activity does not count as unread');
});

/* ---------- photos and files ---------- */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const upload = (t, tok, buf, type, name) => api('POST', '/trips/' + t.id + '/blobs', { token: tok, raw: buf, headers: { 'Content-Type': type, 'X-Filename': encodeURIComponent(name || 'pic.png') } });

test('photos and files: upload, checks, safe download', async () => {
  const t = await newTrip();
  const up = await upload(t, t.token, PNG, 'image/png', 'Madrid view.png');
  assert.equal(up.status, 200);
  const id = up.json.blob.id;
  const got = await call('GET', '/api/blobs/' + id);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('content-disposition'), /^inline/);
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.match(got.headers.get('content-security-policy'), /sandbox/);
  assert.equal(Buffer.compare(got.json, PNG), 0);
  const etag = got.headers.get('etag');
  const again = await fetch(base + '/api/blobs/' + id, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
  const pdf = await upload(t, t.token, Buffer.from('%PDF-1.4 hello'), 'application/pdf', 'Flight ticket.pdf');
  assert.equal(pdf.status, 200);
  const dl = await call('GET', '/api/blobs/' + pdf.json.blob.id);
  assert.match(dl.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''Flight%20ticket\.pdf/);
  assert.equal((await upload(t, t.token, Buffer.from('<html><script>alert(1)</script>'), 'text/html')).status, 400, 'html is not accepted');
  assert.equal((await upload(t, t.token, Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml')).status, 400, 'svg is not accepted');
  assert.equal((await upload(t, t.token, Buffer.from('<html>'), 'image/png')).status, 400, 'png must look like a png');
  assert.equal((await upload(t, t.token, Buffer.alloc(0), 'image/png')).status, 400);
  assert.equal((await upload(t, t.token, Buffer.concat([PNG, Buffer.alloc(1100 * 1024)]), 'image/png')).status, 413, 'too big');
  assert.equal((await call('GET', '/api/blobs/not-an-id')).status, 404);
  assert.equal((await call('GET', '/api/blobs/00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await upload(t, undefined, PNG, 'image/png')).status, 401);
});

test('photos in chat and as the trip cover; viewers follow the chat rule; space is limited', async () => {
  const t = await newTrip();
  const vw = await joined(t, 'viewer', 'Vi');
  const mine = (await upload(t, t.token, PNG, 'image/png', 'a.png')).json.blob;
  const send = await api('POST', '/trips/' + t.id + '/messages', { token: t.token, body: { thread: 'trip', body: '', blobId: mine.id } });
  assert.equal(send.status, 200); assert.equal(send.json.message.blob.mime, 'image/png');
  const other = (await upload(t, vw.token, PNG, 'image/png', 'b.png')).json.blob;
  const steal = await api('POST', '/trips/' + t.id + '/messages', { token: t.token, body: { thread: 'trip', blobId: other.id } });
  assert.equal(steal.status, 400, 'cannot send someone else\'s upload');
  const cover = await api('PATCH', '/trips/' + t.id, { token: t.token, body: { cover_blob: mine.id } });
  assert.equal(cover.json.trip.cover_blob, mine.id);
  assert.equal((await api('PATCH', '/trips/' + t.id, { token: t.token, body: { cover_blob: '00000000-0000-4000-8000-000000000000' } })).status, 400);
  const t2 = await newTrip();
  const foreign = (await upload(t2, t2.token, PNG, 'image/png')).json.blob;
  assert.equal((await api('PATCH', '/trips/' + t.id, { token: t.token, body: { cover_blob: foreign.id } })).status, 400, 'a photo from another trip cannot be the cover');
  await api('PATCH', '/trips/' + t.id, { token: t.token, body: { viewers_chat: false } });
  assert.equal((await upload(t, vw.token, PNG, 'image/png')).status, 403);
  // storage limit (3 MB for this test server)
  const t3 = await newTrip();
  const chunk = Buffer.concat([PNG, Buffer.alloc(900 * 1024)]);
  for (let i = 0; i < 3; i++) assert.equal((await upload(t3, t3.token, chunk, 'image/png')).status, 200);
  const full = await upload(t3, t3.token, chunk, 'image/png');
  assert.equal(full.status, 413); assert.equal(full.json.error.code, 'quota_exceeded');
});

/* ---------- live updates ---------- */
function openStream(tripId, token) {
  return new Promise((resolve, reject) => {
    const events = [];
    const req = http.get(base + '/api/trips/' + tripId + '/stream', { headers: { Authorization: 'Bearer ' + token } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve({ status: res.statusCode, events, close() {} }); }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block), data = /^data: (.*)$/m.exec(block);
          if (ev && data) events.push({ event: ev[1], data: JSON.parse(data[1]) });
        }
      });
      res.on('close', () => { events.closed = true; });
      const wait = async (fn, ms) => { const end = Date.now() + (ms || 2000); while (Date.now() < end) { const f = events.find(fn); if (f) return f; await new Promise((r) => setTimeout(r, 20)); } return null; };
      resolve({ status: 200, events, wait, close: () => req.destroy() });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? null : reject(e)));
  });
}

test('live updates reach the right people', async () => {
  const t = await newTrip();
  const a = await joined(t, 'editor', 'Amy'), b = await joined(t, 'editor', 'Bo');
  assert.equal((await openStream(t.id, 'z'.repeat(30))).status, 401);
  const sA = await openStream(t.id, a.token), sB = await openStream(t.id, b.token), sR = await openStream(t.id, t.token);
  await sA.wait((e) => e.event === 'hello');
  await api('POST', '/trips/' + t.id + '/items', { token: t.token, body: flight() });
  assert.ok(await sA.wait((e) => e.data.kind === 'items'), 'plan change reaches Amy');
  assert.ok(await sB.wait((e) => e.data.kind === 'items'), 'and Bo');
  await api('POST', '/trips/' + t.id + '/messages', { token: t.token, body: { thread: a.id, body: 'psst' } });
  const dm = await sA.wait((e) => e.data.kind === 'chat' && e.data.thread === 'dm');
  assert.ok(dm && dm.data.message.body === 'psst', 'private message reaches Amy');
  assert.ok(await sR.wait((e) => e.data.kind === 'chat' && e.data.thread === 'dm'), 'and the sender\'s other devices');
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(!sB.events.some((e) => e.data.thread === 'dm'), 'Bo never hears of it');
  await api('DELETE', '/trips/' + t.id + '/members/' + a.id, { token: t.token });
  assert.ok(await sA.wait((e) => e.data.kind === 'kicked'), 'removed people are told');
  await api('DELETE', '/trips/' + t.id, { token: t.token });
  assert.ok(await sB.wait((e) => e.data.kind === 'trip_deleted'));
  [sA, sB, sR].forEach((s) => s.close());
});

/* ---------- running inside Kalendaryo ---------- */
test('can be mounted under /triply and answers only there', async () => {
  const mounted = createTriply({ databaseUrl: DATABASE_URL, schema, log: quiet, htmlPath, limits: BIG, basePath: '/triply', publicUrl: 'https://kalendaryo.example/triply' });
  await mounted.ready;
  const srv = http.createServer((req, res) => (mounted.owns(req.url) ? mounted.handle(req, res) : (res.writeHead(200, { 'Content-Type': 'text/plain' }), res.end('kalendaryo'))));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = 'http://127.0.0.1:' + srv.address().port;
  try {
    assert.equal(await (await fetch(b + '/')).text(), 'kalendaryo');
    assert.equal(await (await fetch(b + '/triplyx')).text(), 'kalendaryo', 'a lookalike path is not ours');
    const redirect = await fetch(b + '/triply', { redirect: 'manual' });
    assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), '/triply/');
    const page = await (await fetch(b + '/triply/')).text();
    assert.match(page, /window\.TRIPLY=\{"base":"\/triply","publicUrl":"https:\/\/kalendaryo\.example\/triply"\}/);
    const made = await fetch(b + '/triply/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tripBody()) });
    const j = await made.json();
    assert.equal(made.status, 200);
    assert.match(j.link, /^https:\/\/kalendaryo\.example\/triply\/#\/t\//, 'links use the public address');
    assert.equal((await fetch(b + '/triply/api/trips/' + j.trip.id + '/state', { headers: { Authorization: 'Bearer ' + j.token } })).status, 200);
    assert.equal((await fetch(b + '/api/trips')).status, 200, 'Kalendaryo\'s own /api is untouched');
  } finally {
    srv.closeAllConnections && srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
    await mounted.close();
  }
});

/* ---------- guards ---------- */
test('limits guessing and spam', async () => {
  const strict = createTriply({ databaseUrl: DATABASE_URL, schema, log: quiet, htmlPath, limits: { create: { windowMs: 60000, max: 2 }, invite: { windowMs: 60000, max: 3 } } });
  await strict.ready;
  const srv = http.createServer((req, res) => strict.handle(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = 'http://127.0.0.1:' + srv.address().port + '/api';
  try {
    const post = () => fetch(b + '/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tripBody()) });
    assert.equal((await post()).status, 200); assert.equal((await post()).status, 200);
    const third = await post();
    assert.equal(third.status, 429); assert.equal((await third.json()).error.code, 'rate_limited');
    for (let i = 0; i < 3; i++) assert.equal((await fetch(b + '/invites/peek/' + 'q'.repeat(16))).status, 404);
    assert.equal((await fetch(b + '/invites/peek/' + 'q'.repeat(16))).status, 429);
  } finally {
    srv.closeAllConnections && srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
    await strict.close();
  }
});

test('handles bad requests politely', async () => {
  const bad = await fetch(base + '/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400); assert.equal((await bad.json()).error.code, 'bad_json');
  const big = await fetch(base + '/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(400000) }) });
  assert.equal(big.status, 413);
  assert.equal((await fetch(base + '/api/nothing')).status, 404);
  assert.equal((await fetch(base + '/api/trips', { method: 'DELETE' })).status, 405);
});

test('allows another website only when configured', async () => {
  const open = createTriply({ databaseUrl: DATABASE_URL, schema, log: quiet, htmlPath, limits: BIG, allowedOrigin: 'https://trips.example' });
  await open.ready;
  const srv = http.createServer((req, res) => open.handle(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = 'http://127.0.0.1:' + srv.address().port;
  try {
    const ok = await fetch(b + '/api/health', { headers: { Origin: 'https://trips.example' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://trips.example');
    const no = await fetch(b + '/api/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
    const pre = await fetch(b + '/api/trips', { method: 'OPTIONS', headers: { Origin: 'https://trips.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
    assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'https://trips.example' } })).headers.get('access-control-allow-origin'), null, 'off by default');
  } finally {
    srv.closeAllConnections && srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
    await open.close();
  }
});

/* ---------- expenses and the files list ---------- */
test('costs: add, share, change, delete, and who may', async () => {
  const t = await newTrip();
  const ed = await joined(t, 'editor', 'Ed'), vw = await joined(t, 'viewer', 'Vi');
  const all = [t.me.id, ed.id, vw.id];
  const post = (tok, b) => api('POST', '/trips/' + t.id + '/expenses', { token: tok, body: b });
  const dinner = await post(t.token, { title: 'Dinner at Casa Lucio', amount: '120.50', currency: 'eur', paid_by: t.me.id, split: all, spent_on: '2027-07-25', note: 'x'.repeat(900) });
  assert.equal(dinner.status, 200, JSON.stringify(dinner.json));
  const e = dinner.json.expense;
  assert.equal(e.amount, 120.5); assert.equal(e.currency, 'EUR'); assert.equal(e.note.length, 500); assert.deepEqual(e.split.sort(), all.slice().sort());
  const bads = [{ title: '' }, { amount: 0 }, { amount: -5 }, { amount: 'abc' }, { paid_by: '00000000-0000-4000-8000-000000000000' }, { split: [] }, { split: ['nope'] }, { spent_on: '2027-13-40' }];
  for (const b of bads) assert.equal((await post(t.token, Object.assign({ title: 'x', amount: 10, paid_by: t.me.id, split: all }, b))).status, 400, JSON.stringify(b));
  assert.equal((await post(vw.token, { title: 'x', amount: 5, paid_by: vw.id, split: all })).status, 403, 'viewers cannot add');
  const cents = await post(ed.token, { title: 'Tolls', amount: 0.1 + 0.2, paid_by: ed.id, split: [ed.id] });
  assert.equal(cents.json.expense.amount, 0.3, 'whole cents, no float drift');
  const up = await api('PATCH', '/trips/' + t.id + '/expenses/' + e.id, { token: ed.token, body: { amount: 99, split: [t.me.id, ed.id] } });
  assert.equal(up.json.expense.amount, 99); assert.equal(up.json.expense.title, 'Dinner at Casa Lucio'); assert.equal(up.json.expense.split.length, 2);
  const s = await api('GET', '/trips/' + t.id + '/state', { token: vw.token });
  assert.equal(s.json.expenses.length, 2);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/expenses/' + e.id, { token: vw.token })).status, 403);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/expenses/' + e.id, { token: ed.token })).status, 200);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/expenses/' + e.id, { token: ed.token })).status, 404);
  // a plan that does not belong to this trip is ignored; a person who leaves does not break the list
  const other = await newTrip();
  const foreign = (await api('POST', '/trips/' + other.id + '/items', { token: other.token, body: { type: 'note', title: 'n' } })).json.item;
  const linked = await post(t.token, { title: 'Linked', amount: 5, paid_by: t.me.id, split: [t.me.id], item_id: foreign.id });
  assert.equal(linked.json.expense.item_id, null);
  await api('DELETE', '/trips/' + t.id + '/members/' + ed.id, { token: t.token });
  const after = await api('GET', '/trips/' + t.id + '/state', { token: t.token });
  assert.equal(after.json.expenses.find((x) => x.title === 'Tolls').paid_by, null);
});

test('files list shows uploads, hides covers, and respects who may delete', async () => {
  const t = await newTrip();
  const ed = await joined(t, 'editor', 'Ed'), vw = await joined(t, 'viewer', 'Vi');
  const a = (await upload(t, ed.token, PNG, 'image/png', 'pic.png')).json.blob;
  const pdf = (await upload(t, t.token, Buffer.from('%PDF-1.4 x'), 'application/pdf', 'Ticket.pdf')).json.blob;
  await api('POST', '/trips/' + t.id + '/messages', { token: ed.token, body: { thread: 'trip', body: '', blobId: a.id } });
  const cover = (await upload(t, t.token, PNG, 'image/png', 'cover.png')).json.blob;
  await api('PATCH', '/trips/' + t.id, { token: t.token, body: { cover_blob: cover.id } });
  const list = await api('GET', '/trips/' + t.id + '/files', { token: vw.token });
  assert.deepEqual(list.json.files.map((f) => f.name).sort(), ['Ticket.pdf', 'pic.png']);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/files/' + pdf.id, { token: ed.token })).status, 403, 'not their file');
  assert.equal((await api('DELETE', '/trips/' + t.id + '/files/' + a.id, { token: ed.token })).status, 200);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/files/' + pdf.id, { token: t.token })).status, 200, 'owners can remove any');
  assert.equal((await call('GET', '/api/blobs/' + a.id)).status, 404);
  const msgs = (await api('GET', '/trips/' + t.id + '/messages?thread=trip', { token: t.token })).json.messages.filter((m) => m.kind === 'text');
  assert.equal(msgs.length, 0, 'an attachment-only message disappears with its file');
});

/* ---------- packing list and message search ---------- */
test('packing list: add, tick, assign, and who may', async () => {
  const t = await newTrip();
  const ed = await joined(t, 'editor', 'Ed'), vw = await joined(t, 'viewer', 'Vi');
  const add = (tok, b) => api('POST', '/trips/' + t.id + '/packing', { token: tok, body: b });
  const p = await add(t.token, { title: 'Passports', category: 'Documents', assigned_to: ed.id });
  assert.equal(p.status, 200); assert.equal(p.json.item.category, 'Documents'); assert.equal(p.json.item.assigned_to, ed.id); assert.equal(p.json.item.done, false);
  assert.equal((await add(t.token, { title: 'Socks', category: 'Made up' })).json.item.category, '', 'unknown category is dropped');
  assert.equal((await add(t.token, { title: '' })).status, 400);
  assert.equal((await add(t.token, { title: 'x', assigned_to: '00000000-0000-4000-8000-000000000000' })).status, 400);
  assert.equal((await add(vw.token, { title: 'Hat' })).status, 403, 'viewers cannot add');
  const id = p.json.item.id, patch = (tok, b) => api('PATCH', '/trips/' + t.id + '/packing/' + id, { token: tok, body: b });
  const tick = await patch(vw.token, { done: true });
  assert.equal(tick.status, 200, 'viewers may tick'); assert.equal(tick.json.item.done, true); assert.equal(tick.json.item.done_by, vw.id);
  assert.equal((await patch(vw.token, { title: 'Renamed' })).status, 403, 'but not rename');
  assert.equal((await patch(ed.token, { title: 'Passports + visas', done: false })).json.item.done_by, null);
  await api('PATCH', '/trips/' + t.id, { token: t.token, body: { viewers_chat: false } });
  assert.equal((await patch(vw.token, { done: true })).status, 403, 'chat off also stops ticking');
  const s = await api('GET', '/trips/' + t.id + '/state', { token: ed.token });
  assert.equal(s.json.packing.length, 2);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/packing/' + id, { token: vw.token })).status, 403);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/packing/' + id, { token: ed.token })).status, 200);
  assert.equal((await api('DELETE', '/trips/' + t.id + '/packing/' + id, { token: ed.token })).status, 404);
  await api('DELETE', '/trips/' + t.id + '/members/' + ed.id, { token: t.token });
  const after = await api('GET', '/trips/' + t.id + '/state', { token: t.token });
  assert.ok(after.json.packing.every((x) => x.assigned_to !== ed.id));
});

test('message search only finds what the person may read', async () => {
  const t = await newTrip();
  const a = await joined(t, 'editor', 'Amy'), b = await joined(t, 'editor', 'Bo');
  const send = (tok, thread, body) => api('POST', '/trips/' + t.id + '/messages', { token: tok, body: { thread, body } });
  await send(t.token, 'trip', 'Dinner at Casa Lucio?');
  await send(t.token, a.id, 'Secret: Casa Lucio surprise');
  await send(a.token, 'trip', '100% sure about the paella');
  const search = (tok, q) => api('GET', '/trips/' + t.id + '/search?q=' + encodeURIComponent(q), { token: tok });
  assert.equal((await search(t.token, 'casa lucio')).json.messages.length, 2);
  assert.equal((await search(a.token, 'casa lucio')).json.messages.length, 2, 'Amy is in the private chat');
  assert.equal((await search(b.token, 'casa lucio')).json.messages.length, 1, 'Bo sees only the group message');
  assert.equal((await search(b.token, 'c')).json.messages.length, 0, 'too short');
  assert.equal((await search(t.token, '100%')).json.messages.length, 1, 'percent sign is literal');
  assert.equal((await search(t.token, '%%')).json.messages.length, 0);
  assert.equal((await api('GET', '/trips/' + t.id + '/search?q=casa')).status, 401);
});

test('AI: read a booking, find a flight, calendar files are free, viewers cannot, and the daily cap holds', async () => {
  const t = await newTrip();
  const v = await joined(t, 'viewer', 'Vic');
  const st = await api('GET', '/trips/' + t.id + '/ai/status', { token: t.token });
  assert.equal(st.json.enabled, true); assert.equal(st.json.resting, false);
  const r = await api('POST', '/trips/' + t.id + '/ai/read', { token: t.token, body: { text: 'Air Canada booking 7XK2PQ' } });
  assert.equal(r.status, 200); assert.equal(r.json.found.length, 3);
  const hotel = r.json.found.find((x) => x.item.type === 'hotel');
  assert.equal(hotel.price, 4650); assert.equal(hotel.item.data.room, 'Family suite');
  assert.equal((await api('POST', '/trips/' + t.id + '/ai/read', { token: v.token, body: { text: 'x' } })).status, 403, 'viewers cannot use AI');
  const f = await api('POST', '/trips/' + t.id + '/ai/flight', { token: t.token, body: { query: 'AC 880, Jun 4' } });
  assert.equal(f.json.found[0].item.data.flightNo, 'AC 880'); assert.match(f.json.found[0].extra, /9 h 35/);
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Hotel stay - Shangri-La Paris\nDTSTART;VALUE=DATE:' + t.trip.start_date.replace(/-/g, '') + '\nLOCATION:Paris\nDESCRIPTION:Confirmation 88213X\nEND:VEVENT\nEND:VCALENDAR';
  const c = await api('POST', '/trips/' + t.id + '/ai/read', { token: t.token, body: { text: ics } });
  assert.equal(c.json.source, 'calendar'); assert.equal(c.json.found[0].item.type, 'hotel'); assert.equal(c.json.found[0].item.confirmation, '88213X');
  const spend = await triply.db.q("select count(*)::int as n from ai_usage where trip_id = $1", [t.id]);
  assert.equal(spend.rows[0].n, 2, 'the calendar file did not use AI');
  const bulk = await api('POST', '/trips/' + t.id + '/items/bulk', { token: t.token, body: { items: r.json.found.map((x) => x.item), label: 'from a booking' } });
  assert.equal(bulk.status, 200); assert.equal(bulk.json.items.length, 3);
  // 2 free trip plans per person, then ask the owner for more
  const planIt = () => api('POST', '/trips/' + t.id + '/ai/plan', { token: t.token, body: { description: 'Paris and Rome with kids' } });
  const p1 = await planIt();
  assert.equal(p1.status, 200); assert.equal(p1.json.travelers, 4, 'travelers worked out from the description'); assert.equal(p1.json.items.length, 5);
  assert.equal((await planIt()).status, 200);
  const p3 = await planIt(); assert.equal(p3.status, 429); assert.equal(p3.json.error.code, 'ai_user_limit');
  assert.equal((await api('GET', '/trips/' + t.id + '/ai/status', { token: t.token })).json.left.myPlans, 0);
  assert.equal((await api('POST', '/trips/' + t.id + '/ai/request', { token: t.token, body: { message: 'Planning a family reunion!' } })).status, 200);
  assert.equal((await api('POST', '/trips/' + t.id + '/ai/request', { token: t.token, body: { message: 'again' } })).json.error.code, 'already_asked');
  const me = (await api('GET', '/trips/' + t.id + '/state', { token: t.token })).json.me.id;
  await triply.db.q('insert into ai_grants (member_id, extra) values ($1, 1)', [me]);
  assert.equal((await planIt()).status, 200, 'the owner gave one more');
  // the whole-site daily cap
  await triply.db.q("insert into ai_usage (day, kind, micro_usd) values ((now() at time zone 'America/Vancouver')::date, 'other', 5000000)");
  const cap = await api('POST', '/trips/' + t.id + '/ai/read', { token: t.token, body: { text: 'x' } });
  assert.equal(cap.status, 429); assert.equal(cap.json.error.code, 'ai_resting');
  assert.equal((await api('GET', '/trips/' + t.id + '/ai/status', { token: t.token })).json.resting, true);
});
