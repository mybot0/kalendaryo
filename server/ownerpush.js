'use strict';
/*
 * Owner alerts: a phone or computer notification to the owner when someone writes in "Help & ideas".
 * Standard Web Push (RFC 8030), with our own code and Node's built-in crypto, no extra packages:
 *   - VAPID sign-in (RFC 8292): an ES256 key pair the server makes once and keeps in the database.
 *   - Message encryption "aes128gcm" (RFC 8188 + RFC 8291), so only the owner's device can read it.
 * Only the owner's own devices are stored here. People using the apps never get these alerts.
 * An alert can never break a person's message: every send is caught and logged.
 */
const crypto = require('crypto');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS owner_push_devices (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS owner_push_vapid (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_d TEXT NOT NULL
);`;

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Encrypt one message for one device (RFC 8291, one record).
function encrypt(payload, p256dh, authSecret) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  if (uaPublic.length !== 65 || auth.length < 16) throw new Error('bad device keys');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(auth, secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = 65;
  return Buffer.concat([head, asPublic, body]);
}

function createOwnerPush({ db, fetchFn = (...a) => fetch(...a) }) {
  const ready = db.q(SCHEMA).catch((e) => { console.error('[alerts] tables', e.message); });
  let keys = null;
  async function vapid() {
    await ready;
    if (keys) return keys;
    let r = await db.q('SELECT public_key, private_d FROM owner_push_vapid WHERE id = 1');
    if (!r.rowCount) {
      const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const j = privateKey.export({ format: 'jwk' });
      const pub = b64u(Buffer.concat([Buffer.from([4]), unb64u(j.x), unb64u(j.y)]));
      await db.q('INSERT INTO owner_push_vapid (id, public_key, private_d) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING', [pub, j.d]);
      r = await db.q('SELECT public_key, private_d FROM owner_push_vapid WHERE id = 1');
    }
    const pub = r.rows[0].public_key, raw = unb64u(pub);
    const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: r.rows[0].private_d, x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) }, format: 'jwk' });
    keys = { pub, key };
    return keys;
  }
  function jwt(aud, key) {
    const enc = (o) => b64u(Buffer.from(JSON.stringify(o)));
    const data = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://www.kalendaryo.co' });
    return data + '.' + b64u(crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }));
  }

  async function publicKey() { return (await vapid()).pub; }

  async function add(sub, label) {
    await ready;
    const ep = sub && typeof sub.endpoint === 'string' ? sub.endpoint : '';
    const k = (sub && sub.keys) || {};
    if (!/^https:\/\/[^\s]{10,2000}$/.test(ep) || typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) return { ok: false };
    await db.q(`INSERT INTO owner_push_devices (endpoint, p256dh, auth, label) VALUES ($1,$2,$3,$4)
      ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, label = EXCLUDED.label`, [ep, k.p256dh, k.auth, String(label || '').slice(0, 60)]);
    return { ok: true, devices: await count() };
  }
  async function remove(endpoint) { await ready; await db.q('DELETE FROM owner_push_devices WHERE endpoint = $1', [String(endpoint || '')]); return { ok: true, devices: await count() }; }
  async function count() { await ready; return (await db.q('SELECT count(*)::int AS n FROM owner_push_devices')).rows[0].n; }

  // Send to every owner device. Returns how many got it. Never throws.
  async function notify(msg) {
    try {
      const { pub, key } = await vapid();
      const devs = (await db.q('SELECT endpoint, p256dh, auth FROM owner_push_devices')).rows;
      let sent = 0;
      await Promise.all(devs.map(async (d) => {
        try {
          const body = encrypt(JSON.stringify(msg), d.p256dh, d.auth);
          const res = await fetchFn(d.endpoint, { method: 'POST', body, headers: {
            Authorization: 'vapid t=' + jwt(new URL(d.endpoint).origin, key) + ', k=' + pub,
            'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' }, signal: AbortSignal.timeout(10000) });
          await res.arrayBuffer().catch(() => {}); // finish the reply so the connection is freed
          if (res.status === 404 || res.status === 410) await db.q('DELETE FROM owner_push_devices WHERE endpoint = $1', [d.endpoint]); // that device turned alerts off
          else if (res.ok) { sent++; await db.q('UPDATE owner_push_devices SET last_ok = now() WHERE endpoint = $1', [d.endpoint]); }
          else console.error('[alerts] push', res.status);
        } catch (e) { console.error('[alerts] push', e.message); }
      }));
      return sent;
    } catch (e) { console.error('[alerts]', e.message); return 0; }
  }

  function install(r, { json, send, ownerGuard }) {
    r.get('/api/owner/push', async (req, res) => { ownerGuard(req); send(res, 200, { key: await publicKey(), devices: await count() }); });
    r.post('/api/owner/push/add', json, async (req, res) => { ownerGuard(req); send(res, 200, await add(req.body && req.body.sub, req.body && req.body.label)); });
    r.post('/api/owner/push/remove', json, async (req, res) => { ownerGuard(req); send(res, 200, await remove(req.body && req.body.endpoint)); });
    r.post('/api/owner/push/test', async (req, res) => { ownerGuard(req); send(res, 200, { sent: await notify({ title: 'Kalendaryo alerts are on 🔔', body: 'This is a test. You will get an alert like this when someone writes in Help & ideas.', url: '/owner', tag: 'test' }) }); });
  }

  return { install, notify, publicKey, add, remove, count };
}

module.exports = { createOwnerPush, encrypt };
