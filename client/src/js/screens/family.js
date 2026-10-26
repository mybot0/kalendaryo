/*
 * screens/family.js — family profiles: list, add, edit, remove, and a per-person view.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, D = PL.D, ui = PL.ui;
  const roleLabel = (r) => (PL.config.roles.find((x) => x.value === r) || { label: 'Family' }).label;

  function nextColor() {
    const used = new Set(PL.state.members.map((m) => m.color));
    const free = PL.config.palette.find((p) => !used.has(p.hex));
    return (free || PL.config.palette[PL.state.members.length % PL.config.palette.length]).hex;
  }

  /* ---------- add / edit form ---------- */
  function openForm(member) {
    const editing = !!member;
    const m = member || { name: '', role: 'parent', avatar: PL.config.avatars[PL.state.members.length % PL.config.avatars.length], color: nextColor(), birthday: '' };
    let avatar = m.avatar || '';
    const name = h('input', { type: 'text', maxlength: 30, value: m.name, placeholder: 'Name', autocomplete: 'off', autofocus: true });
    const role = ui.segmented(PL.config.roles, m.role, null, 'Role');
    const color = ui.colorPicker(m.color, false);
    const bday = h('input', { type: 'date', value: m.birthday || '' });
    const avatarWrap = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Picture' });
    function paintAvatars() {
      avatarWrap.replaceChildren(...PL.config.avatars.map((a) => h('button', {
        type: 'button', role: 'radio', class: 'avatar-opt' + (a === avatar ? ' on' : ''), 'aria-checked': a === avatar ? 'true' : 'false', 'aria-label': a,
        onclick: () => { avatar = a; paintAvatars(); }
      }, a)));
    }
    paintAvatars();
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });

    async function save() {
      const nm = name.value.trim();
      if (!nm) { err.textContent = 'Please enter a name.'; err.hidden = false; name.focus(); return; }
      const data = PL.models.member({ name: nm, role: role.get(), avatar, color: color.get(), birthday: bday.value || '', demo: m.demo });
      const ok = editing ? await PL.store.updateMember(m.id, data) : await PL.store.addMember(data);
      if (ok) { s.close(); ui.toast(editing ? 'Saved.' : nm + ' added.'); }
    }
    const footer = [];
    if (editing) footer.push(ui.button('Remove', { variant: 'danger', icon: 'trash', onClick: () => { s.close(); removeMember(m); } }));
    footer.push(h('span', { class: 'spacer' }), ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button(editing ? 'Save' : 'Add', { variant: 'primary', big: true, onClick: save }));
    const s = ui.sheet({
      title: editing ? 'Edit ' + m.name : 'Add a family member',
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('Name', name),
        ui.field('Picture', avatarWrap),
        ui.field('Role', role.el),
        ui.field('Color', color.el, 'Used on the calendar for everything this person is part of.'),
        ui.field('Birthday (optional)', bday, 'Birthdays appear on the calendar every year.'),
        err),
      footer
    });
  }

  async function removeMember(m) {
    const n = PL.state.events.filter((e) => (e.memberIds || []).includes(m.id)).length;
    const ok = await ui.confirm({
      title: 'Remove ' + m.name + '?',
      message: n ? m.name + ' will be removed from ' + n + (n === 1 ? ' event' : ' events') + '. The events themselves stay on the calendar.' : 'This cannot be undone.',
      confirmLabel: 'Remove', danger: true
    });
    if (!ok) return;
    // Take the person out of events first so nothing points at a missing profile.
    for (const e of PL.state.events.filter((x) => (x.memberIds || []).includes(m.id))) {
      await PL.store.setEvent(e.id, Object.assign({}, e, { memberIds: e.memberIds.filter((x) => x !== m.id) }));
    }
    for (const c of PL.state.chores.filter((x) => (x.memberIds || []).includes(m.id))) {
      await PL.store.setChore(c.id, Object.assign({}, c, { memberIds: c.memberIds.filter((x) => x !== m.id) }));
    }
    for (const r of PL.state.routines.filter((x) => (x.memberIds || []).includes(m.id))) {
      await PL.store.set('routines', r.id, Object.assign({}, r, { memberIds: r.memberIds.filter((x) => x !== m.id) }));
    }
    if (await PL.store.removeMember(m.id)) ui.toast(m.name + ' removed.');
  }

  /* ---------- one person's page ---------- */
  function openMember(id) {
    const m = PL.store.member(id);
    if (!m) return;
    const today = D.today();
    const items = PL.cal.instances(today, D.addDays(today, 30), { all: true })
      .filter((i) => (i.memberIds || []).includes(m.id) || (i.kind === 'birthday' && i.ownerId === m.id)).slice(0, 8);
    const s = ui.sheet({
      title: m.name,
      body: h('div', { class: 'stack' },
        h('div', { class: 'member-head', style: '--c:' + m.color }, ui.avatar(m, 64), h('div', {}, h('strong', {}, m.name), h('div', { class: 'sub' }, roleLabel(m.role) + (m.birthday ? ' · Birthday ' + D.fmt(m.birthday, { month: 'long', day: 'numeric' }) : '')))),
        h('h3', { class: 'mini-h' }, 'Next 30 days'),
        items.length ? h('div', { class: 'card-list' }, items.map((i) => PL.eventUi.card(i, { compact: true }))) : h('p', { class: 'sub' }, 'Nothing planned.')),
      footer: [ui.button('Add an event', { icon: 'plus', onClick: () => { s.close(); PL.eventUi.openForm({ mode: 'create', date: today, prefill: { title: '', memberIds: [m.id] } }); } }), h('span', { class: 'spacer' }), ui.button('Edit', { variant: 'primary', icon: 'edit', onClick: () => { s.close(); openForm(m); } })]
    });
  }

  PL.familyUi = { openForm, openMember, removeMember };

  /* ---------- screen ---------- */
  PL.screens.family = {
    mount(root, params) {
      const el = h('div', { class: 'screen-page' });
      root.append(el);
      function render() {
        const members = PL.state.members;
        el.replaceChildren(
          h('header', { class: 'page-head' }, h('h1', {}, 'Family'), ui.button('Add person', { variant: 'primary', big: true, icon: 'plus', onClick: () => openForm() })),
          members.length
            ? h('div', { class: 'family-grid' }, members.map((m) => h('button', { type: 'button', class: 'family-card', style: '--c:' + m.color, onclick: () => openMember(m.id) },
                ui.avatar(m, 64), h('strong', {}, m.name), h('span', { class: 'sub' }, roleLabel(m.role)))))
            : ui.emptyState({ icon: 'users', title: 'Who is in your family?', text: 'Add everyone who shares this calendar. Each person gets their own color.', action: ui.button('Add the first person', { variant: 'primary', big: true, icon: 'plus', onClick: () => openForm() }) }),
          PL.familyExtras ? PL.familyExtras() : '');
      }
      render();
      if (params && params.add) setTimeout(() => openForm(), 0);
      if (params && params.edit) setTimeout(() => { const m = PL.store.member(params.edit); if (m) openForm(m); }, 0);
      return { update: render, destroy() {} };
    }
  };
})();

