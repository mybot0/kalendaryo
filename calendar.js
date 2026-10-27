/*
 * screens/calendar.js — Day, Week, Month and Agenda views.
 * Tap an event to open it. Tap a day number to open that day. In Month view,
 * press-and-hold (touch) or double-click (mouse) an empty spot to add an event.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;

  const addOn = (date) => PL.eventUi.openForm({ mode: 'create', date });

  PL.screens.calendar = {
    mount(root, params) {
      const p = params || {};
      let view = PL.config.calendarViews.some((v) => v.value === p.view) ? p.view : PL.state.device.defaultView;
      let cursor = p.date || D.today();
      const el = h('div', { class: 'screen-page calendar' });
      root.append(el);

      /* ----- navigation ----- */
      function step(dir) {
        if (view === 'day') cursor = D.addDays(cursor, dir);
        else if (view === 'week') cursor = D.addDays(cursor, 7 * dir);
        else if (view === 'month') cursor = D.addMonths(cursor, dir);
        else cursor = D.addDays(cursor, 14 * dir);
        render();
      }
      function title() {
        const ws = PL.state.settings.weekStart;
        if (view === 'day') return D.fmt(cursor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        if (view === 'month') return D.fmt(cursor, { month: 'long', year: 'numeric' });
        const a = view === 'week' ? D.startOfWeek(cursor, ws) : cursor;
        const b = D.addDays(a, view === 'week' ? 6 : 13);
        const sameMonth = D.parse(a).getMonth() === D.parse(b).getMonth();
        return D.fmt(a, { month: 'short', day: 'numeric' }) + ' – ' + D.fmt(b, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
      }

      /* ----- views ----- */
      function dayView() {
        const items = PL.cal.instances(cursor, cursor);
        return h('div', { class: 'day-view' },
          items.length ? h('div', { class: 'card-list' }, items.map((i) => PL.eventUi.card(i)))
            : ui.emptyState({ icon: 'sparkle', title: 'Nothing planned', text: cursor === D.today() ? 'A free day.' : 'No events on this day.', action: ui.button('Add an event', { variant: 'primary', icon: 'plus', onClick: () => addOn(cursor) }) }));
      }

      function weekView() {
        const ws = PL.state.settings.weekStart;
        const start = D.startOfWeek(cursor, ws);
        const all = PL.cal.instances(start, D.addDays(start, 6));
        const today = D.today();
        return h('div', { class: 'week-view' }, Array.from({ length: 7 }, (_, n) => {
          const key = D.addDays(start, n);
          const items = all.filter((x) => x.date === key);
          const col = h('section', { class: 'wv-day' + (key === today ? ' today' : ''), 'aria-label': D.fmt(key, { weekday: 'long', month: 'long', day: 'numeric' }) },
            h('button', { type: 'button', class: 'wv-head', onclick: () => { view = 'day'; cursor = key; render(); } },
              h('span', { class: 'wv-name' }, D.fmt(key, { weekday: 'short' })), h('span', { class: 'wv-num' }, D.parse(key).getDate())),
            h('div', { class: 'wv-list' }, items.length ? items.map((i) => PL.eventUi.card(i, { compact: true })) : h('span', { class: 'wk-free' }, 'Free')),
            h('button', { type: 'button', class: 'wv-add', 'aria-label': 'Add event on ' + D.fmt(key, { weekday: 'long', month: 'long', day: 'numeric' }), onclick: () => addOn(key) }, icon('plus')));
          return col;
        }));
      }

      function monthView() {
        const ws = PL.state.settings.weekStart;
        const first = D.monthStart(cursor);
        const gridStart = D.startOfWeek(first, ws);
        const cd = D.parse(cursor);
        const rows = Math.ceil(((D.dow(first) - ws + 7) % 7 + D.daysInMonth(cd.getFullYear(), cd.getMonth())) / 7);
        const gridEnd = D.addDays(gridStart, rows * 7 - 1);
        const all = PL.cal.instances(gridStart, gridEnd);
        const today = D.today();
        const month = D.parse(cursor).getMonth();
        const head = h('div', { class: 'mv-weekdays', 'aria-hidden': 'true' }, Array.from({ length: 7 }, (_, i) => h('span', {}, D.weekdayShort((ws + i) % 7))));
        const cells = [];
        for (let n = 0; n < rows * 7; n++) {
          const key = D.addDays(gridStart, n);
          const items = all.filter((x) => x.date === key);
          const out = D.parse(key).getMonth() !== month;
          const cell = h('div', { class: 'mv-cell' + (key === today ? ' today' : '') + (out ? ' out' : ''), role: 'group',
            'aria-label': D.fmt(key, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + items.length + (items.length === 1 ? ' event' : ' events') },
            h('button', { type: 'button', class: 'mv-num', onclick: () => { view = 'day'; cursor = key; render(); } }, D.parse(key).getDate()),
            h('div', { class: 'mv-items' },
              items.slice(0, 3).map((i) => h('button', { type: 'button', class: 'mv-ev' + (i.kind === 'holiday' ? ' hol' : ''), style: '--c:' + PL.cal.color(i), onclick: () => PL.eventUi.openDetail(i), title: (i.allDay ? '' : D.shortTime(i.start, PL.state.settings.hour12) + ' ') + i.title },
                !i.allDay && i.start ? h('b', { class: 'mv-time' }, D.shortTime(i.start, PL.state.settings.hour12)) : null, i.title)),
              items.length > 3 ? h('button', { type: 'button', class: 'mv-more', onclick: () => { view = 'day'; cursor = key; render(); } }, '+' + (items.length - 3) + ' more') : null));
          ui.onHold(cell, () => addOn(key));
          cells.push(cell);
        }
        return h('div', { class: 'month-view' }, head, h('div', { class: 'mv-grid', style: '--rows:' + rows }, cells));
      }

      function agendaView() {
        const from = cursor, to = D.addDays(cursor, 13);
        const all = PL.cal.instances(from, to);
        if (!all.length) return ui.emptyState({ icon: 'calendar', title: 'Nothing in these two weeks', action: ui.button('Add an event', { variant: 'primary', icon: 'plus', onClick: () => addOn(cursor) }) });
        const days = [];
        for (const i of all) { const last = days[days.length - 1]; if (last && last.key === i.date) last.items.push(i); else days.push({ key: i.date, items: [i] }); }
        return h('div', { class: 'agenda' }, days.map((d) => h('section', { class: 'ag-day' },
          h('h3', { class: 'ag-head' + (d.key === D.today() ? ' today' : '') }, d.key === D.today() ? 'Today' : D.fmt(d.key, { weekday: 'long', month: 'long', day: 'numeric' })),
          h('div', { class: 'card-list' }, d.items.map((i) => PL.eventUi.card(i))))));
      }

      /* ----- frame ----- */
      function render() {
        const views = { day: dayView, week: weekView, month: monthView, agenda: agendaView };
        const seg = ui.segmented(PL.config.calendarViews, view, (v) => { view = v; render(); }, 'Calendar view');
        const body = h('div', { class: 'cal-body' }, views[view]());
        ui.onSwipe(body, () => step(1), () => step(-1));
        el.replaceChildren(...[
          h('header', { class: 'cal-bar' },
            h('div', { class: 'cal-nav' },
              ui.iconButton('left', 'Previous', () => step(-1)),
              ui.button('Today', { onClick: () => { cursor = D.today(); render(); } }),
              ui.iconButton('right', 'Next', () => step(1))),
            h('h1', { class: 'cal-title', 'aria-live': 'polite' }, title()),
            seg.el,
            ui.button('🎉 Holidays', { variant: 'gold', aria: 'Holidays', onClick: () => PL.holidays.open() }),
            ui.button('Add', { variant: 'primary', icon: 'plus', onClick: () => addOn(view === 'day' ? cursor : D.today()) })),
          PL.holidays.bar(),
          body].filter(Boolean));
      }

      render();
      return { update: render, destroy() {} };
    }
  };
})();

