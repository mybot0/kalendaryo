/*
 * shell.js — page frame, navigation (side rail on wide screens, bottom bar on phones),
 * status notice, and PL.nav.go(screen, params).
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon;
  let main, nav, banner, current = null, currentId = null, navButtons = {};

  function go(id, params) {
    if (!PL.screens[id]) id = 'home';
    if (current && current.destroy) current.destroy();
    main.replaceChildren();
    currentId = id;
    main.dataset.screen = id; // lets cozy.css color each section
    current = PL.screens[id].mount(main, params || {});
    Object.keys(navButtons).forEach((k) => {
      const on = k === id;
      navButtons[k].classList.toggle('on', on);
      if (on) navButtons[k].setAttribute('aria-current', 'page'); else navButtons[k].removeAttribute('aria-current');
    });
    main.scrollTop = 0; window.scrollTo(0, 0);
    if (PL.config.screens.find((s) => s.id === id && s.ready)) PL.storage.set('lastScreen', id);
    document.title = (id === 'home' ? '' : PL.config.screens.find((s) => s.id === id).label + ' · ') + PL.config.appName;
  }

  function status() {
    const s = PL.state;
    let msg = '';
    if (!s.available && s.ready) msg = 'Not connected to the shared database. Changes cannot be saved from this view.';
    else if (!s.online) msg = 'You are offline. Showing the last saved copy.';
    else if (s.fromCache && s.ready) msg = 'Loading the latest from your family…';
    banner.textContent = msg;
    banner.hidden = !msg;
  }

  function build(root) {
    banner = h('div', { class: 'status-banner', role: 'status', hidden: true });
    main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
    nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, PL.config.screens.filter((s) => !s.hidden).map((s) => {
      const b = h('button', { type: 'button', class: 'nav-btn' + (s.ready ? '' : ' soon'), onclick: () => go(s.id) },
        icon(s.icon), h('span', { class: 'nav-label' }, s.label));
      navButtons[s.id] = b;
      return b;
    }));
    const brand = h('div', { class: 'brand', 'aria-hidden': 'true' }, icon('calendar'), h('span', { class: 'brand-text' }, h('span', { class: 'brand-name' }, PL.config.appName), h('span', { class: 'brand-tag' }, PL.config.tagline)));
    root.replaceChildren(h('div', { class: 'app' }, h('aside', { class: 'rail' }, brand, nav), h('div', { class: 'content' }, banner, main)));
    PL.store.subscribe(() => { status(); if (current && current.update) current.update(); });
  }

  PL.nav = { go, current: () => currentId };
  PL.shell = { build, status };
})();

