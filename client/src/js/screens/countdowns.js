/*
 * screens/countdowns.js — days until the things the family is looking forward to.
 *   countdowns/{id}  { title, date, emoji, yearly }
 * A yearly countdown (a birthday, a holiday) always points at the next one.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, D = PL.D, ui = PL.ui;
  const EMOJI = ['🎉', '🎂', '🎄', '✈️', '🏖️', '🏫', '🎃', '❤️', '⭐', '🏠', '⚽', '🎁'];

  // The date a countdown points at: itself, or the next time it comes round.
  function target(c, today) {
    if (!c.yearly) return c.date;
    const [, m, d] = c.date.split('-').map(Number);
    const year = Number(today.slice(0, 4));
    const make = (y) => y + '-' + D.pad(m) + '-' + D.pad(Math.min(d, D.daysInMonth(y, m - 1)));
    const t = make(year);
    return t >= today ? t : make(year + 1);
  }
  function daysLeft(c, today) { return D.diff(today || D.today(), target(c, today || D.today())); }
  function label(n) { return n === 0 ? 'Today!' : n === 1 ? 'Tomorrow' : n > 0 ? n + ' days' : Math.abs(n) === 1 ? 'Yesterday' : Math.abs(n) + ' days ago'; }

  function sorted() {
    const today = D.today();
    return PL.state.countdowns.map((c) => ({ c, n: daysLeft(c, today) })).sort((a, b) => (a.n < 0) - (b.n < 0) || (a.n >= 0 ? a.n - b.n : b.n - a.n));
  }

  function openForm(c) {
    let emoji = c ? c.emoji : EMOJI[0], yearly = c ? c.yearly : false;
    const title = h('input', { type: 'text', maxlength: '60', placeholder: 'For example: Beach trip', autocomplete: 'off', autofocus: true });
    title.value = c ? c.title : '';
    const date = h('input', { type: 'date' });
    date.value = c ? c.date : D.addDays(D.today(), 30);
    const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Picture' });
    const paint = () => grid.replaceChildren(...EMOJI.map((e) => h('button', { type: 'button', role: 'radio', class: 'avatar-opt' + (e === emoji ? ' on' : ''), 'aria-checked': e === emoji ? 'true' : 'false', 'aria-label': e, onclick: () => { emoji = e; paint(); } }, e)));
    paint();
    const tog = ui.toggle('Every year', yearly, (v) => { yearly = v; });
    async function save() {
      const t = title.value.trim();
      if (!t) { ui.toast('Please type a name first.'); title.focus(); return; }
      if (!date.value) { ui.toast('Please pick a date.'); date.focus(); return; }
      const data = { title: t, date: date.value, emoji, yearly };
      const ok = c ? await PL.store.set('countdowns', c.id, data) : !!(await PL.store.add('countdowns', data));
      if (ok) { s.close(); ui.toast('Saved.'); }
    }
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button(c ? 'Save' : 'Add countdown', { variant: 'primary', big: true, onClick: save })];
    if (c) footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: async () => { if (await ui.confirm({ title: 'Delete this countdown?', message: '“' + c.title + '” will be removed for everyone.', confirmLabel: 'Delete', danger: true }) && await PL.store.del('countdowns', c.id)) { s.close(); ui.toast('Deleted.'); } } }));
    const s = ui.sheet({ title: c ? 'Edit countdown' : 'New countdown', footer,
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('Name', title), ui.field('Date', date), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Picture'), grid), tog.el) });
  }

  function widget() {
    const rows = sorted().filter((x) => x.n >= 0).slice(0, 4);
    if (!rows.length) return ui.emptyState({ icon: 'cake', title: 'Nothing to count down to', text: 'Add a trip, a birthday or a holiday.', action: ui.button('Add countdown', { icon: 'plus', onClick: () => openForm(null) }) });
    return h('div', { class: 'stack' }, rows.map(({ c, n }) => h('button', { type: 'button', class: 'cd-row', onclick: () => openForm(c) },
      h('span', { class: 'cd-emoji' }, c.emoji || '🎉'), h('span', { class: 'cd-title' }, c.title), h('span', { class: 'cd-count' }, label(n)))));
  }

  PL.countdownsUi = { widget, daysLeft, openForm };

  PL.screens.countdowns = {
    mount(root) {
      const el = h('div', { class: 'screen-page countdowns' });
      root.append(el);
      function render() {
        const all = sorted();
        el.replaceChildren(
          h('header', { class: 'page-head' }, h('h1', {}, 'Countdowns'), ui.button('New countdown', { variant: 'primary', big: true, icon: 'plus', onClick: () => openForm(null) })),
          all.length
            ? h('div', { class: 'cd-grid' }, all.map(({ c, n }) => h('button', { type: 'button', class: 'cd-card', onclick: () => openForm(c), 'aria-label': c.title + ', ' + label(n) },
                h('span', { class: 'cd-emoji' }, c.emoji || '🎉'), h('span', { class: 'cd-num' }, n === 0 ? 'Today!' : Math.abs(n)), h('span', { class: 'sub' }, n === 0 ? '' : n > 0 ? (n === 1 ? 'day to go' : 'days to go') : (Math.abs(n) === 1 ? 'day ago' : 'days ago')),
                h('span', { class: 'cd-title' }, c.title), h('span', { class: 'sub' }, D.fmt(target(c, D.today()), { month: 'short', day: 'numeric', year: 'numeric' })))))
            : ui.emptyState({ icon: 'cake', title: 'Nothing to count down to', text: 'Count the days to a trip, a birthday, the last day of school or a holiday.', action: ui.button('Add the first one', { icon: 'plus', onClick: () => openForm(null) }) }));
      }
      render();
      return { update: render, destroy() {} };
    }
  };
})();
