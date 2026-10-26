/*
 * models.js — cleaning and checking of everything before it is saved.
 * Nothing from the page is trusted: text is trimmed and cut to length, dates and times must match their format,
 * and every item type keeps only the fields it knows.
 */
'use strict';

const { bad } = require('./mini');

// Same soft palette as Kalendaryo. Travelers and covers use these.
const PALETTE = ['#F4A59A', '#F6C28E', '#F1DC8B', '#B4D9AA', '#9ED8C6', '#A8CDEA', '#C7B7EA', '#EFB2CB'];

const text = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isColor = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// One emoji or short symbol for an avatar or cover. No letters or markup allowed through.
function emoji(v, dflt) {
  const s = text(v, 16);
  if (!s) return dflt || '';
  return /[\p{Extended_Pictographic}‍️]/u.test(s) && !/[<>&"']/.test(s) ? s : (dflt || '');
}

/* ---------- people ---------- */
function profile(d, fallbackColor) {
  const name = text(d.name, 30);
  if (!name) throw bad('invalid', 'Please enter your name.');
  return { name, avatar: emoji(d.avatar, ''), color: isColor(d.color) ? d.color : fallbackColor };
}

function nextColor(used) {
  const taken = new Set(used || []);
  return PALETTE.find((c) => !taken.has(c)) || PALETTE[(used || []).length % PALETTE.length];
}

/* ---------- trips ---------- */
function trip(d, base) {
  const b = base || {};
  const name = d.name !== undefined ? text(d.name, 80) : b.name;
  if (!name) throw bad('invalid', 'Please give the trip a name.');
  const start = d.start_date !== undefined ? d.start_date : b.start_date;
  const end = d.end_date !== undefined ? d.end_date : b.end_date;
  if (!isDate(start)) throw bad('invalid', 'Please pick the first day of the trip.');
  if (!isDate(end)) throw bad('invalid', 'Please pick the last day of the trip.');
  if (end < start) throw bad('invalid', 'The last day must be on or after the first day.');
  if (dayDiff(start, end) > 365) throw bad('invalid', 'A trip can be up to one year long.');
  let route = d.route !== undefined ? d.route : b.route || [];
  if (typeof route === 'string') route = route.split(/\s*(?:→|->|\n|,)\s*/);
  route = (Array.isArray(route) ? route : []).map((x) => text(x, 60)).filter(Boolean).slice(0, 20);
  return {
    name,
    destination: d.destination !== undefined ? text(d.destination, 80) : b.destination || '',
    route,
    start_date: start,
    end_date: end,
    description: d.description !== undefined ? text(d.description, 2000) : b.description || '',
    cover_emoji: d.cover_emoji !== undefined ? emoji(d.cover_emoji, '✈️') : b.cover_emoji || '✈️',
    cover_color: d.cover_color !== undefined ? (isColor(d.cover_color) ? d.cover_color : PALETTE[0]) : b.cover_color || PALETTE[0],
    viewers_chat: d.viewers_chat !== undefined ? !!d.viewers_chat : b.viewers_chat !== false
  };
}

/* ---------- itinerary items ---------- */
// needsStart: a date is required. data: the extra fields this type keeps, with how to clean them.
const str = (n) => (v) => text(v, n);
const TYPES = {
  flight:     { label: 'Flight',     needsStart: true,  data: { airline: str(60), flightNo: str(20), from: str(80), to: str(80), terminal: str(20), gate: str(20), seat: str(20) } },
  hotel:      { label: 'Hotel',      needsStart: true,  data: { room: str(120), contact: str(160) } },
  car:        { label: 'Car rental', needsStart: true,  data: { company: str(80), dropoffLocation: str(160), vehicle: str(80) } },
  cruise:     { label: 'Cruise',     needsStart: true,  data: { cruiseLine: str(80), ship: str(80), disembarkLocation: str(160), cabin: str(40) } },
  activity:   { label: 'Activity',   needsStart: false, data: { cost: (v) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? '' : Math.min(1e7, Math.max(0, Math.round(n * 100) / 100)); }, currency: (v) => text(v, 3).toUpperCase().replace(/[^A-Z]/g, '') } },
  restaurant: { label: 'Restaurant', needsStart: true,  data: { people: (v) => { const n = parseInt(v, 10); return n >= 1 && n <= 99 ? n : ''; } } },
  place:      { label: 'Place',      needsStart: false, data: { website: (v) => { const s = text(v, 200); return /^https?:\/\//i.test(s) ? s : (s && /^[\w.-]+\.[a-z]{2,}/i.test(s) ? 'https://' + s : ''); } } },
  note:       { label: 'Note',       needsStart: false, data: {} }
};
const typeIds = () => Object.keys(TYPES);

function defaultTitle(type, data, base) {
  if (type === 'flight') {
    const route = [data.from, data.to].filter(Boolean).join(' → ');
    const fl = [data.airline, data.flightNo].filter(Boolean).join(' ');
    return route || fl || 'Flight';
  }
  if (type === 'car') return data.company || 'Car rental';
  if (type === 'cruise') return data.ship || data.cruiseLine || 'Cruise';
  if (type === 'note') return 'Note';
  return '';
}

function item(d, base) {
  const b = base || null;
  const type = b ? b.type : d.type;
  const def = TYPES[type];
  if (!def) throw bad('invalid', 'Pick what kind of plan this is.');
  const pick = (k, dflt) => (d[k] !== undefined ? d[k] : b ? b[k] : dflt);

  // type-specific fields
  const data = {};
  const rawData = Object.assign({}, b && b.data ? b.data : {}, d.data && typeof d.data === 'object' ? d.data : {});
  Object.keys(def.data).forEach((k) => {
    const v = def.data[k](rawData[k]);
    if (v !== '' && v != null) data[k] = v;
  });

  let title = text(pick('title', ''), 120);
  if (!title) title = defaultTitle(type, data);
  if (!title) throw bad('invalid', 'Please add a name for this ' + def.label.toLowerCase() + '.');

  const clean = (v) => (v === '' || v == null ? null : v);
  const start_date = clean(pick('start_date', null)), start_time = clean(pick('start_time', null));
  let end_date = clean(pick('end_date', null)); const end_time = clean(pick('end_time', null));
  if (start_date && !isDate(start_date)) throw bad('invalid', 'That date does not look right.');
  if (end_date && !isDate(end_date)) throw bad('invalid', 'That end date does not look right.');
  if (start_time && !isTime(start_time)) throw bad('invalid', 'That time does not look right.');
  if (end_time && !isTime(end_time)) throw bad('invalid', 'That end time does not look right.');
  if (def.needsStart && !start_date) throw bad('invalid', 'Please pick a day for this ' + def.label.toLowerCase() + '.');
  if (!start_date && (start_time || end_date || end_time)) throw bad('invalid', 'Pick a day first, or clear the times.');
  if (end_time && !end_date) end_date = start_date;
  if (end_date && end_date < start_date) throw bad('invalid', 'The end day cannot be before the start day.');
  // Flights cross time zones, so only plans that stay in one place must end after they start on the same day.
  if (end_date && end_date === start_date && start_time && end_time && end_time < start_time && !['flight', 'cruise'].includes(type)) {
    throw bad('invalid', 'The end time must be after the start time.');
  }

  return {
    type, title,
    start_date, start_time: start_date ? start_time : null,
    end_date, end_time: end_date ? end_time : null,
    location: text(pick('location', ''), 200),
    confirmation: text(pick('confirmation', ''), 60),
    notes: text(pick('notes', ''), 4000),
    data
  };
}

/* ---------- chat ---------- */
function messageBody(v) {
  const s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s.slice(0, 4000);
}

// Find @Name mentions that match real members (longest names first, case-insensitive).
function findMentions(body, members, selfId) {
  const found = new Set();
  const names = members.filter((m) => m.name).sort((a, b) => b.name.length - a.name.length);
  const lower = body.toLowerCase();
  for (const m of names) {
    const needle = '@' + m.name.toLowerCase();
    let i = lower.indexOf(needle);
    while (i !== -1) {
      const next = lower[i + needle.length];
      if (!next || !/[\p{L}\p{N}_]/u.test(next)) { if (m.id !== selfId) found.add(m.id); break; }
      i = lower.indexOf(needle, i + 1);
    }
  }
  return [...found];
}

module.exports = { PALETTE, TYPES, typeIds, text, isDate, isTime, isColor, isUuid, emoji, dayDiff, profile, nextColor, trip, item, messageBody, findMentions };
