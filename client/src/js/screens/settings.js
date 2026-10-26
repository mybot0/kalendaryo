/*
 * screens/settings.js — household settings (shared), this-device settings, data tools, about.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, ui = PL.ui, C = PL.config;

  const section = (title, intro, ...kids) => h('section', { class: 'card settings-card' }, h('h2', {}, title), intro ? h('p', { class: 'sub' }, intro) : null, ...kids);

  // Spread cards over 1, 2 or 3 columns (by width), each card going under the shortest column so far.
  // Cards keep their order reading left to right, top to bottom, and the columns end at nearly the same height.
  function bestSplit(heights, n) {
    const N = heights.length, gap = 16;
    if (n === 1) return heights.map(() => 0);
    let best = null, bestScore = Infinity;
    const a = Array(N).fill(0);
    const count = n ** N;
    for (let code = 0; code < count; code++) {
      let x = code;
      for (let i = 0; i < N; i++) { a[i] = x % n; x = Math.floor(x / n); }
      if (a[0] !== 0) continue;                     // Household always starts top left
      const tall = Array(n).fill(-gap), used = Array(n).fill(0);
      let order = 0;
      for (let i = 0; i < N; i++) { tall[a[i]] += heights[i] + gap; used[a[i]]++; order += a[i] * (N - i); }
      if (used.some((u) => u === 0)) continue;      // no empty columns
      const score = (Math.max(...tall) - Math.min(...tall)) + order * 0.5;
      if (score < bestScore) { bestScore = score; best = a.slice(); }
    }
    return best || heights.map((_, i) => i % n);
  }

  function balancedColumns() {
    const wrap = h('div', { class: 'settings-cols' });
    let cards = [], lastW = 0, ro = null, timer = null;
    function lay() {
      const w = wrap.clientWidth;
      if (!w || !cards.length) return;
      lastW = w;
      const n = w >= 1120 ? 3 : w >= 700 ? 2 : 1;
      const cols = Array.from({ length: n }, () => h('div', { class: 'settings-col' }));
      // Measure each card at column width first, then place it under the shortest column.
      const probe = h('div', { class: 'settings-col settings-probe', style: 'width:' + ((w - (n - 1) * 16) / n) + 'px' });
      wrap.replaceChildren(probe);
      const heights = cards.map((c) => { probe.append(c); return c.offsetHeight; });
      // Try every way to split the cards into columns (keeping their order inside each
      // column) and keep the split whose columns end closest to the same height.
      // Then each column stretches its cards a little so all bottoms line up.
      const pick = bestSplit(heights, n);
      cards.forEach((c, i) => cols[pick[i]].append(c));
      wrap.classList.toggle('even', n > 1);
      wrap.replaceChildren(...cols);
    }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - lastW) > 2) { clearTimeout(timer); timer = setTimeout(lay, 60); } });
      ro.observe(wrap);
    }
    return {
      wrap,
      set(list) { cards = list; requestAnimationFrame(lay); lay(); }
    };
  }

  PL.screens.settings = {
    mount(root) {
      const el = h('div', { class: 'screen-page settings' });
      root.append(el);
      const masonry = balancedColumns();

      function render() {
        const S = PL.state.settings, dev = PL.state.device;

        /* household (shared by everyone) */
        const nameIn = h('input', { type: 'text', maxlength: 40, value: S.householdName || '' });
        nameIn.addEventListener('change', () => PL.store.saveSettings({ householdName: nameIn.value.trim() || C.householdDefaults.householdName }));
        const weekStart = ui.segmented([{ value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }], S.weekStart, (v) => PL.store.saveSettings({ weekStart: Number(v) }), 'Week starts on');
        const clock = ui.segmented([{ value: 'true', label: '12-hour' }, { value: 'false', label: '24-hour' }], String(S.hour12 !== false), (v) => PL.store.saveSettings({ hour12: v === 'true' }), 'Clock');
        const starsToggle = ui.toggle('Stars and rewards', S.starsOn !== false, async (on) => {
          if (await PL.pin.require('Enter the PIN to change this.')) PL.store.saveSettings({ starsOn: on }); else render();
        });
        const household = section('Household', 'Shared by everyone using this calendar.',
          ui.field('Family name', nameIn), ui.field('Week starts on', weekStart.el), ui.field('Clock', clock.el), starsToggle.el);

        /* parent PIN */
        const pinOn = PL.pin.isSet();
        const pinCard = section('Parent PIN', 'Keeps little fingers out of chore, routine and reward settings, and asks before stars are spent. It is a convenience, not real security: anyone who can open this page can get around it.',
          h('p', {}, pinOn ? 'A PIN is set.' : 'No PIN is set.'),
          h('div', { class: 'btn-row' },
            ui.button(pinOn ? 'Change PIN' : 'Set a PIN', { icon: 'edit', onClick: async () => { if (await PL.pin.change()) ui.toast('PIN saved.'); } }),
            pinOn ? ui.button('Lock now', { icon: 'eyeoff', onClick: () => { PL.pin.lockNow(); ui.toast('Locked.'); } }) : null,
            pinOn ? ui.button('Turn off PIN', { variant: 'danger', icon: 'trash', onClick: async () => { if (await PL.pin.remove()) ui.toast('PIN turned off.'); } }) : null));

        /* weather */
        const wxUnit = ui.segmented([{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }], S.tempUnit === 'f' ? 'f' : 'c', (v) => PL.store.saveSettings({ tempUnit: v }), 'Temperature');
        const wxCard = section('Weather', 'Shown on Home. Uses the free Open-Meteo service and needs the internet.',
          h('p', {}, S.weatherPlace ? 'Place: ' + S.weatherPlace.name : 'No place chosen.'),
          h('div', { class: 'btn-row' }, ui.button(S.weatherPlace ? 'Change place' : 'Choose a place', { icon: 'pin', onClick: () => PL.weather.openPlace() }),
            S.weatherPlace ? ui.button('Remove place', { variant: 'danger', icon: 'trash', onClick: () => PL.store.saveSettings({ weatherPlace: null }) }) : null),
          ui.field('Temperature', wxUnit.el));

        /* this device */
        const text = ui.segmented(C.textScales, dev.textScale, (v) => PL.store.setDevice({ textScale: Number(v) }), 'Text size');
        const view = ui.segmented(C.calendarViews, dev.defaultView, (v) => PL.store.setDevice({ defaultView: v }), 'Starting calendar view');
        const motion = ui.toggle('Reduce motion', dev.reduceMotion, (v) => PL.store.setDevice({ reduceMotion: v }));
        const notify = ui.toggle('Event reminders on this device', !!dev.notify, async (v) => { if (v) await PL.notify.enable(); PL.store.setDevice({ notify: v }); if (v) ui.toast(PL.notify.canPopup() ? 'Reminders are on.' : 'Reminders are on, shown inside the page. Allow notifications in your browser to also get pop-ups.'); });
        const hide = PL.state.members.length ? h('div', { class: 'toggle-list' }, PL.state.members.map((m) => {
          const hidden = (dev.hiddenMembers || []).includes(m.id);
          const t = ui.toggle(m.name, !hidden, (on) => {
            const set = new Set(PL.state.device.hiddenMembers || []);
            on ? set.delete(m.id) : set.add(m.id);
            PL.store.setDevice({ hiddenMembers: [...set] });
          });
          return h('div', { class: 'toggle-row' }, ui.avatar(m, 28), t.el);
        })) : h('p', { class: 'sub' }, 'Add family members to choose who is shown.');
        const device = section('This device', 'These only change this screen, not other devices.',
          ui.field('Text size', text.el), ui.field('Starting calendar view', view.el), motion.el, notify.el,
          h('p', { class: 'hint' }, 'Reminders only appear while Kalendaryo is open.'),
          h('h3', { class: 'mini-h' }, 'Show on the calendar'), hide);

        /* home layout */
        const widgets = h('div', { class: 'widget-settings' }, dev.widgets.map((w, i) => {
          const def = PL.widgetRegistry[w.id]; if (!def) return null;
          const move = (d) => { const list = dev.widgets.slice(); const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; PL.store.setDevice({ widgets: list }); };
          const patch = (p) => PL.store.setDevice({ widgets: dev.widgets.map((x, k) => (k === i ? Object.assign({}, x, p) : x)) });
          return h('div', { class: 'ws-row' },
            ui.toggle(def.title, w.visible, (v) => patch({ visible: v })).el,
            ui.select(C.widgetSizes, w.size, (v) => patch({ size: v })),
            ui.iconButton('up', 'Move ' + def.title + ' up', () => move(-1)),
            ui.iconButton('down', 'Move ' + def.title + ' down', () => move(1)));
        }));
        const layout = section('Home screen', 'Choose what shows on Home on this device, and in what order.', widgets);

        /* data */
        const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
        fileIn.addEventListener('change', async () => {
          const f = fileIn.files && fileIn.files[0]; fileIn.value = '';
          if (!f) return;
          const r = await PL.data.readBackup(f);
          if (!r.ok) { ui.toast(r.error); return; }
          const yes = await ui.confirm({ title: 'Restore this backup?', message: 'It has ' + r.counts.members + ' people, ' + r.counts.events + ' events and ' + r.counts.chores + ' chores. Items with the same name are replaced. Nothing else is deleted.', confirmLabel: 'Restore' });
          if (yes && (await PL.data.applyBackup(r.data))) ui.toast('Backup restored.');
        });
        const sampleBtn = PL.data.hasSample()
          ? ui.button('Remove sample data', { variant: 'danger', icon: 'trash', onClick: async () => { if (await ui.confirm({ title: 'Remove the sample family?', message: 'Only the sample people and events are removed. Anything you added stays.', confirmLabel: 'Remove', danger: true })) { await PL.data.removeSample(); ui.toast('Sample data removed.'); } } })
          : ui.button('Add sample family', { icon: 'sparkle', onClick: async () => { if (await PL.data.loadSample()) ui.toast('Sample family added.'); } });
        const icsIn = h('input', { type: 'file', accept: '.ics,text/calendar', hidden: true });
        icsIn.addEventListener('change', async () => {
          const f = icsIn.files && icsIn.files[0]; icsIn.value = '';
          if (f) PL.icsUi.run(f);
        });
        const data = section('Your data', 'Save a copy of everything, bring one back, or add events from a calendar file (.ics).',
          h('div', { class: 'btn-row' }, ui.button('Save a backup', { icon: 'download', onClick: () => PL.data.saveBackup() }), ui.button('Restore a backup', { icon: 'upload', onClick: () => fileIn.click() }), ui.button('Import calendar file', { icon: 'calendar', onClick: () => icsIn.click() }), sampleBtn), fileIn, icsIn);

        /* about */
        const st = PL.state;
        const about = section(PL.config.appName, 'Version ' + C.version,
          h('p', {}, st.live ? 'Shared and up to date.' : st.fromCache ? 'Showing the last saved copy. Waiting to reconnect.' : 'Not connected to the shared database.'),
          h('p', { class: 'sub' }, 'Not possible on this page: syncing with outside calendars, offline install, and turning the screen on or off. Those need a native app.'));

        // Cards in a sensible order: the family, then screens, then data. They are spread over
        // balanced columns (each card goes under the shortest column), so there are no big gaps.
        const cards = [household, pinCard, wxCard, device, layout, PL.wall.card(), data, about];
        el.replaceChildren(h('header', { class: 'page-head' }, h('h1', {}, 'Settings')), masonry.wrap);
        masonry.set(cards);
      }
      render();
      return { update: () => { const a = document.activeElement; if (!(a && el.contains(a) && a.type === 'text')) render(); }, destroy() {} };
    }
  };
})();

