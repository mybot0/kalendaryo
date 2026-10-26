/*
 * routes/chat.js — the group chat, direct messages, read marks and activity posts.
 *
 * A message is "group" when to_member is null, and "direct" when to_member is a member. A direct message
 * is only ever returned to its sender and its receiver. "Threads" are named from the reader's side:
 *   'trip'        the group chat
 *   <member id>   the direct chat with that person
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { bad, missing, readJson, ok } = require('../mini');
const { messageOut } = require('../shapes');

const MSG_COLS = 'm.id, m.sender_id, m.to_member, m.kind, m.body, m.mentions, m.blob_id, m.item_id, m.meta, m.created_at, b.mime as blob_mime, b.name as blob_name, b.size as blob_size';
const MSG_FROM = 'messages m left join blobs b on b.id = m.blob_id';

/* ---------- unread counts (also used by the trip state and My Trips) ---------- */
async function unreadFor(q, tripId, memberId) {
  const group = await q(
    `select count(*)::int as n, count(*) filter (where $2 = any(m.mentions))::int as mentions
       from messages m
      where m.trip_id = $1 and m.to_member is null and m.kind = 'text' and m.sender_id is distinct from $2
        and m.id > coalesce((select last_id from chat_reads where member_id = $2 and thread = 'trip'), 0)`,
    [tripId, memberId]
  );
  const dms = await q(
    `select m.sender_id, count(*)::int as n
       from messages m
      where m.trip_id = $1 and m.to_member = $2
        and m.id > coalesce((select r.last_id from chat_reads r where r.member_id = $2 and r.thread = m.sender_id::text), 0)
      group by m.sender_id`,
    [tripId, memberId]
  );
  const dm = {};
  dms.rows.forEach((r) => { if (r.sender_id) dm[r.sender_id] = r.n; });
  return { trip: group.rows[0].n, mentions: group.rows[0].mentions, dm };
}

/* ---------- activity posts: "Ryan added a restaurant" ---------- */
// ev: 'added' | 'updated' | 'removed' | 'joined' | 'left'. Skips repeats by the same person within a few minutes.
async function postActivity(db, hub, tripId, senderId, ev, item) {
  const meta = { event: ev };
  if (item) {
    meta.type = item.type; meta.title = item.title;
    if (item.start_date) meta.date = item.start_date;
    if (item.start_time) meta.time = item.start_time;
  }
  if (ev === 'updated' && item) {
    const recent = await db.q(
      `select 1 from messages where trip_id = $1 and kind = 'activity' and item_id = $2 and sender_id = $3 and created_at > now() - interval '10 minutes' limit 1`,
      [tripId, item.id, senderId]
    );
    if (recent.rows.length) return null;
  }
  const { rows } = await db.q(
    `insert into messages (trip_id, sender_id, kind, item_id, meta) values ($1, $2, 'activity', $3, $4)
     returning id, sender_id, to_member, kind, body, mentions, blob_id, item_id, meta, created_at`,
    [tripId, senderId, ev === 'removed' ? null : item ? item.id : null, JSON.stringify(meta)]
  );
  const msg = messageOut(rows[0]);
  hub.publish(tripId, 'chat', { thread: 'trip', message: msg });
  return msg;
}

function register(r, d) {
  const { db, hub, limiter, auth } = d;

  // Which thread does this request mean? Returns { to: null | memberId, other: memberId | null }
  async function resolveThread(tripId, me, raw) {
    const thread = String(raw || 'trip');
    if (thread === 'trip') return { to: null, other: null };
    if (!M.isUuid(thread) || thread === me.id) throw bad('invalid', 'That conversation does not exist.');
    const { rows } = await db.q('select id from members where id = $1 and trip_id = $2', [thread, tripId]);
    if (!rows.length) throw missing('That person is not on this trip.');
    return { to: thread, other: thread };
  }

  r.get('/trips/:id/messages', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'trip.read', trip);
    const th = await resolveThread(trip.id, member, c.query.get('thread'));
    const limit = Math.min(100, Math.max(1, parseInt(c.query.get('limit'), 10) || 50));
    const before = /^\d{1,18}$/.test(c.query.get('before') || '') ? c.query.get('before') : null;
    const params = [trip.id, limit + 1];
    let where;
    if (!th.other) where = 'm.to_member is null';
    else { params.push(member.id, th.other); where = `m.to_member is not null and ((m.sender_id = $3 and m.to_member = $4) or (m.sender_id = $4 and m.to_member = $3))`; }
    if (before) { params.push(before); where += ' and m.id < $' + params.length; }
    const { rows } = await db.q(`select ${MSG_COLS} from ${MSG_FROM} where m.trip_id = $1 and ${where} order by m.id desc limit $2`, params);
    const more = rows.length > limit;
    if (more) rows.pop();
    rows.reverse();
    ok(c.res, { messages: rows.map(messageOut), more });
  });

  // Search the messages this person may read: the group chat plus their own private chats.
  r.get('/trips/:id/search', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'trip.read', trip);
    const q = M.text(c.query.get('q'), 60);
    if (q.length < 2) return ok(c.res, { messages: [] });
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    const { rows } = await db.q(
      `select ${MSG_COLS} from ${MSG_FROM}
        where m.trip_id = $1 and m.kind = 'text' and m.body ilike $2
          and (m.to_member is null or m.to_member = $3 or m.sender_id = $3)
        order by m.id desc limit 20`, [trip.id, like, member.id]);
    ok(c.res, { messages: rows.map(messageOut) });
  });

  r.post('/trips/:id/messages', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'chat.write', trip, 'The trip owner has turned chat off for viewers.');
    limiter.check('message', member.id);
    const body = await readJson(c.req);
    const th = await resolveThread(trip.id, member, body.thread);
    const text = M.messageBody(body.body);
    let blobId = null;
    if (body.blobId) {
      if (!M.isUuid(body.blobId)) throw bad('invalid', 'That attachment could not be found.');
      const b = await db.q('select id from blobs where id = $1 and trip_id = $2 and created_by = $3', [body.blobId, trip.id, member.id]);
      if (!b.rows.length) throw bad('invalid', 'That attachment could not be found.');
      blobId = body.blobId;
    }
    if (!text && !blobId) throw bad('invalid', 'Type a message first.');

    let mentions = [];
    if (!th.other) {
      const people = await db.q('select id, name from members where trip_id = $1', [trip.id]);
      mentions = M.findMentions(text, people.rows, member.id);
    }
    const ins = await db.q(
      `insert into messages (trip_id, sender_id, to_member, kind, body, mentions, blob_id) values ($1, $2, $3, 'text', $4, $5, $6) returning id`,
      [trip.id, member.id, th.to, text, mentions, blobId]
    );
    const full = await db.q(`select ${MSG_COLS} from ${MSG_FROM} where m.id = $1`, [ins.rows[0].id]);
    const msg = messageOut(full.rows[0]);
    // The sender has obviously read up to their own message.
    await db.q(
      `insert into chat_reads (member_id, thread, last_id) values ($1, $2, $3)
       on conflict (member_id, thread) do update set last_id = greatest(chat_reads.last_id, excluded.last_id)`,
      [member.id, th.other || 'trip', msg.id]
    );
    if (!th.other) hub.publish(trip.id, 'chat', { thread: 'trip', message: msg });
    else hub.publish(trip.id, 'chat', { thread: 'dm', message: msg }, [member.id, th.other]);
    ok(c.res, { message: msg });
  });

  r.post('/trips/:id/reads', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    const body = await readJson(c.req);
    const th = await resolveThread(trip.id, member, body.thread);
    const last = /^\d{1,18}$/.test(String(body.lastId || '')) ? String(body.lastId) : null;
    if (!last) throw bad('invalid', 'Nothing to mark as read.');
    await db.q(
      `insert into chat_reads (member_id, thread, last_id) values ($1, $2, $3)
       on conflict (member_id, thread) do update set last_id = greatest(chat_reads.last_id, excluded.last_id)`,
      [member.id, th.other || 'trip', last]
    );
    ok(c.res);
  });
}

module.exports = { register, unreadFor, postActivity };
