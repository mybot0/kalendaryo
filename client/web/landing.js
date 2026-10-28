/*
 * landing.js — web version only. The start page (create a family) and the join page (invite links).
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, ui = PL.ui;
  const ROLE_TEXT = { viewer: 'a Viewer (can look)', editor: 'an Editor (can add and change things)', owner: 'an Owner (can also invite people)' };

  function field(label, input) { return ui.field(label, input); }
  function errorBox() { return h('p', { class: 'form-error', role: 'alert', hidden: true }); }
  const showErr = (el, msg) => { el.textContent = msg; el.hidden = !msg; };

  function createCard(pick) {
    const you = h('input', { type: 'text', maxlength: '30', placeholder: 'For example: ' + PL.examples.name(), autocomplete: 'given-name' });
    const fam = h('input', { type: 'text', maxlength: '40', placeholder: 'For example: ' + PL.examples.home(), autocomplete: 'off' });
    const err = errorBox();
    const btn = ui.button('Create your home', { variant: 'primary', big: true, icon: 'plus', type: 'submit', block: true });
    let weekStart = 0;
    const week = pick ? ui.segmented([{ value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }], 0, (v) => { weekStart = Number(v); }, 'Week starts on') : null;
    async function go(e) {
      e.preventDefault();
      if (!you.value.trim()) { showErr(err, 'Please type your name.'); you.focus(); return; }
      btn.disabled = true; showErr(err, '');
      try {
        const r = await KAL.api('POST', '/api/families', { yourName: you.value.trim(), familyName: fam.value.trim() });
        if (pick && weekStart) {
          // Save the chosen week start in the new home's settings (same document the Settings screen writes).
          await fetch('/api/docs/settings/main', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.token },
            body: JSON.stringify({ data: { householdName: fam.value.trim() || 'Our home', weekStart } }) }).catch(() => {});
        }
        try { localStorage.setItem('kal.newlink', '1'); } catch (x) { /* fine */ }
        location.href = '/c/' + r.token;
      } catch (x) { showErr(err, x.userMessage); btn.disabled = false; }
    }
    if (pick) return pickForm(go, 'home', h('span', { class: 'land-pick-ic' }, icon('calendar')), 'Kalendaryo', 'Organize a home', 'Calendar, chores, meals, lists and photos for everyone you live with.', you, 'Home name', fam, err, btn, null, [field('Week starts on', week.el)]);
    return h('form', { class: 'card land-card', onsubmit: go },
      h('h2', {}, 'Start your home’s space'), field('Your name', you), field('Home name', fam), err, btn,
      h('p', { class: 'hint' }, 'You get your own private link. Keep it safe: it is your key. No account or password needed.'));
  }

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
  function choice() {
    return [h('div', { class: 'land-picks' }, createCard(true), tripCard())];
  }

  function recentCard() {
    const list = KAL.recent.all();
    if (!list.length) return null;
    return h('section', { class: 'card land-card' }, h('h2', {}, 'Your homes on this device'),
      h('div', { class: 'stack' }, list.map((f) => h('div', { class: 'land-recent' },
        h('a', { class: 'btn soft big land-open', href: '/c/' + f.t }, icon('calendar'), h('span', {}, f.name + (f.who ? ' · ' + f.who : ''))),
        ui.iconButton('x', 'Forget ' + f.name + ' on this device', () => { KAL.recent.forget(f.t); render(); })))));
  }

  // "Just looking?" — the demo home (demo.js)
  function demoCard() {
    return h('section', { class: 'card land-demo' },
      h('span', { class: 'land-demo-ic', 'aria-hidden': 'true' }, '👀'),
      h('div', { class: 'land-demo-text' }, h('strong', {}, 'Just looking?'), h('span', { class: 'sub' }, window.KAL_TRIPLY
        ? 'Try a demo: a made-up family home with 3 months of plans, or a 14-day family trip to France and Italy.'
        : 'Try a demo home: a made-up family with 3 months of plans, meals, chores and photos.')),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn primary big', href: '/demo' }, 'Try a demo home'),
        window.KAL_TRIPLY ? h('a', { class: 'btn big land-demo-trip', href: TRIPLY_BASE + '/demo' }, 'Try a demo trip') : null));
  }

  function steps() {
    const s = window.KAL_TRIPLY
      ? [['plus', 'Create', 'Start a home or a trip in one step. No account or password.'], ['users', 'Invite', 'Send invite links. Pick who can look, who can edit, and who is an owner.'], ['calendar', 'Share the day', 'Calendars, chores, meals, itineraries and group chat, live for everyone.']]
      : [['plus', 'Create', 'Make your home’s space in one step.'], ['users', 'Invite', 'Send invite links. Pick who can look, who can edit, and who is an owner.'], ['calendar', 'Share the day', 'Calendar, chores, meals, lists and photos, live for everyone.']];
    return h('div', { class: 'land-steps' }, s.map(([i, t, d]) => h('div', { class: 'land-step' }, h('span', { class: 'empty-icon' }, icon(i)), h('strong', {}, t), h('span', { class: 'sub' }, d))));
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
      field('Your name', name), err, btn, h('p', { class: 'hint' }, 'You will get your own private link to this home. Keep it safe.')));
    return box;
  }

  let root;
  async function render(note) {
    const tri = window.KAL_TRIPLY && !KAL.joinCode;
    const head = tri
      ? h('header', { class: 'card land-banner' }, h('span', { class: 'land-logo-mark' }, icon('calendar')),
          h('div', {}, h('div', { class: 'brand-name land-banner-name' }, PL.config.appName), h('p', { class: 'land-banner-tag' }, 'Where home and trips get organized')))
      : null;
    const main = h('main', { class: tri ? 'land land-wide' : 'land' }, head ||
      h('header', { class: 'land-head' }, h('div', { class: 'brand-name land-logo' }, h('span', { class: 'land-logo-mark' }, icon('calendar')), PL.config.appName),
        h('h1', {}, 'Where home gets organized'), h('p', { class: 'land-lead' }, 'One shared place for your calendar, chores, meals and groceries, lists and photos. Everyone sees the same plan, updated live. Simple, calm, and private to your home.')),
      note ? h('p', { class: 'land-note', role: 'alert' }, note) : null);
    root.replaceChildren(main);
    if (KAL.joinCode) main.append(await joinCard());
    else if (window.KAL_TRIPLY) main.append(...[...choice(), demoCard(), await lists(), steps()].filter(Boolean));
    else main.append(...[createCard(), demoCard(), recentCard(), steps()].filter(Boolean));
    if (!KAL.joinCode && PL.guide) PL.guide.maybeStart(); // first visit: the friendly guide (guide.js)
  }

  PL.landing = {
    mount(opts) {
      root = document.getElementById('porchlight-root');
      document.body.classList.add('land-body');
      document.title = PL.config.appName + (window.KAL_TRIPLY ? ' · Where home and trips get organized' : ' · Where home gets organized');
      render(opts && opts.note);
    }
  };
})();
