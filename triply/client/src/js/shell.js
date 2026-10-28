/*
 * shell.js — the page frame (side rail on wide screens, bottom bar on phones) and the router.
 * Addresses live after the # so the server never has to know about them:
 *   #/                       My Trips            #/settings         this device
 *   #/t/<token>              a personal link     #/join/<code>      an invitation
 *   #/trip/<id>/<screen>     inside a trip: overview, itinerary, bookings, chat, people
 */
(function () {
  const TR = window.TR;
  const h = TR.h, icon = TR.icon;

  const TRIP_SCREENS = [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'itinerary', label: 'Itinerary', icon: 'calendar' },
    { id: 'bookings', label: 'Bookings', icon: 'ticket', more: true },
    { id: 'expenses', label: 'Costs', icon: 'cart' },
    { id: 'chat', label: 'Chat', icon: 'chat' },
    { id: 'packing', label: 'Packing', icon: 'bag', more: true },
    { id: 'files', label: 'Files', icon: 'file', more: true },
    { id: 'search', label: 'Search', icon: 'search', more: true },
    { id: 'updates', label: 'Updates', icon: 'bell', more: true },
    { id: 'people', label: 'People', icon: 'users', more: true }
  ];
  const HOME_SCREENS = [
    { id: '', label: 'My Trips', icon: 'bag' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];

  let main, nav, banner, railTop, current = null, offSession = null;

  TR.go = function (path, replace) {
    const target = '#' + path;
    if (replace) location.replace(target); else if (location.hash === target) route(); else location.hash = target;
  };

  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { name: 'trips' };
    if (parts[0] === 'settings') return { name: 'device' };
    if (parts[0] === 't' && parts[1]) return { name: 'token', token: parts[1] };
    if (parts[0] === 'join' && parts[1]) return { name: 'join', code: parts[1] };
    if (parts[0] === 'trip' && parts[1]) return { name: 'trip', id: parts[1], screen: TRIP_SCREENS.some((s) => s.id === parts[2]) ? parts[2] : 'overview' };
    return { name: 'trips' };
  }

  function teardown() {
    if (current && current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = null;
    if (offSession) { offSession(); offSession = null; }
    main.classList.remove('chat-mode');
  }

  function setRail(mode, r, session) {
    const items = mode === 'trip' ? TRIP_SCREENS : mode === 'home' ? HOME_SCREENS : [];
    nav.replaceChildren(...items.map((s) => {
      const on = mode === 'trip' ? r.screen === s.id : (r.name === 'device') === (s.id === 'settings');
      const unread = mode === 'trip' && session && session.state ? (s.id === 'chat' ? session.unreadTotal() : s.id === 'updates' ? session.updates().length : 0) : 0;
      return h('button', { type: 'button', class: 'nav-btn' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null,
        onclick: () => TR.go(mode === 'trip' ? '/trip/' + r.id + '/' + s.id : '/' + s.id) },
        icon(s.icon), h('span', { class: 'nav-label' }, s.label), unread ? h('span', { class: 'nav-badge', 'aria-label': unread + ' unread' }, unread > 99 ? '99+' : String(unread)) : null);
    }).map((b, i) => { if (mode === 'trip' && items[i].more) b.classList.add('more-item'); return b; }));
    if (mode === 'trip') {
      // On phones four tabs fit; the rest live behind "More".
      const inMore = items.some((s) => s.more && s.id === r.screen);
      const news = session && session.state ? session.updates().length : 0;
      nav.append(h('button', { type: 'button', class: 'nav-btn more-btn' + (inMore ? ' on' : ''), onclick: () => moreMenu(r, session) }, icon('dots'), h('span', { class: 'nav-label' }, 'More'), news ? h('span', { class: 'nav-badge' }, news > 99 ? '99+' : String(news)) : null));
    }
    nav.hidden = !items.length;
    railTop.replaceChildren();
    if (mode === 'trip') {
      railTop.append(h('div', { class: 'rail-back' }, h('button', { type: 'button', class: 'link-btn', onclick: () => TR.go('/') }, icon('left'), 'My Trips')));
      if (session && session.state) railTop.append(h('div', { class: 'rail-sub' }, h('b', {}, session.trip().name), h('span', {}, TR.D.range(session.trip().start_date, session.trip().end_date))));
    }
  }

  function moreMenu(r, session) {
    const s = TR.ui.sheet({ title: 'More', body: h('div', { class: 'choices' }, TRIP_SCREENS.filter((x) => x.more).map((x) =>
      h('button', { type: 'button', class: 'choice', onclick: () => { s.close(); TR.go('/trip/' + r.id + '/' + x.id); } }, h('strong', {}, x.label + (x.id === 'updates' && session && session.state && session.updates().length ? ' (' + session.updates().length + ')' : ''))))) });
  }

  function banner_(session) {
    const msg = session && !session.online && session.state ? 'You are offline. Showing the last loaded copy; changes cannot be saved until you reconnect.' : '';
    banner.textContent = msg; banner.hidden = !msg;
  }

  function placeholder(text) { main.replaceChildren(h('p', { class: 'loading' }, text)); }

  function denied(r, session) {
    const msg = session && session.error ? session.error : 'This device no longer has a working link to this trip.';
    main.replaceChildren(h('div', { class: 'center-page' }, h('div', { class: 'card stack' }, h('h2', {}, 'Cannot open this trip'), h('p', { class: 'sub' }, msg),
      TR.ui.button('Go to My Trips', { variant: 'primary', big: true, onClick: () => { TR.closeTrip(); TR.go('/'); } }))));
    setRail('none', r);
  }

  function route() {
    const r = parse();
    teardown();
    banner.hidden = true;
    window.scrollTo(0, 0);
    if (r.name !== 'trip') TR.closeTrip();

    if (r.name === 'trip') {
      const session = TR.openTrip(r.id);
      let mounted = false;
      const show = () => {
        if (session.status === 'denied') { mounted = false; return denied(r, session); }
        if (session.status === 'error' && !session.state) { main.replaceChildren(h('div', { class: 'center-page' }, h('div', { class: 'card stack' }, h('h2', {}, 'Cannot reach Triply'), h('p', { class: 'sub' }, session.error), TR.ui.button('Try again', { variant: 'primary', big: true, onClick: () => { session.refresh().then(show); } })))); return; }
        if (!session.state) return placeholder('Opening your trip…');
        setRail('trip', r, session);
        banner_(session);
        if (!mounted) {
          mounted = true;
          main.replaceChildren();
          main.dataset.screen = r.screen; // lets cozy.css color each section
          current = TR.screens[r.screen].mount(main, { session, route: r });
          document.title = session.trip().name + ' · ' + TR.config.appName;
          main.focus({ preventScroll: true });
        }
      };
      offSession = session.on((kind) => {
        if (kind === 'status') show();
        else if (kind === 'state' || kind === 'unread') { if (!mounted) show(); else { setRail('trip', r, session); banner_(session); } }
      });
      setRail('trip', r, session);
      show();
      return;
    }
    const mode = r.name === 'trips' || r.name === 'device' ? 'home' : 'none';
    setRail(mode, r);
    document.title = (r.name === 'device' ? 'Settings · ' : '') + TR.config.appName;
    main.dataset.screen = r.name;
    current = TR.screens[r.name === 'trips' ? 'trips' : r.name].mount(main, r);
    main.focus({ preventScroll: true });
  }

  function build(root) {
    banner = h('div', { class: 'status-banner', role: 'status', hidden: true });
    main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
    nav = h('nav', { class: 'nav', 'aria-label': 'Main' });
    railTop = h('div', {});
    const brand = h('button', { type: 'button', class: 'brand', 'aria-label': 'Triply – My Trips', style: 'border:0;background:none;text-align:left;cursor:pointer', onclick: () => TR.go('/') },
      icon('send'), h('span', { class: 'brand-text' }, h('span', { class: 'brand-name' }, TR.config.appName), h('span', { class: 'brand-tag' }, TR.config.tagline)));
    root.replaceChildren(h('div', { class: 'app' }, h('aside', { class: 'rail' }, brand, railTop, nav), h('div', { class: 'content' }, banner, main)));
    window.addEventListener('hashchange', route);
    window.addEventListener('online', () => { const s = TR.currentTrip(); if (s) s.refresh(); });
  }

  TR.shell = { build, route };
})();
