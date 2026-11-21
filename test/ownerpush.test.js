'use strict';
/*
 * Owner alerts (server/ownerpush.js), end to end:
 *   DATABASE_URL=postgres://... node --test test/ownerpush.test.js
 * Starts the real server and a fake push service (HTTPS, made-up certificate), then checks:
 * a person's message sends the owner an alert that is signed (VAPID) and encrypted (aes128gcm) the standard way,
 * the owner's own replies send nothing, a device that turned alerts off is removed, and only the owner key works.
 */
const { test, after, before } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3496, PUSH_PORT = 3497;
const BASE = 'http://localhost:' + PORT;
const KEY = 'owner-push-test-key';
let proc, push;
const got = []; // what the fake push service received
let goneDevice = '/gone';

const b64u = (b) => Buffer.from(b).toString('base64url');

before(async () => {
  // A made-up certificate for the fake push service (push services must be HTTPS).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalpush-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
  push = https.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, (req, res) => {
    const parts = []; req.on('data', (d) => parts.push(d));
    req.on('end', () => { got.push({ path: req.url, headers: req.headers, body: Buffer.concat(parts) }); res.writeHead(req.url === goneDevice ? 410 : 201); res.end(); });
  });
  await new Promise((r) => push.listen(PUSH_PORT, r));
  await new Promise((resolve, reject) => {
    proc = spawn('node', ['server/index.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), OWNER_KEY: KEY, OWNER_GEO: '0', TRIPLY_ENABLED: '', NODE_TLS_REJECT_UNAUTHORIZED: '0' }) });
    let out = '';
    const t = setTimeout(() => reject(new Error('server did not start: ' + out)), 15000);
    proc.stdout.on('data', (d) => { out += d; if (out.includes('Kalendaryo is running')) { clearTimeout(t); resolve(); } });
    proc.stderr.on('data', (d) => { out += d; });
  });
});
after(() => { if (proc) proc.kill(); if (push) push.close(); });

const req = (method, p, { body, key, token } = {}) => fetch(BASE + p, {
  method,
  headers: Object.assign({ 'User-Agent': 'test-browser' }, body ? { 'Content-Type': 'application/json' } : {}, key ? { 'X-Owner-Key': key } : {}, token ? { Authorization: 'Bearer ' + token } : {}),
  body: body ? JSON.stringify(body) : undefined
});
const wait = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } return null; };

// A pretend owner device: its own keys, like a phone's browser makes.
function device(name) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint: 'https://localhost:' + PUSH_PORT + '/' + name, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } };
}
// Decrypt like the phone does (RFC 8291 / RFC 8188).
function decrypt(dev, buf) {
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const salt = buf.subarray(0, 16), idlen = buf[20], asPublic = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
  const secret = dev.ecdh.computeSecret(asPublic);
  const ikm = hmac(hmac(dev.auth, secret), Buffer.concat([Buffer.from('WebPush: info\0'), dev.ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.strictEqual(plain[plain.length - 1], 2, 'last-record marker');
  return JSON.parse(plain.subarray(0, plain.length - 1).toString());
}
function checkVapid(headers, serverKey) {
  assert.strictEqual(headers['content-encoding'], 'aes128gcm');
  assert.ok(Number(headers.ttl) > 0);
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(headers.authorization || '');
  assert.ok(m, 'VAPID header');
  assert.strictEqual(m[2], serverKey);
  const [h, p, sig] = m[1].split('.');
  const raw = Buffer.from(serverKey, 'base64url');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + p), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'signature is valid');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.strictEqual(claims.aud, 'https://localhost:' + PUSH_PORT);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600, 'expires within a day');
  assert.ok(claims.sub, 'has a contact');
}

test('alert settings need the owner key', async () => {
  assert.strictEqual((await req('GET', '/api/owner/push')).status, 404);
  assert.strictEqual((await req('POST', '/api/owner/push/add', { body: { sub: device('x').sub }, key: 'nope' })).status, 404);
  assert.strictEqual((await req('POST', '/api/owner/push/test', { key: 'nope' })).status, 404);
});

test('the Home Screen app files are there', async () => {
  const sw = await req('GET', '/owner-sw.js');
  assert.strictEqual(sw.status, 200);
  assert.ok((await sw.text()).includes('showNotification'));
  const man = await (await req('GET', '/owner.webmanifest')).json();
  assert.strictEqual(man.start_url, '/owner');
  assert.strictEqual(man.display, 'standalone');
  for (const n of [180, 192, 512]) assert.strictEqual((await req('GET', '/owner-icons/' + n + '.png')).status, 200);
  assert.strictEqual((await req('GET', '/owner-icons/1.png')).status, 404);
});

test('a person writes: the owner gets a signed, encrypted alert; the owner replying sends nothing', async () => {
  const info = await (await req('GET', '/api/owner/push', { key: KEY })).json();
  assert.strictEqual(Buffer.from(info.key, 'base64url').length, 65, 'public key is a P-256 point');
  const phone = device('phone');
  const added = await (await req('POST', '/api/owner/push/add', { body: { sub: phone.sub, label: 'iPhone' }, key: KEY })).json();
  assert.ok(added.ok);
  assert.strictEqual((await (await req('POST', '/api/owner/push/add', { body: { sub: { endpoint: 'http://not-https' } }, key: KEY })).json()).ok, false, 'bad devices are refused');

  const fam = await (await req('POST', '/api/families', { body: { yourName: 'Maya', familyName: 'Push test home' } })).json();
  got.length = 0;
  const sent = await req('POST', '/api/help', { token: fam.token, body: { body: 'Hello! Can you add a dark mode?', tag: 'idea' } });
  assert.strictEqual(sent.status, 200, 'the message is saved');
  const hit = await wait(() => got.find((g) => g.path === '/phone'));
  assert.ok(hit, 'the alert reached the push service');
  checkVapid(hit.headers, info.key);
  const msg = decrypt(phone, hit.body);
  assert.strictEqual(msg.title, 'Maya · Kalendaryo · Push test home');
  assert.strictEqual(msg.body, '💡 Hello! Can you add a dark mode?');
  assert.match(msg.url, /^\/owner#t=\d+$/);

  const id = Number(msg.url.split('=')[1]);
  got.length = 0;
  await req('POST', '/api/help', { token: fam.token, body: { body: 'One more thing!' } });
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(got.length, 0, 'a burst of messages in the same chat buzzes only once a minute');
  assert.strictEqual((await req('POST', '/api/owner/help/' + id + '/reply', { body: { body: 'Thanks Maya!' }, key: KEY })).status, 200);
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(got.length, 0, 'no alert for your own reply');
});

test('the test button works, and a device that turned alerts off is removed', async () => {
  const laptop = device('laptop'), gone = device('gone');
  await req('POST', '/api/owner/push/add', { body: { sub: laptop.sub, label: 'Windows' }, key: KEY });
  const before = (await (await req('POST', '/api/owner/push/add', { body: { sub: gone.sub, label: 'Old phone' }, key: KEY })).json()).devices;
  goneDevice = '/gone';
  got.length = 0;
  const r = await (await req('POST', '/api/owner/push/test', { key: KEY })).json();
  assert.ok(r.sent >= 2, 'sent to the working devices');
  const hit = got.find((g) => g.path === '/laptop');
  assert.strictEqual(decrypt(laptop, hit.body).tag, 'test');
  const after = (await (await req('GET', '/api/owner/push', { key: KEY })).json()).devices;
  assert.strictEqual(after, before - 1, 'the gone device was removed');
  const off = await (await req('POST', '/api/owner/push/remove', { body: { endpoint: laptop.sub.endpoint }, key: KEY })).json();
  assert.strictEqual(off.devices, after - 1, 'Turn off removes this device');
});
