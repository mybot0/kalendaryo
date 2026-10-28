/*
 * itinerary.js — the plan: Timeline, Day, Week and Full trip views, plus the cards and the detail sheet
 * that other screens (Overview, Bookings, Chat) reuse through TR.plan.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, cfg = TR.config, icon = TR.icon;

  /* ---------- helpers shared with other screens ---------- */
  const plan = (TR.plan = {});

  plan.endDay = (i) => (i.end_date && i.end_date > i.start_date ? i.end_date : i.start_date);

  // The plans that touch one day. role: 'start' (the main card), 'cont' (still going), 'end' (finishes today).
  plan.on = function (items, day) {
    const rows = [];
    items.forEach((i) => {
      if (!i.start_date) return;
      const last = plan.endDay(i);
      if (day === i.start_date) rows.push({ item: i, role: 'start' });
      else if (day > i.start_date && day < last) rows.push({ item: i, role: 'cont' });
      else if (day === last && last !== i.start_date) rows.push({ item: i, role: 'end' });
    });
    const rank = (r) => (r.role === 'cont' ? -2 : r.role === 'end' ? (r.item.end_time ? D.minutes(r.item.end_time) : -1) : r.item.start_time ? D.minutes(r.item.start_time) : -1);
    return rows.sort((a, b) => rank(a) - rank(b) || String(a.item.created_at).localeCompare(String(b.item.created_at)));
  };
  plan.unscheduled = (items) => items.filter((i) => !i.start_date);

  plan.when = function (i, long) {
    const f = long ? D.long : D.short;
    if (!i.start_date) return 'No day yet';
    const a = f(i.start_date) + (i.start_time ? ' · ' + D.fmtTime(i.start_time) : '');
    const endDay = plan.endDay(i);
    if (!i.end_date && !i.end_time) return a;
    const b = (endDay !== i.start_date ? f(endDay) : '') + (i.end_time ? (endDay !== i.start_date ? ' · ' : '') + D.fmtTime(i.end_time) : '');
    return b ? a + ' → ' + b : a;
  };

  function timeText(item, role) {
    const T = cfg.types[item.type];
    if (role === 'cont') return 'Ongoing';
    if (role === 'end') return item.end_time ? D.fmtTime(item.end_time) : T.endLabel;
    return item.start_time ? D.fmtTime(item.start_time) : 'All day';
  }

  // One plan as a card. opts: { role, compact, showDate }
  plan.card = function (session, item, opts) {
    const o = opts || {}, T = cfg.types[item.type], role = o.role || 'start';
    const sub = role === 'start' ? T.sub(item) : role === 'end' ? T.endLabel : 'Until ' + D.short(plan.endDay(item));
    return h('button', { type: 'button', class: 'ev-card' + (o.compact ? ' compact' : '') + (role !== 'start' ? ' cont' : ''), style: '--c:' + T.color, onclick: () => plan.detail(session, item.id) },
      o.compact ? null : h('span', { class: 'tp-ic', style: '--c:' + T.color }, icon(T.icon)),
      h('span', { class: 'ev-time' }, o.showDate && item.start_date ? D.short(item.start_date) : timeText(item, role)),
      h('span', { class: 'ev-main' },
        h('span', { class: 'ev-title' }, (role === 'end' ? T.endLabel + ': ' : '') + item.title),
        sub ? h('span', { class: 'ev-sub' }, sub) : null,
        item.confirmation && role === 'start' && !o.compact ? h('span', { class: 'ev-conf' }, 'Conf. ' + item.confirmation) : null));
  };

  // What is next? The first plan that has not started yet (or is running right now).
  plan.next = function (items) {
    const now = new Date(), today = D.today();
    let best = null, bestAt = null;
    items.forEach((i) => {
      if (!i.start_date) return;
      const startAt = D.at(i.start_date, i.start_time || '00:00');
      const endAt = i.end_date ? D.at(i.end_date, i.end_time || '23:59') : D.at(i.start_date, i.start_time ? i.start_time : '23:59');
      const upcoming = startAt >= now || (i.start_date === today && !i.start_time);
      const running = startAt < now && endAt >= now && i.end_date && i.end_date > i.start_date;
      if (!upcoming || running) return;
      if (!bestAt || startAt < bestAt) { best = i; bestAt = startAt; }
    });
    return best;
  };

  // The whole plan as plain text, to paste into a message or e-mail.
  plan.asText = function (session) {
    const t = session.trip(), items = session.items(), lines = [t.name, [D.range(t.start_date, t.end_date), t.destination].filter(Boolean).join(' · ')];
    if (t.route.length > 1) lines.push(t.route.join(' → '));
    const days = [...new Set(items.filter((i) => i.start_date).flatMap((i) => { const o = []; for (let d = i.start_date, n = 0; d <= plan.endDay(i) && n < 400; d = D.addDays(d, 1), n++) o.push(d); return o; }))].sort();
    days.forEach((d) => {
      const n = t.start_date ? D.diff(t.start_date, d) + 1 : 0;
      lines.push('', D.long(d) + (n > 0 && t.end_date && d <= t.end_date ? ' (day ' + n + ')' : ''));
      plan.on(items, d).forEach((r) => {
        const i = r.item, T = cfg.types[i.type];
        const time = r.role === 'cont' ? '' : r.role === 'end' ? (i.end_time ? D.fmtTime(i.end_time) : '') : (i.start_time ? D.fmtTime(i.start_time) : '');
        const what = r.role === 'cont' ? 'Staying: ' + i.title : r.role === 'end' ? T.endLabel + ': ' + i.title : T.label + ': ' + i.title;
        const extra = r.role === 'start' ? [T.sub(i), i.confirmation ? 'conf. ' + i.confirmation : ''].filter(Boolean).join(' · ') : '';
        lines.push('  ' + (time ? time + '  ' : '') + what + (extra ? ' (' + extra + ')' : ''));
      });
    });
    const ideas = plan.unscheduled(items);
    if (ideas.length) { lines.push('', 'Ideas and notes'); ideas.forEach((i) => lines.push('  - ' + i.title)); }
    return lines.join('\n');
  };

  function shareSheet(session) {
    const text = plan.asText(session);
    const box = h('textarea', { rows: 14, readonly: true, 'aria-label': 'Itinerary as text', onfocus: (e) => e.target.select(), style: 'font-family:ui-monospace,Menlo,monospace;font-size:.82rem' }); box.value = text;
    const s = ui.sheet({ title: 'Share the itinerary', wide: true, body: h('div', { class: 'stack' }, h('p', { class: 'sheet-text' }, 'Plain text you can paste into a message or e-mail, for people who are not on the trip.'), box),
      footer: [h('span', { class: 'spacer' }), navigator.share ? ui.button('Share…', { icon: 'share', onClick: () => navigator.share({ title: session.trip().name, text }).catch(() => {}) }) : null,
        ui.button('Copy text', { icon: 'copy', variant: 'primary', big: true, onClick: async () => { const ok = await TR.copy(text); if (!ok) box.select(); ui.toast(ok ? 'Copied.' : 'Select the text and copy it.'); } })] });
  }

  plan.detail = function (session, itemId) {
    const item = session.item(itemId);
    if (!item) return ui.toast('That plan was removed.');
    const T = cfg.types[item.type];
    const rows = [];
    T.fields.forEach((f) => {
      const v = item.data[f[0]];
      if (v === undefined || v === '') return;
      let val = v;
      if (f[0] === 'website') val = h('a', { href: v, target: '_blank', rel: 'noopener noreferrer' }, v.replace(/^https?:\/\//, ''));
      if (f[0] === 'cost') val = (item.data.currency ? item.data.currency + ' ' : '') + v;
      if (f[0] === 'currency' && item.data.cost !== undefined) return;
      rows.push([f[1], val]);
    });
    if (item.location) rows.unshift([T.locationLabel, h('a', { href: TR.mapsUrl(item.location), target: '_blank', rel: 'noopener noreferrer' }, item.location)]);
    const who = (id) => { const m = session.member(id); return m ? m.name : 'someone who left'; };
    const body = h('div', { class: 'detail' },
      h('div', { class: 'detail-band', style: '--c:' + T.color }),
      h('div', { class: 'detail-title' }, h('span', { class: 'tp-ic', style: '--c:' + T.color }, icon(T.icon)), h('div', {}, h('h3', {}, item.title), h('span', { class: 'sub' }, T.label))),
      h('div', { class: 'detail-row' }, h('span', { class: 'detail-ic' }, icon('clock')), h('span', {}, plan.when(item, true))),
      item.confirmation ? h('div', { class: 'conf-box' }, h('div', { style: 'flex:1;min-width:0' }, h('small', {}, 'Confirmation'), h('b', {}, item.confirmation)),
        ui.iconButton('copy', 'Copy confirmation number', async () => ui.toast((await TR.copy(item.confirmation)) ? 'Copied.' : 'Could not copy.'))) : null,
      rows.length ? h('dl', { class: 'kv' }, rows.map((r) => [h('dt', {}, r[0]), h('dd', {}, r[1])])) : null,
      item.notes ? h('p', { class: 'pre' }, item.notes) : null,
      h('p', { class: 'who' }, 'Added by ' + who(item.created_by) + (item.updated_by && item.updated_by !== item.created_by ? ' · changed by ' + who(item.updated_by) : '')));
    const s = ui.sheet({
      title: '', wide: true, body,
      footer: [
        ui.button('Discuss', { icon: 'chat', onClick: () => { s.close(); session.draft = 'About “' + item.title + '”: '; TR.go('/trip/' + session.id + '/chat'); } }),
        h('span', { class: 'spacer' }),
        session.can('items.write') ? ui.button('Duplicate', { icon: 'copy', onClick: () => { s.close(); TR.forms.itemSheet({ session, template: Object.assign({}, item, { title: item.title + ' (copy)', confirmation: '' }) }); } }) : null,
        session.can('items.write') ? ui.button('Edit', { icon: 'edit', variant: 'primary', big: true, onClick: () => { s.close(); TR.forms.itemSheet({ session, item }); } }) : null]
    });
    return s;
  };

  /* ---------- the screen ---------- */
  const VIEWS = [{ value: 'timeline', label: 'Timeline' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'full', label: 'Full trip' }];

  function mount(root, ctx) {
    const session = ctx.session;
    let view = TR.storage.get('itView', 'timeline');
    if (!VIEWS.some((v) => v.value === view)) view = 'timeline';
    let day = null, weekStart = null;

    function tripDays() {
      const t = session.trip(), items = session.items().filter((i) => i.start_date);
      let a = t.start_date, b = t.end_date;
      items.forEach((i) => { if (!a || i.start_date < a) a = i.start_date; const e = plan.endDay(i); if (!b || e > b) b = e; });
      if (!a) return [];
      if (!b || b < a) b = a;
      const out = []; for (let d = a, n = 0; d <= b && n < 800; d = D.addDays(d, 1), n++) out.push(d);
      return out;
    }
    function defaultDay() {
      const days = tripDays(), today = D.today();
      if (!days.length) return today;
      return days.includes(today) ? today : days[0];
    }
    const canAdd = () => session.can('items.write');
    const add = (date) => TR.forms.typePicker(session, date);

    function addBtn(date, label) {
      return canAdd() ? ui.button(label || 'Add', { icon: 'plus', variant: 'primary', onClick: () => add(date) }) : null;
    }
    function dayHead(d, extra) {
      const t = session.trip(), n = t.start_date ? D.diff(t.start_date, d) + 1 : null;
      const inTrip = n && t.end_date && d >= t.start_date && d <= t.end_date;
      return h('div', { class: 'day-head' + (d === D.today() ? ' today' : '') },
        h('h3', {}, D.long(d)), inTrip ? h('span', { class: 'sub' }, 'Day ' + n) : null, d === D.today() ? h('span', { class: 'badge owner' }, 'Today') : null, extra);
    }
    const cards = (rows, o) => h('div', { class: 'card-list' }, rows.map((r) => plan.card(session, r.item, Object.assign({ role: r.role }, o))));
    function emptyDay(d) {
      return canAdd() ? h('button', { type: 'button', class: 'day-empty', onclick: () => add(d) }, '+ Add something for this day') : h('div', { class: 'day-empty' }, 'Nothing planned.');
    }
    function ideas() {
      const list = plan.unscheduled(session.items());
      if (!list.length) return null;
      return h('section', { class: 'day-block' }, h('div', { class: 'day-head' }, h('h3', {}, 'Ideas & notes'), h('span', { class: 'sub' }, 'No day yet')),
        h('div', { class: 'card-list' }, list.map((i) => plan.card(session, i, { role: 'start' }))));
    }

    /* --- views --- */
    function timeline() {
      const items = session.items();
      if (!items.length) return empty();
      const days = [...new Set(items.filter((i) => i.start_date).flatMap((i) => { const o = []; for (let d = i.start_date, n = 0; d <= plan.endDay(i) && n < 400; d = D.addDays(d, 1), n++) o.push(d); return o; }))].sort();
      return h('div', {}, days.map((d) => h('section', { class: 'day-block' }, dayHead(d, canAdd() ? h('button', { type: 'button', class: 'link-btn', onclick: () => add(d) }, icon('plus'), 'Add') : null), cards(plan.on(items, d)))), ideas());
    }
    function dayView() {
      if (!day) day = defaultDay();
      const days = tripDays(), items = session.items();
      const rows = plan.on(items, day);
      const el = h('div', { class: 'day-view' },
        h('div', { class: 'cal-bar' },
          h('div', { class: 'cal-nav' }, ui.iconButton('left', 'Previous day', () => { day = D.addDays(day, -1); render(); }), ui.iconButton('right', 'Next day', () => { day = D.addDays(day, 1); render(); })),
          h('h2', { class: 'cal-title' }, D.long(day)),
          days.length && day !== defaultDay() ? ui.button('Today', { variant: 'ghost', onClick: () => { day = defaultDay(); render(); } }) : null),
        rows.length ? cards(rows) : emptyDay(day), rows.length ? h('div', { class: 'btn-row', style: 'margin-top:12px' }, addBtn(day, 'Add to this day'), canAdd() && rows.some((r) => r.role === 'start') ? ui.button('Move this day', { icon: 'calendar', onClick: () => moveDay(day, rows.filter((r) => r.role === 'start').map((r) => r.item)) }) : null) : null);
      ui.onSwipe(el, () => { day = D.addDays(day, 1); render(); }, () => { day = D.addDays(day, -1); render(); });
      return el;
    }
    // Move everything that starts on one day to another day, keeping each plan's length.
    function moveDay(from, list) {
      const target = TR.forms.input('date', from, { autofocus: true });
      const err = h('p', { class: 'form-error', role: 'alert' });
      const go = ui.button('Move plans', { variant: 'primary', big: true, onClick: async () => {
        if (!target.value || target.value === from) { err.textContent = 'Pick a different day.'; return; }
        const shift = D.diff(from, target.value); go.disabled = true;
        try {
          for (const i of list) {
            const cur = session.item(i.id) || i;
            await session.req('PATCH', '/items/' + i.id, { version: cur.version, start_date: target.value, end_date: cur.end_date ? D.addDays(cur.end_date, shift) : null });
            await session.refresh();
          }
          day = target.value; sheet.close(); ui.toast(TR.plural(list.length, 'plan') + ' moved to ' + D.short(target.value) + '.'); render();
        } catch (e) { err.textContent = e.message; go.disabled = false; session.refresh(); }
      } });
      const sheet = ui.sheet({ title: 'Move this day', body: h('div', { class: 'stack' }, h('p', { class: 'sheet-text' }, TR.plural(list.length, 'plan') + ' starting on ' + D.long(from) + ' will move to the day you pick. Stays and trips keep their length.'), ui.field('New day', target), err),
        footer: [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => sheet.close() }), go] });
    }
    function weekView() {
      if (!weekStart) weekStart = D.startOfWeek(day || defaultDay(), 0);
      const items = session.items(), today = D.today();
      const cols = []; for (let i = 0; i < 7; i++) cols.push(D.addDays(weekStart, i));
      return h('div', {},
        h('div', { class: 'cal-bar' },
          h('div', { class: 'cal-nav' }, ui.iconButton('left', 'Previous week', () => { weekStart = D.addDays(weekStart, -7); render(); }), ui.iconButton('right', 'Next week', () => { weekStart = D.addDays(weekStart, 7); render(); })),
          h('h2', { class: 'cal-title' }, D.short(cols[0]) + ' – ' + D.short(cols[6]))),
        h('div', { class: 'week-view' }, cols.map((d) => {
          const rows = plan.on(items, d);
          return h('div', { class: 'wv-day' + (d === today ? ' today' : '') },
            h('button', { type: 'button', class: 'wv-head', onclick: () => { day = d; view = 'day'; render(); } }, h('span', { class: 'wv-name' }, D.fmt(d, { weekday: 'short' })), h('span', { class: 'wv-num' }, D.parse(d).getDate())),
            h('div', { class: 'wv-list' }, rows.map((r) => plan.card(session, r.item, { role: r.role, compact: true })), canAdd() ? h('button', { type: 'button', class: 'wv-add', 'aria-label': 'Add on ' + D.long(d), onclick: () => add(d) }, icon('plus')) : null));
        })));
    }
    function fullView() {
      const days = tripDays(), items = session.items();
      if (!days.length && !items.length) return empty();
      return h('div', {},
        h('div', { class: 'full-grid' }, days.map((d, n) => {
          const rows = plan.on(items, d).filter((r) => r.role === 'start');
          const conts = plan.on(items, d).filter((r) => r.role !== 'start').length;
          return h('button', { type: 'button', class: 'full-row' + (d === D.today() ? ' today' : ''), onclick: () => { day = d; view = 'day'; render(); } },
            h('span', { class: 'full-date' }, D.fmt(d, { weekday: 'short' }), h('b', {}, D.parse(d).getDate()), D.fmt(d, { month: 'short' })),
            h('span', { class: 'full-main' }, rows.length ? rows.map((r) => h('span', { class: 'full-chip', style: '--c:' + cfg.types[r.item.type].color }, icon(cfg.types[r.item.type].icon), r.item.title)) : h('span', { class: 'full-none' }, conts ? 'Ongoing plans only' : 'Free day')),
            h('span', { class: 'sub' }, 'Day ' + (n + 1)));
        })), h('div', { style: 'height:16px' }), ideas());
    }
    function empty() {
      return ui.emptyState({ icon: 'calendar', title: 'Nothing planned yet', text: canAdd() ? 'Upload your flight and hotel bookings, let AI plan the whole trip, or add things yourself. Everyone on the trip sees them right away.' : 'Plans appear here when an editor adds them.',
        action: canAdd() ? h('div', { class: 'btn-row', style: 'justify-content:center' }, ui.button('Upload bookings', { icon: 'sparkle', variant: 'gold', onClick: () => TR.ai.bookings(session) }), ui.button('Plan my trip with AI', { icon: 'sparkle', onClick: () => TR.ai.plan(session) }), addBtn('', 'Add by hand')) : null });
    }

    function render() {
      const seg = ui.segmented(VIEWS, view, (v) => { view = v; TR.storage.set('itView', v); if (v === 'week') weekStart = D.startOfWeek(day || defaultDay(), 0); render(); }, 'View');
      const body = view === 'day' ? dayView() : view === 'week' ? weekView() : view === 'full' ? fullView() : timeline();
      root.replaceChildren(
        h('div', { class: 'page-head' }, h('h1', {}, 'Itinerary'), h('div', { class: 'btn-row' }, ...TR.ai.buttons(session), session.items().length ? ui.button('Share', { icon: 'share', onClick: () => shareSheet(session) }) : null, addBtn(''))),
        h('div', { class: 'it-bar' }, seg.el),
        body);
    }
    render();
    const off = session.on((k) => { if (k === 'state') render(); });
    return { destroy: off };
  }

  TR.screens = TR.screens || {};
  TR.screens.itinerary = { mount };
})();
