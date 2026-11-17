/*
 * care.test.js — Care (server/care.js): the Care board link and what it may see and do.
 *
 *   DATABASE_URL=postgres://... node --test test/care.test.js
 *
 * Starts the real server and checks: a family makes a Care board link for one person; the link sees only that
 * person's medicines, doses, notes and events; it can mark pills, say "I bought", ask for help and add a
 * medicine (when allowed), and nothing else; "Make a new link" stops the old link right away.
 */
'use strict';

const { test, after, before } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3497;
const BASE = 'http://localhost:' + PORT;
let proc;

before(() => new Promise((resolve, reject) => {
  proc = spawn('node', ['server/index.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), OWNER_GEO: '0', TRIPLY_ENABLED: '' }) });
  let out = '';
  const t = setTimeout(() => reject(new Error('server did not start: ' + out)), 15000);
  proc.stdout.on('data', (d) => { out += d; if (out.includes('Kalendaryo is running')) { clearTimeout(t); resolve(); } });
  proc.stderr.on('data', (d) => { out += d; });
}));
after(() => proc && proc.kill());

async function call(method, url, token, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
  return { status: r.status, body: j };
}
const put = (t, col, id, data) => call('PUT', '/api/docs/' + col + '/' + id, t, { data });
const today = new Date().toISOString().slice(0, 10);

let owner, nana, maya, board, link1;
test('a family sets up Care for Nana', async () => {
  const f = await call('POST', '/api/families', null, { familyName: 'Care test', yourName: 'Maya' });
  assert.strictEqual(f.status, 200);
  owner = f.body.token;
  const st = await call('GET', '/api/state', owner);
  maya = st.body.docs.members[0].id;
  nana = 'nana1';
  assert.strictEqual((await put(owner, 'members', nana, { name: 'Nana Rosa', role: 'other', avatar: '🌻', color: '#F1DC8B' })).status, 200);
  assert.strictEqual((await put(owner, 'meds', 'm1', { who: nana, name: 'Amlodipine', kind: 'bp', times: ['08:00'], each: 1, count: 30, countAt: '2026-01-01T00:00:00.000Z', box: 30, start: today })).status, 200);
  assert.strictEqual((await put(owner, 'meds', 'm2', { who: maya, name: 'Maya vitamins', kind: 'vit', times: ['08:00'], each: 1, count: 30, box: 30, start: today })).status, 200);
  assert.strictEqual((await put(owner, 'events', 'e1', { title: 'Doctor', date: today, start: '14:00', end: '15:00', memberIds: [nana, maya] })).status, 200);
  assert.strictEqual((await put(owner, 'events', 'e2', { title: 'Maya only', date: today, memberIds: [maya] })).status, 200);
  assert.strictEqual((await put(owner, 'notes', 'n1', { title: 'Private note' })).status, 200);
});

test('the family makes the Care board link (editors only)', async () => {
  const r = await call('POST', '/api/care/links', owner, { memberId: nana });
  assert.strictEqual(r.status, 200);
  assert.match(r.body.link.url, /\/care\/cb[A-Za-z0-9_-]+$/);
  link1 = r.body.link.url;
  board = link1.split('/care/')[1];
  const again = await call('POST', '/api/care/links', owner, { memberId: nana });
  assert.strictEqual(again.body.link.url, link1, 'asking again shows the same link');
  const list = await call('GET', '/api/care/links', owner);
  assert.strictEqual(list.body.links.length, 1);
  assert.strictEqual((await call('POST', '/api/care/links', owner, { memberId: 'nobody' })).status, 400);
});

test('the Care board page and its home-screen app', async () => {
  const p = await fetch(BASE + '/care/' + board);
  const html = await p.text();
  assert.strictEqual(p.status, 200);
  assert.match(html, /<title>Care board<\/title>/);
  assert.match(html, /apple-touch-icon/);
  const m = await call('GET', '/care/' + board + '/app.webmanifest');
  assert.strictEqual(m.body.name, 'Care board');
  assert.strictEqual(m.body.start_url, '/care/' + board);
  const icon = await fetch(BASE + '/care-icons/180.png');
  assert.strictEqual(icon.headers.get('content-type'), 'image/png');
  assert.strictEqual((await fetch(BASE + '/care/not-a-board', { redirect: 'manual' })).status, 302);
});

test('the board sees only its own person', async () => {
  const me = await call('GET', '/api/me', board);
  assert.strictEqual(me.body.me.role, 'care');
  assert.strictEqual(me.body.me.memberId, nana);
  const st = await call('GET', '/api/state', board);
  const d = st.body.docs;
  assert.deepStrictEqual(d.meds.map((x) => x.id), ['m1']);
  assert.deepStrictEqual(d.events.map((x) => x.id), ['e1']);
  assert.ok(!d.notes, 'no notes');
  assert.ok(d.members.length >= 2 && d.settings.length === 1);
});

test('the board can mark pills, undo, say I bought, ask for help', async () => {
  const id = 'm1~' + today + '~0800';
  assert.strictEqual((await put(board, 'doses', id, { who: nana, med: 'm1', date: today, time: '08:00', status: 'taken', at: new Date().toISOString(), by: 'board' })).status, 200);
  assert.strictEqual((await call('DELETE', '/api/docs/doses/' + id, board)).status, 200);
  const st = await call('GET', '/api/state', owner);
  const m1 = st.body.docs.meds.find((x) => x.id === 'm1').data;
  assert.strictEqual((await put(board, 'meds', 'm1', Object.assign({}, m1, { count: 60, countAt: new Date().toISOString() }))).status, 200);
  assert.strictEqual((await call('POST', '/api/docs/carelog', board, { data: { who: nana, kind: 'help', at: new Date().toISOString(), by: 'board' } })).status, 200);
});

test('the board cannot do anything else', async () => {
  const st = await call('GET', '/api/state', owner);
  const m1 = st.body.docs.meds.find((x) => x.id === 'm1').data;
  const no = async (r, why) => assert.strictEqual((await r).status, 403, why);
  // changing other fields of a medicine is ignored: only the pill count is taken
  assert.strictEqual((await put(board, 'meds', 'm1', Object.assign({}, m1, { times: ['09:00'], name: 'Hacked', count: 55 }))).status, 200);
  const after1 = (await call('GET', '/api/state', owner)).body.docs.meds.find((x) => x.id === 'm1').data;
  assert.deepStrictEqual([after1.times, after1.name, after1.count], [['08:00'], 'Amlodipine', 55]);
  await no(put(board, 'meds', 'm1', Object.assign({}, m1, { count: 'lots' })), 'a count that is not a number');
  await no(put(board, 'meds', 'm2', { who: maya, name: 'x', times: ['08:00'] }), 'touch Maya’s medicine');
  await no(put(board, 'doses', 'm2~x', { who: maya, med: 'm2', date: today, time: '08:00', status: 'taken' }), 'mark Maya’s pills');
  await no(put(board, 'notes', 'n2', { title: 'hi' }), 'write notes');
  await no(put(board, 'events', 'e3', { title: 'x', memberIds: [nana] }), 'add events');
  await no(call('POST', '/api/docs/carelog', board, { data: { who: nana, kind: 'reply', text: 'x' } }), 'family-only note');
  await no(call('DELETE', '/api/docs/meds/m1', board), 'delete a medicine');
  await no(call('GET', '/api/people', board), 'see people with access');
  await no(call('GET', '/api/care/links', board), 'see the links');
  await no(call('POST', '/api/invites', board, { role: 'owner' }), 'invite');
  await no(call('PATCH', '/api/me', board, { name: 'x' }), 'rename');
  await no(call('POST', '/api/docs/meds', board, { data: { who: nana, name: 'X', times: ['08:00'] } }), 'add a medicine without addedBy board');
});

test('Nana adds a medicine, unless the family turned it off', async () => {
  const add = () => call('POST', '/api/docs/meds', board, { data: { who: nana, name: 'Losartan', kind: 'bp', times: ['08:00', '20:00'], each: 1, count: 30, box: 30, start: today, addedBy: 'board' } });
  assert.strictEqual((await add()).status, 200);
  const st = await call('GET', '/api/state', owner);
  const s = st.body.docs.settings.find((x) => x.id === 'main').data;
  s.care = { boards: { [nana]: { letAdd: false } } };
  assert.strictEqual((await put(owner, 'settings', 'main', s)).status, 200);
  assert.strictEqual((await add()).status, 403);
});

test('Make a new link: the old one stops right away', async () => {
  const r = await call('POST', '/api/care/links', owner, { memberId: nana, renew: true });
  assert.notStrictEqual(r.body.link.url, link1);
  assert.strictEqual((await call('GET', '/api/me', board)).status, 401);
  const nb = r.body.link.url.split('/care/')[1];
  assert.strictEqual((await call('GET', '/api/me', nb)).status, 200);
});
