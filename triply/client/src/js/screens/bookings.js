/*
 * bookings.js — Reservations: every flight, hotel, car, cruise and restaurant with its confirmation number.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, cfg = TR.config, icon = TR.icon;

  function mount(root, ctx) {
    const session = ctx.session;
    function render() {
      const items = session.items();
      const groups = cfg.bookingTypes.map((type) => ({ type, list: items.filter((i) => i.type === type).sort((a, b) => ((a.start_date || '') + (a.start_time || '')).localeCompare((b.start_date || '') + (b.start_time || ''))) })).filter((g) => g.list.length);
      const head = h('div', { class: 'page-head' }, h('h1', {}, 'Reservations'),
        session.can('items.write') ? h('div', { class: 'btn-row' }, ui.button('Add bookings for me', { icon: 'sparkle', variant: 'gold', onClick: () => TR.ai.bookings(session) }), ui.button('Add', { icon: 'plus', variant: 'primary', onClick: () => TR.forms.typePicker(session) })) : null);
      if (!groups.length) {
        return root.replaceChildren(head, h('div', { class: 'card' }, ui.emptyState({ icon: 'ticket', title: 'No reservations yet', text: 'Flights, hotels, car rentals, cruises and restaurant bookings show up here with their confirmation numbers.',
          action: session.can('items.write') ? h('div', { class: 'btn-row' }, ui.button('Upload a booking', { icon: 'sparkle', variant: 'gold', onClick: () => TR.ai.bookings(session) }), ui.button('Add by hand', { icon: 'plus', onClick: () => TR.forms.typePicker(session) })) : null })));
      }
      root.replaceChildren(head, ...groups.map((g) => {
        const T = cfg.types[g.type];
        return h('section', { class: 'book-group' }, h('h2', { style: 'margin-bottom:8px' }, T.label + 's'),
          h('div', { class: 'card-list' }, g.list.map((i) => h('button', { type: 'button', class: 'book-card', onclick: () => TR.plan.detail(session, i.id) },
            h('span', { class: 'tp-ic', style: '--c:' + T.color }, icon(T.icon)),
            h('span', { class: 'book-main' }, h('b', {}, i.title), h('span', { class: 'sub' }, TR.plan.when(i))),
            i.confirmation ? h('span', { class: 'book-conf' }, h('small', {}, 'Confirmation'), i.confirmation) : h('span', { class: 'book-conf missing' }, 'No number yet')))));
      }));
    }
    render();
    const off = session.on((k) => { if (k === 'state') render(); });
    return { destroy: off };
  }

  TR.screens = TR.screens || {};
  TR.screens.bookings = { mount };
})();
