/*
 * updates.js — what changed since you last looked: new messages, plans and costs added by others, people joining.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, icon = TR.icon;

  function ago(iso) {
    if (iso.length < 10) return '';
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  function mount(root, ctx) {
    const session = ctx.session;
    function open(u) {
      const g = u.go || {};
      if (g.item) { if (session.item(g.item)) TR.plan.detail(session, g.item); return; }
      if (g.screen) TR.go('/trip/' + session.id + '/' + g.screen);
    }
    function render() {
      const list = session.updates();
      const head = h('div', { class: 'page-head' }, h('h1', {}, 'Updates'), list.some((u) => u.at.length > 10) ? ui.button('Mark all as seen', { icon: 'check', onClick: () => { session.markSeen(); ui.toast('All caught up.'); } }) : null);
      if (!list.length) return root.replaceChildren(head, h('div', { class: 'card' }, ui.emptyState({ icon: 'bell', title: 'You are all caught up', text: 'New messages and changes made by other people show up here.' })));
      root.replaceChildren(head, h('div', { class: 'card-list', style: 'max-width:760px' }, list.map((u) => h('button', { type: 'button', class: 'book-card', onclick: () => open(u) },
        h('span', { class: 'tp-ic', style: '--c:var(--primary-soft)' }, icon(u.icon)),
        h('span', { class: 'book-main' }, h('span', {}, u.text.map((t, i) => (i % 2 === 0 && u.text.length > 1 ? h('b', {}, t) : t))), h('span', { class: 'sub' }, ago(u.at))),
        icon('right')))));
    }
    render();
    const off = session.on((k) => { if (k === 'state' || k === 'unread') render(); });
    return { destroy: off };
  }

  TR.screens = TR.screens || {};
  TR.screens.updates = { mount };
})();
