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
    const el = h('div', { class: cls || 'cover', style: '--c:' + (t.cover_color || '#F6C28E') });
    if (t.cover_blob) el.style.backgroundImage = 'url("' + TR.blobUrl(t.cover_blob) + '")'; else el.textContent = t.cover_emoji || '✈️';
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
        h('div', { class: 'btn-row' }, ui.button('Open a link', { icon: 'link', onClick: openLink }), ui.button('New trip', { icon: 'plus', variant: 'primary', onClick: () => TR.forms.tripSheet() })));
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
          h('div', { class: 'card' }, ui.emptyState({ icon: 'bag', title: 'No trips on this device yet', text: 'Plan a new trip, or open the link someone sent you to join theirs.',
            action: h('div', { class: 'btn-row' }, ui.button('Plan a trip', { icon: 'plus', variant: 'primary', big: true, onClick: () => TR.forms.tripSheet() }), ui.button('Open a link', { icon: 'link', big: true, onClick: openLink })) }))].filter(Boolean));
      }
      const labels = { current: 'Current', upcoming: 'Upcoming', past: 'Past', shared: 'Shared with me' };
      const seg = ui.segmented(['current', 'upcoming', 'past', 'shared'].map((k) => ({ value: k, label: labels[k] + (groups[k].length ? ' · ' + groups[k].length : '') })), tab, (v) => { tab = v; render(); }, 'Show');
      const list = groups[tab];
      root.replaceChildren(...[head, error ? h('p', { class: 'warn-box', style: 'margin-bottom:12px' }, error) : null,
        h('div', { class: 'it-bar' }, seg.el),
        list.length ? h('div', { class: 'trip-grid' }, list.map((t) => card(t, today)),
          tab === 'upcoming' ? h('button', { type: 'button', class: 'add-card', onclick: () => TR.forms.tripSheet() }, h('span', {}, icon('plus'), 'New trip')) : null)
          : h('div', { class: 'card' }, ui.emptyState({ icon: 'bag', title: 'Nothing here', text: tab === 'shared' ? 'Trips other people invite you to show up here.' : 'No ' + labels[tab].toLowerCase() + ' trips.' }))].filter(Boolean));
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
