/*
 * calendar-data.js — answers "what is on the calendar between these dates?"
 *
 * Combines three sources into one list of "instances" (one entry per day an event happens):
 *   1. Events you created (including each date of a repeating event)
 *   2. Birthdays from family profiles (read-only, shown automatically)
 *   2b. Public holidays the family added (holidays.js), pink
 *   3. (Round 3) Events from outside calendars — see services in later rounds
 *
 * An instance looks like:
 *   { key, id, date, title, allDay, start, end, location, notes, color,
 *     memberIds, ev (the saved event, or null), virtual, kind }
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;

  function fromEvent(ev, date) {
    return {
      key: ev.id + '@' + date, id: ev.id, date, ev, virtual: false, kind: 'event',
      title: ev.title, allDay: !!ev.allDay, start: ev.start || '', end: ev.end || '',
      location: ev.location || '', notes: ev.notes || '', color: ev.color || '',
      memberIds: ev.memberIds || [], reminder: ev.reminder == null ? null : ev.reminder
    };
  }

  function birthdayInstances(from, to) {
    const out = [];
    const y1 = +from.slice(0, 4), y2 = +to.slice(0, 4);
    PL.state.members.forEach((m) => {
      if (!m.birthday) return;
      const [by, bm, bd] = m.birthday.split('-').map(Number);
      for (let y = y1; y <= y2; y++) {
        const day = Math.min(bd, D.daysInMonth(y, bm - 1)); // Feb 29 falls on Feb 28 in other years
        const date = y + '-' + D.pad(bm) + '-' + D.pad(day);
        if (date < from || date > to) continue;
        const age = y - by;
        out.push({
          key: 'bday:' + m.id + '@' + date, id: 'bday:' + m.id, date, ev: null, virtual: true, kind: 'birthday',
          title: m.name + '’s birthday' + (age > 0 && age < 120 ? ' · ' + age : ''),
          allDay: true, start: '', end: '', location: '', notes: '', color: '', memberIds: [m.id], reminder: null, ownerId: m.id
        });
      }
    });
    return out;
  }

  const byTime = (a, b) =>
    (b.allDay - a.allDay) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title);

  // Is this instance shown, given the people switched off in the filter?
  function visible(inst, hidden) {
    const real = (inst.memberIds || []).filter((id) => PL.store.member(id));
    if (!real.length) return true;                 // belongs to the whole family
    return real.some((id) => !hidden.has(id));
  }

  function instances(from, to, opts) {
    const all = opts && opts.all;
    const hidden = new Set(PL.state.device.hiddenMembers || []);
    const out = [];
    PL.state.events.forEach((ev) => {
      PL.recur.occurrences(ev, from, to).forEach((date) => out.push(fromEvent(ev, date)));
    });
    birthdayInstances(from, to).forEach((i) => out.push(i));
    if (PL.holidays) PL.holidays.instances(from, to).forEach((i) => out.push(i));
    return out.filter((i) => all || visible(i, hidden)).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  }

  const people = (inst) => (inst.memberIds || []).map((id) => PL.store.member(id)).filter(Boolean);
  function color(inst) {
    if (inst.color) return inst.color;
    const p = people(inst)[0];
    return p ? p.color : PL.config.neutralColor;
  }
  const timeLabel = (inst) => (inst.allDay ? 'All day' : PL.D.fmtTime(inst.start, PL.state.settings.hour12) || 'Any time');
  function rangeLabel(inst) {
    if (inst.allDay) return 'All day';
    const s = PL.D.fmtTime(inst.start, PL.state.settings.hour12);
    const e = inst.end ? PL.D.fmtTime(inst.end, PL.state.settings.hour12) : '';
    return e ? s + ' – ' + e : s;
  }

  // Reminders that should be showing right now (today and tomorrow's events can qualify).
  function dueReminders(now) {
    const today = D.key(now), out = [];
    instances(today, D.addDays(today, 1)).forEach((inst) => {
      if (inst.reminder == null) return;
      let at, until;
      if (inst.allDay) {
        at = D.at(inst.date, D.pad(PL.config.allDayReminderHour) + ':00');
        until = D.at(inst.date, '23:59');
      } else {
        at = D.at(inst.date, inst.start || '00:00');
        until = D.at(inst.date, inst.end || inst.start || '00:00');
        if (!inst.end) until = new Date(until.getTime() + 60 * 60000);
      }
      at = new Date(at.getTime() - inst.reminder * 60000);
      if (now >= at && now <= until) out.push(inst);
    });
    return out;
  }

  PL.cal = { instances, people, color, timeLabel, rangeLabel, dueReminders, byTime };
})();

