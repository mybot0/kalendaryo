/*
 * event-actions.js — saving and deleting events, including repeating ones.
 *
 * "scope" says how much of a repeating series a change applies to:
 *   'one'    only this day            (series gets a deleted-date, a separate event is made)
 *   'future' this day and after       (the series is cut short and a new series starts here)
 *   'all'    the whole series
 * For events that do not repeat, scope is ignored.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function create(data) {
    return PL.store.addEvent(Object.assign({}, data, { by: PL.state.uid }));
  }

  // `inst` is the occurrence being edited, `data` the new values from the form.
  async function saveEdit(inst, data, scope) {
    const ev = inst.ev, occ = inst.date, S = PL.store, M = PL.models;
    const next = M.event(Object.assign({}, ev, data, { by: ev.by }));

    if (!ev.repeat) return S.setEvent(ev.id, next);

    // Whole series, or "this and after" on the very first day: same thing.
    if (scope === 'all' || (scope === 'future' && occ === ev.date)) {
      const delta = D.diff(occ, next.date); // editing a later day moves the whole series by the same amount
      const moved = Object.assign({}, next, { date: D.addDays(ev.date, delta) });
      moved.exdates = next.repeat ? (ev.exdates || []).map((k) => D.addDays(k, delta)) : [];
      return S.setEvent(ev.id, moved);
    }

    if (scope === 'one') {
      const series = Object.assign({}, ev, { exdates: [...(ev.exdates || []), occ] });
      const single = Object.assign({}, next, { repeat: null, exdates: [] });
      if (!(await S.setEvent(ev.id, series))) return false;
      return !!(await S.addEvent(single));
    }

    // 'future': cut the old series the day before, start a new series from this day.
    const remaining = PL.recur.remainingFrom(ev, occ);
    const prev = D.addDays(occ, -1);
    const head = Object.assign({}, ev, {
      repeat: Object.assign({}, ev.repeat, { end: { type: 'on', date: prev } }),
      exdates: (ev.exdates || []).filter((k) => k < occ)
    });
    const delta = D.diff(occ, next.date);
    let tailRepeat = next.repeat;
    // If the repeat rule was not touched and it counted "N times", only the remaining times carry over.
    if (tailRepeat && remaining != null && same(tailRepeat, M.cleanRepeat(ev.repeat))) {
      tailRepeat = Object.assign({}, tailRepeat, { end: { type: 'after', count: remaining } });
    }
    const tail = Object.assign({}, next, {
      repeat: tailRepeat,
      exdates: tailRepeat ? (ev.exdates || []).filter((k) => k >= occ).map((k) => D.addDays(k, delta)) : []
    });
    if (!(await S.setEvent(ev.id, head))) return false;
    return !!(await S.addEvent(tail));
  }

  async function remove(inst, scope) {
    const ev = inst.ev, occ = inst.date, S = PL.store;
    if (!ev.repeat) return S.deleteEvent(ev.id);
    if (scope === 'all' || (scope === 'future' && occ === ev.date)) return S.deleteEvent(ev.id);
    if (scope === 'one') return S.setEvent(ev.id, Object.assign({}, ev, { exdates: [...(ev.exdates || []), occ] }));
    return S.setEvent(ev.id, Object.assign({}, ev, {
      repeat: Object.assign({}, ev.repeat, { end: { type: 'on', date: D.addDays(occ, -1) } }),
      exdates: (ev.exdates || []).filter((k) => k < occ)
    }));
  }

  PL.actions = { create, saveEdit, remove };
})();

