/*
 * me.js — web version only. Each person's link is linked to their family profile (color, icon, birthday).
 *   - "That's you!" right after creating a home or joining: pick color, icon and birthday (or skip).
 *   - Older links with no profile: "Which one are you?" once on this device.
 *   PL.me.member()  the family profile of the person using this page (or null)
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, ui = PL.ui;
  const myLink = () => location.origin + '/c/' + KAL.token;
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; };

  const memberId = () => (KAL.me && KAL.me.memberId) || null;
  const member = () => (memberId() ? PL.store.member(memberId()) : null);

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); ui.toast('Your link copied.'); } catch (e) { ui.toast('Could not copy. Press and hold the link to copy it.'); }
  }

  /* ---------- "That's you!" ---------- */
  function openThatsYou(fresh) {
    const m = member();
    if (!m) return;
    let avatar = m.avatar || PL.config.avatars[Math.floor(Math.random() * 8)];
    const color = ui.colorPicker(m.color, false);
    const bday = h('input', { type: 'date', value: m.birthday || '', 'aria-label': 'Birthday' });
    const preview = h('span', { class: 'ty-preview' });
    const paintPreview = () => preview.replaceChildren(ui.avatar(Object.assign({}, m, { avatar, color: color.get() }), 64));
    const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Icon' });
    const paint = () => grid.replaceChildren(...PL.config.avatars.map((a) => h('button', { type: 'button', role: 'radio', class: 'avatar-opt' + (a === avatar ? ' on' : ''), 'aria-checked': a === avatar ? 'true' : 'false', 'aria-label': a,
      onclick: () => { avatar = a; paint(); paintPreview(); } }, a)));
    paint(); paintPreview();
    color.el.addEventListener('click', () => setTimeout(paintPreview, 0));
    const done = ui.button('Done', { variant: 'primary', big: true, onClick: async () => {
      done.disabled = true;
      try { await KAL.api('PUT', '/api/me/profile', { avatar, color: color.get(), birthday: bday.value || '' }); s.close(); ui.toast('Saved. That’s you on the calendar!'); }
      catch (e) { ui.toast(e.userMessage); done.disabled = false; }
    } });
    const s = ui.sheet({
      title: fresh ? 'That’s you, ' + m.name + '!' : 'Your profile',
      body: h('div', { class: 'event-form ty' },
        fresh ? h('span', { class: 'ty-badge' }, KAL.me.role === 'owner' ? 'Your home is ready 🎉' : 'Welcome to ' + KAL.family.name + ' 🎉') : null,
        h('div', { class: 'ty-who' }, preview, h('div', {}, h('strong', {}, m.name), h('p', { class: 'sub' }, fresh ? 'You are in the family already. Pick how you look on the calendar.' : 'How you look on the calendar.'))),
        ui.field('Color', color.el),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Icon'), grid),
        ui.field('Birthday (optional)', bday, 'It shows on the calendar every year.'),
        fresh ? h('div', { class: 'ty-link' }, h('p', { class: 'hint' }, 'This page is your own private link. Bookmark it so you can come back. Do not share it: anyone with it gets in as you.'),
          ui.button('Copy my link', { icon: 'copy', onClick: () => copy(myLink()) })) : null),
      footer: [ui.button(fresh ? 'Skip for now' : 'Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), done]
    });
    s.panel.focus({ preventScroll: true });
  }

  /* ---------- "Which one are you?" ---------- */
  function openWhich() {
    const linked = new Set((KAL.people || []).filter((p) => p.member_id && p.id !== KAL.me.id).map((p) => p.member_id));
    const free = PL.state.members.filter((m) => !linked.has(m.id) && !m.demo);
    async function link(id) {
      try {
        await KAL.api('POST', '/api/me/member', id ? { memberId: id } : {});
        await KAL.refreshMe();
        s.close();
        setTimeout(() => openThatsYou(false), 300);
      } catch (e) { ui.toast(e.userMessage); }
    }
    const s = ui.sheet({
      title: 'Which one are you, ' + KAL.me.name + '?',
      body: h('div', { class: 'stack' },
        h('p', { class: 'sub' }, 'Pick your name, so your color, icon and birthday are yours. You only do this once.'),
        h('div', { class: 'who-list' },
          free.map((m) => h('button', { type: 'button', class: 'who-opt', onclick: () => link(m.id) }, ui.avatar(m, 40), h('strong', {}, m.name))),
          h('button', { type: 'button', class: 'who-opt who-new', onclick: () => link(null) }, h('span', { class: 'who-plus' }, '+'), h('strong', {}, 'I’m not on the list')))),
      footer: [ui.button('Later', { variant: 'ghost', big: true, onClick: () => s.close() })]
    });
  }

  function check() {
    if (!KAL.me || KAL.me.viewing || !PL.state.live) return false;
    const key = 'kal.who.' + (window.PL_STORAGE_PREFIX || KAL.token.slice(0, 8));
    let fresh = false;
    try { fresh = localStorage.getItem('kal.newlink') === '1'; localStorage.removeItem('kal.newlink'); } catch (e) { /* fine */ }
    if (member()) { if (fresh) openThatsYou(true); return true; }
    if (memberId() && !member() && !fresh) return true; // profile was removed; leave it
    if (fresh) { // joined before profiles were linked, or something went wrong: just show the link tip
      const s = ui.sheet({ title: 'Welcome, ' + KAL.me.name + '!', body: h('div', { class: 'event-form' }, h('p', {}, 'This page is your own link to ' + KAL.family.name + '. Bookmark it or save it, so you can come back.')),
        footer: [ui.button('Copy my link', { icon: 'copy', onClick: () => copy(myLink()) }), ui.button('Got it', { variant: 'primary', big: true, onClick: () => s.close() })] });
      return true;
    }
    if (store(key) || !PL.state.members.filter((m) => !m.demo).length) return true;
    store(key, '1');
    openWhich();
    return true;
  }

  let waiting = false;
  function start() {
    if (!KAL.token) return;
    KAL.ready.then(() => {
      if (KAL.invalid || !KAL.me) return;
      if (check()) return;
      if (waiting) return;
      waiting = true;
      const off = PL.store.subscribe(() => { if (PL.state.live) { off(); setTimeout(check, 400); } });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);

  PL.me = { memberId, member, openThatsYou, openWhich };
})();
