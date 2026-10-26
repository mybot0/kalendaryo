// live.js — sends changes to everyone in a family who has the page open (Server-Sent Events).
const rooms = new Map(); // familyId -> Set<{res, accessId}>

function join(familyId, accessId, res) {
  if (!rooms.has(familyId)) rooms.set(familyId, new Set());
  const client = { res, accessId };
  rooms.get(familyId).add(client);
  return () => { const r = rooms.get(familyId); if (r) { r.delete(client); if (!r.size) rooms.delete(familyId); } };
}
function send(familyId, event, data, onlyAccessId) {
  const r = rooms.get(familyId);
  if (!r) return;
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (const c of r) if (!onlyAccessId || c.accessId === onlyAccessId) { try { c.res.write(msg); } catch (e) { /* closed */ } }
}
function kick(familyId, accessId) {
  const r = rooms.get(familyId);
  if (!r) return;
  for (const c of [...r]) if (c.accessId === accessId) { try { c.res.write('event: removed\ndata: {}\n\n'); c.res.end(); } catch (e) {} r.delete(c); }
}
function closeFamily(familyId) {
  const r = rooms.get(familyId);
  if (!r) return;
  for (const c of r) { try { c.res.write('event: removed\ndata: {}\n\n'); c.res.end(); } catch (e) {} }
  rooms.delete(familyId);
}
// Keep connections open through proxies.
setInterval(() => { for (const r of rooms.values()) for (const c of r) { try { c.res.write(': ping\n\n'); } catch (e) {} } }, 25000).unref();

// For the owner view: how many people have each home open right now (not counting the owner viewing).
function online() {
  const out = new Map();
  for (const [familyId, r] of rooms) { let n = 0; for (const c of r) if (c.accessId !== 'owner-view') n++; if (n) out.set(familyId, n); }
  return out;
}

module.exports = { join, send, kick, closeFamily, online };
