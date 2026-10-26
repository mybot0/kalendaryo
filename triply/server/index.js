/*
 * index.js — run Triply on its own (this is what Render runs).
 *   DATABASE_URL=postgres://... node server/index.js
 * Kalendaryo does not use this file: it calls createTriply() from handler.js and passes requests in.
 */
'use strict';

const http = require('node:http');
const { createTriply } = require('./handler');

const triply = createTriply();
const port = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  if (triply.owns(req.url)) return triply.handle(req, res);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});
server.requestTimeout = 0;      // live streams stay open
server.headersTimeout = 20000;

triply.ready.then(() => {
  server.listen(port, () => console.log('[triply] listening on port ' + port + (triply.cfg.basePath ? ' under ' + triply.cfg.basePath : '')));
}, (e) => {
  console.error('[triply] could not start:', e.message);
  process.exit(1);
});

function stop() {
  server.close();
  triply.close().then(() => process.exit(0), () => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
