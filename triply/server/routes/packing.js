/*
 * routes/packing.js — a shared packing list. Anyone who can chat may tick things off;
 * adding, renaming, assigning and deleting needs plan-editing rights.
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { bad, missing, readJson, ok } = require('../mini');
const { packingOut } = require('../shapes');

const MAX_ITEMS = 300;
const CATEGORIES = ['Documents', 'Clothes', 'Toiletries', 'Tech', 'Health', 'Other'];

function register(r, d) {
  const { db, hub, auth } = d;

  async function member(tripId, id) {
    if (!id) return null;
    if (!M.isUuid(id)) throw bad('invalid', 'Pick someone who is on this trip.');
    const m = await db.q('select id from members where id = $1 and trip_id = $2', [id, tripId]);
    if (!m.rows.length) throw bad('invalid', 'Pick someone who is on this trip.');
    return id;
  }
  const category = (v) => (CATEGORIES.includes(v) ? v : '');

  r.post('/trips/:id/packing', async (c) => {
    const { member: me, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(me, 'items.write', trip, 'Viewers can look at the packing list but not add to it.');
    const b = await readJson(c.req);
    const title = M.text(b.title, 100);
    if (!title) throw bad('invalid', 'Type what to pack.');
    const n = await db.q('select count(*)::int as n from packing_items where trip_id = $1', [trip.id]);
    if (n.rows[0].n >= MAX_ITEMS) throw bad('too_many', 'The packing list can hold up to ' + MAX_ITEMS + ' things.');
    const who = await member(trip.id, b.assigned_to);
    const { rows } = await db.q('insert into packing_items (trip_id, title, category, assigned_to, created_by) values ($1,$2,$3,$4,$5) returning *', [trip.id, title, category(b.category), who, me.id]);
    hub.publish(trip.id, 'packing', { by: me.id });
    ok(c.res, { item: packingOut(rows[0]) });
  });

  r.patch('/trips/:id/packing/:pid', async (c) => {
    const { member: me, trip } = await auth.authenticate(c.req, c.params.id);
    const b = await readJson(c.req);
    if (!M.isUuid(c.params.pid)) throw missing('That item was removed.');
    const cur = (await db.q('select * from packing_items where id = $1 and trip_id = $2', [c.params.pid, trip.id])).rows[0];
    if (!cur) throw missing('That item was removed.');
    const editing = ['title', 'category', 'assigned_to'].some((k) => b[k] !== undefined);
    if (editing) P.require(me, 'items.write', trip, 'Viewers can look at the packing list but not change it.');
    if (b.done !== undefined) P.require(me, 'chat.write', trip, 'You cannot tick things off on this trip.');
    const title = b.title !== undefined ? M.text(b.title, 100) : cur.title;
    if (!title) throw bad('invalid', 'Type what to pack.');
    const cat = b.category !== undefined ? category(b.category) : cur.category;
    const who = b.assigned_to !== undefined ? await member(trip.id, b.assigned_to) : cur.assigned_to;
    const done = b.done !== undefined ? !!b.done : cur.done;
    const doneBy = b.done !== undefined ? (done ? me.id : null) : cur.done_by;
    const { rows } = await db.q('update packing_items set title=$3, category=$4, assigned_to=$5, done=$6, done_by=$7 where id=$1 and trip_id=$2 returning *', [cur.id, trip.id, title, cat, who, done, doneBy]);
    hub.publish(trip.id, 'packing', { by: me.id });
    ok(c.res, { item: packingOut(rows[0]) });
  });

  r.delete('/trips/:id/packing/:pid', async (c) => {
    const { member: me, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(me, 'items.write', trip, 'Viewers can look at the packing list but not change it.');
    if (!M.isUuid(c.params.pid)) throw missing('That item was removed.');
    const del = await db.q('delete from packing_items where id = $1 and trip_id = $2', [c.params.pid, trip.id]);
    if (!del.rowCount) throw missing('That item was removed.');
    hub.publish(trip.id, 'packing', { by: me.id });
    ok(c.res);
  });
}

module.exports = { register, CATEGORIES };
