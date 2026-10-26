/*
 * screens/routines.js — the Routines tab: step-by-step checklists (morning, bedtime…).
 * PL.routinesUi.panel(date) draws the day; PL.routinesUi.openForm() adds or edits one.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;
  const starsOn = () => PL.stars.starsOn();
  const colorOf = (m) => (m ? m.color : PL.config.neutralColor);
  const newStepId = () => 's' + Math.random().toString(36).slice(2, 8);
  const starLabel = (n) => (n === 0 ? 'No stars' : n === 1 ? '1 star' : n + ' stars');

  /* ---------- add / edit form ---------- */
  async function openForm(opts) {
    if (!(await PL.pin.require('Enter the PIN to change routines.'))) return;
    const r = (opts && opts.routine) || null;
    const members = PL.state.members;

    const title = h('input', { type: 'text', maxlength: '60', placeholder: 'For example: Morning routine', autocomplete: 'off', autofocus: true });
    title.value = r ? r.title : '';
    const when = ui.segmented(PL.routines.WHEN, r ? r.when : 'morning', null, 'When');
    const picked = new Set(r ? (r.memberIds || []).filter((id) => PL.store.member(id)) : []);
    const peopleBox = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Who does it' }, members.map((m) => {
      const b = h('button', { type: 'button', class: 'person-pick', 'aria-pressed': picked.has(m.id) ? 'true' : 'false',
        onclick: () => { picked.has(m.id) ? picked.delete(m.id) : picked.add(m.id); b.setAttribute('aria-pressed', picked.has(m.id) ? 'true' : 'false'); } },
        ui.avatar(m, 28), m.name);
      return b;
    }));
    const days = new Set(r ? r.weekdays : [0, 1, 2, 3, 4, 5, 6]);
    const ws = PL.state.settings.weekStart || 0;
    const dayBox = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Days' }, Array.from({ length: 7 }, (_, k) => (ws + k) % 7).map((i) => {
      const b = h('button', { type: 'button', class: 'wd-pick', 'aria-pressed': days.has(i) ? 'true' : 'false', 'aria-label': D.weekdayLong(i),
        onclick: () => { days.has(i) ? days.delete(i) : days.add(i); b.setAttribute('aria-pressed', days.has(i) ? 'true' : 'false'); } }, D.weekdayShort(i).slice(0, 2));
      return b;
    }));
    const steps = h('textarea', { rows: '6', maxlength: '1600', placeholder: 'Get dressed\nEat breakfast\nBrush teeth' });
    steps.value = r ? r.steps.map((s) => s.text).join('\n') : '';
    const stars = ui.select([0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: starLabel(n) })), r ? (r.stars == null ? 1 : r.stars) : 1);

    async function save() {
      const t = title.value.trim();
      const lines = steps.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20);
      if (!t) { ui.toast('Please type a name first.'); title.focus(); return; }
      if (!lines.length) { ui.toast('Add at least one step, one per line.'); steps.focus(); return; }
      if (!days.size) { ui.toast('Pick at least one day.'); return; }
      // Keep the same step id when the text did not change, so ticks are not lost.
      const old = new Map((r ? r.steps : []).map((s) => [s.text, s.id]));
      const used = new Set();
      const list = lines.map((text) => {
        let id = old.get(text);
        if (!id || used.has(id)) id = newStepId();
        used.add(id);
        return { id, text };
      });
      saveBtn.disabled = true;
      const ok = await PL.routines.save(r ? r.id : null, { title: t, when: when.get(), memberIds: [...picked], weekdays: [...days].sort((a, b) => a - b), steps: list, stars: Number(stars.value) });
      saveBtn.disabled = false;
      if (ok) { s.close(); ui.toast(r ? 'Routine saved.' : 'Routine added.'); }
    }
    async function del() {
      if (!(await ui.confirm({ title: 'Delete this routine?', message: '“' + r.title + '” and its ticks will be removed for everyone.', confirmLabel: 'Delete', danger: true }))) return;
      if (await PL.routines.remove(r)) { s.close(); ui.toast('Routine deleted.'); }
    }

    const saveBtn = ui.button(r ? 'Save changes' : 'Add routine', { variant: 'primary', big: true, onClick: save });
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), saveBtn];
    if (r) footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: del }));
    const body = h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Name', title),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'When'), when.el),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Who does it?'),
        members.length ? peopleBox : h('p', { class: 'hint' }, 'Add family members in the Family section to give routines to people.'),
        h('p', { class: 'hint' }, members.length ? 'Leave empty for anyone. Pick several and each person gets their own checklist.' : '')),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Days'), dayBox),
      ui.field('Steps', steps, 'One step per line, in order.'),
      starsOn() ? ui.field('Stars for finishing', stars, 'Earned when every step is ticked. “Anyone” routines earn no stars.') : null);
    const s = ui.sheet({ title: r ? 'Edit routine' : 'New routine', body, footer, wide: true });
  }

  /* ---------- the day ---------- */
  function card(inst) {
    const r = inst.routine;
    const person = inst.memberId ? PL.store.member(inst.memberId) : null;
    const local = new Set(inst.doneIds); // what this card shows right now, so quick taps stay correct
    const earns = starsOn() && person && (r.stars == null ? 1 : r.stars) > 0;
    const rows = r.steps.map((st) => {
      const rowEl = h('div', { class: 'chore-row' + (local.has(st.id) ? ' done' : '') });
      const paint = () => { const on = local.has(st.id); check.setAttribute('aria-pressed', on ? 'true' : 'false'); rowEl.classList.toggle('done', on); };
      const flip = async () => {
        const before = Object.assign({}, inst, { doneIds: [...local] });
        local.has(st.id) ? local.delete(st.id) : local.add(st.id);
        paint();
        if (!(await PL.routines.toggleStep(before, st.id))) { local.has(st.id) ? local.delete(st.id) : local.add(st.id); paint(); }
      };
      const check = h('button', { type: 'button', class: 'chore-check', dataset: { key: inst.key + ':' + st.id }, 'aria-pressed': local.has(st.id) ? 'true' : 'false', 'aria-label': st.text, onclick: flip }, icon('check'));
      rowEl.append(check, h('span', { class: 'step-text', onclick: flip }, st.text));
      return rowEl;
    });
    return h('section', { class: 'chore-group routine-card' + (inst.complete ? ' complete' : ''), style: '--c:' + colorOf(person), 'aria-label': r.title + (person ? ' for ' + person.name : '') },
      h('div', { class: 'cg-head' }, ui.avatar(person, 40),
        h('div', { class: 'rt-titles' }, h('h2', { class: 'cg-name' }, r.title), h('span', { class: 'sub' }, PL.routines.whenLabel(r.when) + ' · ' + (person ? person.name : 'Anyone'))),
        h('span', { class: 'cg-count' + (inst.complete ? ' all' : '') }, inst.complete ? icon('check') : null, inst.complete ? 'All done' : inst.done + ' of ' + inst.total),
        ui.iconButton('edit', 'Edit ' + r.title, () => openForm({ routine: r }), 'sheet-close')),
      h('div', { class: 'cg-bar', 'aria-hidden': 'true' }, h('i', { style: '--p:' + Math.round((inst.done / inst.total) * 100) + '%' })),
      rows,
      inst.complete && earns ? h('p', { class: 'reward-line' }, icon('star'), '+' + (r.stars == null ? 1 : r.stars) + (r.stars === 1 || r.stars == null ? ' star' : ' stars') + ' earned') : null);
  }

  function panel(date) {
    const items = PL.routines.forDay(date);
    if (!items.length) {
      return ui.emptyState({ icon: 'list', title: PL.state.routines.length ? 'No routines on this day' : 'No routines yet',
        text: PL.state.routines.length ? 'Enjoy the break, or add one.' : 'A routine is a short checklist, like getting ready in the morning. Each person gets their own.',
        action: ui.button('Add a routine', { variant: 'primary', big: true, icon: 'plus', onClick: () => openForm() }) });
    }
    const out = [];
    let last = null;
    items.forEach((i) => {
      if (i.routine.when !== last) { last = i.routine.when; out.push(h('h3', { class: 'mini-h' }, PL.routines.whenLabel(last))); }
      out.push(card(i));
    });
    return h('div', { class: 'chores-list' }, out);
  }

  PL.routinesUi = { panel, openForm };
})();
