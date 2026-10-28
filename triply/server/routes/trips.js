/*
 * routes/trips.js — create, list, read, change and delete trips. Also the one big "state" read the page uses.
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { sha256, randomToken } = require('../db');
const { bad, missing, readJson, ok, clientIp } = require('../mini');
const { packingOut, expenseOut, tripOut, memberOut, itemOut, inviteOut, personalLink } = require('../shapes');
const { unreadFor } = require('./chat');

function register(r, d) {
  const { db, hub, limiter, auth, cfg } = d;

  // Create a trip and its first member (the owner). The reply holds the owner's secret token, once.
  r.post('/trips', async (c) => {
    limiter.check('create', clientIp(c.req));
    const body = await readJson(c.req);
    const t = M.trip(body, null);
    const who = M.profile(body.owner || {}, M.PALETTE[0]);
    const token = randomToken(24);
    const out = await db.tx(async (cl) => {
      const tr = await cl.query(
        `insert into trips (name, destination, route, start_date, end_date, description, cover_emoji, cover_color, viewers_chat)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [t.name, t.destination, t.route, t.start_date, t.end_date, t.description, t.cover_emoji, t.cover_color, t.viewers_chat]
      );
      const mem = await cl.query(
        `insert into members (trip_id, name, avatar, color, role, token_hash) values ($1,$2,$3,$4,'owner',$5)
         returning id, trip_id, name, avatar, color, role, joined_at, last_seen_at`,
        [tr.rows[0].id, who.name, who.avatar, who.color, sha256(token)]
      );
      return { trip: tr.rows[0], member: mem.rows[0] };
    });
    ok(c.res, { trip: tripOut(out.trip), member: memberOut(out.member, out.member.id), token, link: personalLink(cfg, c.req, token) });
  });

  // My Trips: the page sends the tokens saved on this device and gets one summary per working token.
  // Reply: { trips: [{ i, ...summary }], gone: [i, ...] } where i is the position in the list that was sent.
  r.post('/my-trips', async (c) => {
    limiter.check('lookup', clientIp(c.req));
    const body = await readJson(c.req);
    const tokens = (Array.isArray(body.tokens) ? body.tokens : []).filter((t) => typeof t === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(t)).slice(0, 80);
    if (!tokens.length) return ok(c.res, { trips: [], gone: [] });
    const hashes = tokens.map(sha256);
    const { rows } = await db.q(
      `select m.token_hash, m.id as member_id, m.role, t.*,
              (select count(*)::int from members x where x.trip_id = t.id) as travelers,
              (select x.name from members x where x.trip_id = t.id and x.role = 'owner' order by x.joined_at limit 1) as owner_name
         from members m join trips t on t.id = m.trip_id where m.token_hash = any($1)`,
      [hashes]
    );
    const byHash = new Map(rows.map((x) => [x.token_hash, x]));
    const trips = [], gone = [];
    for (let i = 0; i < hashes.length; i++) {
      const row = byHash.get(hashes[i]);
      if (!row) { gone.push(i); continue; }
      const un = await unreadFor(db.q, row.id, row.member_id);
      const dmTotal = Object.values(un.dm).reduce((a, b) => a + b, 0);
      trips.push(Object.assign(tripOut(row), { i, role: row.role, member_id: row.member_id, travelers: row.travelers, owner_name: row.owner_name || '', unread: un.trip + dmTotal }));
    }
    ok(c.res, { trips, gone });
  });

  // Everything the trip workspace needs, in one read.
  r.get('/trips/:id/state', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'trip.read', trip);
    const [members, items, unread, expenses, packing] = await Promise.all([
      db.q('select id, name, avatar, color, role, joined_at, last_seen_at from members where trip_id = $1 order by joined_at, id', [trip.id]),
      db.q('select * from items where trip_id = $1 order by start_date nulls last, start_time nulls first, created_at', [trip.id]),
      unreadFor(db.q, trip.id, member.id),
      db.q('select * from expenses where trip_id = $1 order by coalesce(spent_on, \'9999\') desc, created_at desc', [trip.id]),
      db.q('select * from packing_items where trip_id = $1 order by created_at, id', [trip.id])
    ]);
    let invites = [];
    if (P.can(member, 'invites.manage', trip)) {
      invites = (await db.q('select id, role, label, created_by, created_at, expires_at from invites where trip_id = $1 and used_at is null and expires_at > now() order by created_at desc', [trip.id])).rows.map(inviteOut);
    }
    ok(c.res, {
      trip: tripOut(trip),
      me: memberOut(member, member.id),
      perms: P.summary(member, trip),
      members: members.rows.map((m) => memberOut(m, member.id)),
      items: items.rows.map(itemOut),
      invites,
      unread,
      expenses: expenses.rows.map(expenseOut),
      packing: packing.rows.map(packingOut),
      roles: P.publicRoles()
    });
  });

  r.patch('/trips/:id', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'trip.edit', trip, 'Only an owner can change the trip details.');
    const body = await readJson(c.req);
    const t = M.trip(body, trip);
    let cover = trip.cover_blob;
    if (body.cover_blob === null || body.cover_blob === '') cover = null;
    else if (body.cover_blob !== undefined) {
      if (!M.isUuid(body.cover_blob)) throw bad('invalid', 'That photo could not be found.');
      const b = await db.q("select id from blobs where id = $1 and trip_id = $2 and mime like 'image/%'", [body.cover_blob, trip.id]);
      if (!b.rows.length) throw bad('invalid', 'That photo could not be found.');
      cover = body.cover_blob;
    }
    const { rows } = await db.q(
      `update trips set name=$2, destination=$3, route=$4, start_date=$5, end_date=$6, description=$7,
              cover_emoji=$8, cover_color=$9, cover_blob=$10, viewers_chat=$11, budget=$12, budget_currency=$13, updated_at=now()
        where id=$1 returning *`,
      [trip.id, t.name, t.destination, t.route, t.start_date, t.end_date, t.description, t.cover_emoji, t.cover_color, cover, t.viewers_chat, t.budget, t.budget_currency]
    );
    if (trip.cover_blob && trip.cover_blob !== cover) await db.q('delete from blobs where id = $1 and trip_id = $2', [trip.cover_blob, trip.id]);
    hub.publish(trip.id, 'trip', { by: member.id });
    ok(c.res, { trip: tripOut(rows[0]) });
  });

  r.delete('/trips/:id', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'trip.delete', trip, 'Only an owner can delete the trip.');
    await db.q('delete from trips where id = $1', [trip.id]);
    hub.drop(trip.id, null, 'trip_deleted');
    ok(c.res);
  });
}

module.exports = { register };
