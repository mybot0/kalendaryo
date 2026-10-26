/*
 * routes/expenses.js — who paid for what, and who shares each cost. Balances are worked out in the page
 * from this list, so the server only stores and checks the records.
 * Money is kept as whole cents (never floating point).
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { bad, missing, readJson, ok } = require('../mini');
const { expenseOut } = require('../shapes');

const MAX_EXPENSES = 1000;

function register(r, d) {
  const { db, hub, auth } = d;

  async function clean(tripId, b, base) {
    const g = (k, dflt) => (b[k] !== undefined ? b[k] : base ? base[k] : dflt);
    const title = M.text(g('title', ''), 120);
    if (!title) throw bad('invalid', 'Please say what the cost was for.');
    const raw = b.amount !== undefined ? Number(b.amount) : base ? Number(base.amount_cents) / 100 : NaN;
    if (!Number.isFinite(raw) || raw <= 0 || raw > 1e7) throw bad('invalid', 'Enter an amount above zero.');
    const cents = Math.round(raw * 100);
    const currency = M.text(g('currency', 'CAD'), 3).toUpperCase().replace(/[^A-Z]/g, '') || 'CAD';
    const people = (await db.q('select id from members where trip_id = $1', [tripId])).rows.map((x) => x.id);
    const paid = g('paid_by', null);
    if (!people.includes(paid)) throw bad('invalid', 'Pick who paid.');
    const split = [...new Set((Array.isArray(g('split', [])) ? g('split', []) : []).filter((x) => people.includes(x)))];
    if (!split.length) throw bad('invalid', 'Pick at least one person to share the cost.');
    const on = g('spent_on', null) || null;
    if (on && !M.isDate(on)) throw bad('invalid', 'That date does not look right.');
    let item = g('item_id', null) || null;
    if (item) {
      if (!M.isUuid(item)) throw bad('invalid', 'That plan could not be found.');
      const it = await db.q('select id from items where id = $1 and trip_id = $2', [item, tripId]);
      if (!it.rows.length) item = null;
    }
    return { title, cents, currency, paid, split, on, item, note: M.text(g('note', ''), 500) };
  }

  r.post('/trips/:id/expenses', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the costs but not change them.');
    const x = await clean(trip.id, await readJson(c.req), null);
    const n = await db.q('select count(*)::int as n from expenses where trip_id = $1', [trip.id]);
    if (n.rows[0].n >= MAX_EXPENSES) throw bad('too_many', 'A trip can hold up to ' + MAX_EXPENSES + ' costs.');
    const { rows } = await db.q(
      `insert into expenses (trip_id, title, amount_cents, currency, paid_by, split, spent_on, item_id, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [trip.id, x.title, x.cents, x.currency, x.paid, x.split, x.on, x.item, x.note, member.id]
    );
    hub.publish(trip.id, 'expenses', { by: member.id });
    ok(c.res, { expense: expenseOut(rows[0]) });
  });

  r.patch('/trips/:id/expenses/:eid', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the costs but not change them.');
    if (!M.isUuid(c.params.eid)) throw missing('That cost was removed.');
    const cur = (await db.q('select * from expenses where id = $1 and trip_id = $2', [c.params.eid, trip.id])).rows[0];
    if (!cur) throw missing('That cost was removed.');
    const x = await clean(trip.id, await readJson(c.req), cur);
    const { rows } = await db.q(
      `update expenses set title=$3, amount_cents=$4, currency=$5, paid_by=$6, split=$7, spent_on=$8, item_id=$9, note=$10, updated_at=now()
        where id=$1 and trip_id=$2 returning *`,
      [cur.id, trip.id, x.title, x.cents, x.currency, x.paid, x.split, x.on, x.item, x.note]
    );
    hub.publish(trip.id, 'expenses', { by: member.id });
    ok(c.res, { expense: expenseOut(rows[0]) });
  });

  r.delete('/trips/:id/expenses/:eid', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the costs but not change them.');
    if (!M.isUuid(c.params.eid)) throw missing('That cost was removed.');
    const del = await db.q('delete from expenses where id = $1 and trip_id = $2', [c.params.eid, trip.id]);
    if (!del.rowCount) throw missing('That cost was removed.');
    hub.publish(trip.id, 'expenses', { by: member.id });
    ok(c.res);
  });
}

module.exports = { register };
