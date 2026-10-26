# Triply inside Kalendaryo: integration notes

Triply ("Triply by Kalendaryo") is a separate product. On the `add-triply` branch it lives in this one
folder, `triply/`, and Kalendaryo mounts it at `/triply` **only when `TRIPLY_ENABLED` is on**.
With the switch off, the site behaves exactly like `main`.

## The touch points

Only these places outside `triply/` were changed. Each one is marked in the code with `TOUCH POINT`.

### A. Server mount: `server/index.js`
1. **Create Triply only when the switch is on.** This is a small block above `/* ---------- pages ---------- */`.
   With the switch off, Triply's code is never loaded.
   - The block calls `createTriply({ basePath: '/triply', databaseUrl, ssl, maxTripMb, maxBlobMb })`.
   - `ssl` follows the same rule as Kalendaryo's `server/db.js`.
2. **Tell the start page that Triply is on.** In `page()`, the server adds `<script>window.KAL_TRIPLY=true;</script>`
   before `</head>`, but only when Triply is on.
3. **The mount line.** This is the first line of the request handler:
   `if (triply && triply.owns(req.url)) return triply.handle(req, res);`

### B. Start page choice: `client/web/landing.js` and `client/web/web.css`
- `landing.js`:
  - `createCard(pick)` keeps its old look unless `pick` is passed.
  - The new parts are `pickForm`, `tripCard` and `choice`. They are used only when `window.KAL_TRIPLY` is true.
  - `render()` uses `land-wide` and `choice()` when the switch is on, and the old one-form start page otherwise.
- The Triply card creates the trip with `POST /triply/api/trips`, with name, dates and owner name, then opens the personal link
  `/triply/#/t/<token>` that Triply sends back. "Open my trips →" goes to `/triply/`.
- `web.css` has the block marked `TOUCH POINT B` at the end: the two even cards, with Triply in terracotta `#B8583A`.
- `public/index.html` is rebuilt from these files with `node client/build.js web`.

### C. Render settings (not in the code)
| Setting | Value | Notes |
|---|---|---|
| `TRIPLY_ENABLED` | `1` | Only on the test service. Leave it unset on the real site. |
| `TRIPLY_MAX_TRIP_MB` | optional, default `20` | Photos and files per trip, kept low while testing. |
| `TRIPLY_MAX_FILE_MB` | optional, default `5` | Largest single upload. |

## How to undo it (back to plain Kalendaryo)
- **Quick:** remove `TRIPLY_ENABLED` (or set it to `0`) in Render. The site is then plain Kalendaryo. Triply's tables stay in the database, unused.
- **Fully:**
  1. Delete the `triply/` folder.
  2. Undo the 3 spots in `server/index.js` (touch point A).
  3. Undo touch point B in `landing.js` and `web.css`, then rebuild `public/index.html`.
  4. Remove the env variables.
- Or simply never merge `add-triply` into `main`.
- **Remove Triply's data:** run `drop schema triply cascade;` on the database. This touches nothing of Kalendaryo's.

## How to move Triply to its own address later
Run `triply/server/index.js` as its own Render service with `BASE_PATH` empty and `PUBLIC_URL` set to the new address,
then remove touch points A, B and C here. The data can stay in the `triply` schema, or be copied to a new database.

## What stays separate
- **Database:** Triply has its own connection pool (6 connections, while Kalendaryo has 10) and its own schema, `triply`.
  - Its tables (`trips`, `members`, `invites`, `items`, `messages`, `blobs` and more) are created there on first start.
  - Kalendaryo's tables (`families`, `access`, `invites`, `docs`, `blobs`) are in `public` and are never read or changed by Triply.
- **Links and logins:**
  - Kalendaryo keys open `/c/<key>`. Triply links open `/triply/#/t/<token>`.
  - A key from one product is refused by the other. The test `kal-mount.test.js` checks this both ways.
- **Saved on the device:** Kalendaryo saves under `kal.*` and `pl.*`, Triply under `tr.*`, so neither can overwrite the other.
- **Errors:** Triply catches its own errors and answers only under `/triply`.

## Things to watch while testing
- **Live updates** (Triply chat and plans, and Kalendaryo) are kept in each server's memory.
  - That is fine for one Render instance.
  - The test service and the real site are two different servers. A change made on one shows up on the other after a refresh, not live.
- **Storage:** Triply keeps photos and files inside the database, which is shared with Kalendaryo (1 GB on the free plan).
  The limits above stay low on purpose.
- **Shared database:** the test service uses the real `kalendaryo-db`, so it shows the same homes as the real site.
- **Free database:** it expires around November 24. Upgrade it before then.

## Tests
```
DATABASE_URL=postgres://... node --test triply/test/api.test.js         # Triply API (29 tests)
DATABASE_URL=postgres://... node --test triply/test/kal-mount.test.js   # switch off / on, links and tables stay apart
python3 test/e2e.py                                                     # Kalendaryo, switch off
BASE=http://localhost:PORT/triply python3 triply/test/e2e.py            # Triply in the browser, mounted (switch on)
```

## Changes made to Triply's own files here
See `CHANGES-FOR-TRIPLY-CHAT.md`. It covers the travel doodle background and the "null" fix on My Trips.
Copy that note into the Triply chat so both copies stay the same.
