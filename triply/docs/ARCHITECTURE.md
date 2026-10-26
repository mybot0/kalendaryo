# Triply architecture

Triply is a shared trip planner: one itinerary, one group chat, one place for every booking.
It is its **own project**. It does not import anything from Kalendaryo, does not read Kalendaryo's
tables, and runs on its own. Kalendaryo can later *mount* it under `/triply`, and it can be moved to
its own domain with settings only.

## 1. Principles

1. **Standalone first.** No Kalendaryo accounts, families or tables. Shared things (the look) are copied, not linked.
2. **Same look as Kalendaryo.** The CSS files (`theme`, `base`, `components`, `shell`) are copied from Kalendaryo. Only the accent color differs (terracotta).
3. **Link-only access, like Kalendaryo.** No passwords. A trip has members; each member has a private link with a role.
4. **Moving is a settings change.** Base path, public address, database and schema are settings, never hardcoded.
5. **The itinerary is the center.** Everything answers "what is happening next?".
6. **Simple code.** Plain Node `http` plus `pg`. The browser app is plain JavaScript modules bundled into one HTML file.

## 2. Folder layout

```
triply/
  package.json            only dependency: pg
  render.yaml             Render Blueprint (web service + Postgres)
  server/
    index.js              standalone entry (own http server)
    handler.js            createTriply(options) -> { handle, owns, ready, close }   <- what Kalendaryo mounts
    config.js             reads settings (env) with safe defaults
    db.js                 pool, migrations, helpers
    migrations.js         ordered SQL migrations (schema "triply")
    mini.js               tiny router, JSON/body helpers, ApiError
    permissions.js        roles -> permissions (one table)
    models.js             cleaning and validation of everything saved
    live.js               server-sent events hub (per trip)
    limits.js             small in-memory rate limiter
    routes/
      trips.js            create/list/read/update/delete trip, state
      members.js          me, profile, roles, remove, leave
      invites.js          create/list/revoke, peek, join
      items.js            itinerary items (CRUD, optimistic versions)
      chat.js             group chat, direct messages, reads, activity posts
      blobs.js            photos and files (chat, covers) + the Files list
      expenses.js         costs: who paid, who shares (money in whole cents)
  client/
    build.js              bundles src/ into public/index.html
    src/styles/*.css      theme, base, components, shell, screens, itinerary, chat
    src/js/*.js           util, config, api, store, ui-kit, shell, screens/*
  public/index.html       built page (generated)
  test/
    api.test.js           API tests (node:test, real Postgres)
    e2e.py                browser tests (Playwright, real Postgres)
  docs/ARCHITECTURE.md    this file
```

## 3. Settings

| Setting | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none (required) | Postgres connection |
| `TRIPLY_SCHEMA` | `triply` | Postgres schema that holds all Triply tables |
| `BASE_PATH` | empty (standalone) | `/triply` when mounted in Kalendaryo |
| `PUBLIC_URL` | from the request | Address used inside invite and personal links |
| `ALLOWED_ORIGIN` | none | Extra website allowed to call the API (for a later domain split) |
| `INVITE_DAYS` | 14 | How long an invite link works |
| `MAX_TRIP_MB` | 200 | Photo and file storage per trip |
| `PORT` | 3000 | Standalone port |

## 4. Access and roles

No accounts. A **member** is one person on one trip. Creating a trip creates the first member (owner).
Each member has a secret token. The token is only stored hashed (SHA-256). Opening the personal link
`/#/t/<token>` saves the token on that device; the address is then cleaned so nobody shares it by accident.
The token travels in an `Authorization: Bearer` header, never in a URL the server logs.

Roles are rows in one table (`server/permissions.js`). Adding a role or permission means adding a line.

| Permission | Owner | Editor | Viewer |
|---|:-:|:-:|:-:|
| See itinerary, reservations, people | yes | yes | yes |
| Add / change / delete itinerary items | yes | yes | no |
| Chat (group and direct) | yes | yes | only if the owner allows |
| Upload photos and files | yes | yes | only where chat is allowed |
| Edit trip details and cover | yes | no | no |
| Invite, change roles, remove people | yes | no | no |
| Delete the trip | yes | no | no |

Rules: a trip always keeps at least one owner (checked with row locks). People can leave, unless they are the last owner.
**My Trips** is the list of tokens saved on the device. A "Backup my trips" file moves that list to another browser or domain.

## 5. Data model (schema `triply`)

```
trips        id, name, destination, route[], start_date, end_date, description,
             cover_emoji, cover_color, cover_blob, viewers_chat, created_at, updated_at
members      id, trip_id, name, avatar, color, role, token_hash, joined_at, last_seen_at
invites      id, trip_id, code_hash, role, label, created_by, expires_at, used_at, used_by
items        id, trip_id, type, title, start_date, start_time, end_date, end_time,
             location, confirmation, notes, data (jsonb: type-specific), version,
             created_by, updated_by, created_at, updated_at
messages     id (bigserial), trip_id, sender_id, to_member (null = group chat), kind (text|activity),
             body, mentions[], blob_id, item_id, meta (jsonb), created_at
chat_reads   member_id, thread ('trip' or the other member's id), last_id
blobs        id, trip_id, mime, name, size, bytes, created_by, created_at
migrations   id, applied_at
```

Everything cascades from `trips`, so deleting a trip leaves nothing behind. Dates are text `YYYY-MM-DD`, times text `HH:MM`
(trip-local wall-clock; flights show local times at each airport, so no time-zone math).

### Item types

| Type | Starts | Ends | Type-specific fields (`data`) |
|---|---|---|---|
| flight | departure | arrival | airline, flightNo, from, to, terminal, gate, seat |
| hotel | check-in | check-out | address (location), room, contact |
| car | pickup | drop-off | company, dropoffLocation, vehicle |
| cruise | embarkation | disembarkation | cruiseLine, ship, disembarkLocation, cabin |
| activity | start | end | cost, currency |
| restaurant | reservation time | none | people |
| place | optional day | none | website |
| note | optional day | none | none (text lives in `notes`) |

Common columns: `title`, `location`, `confirmation`, `notes`. Flights, hotels, cars and cruises need a start date;
activities, places and notes may be "unscheduled" and appear in an Ideas list.

## 6. API (all under `BASE_PATH/api`)

Bearer token = member. Trip id is in the path; the token must belong to that trip.

```
POST   /trips                          create trip + owner  -> {trip, member, token}
POST   /my-trips                       {tokens[]} -> summaries (powers My Trips)
GET    /me                             token -> {member, tripId}
GET    /trips/:id/state                trip, me, members, items, invites (owner), unread
PATCH  /trips/:id                      owner: edit details
DELETE /trips/:id                      owner
POST   /trips/:id/items                editor+
PATCH  /trips/:id/items/:itemId        editor+ (needs `version`; 409 on conflict)
DELETE /trips/:id/items/:itemId        editor+
PATCH  /trips/:id/members/me           change my name/avatar
PATCH  /trips/:id/members/:memberId    owner: change role
DELETE /trips/:id/members/:memberId    owner removes; or me = leave
POST   /trips/:id/invites              owner -> {code, link}
DELETE /trips/:id/invites/:inviteId    owner
GET    /invites/peek/:code             public: trip name, inviter, role
POST   /join                           {code, name, avatar} -> {member, token}
GET    /trips/:id/messages?thread=trip|<memberId>&before=&limit=
POST   /trips/:id/messages             {thread, body, blobId?}
POST   /trips/:id/reads                {thread, lastId}
POST   /trips/:id/blobs                raw upload (X-Filename) -> {id}
GET    /blobs/:id                      photo/file (random id = capability link)
GET    /trips/:id/stream               live updates (server-sent events)
```

Live updates: one open stream per trip page. The server sends small "something changed" events
(`items`, `members`, `trip`, `chat`); direct messages go only to the two people. The page refetches what changed.
A single server process keeps the hub in memory; moving to several processes needs Postgres `LISTEN/NOTIFY` (note, not built).

## 7. Screens

Outside a trip: **My Trips** (Current, Upcoming, Past, Shared with me) and **Settings** (this device, backup).
Inside a trip, navigation is a sidebar on wide screens and a bottom bar on phones:

**Overview** · **Itinerary** · **Reservations** · **Chat** · **People** · (Map, Files: shown as "Soon")

- **Overview:** cover, dates, countdown or "Day 3 of 14", Next up, today, upcoming, travelers, quick links.
- **Itinerary:** Timeline (default), Day, Week, Full trip. Item cards use the type color on the left edge. Tap opens the detail sheet.
- **Reservations:** every booking grouped by Flights, Hotels, Transportation, Cruise, Activities, Restaurants with confirmation numbers.
- **Chat:** Trip chat and direct messages. A banner says which one you are in. Activity posts link to the item.
- **People:** members, roles, invite links, pending invites, my link, leave.

Phone: the itinerary is a single column; month and week views switch to compact lists; sheets slide up from the bottom.

## 8. Design system

Copied from Kalendaryo: warm off-white `#F4F3EE`, white cards, radius 18/12, pill buttons, 48 px touch targets,
Figtree (text) and Outfit (headings), soft two-layer shadow, light only.
Accent: terracotta `#B8583A` (soft tint `#F8E7E0`, white text contrast 4.7:1). Pastel palette is the same, used for item types and travelers.

## 9. Mounting in Kalendaryo (later)

```js
const { createTriply } = require('./triply/server/handler');
const triply = createTriply({ basePath: '/triply', databaseUrl: process.env.DATABASE_URL });
// in Kalendaryo's request handler:
if (triply.owns(req.url)) return triply.handle(req, res);
```

- Triply uses its **own connection pool and its own schema**, so a Triply fault cannot touch family data.
- `handle` catches its own errors; a crash inside Triply returns a 500 for Triply only.
- Kalendaryo's build can copy `triply/public/index.html`, or just call the handler (it serves the page itself).
- Moving to its own domain: run `server/index.js` as a Render service, set `PUBLIC_URL`, keep a redirect at the old address.

## 10. Not built yet: Map, trip-wide search, notification preferences, packing list, e-mail invites and sign-in.

Map, Files area, Expenses, trip-wide search, notification preferences, e-mail invites, sign-in by e-mail.
The tables and screens above leave room for each (items already have `location`; blobs already store files).


## Costs and Files (added)
- `expenses` table (migration `002_expenses`): title, `amount_cents`, currency, `paid_by`, `split` (member ids), optional date and plan link.
  Editors and owners write; viewers read. Balances and "who owes whom" are computed in the page (`TR.money.compute`), one currency at a time, no exchange rates.
- `GET /trips/:id/files` lists every upload except the trip cover; `DELETE /trips/:id/files/:fileId` is allowed for the uploader or an owner.
- Phones show four tabs plus **More** (Bookings, Files, People); wide screens list everything in the side rail.

## Demo page (no server)
`tools/mock-api.js` is a stand-in server that lives in the browser (localStorage). `node tools/build-demo.js` writes `dist/triply-demo.html`,
the real page plus the stand-in, which is what is published as the Triply demo artifact. Keep the stand-in in step with new routes.
Map note: a real map needs map tiles and address lookup from outside services, which the artifact sandbox blocks, so Map is planned for the deployed version only.

## Packing, Search, Updates, Trip polish

- **Packing** (`003_packing`, `routes/packing.js`): shared list with categories and optional assignee. Add/edit/assign/delete need `items.write`; ticking needs `chat.write`, so viewers can tick things off.
- **Search** (`GET /trips/:id/search?q=`): plans, costs and people are filtered on the client from trip state; chat messages are searched on the server (group chat plus the caller's own private chats, escaped ILIKE, 2+ characters, 20 results).
- **Updates**: a client-side feed built from unread chat, and plan changes made by others since the member last opened Updates (`seenAt` per trip in localStorage). No server table yet, and no push or email.
- **Polish**: duplicate a plan (opens the plan form pre-filled), move a whole day to another date, share the itinerary as text (copy), print stylesheet for Ctrl+P.
- Not built: Map (needs tiles and geocoding, deployed version only), push/email notifications, e-mail invites and login.
