/*
 * routes/members.js — who am I, change my profile, change a role, remove someone, leave.
 * A trip must always keep at least one owner. That is checked inside a transaction with row locks,
 * so two owners leaving at the same moment cannot both succeed.
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { bad, missing, conflict, readJson, ok } = require('../mini');
const { memberOut, tripOut } = require('../shapes');
const { postActivity } = require('./chat');

function register(r, d) {
  const { db, hub, auth } = d;

  // Used when someone opens their personal link: which trip is this token for?
  r.get('/me', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, null);
    ok(c.res, { member: memberOut(member, member.id), trip: tripOut(trip) });
  });

  r.patch('/trips/:id/members/me', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    const body = await readJson(c.req);
    const p = M.profile(Object.assign({ name: member.name, avatar: member.avatar, color: member.color }, body), member.color);
    const { rows } = await db.q(
      'update members set name=$2, avatar=$3, color=$4 where id=$1 returning id, trip_id, name, avatar, color, role, joined_at, last_seen_at',
      [member.id, p.name, p.avatar, p.color]
    );
    hub.publish(trip.id, 'members', { by: member.id });
    ok(c.res, { member: memberOut(rows[0], member.id) });
  });

  r.patch('/trips/:id/members/:memberId', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'members.manage', trip, 'Only an owner can change roles.');
    const body = await readJson(c.req);
    if (!P.isRole(body.role)) throw bad('invalid', 'Pick Owner, Editor or Viewer.');
    const updated = await db.tx(async (cl) => {
      const owners = await cl.query("select id from members where trip_id = $1 and role = 'owner' for update", [trip.id]);
      const t = await cl.query('select id, role from members where id = $1 and trip_id = $2 for update', [c.params.memberId, trip.id]);
      if (!t.rows.length) throw missing('That person is not on this trip.');
      if (t.rows[0].role === 'owner' && body.role !== 'owner' && owners.rows.length < 2) {
        throw conflict('last_owner', 'A trip needs at least one owner. Make someone else an owner first.');
      }
      const u = await cl.query(
        'update members set role = $2 where id = $1 returning id, trip_id, name, avatar, color, role, joined_at, last_seen_at',
        [c.params.memberId, body.role]
      );
      return u.rows[0];
    });
    hub.publish(trip.id, 'members', { by: member.id });
    hub.publish(trip.id, 'trip', { by: member.id }, [updated.id]); // their buttons may change
    ok(c.res, { member: memberOut(updated, member.id) });
  });

  // DELETE /members/me (or your own id) = leave. An owner can remove anyone else.
  r.delete('/trips/:id/members/:memberId', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    const targetId = c.params.memberId === 'me' ? member.id : c.params.memberId;
    const leaving = targetId === member.id;
    if (!leaving) P.require(member, 'members.manage', trip, 'Only an owner can remove people.');
    const removed = await db.tx(async (cl) => {
      const owners = await cl.query("select id from members where trip_id = $1 and role = 'owner' for update", [trip.id]);
      const t = await cl.query('select id, name, role from members where id = $1 and trip_id = $2 for update', [targetId, trip.id]);
      if (!t.rows.length) throw missing('That person is not on this trip.');
      if (t.rows[0].role === 'owner' && owners.rows.length < 2) {
        throw conflict('last_owner', leaving ? 'You are the only owner. Make someone else an owner before you leave, or delete the trip.' : 'A trip needs at least one owner.');
      }
      // Private messages they sent go with them; group messages stay as "a former traveler".
      await cl.query('delete from messages where trip_id = $1 and to_member is not null and sender_id = $2', [trip.id, targetId]);
      await cl.query('delete from members where id = $1', [targetId]);
      return t.rows[0];
    });
    hub.drop(trip.id, targetId, 'kicked');
    hub.publish(trip.id, 'members', { by: member.id });
    ok(c.res, { removed: removed.id });
  });
}

module.exports = { register };
