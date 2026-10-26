/*
 * packing.js — one shared packing list. Tick things off, say who is bringing what.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, icon = TR.icon;
  const CATEGORIES = ['Documents', 'Clothes', 'Toiletries', 'Tech', 'Health', 'Other'];

  function itemSheet(session, x) {
    const title = TR.forms.input('text', x ? x.title : '', { maxlength: 100, autofocus: true, placeholder: 'Passports' });
    const cat = ui.select([{ value: '', label: 'No category' }].concat(CATEGORIES.map((c) => ({ value: c, label: c }))), x ? x.category : '');
    const who = ui.select([{ value: '', label: 'Anyone' }].concat(session.state.members.map((m) => ({ value: m.id, label: m.name + (m.you ? ' (you)' : '') }))), x && x.assigned_to ? x.assigned_to : '');
    const err = h('p', { class: 'form-error', role: 'alert' });
    const save = ui.button('Save', { variant: 'primary', big: true, onClick: async () => {
      if (!title.value.trim()) { err.textContent = 'Type what to pack.'; return; }
      try { await session.req('PATCH', '/packing/' + x.id, { title: title.value, category: cat.value, assigned_to: who.value || null }); await session.refresh(); s.close(); } catch (e) { err.textContent = e.message; }
    } });
    const s = ui.sheet({ title: 'Change item', body: h('div', { class: 'event-form' }, ui.field('Item', title), ui.field('Category', cat), ui.field('Who is bringing it?', who), err),
      footer: [ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: async () => { try { await session.req('DELETE', '/packing/' + x.id); await session.refresh(); s.close(); } catch (e) { ui.toast(e.message); } } }), h('span', { class: 'spacer' }), ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), save] });
  }

  function mount(root, ctx) {
    const session = ctx.session;
    let filter = 'all', newCat = '', newWho = '';
    const canEdit = () => session.can('items.write'), canTick = () => session.can('chat.write');

    async function tick(x) {
      x.done = !x.done; render(); // show it at once; the server answer (or a reload) corrects it
      try { await session.req('PATCH', '/packing/' + x.id, { done: x.done }); await session.refresh(); } catch (e) { ui.toast(e.message); session.refresh(); }
    }
    function row(x) {
      const m = x.assigned_to ? session.member(x.assigned_to) : null, by = x.done && x.done_by ? session.member(x.done_by) : null;
      return h('div', { class: 'pack-row' + (x.done ? ' done' : '') },
        h('button', { type: 'button', class: 'pack-check', role: 'checkbox', 'aria-checked': x.done ? 'true' : 'false', 'aria-label': (x.done ? 'Unpack ' : 'Packed: ') + x.title, disabled: !canTick(), onclick: () => tick(x) }, x.done ? icon('check') : null),
        h('button', { type: 'button', class: 'pack-title', disabled: !canEdit(), onclick: () => itemSheet(session, x) }, h('span', {}, x.title), by ? h('small', {}, 'packed by ' + (by.you ? 'you' : by.name)) : null),
        m ? h('span', { class: 'pack-who', title: 'Bringing: ' + m.name }, ui.avatar(m, 28), m.you ? 'You' : m.name) : h('span', { class: 'pack-who any' }, 'Anyone'));
    }
    function render() {
      const me = session.me().id, all = session.packing();
      const list = all.filter((x) => filter === 'mine' ? x.assigned_to === me : filter === 'todo' ? !x.done : true);
      const done = all.filter((x) => x.done).length;
      const cats = [...new Set(all.concat(list).map((x) => x.category || ''))];
      const order = CATEGORIES.concat(['']);
      cats.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const input = TR.forms.input('text', '', { maxlength: 100, placeholder: 'Add something to pack…', 'aria-label': 'New packing item', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } } });
      const catSel = ui.select([{ value: '', label: 'Category' }].concat(CATEGORIES.map((c) => ({ value: c, label: c }))), newCat, (v) => { newCat = v; });
      const whoSel = ui.select([{ value: '', label: 'Anyone' }].concat(session.state.members.map((m) => ({ value: m.id, label: m.name + (m.you ? ' (you)' : '') }))), newWho, (v) => { newWho = v; });
      catSel.setAttribute('aria-label', 'Category'); whoSel.setAttribute('aria-label', 'Who is bringing it');
      async function add() {
        const t = input.value.trim(); if (!t) return;
        input.disabled = true;
        try { await session.req('POST', '/packing', { title: t, category: newCat, assigned_to: newWho || null }); await session.refresh(); } catch (e) { ui.toast(e.message); }
      }
      const seg = ui.segmented([{ value: 'all', label: 'Everything' }, { value: 'mine', label: 'Mine' }, { value: 'todo', label: 'Still to pack' }], filter, (v) => { filter = v; render(); }, 'Show');
      root.replaceChildren(...[
        h('div', { class: 'page-head' }, h('h1', {}, 'Packing'), h('span', { class: 'sub' }, all.length ? done + ' of ' + all.length + ' packed' : '')),
        all.length ? h('div', { class: 'pack-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': all.length, 'aria-valuenow': done }, h('span', { style: 'width:' + Math.round((done / all.length) * 100) + '%' })) : null,
        canEdit() ? h('div', { class: 'card stack pack-add' }, h('div', { class: 'copy-box' }, input, ui.button('Add', { icon: 'plus', variant: 'primary', onClick: add })), h('div', { class: 'row2' }, catSel, whoSel)) : null,
        all.length ? h('div', { class: 'it-bar', style: 'margin-top:14px' }, seg.el) : null,
        !all.length ? h('div', { class: 'card' }, ui.emptyState({ icon: 'bag', title: 'Nothing on the list yet', text: canEdit() ? 'Add passports, chargers, sunscreen. Everyone sees the list and can tick things off.' : 'The list appears here once an editor adds things.' })) : null,
        list.length ? cats.filter((c) => list.some((x) => (x.category || '') === c)).map((c) => h('section', { class: 'book-group', style: 'margin-top:14px' }, h('h2', { style: 'margin-bottom:8px' }, c || 'Other things'), h('div', { class: 'card pack-card' }, list.filter((x) => (x.category || '') === c).map(row)))) : (all.length ? h('p', { class: 'sub', style: 'margin-top:14px' }, filter === 'mine' ? 'Nothing is assigned to you.' : 'Everything is packed. 🎉') : null)].flat().filter(Boolean));
    }
    render();
    const off = session.on((k) => { if (k === 'state') render(); });
    return { destroy: off };
  }

  TR.screens = TR.screens || {};
  TR.screens.packing = { mount };
})();
