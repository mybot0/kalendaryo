/*
 * games/server.js — serves every game in games/ (the list is games/games.json).
 *
 * A game of type "page" is one folder with its own complete index.html. For each one this serves:
 *   /<route> and /<route>/index.html   the folder's index.html, byte-for-byte (no build step, no /hi.js, nothing added)
 *   /<route>/<file>.svg / .png          the folder's icon pictures (for the Games page tiles and home-screen icons)
 * Game pages may only be shown in a frame by Kalendaryo itself (same site). Their fonts may be inside the page
 * as data: URLs, so font-src also allows data: on game pages. The rest of the site's security rules stay the same.
 *
 * Kalendaryo mounts this with one line in server/index.js (TOUCH POINT G1). client/build.js uses tiles() to put
 * the same list on the Games page (TOUCH POINT G2).
 * To move a game to another website: copy its folder; its index.html works on its own. See games/README.md.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png' };

function list() { return JSON.parse(fs.readFileSync(path.join(DIR, 'games.json'), 'utf8')); }

// The tiles for the Games page, with each icon ready to show: inline drawing (icoHtml) or a picture address (icoSrc).
function tiles() {
  return list().map((g) => {
    if (g.type !== 'page') return { id: g.id, type: g.type };
    const t = { id: g.id, type: g.type, title: g.title, route: g.route, colour: g.colour, blurb: g.blurb };
    for (const k of ['titleHtml', 'logoHtml', 'oneRow']) if (g[k] !== undefined) t[k] = g[k];
    if (g.icon && g.icon.inline) t.icoHtml = fs.readFileSync(path.join(DIR, g.folder, g.icon.inline), 'utf8');
    if (g.icon && g.icon.img) t.icoSrc = g.route + '/' + g.icon.img;
    if (t.logoHtml && t.icoHtml) t.logoHtml = t.logoHtml.replace('{icon}', t.icoHtml);
    return t;
  });
}

function mount({ r, SECURITY }) {
  const csp = SECURITY['Content-Security-Policy']
    .replace("frame-ancestors 'none'", "frame-ancestors 'self'")
    .replace('font-src https://fonts.gstatic.com', 'font-src https://fonts.gstatic.com data:');
  for (const g of list()) {
    if (g.type !== 'page') continue;
    const folder = path.join(DIR, g.folder), file = path.join(folder, 'index.html');
    const page = async (req, res) => {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', csp);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
    };
    r.get(g.route, page); r.get(g.route + '/index.html', page);
    for (const name of fs.readdirSync(folder)) {
      const type = TYPES[path.extname(name).toLowerCase()];
      if (!type) continue;
      r.get(g.route + '/' + name, async (req, res) => {
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' });
        res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(folder, name)));
      });
    }
  }
}

module.exports = mount;
module.exports.tiles = tiles;
module.exports.list = list;
