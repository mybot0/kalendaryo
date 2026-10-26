/*
 * live.js — live updates with server-sent events. One open stream per person per trip page.
 * The server only says "something changed" (and for chat, what the new message is). The page refetches the rest.
 * This hub lives in memory, so it works for one server process. More than one process needs Postgres LISTEN/NOTIFY.
 */
'use strict';

function createHub() {
  const trips = new Map(); // tripId -> Set<{ res, memberId }>
  const beat = setInterval(() => {
    for (const set of trips.values()) for (const c of set) { try { c.res.write(': ping\n\n'); } catch (e) { /* closed */ } }
  }, 20000);
  if (beat.unref) beat.unref();

  function subscribe(tripId, memberId, req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    const client = { res, memberId };
    if (!trips.has(tripId)) trips.set(tripId, new Set());
    trips.get(tripId).add(client);
    res.write('event: hello\ndata: {}\n\n');
    const done = () => {
      const set = trips.get(tripId);
      if (set) { set.delete(client); if (!set.size) trips.delete(tripId); }
    };
    req.on('close', done);
    res.on('error', done);
    return client;
  }

  // to: null = everyone on the trip, or an array of member ids.
  function publish(tripId, kind, payload, to) {
    const set = trips.get(tripId);
    if (!set) return;
    const data = JSON.stringify(Object.assign({ kind }, payload || {}));
    for (const c of set) {
      if (to && !to.includes(c.memberId)) continue;
      try { c.res.write('event: change\ndata: ' + data + '\n\n'); } catch (e) { /* closed */ }
    }
  }

  // Tell a person they were removed, then close their streams.
  function drop(tripId, memberId, kind) {
    const set = trips.get(tripId);
    if (!set) return;
    for (const c of [...set]) {
      if (memberId && c.memberId !== memberId) continue;
      try { c.res.write('event: change\ndata: ' + JSON.stringify({ kind: kind || 'kicked' }) + '\n\n'); c.res.end(); } catch (e) { /* closed */ }
      set.delete(c);
    }
    if (!set.size) trips.delete(tripId);
  }

  function close() {
    clearInterval(beat);
    for (const set of trips.values()) for (const c of set) { try { c.res.end(); } catch (e) { /* closed */ } }
    trips.clear();
  }
  const count = (tripId) => (trips.get(tripId) ? trips.get(tripId).size : 0);

  return { subscribe, publish, drop, close, count };
}

module.exports = { createHub };
