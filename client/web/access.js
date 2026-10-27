/*
 * access.js — web version only. "People with access" in the Family section:
 * your own link, invite links with a role, changing roles, removing people.
 * Also: the viewer notice, the "save your link" tip, and what happens when access is removed.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, ui = PL.ui;
  const ROLES = [{ value: 'viewer', label: 'Viewer' }, { value: 'editor', label: 'Editor' }, { value: 'owner', label: 'Owner' }];
  const ROLE_HELP = { viewer: 'Can look at everything. Cannot change anything.', editor: 'Can add and change events, chores, meals, lists and photos.', owner: 'Can do everything, including inviting people and changing roles.' };
  const roleLabel = (r) => (ROLES.find((x) => x.value === r) || {}).label || r;
  const myLink = () => location.origin + '/c/' + KAL.token;
  const isOwner = () => KAL.me && KAL.me.role === 'owner';

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); ui.toast(what + ' copied.'); return true; }
    catch (e) { ui.toast('Could not copy. Press and hold the link to copy it.'); return false; }
  }
  function linkBox(url) {
    const input = h('input', { type: 'text', readonly: true, value: url, class: 'link-input', 'aria-label': 'Link', onfocus: (e) => e.target.select() });
    return input;
  }

  /* ---------- data ---------- */
  let invites = [];
  async function loadPeople() {
    try { KAL.people = (await KAL.api('GET', '/api/people')).people; } catch (e) { /* shown as empty */ }
    if (isOwner()) { try { invites = (await KAL.api('GET', '/api/invites')).invites; } catch (e) { invites = []; } } else invites = [];
    paint();
  }

  /* ---------- invite sheet: pick who it is for from the family ---------- */
  function openInvite() {
    let role = 'editor';
    const linked = new Set((KAL.people || []).map((p) => p.member_id).filter(Boolean));
    const pending = new Set(invites.map((i) => i.member_id).filter(Boolean));
    const members = PL.state.members.filter((m) => !m.demo).slice().sort((a, b) => (linked.has(a.id) - linked.has(b.id)) || a.name.localeCompare(b.name));
    const first = members.find((m) => !linked.has(m.id) && !pending.has(m.id)) || members.find((m) => !linked.has(m.id));
    let who = first ? first.id : 'new';
    const label = h('input', { type: 'text', maxlength: '30', placeholder: 'Their name, for example: Grandma', autocomplete: 'off' });
    const help = h('p', { class: 'hint' }, ROLE_HELP[role]);
    const seg = ui.segmented(ROLES, role, (v) => { role = v; help.textContent = ROLE_HELP[v]; }, 'Role');
    const pickBox = h('div', { class: 'who-list', role: 'radiogroup', 'aria-label': 'Who is this for?' });
    const nameOf = () => (who === 'new' ? label.value.trim() : ((members.find((m) => m.id === who) || {}).name || ''));
    function paint() {
      pickBox.replaceChildren(...members.map((m) => {
        const has = linked.has(m.id);
        return h('button', { type: 'button', role: 'radio', class: 'who-opt' + (who === m.id ? ' on' : ''), 'aria-checked': who === m.id ? 'true' : 'false', disabled: has,
          onclick: () => { who = m.id; paint(); } },
          ui.avatar(m, 36), h('strong', {}, m.name), h('span', { class: 'who-state' }, has ? 'has access' : pending.has(m.id) ? 'invite sent' : 'not invited yet'));
      }), h('button', { type: 'button', role: 'radio', class: 'who-opt who-new' + (who === 'new' ? ' on' : ''), 'aria-checked': who === 'new' ? 'true' : 'false',
        onclick: () => { who = 'new'; paint(); setTimeout(() => label.focus(), 0); } }, h('span', { class: 'who-plus' }, '+'), h('strong', {}, 'Someone new')));
      newField.hidden = who !== 'new';
      sync();
    }
    const newField = h('div', {}, ui.field('Their name', label, 'They are added to the family when they join.'));
    label.addEventListener('input', () => sync());
    const make = ui.button('Create invite link', { variant: 'primary', big: true, icon: 'plus', onClick: async () => {
      make.disabled = true;
      try {
        const r = await KAL.api('POST', '/api/invites', who === 'new' ? { role, label: label.value.trim() } : { role, memberId: who });
        const url = location.origin + '/join/' + r.code;
        const nm = nameOf();
        const share = navigator.share ? ui.button('Share', { icon: 'upload', onClick: () => navigator.share({ title: 'Join ' + KAL.family.name + ' on Kalendaryo', url }).catch(() => {}) }) : null;
        body.replaceChildren(
          h('p', {}, 'Send this link to ' + (nm || 'the person') + '. They will join as ' + roleLabel(role) + (who !== 'new' ? ', already linked to their name, color and birthday.' : '.')),
          linkBox(url),
          h('div', { class: 'btn-row' }, ui.button('Copy link', { variant: 'primary', icon: 'copy', onClick: () => copy(url, 'Invite link') }), share),
          h('p', { class: 'hint' }, 'It works one time and expires in ' + r.days + ' days. You can cancel it in the People section.'));
        make.remove();
        loadPeople();
      } catch (e) { ui.toast(e.userMessage); make.disabled = false; }
    } });
    function sync() {
      const nm = nameOf();
      make.querySelector('span').textContent = nm ? 'Create ' + nm + '’s link' : 'Create invite link';
      roleQ.textContent = nm ? 'What can ' + nm + ' do?' : 'What can they do?';
    }
    const roleQ = h('span', { class: 'field-label' }, 'What can they do?');
    const body = h('div', { class: 'event-form' },
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Who is this for?'), pickBox), newField,
      h('div', { class: 'field' }, roleQ, seg.el), help);
    const s = ui.sheet({ title: 'Invite someone', body, footer: [ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() }), make] });
    paint();
  }

  function openRole(p) {
    let role = p.role;
    const help = h('p', { class: 'hint' }, ROLE_HELP[role]);
    const seg = ui.segmented(ROLES, role, (v) => { role = v; help.textContent = ROLE_HELP[v]; }, 'Role');
    const save = ui.button('Save', { variant: 'primary', big: true, onClick: async () => {
      if (role === p.role) { s.close(); return; }
      if (p.isMe && role !== 'owner' && !(await ui.confirm({ title: 'Change your own role?', message: 'You will not be able to manage people anymore.', confirmLabel: 'Change it' }))) return;
      try { await KAL.api('PATCH', '/api/people/' + p.id, { role }); s.close(); ui.toast(p.name + ' is now ' + roleLabel(role) + '.'); loadPeople(); }
      catch (e) { ui.toast(e.userMessage); }
    } });
    const remove = ui.button(p.isMe ? 'Leave family' : 'Remove', { variant: 'danger', icon: 'trash', onClick: () => { s.close(); removePerson(p); } });
    const s = ui.sheet({ title: p.name, body: h('div', { class: 'event-form' }, ui.field('Role', seg.el), help),
      footer: [remove, ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), save] });
  }

  async function removePerson(p) {
    const ok = await ui.confirm(p.isMe
      ? { title: 'Leave this family?', message: 'Your link will stop working. You will need a new invite to come back.', confirmLabel: 'Leave', danger: true }
      : { title: 'Remove ' + p.name + '?', message: 'Their link stops working right away. You can invite them again later.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await KAL.api('DELETE', '/api/people/' + p.id);
      if (p.isMe) { KAL.recent.forget(KAL.token); location.href = '/'; return; }
      ui.toast(p.name + ' was removed.'); loadPeople();
    } catch (e) { ui.toast(e.userMessage); }
  }

  async function deleteFamily() {
    const input = h('input', { type: 'text', autocomplete: 'off', placeholder: 'DELETE', 'aria-label': 'Type DELETE' });
    const go = ui.button('Delete forever', { variant: 'danger-solid', big: true, onClick: async () => {
      if (input.value.trim() !== 'DELETE') { ui.toast('Type DELETE in capital letters.'); input.focus(); return; }
      try { await KAL.api('DELETE', '/api/family', { confirm: 'DELETE' }); KAL.recent.forget(KAL.token); location.href = '/'; }
      catch (e) { ui.toast(e.userMessage); }
    } });
    const s = ui.sheet({ title: 'Delete ' + KAL.family.name + '?', body: h('div', { class: 'event-form' },
      h('p', {}, 'Everything is deleted for everyone: calendar, chores, meals, lists and photos. All links stop working. This cannot be undone.'),
      ui.field('Type DELETE to confirm', input)), footer: [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), go] });
  }

  /* ---------- the card in the Family section ---------- */
  const card = h('section', { class: 'card access-card', 'aria-label': 'People with access' });
  function paint() {
    if (!KAL.me) { card.replaceChildren(); return; }
    const people = KAL.people || [];
    const fmt = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    card.replaceChildren(...[
      h('div', { class: 'page-head' }, h('h2', {}, 'People with access'), isOwner() ? ui.button('Invite someone', { variant: 'primary', icon: 'plus', onClick: openInvite }) : null),
      h('p', { class: 'sub' }, 'Each person has their own link. To add someone, send an invite. Do not share your own link.'),
      h('div', { class: 'stack' }, people.map((p) => h('div', { class: 'access-row' },
        ui.avatar(p.member_id && PL.store.member(p.member_id) || { name: p.name, color: PL.config.neutralColor }, 36),
        h('span', { class: 'access-name' }, h('strong', {}, ((p.member_id && PL.store.member(p.member_id)) || p).name + (p.isMe ? ' (you)' : '')), h('span', { class: 'sub' }, roleLabel(p.role))),
        isOwner() ? ui.button('Change', { icon: 'edit', onClick: () => openRole(p) }) : (p.isMe ? ui.button('Leave', { variant: 'ghost', onClick: () => removePerson(p) }) : null)))),
      isOwner() && invites.length ? h('h3', { class: 'mini-h' }, 'Open invites') : null,
      isOwner() && invites.length ? h('div', { class: 'stack' }, invites.map((i) => h('div', { class: 'access-row' },
        h('span', { class: 'access-name' }, h('strong', {}, i.label || 'Invite'), h('span', { class: 'sub' }, roleLabel(i.role) + ' · expires ' + fmt(i.expires_at))),
        ui.button('Cancel', { variant: 'ghost', onClick: async () => { try { await KAL.api('DELETE', '/api/invites/' + i.id); loadPeople(); } catch (e) { ui.toast(e.userMessage); } } })))) : null,
      PL.me && !KAL.me.viewing ? h('div', { class: 'btn-row' }, PL.me.member()
        ? ui.button('My color, icon and birthday', { icon: 'edit', onClick: () => PL.me.openThatsYou(false) })
        : ui.button('Link me to my name in the family', { icon: 'users', onClick: () => PL.me.openWhich() })) : null,
      h('h3', { class: 'mini-h' }, 'Your link'),
      h('p', { class: 'hint' }, 'Bookmark it, or save it somewhere safe. Anyone with this link gets in as you.'),
      h('div', { class: 'btn-row' }, ui.button('Copy my link', { icon: 'copy', onClick: () => copy(myLink(), 'Your link') })),
      isOwner() ? h('div', { class: 'btn-row access-danger' }, ui.button('Delete this family', { variant: 'danger', icon: 'trash', onClick: deleteFamily })) : null
    ].filter(Boolean));
  }
  PL.familyExtras = () => {
    if (KAL.demo) { // the demo home has no links or invites
      return h('section', { class: 'card access-card' }, h('h2', {}, 'People with access'),
        h('p', {}, 'In your own home, each person gets their own private link, and owners invite people as Viewer, Editor or Owner.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn primary big', href: '/' }, 'Create your own home')));
    }
    paint(); return card;
  };

  /* ---------- notices ---------- */
  let banner = null;
  function showRole() {
    const viewer = KAL.me && KAL.me.role === 'viewer';
    const content = document.querySelector('.content');
    if (!content) return;
    if (!banner) { banner = h('div', { class: 'status-banner role-banner', role: 'status' }); content.prepend(banner); }
    if (KAL.me && KAL.me.viewing) {
      // The site owner looking at someone's home (owner view): read-only, not counted as their visit.
      banner.className = 'status-banner role-banner owner-viewing';
      banner.replaceChildren('👁 Viewing “' + ((KAL.family && KAL.family.name) || 'this home') + '” as the site owner · read-only · your visit doesn’t count as theirs',
        h('a', { class: 'owner-back', href: '/owner' }, 'Back to owner view'));
    } else {
      banner.textContent = viewer ? 'You can view this family. Ask an owner to make you an Editor to change things.' : '';
    }
    banner.hidden = !viewer;
  }
  function removedScreen(msg) {
    const root = document.getElementById('porchlight-root');
    if (root.dataset.removed) return;
    root.dataset.removed = '1';
    KAL.recent.forget(KAL.token);
    PL.landing.mount({ note: msg || 'This link does not work anymore. You may have been removed from the family, or the family was deleted. Ask an owner for a new invite.' });
  }
  KAL.on('people', loadPeople);
  KAL.on('me', () => { showRole(); loadPeople(); });
  KAL.on('removed', () => removedScreen());

  function start() {
    if (!KAL.token) return;
    KAL.ready.then(() => {
      if (KAL.invalid) { if (KAL.invalid.status === 401) removedScreen(); return; }
      showRole(); loadPeople();
      document.title = KAL.family.name + ' · ' + PL.config.appName;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
