/*
 * owner-section.js — the KalRadio section of the owner view (/owner). Served at /radio/owner-section.js.
 * The owner page shows it with window.KalRadioOwner.el(api) (TOUCH POINT R7); `api` is the owner page's own
 * request helper, so the owner key never leaves that page. The section keeps its own element between the
 * owner page's 30-second refreshes and loads its own data every minute.
 */
(function () {
  'use strict';
  let el = null, api = null, data = null, timer = null, busy = false, msg = '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (t) => (t ? new Date(Number(t)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) + ' ' : '');
  const link = (u, t) => (/^https?:\/\//i.test(u || '') ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(t || u) + '</a>' : '');
  const review = (id) => '/radio#review' + (id ? '-' + encodeURIComponent(id) : '');
  const ACTION = { removed: 'Removed', restored: 'Restored', approved: 'Approved', rejected: 'Rejected', saved: 'Saved', 'set to pending': 'Set to pending' };

  const css = `
.kr .kr-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.kr .kr-head h2 { margin: 0; }
.kr .kr-head a.go { margin-left: auto; text-decoration: none; background: var(--primary); color: #fff; font-weight: 700; border-radius: 999px; padding: 9px 16px; }
.kr .kr-tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.kr .kr-tile { background: #F8F7F3; border-radius: 14px; padding: 12px; }
.kr .kr-tile b { display: block; font: 800 26px 'Outfit', sans-serif; }
.kr .kr-tile span { color: var(--ink-2); font-size: 13px; font-weight: 700; }
.kr .kr-tile.warn b { color: #B3402F; }
.kr .kr-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.kr h3 { font: 700 16px 'Outfit', sans-serif; margin: 18px 0 6px; }
.kr .r { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid #F0EEE8; }
.kr td { vertical-align: middle; }
.kr td.wrap { white-space: normal; min-width: 180px; }
.kr .ok { color: #2F7D55; font-weight: 700; } .kr .no { color: #8A948C; }
.kr .rules { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.kr .rules input { font: inherit; border: 1.5px solid #E4E2DA; border-radius: 10px; padding: 8px 10px; min-width: 160px; }
.kr .msg { color: #2F7D55; font-weight: 700; min-height: 1.2em; }
.kr .kr-btn { font: 700 14px 'Figtree', sans-serif; border: 0; cursor: pointer; border-radius: 999px; min-height: 36px; padding: 0 14px; display: inline-flex; align-items: center; gap: 6px; background: var(--primary-soft); color: var(--primary-ink); text-decoration: none; }
.kr .kr-del { background: #FBE9E5; color: #B3402F; }
.kr a:not(.kr-btn):not(.go) { color: var(--primary-ink, #2F5A4A); font-weight: 700; }
.kr .new { background: #B3402F; color: #fff; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 800; }
@media (max-width: 760px) { .kr .kr-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kr .kr-cols { grid-template-columns: 1fr; } }`;

  async function load() {
    clearTimeout(timer);
    if (!el || !el.isConnected) { timer = setTimeout(load, 60000); return; }
    try { data = await api('GET', '/api/owner/radio'); paint(); } catch (e) { if (!data) { el.innerHTML = '<h2><span class="pill">RADIO</span> KalRadio</h2><p class="note">Could not load KalRadio. Trying again…</p>'; } }
    timer = setTimeout(load, 60000);
  }
  async function act(url, body, done) {
    if (busy) return; busy = true;
    try { await api('POST', url, body); msg = done || 'Done.'; await load(); }
    catch (e) { alert(e.message); }
    busy = false;
  }

  function paint() {
    const d = data, t = (n, l, warn) => '<div class="kr-tile' + (warn && n ? ' warn' : '') + '"><b>' + n + '</b><span>' + l + '</span></div>';
    const open = d.requests.filter((x) => !x.done);
    const rows = (list, f, empty) => (list.length ? list.map(f).join('') : '<p class="empty">' + empty + '</p>');
    const top = (list) => rows(list, (s) => '<div class="r"><span>' + esc(s.name || s.id) + (s.country ? ' <span class="note">· ' + esc(s.country) + '</span>' : '') + '</span><b>' + s.n + '</b></div>', 'No plays yet.');
    el.innerHTML =
      '<div class="kr-head"><h2><span class="pill">RADIO</span> KalRadio</h2>' + (open.length ? '<span class="new">' + open.length + ' new</span>' : '') +
      '<a class="go" href="' + review() + '" target="_blank" rel="noopener">Find stations to approve ↗</a></div>' +
      '<div class="kr-tiles">' + t(d.visitors.n1, 'Radio visitors today') + t(d.visitors.n7, 'Radio visitors, 7 days') + t(d.plays7, 'Plays, 7 days') +
        t(d.approved.length, 'Approved stations') + t(d.removed.length, 'Removed stations', true) + '</div>' +
      '<div class="kr-cols"><div><h3>Top stations, 7 days</h3>' + top(d.top7) + '<h3>Top stations, 30 days</h3>' + top(d.top30) + '</div>' +
        '<div><h3>Where radio visitors are</h3>' + rows(d.places, (p) => '<div class="r"><span>' + flag(p.cc) + esc(p.city ? p.city + ', ' + p.country : p.country) + '</span><b>' + p.n + '</b></div>', 'No places yet.') +
        '<p class="note">Last 30 days, real people only. Plays are counted per station, never per person.</p></div></div>' +
      (open.length ? '<h3>Asked to be added</h3><div class="scroll"><table><tr><th>When</th><th>Station</th><th>Contact</th><th>Links</th><th>Message</th><th></th></tr>' +
        open.map((q) => '<tr><td>' + when(q.at) + '</td><td>' + esc(q.station_name) + '</td><td>' + esc(q.contact_name) + '<br>' + esc(q.email) + '</td><td>' +
          link(q.website, 'Website') + (q.stream_url ? '<br>' + link(q.stream_url, 'Stream') : '') + '</td><td class="wrap">' + esc(q.message) + '</td><td><div class="acts">' +
          '<a class="kr-btn" href="' + review() + '" target="_blank" rel="noopener">Find &amp; review ↗</a><button class="kr-btn" data-done="' + q.id + '">Done</button></div></td></tr>').join('') + '</table></div>' : '') +
      '<h3>Removed stations</h3>' + (d.removed.length ? '<div class="scroll"><table><tr><th>When</th><th>Station</th><th>By</th><th>Reason</th><th></th></tr>' +
        d.removed.map((s) => '<tr><td>' + when(s.at) + '</td><td>' + esc(s.name || s.id) + (s.country ? '<br><span class="note">' + esc(s.country) + '</span>' : '') + '</td><td>' +
          (s.by_whom === 'public' ? 'Station owner' : 'You') + '</td><td class="wrap">' + esc(s.reason) + '</td><td><div class="acts"><button class="kr-btn" data-restore="' + esc(s.id) + '">Restore</button></div></td></tr>').join('') + '</table></div>'
        : '<p class="empty">No removed stations.</p>') +
      '<h3>Approved stations</h3>' + (d.approved.length ? '<div class="scroll"><table><tr><th>Station</th><th>Plays in</th><th>Permission</th><th>Website</th><th></th></tr>' +
        d.approved.map((s) => '<tr><td>' + flag(s.country_code) + esc(s.name) + '<br><span class="note">' + esc([s.city, s.country].filter(Boolean).join(', ')) + '</span></td><td>' +
          (s.territories_allowed === '*' ? 'Everywhere*' : esc(s.territories_allowed)) + '</td><td>' + (s.permission_received ? '<span class="ok">Yes</span>' : '<span class="no">Not yet</span>') + '</td><td>' +
          link(s.official_website, 'Open') + '</td><td><div class="acts"><a class="kr-btn" href="' + review(s.id) + '" target="_blank" rel="noopener">Edit ↗</a><button class="kr-btn kr-del" data-remove="' + esc(s.id) + '" data-name="' + esc(s.name) + '">Remove</button></div></td></tr>').join('') +
        '</table></div><p class="note">*Everywhere, except the country rule below.</p>' : '<p class="empty">No approved stations yet. Use “Find stations to approve”.</p>') +
      (d.rejected.length ? '<h3>Rejected (' + d.rejected.length + ')</h3>' + d.rejected.map((s) => '<div class="r"><span>' + esc(s.name || s.id) + (s.note ? ' <span class="note">· ' + esc(s.note) + '</span>' : '') + '</span><a class="kr-btn" href="' + review(s.id) + '" target="_blank" rel="noopener">Review ↗</a></div>').join('') : '') +
      '<h3>Country rule</h3><div class="rules"><label for="kr-restricted">Listeners in these countries can only play stations from their own country:</label>' +
        '<input id="kr-restricted" value="' + esc((d.rules.restricted || []).join(', ')) + '" placeholder="GB"><button class="kr-btn" data-rules>Save</button></div>' +
        '<p class="note">Two-letter codes, like GB. GB is there because of the UK TuneIn ruling. Visitors whose country can’t be found can’t play stations here; they get the station’s website instead.</p>' +
      '<h3>History</h3>' + (d.history.length ? '<div class="scroll"><table><tr><th>When</th><th>Station</th><th>What</th><th>By</th><th>Reason / note</th></tr>' +
        d.history.map((h) => '<tr><td>' + when(h.at) + '</td><td>' + esc(h.name || h.id) + '</td><td>' + esc(ACTION[h.action] || h.action) + '</td><td>' + (h.by_whom === 'public' ? 'Station owner' : 'You') + '</td><td class="wrap">' + esc(h.reason) + '</td></tr>').join('') + '</table></div>'
        : '<p class="empty">Nothing yet.</p>') +
      '<p class="msg" role="status">' + esc(msg) + '</p>';
    msg = '';
    el.querySelectorAll('[data-done]').forEach((b) => (b.onclick = () => act('/api/owner/radio/request', { id: Number(b.dataset.done), done: true }, 'Marked as done.')));
    el.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => {
      const r = await api('GET', '/api/owner/radio/station?id=' + encodeURIComponent(b.dataset.restore)).catch((e) => { alert(e.message); return null; });
      if (r && r.station) act('/api/owner/radio/station', Object.assign({}, r.station, { id: r.station.station_uuid, action: 'restore' }), 'Restored.');
    }));
    el.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => {
      const reason = prompt('Why are you removing “' + b.dataset.name + '”? (a few words, saved in the history)');
      if (reason == null) return;
      const r = await api('GET', '/api/owner/radio/station?id=' + encodeURIComponent(b.dataset.remove)).catch((e) => { alert(e.message); return null; });
      if (r && r.station) act('/api/owner/radio/station', Object.assign({}, r.station, { id: r.station.station_uuid, action: 'remove', reason }), 'Removed.');
    }));
    const rb = el.querySelector('[data-rules]');
    if (rb) rb.onclick = () => act('/api/owner/radio/settings', { restricted: el.querySelector('#kr-restricted').value }, 'Country rule saved.');
  }

  window.KalRadioOwner = {
    el(ownerApi) {
      api = ownerApi;
      if (!el) {
        const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
        el = document.createElement('section'); el.className = 'card kr'; el.id = 'kalradio';
        el.innerHTML = '<h2><span class="pill">RADIO</span> KalRadio</h2><p class="note">Loading…</p>';
        setTimeout(() => { load().then(() => { if (location.hash === '#kalradio') el.scrollIntoView({ block: 'start' }); }); }, 0);
      }
      return el;
    }
  };
})();
