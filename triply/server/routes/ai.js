/*
 * routes/ai.js — the AI helpers (see server/ai.js). Editors and owners can use them; they only suggest.
 * Nothing is saved here: the page shows what was found, and the person adds what they want with the normal routes.
 *   GET  /trips/:id/ai/status      is AI on, resting, and what is left today
 *   POST /trips/:id/ai/read        { blobId } (an uploaded PDF/photo) or { text } (pasted email or .ics)
 *   POST /trips/:id/ai/flight      { query: "AC 880, Jun 4" }
 *   POST /trips/:id/ai/plan        { description, cities[], transport, level, travelers }   (2 free per person; the owner can give more)
 *   POST /trips/:id/ai/request     { message }  ask the site owner for more free plans
 */
'use strict';

const P = require('../permissions');
const M = require('../models');
const { bad, missing, readJson, ok, clientIp } = require('../mini');
const { createAi } = require('../ai');

function register(r, d) {
  const { db, auth, limiter, cfg } = d;
  const ai = createAi(cfg, db);
  d.ai = ai;

  async function who(c) {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    P.require(member, 'items.write', trip, 'Viewers can look at the plans but not add them.');
    return { member, trip };
  }
  const guard = (c, member) => { limiter.check('ai', member.id); limiter.check('aiAddr', clientIp(c.req)); };

  r.get('/trips/:id/ai/status', async (c) => {
    const { member, trip } = await auth.authenticate(c.req, c.params.id);
    ok(c.res, await ai.status(trip.id, member.id));
  });

  // Ask the site owner for more free trip plans.
  r.post('/trips/:id/ai/request', async (c) => {
    const { member, trip } = await who(c);
    const body = await readJson(c.req);
    limiter.check('aiAddr', clientIp(c.req));
    ok(c.res, await ai.ask4more(trip, member, body.message));
  });

  r.post('/trips/:id/ai/read', async (c) => {
    const { member, trip } = await who(c);
    const body = await readJson(c.req, 300 * 1024);
    const input = {};
    if (body.blobId) {
      if (!M.isUuid(body.blobId)) throw missing('That file could not be found.');
      const f = (await db.q('select mime, bytes from blobs where id = $1 and trip_id = $2', [body.blobId, trip.id])).rows[0];
      if (!f) throw missing('That file could not be found.');
      input.file = { mime: f.mime, bytes: f.bytes };
    }
    if (body.text) input.text = String(body.text).slice(0, 60000);
    if (!input.file && !input.text) throw bad('invalid', 'Add a booking first.');
    if (!(input.text && /BEGIN:VCALENDAR/.test(input.text))) guard(c, member); // calendar files are free
    ok(c.res, await ai.read(trip, member, input));
  });

  r.post('/trips/:id/ai/flight', async (c) => {
    const { member, trip } = await who(c);
    const body = await readJson(c.req);
    guard(c, member);
    ok(c.res, await ai.flight(trip, member, body.query));
  });

  r.post('/trips/:id/ai/plan', async (c) => {
    const { member, trip } = await who(c);
    const body = await readJson(c.req);
    if (M.text(body.description, 1500).length < 5) throw bad('invalid', 'Tell us a little about the trip first.');
    guard(c, member); limiter.check('aiPlan', clientIp(c.req));
    ok(c.res, await ai.plan(trip, member, body));
  });
}

module.exports = { register };
