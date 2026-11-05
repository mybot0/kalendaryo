/*
 * help.js — "Help & ideas": each person's private chat with the Triply team.
 * The conversations live in Kalendaryo's database; Kalendaryo hands the functions in as cfg.support.
 * Without it (Triply on its own) these routes answer "not found".
 */
'use strict';

const { ok, readJson, missing, ApiError } = require('../mini');

function register(r, d) {
  const { auth, cfg } = d;
  const S = () => { const f = typeof cfg.support === 'function' ? cfg.support() : cfg.support; if (!f) throw missing('Not found.'); return f; };
  async function who(c) {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    if (member.owner_view) throw new ApiError(403, 'read_only', 'Help & ideas is for the people on this trip.');
    return { member, trip };
  }
  r.get('/trips/:id/help', async (c) => { const { member, trip } = await who(c); ok(c.res, await S().get(member, trip)); });
  r.get('/trips/:id/help/unread', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    if (member.owner_view) return ok(c.res, { unread: 0 });
    ok(c.res, await S().unread(member, trip));
  });
  r.post('/trips/:id/help', async (c) => { const { member, trip } = await who(c); ok(c.res, await S().send(member, trip, await readJson(c.req, 1200 * 1024))); });
  r.post('/trips/:id/help/seen', async (c) => { const { member } = await who(c); ok(c.res, await S().seen(member)); });
}

module.exports = { register };
