/*
 * ics.js — read a calendar file (.ics) and add its events.
 *   PL.ics.parse(text)  -> { events: [...], skipped: n }   (pure, no screen code)
 *   PL.icsUi.run(file)  -> asks first, then adds the events that are not already here
 *
 * What is understood: title, date, time, all-day, place, notes, and simple repeats
 * (daily, weekly, monthly, yearly with interval, weekdays, count, until, and removed dates).
 * What is not: multi-day events (only the first day is kept), time zones other than your own
 * (times with a zone name are read as local time), and complicated repeat rules (added once).
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;

  const unescapeText = (s) => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

  // Join folded lines, then split into { name, params, value }.
  function lines(text) {
    const raw = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    return raw.filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      if (i < 0) return null;
      const left = l.slice(0, i).split(';');
      const params = {};
      left.slice(1).forEach((p) => { const [k, v] = p.split('='); if (k) params[k.toUpperCase()] = v; });
      return { name: left[0].toUpperCase(), params, value: l.slice(i + 1) };
    }).filter(Boolean);
  }

  // "20261031", "20261031T093000", "20261031T093000Z" -> { date, time, allDay }
  function when(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
    if (!m) return null;
    if (!m[4] || (params && params.VALUE === 'DATE')) return { date: m[1] + '-' + m[2] + '-' + m[3], time: '', allDay: true };
    if (m[7]) { // UTC -> this device's local time
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
      return { date: D.key(d), time: D.pad(d.getHours()) + ':' + D.pad(d.getMinutes()), allDay: false };
    }
    return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] + ':' + m[5], allDay: false };
  }

  const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  function repeatFrom(rule, startDate) {
    const p = {};
    String(rule).split(';').forEach((x) => { const [k, v] = x.split('='); if (k) p[k.toUpperCase()] = v; });
    const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[p.FREQ];
    if (!freq) return null;
    if (p.BYSETPOS || p.BYMONTHDAY && freq !== 'monthly' || (freq === 'monthly' && /[-+]?\d[A-Z]{2}/.test(p.BYDAY || ''))) return null; // too complex
    const r = { freq, interval: parseInt(p.INTERVAL, 10) || 1, end: { type: 'never' } };
    if (freq === 'weekly') {
      const wd = (p.BYDAY || '').split(',').map((x) => DAYS[x.slice(-2)]).filter((n) => n != null);
      r.weekdays = wd.length ? wd : [D.dow(startDate)];
    }
    if (p.COUNT) r.end = { type: 'after', count: parseInt(p.COUNT, 10) || 1 };
    else if (p.UNTIL) { const u = when(p.UNTIL); if (u) r.end = { type: 'on', date: u.date }; }
    return r;
  }

  function parse(text) {
    const L = lines(text);
    const events = [];
    let skipped = 0, cur = null;
    for (const l of L) {
      if (l.name === 'BEGIN' && l.value.toUpperCase() === 'VEVENT') { cur = { ex: [] }; continue; }
      if (l.name === 'END' && l.value.toUpperCase() === 'VEVENT') {
        if (cur && cur.start) {
          const s = cur.start, e = cur.end;
          const ev = { title: unescapeText(cur.title) || 'Untitled event', date: s.date, allDay: s.allDay, start: s.time, end: '',
            location: unescapeText(cur.location), notes: unescapeText(cur.notes), memberIds: [], repeat: null, exdates: [], reminder: null, color: '' };
          if (!s.allDay && e && e.date === s.date && e.time > s.time) ev.end = e.time;
          if (cur.rrule) { ev.repeat = repeatFrom(cur.rrule, s.date); if (ev.repeat) ev.exdates = cur.ex; }
          events.push(ev);
        } else skipped++;
        cur = null; continue;
      }
      if (!cur) continue;
      if (l.name === 'SUMMARY') cur.title = l.value;
      else if (l.name === 'LOCATION') cur.location = l.value;
      else if (l.name === 'DESCRIPTION') cur.notes = l.value;
      else if (l.name === 'DTSTART') cur.start = when(l.value, l.params);
      else if (l.name === 'DTEND') cur.end = when(l.value, l.params);
      else if (l.name === 'RRULE') cur.rrule = l.value;
      else if (l.name === 'EXDATE') l.value.split(',').forEach((v) => { const w = when(v, l.params); if (w) cur.ex.push(w.date); });
    }
    return { events, skipped };
  }

  const sameAs = (a, b) => a.title.toLowerCase() === b.title.toLowerCase() && a.date === b.date && (a.start || '') === (b.start || '');

  PL.ics = { parse };

  PL.icsUi = {
    async run(file) {
      const ui = PL.ui;
      let text;
      try { text = await file.text(); } catch (e) { ui.toast('That file could not be read.'); return; }
      if (!/BEGIN:VCALENDAR/i.test(text)) { ui.toast('That is not a calendar file. Pick a file that ends in .ics.'); return; }
      const { events, skipped } = parse(text);
      if (!events.length) { ui.toast('No events were found in that file.'); return; }
      const fresh = events.filter((e) => !PL.state.events.some((x) => sameAs(e, x))).slice(0, 500);
      const dupes = events.length - fresh.length;
      if (!fresh.length) { ui.toast('Those events are already in your calendar.'); return; }
      const msg = fresh.length + (fresh.length === 1 ? ' event' : ' events') + ' will be added.' +
        (dupes ? ' ' + dupes + ' already here and will be skipped.' : '') +
        (skipped ? ' ' + skipped + ' could not be read.' : '') +
        ' Events from a file are not given to a person. You can edit them after.';
      if (!(await ui.confirm({ title: 'Add events from this file?', message: msg, confirmLabel: 'Add events' }))) return;
      let n = 0;
      for (const e of fresh) { if (await PL.store.addEvent(e)) n++; else break; }
      ui.toast(n === fresh.length ? n + (n === 1 ? ' event added.' : ' events added.') : 'Added ' + n + ' of ' + fresh.length + '. Something went wrong.');
    }
  };
})();
