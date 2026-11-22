/*
 * landing.js — web version only. The start page (create a hub or a trip) and the join page (invite links).
 * The questions for a new hub are in setup.js.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, ui = PL.ui;
  const ROLE_TEXT = { viewer: 'a Viewer (can look)', editor: 'an Editor (can add and change things)', owner: 'an Owner (can also invite people)' };

  function field(label, input) { return ui.field(label, input); }
  function errorBox() { return h('p', { class: 'form-error', role: 'alert', hidden: true }); }
  const showErr = (el, msg) => { el.textContent = msg; el.hidden = !msg; };

  /* ---------- TOUCH POINT B: the home / trip choice (only when the server says Triply is on) ---------- */
  const TRIPLY_BASE = '/triply';
  const PLANE = '<svg viewBox="0 0 64 64" width="26" height="26" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M12 33l40-17-13 33-9-13z"/></svg>';
  function pickForm(go, kind, ic, kicker, title, sub, you, label2, input2, err, btn, extra, more) {
    return h('form', { class: 'card land-pick land-pick-' + kind, onsubmit: go },
      h('div', { class: 'land-pick-head' }, ic, h('div', {}, h('span', { class: 'land-kicker' }, kicker), h('h2', {}, title))),
      h('p', { class: 'land-pick-sub' }, sub),
      field('Your name', you), field(label2, input2), ...(more || []), err, btn,
      h('p', { class: 'hint' }, 'You get your own private link. No account needed.', extra || ''));
  }
  function tripCard() {
    const you = h('input', { type: 'text', maxlength: '30', placeholder: 'For example: ' + PL.examples.name(), autocomplete: 'given-name' });
    const trip = h('input', { type: 'text', maxlength: '60', placeholder: 'For example: ' + PL.examples.trip(), autocomplete: 'off' });
    const from = h('input', { type: 'date', 'aria-label': 'First day' });
    const to = h('input', { type: 'date', 'aria-label': 'Last day' });
    from.addEventListener('change', () => { if (from.value && (!to.value || to.value < from.value)) to.value = from.value; to.min = from.value; });
    const dates = h('div', { class: 'land-dates' }, from, h('span', { 'aria-hidden': 'true' }, '–'), to);
    const err = errorBox();
    const btn = ui.button('Create your trip', { variant: 'primary', big: true, icon: 'plus', type: 'submit', block: true });
    async function go(e) {
      e.preventDefault();
      if (!you.value.trim()) { showErr(err, 'Please type your name.'); you.focus(); return; }
      if (!from.value) { showErr(err, 'Please pick the first day of the trip.'); from.focus(); return; }
      btn.disabled = true; showErr(err, '');
      try {
        const r = await fetch(TRIPLY_BASE + '/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ name: trip.value.trim() || 'Our trip', start_date: from.value, end_date: to.value || from.value, owner: { name: you.value.trim() } }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.link) throw new Error((j.error && j.error.message) || 'Could not start your trip. Please try again.');
        location.href = j.link;
      } catch (x) { showErr(err, x.message === 'Failed to fetch' ? 'Could not reach Triply. Check your internet and try again.' : x.message); btn.disabled = false; }
    }
    const ic = h('span', { class: 'land-pick-ic' }); ic.innerHTML = PLANE;
    return pickForm(go, 'trip', ic, 'Triply by Kalendaryo', 'Plan a trip', 'One itinerary, every booking and a group chat for everyone going.', you, 'Trip name', trip, err, btn,
      null, [field('Dates', dates)]);
  }
  async function tripsCard() {
    let saved = [];
    try { saved = (JSON.parse(localStorage.getItem('tr.trips') || '[]') || []).filter((x) => x && x.token && x.tripId); } catch (e) { saved = []; }
    if (!saved.length) return null;
    let trips = [];
    try {
      const r = await fetch(TRIPLY_BASE + '/api/my-trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: saved.map((x) => x.token) }) });
      if (r.ok) trips = ((await r.json()).trips || []).map((t) => Object.assign({ saved: saved[t.i] }, t));
    } catch (e) { /* offline: show nothing */ }
    if (!trips.length) return null;
    const forget = (tripId) => {
      try { localStorage.setItem('tr.trips', JSON.stringify(saved.filter((x) => x.tripId !== tripId))); } catch (e) { /* fine */ }
      render();
    };
    return h('section', { class: 'card land-card land-trips' }, h('h2', {}, 'Your trips on this device'),
      h('div', { class: 'stack' }, trips.map((t) => {
        const ic = h('span', { class: 'land-chip-ic' }); ic.innerHTML = PLANE;
        return h('div', { class: 'land-recent' },
          h('a', { class: 'btn soft big land-open land-open-trip', href: TRIPLY_BASE + '/#/trip/' + encodeURIComponent(t.id) + '/overview' }, ic, h('span', {}, t.name + (t.owner_name ? ' · ' + t.owner_name : ''))),
          ui.iconButton('x', 'Forget ' + t.name + ' on this device', () => forget(t.id)));
      })));
  }
  async function lists() {
    const items = [recentCard(), await tripsCard()].filter(Boolean);
    return items.length ? h('div', { class: 'land-lists' + (items.length === 1 ? ' one' : '') }, ...items) : null;
  }
  function recentCard() {
    const list = KAL.recent.all();
    if (!list.length) return null;
    return h('section', { class: 'card land-card' }, h('h2', {}, 'Your hubs on this device'),
      h('div', { class: 'stack' }, list.map((f) => h('div', { class: 'land-recent' },
        h('a', { class: 'btn soft big land-open', href: '/c/' + f.t }, icon('calendar'), h('span', {}, f.name + (f.who ? ' · ' + f.who : ''))),
        ui.iconButton('x', 'Forget ' + f.name + ' on this device', () => { KAL.recent.forget(f.t); render(); })))));
  }

  async function joinCard() {
    const box = h('section', { class: 'card land-card' }, h('p', { class: 'sub' }, 'Checking your invite…'));
    let peek;
    try { peek = await KAL.api('GET', '/api/invites/peek/' + encodeURIComponent(KAL.joinCode)); }
    catch (e) { peek = { valid: false, reason: e.userMessage }; }
    if (!peek.valid) {
      box.replaceChildren(h('h2', {}, 'This invite cannot be used'), h('p', {}, peek.reason), h('a', { class: 'btn soft big', href: '/' }, 'Go to the start page'));
      return box;
    }
    const m = peek.member;
    const name = h('input', { type: 'text', maxlength: '30', placeholder: 'Your name', autocomplete: 'given-name' });
    const err = errorBox();
    const btn = ui.button('Join ' + peek.familyName, { variant: 'primary', big: true, icon: 'users', type: 'submit', block: true });
    async function go(e) {
      e.preventDefault();
      if (!m && !name.value.trim()) { showErr(err, 'Please type your name.'); name.focus(); return; }
      btn.disabled = true; showErr(err, '');
      try {
        const r = await KAL.api('POST', '/api/join', { code: KAL.joinCode, name: m ? m.name : name.value.trim() });
        try { localStorage.setItem('kal.newlink', '1'); } catch (x) { /* fine */ }
        location.replace('/c/' + r.token);
      } catch (x) { showErr(err, x.userMessage); btn.disabled = false; }
    }
    if (m) {
      // The invite was made for someone in the family: their name, color, icon and birthday are ready.
      const bday = m.birthday ? new Date(m.birthday + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
      box.classList.add('join-hi');
      box.replaceChildren(h('form', { class: 'stack join-form', onsubmit: go },
        ui.avatar({ name: m.name, avatar: m.avatar, color: m.color || PL.config.neutralColor }, 88),
        h('h2', {}, 'Hi ' + m.name + '!'),
        h('p', {}, (peek.by ? peek.by + ' invited you to ' : 'You are invited to ') + peek.familyName + '. Your name' + (m.color ? ', color' : '') + (bday ? ' and birthday are' : ' is') + ' already set.'),
        h('p', { class: 'join-meta' }, m.color ? h('span', { class: 'join-dot', style: 'background:' + m.color }) : null, m.color ? 'Your color' : null, bday ? ' · 🎂 ' + bday : null),
        h('p', { class: 'sub' }, 'You will join as ' + ROLE_TEXT[peek.role] + '.'),
        err, btn, h('p', { class: 'hint' }, 'Not ' + m.name + '? Ask ' + (peek.by || 'the person who sent it') + ' for a new link.')));
      return box;
    }
    box.replaceChildren(h('form', { class: 'stack', onsubmit: go },
      h('h2', {}, 'You are invited to ' + peek.familyName), h('p', {}, 'You will join as ' + ROLE_TEXT[peek.role] + '.'),
      field('Your name', name), err, btn, h('p', { class: 'hint' }, 'You will get your own private link to this hub. Keep it safe.')));
    return box;
  }

  /* ---------- the start page: "Your people, in sync" with the hub and trip cards ---------- */
  const AV = [['🦊', '#F6C9A0'], ['🦁', '#A9C9E8'], ['🚀', '#B7DDB0'], ['🌻', '#F3E19A'], ['🐶', '#CDBDEB'], ['🌸', '#F2B8CF']];
  function brand() {
    return h('header', { class: 'lp-brandrow' }, h('a', { class: 'lp-brand', href: '/', 'aria-label': PL.config.appName + ' start page' }, icon('calendar'), h('span', {}, PL.config.appName)));
  }
  function startCard(kind, ic, kicker, title, sub, label, go, demoHref, demoText) {
    const btn = ui.button(label, { variant: 'primary', big: true, icon: 'plus', block: true, onClick: go });
    btn.classList.add('lp-go');
    return h('section', { class: 'card land-pick land-pick-' + kind },
      h('div', { class: 'land-pick-head' }, ic, h('div', {}, h('span', { class: 'land-kicker' }, kicker), h('h2', {}, title))),
      h('p', { class: 'land-pick-sub' }, sub), btn,
      h('span', { class: 'lp-demo' }, 'or ', h('a', { href: demoHref }, demoText)));
  }
  function startPage(main) {
    const hero = h('section', { class: 'lp-hero' });
    hero.innerHTML = '<h1>Your people, <span class="hl">in sync</span>,<br>wherever they are.</h1>'; // our own fixed text
    hero.append(h('div', { class: 'lp-free' },
      h('div', { class: 'row1' }, h('span', { class: 'fz' }, 'FREE'), h('span', { class: 'ea' }, 'during early access')),
      h('div', { class: 'row2' }, h('span', {}, 'No sign-up'), h('span', {}, 'No ads'))));
    const tripIc = h('span', { class: 'land-pick-ic' }); tripIc.innerHTML = PLANE;
    const cards = [startCard('home', h('span', { class: 'land-pick-ic' }, icon('calendar')), 'Kalendaryo', 'Everyone in sync',
      'Calendar, chores, meals, lists and a digital photo frame. Takes 1 minute.', 'Create a hub', () => go('#new'), '/demo', 'try a demo hub')];
    if (window.KAL_TRIPLY) cards.push(startCard('trip', tripIc, 'Triply by Kalendaryo', 'Plan a trip',
      'One plan, every booking and a group chat for everyone going.', 'Create a trip', () => go('#trip'), TRIPLY_BASE + '/demo', 'try a demo trip'));
    main.append(hero, h('div', { class: 'land-picks' + (cards.length === 1 ? ' one' : '') }, ...cards),
      h('div', { class: 'lp-av', 'aria-hidden': 'true' }, AV.map(([e, c]) => h('span', { style: 'background:' + c }, e))),
      h('p', { class: 'lp-for' }, 'For families, couples, roommates, best friends and loved ones far away.'));
  }
  // The trip form, unchanged, on its own after "Create a trip".
  function tripPage(main) {
    main.append(h('div', { class: 'lp-one' }, tripCard(), h('a', { class: 'lp-back', href: '#', onclick: (e) => { e.preventDefault(); go(''); } }, '← Back')));
  }
  function go(hash) {
    if (location.hash !== hash) history.pushState(null, '', hash || location.pathname);
    render();
    window.scrollTo(0, 0);
  }

  let root;
  async function render(note) {
    const view = KAL.joinCode ? 'join' : location.hash === '#new' || location.hash === '#setup' ? 'hub' : location.hash === '#trip' && window.KAL_TRIPLY ? 'trip' : 'start';
    const main = h('main', { class: 'land' + (view === 'join' ? '' : ' land-wide lp lp-' + view) },
      view === 'join'
        ? h('header', { class: 'land-head' }, h('div', { class: 'brand-name land-logo' }, h('span', { class: 'land-logo-mark' }, icon('calendar')), PL.config.appName),
            h('h1', {}, 'Where home gets organized'), h('p', { class: 'land-lead' }, 'One shared place for your calendar, chores, meals and groceries, lists and photos. Everyone sees the same plan, updated live. Simple, calm, and private to your home.'))
        : brand(),
      note ? h('p', { class: 'land-note', role: 'alert' }, note) : null);
    root.replaceChildren(main);
    if (view === 'join') { main.append(await joinCard()); return; }
    if (view === 'hub') { PL.setup.mount(main, { back: () => go('') }); return; }
    if (view === 'trip') { tripPage(main); return; }
    startPage(main);
    const more = await lists();
    if (more && main.isConnected) main.append(more);
    if (PL.guide) PL.guide.maybeStart(); // first visit: the friendly guide (guide.js)
  }

  PL.landing = {
    mount(opts) {
      root = document.getElementById('porchlight-root');
      document.body.classList.add('land-body');
      document.title = PL.config.appName + ' · Your people, in sync';
      if (!root.dataset.nav) { root.dataset.nav = '1'; window.addEventListener('popstate', () => { if (document.body.classList.contains('land-body')) render(); }); }
      render(opts && opts.note);
    }
  };
})();
