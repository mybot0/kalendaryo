/*
 * recurrence.js — turns a repeating event into the dates it happens on.
 * Pure logic with no screen code, so it is easy to test and to change.
 *
 *   PL.recur.occurrences(event, fromKey, toKey)  -> ["2026-10-19", ...]
 *   PL.recur.remainingFrom(event, key)           -> how many repeats are left from `key`
 *   PL.recur.describe(event)                     -> "Every week on Tue, Thu until Dec 3"
 *
 * Rules (the same as common calendar apps):
 *   - Monthly on the 31st skips months that have no 31st.
 *   - Yearly on Feb 29 only happens in leap years.
 *   - "After N times" counts every repeat, including ones later deleted from the series.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;
  const GUARD = 20000; // safety stop so a bad rule can never freeze the screen

  // Yields date keys in order, starting at the first repeat on/after `start`.
  // `from` lets us skip ahead quickly when we are not counting repeats.
  function* generate(r, start, from) {
    const interval = Math.max(1, r.interval || 1);
    const s = D.parse(start);

    if (r.freq === 'daily') {
      const k0 = from ? Math.max(0, Math.floor(D.diff(start, from) / interval) - 1) : 0;
      for (let k = k0; k < k0 + GUARD; k++) yield D.addDays(start, k * interval);
    } else if (r.freq === 'weekly') {
      const days = (r.weekdays && r.weekdays.length ? [...r.weekdays] : [s.getDay()]).sort((a, b) => a - b);
      const anchor = D.startOfWeek(start, 0); // weeks counted from the start date's week (Sunday)
      const k0 = from ? Math.max(0, Math.floor(D.diff(anchor, D.startOfWeek(from, 0)) / 7 / interval) - 1) : 0;
      for (let k = k0; k < k0 + GUARD; k++) {
        const base = D.addDays(anchor, k * interval * 7);
        for (const wd of days) {
          const key = D.addDays(base, wd);
          if (key >= start) yield key;
        }
      }
    } else if (r.freq === 'monthly') {
      const day = s.getDate();
      const fromD = from ? D.parse(from) : s;
      const monthsGap = (fromD.getFullYear() - s.getFullYear()) * 12 + (fromD.getMonth() - s.getMonth());
      const k0 = from ? Math.max(0, Math.floor(monthsGap / interval) - 1) : 0;
      for (let k = k0; k < k0 + GUARD; k++) {
        const t = new Date(s.getFullYear(), s.getMonth() + k * interval, 1);
        if (D.daysInMonth(t.getFullYear(), t.getMonth()) >= day) {
          yield t.getFullYear() + '-' + D.pad(t.getMonth() + 1) + '-' + D.pad(day);
        }
      }
    } else if (r.freq === 'yearly') {
      const day = s.getDate(), month = s.getMonth();
      const k0 = from ? Math.max(0, Math.floor((D.parse(from).getFullYear() - s.getFullYear()) / interval) - 1) : 0;
      for (let k = k0; k < k0 + GUARD; k++) {
        const y = s.getFullYear() + k * interval;
        if (D.daysInMonth(y, month) >= day) yield y + '-' + D.pad(month + 1) + '-' + D.pad(day);
      }
    }
  }

  function occurrences(ev, fromKey, toKey) {
    const r = ev.repeat;
    if (!r) return ev.date >= fromKey && ev.date <= toKey ? [ev.date] : [];
    const skip = new Set(ev.exdates || []);
    const endOn = r.end && r.end.type === 'on' ? r.end.date : null;
    const maxCount = r.end && r.end.type === 'after' ? r.end.count : Infinity;
    const hardTo = endOn && endOn < toKey ? endOn : toKey;
    const out = [];
    let index = 0;
    // Counting needs to start at the first repeat, so no skipping ahead in that case.
    for (const key of generate(r, ev.date, maxCount === Infinity ? fromKey : null)) {
      if (key > hardTo) break;
      index++;
      if (index > maxCount) break;
      if (key >= fromKey && !skip.has(key)) out.push(key);
    }
    return out;
  }

  // How many repeats happen on/after `key` (ignores deleted ones). Used when a series is split.
  function remainingFrom(ev, key) {
    const r = ev.repeat;
    if (!r || !r.end || r.end.type !== 'after') return null;
    let index = 0, left = 0;
    for (const k of generate(r, ev.date, null)) {
      index++;
      if (index > r.end.count) break;
      if (k >= key) left++;
    }
    return left;
  }

  function describe(ev) {
    const r = ev.repeat;
    if (!r) return '';
    const n = r.interval || 1;
    let s;
    if (r.freq === 'daily') s = n === 1 ? 'Every day' : 'Every ' + n + ' days';
    else if (r.freq === 'weekly') {
      const wd = r.weekdays && r.weekdays.length ? r.weekdays : [D.dow(ev.date)];
      const isWeekdays = wd.length === 5 && [1, 2, 3, 4, 5].every((x) => wd.includes(x));
      if (isWeekdays && n === 1) s = 'Every weekday';
      else s = (n === 1 ? 'Every week' : 'Every ' + n + ' weeks') + ' on ' + wd.map(D.weekdayShort).join(', ');
    } else if (r.freq === 'monthly') s = (n === 1 ? 'Every month' : 'Every ' + n + ' months') + ' on the ' + D.ordinal(D.parse(ev.date).getDate());
    else s = (n === 1 ? 'Every year' : 'Every ' + n + ' years') + ' on ' + D.fmt(ev.date, { month: 'short', day: 'numeric' });
    if (r.end && r.end.type === 'on') s += ' until ' + D.fmt(r.end.date, { month: 'short', day: 'numeric', year: 'numeric' });
    if (r.end && r.end.type === 'after') s += ', ' + r.end.count + (r.end.count === 1 ? ' time' : ' times');
    return s;
  }

  PL.recur = { occurrences, remainingFrom, describe };
})();

