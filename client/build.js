#!/usr/bin/env node
/*
 * build.js — bundles src/ into one self-contained HTML page.
 *   node build.js artifact   -> dist/porchlight.html      (the version that runs inside Claude)
 *   node build.js web        -> the web page (public/index.html in the web repository)
 * The two share all of src/. The web version adds web/ (start page, invites, server connector).
 */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const target = process.argv[2] || 'artifact';
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = ['theme', 'base', 'components', 'shell', 'screens', 'chores', 'lists', 'meals'];
const js = ['config', 'util', 'models', 'recurrence', 'store', 'calendar-data', 'chores-data', 'routines-data', 'rewards-data', 'event-actions', 'data-tools', 'ics',
  'ui-kit', 'pin', 'event-ui', 'holidays', 'weather', 'photos', 'wall', 'notify', 'screens/family', 'screens/routines', 'screens/rewards', 'screens/tasks', 'screens/lists', 'screens/notes', 'screens/photos', 'screens/meals', 'screens/countdowns', 'screens/dashboard', 'screens/calendar', 'screens/settings',
  'shell', 'main'];

const web = target === 'web';
const styles = css.map((c) => rd('src/styles/' + c + '.css'));
if (web) styles.push(rd('web/web.css'), rd('web/guide.css'));
const scripts = [];
if (web) scripts.push(rd('web/shim.js'));
for (const j of js) {
  scripts.push(rd('src/js/' + j + '.js'));
  if (web && j === 'event-ui') scripts.push(rd('web/examples.js'), rd('web/landing.js'), rd('web/access.js'), rd('web/me.js'), rd('web/guide.js'));
}
for (const s of scripts) if (/<\/script/i.test(s)) throw new Error('a script contains </script');

const head = web
  ? ['<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
     '<meta name="robots" content="noindex">', '<meta name="theme-color" content="#F4F3EE">', '<title>Kalendaryo</title>']
  : ['<title>Kalendaryo</title>', '<meta name="claude:viewport-fit-sides" content="cover">'];
const out = head.concat(
  ['<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&family=Outfit:wght@600;700;800&display=swap">',
   '<style>', ...styles, '</style>'],
  web ? ['</head>', '<body>'] : [],
  ['<div id="porchlight-root"></div>'],
  scripts.map((s) => '<script>\n' + s + '\n</script>'),
  web ? ['</body>', '</html>'] : []);

// Inside the web repository this file lives in client/, and the page goes to ../public. In the workshop copy it goes to ../kalweb/public.
const webOut = path.basename(root) === 'client' ? path.join(root, '..', 'public', 'index.html') : path.join(root, '..', 'kalweb', 'public', 'index.html');
const file = web ? webOut : path.join(root, 'dist', 'porchlight.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out.join('\n'));
console.log(file, fs.statSync(file).size, 'bytes');
