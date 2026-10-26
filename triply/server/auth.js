/*
 * auth.js — who is asking? A member's secret token arrives in the Authorization header.
 * Only the SHA-256 of a token is stored, so a copy of the database does not hand out access.
 * The token must belong to the trip named in the address, or the answer is "not found".
 */
'use strict';

const { ApiError, missing } = require('./mini');
const { sha256 } = require('./db');

const MEMBER_COLS = 'm.id, m.trip_id, m.name, m.avatar, m.color, m.role, m.joined_at, m.last_seen_at';

function tokenOf(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,80})$/.exec(h);
  return m ? m[1] : '';
}

function createAuth(db) {
  // Returns { member, trip }. With tripId, the member must be on that trip.
  async function authenticate(req, tripId) {
    const token = tokenOf(req);
    if (!token) throw new ApiError(401, 'unauthorized', 'Open your Triply link again to get back into this trip.');
    const { rows } = await db.q(
      'select ' + MEMBER_COLS + ', to_jsonb(t) as trip from members m join trips t on t.id = m.trip_id where m.token_hash = $1',
      [sha256(token)]
    );
    if (!rows.length) throw new ApiError(401, 'unauthorized', 'This link does not work any more. You may have been removed, or the trip was deleted.');
    const row = rows[0];
    const trip = row.trip; delete row.trip;
    if (tripId && trip.id !== tripId) throw missing('That trip could not be found.');
    // Keep "last seen" fresh without writing on every request.
    if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 10 * 60 * 1000) {
      db.q('update members set last_seen_at = now() where id = $1', [row.id]).catch(() => {});
    }
    return { member: row, trip };
  }
  return { authenticate, tokenOf };
}

module.exports = { createAuth, tokenOf };
