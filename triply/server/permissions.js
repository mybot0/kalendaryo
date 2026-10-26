/*
 * permissions.js — who can do what. One table. To add a role or a permission, add a line here.
 * Some permissions depend on a trip setting (viewers may chat only if the owner allows it).
 */
'use strict';

const { denied } = require('./mini');

const ALL = ['trip.read', 'trip.edit', 'trip.delete', 'members.manage', 'invites.manage', 'items.write', 'chat.write', 'files.write'];

const ROLES = {
  owner:  { label: 'Owner',  blurb: 'Full control of the trip.', perms: ALL },
  editor: { label: 'Editor', blurb: 'Can plan, add bookings and chat.', perms: ['trip.read', 'items.write', 'chat.write', 'files.write'] },
  viewer: { label: 'Viewer', blurb: 'Can look, and chat if the owner allows it.', perms: ['trip.read', 'chat.write', 'files.write'] }
};

// A permission that a role has "if the trip allows it".
const CONDITIONAL = {
  viewer: { 'chat.write': (trip) => !!trip.viewers_chat, 'files.write': (trip) => !!trip.viewers_chat }
};

const roleIds = () => Object.keys(ROLES);
const isRole = (r) => Object.prototype.hasOwnProperty.call(ROLES, r);

function can(member, perm, trip) {
  const role = ROLES[member && member.role];
  if (!role || !role.perms.includes(perm)) return false;
  const rule = CONDITIONAL[member.role] && CONDITIONAL[member.role][perm];
  return rule ? !!rule(trip || {}) : true;
}

function require_(member, perm, trip, message) {
  if (!can(member, perm, trip)) throw denied(message);
}

// What the page needs to draw buttons correctly. The server still checks every request.
function summary(member, trip) {
  const out = {};
  ALL.forEach((p) => { out[p] = can(member, p, trip); });
  return out;
}

const publicRoles = () => roleIds().map((id) => ({ id, label: ROLES[id].label, blurb: ROLES[id].blurb }));

module.exports = { ROLES, can, require: require_, summary, isRole, roleIds, publicRoles };
