/*
 * handler.js — the whole Triply server as one function you can plug in anywhere.
 *
 *   const { createTriply } = require('./server/handler');
 *   const triply = createTriply({ basePath: '/triply', databaseUrl: '...' });
 *   // inside any http server:
 *   if (triply.owns(req.url)) return triply.handle(req, res);
 *
 * It owns its own database pool and schema, catches its own errors, and answers only under its base path.
 * Standalone, server/index.js wraps it in a normal http server.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { createDb } = require('./db');
const { createHub } = require('./live');
const { createLimiter } = require('./limits');
const { createAuth } = require('./auth');
const { router, send, sendError, ApiError } = require('./mini');

const ROUTES = ['trips', 'members', 'invites', 'items', 'chat', 'blobs', 'expenses', 'packing'];
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#B8583A"/><path d="M14 33l36-15-12 30-8-12z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>';

function createTriply(options) {
  const cfg = config.load(options);
  const db = createDb(cfg);
  const hub = createHub();
  const limiter = createLimiter(cfg.limits);
  const auth = createAuth(db);
  const deps = { cfg, db, hub, limiter, auth };

  const api = router();
  ROUTES.forEach((name) => require('./routes/' + name).register(api, deps));
  api.get('/trips/:id/stream', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    hub.subscribe(trip.id, member.id, c.req, c.res);
  });
  api.get('/health', async (c) => {
    await db.q('select 1');
    send(c.res, 200, { ok: true, app: 'triply' });
  });

  // Migrations run once at start. Requests wait for them.
  const ready = db.migrate().then(() => true, (e) => { if (cfg.log) cfg.log.error('[triply] migration failed:', e.message); throw e; });
  ready.catch(() => {});

  /* ---------- the page ---------- */
  let htmlCache = null;
  function page() {
    if (!htmlCache) {
      const file = cfg.htmlPath || path.join(__dirname, '..', 'public', 'index.html');
      const raw = fs.readFileSync(file, 'utf8');
      const boot = '<script>window.TRIPLY=' + JSON.stringify({ base: cfg.basePath, publicUrl: cfg.publicUrl || '' }).replace(/</g, '\\u003c') + ';</script>';
      htmlCache = raw.replace('<!--TRIPLY_CONFIG-->', boot);
    }
    return htmlCache;
  }
  // The demo trip (/demo): the real page, plus an in-browser stand-in server with a made-up family trip.
  // Nothing reaches the database; everything stays in the tab and resets on reload. See tools/demo-europe.js.
  let demoCache = null;
  function demoPage() {
    if (!demoCache) {
      const file = cfg.htmlPath || path.join(__dirname, '..', 'public', 'index.html');
      const raw = fs.readFileSync(file, 'utf8');
      const rd = (f) => fs.readFileSync(path.join(__dirname, '..', 'tools', f), 'utf8').replace(/<\/script/gi, '<\\/script');
      const memoryStorage = "(function(){var m={};var s={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};try{Object.defineProperty(window,'localStorage',{value:s,configurable:true})}catch(e){}})();";
      const boot = '<script>window.TRIPLY=' + JSON.stringify({ base: cfg.basePath, publicUrl: cfg.publicUrl || '', demo: true }).replace(/</g, '\\u003c') + ';' + memoryStorage + '</script>\n' +
        '<script>\n' + rd('demo-europe.js') + '\n</script>\n<script>\n' + rd('mock-api.js') + '\n</script>';
      demoCache = raw.replace('<!--TRIPLY_CONFIG-->', () => boot).replace(/<title>[^<]*<\/title>/, '<title>Demo trip · Triply</title>');
    }
    return demoCache;
  }
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'" + (cfg.allowedOrigin ? ' ' + cfg.allowedOrigin : ''),
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "object-src 'none'"
  ].join('; ');

  /* ---------- request entry ---------- */
  const owns = (url) => {
    const p = String(url || '').split('?')[0];
    return !cfg.basePath || p === cfg.basePath || p.startsWith(cfg.basePath + '/');
  };

  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin || !cfg.allowedOrigin || origin !== cfg.allowedOrigin) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Filename');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    return true;
  }

  async function handle(req, res) {
    try {
      const u = new URL(req.url, 'http://local');
      let p = u.pathname;
      if (cfg.basePath) {
        if (p === cfg.basePath) return send(res, 302, '', { Location: cfg.basePath + '/' + u.search });
        p = p.slice(cfg.basePath.length);
      }
      cors(req, res);
      if (req.method === 'OPTIONS') return send(res, 204, '');

      if (p === '/api' || p.startsWith('/api/')) {
        try { await ready; } catch (e) { throw new ApiError(503, 'starting', 'Triply is not ready yet. Please try again in a moment.'); }
        const m = api.match(req.method, p.slice(4) || '/');
        if (!m.handler) throw new ApiError(m.pathMatched ? 405 : 404, m.pathMatched ? 'method_not_allowed' : 'not_found', 'That does not exist.');
        return await m.handler({ req, res, params: m.params, query: u.searchParams, url: u, cfg });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'method_not_allowed', 'That does not exist.');
      if (p === '/favicon.svg' || p === '/favicon.ico') return send(res, 200, FAVICON, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      if (p === '/healthz') { await db.q('select 1'); return send(res, 200, { ok: true }); }
      if (p === '/demo' || p === '/demo/') {
        return send(res, 200, demoPage(), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP.replace("img-src 'self' data: blob:", "img-src 'self' data: blob: https://images.unsplash.com").replace("object-src 'none'", "object-src blob:"), 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
      }
      if (p === '/' || p === '/index.html') {
        return send(res, 200, page(), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' });
      }
      throw new ApiError(404, 'not_found', 'That page does not exist.');
    } catch (e) {
      sendError(res, e, cfg.log);
    }
  }

  async function close() { hub.close(); limiter.stop(); await db.close(); }

  return { handle, owns, ready, close, cfg, db, hub };
}

module.exports = { createTriply };
