/*
 * kal-mount.test.js — checks Triply mounted inside Kalendaryo (touch point A).
 *
 *   DATABASE_URL=postgres://... node --test triply/test/kal-mount.test.js
 *
 * Starts Kalendaryo's real server twice, with TRIPLY_ENABLED off and on, and checks that
 * off behaves like plain Kalendaryo, on serves Triply under /triply, and the two never mix.
 */
'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL to run the tests.'); process.exit(1); }

const procs = [];
after(() => procs.forEach((p) => p.kill()));

function start(port, triply) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, { PORT: String(port), TRIPLY_ENABLED: triply ? '1' : '', NODE_ENV: 'production' });
    const p = spawn('node', ['server/index.js'], { cwd: ROOT, env });
    procs.push(p);
    let out = '';
    const t = setTimeout(() => reject(new Error('server did not start: ' + out)), 15000);
    p.stdout.on('data', (d) => { out += d; if (out.includes('Kalendaryo is running')) { clearTimeout(t); resolve(); } });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (c) => { clearTimeout(t); reject(new Error('server exited ' + c + ': ' + out)); });
  });
}

const get = (port, p) => fetch('http://localhost:' + port + p, { redirect: 'manual' });
const post = (port, p, body) => fetch('http://localhost:' + port + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const FLAG = '<script>window.KAL_TRIPLY=true;</script>';

test('switch off: the site is plain Kalendaryo', async () => {
  await start(3481, false);
  const home = await (await get(3481, '/')).text();
  assert.ok(!home.includes(FLAG), 'no Triply flag on the start page');
  const r = await get(3481, '/triply/');
  assert.strictEqual(r.status, 302, '/triply goes back to the start page');
  assert.strictEqual(r.headers.get('location'), '/');
  const api = await get(3481, '/triply/api/health');
  assert.notStrictEqual(api.status, 200, 'no Triply API');
  const fam = await post(3481, '/api/families', { yourName: 'Ryan', familyName: 'Off test' });
  assert.strictEqual(fam.status, 200, 'Kalendaryo still creates homes');
});

test('switch on: Triply lives under /triply, Kalendaryo is unchanged', async () => {
  await start(3482, true);
  const home = await (await get(3482, '/')).text();
  assert.ok(home.includes(FLAG), 'start page gets the Triply flag');

  const page = await get(3482, '/triply/');
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /Triply/);
  assert.strictEqual((await get(3482, '/triply')).status, 302, '/triply redirects to /triply/');

  const trip = await post(3482, '/triply/api/trips', { name: 'Mount test', start_date: '2027-03-20', end_date: '2027-03-22', owner: { name: 'Ryan' } });
  assert.strictEqual(trip.status, 200);
  const j = await trip.json();
  assert.match(j.link, /\/triply\/#\/t\/[A-Za-z0-9_-]+$/, 'personal link points inside /triply');

  // A Triply link is not a Kalendaryo key, and the other way around.
  const kalWithTriplyToken = await fetch('http://localhost:3482/api/me', { headers: { Authorization: 'Bearer ' + j.token } });
  assert.strictEqual(kalWithTriplyToken.status, 401, 'Triply token does not open Kalendaryo');
  const fam = await (await post(3482, '/api/families', { yourName: 'Ryan', familyName: 'On test' })).json();
  const triplyWithKalToken = await fetch('http://localhost:3482/triply/api/me', { headers: { Authorization: 'Bearer ' + fam.token } });
  assert.strictEqual(triplyWithKalToken.status, 401, 'Kalendaryo key does not open Triply');

  // Kalendaryo pages and API still work with the switch on.
  assert.strictEqual((await get(3482, '/c/' + fam.token)).status, 200);
  assert.strictEqual((await fetch('http://localhost:3482/api/me', { headers: { Authorization: 'Bearer ' + fam.token } })).status, 200);
});

test('tables stay apart: Triply only in its own schema', async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const rows = (await pool.query("select table_schema, table_name from information_schema.tables where table_name in ('trips','members','items','families','access')")).rows;
    const where = (t) => rows.filter((r) => r.table_name === t).map((r) => r.table_schema);
    assert.ok(where('trips').includes('triply') && !where('trips').includes('public'), 'trips in schema triply, never next to Kalendaryo');
    assert.ok(where('families').includes('public') && !where('families').includes('triply'), 'families only in Kalendaryo');
  } finally { await pool.end(); }
});
