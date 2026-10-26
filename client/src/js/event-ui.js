/*
 * event-ui.js — everything about one event on screen:
 *   PL.eventUi.card(instance)        the tappable event card used in every view
 *   PL.eventUi.openDetail(instance)  view / edit / duplicate / move / delete
 *   PL.eventUi.openForm({...})       add or edit form (with repeat options)
 *   PL.eventUi.deleteInstance(inst)  asks what to delete for repeating events
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;

  /* ---------- card ---------- */
  function card(inst, opts) {
    const o = opts || {};
    const people = PL.cal.people(inst);
    const repeating = inst.ev && inst.ev.repeat;
    const time = o.compact && !inst.allDay ? D.fmtTime(inst.start, PL.state.settings.hour12) : PL.cal.rangeLabel(inst);
    const names = people.length ? ', ' + people.map((p) => p.name).join(' and ') : '';
    return h('button', {
      type: 'button', class: 'ev-card' + (o.compact ? ' compact' : '') + (inst.kind === 'birthday' ? ' birthday' : ''),
      style: '--c:' + PL.cal.color(inst), onclick: () => openDetail(inst),
      'aria-label': inst.title + ', ' + PL.cal.rangeLabel(inst) + names
    },
      h('span', { class: 'ev-time' }, time),
      h('span', { class: 'ev-main' },
        h('span', { class: 'ev-title' }, inst.kind === 'birthday' ? icon('cake') : null, inst.title),
        !o.compact && inst.location ? h('span', { class: 'ev-loc' }, icon('pin'), inst.location) : null),
      people.length ? h('span', { class: 'ev-people' }, people.slice(0, 4).map((p) => ui.avatar(p, o.compact ? 24 : 30))) : null,
      repeating ? h('span', { class: 'ev-rep', title: 'Repeats' }, icon('repeat')) : null);
  }

  /* ---------- detail ---------- */
  function row(iconName, content) {
    return h('div', { class: 'detail-row' }, h('span', { class: 'detail-ic' }, icon(iconName)), h('div', {}, content));
  }
  function openDetail(inst) {
    const people = PL.cal.people(inst);
    const ev = inst.ev;
    const when = D.fmt(inst.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const body = h('div', { class: 'detail', style: '--c:' + PL.cal.color(inst) },
      h('div', { class: 'detail-band' }),
      row('clock', [h('strong', {}, when), h('div', { class: 'sub' }, PL.cal.rangeLabel(inst))]),
      ev && ev.repeat ? row('repeat', PL.recur.describe(ev)) : null,
      people.length
        ? row('users', h('div', { class: 'detail-people' }, people.map((p) => h('span', { class: 'person-chip' }, ui.avatar(p, 26), p.name))))
        : (inst.kind === 'birthday' ? null : row('users', 'Whole family')),
      inst.location ? row('pin', inst.location) : null,
      inst.notes ? row('note', h('span', { class: 'pre' }, inst.notes)) : null,
      ev && ev.reminder != null ? row('bell', (PL.config.reminderOptions.find((r) => r.value === ev.reminder) || {}).label || '') : null,
      inst.kind === 'birthday' ? row('cake', 'Birthday from the family profile') : null);

    let s;
    if (inst.virtual) {
      s = ui.sheet({ title: inst.title, body, footer: [ui.button('Open profile', { variant: 'primary', big: true, icon: 'users', onClick: () => { s.close(); PL.nav.go('family', { edit: inst.ownerId }); } })] });
      return;
    }
    s = ui.sheet({
      title: inst.title, body,
      footer: [
        ui.button('Edit', { variant: 'primary', icon: 'edit', onClick: () => { s.close(); openForm({ mode: 'edit', inst }); } }),
        ui.button('Duplicate', { icon: 'copy', onClick: () => { s.close(); openForm({ mode: 'create', prefill: ev, date: inst.date }); } }),
        ui.button('Move', { icon: 'move', onClick: () => { s.close(); openForm({ mode: 'move', inst }); } }),
        ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: async () => { if (await deleteInstance(inst)) s.close(); } })
      ]
    });
  }

  // Asks what to delete (for repeating events) and does it. Resolves true when deleted.
  async function deleteInstance(inst) {
    const ev = inst.ev;
    let scope = 'all';
    if (ev.repeat) {
      scope = await ui.choose({
        title: 'Delete repeating event',
        message: '“' + ev.title + '” repeats. What should be deleted?',
        options: [
          { value: 'one', label: 'Only ' + D.fmt(inst.date, { weekday: 'short', month: 'short', day: 'numeric' }), description: 'The rest of the series stays.' },
          ...(inst.date > ev.date ? [{ value: 'future', label: 'This and following events', description: 'Earlier days stay on the calendar.' }] : []),
          { value: 'all', label: 'All events in the series', description: 'Removes every day, past and future.', danger: true }
        ]
      });
      if (!scope) return false;
    } else if (!(await ui.confirm({ title: 'Delete this event?', message: '“' + ev.title + '” will be removed for everyone.', confirmLabel: 'Delete', danger: true }))) {
      return false;
    }
    const ok = await PL.actions.remove(inst, scope);
    if (ok) ui.toast('Event deleted.');
    return ok;
  }

  /* ---------- form ---------- */
  const UNITS = [{ value: 'day', label: 'days' }, { value: 'week', label: 'weeks' }, { value: 'month', label: 'months' }, { value: 'year', label: 'years' }];
  const FREQ_OF = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' };
  const UNIT_OF = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

  function kindOf(r, date) {
    if (!r) return 'none';
    if ((r.interval || 1) > 1) return 'custom';
    if (r.freq === 'daily') return 'daily';
    if (r.freq === 'monthly') return 'monthly';
    if (r.freq === 'yearly') return 'yearly';
    const wd = r.weekdays && r.weekdays.length ? r.weekdays : [D.dow(date)];
    if (wd.length === 5 && [1, 2, 3, 4, 5].every((x) => wd.includes(x))) return 'weekdays';
    if (wd.length === 1 && wd[0] === D.dow(date)) return 'weekly';
    return 'custom';
  }
  function repeatLabels(date) {
    return [
      { value: 'none', label: 'Does not repeat' },
      { value: 'daily', label: 'Every day' },
      { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
      { value: 'weekly', label: 'Every week on ' + D.weekdayLong(D.dow(date)) },
      { value: 'monthly', label: 'Every month on the ' + D.ordinal(D.parse(date).getDate()) },
      { value: 'yearly', label: 'Every year on ' + D.fmt(date, { month: 'long', day: 'numeric' }) },
      { value: 'custom', label: 'Custom…' }
    ];
  }
  function defaultTimes(date) {
    let startMin = 9 * 60;
    if (date === D.today()) {
      const n = new Date();
      startMin = Math.min(22 * 60, (Math.floor((n.getHours() * 60 + n.getMinutes()) / 30) + 1) * 30);
    }
    const t = (m) => D.pad(Math.floor(m / 60)) + ':' + D.pad(m % 60);
    return { start: t(startMin), end: t(Math.min(23 * 60 + 59, startMin + 60)) };
  }

  // opts: { mode: 'create'|'edit'|'move', inst?, date?, prefill? }
  function openForm(opts) {
    const mode = opts.mode;
    const src = opts.inst ? opts.inst.ev : opts.prefill || null;
    const date0 = opts.inst ? opts.inst.date : (opts.date || D.today());
    const times = defaultTimes(date0);
    const members = PL.state.members;
    const full = mode !== 'move';

    /* inputs */
    const title = h('input', { type: 'text', id: 'ef-title', maxlength: '80', placeholder: 'For example: Piano lesson', autocomplete: 'off', autofocus: true });
    title.value = src ? src.title : '';
    const date = h('input', { type: 'date', id: 'ef-date', required: true }); date.value = date0;
    const start = h('input', { type: 'time', id: 'ef-start' }); start.value = src && src.start ? src.start : times.start;
    const end = h('input', { type: 'time', id: 'ef-end' }); end.value = src && src.end ? src.end : (src && src.start ? '' : times.end);
    const allDay = ui.toggle('All day', src ? !!src.allDay : false, () => syncVisibility());
    const location = h('input', { type: 'text', id: 'ef-loc', maxlength: '120', placeholder: 'Add a place', autocomplete: 'off' }); location.value = src ? src.location || '' : '';
    const notes = h('textarea', { id: 'ef-notes', maxlength: '1000', rows: '3', placeholder: 'Anything to remember' }); notes.value = src ? src.notes || '' : '';
    const color = ui.colorPicker(src ? src.color : '', true);
    const reminder = ui.select(PL.config.reminderOptions, src && src.reminder != null ? src.reminder : 'null');
    reminder.querySelectorAll('option').forEach((o) => { if (o.value === 'null') o.value = 'null'; });

    /* people */
    const picked = new Set(src ? (src.memberIds || []).filter((id) => PL.store.member(id)) : []);
    const peopleBox = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'People' }, members.map((m) => {
      const b = h('button', { type: 'button', class: 'person-pick', 'aria-pressed': picked.has(m.id) ? 'true' : 'false',
        onclick: () => { picked.has(m.id) ? picked.delete(m.id) : picked.add(m.id); b.setAttribute('aria-pressed', picked.has(m.id) ? 'true' : 'false'); } },
        ui.avatar(m, 28), m.name);
      return b;
    }));

    /* repeat */
    const r0 = src ? src.repeat : null;
    const kind0 = kindOf(r0, src ? src.date : date0);
    const repSel = ui.select(repeatLabels(date0), kind0, () => syncVisibility());
    repSel.id = 'ef-repeat';
    const cInterval = h('input', { type: 'number', id: 'ef-interval', min: '1', max: '99', class: 'num', 'aria-label': 'Repeat every' });
    cInterval.value = r0 ? r0.interval || 1 : 1;
    const cUnit = ui.select(UNITS, r0 ? UNIT_OF[r0.freq] : 'week', () => syncVisibility());
    cUnit.setAttribute('aria-label', 'Repeat unit');
    const wdPicked = new Set(r0 && r0.weekdays && r0.weekdays.length ? r0.weekdays : [D.dow(date0)]);
    const wdBox = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Repeat on' }, [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const b = h('button', { type: 'button', class: 'wd-pick', 'aria-pressed': wdPicked.has(i) ? 'true' : 'false', 'aria-label': D.weekdayLong(i),
        onclick: () => { wdPicked.has(i) ? wdPicked.delete(i) : wdPicked.add(i); b.setAttribute('aria-pressed', wdPicked.has(i) ? 'true' : 'false'); } }, D.weekdayShort(i).slice(0, 2));
      return b;
    }));
    const customBox = h('div', { class: 'repeat-custom' },
      h('div', { class: 'inline' }, h('span', {}, 'Every'), cInterval, cUnit),
      wdBox);
    const endType = ui.segmented([{ value: 'never', label: 'Never' }, { value: 'on', label: 'On a date' }, { value: 'after', label: 'After' }],
      r0 && r0.end ? r0.end.type : 'never', () => syncVisibility(), 'Repeat ends');
    const endDate = h('input', { type: 'date', id: 'ef-enddate', 'aria-label': 'Last day' });
    endDate.value = r0 && r0.end && r0.end.type === 'on' ? r0.end.date : '';
    const endCount = h('input', { type: 'number', id: 'ef-endcount', min: '1', max: '999', class: 'num', 'aria-label': 'Number of times' });
    endCount.value = r0 && r0.end && r0.end.type === 'after' ? r0.end.count : 10;
    const endBox = h('div', { class: 'repeat-ends' }, h('span', { class: 'field-label' }, 'Ends'), endType.el,
      h('div', { class: 'inline end-extra', dataset: { for: 'on' } }, endDate),
      h('div', { class: 'inline end-extra', dataset: { for: 'after' } }, endCount, h('span', {}, 'times')));

    date.addEventListener('change', () => {
      if (!date.value) return;
      const keep = repSel.value;
      repSel.replaceChildren(...repeatLabels(date.value).map((o) => h('option', { value: o.value }, o.label)));
      repSel.value = keep;
    });

    const timesRow = h('div', { class: 'row2' }, ui.field('Starts', start), ui.field('Ends', end));
    const repeatBlock = h('div', { class: 'repeat-block' }, ui.field('Repeat', repSel), customBox, endBox);

    function syncVisibility() {
      timesRow.hidden = allDay.get();
      const k = repSel.value;
      customBox.hidden = k !== 'custom';
      wdBox.hidden = !(k === 'custom' && cUnit.value === 'week');
      endBox.hidden = k === 'none';
      endBox.querySelectorAll('.end-extra').forEach((x) => { x.hidden = x.dataset.for !== endType.get(); });
    }

    function readRepeat() {
      const k = repSel.value, dow = D.dow(date.value);
      let r = null;
      if (k === 'daily') r = { freq: 'daily', interval: 1 };
      else if (k === 'weekdays') r = { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
      else if (k === 'weekly') r = { freq: 'weekly', interval: 1, weekdays: [dow] };
      else if (k === 'monthly') r = { freq: 'monthly', interval: 1 };
      else if (k === 'yearly') r = { freq: 'yearly', interval: 1 };
      else if (k === 'custom') {
        r = { freq: FREQ_OF[cUnit.value], interval: parseInt(cInterval.value, 10) || 1 };
        if (r.freq === 'weekly') r.weekdays = wdPicked.size ? [...wdPicked] : [dow];
      }
      if (r) {
        const t = endType.get();
        r.end = t === 'on' ? { type: 'on', date: endDate.value } : t === 'after' ? { type: 'after', count: parseInt(endCount.value, 10) || 1 } : { type: 'never' };
      }
      return r;
    }

    async function save() {
      const t = title.value.trim();
      if (full && !t) { ui.toast('Please type a title first.'); title.focus(); return; }
      if (!date.value) { ui.toast('Please pick a day.'); date.focus(); return; }
      if (!allDay.get() && start.value && end.value && end.value <= start.value) { ui.toast('The end time must be after the start time.'); end.focus(); return; }
      const rep = full ? readRepeat() : undefined;
      if (rep && rep.end.type === 'on' && (!rep.end.date || rep.end.date < date.value)) { ui.toast('Pick a last day that is on or after the first day.'); endDate.focus(); return; }

      const data = { date: date.value, allDay: allDay.get(), start: allDay.get() ? '' : start.value, end: allDay.get() ? '' : end.value };
      if (full) {
        Object.assign(data, {
          title: t, location: location.value, notes: notes.value, memberIds: [...picked], color: color.get(), repeat: rep,
          reminder: reminder.value === 'null' ? null : Number(reminder.value)
        });
      }
      saveBtn.disabled = true;
      let ok;
      if (mode === 'create') {
        ok = !!(await PL.actions.create(data));
      } else {
        let scope = 'all';
        if (opts.inst.ev.repeat) {
          scope = await ui.choose({
            title: 'Change a repeating event',
            message: 'This event repeats. Apply the change to:',
            options: [
              { value: 'one', label: 'Only ' + D.fmt(opts.inst.date, { weekday: 'short', month: 'short', day: 'numeric' }), description: 'The other days stay the same.' },
              ...(opts.inst.date > opts.inst.ev.date ? [{ value: 'future', label: 'This and following events', description: 'Earlier days stay the same.' }] : []),
              { value: 'all', label: 'All events in the series' }
            ]
          });
          if (!scope) { saveBtn.disabled = false; return; }
        }
        ok = await PL.actions.saveEdit(opts.inst, data, scope);
      }
      saveBtn.disabled = false;
      if (ok) { s.close(); ui.toast(mode === 'create' ? 'Event added.' : mode === 'move' ? 'Event moved.' : 'Event saved.'); }
    }

    const saveBtn = ui.button(mode === 'create' ? 'Add event' : mode === 'move' ? 'Move event' : 'Save changes', { variant: 'primary', big: true, onClick: save });
    const body = h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
      full ? ui.field('Title', title) : h('p', { class: 'sheet-text' }, '“' + (src ? src.title : '') + '”'),
      full ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Who is it for?'),
        members.length ? peopleBox : h('p', { class: 'hint' }, 'Add family members in the Family section to color-code events.'),
        h('p', { class: 'hint' }, members.length ? 'Leave empty for the whole family.' : '')) : null,
      allDay.el, ui.field('Day', date), timesRow,
      full ? repeatBlock : null,
      full ? ui.field('Reminder', reminder) : null,
      full ? ui.field('Location', location) : null,
      full ? ui.field('Notes', notes) : null,
      full ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Color'), color.el, h('p', { class: 'hint' }, 'Auto uses the first person’s color.')) : null);

    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() })];
    if (mode === 'edit') footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: async () => { if (await deleteInstance(opts.inst)) s.close(); } }));
    footer.push(saveBtn);
    const s = ui.sheet({ title: mode === 'create' ? 'New event' : mode === 'move' ? 'Move event' : 'Edit event', body, footer, wide: true });
    syncVisibility();
  }

  PL.eventUi = { card, openDetail, openForm, deleteInstance };
})();

