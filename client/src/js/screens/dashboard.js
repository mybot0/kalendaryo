/*
 * screens/dashboard.js — the Home screen: clock, reminders and widgets.
 *
 * Widgets are listed in the registry below. To add a widget later (tasks, meals,
 * weather…), add an entry here; the Settings screen and the layout code pick it up
 * automatically. Each device saves its own widget order, size and visibility.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;

  const timeText = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: PL.state.settings.hour12 !== false });
  const open = (screen, params) => () => PL.nav.go(screen, params);
  const newEvent = (date) => () => PL.eventUi.openForm({ mode: 'create', date: date || D.today() });

  /* ---------- widgets ---------- */
  function todayWidget() {
    const today = D.today();
    const items = PL.cal.instances(today, today);
    const shown = items.slice(0, 6);
    return h('div', { class: 'stack' },
      items.length
        ? [h('div', { class: 'card-list' }, shown.map((i) => PL.eventUi.card(i))),
           items.length > shown.length ? h('button', { class: 'link-btn', type: 'button', onclick: open('calendar', { view: 'day', date: today }) }, '+' + (items.length - shown.length) + ' more today') : null]
        : ui.emptyState({ icon: 'sparkle', title: 'Nothing planned today', text: 'A free day. Add something if you like.', action: ui.button('Add an event', { icon: 'plus', onClick: newEvent(today) }) }));
  }

  function weekWidget() {
    const ws = PL.state.settings.weekStart;
    const start = D.startOfWeek(D.today(), ws);
    const end = D.addDays(start, 6);
    const all = PL.cal.instances(start, end);
    const today = D.today();
    return h('div', { class: 'week-strip' }, Array.from({ length: 7 }, (_, i) => {
      const key = D.addDays(start, i);
      const items = all.filter((x) => x.date === key);
      return h('button', { type: 'button', class: 'wk-day' + (key === today ? ' today' : ''), onclick: open('calendar', { view: 'day', date: key }),
        'aria-label': D.fmt(key, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + items.length + (items.length === 1 ? ' event' : ' events') },
        h('span', { class: 'wk-name' }, D.fmt(key, { weekday: 'short' })),
        h('span', { class: 'wk-num' }, D.parse(key).getDate()),
        h('span', { class: 'wk-items' },
          items.slice(0, 3).map((x) => h('span', { class: 'wk-item', style: '--c:' + PL.cal.color(x) }, x.title)),
          items.length > 3 ? h('span', { class: 'wk-more' }, '+' + (items.length - 3) + ' more') : (items.length ? null : h('span', { class: 'wk-free' }, 'Free'))));
    }));
  }

  function upcomingWidget() {
    const today = D.today();
    const items = PL.cal.instances(D.addDays(today, 1), D.addDays(today, 60)).slice(0, 6);
    if (!items.length) return ui.emptyState({ icon: 'calendar', title: 'Nothing coming up', text: 'New events will show here.' });
    return h('div', { class: 'upcoming' }, items.map((i) => {
      const people = PL.cal.people(i);
      return h('button', { type: 'button', class: 'up-row', style: '--c:' + PL.cal.color(i), onclick: () => PL.eventUi.openDetail(i) },
        h('span', { class: 'up-date' }, h('b', {}, D.parse(i.date).getDate()), D.fmt(i.date, { weekday: 'short' })),
        h('span', { class: 'up-main' }, h('span', { class: 'up-title' }, i.title), h('span', { class: 'sub' }, PL.cal.rangeLabel(i))),
        people.length ? h('span', { class: 'ev-people' }, people.slice(0, 3).map((p) => ui.avatar(p, 24))) : null);
    }));
  }

  function familyWidget() {
    const members = PL.state.members;
    if (!members.length) {
      return ui.emptyState({ icon: 'users', title: 'No one here yet', text: 'Add the people you live with to color-code the calendar.', action: ui.button('Add people', { icon: 'plus', onClick: open('family', { add: true }) }) });
    }
    const today = D.today();
    const all = PL.cal.instances(today, today, { all: true });
    return h('div', { class: 'member-tiles' }, members.map((m) => {
      const mine = all.filter((i) => (i.memberIds || []).includes(m.id) && i.kind !== 'birthday');
      return h('button', { type: 'button', class: 'member-tile', style: '--c:' + m.color, onclick: () => PL.familyUi.openMember(m.id) },
        ui.avatar(m, 52),
        h('span', { class: 'mt-name' }, m.name),
        h('span', { class: 'sub' }, mine.length ? mine.length + (mine.length === 1 ? ' thing today' : ' things today') : 'Free today'));
    }));
  }

  function mealsWidget() {
    const today = D.today(), tmr = D.addDays(today, 1);
    const rows = PL.mealsUi.dayRows([today, tmr]);
    if (!rows.length) return ui.emptyState({ icon: 'meal', title: 'No meals planned', text: 'Plan dinner for the week.', action: ui.button('Plan meals', { icon: 'plus', onClick: open('meals') }) });
    return h('div', { class: 'upcoming' }, rows.map((r) => h('button', { type: 'button', class: 'up-row', style: '--c:' + PL.config.palette[1].hex, onclick: open('meals', { date: r.date }) },
      h('span', { class: 'up-date' }, D.fmt(r.date, { weekday: 'short' })),
      h('span', { class: 'up-main' }, h('span', { class: 'up-title' }, r.title), h('span', { class: 'sub' }, r.slotLabel)))));
  }

  // id -> { title, action (opens the full screen), render }
  PL.widgetRegistry = {
    today:    { title: 'Today',      screen: 'calendar', params: () => ({ view: 'day', date: D.today() }), render: todayWidget },
    chores:   { title: 'Chores',     screen: 'tasks',    render: () => PL.choresUi.widget() },
    family:   { title: 'People',     screen: 'family',   render: familyWidget },
    week:     { title: 'This week',  screen: 'calendar', params: () => ({ view: 'week', date: D.today() }), render: weekWidget },
    meals:    { title: 'Meals',      screen: 'meals',    render: mealsWidget },
    photos:   { title: 'Photos',     screen: 'photos',   render: () => PL.photosUi.widget() },
    weather:  { title: 'Weather',    render: () => PL.weather.widget() },
    countdowns: { title: 'Countdowns', screen: 'countdowns', render: () => PL.countdownsUi.widget() },
    upcoming: { title: 'Coming up',  screen: 'calendar', params: () => ({ view: 'agenda', date: D.today() }), render: upcomingWidget }
  };

  /* ---------- reminders ---------- */
  function reminderBanner(inst, now) {
    let text;
    if (inst.allDay) text = inst.date === D.key(now) ? 'Today' : 'Tomorrow';
    else {
      const mins = Math.round((D.at(inst.date, inst.start).getTime() - now.getTime()) / 60000);
      text = mins > 59 ? 'In ' + Math.round(mins / 60) + ' h' : mins > 0 ? 'In ' + mins + ' min' : 'Now';
    }
    return h('button', { type: 'button', class: 'reminder', style: '--c:' + PL.cal.color(inst), onclick: () => PL.eventUi.openDetail(inst) },
      icon('bell'), h('span', { class: 'reminder-text' }, h('strong', {}, inst.title), h('span', {}, text + (inst.allDay ? '' : ' · ' + PL.cal.rangeLabel(inst)))));
  }

  /* ---------- screen ---------- */
  PL.screens.home = {
    mount(root) {
      const el = h('div', { class: 'home' });
      root.append(el);
      let renderedDay = D.today(), timeEl = null, dateEl = null, timer = null;

      function tickClock() {
        const now = new Date();
        if (timeEl) timeEl.textContent = timeText(now);
        if (D.key(now) !== renderedDay) render();
      }

      function render() {
        const now = new Date();
        renderedDay = D.key(now);
        const state = PL.state;
        const hour = now.getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        timeEl = h('div', { class: 'clock-time' }, timeText(now));
        dateEl = h('div', { class: 'clock-date' }, D.fmt(renderedDay, { weekday: 'long', month: 'long', day: 'numeric' }));

        const top = h('header', { class: 'home-top' },
          h('div', { class: 'clock' }, h('div', { class: 'greeting' }, greeting), timeEl, dateEl),
          h('div', { class: 'quick btn-row' }, ui.button('Wall mode', { big: true, icon: 'expand', onClick: () => PL.photos.openWall('wall') }), ui.button('Add event', { variant: 'primary', big: true, icon: 'plus', onClick: newEvent() })));

        const reminders = PL.cal.dueReminders(now);
        const remBox = reminders.length ? h('div', { class: 'reminders', role: 'status' }, reminders.map((r) => reminderBanner(r, now))) : null;

        const fresh = !state.members.length && !state.events.length;
        const welcome = fresh && state.ready ? h('section', { class: 'welcome card' },
          h('h2', {}, 'Welcome to ' + PL.config.appName),
          h('p', {}, 'Start by adding the people you live with. Everyone gets a color, so you can see at a glance who needs to be where.'),
          h('div', { class: 'btn-row' },
            ui.button('Add people', { variant: 'primary', big: true, icon: 'users', onClick: open('family', { add: true }) }),
            ui.button('Try a sample family', { big: true, icon: 'sparkle', onClick: async () => { if (await PL.data.loadSample()) ui.toast('Sample family added. You can remove it in Settings.'); } }))) : null;

        const grid = h('div', { class: 'widget-grid' }, state.device.widgets.filter((w) => w.visible && PL.widgetRegistry[w.id]).map((w) => {
          const def = PL.widgetRegistry[w.id];
          return h('section', { class: 'widget size-' + w.size, 'data-w': w.id, 'aria-label': def.title },
            h('div', { class: 'widget-head' }, h('h2', {}, def.title),
              def.screen ? h('button', { type: 'button', class: 'link-btn', onclick: open(def.screen, def.params ? def.params() : undefined) }, 'Open', icon('right')) : null),
            def.render());
        }));

        el.replaceChildren(...[top, remBox, welcome, grid].filter(Boolean));
      }

      render();
      timer = setInterval(tickClock, 15000);
      return { update: render, destroy() { clearInterval(timer); } };
    }
  };
})();

