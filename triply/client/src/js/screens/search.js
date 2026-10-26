/*
 * search.js — one box for plans, costs, packing, people, files and chat messages.
 * Everything except chat is searched in the page; chat is searched by the server (it only returns what you may read).
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, cfg = TR.config, icon = TR.icon;

  function mount(root, ctx) {
    const session = ctx.session;
    let q = '', chat = [], seq = 0, files = null, timer = null;
    const input = h('input', { type: 'search', placeholder: 'Search plans, costs, people, chat…', 'aria-label': 'Search this trip', autofocus: true, oninput: () => { q = input.value; renderResults(); remote(); } });
    const results = h('div', { class: 'stack', style: 'margin-top:14px;max-width:760px' });
    root.replaceChildren(h('div', { class: 'page-head' }, h('h1', {}, 'Search')), h('div', { style: 'max-width:760px' }, input), results);
    setTimeout(() => input.focus(), 0);
    session.req('GET', '/files').then((r) => { files = r.files; renderResults(); }, () => { files = []; });

    const norm = (s) => String(s == null ? '' : s).toLowerCase();
    const hit = (needle, ...fields) => fields.some((f) => norm(f).includes(needle));
    const mark = (text, needle) => {
      const t = String(text), i = norm(t).indexOf(needle);
      return i < 0 ? t : [t.slice(0, i), h('mark', {}, t.slice(i, i + needle.length)), t.slice(i + needle.length)];
    };
    function remote() {
      clearTimeout(timer);
      const needle = q.trim();
      if (needle.length < 2) { chat = []; renderResults(); return; }
      const mine = ++seq;
      timer = setTimeout(async () => {
        try { const r = await session.req('GET', '/search?q=' + encodeURIComponent(needle)); if (mine === seq) { chat = r.messages; renderResults(); } } catch (e) { /* the rest still works */ }
      }, 250);
    }
    const section = (title, rows) => (rows.length ? h('section', {}, h('h3', { class: 'mini-h' }, title), h('div', { class: 'card-list' }, rows)) : null);
    const row = (ic, color, title, sub, onclick) => h('button', { type: 'button', class: 'book-card', onclick },
      h('span', { class: 'tp-ic', style: '--c:' + color }, icon(ic)), h('span', { class: 'book-main' }, h('b', {}, title), sub ? h('span', { class: 'sub' }, sub) : null));

    function renderResults() {
      const needle = norm(q.trim());
      if (needle.length < 2) { results.replaceChildren(h('p', { class: 'sub' }, 'Type at least two letters. Try a place name, a confirmation number or a person.')); return; }
      const plans = session.items().filter((i) => hit(needle, i.title, i.location, i.confirmation, i.notes, ...Object.values(i.data || {}))).map((i) => {
        const T = cfg.types[i.type];
        return row(T.icon, T.color, mark(i.title, needle), [T.label, TR.plan.when(i), i.confirmation ? 'Conf. ' + i.confirmation : ''].filter(Boolean).join(' · '), () => TR.plan.detail(session, i.id));
      });
      const costs = session.expenses().filter((e) => hit(needle, e.title, e.note)).map((e) => row('cart', '#F1DC8B', mark(e.title, needle), TR.money.format(Math.round(e.amount * 100), e.currency), () => TR.go('/trip/' + session.id + '/expenses')));
      const pack = session.packing().filter((x) => hit(needle, x.title, x.category)).map((x) => row('bag', '#B4D9AA', mark(x.title, needle), (x.done ? 'Packed' : 'To pack') + (x.category ? ' · ' + x.category : ''), () => TR.go('/trip/' + session.id + '/packing')));
      const people = session.state.members.filter((m) => hit(needle, m.name)).map((m) => h('button', { type: 'button', class: 'book-card', onclick: () => TR.go('/trip/' + session.id + '/people') }, ui.avatar(m, 40), h('span', { class: 'book-main' }, h('b', {}, mark(m.name, needle)), h('span', { class: 'sub' }, m.role))));
      const fl = (files || []).filter((f) => hit(needle, f.name)).map((f) => row('file', '#A8CDEA', mark(f.name || 'File', needle), '', () => TR.go('/trip/' + session.id + '/files')));
      const msgs = chat.map((m) => {
        const from = session.member(m.sender_id), other = m.to_member ? (m.sender_id === session.me().id ? m.to_member : m.sender_id) : null;
        return row('chat', '#EFB2CB', mark(m.body.length > 120 ? m.body.slice(0, 120) + '…' : m.body, needle), (from ? from.name : 'Former traveler') + ' · ' + D.short(D.key(new Date(m.created_at))) + (other ? ' · private' : ''), () => { session.openWith = other; TR.go('/trip/' + session.id + '/chat'); });
      });
      const sections = [section('Plans & bookings', plans), section('Costs', costs), section('Packing', pack), section('People', people), section('Files', fl), section('Chat', msgs)].filter(Boolean);
      results.replaceChildren(...(sections.length ? sections : [h('div', { class: 'card' }, ui.emptyState({ icon: 'sparkle', title: 'Nothing found', text: 'No plans, costs, people or messages match “' + q.trim() + '”.' }))]));
    }
    renderResults();
    const off = session.on((k) => { if (k === 'state') renderResults(); });
    return { destroy() { clearTimeout(timer); seq++; off(); } };
  }

  TR.screens = TR.screens || {};
  TR.screens.search = { mount };
})();
