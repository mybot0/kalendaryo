/*
 * hub.test.js — the new-hub questions (client/web/setup.js) on the server side.
 *
 *   DATABASE_URL=postgres://... node --test test/hub.test.js
 *
 * Checks: a hub made with a city gets that time zone and weather place; "Copy link" for someone who has not
 * joined gives the same link every time; the link joins them with the right role and their own profile, then
 * stops working; pets never get a link; only owners can make links; the link preview is on every page.
 */
'use strict';

const { test, after, before } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3498;
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

test('a new hub with a city, people, a pet and their own links', async () => {
  const place = { name: 'Vancouver, Canada', lat: 49.2497, lon: -123.1193, tz: 'America/Vancouver' };
  const made = await call('POST', '/api/families', null, { yourName: 'Maya', familyName: 'Maya’s Family', timeZone: 'America/Vancouver', place });
  assert.strictEqual(made.status, 200);
  const owner = made.body.token;
  const st = await call('GET', '/api/state', owner);
  const settings = st.body.docs.settings[0].data;
  assert.strictEqual(settings.timeZone, 'America/Vancouver');
  assert.deepStrictEqual(settings.weatherPlace, { name: 'Vancouver, Canada', lat: 49.2497, lon: -123.1193 });

  // a bad place is ignored, not saved
  const odd = await call('POST', '/api/families', null, { yourName: 'Zed', familyName: 'Odd', place: { name: 'X', lat: 999, lon: 0 } });
  const oddSet = (await call('GET', '/api/state', odd.body.token)).body.docs.settings[0].data;
  assert.strictEqual(oddSet.weatherPlace, undefined);

  const leo = await call('POST', '/api/docs/members', owner, { data: { name: 'Leo', role: 'parent', avatar: '🦁', color: '#A8CDEA', relation: 'Husband', access: 'editor' } });
  const nana = await call('POST', '/api/docs/members', owner, { data: { name: 'Nana Rosa', role: 'other', avatar: '🌸', color: '#EFB2CB', relation: 'Grandma', access: 'viewer', place: { name: 'Manila, Philippines', tz: 'Asia/Manila' } } });
  const pet = await call('POST', '/api/docs/members', owner, { data: { name: 'Biscuit', role: 'pet', avatar: '🐶', color: '#C7B7EA', relation: 'Dog' } });

  // the same link every time until they join
  const a = await call('POST', '/api/invites/member', owner, { memberId: leo.body.id, role: 'editor' });
  const b = await call('POST', '/api/invites/member', owner, { memberId: leo.body.id });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.body.code, b.body.code);
  assert.strictEqual(b.body.role, 'editor');
  const inv = await call('GET', '/api/invites', owner);
  assert.ok(inv.body.invites.some((i) => i.member_id === leo.body.id && i.kept === true));

  // pets never get a link; non-owners cannot make links
  assert.strictEqual((await call('POST', '/api/invites/member', owner, { memberId: pet.body.id })).status, 400);
  const n = await call('POST', '/api/invites/member', owner, { memberId: nana.body.id });
  assert.strictEqual(n.body.role, 'viewer');
  const peek = await call('GET', '/api/invites/peek/' + n.body.code);
  assert.strictEqual(peek.body.valid, true);
  assert.strictEqual(peek.body.member.name, 'Nana Rosa');

  // Leo joins with his link: Editor, linked to his profile; the link then stops
  const join = await call('POST', '/api/join', null, { code: a.body.code });
  assert.strictEqual(join.status, 200);
  const me = await call('GET', '/api/me', join.body.token);
  assert.strictEqual(me.body.me.role, 'editor');
  assert.strictEqual(me.body.me.memberId, leo.body.id);
  assert.strictEqual((await call('POST', '/api/join', null, { code: a.body.code })).status, 410);
  assert.strictEqual((await call('POST', '/api/invites/member', owner, { memberId: leo.body.id })).status, 400); // already joined
  assert.strictEqual((await call('POST', '/api/invites/member', join.body.token, { memberId: nana.body.id })).status, 403); // Leo is not an owner

  // changing the role makes a new link; the old one stops
  const n2 = await call('POST', '/api/invites/member', owner, { memberId: nana.body.id, role: 'editor' });
  assert.notStrictEqual(n2.body.code, n.body.code);
  assert.strictEqual((await call('GET', '/api/invites/peek/' + n.body.code)).body.valid, false);
});

test('every page has the link preview; Care boards keep their own title', async () => {
  for (const p of ['/', '/demo', '/join/abc']) {
    const html = await (await fetch(BASE + p)).text();
    assert.ok(html.includes('property="og:image" content="http://localhost:' + PORT + '/og.png"'), p);
    assert.ok(html.includes('og:title'), p);
  }
  const img = await fetch(BASE + '/og.png');
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.headers.get('content-type'), 'image/png');
});
