/*
 * screens/lists.js — shared lists (groceries, packing, to-do…).
 * A list is a title; its items are saved one by one, so two people can add items at the
 * same time without overwriting each other.
 *   lists/{id}        { title }
 *   listitems/{id}    { listId, text, done, at }
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, ui = PL.ui;
  const QUICK = ['Groceries', 'To-do', 'Packing', 'Party', 'Gift ideas'];

  const itemsOf = (listId) => PL.state.listitems.filter((i) => i.listId === listId).sort((a, b) => a.at - b.at);
  const setDone = (item, done) => PL.store.set('listitems', item.id, Object.assign({}, item, { done }));

  function openNewList(onMade) {
    const name = h('input', { type: 'text', maxlength: '40', placeholder: 'For example: Groceries', autocomplete: 'off', autofocus: true });
    async function save() {
      const t = name.value.trim();
      if (!t) { ui.toast('Please type a name first.'); name.focus(); return; }
      const id = await PL.store.add('lists', { title: t });
      if (id) { s.close(); ui.toast('List added.'); onMade && onMade(id); }
    }
    const s = ui.sheet({
      title: 'New list',
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('Name', name),
        h('div', { class: 'chip-row', 'aria-label': 'Quick picks' }, QUICK.map((q) => h('button', { type: 'button', class: 'person-pick', onclick: () => { name.value = q; name.focus(); } }, q)))),
      footer: [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Add list', { variant: 'primary', big: true, onClick: save })]
    });
  }

  function openListMenu(list, onGone) {
    const name = h('input', { type: 'text', maxlength: '40', autocomplete: 'off', autofocus: true });
    name.value = list.title;
    async function save() {
      const t = name.value.trim();
      if (!t) { ui.toast('Please type a name first.'); name.focus(); return; }
      if (await PL.store.set('lists', list.id, Object.assign({}, list, { title: t }))) { s.close(); ui.toast('Saved.'); }
    }
    async function del() {
      const n = itemsOf(list.id).length;
      if (!(await ui.confirm({ title: 'Delete this list?', message: '“' + list.title + '”' + (n ? ' and its ' + n + (n === 1 ? ' item' : ' items') : '') + ' will be removed for everyone.', confirmLabel: 'Delete', danger: true }))) return;
      for (const i of itemsOf(list.id)) await PL.store.del('listitems', i.id);
      if (await PL.store.del('lists', list.id)) { s.close(); ui.toast('List deleted.'); onGone(); }
    }
    const s = ui.sheet({
      title: 'Edit list',
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } }, ui.field('Name', name)),
      footer: [ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: del }), ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Save', { variant: 'primary', big: true, onClick: save })]
    });
  }

  function openItem(item) {
    const text = h('input', { type: 'text', maxlength: '100', autocomplete: 'off', autofocus: true });
    text.value = item.text;
    async function save() {
      const t = text.value.trim();
      if (!t) { ui.toast('Please type something first.'); text.focus(); return; }
      if (await PL.store.set('listitems', item.id, Object.assign({}, item, { text: t }))) s.close();
    }
    const s = ui.sheet({
      title: 'Edit item',
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } }, ui.field('Item', text)),
      footer: [ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: async () => { if (await PL.store.del('listitems', item.id)) s.close(); } }), ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Save', { variant: 'primary', big: true, onClick: save })]
    });
  }

  PL.screens.lists = {
    mount(root, params) {
      let openId = (params && params.id) || null;
      let draft = '';
      let madeAt = 0;
      const el = h('div', { class: 'screen-page lists' });
      root.append(el);

      function itemRow(item) {
        const rowEl = h('div', { class: 'chore-row' + (item.done ? ' done' : ''), style: '--c:' + PL.config.palette[3].hex });
        const check = h('button', { type: 'button', class: 'chore-check', dataset: { key: item.id }, 'aria-pressed': item.done ? 'true' : 'false', 'aria-label': item.text,
          onclick: async () => {
            const next = !item.done;
            check.setAttribute('aria-pressed', next ? 'true' : 'false'); rowEl.classList.toggle('done', next);
            if (!(await setDone(item, next))) { check.setAttribute('aria-pressed', item.done ? 'true' : 'false'); rowEl.classList.toggle('done', item.done); }
          } }, icon('check'));
        rowEl.append(check, h('button', { type: 'button', class: 'chore-title', onclick: () => openItem(item), 'aria-label': 'Edit ' + item.text }, h('span', {}, item.text), item.also ? h('span', { class: 'li-also' }, item.also) : null));
        return rowEl;
      }

      // Groceries from meals sit under a heading per meal ("Tue · Chicken adobo"); typed items go under "Other".
      function grouped(todo) {
        if (!todo.some((i) => i.group)) return todo.map(itemRow);
        const groups = new Map();
        todo.forEach((i) => { const k = i.group || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
        const keys = [...groups.keys()].filter(Boolean);
        if (groups.has('')) keys.push('');
        return keys.map((k) => {
          const parts = k.split(' · ');
          const pill = k ? (parts.length > 1 ? parts[0] : '🍽️') : 'Other';
          const name = k ? (parts.length > 1 ? parts.slice(1).join(' · ') : k) : 'Things you added';
          return h('div', { class: 'li-group' }, h('h3', { class: 'li-group-head' + (k ? '' : ' other') }, h('span', { class: 'li-pill' }, pill), h('span', {}, name)), groups.get(k).map(itemRow));
        });
      }

      function index() {
        const lists = PL.state.lists.slice().sort((a, b) => a.title.localeCompare(b.title));
        return [
          h('header', { class: 'page-head' }, h('h1', {}, 'Lists'), ui.button('New list', { variant: 'primary', big: true, icon: 'plus', onClick: () => openNewList((id) => { openId = id; madeAt = Date.now(); render(); }) })),
          lists.length
            ? h('div', { class: 'family-grid' }, lists.map((l) => {
                const items = itemsOf(l.id), open = items.filter((i) => !i.done).length;
                return h('button', { type: 'button', class: 'list-card', onclick: () => { openId = l.id; render(); } },
                  icon('list'), h('strong', {}, l.title), h('span', { class: 'sub' }, !items.length ? 'Empty' : open ? open + (open === 1 ? ' item to go' : ' items to go') : 'All done'));
              }))
            : ui.emptyState({ icon: 'list', title: 'No lists yet', text: 'Make a shared list for groceries, packing or anything else. Everyone in the family sees the same list.',
                action: h('div', { class: 'btn-row' }, QUICK.slice(0, 3).map((q) => ui.button(q, { icon: 'plus', onClick: async () => { const id = await PL.store.add('lists', { title: q }); if (id) { openId = id; madeAt = Date.now(); render(); } } }))) })
        ];
      }

      function detail(list) {
        const items = itemsOf(list.id);
        const todo = items.filter((i) => !i.done), done = items.filter((i) => i.done);
        const input = h('input', { type: 'text', id: 'li-add', maxlength: '100', placeholder: 'Add an item', autocomplete: 'off', 'aria-label': 'Add an item' });
        input.value = draft;
        input.addEventListener('input', () => { draft = input.value; });
        async function add(e) {
          e.preventDefault();
          const t = input.value.trim();
          if (!t) return;
          draft = ''; input.value = '';
          await PL.store.add('listitems', { listId: list.id, text: t, done: false, at: Date.now() });
          input.focus();
        }
        return [
          h('header', { class: 'page-head' },
            h('button', { type: 'button', class: 'link-btn', onclick: () => { openId = null; render(); } }, icon('left'), 'All lists'),
            ui.button('Edit list', { icon: 'edit', onClick: () => openListMenu(list, () => { openId = null; render(); }) })),
          h('h1', { class: 'list-title' }, list.title),
          h('div', { class: 'chores-list' },
            h('form', { class: 'add-row', onsubmit: add }, input, ui.button('Add', { variant: 'primary', big: true, type: 'submit', icon: 'plus' })),
            h('section', { class: 'chore-group' },
              todo.length ? grouped(todo) : h('p', { class: 'sub list-note' }, items.length ? 'Everything is done.' : 'Nothing here yet. Type above to add the first item.')),
            done.length ? h('section', { class: 'chore-group' },
              h('div', { class: 'cg-head' }, h('h2', { class: 'cg-name' }, 'Done'), h('span', { class: 'cg-count' }, done.length),
                h('button', { type: 'button', class: 'link-btn', onclick: async () => {
                  if (await ui.confirm({ title: 'Remove done items?', message: 'This removes ' + done.length + (done.length === 1 ? ' item' : ' items') + ' from the list.', confirmLabel: 'Remove', danger: true })) {
                    for (const i of done) await PL.store.del('listitems', i.id);
                  } } }, 'Clear done')),
              done.map(itemRow)) : null)
        ];
      }

      function render() {
        const a = document.activeElement;
        const focusKey = a && el.contains(a) ? (a.id === 'li-add' ? '#add' : a.dataset && a.dataset.key) : null;
        const list = openId && PL.state.lists.find((l) => l.id === openId);
        if (openId && !list && PL.state.ready && PL.state.live && Date.now() - madeAt > 4000) openId = null;
        el.replaceChildren(...(list ? detail(list) : (openId ? [h('p', { class: 'sub' }, 'Opening…')] : index())));
        if (focusKey === '#add') { const i = el.querySelector('#li-add'); if (i) { i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); } }
        else if (focusKey) { const b = [...el.querySelectorAll('[data-key]')].find((x) => x.dataset.key === focusKey); if (b) b.focus({ preventScroll: true }); }
      }

      render();
      return { update: render, destroy() {} };
    }
  };
})();
