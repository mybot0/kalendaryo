/*
 * mini.js — a very small router and request helpers (no framework).
 *   const r = router(); r.get('/trips/:id', handler); r.dispatch(ctx)
 * A handler receives ctx = { req, res, params, query, url, body(), raw(), json(), cfg }.
 * Throw ApiError(status, code, message) for expected problems.
 */
'use strict';

class ApiError extends Error {
  // `extra` is merged into the error sent to the page (for example the current copy of something that changed).
  constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra || null; }
}
const bad = (code, msg) => new ApiError(400, code || 'bad_request', msg || 'That request could not be understood.');
const denied = (msg) => new ApiError(403, 'forbidden', msg || 'You do not have permission to do that.');
const missing = (msg) => new ApiError(404, 'not_found', msg || 'That could not be found.');
const conflict = (code, msg, extra) => new ApiError(409, code || 'conflict', msg, extra);

function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  return { re, keys };
}

function router() {
  const routes = [];
  const add = (method) => (pattern, handler) => { routes.push(Object.assign({ method, handler }, compile(pattern))); };
  return {
    get: add('GET'), post: add('POST'), patch: add('PATCH'), put: add('PUT'), delete: add('DELETE'),
    match(method, path) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch (e) { params[k] = m[i + 1]; } });
        return { handler: r.handler, params };
      }
      return { handler: null, pathMatched };
    }
  };
}

/* ---------- request body ---------- */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > limit) { req.resume(); return reject(new ApiError(413, 'too_large', 'That is too large to upload.')); }
    const chunks = [];
    let size = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; req.pause(); reject(new ApiError(413, 'too_large', 'That is too large to upload.')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
    req.on('aborted', () => { if (!done) { done = true; reject(new ApiError(400, 'aborted', 'The upload was cut off.')); } });
  });
}

async function readJson(req, limit) {
  const buf = await readBody(req, limit || 256 * 1024);
  if (!buf.length) return {};
  try {
    const v = JSON.parse(buf.toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch (e) { throw bad('bad_json', 'The request body is not valid JSON.'); }
}

/* ---------- responses ---------- */
function send(res, status, body, headers) {
  const h = Object.assign({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers || {});
  if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') {
    h['Content-Type'] = 'application/json; charset=utf-8';
    body = JSON.stringify(body);
  }
  res.writeHead(status, h);
  res.end(body);
}
const ok = (res, body) => send(res, 200, body === undefined ? { ok: true } : body);

function sendError(res, err, log) {
  if (res.headersSent) { try { res.end(); } catch (e) { /* closed */ } return; }
  if (err instanceof ApiError) return send(res, err.status, { error: Object.assign({ code: err.code, message: err.message }, err.extra || {}) });
  if (log) log.error('[triply]', err && err.stack ? err.stack : err);
  send(res, 500, { error: { code: 'server_error', message: 'Something went wrong on the server. Please try again.' } });
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { ApiError, bad, denied, missing, conflict, router, readBody, readJson, send, ok, sendError, clientIp };
