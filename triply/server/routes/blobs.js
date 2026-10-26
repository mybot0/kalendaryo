/*
 * routes/blobs.js — photos and files (chat attachments, trip covers).
 * Upload needs a member token. Reading uses the file's random id as the key (128 random bits, so it cannot be guessed),
 * because a plain <img> tag cannot send a token. Anyone who has the exact link can open the file; treat links like keys.
 * Only a short list of file types is accepted, images are checked by their first bytes, and nothing is ever run as a page.
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { bad, missing, ApiError, readBody, ok, send } = require('../mini');

// mime -> does the start of the file match? (null = trust the type, it is always downloaded, never shown inline)
const KINDS = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/gif': (b) => b.slice(0, 3).toString('latin1') === 'GIF',
  'image/webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  'image/heic': null,
  'application/pdf': (b) => b.slice(0, 4).toString('latin1') === '%PDF',
  'text/plain': null,
  'text/csv': null,
  'application/zip': (b) => b.slice(0, 2).toString('latin1') === 'PK',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b.slice(0, 2).toString('latin1') === 'PK',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => b.slice(0, 2).toString('latin1') === 'PK',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': (b) => b.slice(0, 2).toString('latin1') === 'PK'
};
const INLINE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function register(r, d) {
  const { db, limiter, auth, cfg } = d;

  r.post('/trips/:id/blobs', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'files.write', trip, 'You cannot add files to this trip.');
    limiter.check('upload', member.id);
    const mime = String(c.req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(KINDS, mime)) throw bad('unsupported', 'That kind of file cannot be added. Photos, PDFs, text and Office files work.');
    const buf = await readBody(c.req, cfg.maxBlobBytes);
    if (!buf.length) throw bad('invalid', 'That file is empty.');
    if (KINDS[mime] && !KINDS[mime](buf)) throw bad('unsupported', 'That file does not look like what it says it is.');
    const used = await db.q('select coalesce(sum(size), 0)::bigint as n from blobs where trip_id = $1', [trip.id]);
    if (Number(used.rows[0].n) + buf.length > cfg.maxTripBytes) throw new ApiError(413, 'quota_exceeded', 'This trip has used all its photo and file space.');
    let name = '';
    try { name = M.text(decodeURIComponent(String(c.req.headers['x-filename'] || '')), 120).replace(/[\\/:*?"<>|]/g, '_'); } catch (e) { /* bad encoding: no name */ }
    const { rows } = await db.q(
      'insert into blobs (trip_id, mime, name, size, bytes, created_by) values ($1,$2,$3,$4,$5,$6) returning id, mime, name, size',
      [trip.id, mime, name, buf.length, buf, member.id]
    );
    ok(c.res, { blob: rows[0] });
  });

  // Everything shared on the trip (chat attachments and uploads), newest first. Trip covers are not listed.
  r.get('/trips/:id/files', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'trip.read', trip);
    const { rows } = await db.q(
      `select id, mime, name, size, created_by, created_at from blobs
        where trip_id = $1 and id is distinct from (select cover_blob from trips where id = $1) order by created_at desc limit 500`, [trip.id]);
    ok(c.res, { files: rows.map((f) => Object.assign({}, f, { size: Number(f.size), created_at: f.created_at.toISOString() })) });
  });

  // The person who added a file, or an owner, can remove it. Chat messages that showed it lose the attachment.
  r.delete('/trips/:id/files/:fileId', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    if (!M.isUuid(c.params.fileId)) throw missing('That file could not be found.');
    const f = (await db.q('select id, created_by from blobs where id = $1 and trip_id = $2', [c.params.fileId, trip.id])).rows[0];
    if (!f) throw missing('That file could not be found.');
    if (f.created_by !== member.id) P.require(member, 'trip.edit', trip, 'Only the person who added a file, or an owner, can remove it.');
    await db.tx(async (cl) => {
      await cl.query("delete from messages where trip_id = $1 and blob_id = $2 and body = ''", [trip.id, f.id]);
      await cl.query('update messages set blob_id = null where trip_id = $1 and blob_id = $2', [trip.id, f.id]);
      await cl.query('delete from blobs where id = $1', [f.id]);
    });
    d.hub.publish(trip.id, 'files', { by: member.id });
    ok(c.res);
  });

  r.get('/blobs/:id', async (c) => {
    if (!M.isUuid(c.params.id)) throw missing('That file could not be found.');
    if (c.req.headers['if-none-match'] === '"' + c.params.id + '"') return send(c.res, 304, '', { ETag: '"' + c.params.id + '"' });
    const { rows } = await db.q('select mime, name, size, bytes from blobs where id = $1', [c.params.id]);
    if (!rows.length) throw missing('That file could not be found.');
    const f = rows[0];
    const inline = INLINE.has(f.mime);
    const fname = encodeURIComponent(f.name || 'file');
    send(c.res, 200, f.bytes, {
      'Content-Type': f.mime,
      'Content-Length': String(f.bytes.length),
      'Content-Disposition': (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + fname,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'ETag': '"' + c.params.id + '"',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });
  });
}

module.exports = { register, KINDS };
