// care.js — Care: medicines for someone at home, and their own Care board link.
//
// A Care board link (/care/<token>, token starts with "cb") opens ONLY that person's Care board.
// It can read: the family's settings and people, that person's medicines (meds), doses and care notes
// (carelog), and calendar events that include that person. It can write only small things for that
// person: mark pills taken / late / skipped (doses), "I bought more" (meds count), add a medicine
// (if the family allows it), and care notes (I need help, Nana added a medicine…).
//
// The family manages everything from the normal app (Care page). Care data is in the normal docs table
// in its own collections (meds, doses, carelog), so it can move to its own app later without a rebuild.
'use strict';
const crypto = require('crypto');

const CARE_COLS = ['meds', 'doses', 'carelog'];
const BOARD_LOG = ['help', 'added', 'bought', 'taken', 'late', 'skipped', 'snooze'];
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const isCareToken = (t) => typeof t === 'string' && /^cb[A-Za-z0-9_-]{20,98}$/.test(t);

module.exports = function care({ db, live, fail, send, json, clean, auth, need, hexId }) {
  const accessIdOf = (linkId) => 'care-' + linkId;

  // Called from auth(): who is this Care board link?
  async function who(token) {
    const r = await db.q('SELECT c.id, c.family_id, c.member_id, c.last_seen, f.name AS family_name FROM care_links c JOIN families f ON f.id = c.family_id WHERE c.token_hash=$1', [hash(token)]);
    if (!r.rowCount) fail(401, 'no_access', 'This Care board link is not valid anymore. Ask your family for the new link.');
    const c = r.rows[0];
    if (!c.last_seen || Date.now() - new Date(c.last_seen).getTime() > 60000) db.q('UPDATE care_links SET last_seen = now() WHERE id=$1', [c.id]).catch(() => {});
    return { id: accessIdOf(c.id), linkId: c.id, family_id: c.family_id, family_name: c.family_name, member_id: c.member_id, name: 'Care board', role: 'care', care: true };
  }

  // A Care board may only call these.
  function allowed(req) {
    const p = req.path, m = req.method;
    if (m === 'GET' && (p === '/api/me' || p === '/api/state' || p === '/api/stream')) return true;
    if (/^\/api\/docs\/(meds|doses|carelog)(\/[^/]+)?$/.test(p) && ['POST', 'PUT', 'DELETE'].includes(m)) return true;
    return false;
  }

  // What a Care board can see.
  function visible(member, col, data) {
    if (col === 'settings' || col === 'members') return true;
    if (CARE_COLS.includes(col)) return !!data && data.who === member;
    if (col === 'events') return !!data && Array.isArray(data.memberIds) && data.memberIds.includes(member);
    return false;
  }
  function filterState(me, docs) {
    const out = {};
    for (const [col, list] of Object.entries(docs)) {
      const keep = list.filter((d) => visible(me.member_id, col, d.data));
      if (keep.length) out[col] = col === 'settings' ? keep.filter((d) => d.id === 'main') : keep;
    }
    return out;
  }
  // Live updates for a Care board: its own person's things only. Deleted items (data null) carry no
  // person, so their ids are sent (they say nothing about the family).
  const streamFilter = (member) => (event, data) => {
    if (event === 'removed') return true;
    if (event !== 'doc') return false;
    if (data.data === null) return data.col === 'events' || CARE_COLS.includes(data.col);
    return visible(member, data.col, data.data);
  };

  async function settingsOf(familyId) {
    const q = await db.q("SELECT data FROM docs WHERE family_id=$1 AND col='settings' AND id='main'", [familyId]);
    return q.rows[0] ? q.rows[0].data : {};
  }
  async function existing(familyId, col, id) {
    if (!id) return null;
    const q = await db.q('SELECT data FROM docs WHERE family_id=$1 AND col=$2 AND id=$3', [familyId, col, id]);
    return q.rows[0] ? q.rows[0].data : null;
  }

  // Rules for what a Care board may save. Throws when it is not allowed. Returns what to save.
  async function checkWrite(req, id, data) {
    const me = req.me, col = req.params.col, member = me.member_id;
    const no = () => fail(403, 'read_only', 'The Care board cannot change that. Ask your family.');
    if (!CARE_COLS.includes(col)) no();
    if (!data || data.who !== member) no();
    const old = await existing(me.family_id, col, id);
    if (old && old.who !== member) no();
    if (col === 'carelog') {
      if (old || !BOARD_LOG.includes(data.kind)) no();
    } else if (col === 'meds' && !old) {
      const s = await settingsOf(me.family_id);
      const b = (s.care && s.care.boards && s.care.boards[member]) || {};
      if (b.letAdd === false) fail(403, 'read_only', 'Your family turned off adding medicines on this board.');
      if (data.addedBy !== 'board') no();
    } else if (col === 'meds' && old) {
      // The board may only change how many pills are left (I bought more): everything else stays as the family saved it.
      const count = Number(data.count);
      if (!Number.isFinite(count) || count < 0 || count > 9999 || typeof data.countAt !== 'string') no();
      return Object.assign({}, old, { count, countAt: data.countAt.slice(0, 30) });
    }
    return data;
  }
  async function checkDelete(req) {
    const me = req.me;
    if (req.params.col !== 'doses') fail(403, 'read_only', 'The Care board cannot delete that.');
    const old = await existing(me.family_id, 'doses', req.params.id);
    if (old && old.who !== me.member_id) fail(403, 'read_only', 'The Care board cannot delete that.');
  }

  /* ---------- family side: the link for each person ---------- */
  function routes(r) {
    const linkOut = (row, host) => ({ memberId: row.member_id, url: host + '/care/' + row.token, createdAt: row.created_at, lastSeen: row.last_seen, online: live.has(row.family_id, accessIdOf(row.id)) });
    const hostOf = (req) => {
      const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
      return proto + '://' + (req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
    };
    async function memberExists(familyId, id) {
      if (!id || !/^[A-Za-z0-9_~.\-]{1,120}$/.test(id)) return false;
      return !!(await existing(familyId, 'members', id));
    }
    // The links (editors and owners only: the link opens the board).
    r.get('/api/care/links', auth, need('editor'), async (req, res) => {
      const q = await db.q('SELECT * FROM care_links WHERE family_id=$1', [req.me.family_id]);
      send(res, 200, { links: q.rows.map((row) => linkOut(row, hostOf(req))) });
    });
    // Make the link for a person, or a new one ("Make a new link": the old one stops working right away).
    r.post('/api/care/links', auth, json, need('editor'), async (req, res) => {
      const memberId = clean(req.body.memberId, 120);
      if (!(await memberExists(req.me.family_id, memberId))) fail(400, 'bad_request', 'That person is not in this family.');
      const old = await db.q('SELECT id FROM care_links WHERE family_id=$1 AND member_id=$2', [req.me.family_id, memberId]);
      if (old.rowCount && !req.body.renew) { // already has one: just show it
        const q = await db.q('SELECT * FROM care_links WHERE id=$1', [old.rows[0].id]);
        return send(res, 200, { link: linkOut(q.rows[0], hostOf(req)) });
      }
      const token = 'cb' + crypto.randomBytes(24).toString('base64url');
      const id = hexId();
      await db.tx(async (c) => {
        await c.query('DELETE FROM care_links WHERE family_id=$1 AND member_id=$2', [req.me.family_id, memberId]);
        await c.query('INSERT INTO care_links (id, family_id, member_id, token, token_hash) VALUES ($1,$2,$3,$4,$5)', [id, req.me.family_id, memberId, token, hash(token)]);
      });
      for (const row of old.rows) live.kick(req.me.family_id, accessIdOf(row.id));
      const q = await db.q('SELECT * FROM care_links WHERE id=$1', [id]);
      send(res, 200, { link: linkOut(q.rows[0], hostOf(req)) });
    });
  }

  // The Care board's own home-screen app (icon and name "Care board").
  function manifest(req, res, token) {
    const body = JSON.stringify({
      name: 'Care board', short_name: 'Care board', start_url: '/care/' + token, scope: '/care/' + token, display: 'standalone',
      background_color: '#F4F3EE', theme_color: '#3F7360',
      icons: [{ src: '/care-icons/192.png', sizes: '192x192', type: 'image/png' }, { src: '/care-icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
    });
    res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }
  const headFor = (token) => '<link rel="manifest" href="/care/' + token + '/app.webmanifest"><link rel="apple-touch-icon" href="/care-icons/180.png">' +
    '<meta name="apple-mobile-web-app-title" content="Care board"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="default"><title>Care board</title>';

  return { isCareToken, who, allowed, filterState, streamFilter, checkWrite, checkDelete, routes, manifest, headFor, CARE_COLS };
};
