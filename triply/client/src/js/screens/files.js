/*
 * files.js — everything shared on the trip in one place: tickets, PDFs and photos (including chat attachments).
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, icon = TR.icon;

  const size = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  const isImage = (m) => /^image\/(jpeg|png|gif|webp)$/.test(m);

  function mount(root, ctx) {
    const session = ctx.session;
    let files = null, dead = false, busy = false;

    async function load() {
      try { const r = await session.req('GET', '/files'); if (dead) return; files = r.files; } catch (e) { if (dead) return; files = files || []; ui.toast(e.message); }
      render();
    }
    const who = (id) => { const m = session.member(id); return m ? m.name : 'Former traveler'; };

    async function add(e) {
      const list = [...e.target.files]; e.target.value = '';
      if (!list.length) return;
      busy = true; render();
      let n = 0;
      for (const f of list) { try { await TR.api.upload(session.id, session.token, f); n++; } catch (err) { ui.toast(f.name + ': ' + err.message); } }
      busy = false; if (n) ui.toast(n === 1 ? 'File added.' : n + ' files added.');
      load();
    }
    async function remove(f) {
      if (!(await ui.confirm({ title: 'Remove this file?', message: '“' + (f.name || 'File') + '” is removed for everyone.', confirmLabel: 'Remove', danger: true }))) return;
      try { await session.req('DELETE', '/files/' + f.id); ui.toast('Removed.'); load(); } catch (e) { ui.toast(e.message); }
    }
    function card(f) {
      const url = TR.blobUrl(f.id), img = isImage(f.mime);
      const open = () => (img ? ui.lightbox(url) : window.open(url, '_blank', 'noopener'));
      const mine = f.created_by === session.me().id;
      const thumb = h('button', { type: 'button', class: 'file-thumb', 'aria-label': 'Open ' + (f.name || 'file'), onclick: open }, img ? h('img', { src: url, alt: '', loading: 'lazy' }) : [icon('file'), h('span', {}, (f.name.split('.').pop() || 'file').slice(0, 5).toUpperCase())]);
      return h('div', { class: 'file-card' }, thumb,
        h('div', { class: 'file-info' }, h('b', {}, f.name || 'File'), h('span', { class: 'sub' }, size(f.size) + ' · ' + who(f.created_by) + ' · ' + D.short(D.key(new Date(f.created_at))))),
        mine || session.can('trip.edit') ? ui.iconButton('trash', 'Remove ' + (f.name || 'file'), () => remove(f)) : null);
    }
    function render() {
      const input = h('input', { type: 'file', hidden: true, multiple: true, accept: 'image/*,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.zip', onchange: add });
      const head = h('div', { class: 'page-head' }, h('h1', {}, 'Files'), session.can('files.write') ? [ui.button(busy ? 'Adding…' : 'Add files', { icon: 'upload', variant: 'primary', disabled: busy, onClick: () => input.click() }), input] : null);
      if (files === null) return root.replaceChildren(head, h('p', { class: 'loading' }, 'Loading files…'));
      if (!files.length) return root.replaceChildren(head, h('div', { class: 'card' }, ui.emptyState({ icon: 'file', title: 'No files yet', text: 'Keep tickets, booking PDFs and photos here. Anything shared in the chat shows up here too.', action: session.can('files.write') ? ui.button('Add a file', { icon: 'upload', variant: 'primary', onClick: () => input.click() }) : null })));
      root.replaceChildren(head, h('div', { class: 'file-grid' }, files.map(card)));
    }
    render(); load();
    const off = session.on((k) => { if (k === 'state') load(); });
    return { destroy() { dead = true; off(); } };
  }

  TR.screens = TR.screens || {};
  TR.screens.files = { mount };
})();
