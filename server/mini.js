// mini.js — a very small web framework on top of Node's own http module (so the server needs no extra packages).
const { URL } = require('url');

class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  return { re, keys };
}

function router() {
  const routes = [];
  const add = (method) => (pattern, ...handlers) => routes.push(Object.assign({ method, handlers }, compile(pattern)));
  async function handle(req, res) {
    const u = new URL(req.url, 'http://x');
    req.path = u.pathname;
    req.query = Object.fromEntries(u.searchParams);
    for (const r of routes) {
      if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
      const m = r.re.exec(req.path);
      if (!m) continue;
      req.params = {};
      r.keys.forEach((k, i) => { try { req.params[k] = decodeURIComponent(m[i + 1]); } catch (e) { req.params[k] = m[i + 1]; } });
      for (const h of r.handlers) { await h(req, res); if (res.writableEnded || res.headersSent && res._kalStream) return true; }
      return true;
    }
    return false;
  }
  return { get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'), handle };
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > max) { reject(new HttpError(413, 'too_large', 'That is too big to save.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const jsonBody = (max) => async (req) => {
  const buf = await readBody(req, max);
  if (!buf.length) { req.body = {}; return; }
  if (!/application\/json/.test(req.headers['content-type'] || '')) throw new HttpError(400, 'bad_request', 'Bad request.');
  try { req.body = JSON.parse(buf.toString('utf8')); } catch (e) { throw new HttpError(400, 'bad_request', 'Bad request.'); }
  if (!req.body || typeof req.body !== 'object') req.body = {};
};
const rawBody = (max) => async (req) => { req.body = await readBody(req, max); };

function send(res, status, obj, headers) {
  if (res.writableEnded) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}

module.exports = { router, jsonBody, rawBody, send, HttpError };
