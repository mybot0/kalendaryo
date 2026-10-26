/*
 * screens/tasks.js — the "Chores" tab of the app, with three sections:
 *   Chores    one day at a time, grouped by person, big tick buttons
 *   Routines  step-by-step checklists (see routines.js)
 *   Rewards   star balances and things to spend them on (see rewards.js)
 * Also provides PL.choresUi.widget() for the Home screen.
 *
 * Tap the circle to tick a chore. Tap the chore's name to edit it.
 * Changing chores asks for the parent PIN when one is set.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;

  const TABS = [{ value: 'chores', label: 'Chores' }, { value: 'routines', label: 'Routines' }, { value: 'rewards', label: 'Rewards' }];
  const starsOn = () => PL.stars.starsOn();
  const starLabel = (n) => (n === 0 ? 'No stars' : n === 1 ? '1 star' : n + ' stars');

  function dayTitle(key) {
    const t = D.today();
    if (key === t) return 'Today';
    if (key === D.addDays(t, 1)) return 'Tomorrow';
    if (key === D.addDays(t, -1)) return 'Yesterday';
    return D.fmt(key, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /* ---------- repeat choices (kept simple on purpose) ---------- */
  function kindOf(ch) {
    const r = ch && ch.repeat;
    if (!r) return 'none';
    const plain = (r.interval || 1) === 1;
    if (r.freq === 'daily' && plain) return 'daily';
    if (r.freq === 'weekly' && plain) {
      const wd = r.weekdays && r.weekdays.length ? r.weekdays : [D.dow(ch.date)];
      if (wd.length === 5 && [1, 2, 3, 4, 5].every((x) => wd.includes(x))) return 'weekdays';
      if (wd.length === 1 && wd[0] === D.dow(ch.date)) return 'weekly';
      return 'days';
    }
    return 'keep'; // a rule this form cannot show (for example from a backup): keep it as it is
  }
  function repeatOptions(date, keepLabel) {
    return [
      { value: 'none', label: 'Does not repeat' },
      { value: 'daily', label: 'Every day' },
      { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
      { value: 'weekly', label: 'Every week on ' + D.weekdayLong(D.dow(date)) },
      { value: 'days', label: 'Choose days…' }
    ].concat(keepLabel ? [{ value: 'keep', label: keepLabel }] : []);
  }

  /* ---------- add / edit form ---------- */
  // opts: { chore?, date? }  date = the day being looked at (used for "only this day")
  async function openForm(opts) {
    if (!(await PL.pin.require('Enter the PIN to change chores.'))) return;
    const o = opts || {};
    const ch = o.chore || null;
    const viewDate = o.date || D.today();
    const date0 = ch ? ch.date : viewDate;
    const members = PL.state.members;

    const title = h('input', { type: 'text', maxlength: '80', placeholder: 'For example: Make your bed', autocomplete: 'off', autofocus: true });
    title.value = ch ? ch.title : '';
    const date = h('input', { type: 'date', required: true }); date.value = date0;

    const picked = new Set(ch ? (ch.memberIds || []).filter((id) => PL.store.member(id)) : []);
    const peopleBox = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Who does it' }, members.map((m) => {
      const b = h('button', { type: 'button', class: 'person-pick', 'aria-pressed': picked.has(m.id) ? 'true' : 'false',
        onclick: () => { picked.has(m.id) ? picked.delete(m.id) : picked.add(m.id); b.setAttribute('aria-pressed', picked.has(m.id) ? 'true' : 'false'); } },
        ui.avatar(m, 28), m.name);
      return b;
    }));

    const kind0 = kindOf(ch);
    const repSel = ui.select(repeatOptions(date0, kind0 === 'keep' ? PL.recur.describe(ch) : ''), kind0, () => sync());
    repSel.id = 'cf-repeat';
    const wdPicked = new Set(ch && ch.repeat && ch.repeat.weekdays && ch.repeat.weekdays.length ? ch.repeat.weekdays : [D.dow(date0)]);
    const wdBox = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Repeat on' }, [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const b = h('button', { type: 'button', class: 'wd-pick', 'aria-pressed': wdPicked.has(i) ? 'true' : 'false', 'aria-label': D.weekdayLong(i),
        onclick: () => { wdPicked.has(i) ? wdPicked.delete(i) : wdPicked.add(i); b.setAttribute('aria-pressed', wdPicked.has(i) ? 'true' : 'false'); } }, D.weekdayShort(i).slice(0, 2));
      return b;
    }));
    const stars = ui.select([0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: starLabel(n) })), ch ? (ch.stars == null ? 1 : ch.stars) : 1);
    const dateField = ui.field('Starts on', date);
    date.addEventListener('change', () => {
      if (!date.value) return;
      const keep = repSel.value;
      repSel.replaceChildren(...repeatOptions(date.value, kind0 === 'keep' ? PL.recur.describe(ch) : '').map((x) => h('option', { value: x.value }, x.label)));
      repSel.value = keep;
    });
    function sync() { wdBox.hidden = repSel.value !== 'days'; }

    function readRepeat() {
      const k = repSel.value, dow = D.dow(date.value), end = { type: 'never' };
      if (k === 'daily') return { freq: 'daily', interval: 1, end };
      if (k === 'weekdays') return { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], end };
      if (k === 'weekly') return { freq: 'weekly', interval: 1, weekdays: [dow], end };
      if (k === 'days') return { freq: 'weekly', interval: 1, weekdays: wdPicked.size ? [...wdPicked].sort((a, b) => a - b) : [dow], end };
      if (k === 'keep') return ch.repeat;
      return null;
    }

    async function save() {
      const t = title.value.trim();
      if (!t) { ui.toast('Please type a name first.'); title.focus(); return; }
      if (!date.value) { ui.toast('Please pick a day.'); date.focus(); return; }
      saveBtn.disabled = true;
      const ok = await PL.chores.save(ch ? ch.id : null, { title: t, memberIds: [...picked], date: date.value, repeat: readRepeat(), stars: starsOn() ? Number(stars.value) : (ch && ch.stars != null ? ch.stars : 1) });
      saveBtn.disabled = false;
      if (ok) { s.close(); ui.toast(ch ? 'Chore saved.' : 'Chore added.'); }
    }

    async function del() {
      let scope = 'all';
      if (ch.repeat) {
        scope = await ui.choose({
          title: 'Delete repeating chore',
          message: '“' + ch.title + '” repeats. What should be deleted?',
          options: [
            { value: 'one', label: 'Only ' + D.fmt(viewDate, { weekday: 'short', month: 'short', day: 'numeric' }), description: 'It still happens on the other days.' },
            { value: 'all', label: 'The whole chore', description: 'Removes every day, past and future.', danger: true }
          ]
        });
        if (!scope) return;
      } else if (!(await ui.confirm({ title: 'Delete this chore?', message: '“' + ch.title + '” will be removed for everyone.', confirmLabel: 'Delete', danger: true }))) return;
      if (await PL.chores.remove(ch, scope, viewDate)) { s.close(); ui.toast('Chore deleted.'); }
    }

    const saveBtn = ui.button(ch ? 'Save changes' : 'Add chore', { variant: 'primary', big: true, onClick: save });
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), saveBtn];
    if (ch) footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: del }));
    const body = h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('What needs doing?', title),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Who does it?'),
        members.length ? peopleBox : h('p', { class: 'hint' }, 'Add family members in the Family section to give chores to people.'),
        h('p', { class: 'hint' }, members.length ? 'Leave empty for anyone. Pick several and each person gets their own tick.' : '')),
      dateField,
      h('div', { class: 'field' }, ui.field('Repeat', repSel), wdBox),
      starsOn() ? ui.field('Stars for doing it', stars, 'Earned by the person it is given to. “Anyone” chores earn no stars.') : null);
    const s = ui.sheet({ title: ch ? 'Edit chore' : 'New chore', body, footer, wide: true });
    sync();
  }

  /* ---------- pieces ---------- */
  const countText = (p) => (p.total && p.done === p.total ? 'All done' : p.done + ' of ' + p.total);
  const colorOf = (member) => (member ? member.color : PL.config.neutralColor);
  const nameOf = (member) => (member ? member.name : 'Anyone');

  function choreRow(inst, member, viewDate) {
    const person = inst.memberId ? member : null;
    const rowEl = h('div', { class: 'chore-row' + (inst.done ? ' done' : ''), style: '--c:' + colorOf(person) });
    const check = h('button', {
      type: 'button', class: 'chore-check', dataset: { key: inst.key }, 'aria-pressed': inst.done ? 'true' : 'false',
      'aria-label': inst.title + (person ? ' for ' + person.name : ''),
      onclick: async () => {
        const next = !inst.done;
        check.setAttribute('aria-pressed', next ? 'true' : 'false'); rowEl.classList.toggle('done', next);
        if (!(await PL.chores.toggle(inst))) { check.setAttribute('aria-pressed', inst.done ? 'true' : 'false'); rowEl.classList.toggle('done', inst.done); }
      }
    }, icon('check'));
    const stars = inst.chore.stars == null ? 1 : inst.chore.stars;
    const name = h('button', { type: 'button', class: 'chore-title', onclick: () => openForm({ chore: inst.chore, date: viewDate }), 'aria-label': 'Edit ' + inst.title },
      h('span', {}, inst.title), inst.chore.repeat ? h('span', { class: 'ev-rep', title: 'Repeats' }, icon('repeat')) : null);
    rowEl.append(...[check, name, starsOn() && person && stars > 0 ? h('span', { class: 'star-chip', title: starLabel(stars) }, icon('star'), String(stars)) : null].filter(Boolean));
    return rowEl;
  }

  function group(g, viewDate) {
    const p = PL.chores.progress(g.items);
    const all = p.total > 0 && p.done === p.total;
    return h('section', { class: 'chore-group', style: '--c:' + colorOf(g.member), 'aria-label': nameOf(g.member) },
      h('div', { class: 'cg-head' }, ui.avatar(g.member, 40), h('h2', { class: 'cg-name' }, nameOf(g.member)),
        h('span', { class: 'cg-count' + (all ? ' all' : '') }, all ? icon('check') : null, countText(p))),
      h('div', { class: 'cg-bar', 'aria-hidden': 'true' }, h('i', { style: '--p:' + Math.round((p.done / p.total) * 100) + '%' })),
      g.items.map((i) => choreRow(i, g.member, viewDate)));
  }

  /* ---------- Home widget ---------- */
  function widget() {
    const today = D.today();
    const groups = PL.chores.byPerson(PL.chores.instances(today, today));
    if (!groups.length) {
      return ui.emptyState({ icon: 'check', title: 'No chores today', text: 'Add a chore to see who has done what.', action: ui.button('Add a chore', { icon: 'plus', onClick: () => openForm({ date: today }) }) });
    }
    return h('div', { class: 'chore-sum' }, groups.map((g) => {
      const p = PL.chores.progress(g.items);
      const all = p.done === p.total;
      const bal = starsOn() && g.member ? Math.max(0, PL.stars.balance(g.member.id)) : null;
      return h('button', { type: 'button', class: 'cs-row', style: '--c:' + colorOf(g.member), onclick: () => PL.nav.go('tasks', { tab: 'chores' }),
        'aria-label': nameOf(g.member) + ', ' + countText(p) + (bal != null ? ', ' + bal + ' stars' : '') },
        ui.avatar(g.member, 40),
        h('span', { class: 'cs-main' }, h('span', { class: 'cs-name' }, nameOf(g.member)),
          h('span', { class: 'cg-bar', 'aria-hidden': 'true' }, h('i', { style: '--p:' + Math.round((p.done / p.total) * 100) + '%' }))),
        h('span', { class: 'cs-count' + (all ? ' all' : '') }, countText(p), bal != null ? h('span', { class: 'star-chip' }, icon('star'), String(bal)) : null));
    }));
  }

  PL.choresUi = { openForm, widget };

  /* ---------- screen ---------- */
  PL.screens.tasks = {
    mount(root, params) {
      const p = params || {};
      let tab = TABS.some((t) => t.value === p.tab) ? p.tab : PL.storage.get('taskTab', 'chores');
      if (!TABS.some((t) => t.value === tab)) tab = 'chores';
      let cursor = p.date || D.today();
      const el = h('div', { class: 'screen-page chores' });
      root.append(el);

      const step = (n) => { cursor = D.addDays(cursor, n); render(); };

      function render() {
        const a = document.activeElement;
        const focusKey = a && el.contains(a) && a.dataset ? a.dataset.key : null;
        const daily = tab !== 'rewards';
        const body = tab === 'chores'
          ? (() => {
              const groups = PL.chores.byPerson(PL.chores.instances(cursor, cursor));
              return h('div', { class: 'chores-list' }, groups.length ? groups.map((g) => group(g, cursor))
                : ui.emptyState({ icon: 'check', title: 'No chores for this day',
                    text: PL.state.chores.length ? 'Enjoy the break, or add something.' : 'Add the first chore. Give it to someone, and choose how often it repeats.',
                    action: ui.button('Add a chore', { variant: 'primary', big: true, icon: 'plus', onClick: () => openForm({ date: cursor }) }) }));
            })()
          : tab === 'routines' ? PL.routinesUi.panel(cursor) : PL.rewardsUi.panel();
        if (daily) ui.onSwipe(body, () => step(1), () => step(-1));

        const seg = ui.segmented(TABS, tab, (v) => { tab = v; PL.storage.set('taskTab', v); render(); }, 'Section');
        const addBtn = tab === 'chores' ? ui.button('Add chore', { variant: 'primary', icon: 'plus', onClick: () => openForm({ date: cursor }) })
          : tab === 'routines' ? ui.button('Add routine', { variant: 'primary', icon: 'plus', onClick: () => PL.routinesUi.openForm() })
          : (starsOn() ? ui.button('Add reward', { variant: 'primary', icon: 'plus', onClick: () => PL.rewardsUi.openForm() }) : null);
        el.replaceChildren(
          h('div', { class: 'task-tabs' }, seg.el),
          h('header', { class: 'chores-bar' },
            daily ? h('div', { class: 'cal-nav' },
              ui.iconButton('left', 'Previous day', () => step(-1)),
              ui.button('Today', { onClick: () => { cursor = D.today(); render(); } }),
              ui.iconButton('right', 'Next day', () => step(1))) : null,
            h('h1', { class: 'chores-day', 'aria-live': 'polite' }, daily ? dayTitle(cursor) : 'Rewards'),
            addBtn),
          body);
        if (focusKey) { const again = [...el.querySelectorAll('[data-key]')].find((b) => b.dataset.key === focusKey); if (again) again.focus({ preventScroll: true }); }
      }

      render();
      if (p.add) setTimeout(() => openForm({ date: cursor }), 0);
      return { update: render, destroy() {} };
    }
  };
})();
