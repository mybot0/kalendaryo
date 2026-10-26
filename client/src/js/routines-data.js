/*
 * routines-data.js — routines are ordered step lists (morning, bedtime…) that repeat on
 * chosen weekdays. Each assigned person gets their own checklist per day.
 *
 * Ticks are saved as rlogs/{routineId~date~memberId}: { done: [stepId, …] }.
 * An instance looks like:
 *   { key, id, routine, memberId (or null), date, doneIds[], total, done, complete }
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;

  const WHEN = [
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'bedtime', label: 'Bedtime' },
    { value: 'anytime', label: 'Anytime' }
  ];
  const ORDER = { morning: 0, afternoon: 1, anytime: 2, bedtime: 3 };
  const whenLabel = (w) => (WHEN.find((x) => x.value === w) || WHEN[3]).label;
  const logId = (routineId, date, memberId) => routineId + '~' + date + '~' + (memberId || 'anyone');

  function forDay(date) {
    const dow = D.dow(date);
    const logs = new Map(PL.state.rlogs.map((l) => [l.id, l]));
    const out = [];
    PL.state.routines.forEach((r) => {
      if (!r.steps || !r.steps.length || !(r.weekdays || []).includes(dow)) return;
      const owners = (r.memberIds || []).filter((id) => PL.store.member(id));
      (owners.length ? owners : [null]).forEach((memberId) => {
        const id = logId(r.id, date, memberId);
        const log = logs.get(id);
        const doneIds = ((log && log.done) || []).filter((x) => r.steps.some((s) => s.id === x));
        out.push({ key: id, id, routine: r, memberId, date, doneIds, total: r.steps.length, done: doneIds.length, complete: doneIds.length === r.steps.length });
      });
    });
    const memberIndex = (id) => { const i = PL.state.members.findIndex((m) => m.id === id); return i < 0 ? 999 : i; };
    return out.sort((a, b) => (ORDER[a.routine.when] - ORDER[b.routine.when]) || a.routine.title.localeCompare(b.routine.title) || (memberIndex(a.memberId) - memberIndex(b.memberId)));
  }

  function toggleStep(inst, stepId) {
    const next = new Set(inst.doneIds);
    next.has(stepId) ? next.delete(stepId) : next.add(stepId);
    const path = 'rlogs/' + inst.id;
    if (!next.size) return PL.store.deleteDoc(path);
    return PL.store.setDoc(path, PL.models.rlog({ routineId: inst.routine.id, date: inst.date, memberId: inst.memberId || '', done: [...next], by: PL.state.uid }));
  }

  const save = (id, data) => (id
    ? PL.store.set('routines', id, Object.assign({}, PL.state.routines.find((r) => r.id === id), data))
    : PL.store.add('routines', Object.assign({}, data, { by: PL.state.uid })));

  async function remove(routine) {
    const ok = await PL.store.del('routines', routine.id);
    if (ok) for (const l of PL.state.rlogs.filter((x) => x.routineId === routine.id)) await PL.store.deleteDoc('rlogs/' + l.id);
    return ok;
  }

  PL.routines = { WHEN, whenLabel, forDay, toggleStep, save, remove, logId };
})();
