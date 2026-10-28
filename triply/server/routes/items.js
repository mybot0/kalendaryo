/*
 * routes/items.js — itinerary items (flights, hotels, activities…).
 * Changes carry the item's `version`. If someone else changed it first, the answer is 409 with their copy,
 * so two people editing the same plan never silently overwrite each other.
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { bad, missing, conflict, readJson, ok } = require('../mini');
const { itemOut } = require('../shapes');
const { postActivity } = require('./chat');

const MAX_ITEMS = 600;
const COLS = 'type, title, start_date, start_time, end_date, end_time, location, confirmation, notes, data';

function register(r, d) {
  const { db, hub, auth } = d;

  async function loadItem(client, tripId, itemId, lock) {
    if (!M.isUuid(itemId)) throw missing('That plan could not be found.');
    const { rows } = await (client.query ? client.query.bind(client) : client.q.bind(client))('select * from items where id = $1 and trip_id = $2' + (lock ? ' for update' : ''), [itemId, tripId]);
    if (!rows.length) throw missing('That plan was removed.');
    return rows[0];
  }

  r.post('/trips/:id/items', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the plans but not change them.');
    const body = await readJson(c.req);
    const it = M.item(body, null);
    const count = await db.q('select count(*)::int as n from items where trip_id = $1', [trip.id]);
    if (count.rows[0].n >= MAX_ITEMS) throw bad('too_many', 'A trip can hold up to ' + MAX_ITEMS + ' plans.');
    const { rows } = await db.q(
      `insert into items (trip_id, ${COLS}, created_by, updated_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) returning *`,
      [trip.id, it.type, it.title, it.start_date, it.start_time, it.end_date, it.end_time, it.location, it.confirmation, it.notes, JSON.stringify(it.data), member.id]
    );
    hub.publish(trip.id, 'items', { by: member.id });
    await postActivity(db, hub, trip.id, member.id, 'added', rows[0]);
    ok(c.res, { item: itemOut(rows[0]) });
  });

  // Many plans at once (bookings read by AI, a planned trip). One chat post for all of them.
  r.post('/trips/:id/items/bulk', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the plans but not change them.');
    const body = await readJson(c.req, 1024 * 1024);
    const list = (Array.isArray(body.items) ? body.items : []).slice(0, 200).map((x) => M.item(x, null));
    if (!list.length) throw bad('invalid', 'There is nothing to add.');
    const count = await db.q('select count(*)::int as n from items where trip_id = $1', [trip.id]);
    if (count.rows[0].n + list.length > MAX_ITEMS) throw bad('too_many', 'A trip can hold up to ' + MAX_ITEMS + ' plans.');
    const rows = await db.tx(async (cl) => {
      const out = [];
      for (const it of list) {
        const r1 = await cl.query(`insert into items (trip_id, ${COLS}, created_by, updated_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) returning *`,
          [trip.id, it.type, it.title, it.start_date, it.start_time, it.end_date, it.end_time, it.location, it.confirmation, it.notes, JSON.stringify(it.data), member.id]);
        out.push(r1.rows[0]);
      }
      return out;
    });
    hub.publish(trip.id, 'items', { by: member.id });
    if (rows.length === 1) await postActivity(db, hub, trip.id, member.id, 'added', rows[0]);
    else {
      const m = await db.q(`insert into messages (trip_id, sender_id, kind, meta) values ($1, $2, 'activity', $3)
        returning id, sender_id, to_member, kind, body, mentions, blob_id, item_id, meta, created_at`, [trip.id, member.id, JSON.stringify({ event: 'bulk', count: rows.length, title: M.text(body.label, 80) })]);
      hub.publish(trip.id, 'chat', { thread: 'trip', message: require('../shapes').messageOut(m.rows[0]) });
    }
    ok(c.res, { items: rows.map(itemOut) });
  });

  r.patch('/trips/:id/items/:itemId', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the plans but not change them.');
    const body = await readJson(c.req);
    const version = parseInt(body.version, 10);
    if (!(version >= 1)) throw bad('invalid', 'Reload the trip and try again.');
    const updated = await db.tx(async (cl) => {
      const cur = await loadItem(cl, trip.id, c.params.itemId, true);
      if (cur.version !== version) {
        throw conflict('version_conflict', 'Someone else just changed this plan. Their version is shown now.', { item: itemOut(cur) });
      }
      const it = M.item(body, cur);
      const u = await cl.query(
        `update items set title=$3, start_date=$4, start_time=$5, end_date=$6, end_time=$7, location=$8, confirmation=$9,
                notes=$10, data=$11, version = version + 1, updated_by=$12, updated_at=now()
          where id=$1 and trip_id=$2 returning *`,
        [cur.id, trip.id, it.title, it.start_date, it.start_time, it.end_date, it.end_time, it.location, it.confirmation, it.notes, JSON.stringify(it.data), member.id]
      );
      return u.rows[0];
    });
    hub.publish(trip.id, 'items', { by: member.id });
    await postActivity(db, hub, trip.id, member.id, 'updated', updated);
    ok(c.res, { item: itemOut(updated) });
  });

  r.delete('/trips/:id/items/:itemId', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the plans but not change them.');
    const cur = await loadItem(db, trip.id, c.params.itemId, false);
    await db.q('delete from items where id = $1 and trip_id = $2', [cur.id, trip.id]);
    // Earlier chat posts about this plan should not point at nothing.
    await db.q('update messages set item_id = null where trip_id = $1 and item_id = $2', [trip.id, cur.id]);
    hub.publish(trip.id, 'items', { by: member.id });
    await postActivity(db, hub, trip.id, member.id, 'removed', cur);
    ok(c.res);
  });
}

module.exports = { register };
