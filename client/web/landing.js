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

  function createCard() {
    const you = h('input', { type: 'text', maxlength: '30', placeholder: 'For example: Ryan', autocomplete: 'given-name' });
    const fam = h('input', { type: 'text', maxlength: '40', placeholder: 'For example: The Rubi family', autocomplete: 'off' });
    const err = errorBox();
    const btn = ui.button('Create my family', { variant: 'primary', big: true, icon: 'plus', type: 'submit', block: true });
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
    return h('form', { class: 'card land-card', onsubmit: go },
      h('h2', {}, 'Start your family’s space'), field('Your name', you), field('Family name', fam), err, btn,
      h('p', { class: 'hint' }, 'You get your own private link. Keep it safe: it is your key. No account or password needed.'));
  }

  function recentCard() {
    const list = KAL.recent.all();
    if (!list.length) return null;
    return h('section', { class: 'card land-card' }, h('h2', {}, 'Your families on this device'),
      h('div', { class: 'stack' }, list.map((f) => h('div', { class: 'land-recent' },
        h('a', { class: 'btn soft big land-open', href: '/c/' + f.t }, icon('home'), h('span', {}, f.name + (f.who ? ' · ' + f.who : ''))),
        ui.iconButton('x', 'Forget ' + f.name + ' on this device', () => { KAL.recent.forget(f.t); render(); })))));
  }

  function steps() {
    const s = [['plus', 'Create', 'Make your family’s space in one step.'], ['users', 'Invite', 'Send invite links. Pick who can look, who can edit, and who is an owner.'], ['calendar', 'Share the day', 'Calendar, chores, meals, lists and photos, live for everyone.']];
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
      field('Your name', name), err, btn, h('p', { class: 'hint' }, 'You will get your own private link to this family. Keep it safe.')));
    return box;
  }

  let root;
  async function render(note) {
    const main = h('main', { class: 'land' },
      h('header', { class: 'land-head' }, h('div', { class: 'brand-name land-logo' }, icon('home'), ' ', PL.config.appName),
        h('h1', {}, 'One link for your whole family'), h('p', { class: 'land-lead' }, 'A shared calendar, chores and stars, meals and groceries, lists and photos. Simple, calm, and private to your family.')),
      note ? h('p', { class: 'land-note', role: 'alert' }, note) : null);
    root.replaceChildren(main);
    if (KAL.joinCode) main.append(await joinCard());
    else main.append(...[createCard(), recentCard(), steps()].filter(Boolean));
  }

  PL.landing = {
    mount(opts) {
      root = document.getElementById('porchlight-root');
      document.title = PL.config.appName;
      render(opts && opts.note);
    }
  };
})();
