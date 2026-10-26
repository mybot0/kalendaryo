/*
 * join.js — the two doors into a trip: an invitation (#/join/<code>) and a personal link (#/t/<token>).
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, icon = TR.icon;

  const frame = (...kids) => h('div', { class: 'center-page' }, h('div', { class: 'brand-mark' }, icon('send'), 'Triply'), ...kids);

  function problem(root, title, text) {
    root.replaceChildren(frame(h('div', { class: 'card stack' }, h('h2', {}, title), h('p', { class: 'sub' }, text),
      ui.button('Go to My Trips', { variant: 'primary', big: true, onClick: () => TR.go('/') }))));
  }

  /* ----- invitation ----- */
  function mountJoin(root, ctx) {
    const code = ctx.code;
    root.replaceChildren(frame(h('p', { class: 'loading' }, 'Checking your invitation…')));
    let dead = false;
    TR.api.call('GET', '/invites/peek/' + encodeURIComponent(code)).then((inv) => {
      if (dead) return;
      const existing = TR.saved.find(inv.trip.id);
      const me = TR.profile.get();
      const name = TR.forms.input('text', me.name, { maxlength: 40, placeholder: 'Your name', autofocus: true });
      const av = ui.avatarPicker(me.avatar);
      const err = h('p', { class: 'form-error', role: 'alert' });
      const join = ui.button('Join the trip', { variant: 'primary', big: true, block: true, onClick: async () => {
        err.textContent = '';
        if (!name.value.trim()) { err.textContent = 'Please add your name.'; name.focus(); return; }
        join.disabled = true;
        try {
          const r = await TR.api.call('POST', '/join', { body: { code, name: name.value, avatar: av.get() } });
          TR.saved.add(r.tripId, r.token);
          TR.profile.set({ name: name.value, avatar: av.get() });
          TR.go('/trip/' + r.tripId + '/overview');
          TR.forms.linkSheet(r.token, 'Welcome aboard');
        } catch (e) { err.textContent = e.message; join.disabled = false; }
      } });
      const t = inv.trip;
      root.replaceChildren(frame(
        h('div', { class: 'card stack' },
          TR.tripCover(t, 'photo-prev'),
          h('div', {}, h('p', { class: 'sub' }, (inv.inviter ? inv.inviter + ' invited you to' : 'You are invited to')), h('h1', {}, t.name),
            h('p', { class: 'sub' }, [D.range(t.start_date, t.end_date), t.destination].filter(Boolean).join(' · '))),
          h('p', { class: 'note-box' }, h('b', {}, 'You will join as ' + (inv.role_label || inv.role).toLowerCase() + '. '), TR.config.roleHelp[inv.role] || ''),
          existing ? h('div', { class: 'warn-box' }, 'This device already has a link to this trip. ', h('button', { type: 'button', class: 'link-btn', onclick: () => TR.go('/trip/' + t.id + '/overview') }, 'Open it instead')) : null,
          ui.field('Your name', name),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Your picture'), av.el),
          err, join)));
    }, (e) => { if (!dead) problem(root, e.status === 410 ? 'This invitation cannot be used' : 'Invitation not found', e.message); });
    return { destroy() { dead = true; } };
  }

  /* ----- personal link ----- */
  function mountToken(root, ctx) {
    root.replaceChildren(frame(h('p', { class: 'loading' }, 'Opening your trip…')));
    let dead = false;
    TR.api.call('GET', '/me', { token: ctx.token }).then((r) => {
      if (dead) return;
      TR.saved.add(r.trip.id, ctx.token);
      TR.go('/trip/' + r.trip.id + '/overview', true);
    }, (e) => { if (!dead) problem(root, 'This link does not work', e.status === 401 ? 'The link is wrong, or you were removed from the trip. Ask the trip owner for a new invitation.' : e.message); });
    return { destroy() { dead = true; } };
  }

  TR.screens = TR.screens || {};
  TR.screens.join = { mount: mountJoin };
  TR.screens.token = { mount: mountToken };
})();
