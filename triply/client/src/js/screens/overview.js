/*
 * overview.js — the trip's front page: dates, "what is happening next?", who is going.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, cfg = TR.config, icon = TR.icon;

  function countdown(t) {
    const today = D.today();
    if (!t.start_date) return '';
    if (t.end_date && t.end_date < today) return 'Trip finished';
    if (t.start_date > today) { const n = D.diff(today, t.start_date); return n === 1 ? 'Starts tomorrow' : 'Starts in ' + TR.plural(n, 'day'); }
    const n = D.diff(t.start_date, today) + 1, total = t.end_date ? D.diff(t.start_date, t.end_date) + 1 : 0;
    return 'Day ' + n + (total ? ' of ' + total : '');
  }

  function mount(root, ctx) {
    const session = ctx.session;

    function render() {
      const t = session.trip(), items = session.items(), today = D.today(), plan = TR.plan;
      const members = session.state.members;
      const next = plan.next(items);
      const now = new Date();
      const upcoming = items.filter((i) => i.start_date && i !== next && D.at(i.start_date, i.start_time || '00:00') >= now)
        .sort((a, b) => (a.start_date + (a.start_time || '')).localeCompare(b.start_date + (b.start_time || ''))).slice(0, 4);
      const todayRows = plan.on(items, today);
      const inTrip = t.start_date && t.end_date && today >= t.start_date && today <= t.end_date;
      const bookings = items.filter((i) => cfg.bookingTypes.includes(i.type)).length;
      const cd = countdown(t);

      const hero = h('section', { class: 'hero' }, TR.tripCover(t),
        h('div', { class: 'hero-body' },
          h('div', { class: 'page-head', style: 'margin:0' }, h('h1', {}, t.name),
            h('div', { class: 'btn-row', style: 'flex-wrap:nowrap' },
              ui.iconButton('search', 'Search this trip', () => TR.go('/trip/' + session.id + '/search')),
              (() => { const n = session.updates().length; const b = ui.iconButton('bell', n ? n + ' updates' : 'Updates', () => TR.go('/trip/' + session.id + '/updates'), 'has-dot'); if (n) b.append(h('span', { class: 'dot-badge' }, n > 99 ? '99+' : String(n))); return b; })(),
              session.can('trip.edit') ? ui.button('Edit', { icon: 'edit', onClick: () => TR.forms.tripSheet({ session }) }) : null)),
          cd ? h('span', { class: 'countdown' }, cd) : null,
          h('div', { class: 'sub' }, [D.range(t.start_date, t.end_date), t.destination].filter(Boolean).join(' · ')),
          t.route.length > 1 ? h('div', { class: 'route', 'aria-label': 'Route' }, t.route.map((r, i) => [i ? icon('right') : null, h('span', {}, r)])) : null,
          t.description ? h('p', { class: 'pre' }, t.description) : null));

      const nextCard = h('section', { class: 'card stack next-card', style: '--c:' + (next ? cfg.types[next.type].color : cfg.neutralColor) },
        h('span', { class: 'next-label' }, inTrip ? 'Today' : 'What is next?'),
        inTrip && todayRows.length ? h('div', { class: 'card-list' }, todayRows.map((r) => plan.card(session, r.item, { role: r.role })))
          : next ? [h('div', { class: 'sub' }, plan.when(next, true)), plan.card(session, next, { role: 'start' })]
          : ui.emptyState({ icon: 'calendar', title: items.length ? 'Nothing coming up' : 'No plans yet', text: items.length ? 'All the plans on this trip are in the past.' : 'Add a flight, a hotel or a restaurant to get started.',
              // A brand-new trip gets the three ways to start; later it is just "Add a plan".
              action: !session.can('items.write') ? null : items.length ? ui.button('Add a plan', { icon: 'plus', variant: 'primary', onClick: () => TR.forms.typePicker(session) })
                : h('div', { class: 'btn-row', style: 'justify-content:center' },
                  ui.button('Upload bookings', { icon: 'sparkle', variant: 'gold', onClick: () => TR.ai.bookings(session) }),
                  ui.button('Build a trip for me', { icon: 'sparkle', onClick: () => TR.ai.plan(session) }),
                  ui.button('Add by hand', { icon: 'plus', variant: 'primary', onClick: () => TR.forms.typePicker(session) })) }),
        inTrip && todayRows.length && next && !todayRows.some((r) => r.item.id === next.id) ? [h('span', { class: 'next-label' }, 'After that'), plan.card(session, next, { role: 'start' })] : null);

      const comingUp = upcoming.length ? h('section', { class: 'card stack' }, h('h2', {}, 'Coming up'),
        h('div', { class: 'card-list' }, upcoming.map((i) => plan.card(session, i, { role: 'start', showDate: true }))),
        h('button', { type: 'button', class: 'link-btn', onclick: () => TR.go('/trip/' + session.id + '/itinerary') }, 'Full itinerary', icon('right'))) : null;

      const crew = h('section', { class: 'card stack' }, h('h2', {}, 'Travelers'),
        h('div', { class: 'traveler-row' }, members.map((m) => h('span', { class: 'person-chip' }, ui.avatar(m, 28), m.name))),
        h('div', { class: 'btn-row' }, session.can('invites.manage') ? ui.button('Invite people', { icon: 'plus', onClick: () => TR.go('/trip/' + session.id + '/people') }) : ui.button('See everyone', { onClick: () => TR.go('/trip/' + session.id + '/people') })));

      const unread = session.unreadTotal();
      const stats = h('div', { class: 'stat-row' },
        h('button', { type: 'button', class: 'stat', onclick: () => TR.go('/trip/' + session.id + '/itinerary') }, h('b', {}, items.length), h('span', {}, 'Plans')),
        h('button', { type: 'button', class: 'stat', onclick: () => TR.go('/trip/' + session.id + '/bookings') }, h('b', {}, bookings), h('span', {}, 'Bookings')),
        h('button', { type: 'button', class: 'stat', onclick: () => TR.go('/trip/' + session.id + '/chat') }, h('b', {}, unread), h('span', {}, 'Unread')));

      root.replaceChildren(h('div', { class: 'stack' }, hero,
        h('div', { class: 'overview-grid' }, h('div', { class: 'stack' }, nextCard, comingUp), h('div', { class: 'stack' }, stats, crew))));
    }
    render();
    const off = session.on((k) => { if (k === 'state' || k === 'unread') render(); });
    return { destroy: off };
  }

  TR.screens = TR.screens || {};
  TR.screens.overview = { mount };
})();
