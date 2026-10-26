/*
 * routes/invites.js — invitation links.
 * An invite is single-use and expires (INVITE_DAYS). Only the hash of the code is stored, so the link can be
 * copied when it is made, and not read back later. To share again, make a new one.
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { sha256, randomToken } = require('../db');
const { ApiError, bad, missing, readJson, ok, clientIp } = require('../mini');
const { memberOut, inviteOut, inviteLink, personalLink } = require('../shapes');
const { postActivity } = require('./chat');

const MAX_PENDING = 50;
const CODE_OK = /^[A-Za-z0-9_-]{12,64}$/;

function register(r, d) {
  const { db, hub, limiter, auth, cfg } = d;

  r.post('/trips/:id/invites', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'invites.manage', trip, 'Only an owner can invite people.');
    const body = await readJson(c.req);
    const role = P.isRole(body.role) ? body.role : 'editor';
    const label = M.text(body.label, 60);
    const pending = await db.q('select count(*)::int as n from invites where trip_id = $1 and used_at is null and expires_at > now()', [trip.id]);
    if (pending.rows[0].n >= MAX_PENDING) throw bad('too_many', 'There are already ' + MAX_PENDING + ' open invitations. Cancel some first.');
    const code = randomToken(12);
    const { rows } = await db.q(
      `insert into invites (trip_id, code_hash, role, label, created_by, expires_at)
       values ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval) returning id, role, label, created_by, created_at, expires_at`,
      [trip.id, sha256(code), role, label, member.id, String(cfg.inviteDays)]
    );
    hub.publish(trip.id, 'invites', { by: member.id }, null);
    ok(c.res, { invite: inviteOut(rows[0]), code, link: inviteLink(cfg, c.req, code) });
  });

  r.delete('/trips/:id/invites/:inviteId', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'invites.manage', trip, 'Only an owner can cancel invitations.');
    if (!M.isUuid(c.params.inviteId)) throw missing('That invitation could not be found.');
    await db.q('delete from invites where id = $1 and trip_id = $2 and used_at is null', [c.params.inviteId, trip.id]);
    hub.publish(trip.id, 'invites', { by: member.id }, null);
    ok(c.res);
  });

  // Public: what is this invitation for? (so the page can say "Ryan invited you to Spain 2027")
  async function findInvite(code, forUpdateClient) {
    if (!CODE_OK.test(String(code || ''))) throw new ApiError(404, 'invite_invalid', 'This invitation link is not valid.');
    const run = forUpdateClient ? forUpdateClient.query.bind(forUpdateClient) : db.q;
    const { rows } = await run(
      `select i.id, i.trip_id, i.role, i.label, i.used_at, i.expires_at, i.expires_at < now() as expired, i.created_by from invites i where i.code_hash = $1` + (forUpdateClient ? ' for update' : ''),
      [sha256(code)]
    );
    if (!rows.length) throw new ApiError(404, 'invite_invalid', 'This invitation link is not valid.');
    const inv = rows[0];
    if (inv.used_at) throw new ApiError(410, 'invite_used', 'This invitation has already been used. Ask for a new one.');
    if (inv.expired) throw new ApiError(410, 'invite_expired', 'This invitation has expired. Ask for a new one.');
    return inv;
  }

  r.get('/invites/peek/:code', async (c) => {
    limiter.check('invite', clientIp(c.req));
    const inv = await findInvite(c.params.code);
    const t = await db.q(
      `select t.name, t.destination, t.start_date, t.end_date, t.cover_emoji, t.cover_color, t.cover_blob,
              (select count(*)::int from members where trip_id = t.id) as travelers,
              (select name from members where id = $2) as inviter
         from trips t where t.id = $1`,
      [inv.trip_id, inv.created_by]
    );
    ok(c.res, { trip: t.rows[0], role: inv.role, label: inv.label, inviter: t.rows[0].inviter || null, role_label: P.ROLES[inv.role].label });
  });

  r.post('/join', async (c) => {
    limiter.check('invite', clientIp(c.req));
    const body = await readJson(c.req);
    const token = randomToken(24);
    const out = await db.tx(async (cl) => {
      const inv = await findInvite(body.code, cl);
      const used = await cl.query('select color from members where trip_id = $1', [inv.trip_id]);
      const who = M.profile(body, M.nextColor(used.rows.map((x) => x.color)));
      const mem = await cl.query(
        `insert into members (trip_id, name, avatar, color, role, token_hash) values ($1,$2,$3,$4,$5,$6)
         returning id, trip_id, name, avatar, color, role, joined_at, last_seen_at`,
        [inv.trip_id, who.name, who.avatar, who.color, inv.role, sha256(token)]
      );
      await cl.query('update invites set used_at = now(), used_by = $2 where id = $1', [inv.id, mem.rows[0].id]);
      return mem.rows[0];
    });
    await postActivity(db, hub, out.trip_id, out.id, 'joined', null);
    hub.publish(out.trip_id, 'members', { by: out.id });
    hub.publish(out.trip_id, 'invites', { by: out.id });
    ok(c.res, { tripId: out.trip_id, member: memberOut(out, out.id), token, link: personalLink(cfg, c.req, token) });
  });
}

module.exports = { register };
