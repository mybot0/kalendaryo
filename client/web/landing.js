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
    const you = h('input', { type: 'text', maxlength: '30', placeholder: 'For example: Ryan', autocomplete: 'given-name' });
    const fam = h('input', { type: 'text', maxlength: '40', placeholder: pick ? 'For example: The Rubi family, Barkada' : 'For example: The Rubi family, Us two, Maple St. roommates, Barkada', autocomplete: 'off' });
    const err = errorBox();
    const btn = ui.button('Create your home', { variant: 'primary', big: true, icon: 'plus', type: 'submit', block: true });
    async function go(e) {
      e.preventDefault();
      if (!you.value.trim()) { showErr(err, 'Please type your name.'); you.focus(); return; }
      btn.disabled = true; showErr(err, '');
      try {
        const r = await KAL.api('POST', '/api/families', { yourName: you.value.trim(), familyName: fam.value.trim() });
        try { localStorage.setItem('kal.newlink', '1'); } catch (x) { /* fine */ }
        location.href = '/c/' + r.token;
      } catch (x) { showErr(err, x.userMessage); btn.disabled = false; }
    }
    if (pick) return pickForm(go, 'home', h('span', { class: 'land-pick-ic' }, icon('calendar')), 'Kalendaryo', 'Organize a home', 'Calendar, chores, meals, lists and photos for everyone you live with.', you, 'Home name', fam, err, btn);
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
    const you = h('input', { type: 'text', maxlength: '30', placeholder: 'For example: Ryan', autocomplete: 'given-name' });
    const trip = h('input', { type: 'text', maxlength: '60', placeholder: 'For example: Japan 2027, Boracay trip', autocomplete: 'off' });
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
      h('a', { class: 'land-pick-link', href: TRIPLY_BASE + '/' }, ' Open my trips →'), [field('Dates', dates)]);
  }
  function choice() {
    return [h('h2', { class: 'land-ask' }, 'What do you want to organize?'), h('div', { class: 'land-picks' }, createCard(true), tripCard())];
  }

  function recentCard() {
    const list = KAL.recent.all();
    if (!list.length) return null;
    return h('section', { class: 'card land-card' }, h('h2', {}, 'Your homes on this device'),
      h('div', { class: 'stack' }, list.map((f) => h('div', { class: 'land-recent' },
        h('a', { class: 'btn soft big land-open', href: '/c/' + f.t }, icon('calendar'), h('span', {}, f.name + (f.who ? ' · ' + f.who : ''))),
        ui.iconButton('x', 'Forget ' + f.name + ' on this device', () => { KAL.recent.forget(f.t); render(); })))));
  }

  function steps() {
    const s = [['plus', 'Create', 'Make your home’s space in one step.'], ['users', 'Invite', 'Send invite links. Pick who can look, who can edit, and who is an owner.'], ['calendar', 'Share the day', 'Calendar, chores, meals, lists and photos, live for everyone.']];
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
    const name = h('input', { type: 'text', maxlength: '30', placeholder: 'Your name', autocomplete: 'given-name' });
    const err = errorBox();
    const btn = ui.button('Join ' + peek.familyName, { variant: 'primary', big: true, icon: 'users', type: 'submit', block: true });
    async function go(e) {
      e.preventDefault();
      if (!name.value.trim()) { showErr(err, 'Please type your name.'); name.focus(); return; }
      btn.disabled = true; showErr(err, '');
      try {
        const r = await KAL.api('POST', '/api/join', { code: KAL.joinCode, name: name.value.trim() });
        try { localStorage.setItem('kal.newlink', '1'); } catch (x) { /* fine */ }
        location.replace('/c/' + r.token);
      } catch (x) { showErr(err, x.userMessage); btn.disabled = false; }
    }
    box.replaceChildren(h('form', { class: 'stack', onsubmit: go },
      h('h2', {}, 'You are invited to ' + peek.familyName), h('p', {}, 'You will join as ' + ROLE_TEXT[peek.role] + '.'),
      field('Your name', name), err, btn, h('p', { class: 'hint' }, 'You will get your own private link to this home. Keep it safe.')));
    return box;
  }

  let root;
  async function render(note) {
    const main = h('main', { class: window.KAL_TRIPLY && !KAL.joinCode ? 'land land-wide' : 'land' },
      h('header', { class: 'land-head' }, h('div', { class: 'brand-name land-logo' }, h('span', { class: 'land-logo-mark' }, icon('calendar')), PL.config.appName),
        h('h1', {}, 'Where home gets organized'), h('p', { class: 'land-lead' }, 'One shared place for your calendar, chores, meals and groceries, lists and photos. Everyone sees the same plan, updated live. Simple, calm, and private to your home.')),
      note ? h('p', { class: 'land-note', role: 'alert' }, note) : null);
    root.replaceChildren(main);
    if (KAL.joinCode) main.append(await joinCard());
    else if (window.KAL_TRIPLY) main.append(...[...choice(), recentCard(), steps()].filter(Boolean));
    else main.append(...[createCard(), recentCard(), steps()].filter(Boolean));
  }

  PL.landing = {
    mount(opts) {
      root = document.getElementById('porchlight-root');
      document.body.classList.add('land-body');
      document.title = PL.config.appName + ' · Where home gets organized';
      render(opts && opts.note);
    }
  };
})();
