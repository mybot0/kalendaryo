# Triply — by Kalendaryo

Shared trip planner: one itinerary, one group chat, every booking in one place.
Plain Node + Postgres (`pg`), one HTML page for the client. Same look as Kalendaryo, terracotta accent.
No accounts: each person has a private link; owners invite people with Viewer / Editor / Owner links.

## Run it
```
npm install
npm run build            # bundles client/src -> public/index.html
DATABASE_URL=postgres://user:pass@host/db npm start     # http://localhost:3000
```
Tables are created automatically in their own schema (`triply`).

## Test
```
DATABASE_URL=postgres://... npm test                       # 27 API tests (own throw-away schema)
BASE=http://localhost:3000 python3 test/e2e.py             # two real browsers, screenshots in /tmp/shots
```

## Settings (environment or `createTriply({...})`)
DATABASE_URL, TRIPLY_SCHEMA (triply), BASE_PATH (empty; `/triply` when mounted), PUBLIC_URL (full public address incl. base path),
ALLOWED_ORIGIN (only if the page is served from another domain), INVITE_DAYS (14), MAX_TRIP_MB (200), MAX_BLOB_MB (8), PG_POOL_SIZE, PGSSL, PORT.

## Mounting inside Kalendaryo later
```js
const { createTriply } = require('./triply/server/handler');
const triply = createTriply({ basePath: '/triply', databaseUrl: process.env.DATABASE_URL });
// in the request handler, before Kalendaryo's own routes:
if (triply.owns(req.url)) return triply.handle(req, res);
```
Remember to run `npm run build` inside the triply folder, and note: restart the server after rebuilding (the page is cached in memory).

## Not built yet
Map view, packing list, trip-wide search, notification preferences, e-mail invitations/sign-in.
Live updates use an in-memory hub: for more than one server process, add Postgres LISTEN/NOTIFY first.
See docs/ARCHITECTURE.md.

## Demo without a server
`node tools/build-demo.js` -> `dist/triply-demo.html` (real page + in-browser stand-in server with sample data).

## Features
Trips, itinerary, bookings, costs and settle-up, files, group and private chat, packing list, search, updates, duplicate/move/share a day. Demo: `node tools/build-demo.js`.
