/*
 * shapes.js — what leaves the server. Rows are turned into plain objects here, so secrets
 * (token hashes, invite hashes) can never leak by accident.
 */
'use strict';

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

const tripOut = (t) => ({
  id: t.id, name: t.name, destination: t.destination, route: t.route || [],
  start_date: t.start_date, end_date: t.end_date, description: t.description,
  cover_emoji: t.cover_emoji, cover_color: t.cover_color, cover_blob: t.cover_blob || null,
  viewers_chat: !!t.viewers_chat, created_at: iso(t.created_at), updated_at: iso(t.updated_at)
});

const memberOut = (m, selfId) => ({
  id: m.id, name: m.name, avatar: m.avatar, color: m.color, role: m.role,
  joined_at: iso(m.joined_at), last_seen_at: iso(m.last_seen_at), you: m.id === selfId
});

const itemOut = (i) => ({
  id: i.id, type: i.type, title: i.title,
  start_date: i.start_date, start_time: i.start_time, end_date: i.end_date, end_time: i.end_time,
  location: i.location, confirmation: i.confirmation, notes: i.notes, data: i.data || {},
  version: i.version, created_by: i.created_by, updated_by: i.updated_by,
  created_at: iso(i.created_at), updated_at: iso(i.updated_at)
});

const expenseOut = (e) => ({
  id: e.id, title: e.title, amount: Number(e.amount_cents) / 100, currency: e.currency, paid_by: e.paid_by, split: e.split || [],
  spent_on: e.spent_on, item_id: e.item_id, note: e.note, created_by: e.created_by, created_at: iso(e.created_at)
});

const packingOut = (x) => ({
  id: x.id, title: x.title, category: x.category, assigned_to: x.assigned_to, done: !!x.done, done_by: x.done_by,
  created_by: x.created_by, created_at: iso(x.created_at)
});

const inviteOut = (v) => ({
  id: v.id, role: v.role, label: v.label, created_by: v.created_by,
  created_at: iso(v.created_at), expires_at: iso(v.expires_at)
});

const messageOut = (m) => ({
  id: String(m.id), sender_id: m.sender_id, to_member: m.to_member, kind: m.kind,
  body: m.body, mentions: m.mentions || [], item_id: m.item_id, meta: m.meta || {},
  blob: m.blob_id ? { id: m.blob_id, mime: m.blob_mime || '', name: m.blob_name || '', size: m.blob_size || 0 } : null,
  created_at: iso(m.created_at)
});

// Where the page lives, for building links. PUBLIC_URL wins; otherwise ask the request.
function publicBase(cfg, req) {
  if (cfg.publicUrl) return cfg.publicUrl;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket && req.socket.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return proto + '://' + host + cfg.basePath;
}
const personalLink = (cfg, req, token) => publicBase(cfg, req) + '/#/t/' + token;
const inviteLink = (cfg, req, code) => publicBase(cfg, req) + '/#/join/' + code;

module.exports = { packingOut, expenseOut, tripOut, memberOut, itemOut, inviteOut, messageOut, publicBase, personalLink, inviteLink };
