#!/usr/bin/env node
/*
 * build.js — bundle client/src into one self-contained page: public/index.html
 *   node client/build.js
 * The server swaps <!--TRIPLY_CONFIG--> for its settings when it serves the page.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const src = (p) => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const CSS = ['theme', 'base', 'components', 'shell', 'triply'];
const JS = ['util', 'config', 'api', 'store', 'ui-kit', 'forms',
  'screens/trips', 'screens/join', 'screens/overview', 'screens/itinerary', 'screens/bookings', 'screens/expenses', 'screens/files', 'screens/packing', 'screens/search', 'screens/updates', 'screens/chat', 'screens/people', 'screens/device', 'screens/ai',
  'shell', 'main'];

const out = [
  '<!doctype html>',
  '<html lang="en">',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<meta name="theme-color" content="#B8583A">',
  '<meta name="referrer" content="no-referrer">',
  '<title>Triply</title>',
  '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&family=Outfit:wght@600;700;800&display=swap">',
  '<style>', ...CSS.map((c) => src('styles/' + c + '.css')), '</style>',
  '<!--TRIPLY_CONFIG-->',
  '<div id="triply-root"></div>'
];
for (const j of JS) {
  const code = src('js/' + j + '.js');
  if (/<\/script/i.test(code)) throw new Error(j + ' contains a closing script tag');
  out.push('<script>\n' + code + '\n</script>');
}
const file = path.join(__dirname, '..', 'public', 'index.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out.join('\n'));
console.log(file, fs.statSync(file).size, 'bytes');
