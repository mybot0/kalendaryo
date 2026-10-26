/*
 * chores-data.js — answers "which chores are on this day, and are they done?"
 *
 * A chore repeats like an event (same repeat rule). Each day it happens, it becomes one
 * "instance" per assigned person, so "Make your bed" for Ivy and Theo gives each child
 * their own tick. A chore with nobody assigned is for "anyone" (one tick).
 *
 * An instance looks like:
 *   { key, id, chore (the saved chore), title, date, memberId (or null for anyone), done }
 * Ticks are saved as completions/{choreId~date~memberId} so they survive edits and repeats.
 */
(function () {
  const PL = (window.PL = window.PL || {});

  const completionId = (choreId, date, memberId) => choreId + '~' + date + '~' + (memberId || 'anyone');

  function instances(from, to) {
    const done = new Set(PL.state.completions.map((c) => c.id));
    const out = [];
    PL.state.chores.forEach((ch) => {
      const owners = (ch.memberIds || []).filter((id) => PL.store.member(id));
      PL.recur.occurrences(ch, from, to).forEach((date) => {
        (owners.length ? owners : [null]).forEach((memberId) => {
          const id = completionId(ch.id, date, memberId);
          out.push({ key: id, id, chore: ch, title: ch.title, date, memberId, done: done.has(id) });
        });
      });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }

  // Groups one day's instances by person (family order), with "anyone" last.
  function byPerson(items) {
    const groups = [];
    PL.state.members.forEach((m) => {
      const mine = items.filter((i) => i.memberId === m.id);
      if (mine.length) groups.push({ member: m, items: mine });
    });
    const anyone = items.filter((i) => !i.memberId);
    if (anyone.length) groups.push({ member: null, items: anyone });
    return groups;
  }

  const progress = (items) => ({ done: items.filter((i) => i.done).length, total: items.length });

  // Tick or untick. Resolves true when saved.
  function toggle(inst) {
    const path = 'completions/' + inst.id;
    if (inst.done) return PL.store.deleteDoc(path);
    return PL.store.setDoc(path, PL.models.completion({ choreId: inst.chore.id, date: inst.date, memberId: inst.memberId || '', by: PL.state.uid }));
  }

  const save = (id, data) => (id
    ? PL.store.setChore(id, Object.assign({}, PL.state.chores.find((c) => c.id === id), data))
    : PL.store.addChore(Object.assign({}, data, { by: PL.state.uid })));

  // scope: 'one' (only `date`) or 'all'. Non-repeating chores are always removed completely.
  async function remove(chore, scope, date) {
    if (chore.repeat && scope === 'one') {
      return PL.store.setChore(chore.id, Object.assign({}, chore, { exdates: [...(chore.exdates || []), date] }));
    }
    const ok = await PL.store.deleteChore(chore.id);
    if (ok) {
      for (const c of PL.state.completions.filter((x) => x.choreId === chore.id)) await PL.store.deleteDoc('completions/' + c.id);
    }
    return ok;
  }

  PL.chores = { instances, byPerson, progress, toggle, save, remove, completionId };
})();
