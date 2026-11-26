#!/usr/bin/env node
/*
 * build.js — makes the KalRadio page from client/app.html + client/data.js. No packages needed.
 *   node kalradio/build.js
 * Makes:
 *   public/radio.html          the page Kalendaryo serves at /radio (server/index.js in this folder)
 *   With "preview": also dist/kalradio-preview.html (sample stations, no sound, for a Claude artifact).
 * Version 2 has no one-file version: approvals live on the Kalendaryo server. (Version 1, with no restrictions,
 * is kept in the kalradio-v1-personal folder.)
 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const rd = (p) => fs.readFileSync(path.join(dir, p), 'utf8');

const src = rd('client/app.html');
const data = rd('client/data.js');
for (const mark of ['/*DATA*/', '/*DEMO*/false']) if (!src.includes(mark)) throw new Error('client/app.html is missing ' + mark);
if (/<\/script/i.test(data)) throw new Error('data.js contains </script');

const page = src.replace('/*DATA*/', () => data);
const preview = page.replace('/*DEMO*/false', 'true').replace('<title>KalRadio</title>', '<title>KalRadio (preview)</title>');
const out = { 'public/radio.html': page };
if (process.argv.includes('preview')) out['dist/kalradio-preview.html'] = preview;
for (const [f, html] of Object.entries(out)) {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), html);
  console.log('kalradio/' + f, fs.statSync(path.join(dir, f)).size, 'bytes');
}
