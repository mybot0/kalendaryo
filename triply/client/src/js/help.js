/*
 * help.js — "Help & ideas": a small chat window where people talk to the team (problems, ideas, questions).
 * The same file is used by Kalendaryo (client/web/help.js) and Triply (triply/client/src/js/help.js); keep them identical.
 * Each app plugs it in with HelpUI.create({ ...how to reach the server... }).
 *
 * It never opens by itself and has no overlay: a red dot on "Help & ideas" says there is a new message.
 * The window sits at the bottom right (full screen on phones) and closes with ×, Esc, or a click outside.
 */
(function () {
  if (window.HelpUI) return;
  const ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  const TAGS = [['problem', '🐞 Problem'], ['idea', '💡 Idea'], ['question', '❓ Question']];

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((k) => { if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); });
    return e;
  }
  const time = (iso) => { const d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };

  // Shrink a screenshot in the browser so it stays small (longest side 1280px, JPEG).
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        let q = 0.82, out = c.toDataURL('image/jpeg', q);
        while (out.length > 850 * 1024 && q > 0.4) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')); };
      img.src = url;
    });
  }

  /*
   * opts: {
   *   app: 'Kalendaryo' | 'Triply',
   *   ready(): true when there is someone to chat as (a home or trip is open),
   *   get() -> { team, messages, unread }, unread() -> { unread }, send({ body, tag, image }) -> { message }, seen(),
   *   demo: optional, a sample conversation to show without a server
   * }
   */
  function create(opts) {
    const buttons = new Set();
    let unread = 0, panel = null, state = null, tag = '', image = null, pollT = null, openPollT = null, busy = false;

    function paintButtons() {
      buttons.forEach((b) => {
        if (b.isConnected) b._shown = true;
        else if (b._shown) { buttons.delete(b); return; } // it was on the page and is gone now (the page was redrawn)
        const dot = b.querySelector('.help-dot');
        if (dot) dot.hidden = !(unread > 0);
        b.hidden = !opts.ready();
        b.setAttribute('aria-label', 'Help & ideas' + (unread ? ', ' + unread + ' new' : ''));
      });
    }
    function button(cls) {
      const b = el('button', { type: 'button', class: cls || 'nav-btn help-btn', onclick: () => (panel ? close() : open()) });
      b.innerHTML = ICON;
      b.append(el('span', { class: 'nav-label' }, 'Help & ideas'), el('span', { class: 'help-dot', hidden: true }));
      buttons.add(b); paintButtons();
      return b;
    }
    async function checkUnread() {
      if (!opts.ready() || opts.demo) { unread = opts.demo && opts.ready() && !(state && state.seen) ? 1 : 0; return paintButtons(); }
      try { unread = (await opts.unread()).unread || 0; } catch (e) { /* offline: try later */ }
      paintButtons();
    }
    function startPolling() {
      clearInterval(pollT);
      pollT = setInterval(() => { if (!document.hidden && !panel) checkUnread(); }, 3 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && !panel) checkUnread(); });
    }

    /* ----- the window ----- */
    const list = el('div', { class: 'help-msgs', role: 'log', 'aria-live': 'polite' });
    const input = el('textarea', { rows: 1, maxlength: 2000, placeholder: 'Type a message…', 'aria-label': 'Your message' });
    const err = el('p', { class: 'help-err', role: 'alert', hidden: true });
    const chip = el('div', { class: 'help-chip', hidden: true });
    const fileIn = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const sendBtn = el('button', { type: 'button', class: 'help-send', 'aria-label': 'Send' }, '➤');
    const tagRow = el('div', { class: 'help-tags', role: 'group', 'aria-label': 'What is it about?' });

    function paintTags() {
      tagRow.replaceChildren(...TAGS.map(([k, label]) => el('button', { type: 'button', class: 'help-tag' + (tag === k ? ' on' : ''), 'aria-pressed': tag === k ? 'true' : 'false', onclick: () => { tag = tag === k ? '' : k; paintTags(); } }, label)));
    }
    function paintMsgs() {
      const team = (state && state.team) || opts.app + ' team';
      const kids = (state ? state.messages : []).map((m) => el('div', { class: 'help-msg' + (m.team ? ' team' : ' me') },
        m.team ? el('span', { class: 'help-by' }, team) : null,
        m.image ? el('img', { class: 'help-img', src: m.image, alt: 'Screenshot', onclick: (e) => e.target.classList.toggle('big') }) : null,
        m.body ? el('div', { class: 'help-bubble' }, (m.tag ? TAGS.find((t) => t[0] === m.tag)[1].split(' ')[0] + ' ' : '') + m.body) : null,
        el('span', { class: 'help-time' }, time(m.at))));
      if (!state) kids.push(el('p', { class: 'help-loading' }, 'Loading…'));
      list.replaceChildren(...kids);
      list.scrollTop = list.scrollHeight;
    }
    function paintChip() {
      chip.hidden = !image;
      chip.replaceChildren(...(image ? [el('img', { src: image, alt: '' }), el('span', {}, 'Screenshot added'), el('button', { type: 'button', 'aria-label': 'Remove screenshot', onclick: () => { image = null; paintChip(); } }, '×')] : []));
    }
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0]; fileIn.value = '';
      if (!f) return;
      try { image = await shrink(f); err.hidden = true; } catch (e) { err.textContent = e.message; err.hidden = false; }
      paintChip();
    });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    sendBtn.addEventListener('click', () => send());

    async function load() {
      if (opts.demo) { state = state || { team: opts.app + ' team', messages: opts.demo.slice(), seen: true }; state.seen = true; unread = 0; paintButtons(); return paintMsgs(); }
      try { state = await opts.get(); paintMsgs(); if (state.unread) { unread = 0; paintButtons(); opts.seen().catch(() => {}); } }
      catch (e) { list.replaceChildren(el('p', { class: 'help-loading' }, (e && (e.userMessage || e.message)) || 'Could not load the chat.')); }
    }
    async function send() {
      const body = input.value.trim();
      if (busy || (!body && !image)) return;
      busy = true; sendBtn.disabled = true; err.hidden = true;
      try {
        if (opts.demo) state.messages.push({ team: false, tag, body, image, at: new Date().toISOString() }, { team: true, body: 'This is a demo home, so messages are not sent. In your own ' + (opts.app === 'Triply' ? 'trip' : 'home') + ', the team reads every message. 💛', at: new Date().toISOString() });
        else { const r = await opts.send({ body, tag, image }); state.messages.push(r.message); }
        input.value = ''; input.style.height = ''; image = null; tag = ''; paintChip(); paintTags(); paintMsgs();
      } catch (e) { err.textContent = (e && (e.userMessage || e.message)) || 'Could not send. Try again.'; err.hidden = false; }
      busy = false; sendBtn.disabled = false; input.focus();
    }

    function onDocDown(e) { if (panel && !panel.contains(e.target) && ![...buttons].some((b) => b.contains(e.target))) close(); }
    function onKey(e) { if (e.key === 'Escape' && panel) close(); }
    function open() {
      if (panel || !opts.ready()) return;
      paintTags(); paintChip(); state = opts.demo ? state : null; paintMsgs();
      panel = el('section', { class: 'help-panel', role: 'dialog', 'aria-label': 'Help & ideas' },
        el('header', { class: 'help-head' }, el('span', { class: 'help-ic' }), el('div', { class: 'help-title' }, el('b', {}, 'Help & ideas'), el('span', {}, opts.app + ' · we usually reply within a day')),
          el('button', { type: 'button', class: 'help-x', 'aria-label': 'Close', onclick: close }, '×')),
        tagRow, list, err,
        el('div', { class: 'help-compose' }, chip, el('div', { class: 'help-row' }, el('button', { type: 'button', class: 'help-attach', 'aria-label': 'Add a screenshot', onclick: () => fileIn.click() }, '📎'), input, sendBtn, fileIn)));
      panel.querySelector('.help-ic').innerHTML = ICON;
      document.body.append(panel);
      setTimeout(() => { document.addEventListener('mousedown', onDocDown); document.addEventListener('touchstart', onDocDown); }, 0);
      document.addEventListener('keydown', onKey);
      buttons.forEach((b) => b.classList.add('on'));
      load(); input.focus();
      if (!opts.demo) openPollT = setInterval(() => { if (!document.hidden && !busy) opts.get().then((s) => { if (s.messages.length !== state.messages.length) { state = s; paintMsgs(); if (s.unread) opts.seen().catch(() => {}); } }, () => {}); }, 20000);
    }
    function close() {
      if (!panel) return;
      panel.remove(); panel = null; clearInterval(openPollT);
      document.removeEventListener('mousedown', onDocDown); document.removeEventListener('touchstart', onDocDown); document.removeEventListener('keydown', onKey);
      buttons.forEach((b) => b.classList.remove('on'));
    }

    startPolling();
    return { button, open, close, refresh: () => { close(); state = null; checkUnread(); }, unread: () => unread };
  }

  window.HelpUI = { create };
})();
