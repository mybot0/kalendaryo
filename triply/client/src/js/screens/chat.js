/*
 * chat.js — group chat and private messages for a trip.
 * Messages arrive live through the session (see store.js); this file only draws them and sends new ones.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, cfg = TR.config, icon = TR.icon;

  const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
  const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|️|‍|\s){1,14}$/u;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Turn message text into text, links and highlighted @mentions.
  function rich(body, names) {
    const out = [];
    const alt = names.map(esc).join('|');
    const re = names.length ? new RegExp('(@(?:' + alt + '))(?![\\p{L}\\p{N}])', 'u') : null;
    const mentionSplit = (chunk) => (re ? chunk.split(re).map((p, i) => (i % 2 ? h('span', { class: 'mention' }, p) : p)) : [chunk]);
    let last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(body))) {
      if (m.index > last) out.push(...mentionSplit(body.slice(last, m.index)));
      out.push(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[1]));
      last = m.index + m[1].length;
    }
    if (last < body.length) out.push(...mentionSplit(body.slice(last)));
    return out;
  }

  const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  function dayLabel(iso) {
    const k = D.key(new Date(iso)), today = D.today();
    if (k === today) return 'Today';
    if (k === D.addDays(today, -1)) return 'Yesterday';
    return D.fmt(k, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function mount(root, ctx) {
    const session = ctx.session;
    let cur = session.openWith || 'trip';
    session.openWith = null;
    const drafts = {};
    let pending = null;   // { blob, uploading }
    let sending = false;
    root.classList.add('chat-mode');

    const wrap = h('div', { class: 'chat-wrap' });
    const threadsEl = h('div', { class: 'threads', role: 'tablist', 'aria-label': 'Conversations' });
    const msgsEl = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
    const composerEl = h('div', {});
    wrap.append(threadsEl, msgsEl, composerEl);
    root.replaceChildren(wrap);

    const canWrite = () => session.can('chat.write');
    const name = (id) => { const m = session.member(id); return m ? m.name : 'Someone'; };

    /* ----- thread buttons ----- */
    function renderThreads() {
      const u = session.state.unread, others = session.state.members.filter((m) => !m.you);
      if (cur !== 'trip' && !session.member(cur)) cur = 'trip';
      threadsEl.replaceChildren(
        h('button', { type: 'button', role: 'tab', 'aria-selected': cur === 'trip' ? 'true' : 'false', class: 'thread-btn group' + (cur === 'trip' ? ' on' : ''), onclick: () => pick('trip') },
          icon('users'), 'Group chat', u.trip ? h('span', { class: 'badge alert' }, u.trip > 99 ? '99+' : String(u.trip)) : null),
        ...others.map((m) => h('button', { type: 'button', role: 'tab', 'aria-selected': cur === m.id ? 'true' : 'false', class: 'thread-btn' + (cur === m.id ? ' on' : ''), onclick: () => pick(m.id) },
          ui.avatar(m, 32), m.name, u.dm[m.id] ? h('span', { class: 'badge alert' }, String(u.dm[m.id])) : null)));
    }

    /* ----- message list ----- */
    function activityText(m) {
      const who = m.sender_id ? name(m.sender_id) : 'Someone', meta = m.meta || {};
      const T = cfg.types[meta.type];
      const kind = T ? T.label.toLowerCase() : 'plan';
      const when = meta.date ? ' · ' + D.short(meta.date) + (meta.time ? ' ' + D.fmtTime(meta.time) : '') : '';
      switch (meta.event) {
        case 'joined': return [h('b', {}, who), ' joined the trip'];
        case 'left': return [h('b', {}, who), ' left the trip'];
        case 'added': return [h('b', {}, who), ' added ' + (/^[aeiou]/.test(kind) ? 'an ' : 'a ') + kind + ': ', h('b', {}, meta.title || ''), when];
        case 'removed': return [h('b', {}, who), ' removed ', h('b', {}, meta.title || kind)];
        default: return [h('b', {}, who), ' updated ', h('b', {}, meta.title || kind), when];
      }
    }
    function messageNode(m, prev) {
      if (m.kind === 'activity') {
        const T = cfg.types[(m.meta || {}).type];
        const it = m.item_id ? session.item(m.item_id) : null;
        const kids = [icon(m.meta && m.meta.event === 'joined' ? 'users' : T ? T.icon : 'calendar'), h('span', {}, activityText(m))];
        return it ? h('button', { type: 'button', class: 'act-pill', onclick: () => TR.plan.detail(session, it.id) }, kids) : h('div', { class: 'act-pill' }, kids);
      }
      const mine = m.sender_id === session.me().id, sender = session.member(m.sender_id);
      const same = prev && prev.kind === 'text' && prev.sender_id === m.sender_id && D.key(new Date(prev.created_at)) === D.key(new Date(m.created_at));
      const names = (m.mentions || []).map((id) => name(id));
      const col = h('div', { class: 'msg-col' });
      if (!mine && !same && cur === 'trip') col.append(h('span', { class: 'msg-name' }, sender ? sender.name : 'Former traveler'));
      if (m.blob) {
        const url = TR.blobUrl(m.blob.id);
        col.append(/^image\//.test(m.blob.mime) && m.blob.mime !== 'image/heic'
          ? h('img', { class: 'msg-img', src: url, alt: m.blob.name || 'Photo', loading: 'lazy', onclick: () => ui.lightbox(url) })
          : h('a', { class: 'msg-file', href: url, download: m.blob.name || 'file', target: '_blank', rel: 'noopener' }, icon('file'), m.blob.name || 'File'));
      }
      if (m.body) col.append(h('div', { class: 'bubble' + (EMOJI_ONLY.test(m.body) ? ' emoji-only' : '') }, rich(m.body, names)));
      col.append(h('span', { class: 'msg-time' }, clock(m.created_at)));
      return h('div', { class: 'msg' + (mine ? ' mine' : '') + (same ? ' same' : '') }, mine ? null : ui.avatar(sender, 32), col);
    }
    function renderMsgs(stick) {
      const t = session.thread(cur);
      const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 120;
      const oldH = msgsEl.scrollHeight, oldTop = msgsEl.scrollTop;
      const nodes = [];
      if (t.more) nodes.push(h('button', { type: 'button', class: 'btn ghost more', onclick: loadOlder }, 'Load earlier messages'));
      let prev = null, prevDay = '';
      t.list.forEach((m) => {
        const day = D.key(new Date(m.created_at));
        if (day !== prevDay) { nodes.push(h('div', { class: 'day-sep' }, dayLabel(m.created_at))); prevDay = day; prev = null; }
        nodes.push(messageNode(m, prev)); prev = m;
      });
      if (!t.list.length) nodes.push(t.loaded ? ui.emptyState({ icon: 'chat', title: cur === 'trip' ? 'No messages yet' : 'Say hello to ' + name(cur), text: cur === 'trip' ? 'Everyone on the trip can read this chat.' : 'Only the two of you can see this conversation.' }) : h('p', { class: 'loading' }, 'Loading…'));
      msgsEl.replaceChildren(...nodes);
      if (stick || nearBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
      else if (msgsEl.scrollHeight !== oldH) msgsEl.scrollTop = oldTop;
    }
    async function loadOlder() {
      const t = session.thread(cur); if (!t.list.length) return;
      const oldH = msgsEl.scrollHeight;
      try { await session.loadThread(cur, t.list[0].id); } catch (e) { return ui.toast(e.message); }
      renderMsgs(false); msgsEl.scrollTop = msgsEl.scrollHeight - oldH;
    }

    /* ----- composer ----- */
    let input, sendBtn, chipEl, barEl, suggestEl;
    function renderComposer() {
      if (!canWrite()) { composerEl.replaceChildren(h('p', { class: 'composer-note' }, 'The trip owner has turned off chat for viewers. You can still read messages.')); return; }
      input = h('textarea', { rows: 1, placeholder: cur === 'trip' ? 'Message the group…' : 'Message ' + name(cur) + '…', maxlength: 2000, 'aria-label': 'Message',
        oninput: () => { grow(); suggest(); updateSend(); drafts[cur] = input.value; }, onkeydown: onKey });
      input.value = drafts[cur] || '';
      if (session.draft) { input.value = session.draft; session.draft = ''; drafts[cur] = input.value; }
      const file = h('input', { type: 'file', hidden: true, accept: 'image/*,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.zip', onchange: onFile });
      sendBtn = h('button', { type: 'button', class: 'icon-btn send-btn', 'aria-label': 'Send message', title: 'Send', onclick: send }, icon('send'));
      chipEl = h('div', {}); barEl = h('div', { hidden: true }); suggestEl = h('div', { hidden: true });
      composerEl.replaceChildren(chipEl, h('div', { class: 'composer' },
        ui.iconButton('clip', 'Attach a photo or file', () => file.click()), file,
        ui.iconButton('smile', 'Add an emoji', () => { barEl.hidden = !barEl.hidden; }),
        input, sendBtn, barEl, suggestEl));
      barEl.className = 'emoji-bar';
      cfg.reactions.forEach((e) => barEl.append(h('button', { type: 'button', 'aria-label': e, onclick: () => { insert(e); barEl.hidden = true; input.focus(); } }, e)));
      grow(); updateSend(); paintChip();
    }
    const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; };
    function updateSend() { sendBtn.disabled = sending || !!(pending && pending.uploading) || (!input.value.trim() && !(pending && pending.blob)); }
    function insert(text) {
      const a = input.selectionStart == null ? input.value.length : input.selectionStart, b = input.selectionEnd == null ? a : input.selectionEnd;
      input.value = input.value.slice(0, a) + text + input.value.slice(b);
      input.selectionStart = input.selectionEnd = a + text.length; drafts[cur] = input.value; grow(); updateSend();
    }
    function onKey(e) {
      if (!suggestEl.hidden) {
        const btns = [...suggestEl.querySelectorAll('button')]; let i = btns.findIndex((b) => b.classList.contains('on'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btns[i] && btns[i].classList.remove('on'); i = (i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length; btns[i].classList.add('on'); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); (btns[i] || btns[0]).click(); return; }
        if (e.key === 'Escape') { suggestEl.hidden = true; return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); }
    }
    function suggest() {
      const before = input.value.slice(0, input.selectionStart == null ? input.value.length : input.selectionStart);
      const m = /(^|\s)@([^\s@]*)$/.exec(before);
      const list = m && cur === 'trip' ? session.state.members.filter((x) => !x.you && x.name.toLowerCase().startsWith(m[2].toLowerCase())).slice(0, 5) : [];
      suggestEl.hidden = !list.length; suggestEl.className = list.length ? 'suggest' : '';
      suggestEl.replaceChildren(...list.map((x, i) => h('button', { type: 'button', class: i ? '' : 'on', onclick: () => {
        const at = before.length - m[2].length - 1;
        input.value = input.value.slice(0, at) + '@' + x.name + ' ' + input.value.slice(before.length);
        const pos = at + x.name.length + 2; input.focus(); input.selectionStart = input.selectionEnd = pos;
        suggestEl.hidden = true; drafts[cur] = input.value; updateSend();
      } }, ui.avatar(x, 30), x.name)));
    }
    function paintChip() {
      chipEl.replaceChildren();
      if (!pending) return;
      chipEl.append(h('div', { class: 'composer-note', style: 'padding:6px 0;display:flex;gap:8px;justify-content:center;align-items:center' },
        icon(pending.blob && /^image\//.test(pending.blob.mime) ? 'image' : 'file'),
        h('span', {}, pending.uploading ? 'Uploading ' + pending.name + '…' : pending.name),
        pending.uploading ? null : h('button', { type: 'button', class: 'link-btn', onclick: () => { pending = null; paintChip(); updateSend(); } }, 'Remove')));
    }
    async function onFile(e) {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      pending = { name: f.name, uploading: true }; paintChip(); updateSend();
      try { pending.blob = await TR.api.upload(session.id, session.token, f); pending.uploading = false; }
      catch (err) { pending = null; ui.toast(err.message); }
      paintChip(); updateSend();
    }
    async function send() {
      if (sending) return;
      const body = input.value.trim();
      if (!body && !(pending && pending.blob)) return;
      sending = true; updateSend();
      try {
        await session.send(cur, body, pending && pending.blob ? pending.blob.id : undefined);
        input.value = ''; drafts[cur] = ''; pending = null; paintChip(); grow(); suggestEl.hidden = true;
        session.markRead(cur);
      } catch (e) { ui.toast(e.message); }
      sending = false; updateSend(); input.focus();
      renderMsgs(true);
    }

    /* ----- switching and loading ----- */
    async function pick(key) {
      if (key === cur && session.thread(key).loaded) return;
      drafts[cur] = input ? input.value : '';
      cur = key; session.viewing = key;
      renderThreads(); renderComposer(); renderMsgs(true);
      try { await session.loadThread(key); } catch (e) { ui.toast(e.message); }
      if (cur === key) { renderMsgs(true); if (!document.hidden) session.markRead(key); renderThreads(); }
    }
    session.viewing = cur;
    renderThreads(); renderComposer(); renderMsgs(true);
    session.loadThread(cur).then(() => { renderMsgs(true); if (!document.hidden) session.markRead(cur); renderThreads(); }, (e) => ui.toast(e.message));

    const off = session.on((k, key) => {
      if (k === 'chat' && key === cur) { renderMsgs(false); if (!document.hidden) session.markRead(cur); }
      if (k === 'unread' || k === 'chat') renderThreads();
      if (k === 'state') { renderThreads(); renderMsgs(false); if (!!(input) !== canWrite()) renderComposer(); }
    });
    const onVis = () => { if (!document.hidden) session.markRead(cur); };
    document.addEventListener('visibilitychange', onVis);
    return { destroy() { off(); document.removeEventListener('visibilitychange', onVis); session.viewing = null; root.classList.remove('chat-mode'); } };
  }

  TR.screens = TR.screens || {};
  TR.screens.chat = { mount };
})();
