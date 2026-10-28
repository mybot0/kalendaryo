/*
 * trips.js — "My Trips": every trip whose secret link is saved on this device.
 * The page sends the saved tokens to the server and gets back a summary of each one that still works.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, icon = TR.icon;

  function phase(t, today) {
    if (t.start_date && t.end_date) {
      if (t.end_date < today) return 'past';
      if (t.start_date <= today) return 'current';
      return 'upcoming';
    }
    if (t.start_date) return t.start_date < today ? 'past' : t.start_date === today ? 'current' : 'upcoming';
    return 'upcoming';
  }
  function whenText(t, ph, today) {
    if (ph === 'current') { const n = D.diff(t.start_date, today) + 1, total = t.end_date ? D.diff(t.start_date, t.end_date) + 1 : null; return 'Happening now' + (total ? ' · day ' + n + ' of ' + total : ''); }
    if (ph === 'upcoming' && t.start_date) { const n = D.diff(today, t.start_date); return n === 1 ? 'Starts tomorrow' : 'Starts in ' + TR.plural(n, 'day'); }
    if (ph === 'past') return 'Finished';
    return 'Dates not set';
  }

  TR.tripCover = function (t, cls) {
    // Your own photo if you added one; otherwise a drawn scene that matches the trip.
    if (!t.cover_blob) return TR.covers.el(TR.covers.pick(t), cls || 'cover');
    const el = h('div', { class: cls || 'cover' });
    el.style.backgroundImage = 'url("' + TR.blobUrl(t.cover_blob) + '")';
    return el;
  };

  function mount(root) {
    let trips = null, error = '', tab = null, dead = false;

    async function load() {
      const saved = TR.saved.all();
      if (!saved.length) { trips = []; return render(); }
      try {
        const r = await TR.api.call('POST', '/my-trips', { body: { tokens: saved.map((s) => s.token) } });
        if (dead) return;
        // Links the server no longer knows (trip deleted, person removed) are forgotten on this device.
        r.gone.forEach((i) => TR.saved.remove(saved[i].tripId));
        trips = r.trips; error = '';
      } catch (e) {
        if (dead) return;
        error = e.message; if (!trips) trips = [];
      }
      render();
    }

    function card(t, today) {
      const ph = phase(t, today);
      const cover = TR.tripCover(t);
      if (t.unread) cover.append(h('span', { class: 'badge alert', title: t.unread + ' unread' }, t.unread > 99 ? '99+' : String(t.unread)));
      return h('button', { type: 'button', class: 'trip-card', onclick: () => TR.go('/trip/' + t.id + '/overview') },
        cover,
        h('div', { class: 'tc-body' },
          h('span', { class: 'tc-name' }, t.name),
          h('span', { class: 'tc-when' }, whenText(t, ph, today)),
          h('div', { class: 'tc-meta' },
            h('span', {}, D.range(t.start_date, t.end_date)),
            t.destination ? h('span', {}, icon('pin'), ' ' + t.destination) : null),
          h('div', { class: 'tc-meta' },
            h('span', {}, icon('users'), ' ' + TR.plural(t.travelers, 'traveler')),
            t.role !== 'owner' ? h('span', { class: 'badge' }, t.role === 'viewer' ? 'View only' : 'Editor') : null,
            t.role !== 'owner' && t.owner_name ? h('span', {}, 'by ' + t.owner_name) : null)));
    }

    function render() {
      const today = D.today();
      const head = h('div', { class: 'page-head' }, h('h1', {}, 'My Trips'),
        h('div', { class: 'btn-row' }, ui.button('Open a link', { icon: 'link', onClick: openLink })));
      if (trips === null) return root.replaceChildren(head, h('p', { class: 'loading' }, 'Loading your trips…'));

      const groups = {
        current: trips.filter((t) => phase(t, today) === 'current'),
        upcoming: trips.filter((t) => phase(t, today) === 'upcoming'),
        past: trips.filter((t) => phase(t, today) === 'past'),
        shared: trips.filter((t) => t.role !== 'owner')
      };
      const byDate = (a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999');
      groups.upcoming.sort(byDate); groups.current.sort(byDate); groups.shared.sort(byDate);
      groups.past.sort((a, b) => byDate(b, a));
      if (!tab || !groups[tab]) tab = groups.current.length ? 'current' : groups.upcoming.length ? 'upcoming' : groups.past.length ? 'past' : 'upcoming';

      if (!trips.length) {
        return root.replaceChildren(...[head, error ? h('p', { class: 'warn-box' }, error) : null,
          h('div', { class: 'trip-grid' }, newTile(), aiTile())].filter(Boolean));
      }
      const labels = { current: 'Current', upcoming: 'Upcoming', past: 'Past', shared: 'Shared with me' };
      const seg = ui.segmented(['current', 'upcoming', 'past', 'shared'].map((k) => ({ value: k, label: labels[k] + (groups[k].length ? ' · ' + groups[k].length : '') })), tab, (v) => { tab = v; render(); }, 'Show');
      const list = groups[tab];
      root.replaceChildren(...[head, error ? h('p', { class: 'warn-box', style: 'margin-bottom:12px' }, error) : null,
        h('div', { class: 'it-bar' }, seg.el),
        tab === 'current' || tab === 'upcoming'
          ? h('div', { class: 'trip-grid' }, list.slice(0, 1).map((t) => card(t, today)), newTile(), aiTile(), list.slice(1).map((t) => card(t, today)))
          : list.length ? h('div', { class: 'trip-grid' }, list.map((t) => card(t, today)))
            : h('div', { class: 'card' }, ui.emptyState({ icon: 'bag', title: 'Nothing here', text: tab === 'shared' ? 'Trips other people invite you to show up here.' : 'No ' + labels[tab].toLowerCase() + ' trips.' }))].filter(Boolean));
    }

    // "+ New trip": a little map with a dotted path to a pin.
    function newTile() {
      return h('button', { type: 'button', class: 'new-tile', onclick: () => TR.forms.tripSheet() },
        svg('<path d="M-10 60 Q80 40 120 90 T260 70 T340 110" stroke="#E4D6BE" stroke-width="18" fill="none"/><path d="M-10 200 Q90 170 160 210 T340 190" stroke="#D5E6DA" stroke-width="30" fill="none"/>' +
          '<path d="M40 222 C90 132 150 212 200 132 S260 82 270 72" stroke="#A65E41" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" fill="none"/>' +
          '<circle cx="40" cy="222" r="7" fill="#fff" stroke="#A65E41" stroke-width="3"/><path d="M270 76 C256 60 256 42 270 38 C284 42 284 60 270 76Z" fill="#A65E41"/><circle cx="270" cy="54" r="6" fill="#fff"/>'),
        h('span', { class: 'nt-text' }, h('b', {}, 'Where to next?'), h('span', {}, 'Start a trip and invite your people.')),
        h('span', { class: 'nt-btn' }, icon('plus'), 'New trip'));
    }
    // "✨ Build a trip for me": the AI planner. It makes the trip first, then opens the planner inside it.
    function aiTile() {
      return h('button', { type: 'button', class: 'ai-tile', onclick: () => TR.forms.tripSheet({ thenPlan: true }) },
        svg('<defs><linearGradient id="aiSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22374A"/><stop offset=".55" stop-color="#C98A5E"/><stop offset="1" stop-color="#F0C48A"/></linearGradient></defs>' +
          '<rect width="320" height="280" fill="url(#aiSky)"/><circle cx="255" cy="185" r="20" fill="#FFE2A8" opacity=".9"/>' +
          '<path d="M0 225 L60 180 L110 210 L170 165 L230 205 L280 185 L320 200 V280 H0Z" fill="#3B4A5A" opacity=".9"/><path d="M0 250 L80 225 L150 245 L230 228 L320 245 V280 H0Z" fill="#26323D"/>'),
        h('span', { class: 'ai-kicker' }, '✨ Build a trip for me'),
        h('span', { class: 'ai-title' }, 'Turn your idea', h('br'), 'into a trip'),
        h('span', { class: 'ai-sub' }, 'Tell us where, when and who.', h('br'), 'We’ll plan the rest.'),
        h('span', { class: 'ai-foot' }, h('span', { class: 'ai-go' }, '✨ Start'), h('span', { class: 'ai-free' }, '🎟️ 2 free plans')));
    }
    function svg(inner) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.setAttribute('viewBox', '0 0 320 280'); el.setAttribute('preserveAspectRatio', 'xMidYMid slice'); el.setAttribute('aria-hidden', 'true'); el.setAttribute('class', 'tile-art');
      el.innerHTML = inner; return el;
    }

    function openLink() {
      const box = h('input', { type: 'text', placeholder: 'Paste a Triply link here', autofocus: true });
      const err = h('p', { class: 'form-error', role: 'alert' });
      const go = () => {
        const v = box.value.trim();
        const m = /#\/(t|join)\/([A-Za-z0-9_-]{10,})/.exec(v) || /^([A-Za-z0-9_-]{20,})$/.exec(v);
        if (!m) { err.textContent = 'That does not look like a Triply link.'; return; }
        s.close(); TR.go(m.length === 3 ? '/' + m[1] + '/' + m[2] : '/t/' + m[1]);
      };
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      const s = ui.sheet({ title: 'Open a link', body: h('div', { class: 'stack' }, h('p', { class: 'sheet-text' }, 'Paste your personal link, or an invitation someone sent you.'), box, err),
        footer: [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Open', { variant: 'primary', big: true, onClick: go })] });
    }

    render(); load();
    const offSaved = TR.saved.on(() => load());
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return { destroy() { dead = true; offSaved(); document.removeEventListener('visibilitychange', onVis); } };
  }

  TR.screens = TR.screens || {};
  TR.screens.trips = { mount };
})();
