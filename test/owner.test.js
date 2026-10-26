/*
 * owner.test.js — the owner view (server/owner.js).
 *
 *   DATABASE_URL=postgres://... node --test test/owner.test.js
 *
 * Starts the real server with OWNER_KEY set and checks: the key is required, visits are counted once per
 * device per day, homes show up, and viewing a home is read-only and leaves no trace.
 */
'use strict';

const { test, after, before } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3495;
const BASE = 'http://localhost:' + PORT;
const KEY = 'owner-test-key-123';
let proc;

before(() => new Promise((resolve, reject) => {
  proc = spawn('node', ['server/index.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), OWNER_KEY: KEY, OWNER_GEO: '0', TRIPLY_ENABLED: '' }) });
  let out = '';
  const t = setTimeout(() => reject(new Error('server did not start: ' + out)), 15000);
  proc.stdout.on('data', (d) => { out += d; if (out.includes('Kalendaryo is running')) { clearTimeout(t); resolve(); } });
  proc.stderr.on('data', (d) => { out += d; });
}));
after(() => proc && proc.kill());

const req = (method, p, { body, key, token, ua, ip } = {}) => fetch(BASE + p, {
  method,
  headers: Object.assign({ 'User-Agent': ua || 'test-browser', 'X-Forwarded-For': ip || '203.0.113.9' },
    body ? { 'Content-Type': 'application/json' } : {}, key ? { 'X-Owner-Key': key } : {}, token ? { Authorization: 'Bearer ' + token } : {}),
  body: body ? JSON.stringify(body) : undefined
});
const summary = async () => (await req('GET', '/api/owner/summary', { key: KEY })).json();

test('the owner API is hidden without the right key', async () => {
  assert.strictEqual((await req('GET', '/api/owner/summary')).status, 404);
  assert.strictEqual((await req('GET', '/api/owner/summary', { key: 'nope' })).status, 404);
  assert.strictEqual((await req('POST', '/api/owner/view', { body: { familyId: 'x' }, key: 'nope' })).status, 404);
  const page = await req('GET', '/owner');
  assert.strictEqual(page.status, 200, 'the page itself only asks for the key');
  assert.ok(!(await page.text()).includes(KEY));
});

test('visits are counted once per device per day', async () => {
  const before = (await summary()).tiles.today;
  const run = Math.random().toString(36).slice(2); // new devices every run
  const a1 = await req('GET', '/', { ua: 'phone-a-' + run, ip: '198.51.100.1' });
  const kv = (a1.headers.get('set-cookie') || '').split(';')[0]; // a real browser sends its ID back
  await fetch(BASE + '/', { headers: { 'User-Agent': 'phone-a-' + run, 'X-Forwarded-For': '198.51.100.1', Cookie: kv } });
  await req('GET', '/', { ua: 'laptop-b-' + run, ip: '198.51.100.2' });
  const s = await summary();
  assert.strictEqual(s.tiles.today - before, 2, 'two browsers, three page loads');
  assert.ok(s.visitors_now >= 2);
  assert.strictEqual(s.days.length, 14);
});

test('homes show up, and viewing is read-only with no trace', async () => {
  const fam = await (await req('POST', '/api/families', { body: { yourName: 'Maya', familyName: 'Owner test home' } })).json();
  await req('PUT', '/api/docs/events/e1', { token: fam.token, body: { data: { title: 'Dinner' } } });
  const s = await summary();
  const home = s.homes.find((h) => h.name === 'Owner test home');
  assert.ok(home, 'home listed');
  assert.strictEqual(home.people, 1);
  assert.ok(home.items >= 2, 'settings + event');
  assert.ok(home.last_active, 'last active is known');

  const nope = await req('POST', '/api/owner/view', { body: { familyId: home.id } });
  assert.strictEqual(nope.status, 404, 'no key, no viewing link');
  const { link } = await (await req('POST', '/api/owner/view', { body: { familyId: home.id }, key: KEY })).json();
  assert.match(link, /^\/c\/ov[A-Za-z0-9_-]+$/);
  const vt = link.slice(3);

  const me = await (await req('GET', '/api/me', { token: vt })).json();
  assert.strictEqual(me.me.role, 'viewer');
  assert.strictEqual(me.me.viewing, true);
  assert.strictEqual(me.family.name, 'Owner test home');
  const state = await (await req('GET', '/api/state', { token: vt })).json();
  assert.strictEqual(state.docs.events[0].data.title, 'Dinner', 'the owner can see the home');

  for (const [m, p, body] of [['PUT', '/api/docs/events/e2', { data: { title: 'x' } }], ['DELETE', '/api/docs/events/e1'], ['PATCH', '/api/me', { name: 'Hacker' }], ['POST', '/api/invites', { role: 'owner' }]]) {
    const r = await req(m, p, { token: vt, body });
    assert.strictEqual(r.status, 403, m + ' ' + p + ' is refused while viewing');
  }
  const people = await (await req('GET', '/api/people', { token: fam.token })).json();
  assert.strictEqual(people.people.length, 1, 'viewing does not add anyone to the home');

  const todayBefore = (await summary()).tiles.today;
  await req('GET', link, { ua: 'owner-browser', ip: '192.0.2.77' });
  assert.strictEqual((await summary()).tiles.today, todayBefore, 'opening a home as owner is not counted as a visit');

  assert.strictEqual((await req('GET', '/api/me', { token: 'ov' + 'x'.repeat(32) })).status, 401, 'made-up viewing links do not work');
});

test('bots and link previews are not counted; recent visitors list real visits', async () => {
  const before = (await summary()).tiles.today;
  const run = Math.random().toString(36).slice(2);
  for (const ua of ['facebookexternalhit/1.1', 'WhatsApp/2.23', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Slackbot-LinkExpanding 1.0', 'curl/8.4.0', 'python-requests/2.31']) {
    await req('GET', '/', { ua: ua + ' ' + run, ip: '198.51.100.9' });
  }
  assert.strictEqual((await summary()).tiles.today, before, 'robots leave no visit');
  await req('GET', '/', { ua: 'Mozilla/5.0 (iPhone) real-person-' + run, ip: '198.51.100.10' });
  const s = await summary();
  assert.strictEqual(s.tiles.today, before + 1, 'a real browser is counted');
  assert.ok(Array.isArray(s.recent) && s.recent.length >= 1, 'recent visitors listed');
  assert.strictEqual(s.recent[0].page, 'start');
  assert.ok(s.countries.every((c) => 'city' in c), 'places include the city');
});

test('one browser counts once, even when its internet address changes', async () => {
  const before = (await summary()).tiles.today;
  const ua = 'Mozilla/5.0 (Android) moving-phone-' + Math.random().toString(36).slice(2);
  const first = await req('GET', '/', { ua, ip: '198.51.100.20' });
  const set = first.headers.get('set-cookie') || '';
  assert.match(set, /^kv=[A-Za-z0-9_-]+; Path=\/; Max-Age=31536000; SameSite=Lax; HttpOnly/, 'new browsers get a random ID');
  const kv = set.split(';')[0];
  for (const ip of ['198.51.100.21', '203.0.113.50', '192.0.2.200']) {
    const r = await fetch(BASE + '/', { headers: { 'User-Agent': ua, 'X-Forwarded-For': ip, Cookie: kv } });
    assert.strictEqual(r.headers.get('set-cookie'), null, 'no new ID once it has one');
  }
  assert.strictEqual((await summary()).tiles.today, before + 1, 'four visits from three addresses = one visitor');
});
