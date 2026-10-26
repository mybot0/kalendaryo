/*
 * people.js — who is on the trip, what they may do, invitations, and my own link.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, cfg = TR.config, icon = TR.icon;

  function mount(root, ctx) {
    const session = ctx.session;
    let inviteRole = 'editor', fresh = null; // fresh: the invitation just made (its link is only known right now)

    const roleLabel = (id) => { const r = session.state.roles.find((x) => x.id === id); return r ? r.label : id; };

    function memberRow(m) {
      const me = session.me(), owner = session.can('members.manage');
      const sub = m.you ? 'You' : 'Joined ' + D.withYear(m.joined_at.slice(0, 10));
      let control;
      if (owner && !m.you) {
        const sel = ui.select(session.state.roles.map((r) => ({ value: r.id, label: r.label })), m.role, async (v) => {
          try { await session.req('PATCH', '/members/' + m.id, { role: v }); await session.refresh(); ui.toast(m.name + ' is now ' + roleLabel(v).toLowerCase() + '.'); } catch (e) { ui.toast(e.message); sel.value = m.role; }
        });
        sel.setAttribute('aria-label', 'Role of ' + m.name);
        control = [sel, ui.iconButton('trash', 'Remove ' + m.name, async () => {
          const ok = await ui.confirm({ title: 'Remove ' + m.name + '?', message: 'They lose access to this trip right away, and their private messages are deleted.', confirmLabel: 'Remove', danger: true });
          if (!ok) return;
          try { await session.req('DELETE', '/members/' + m.id); await session.refresh(); ui.toast('Removed.'); } catch (e) { ui.toast(e.message); }
        })];
      } else control = h('span', { class: 'badge' + (m.role === 'owner' ? ' owner' : '') }, roleLabel(m.role));
      return h('div', { class: 'person-row' }, ui.avatar(m, 44), h('div', { class: 'person-main' }, h('b', {}, m.name), h('span', { class: 'sub' }, sub)), control,
        !m.you ? ui.iconButton('chat', 'Message ' + m.name, () => { session.openWith = m.id; TR.go('/trip/' + session.id + '/chat'); }) : null);
    }

    async function makeInvite(label) {
      try {
        const r = await session.req('POST', '/invites', { role: inviteRole, label });
        fresh = { id: r.invite.id, link: r.link };
        await session.refresh();
      } catch (e) { ui.toast(e.message); }
    }

    function inviteCard() {
      const label = TR.forms.input('text', '', { maxlength: 60, placeholder: 'Who is it for? (optional)' });
      const seg = ui.segmented(session.state.roles.map((r) => ({ value: r.id, label: r.label })), inviteRole, (v) => { inviteRole = v; help.textContent = cfg.roleHelp[v]; }, 'Role');
      const help = h('p', { class: 'sub' }, cfg.roleHelp[inviteRole]);
      const pending = session.state.invites;
      return h('section', { class: 'card stack' }, h('h2', {}, 'Invite someone'),
        h('p', { class: 'sub' }, 'Make a link and send it by message or e-mail. Each link works once and expires in two weeks.'),
        seg.el, help, ui.field('Note to yourself', label),
        ui.button('Create invitation link', { icon: 'link', variant: 'primary', big: true, onClick: () => makeInvite(label.value) }),
        fresh ? h('div', { class: 'stack' }, h('p', { class: 'note-box' }, 'Link ready. Copy it now — for safety it is not shown again after you leave this page.'), ui.copyBox(fresh.link, 'Invitation link'),
          navigator.share ? ui.button('Share…', { icon: 'share', onClick: () => navigator.share({ title: 'Join ' + session.trip().name + ' on Triply', url: fresh.link }).catch(() => {}) }) : null) : null,
        pending.length ? h('div', {}, h('h3', { class: 'mini-h' }, 'Open invitations'), pending.map((v) => h('div', { class: 'invite-row' },
          h('div', { class: 'inline' }, h('b', {}, v.label || 'Invitation'), h('span', { class: 'badge' }, roleLabel(v.role)), h('span', { class: 'sub' }, 'expires ' + D.short(v.expires_at.slice(0, 10))), h('span', { class: 'spacer' }),
            ui.button('Cancel', { variant: 'danger', onClick: async () => { try { await session.req('DELETE', '/invites/' + v.id); if (fresh && fresh.id === v.id) fresh = null; await session.refresh(); } catch (e) { ui.toast(e.message); } } }))))) : null);
    }

    function mineCard() {
      const me = session.me();
      return h('section', { class: 'card stack' }, h('h2', {}, 'You'),
        h('div', { class: 'person-row' }, ui.avatar(me, 44), h('div', { class: 'person-main' }, h('b', {}, me.name), h('span', { class: 'sub' }, roleLabel(me.role))), ui.button('Change', { icon: 'edit', onClick: () => TR.forms.profileSheet(session) })),
        h('div', { class: 'stack' }, h('h3', { class: 'mini-h' }, 'Your personal link'), ui.copyBox(session.link(), 'Your personal link'),
          h('p', { class: 'hint' }, 'Open this on another phone or computer to be you in this trip. Do not share it — send an invitation instead.')),
        ui.button('Leave this trip', { icon: 'logout', variant: 'danger', onClick: async () => {
          const ok = await ui.confirm({ title: 'Leave this trip?', message: 'Your link stops working. Someone from the trip would have to invite you again.', confirmLabel: 'Leave trip', danger: true });
          if (!ok) return;
          try { await session.req('DELETE', '/members/me'); TR.saved.remove(session.id); TR.go('/'); ui.toast('You left the trip.'); } catch (e) { ui.toast(e.code === 'last_owner' ? 'You are the only owner. Make someone else an owner first.' : e.message); }
        } }));
    }

    function render() {
      const members = session.state.members;
      root.replaceChildren(
        h('div', { class: 'page-head' }, h('h1', {}, 'People'), h('span', { class: 'sub' }, TR.plural(members.length, 'traveler'))),
        h('div', { class: 'people-grid' },
          h('div', { class: 'stack' },
            h('section', { class: 'card' }, members.map(memberRow)),
            h('section', { class: 'card role-help' }, h('h3', {}, 'What each role can do'), session.state.roles.map((r) => h('p', {}, h('b', {}, r.label + ': '), cfg.roleHelp[r.id] || r.blurb)))),
          h('div', { class: 'stack' }, session.can('invites.manage') ? inviteCard() : null, mineCard())));
    }
    render();
    const off = session.on((k) => { if (k === 'state') render(); });
    return { destroy: off };
  }

  TR.screens = TR.screens || {};
  TR.screens.people = { mount };
})();
