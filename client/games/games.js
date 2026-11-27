/*
 * games.js — the Games page and the full-screen game layer of Kalendaryo. Every game (Pares-Pares, Hangry Snake,
 *   Brain Train, Paper Week, Tsinelas Toss) is its own page in its own folder in games/, listed in games/games.json.
 *   Side menu → Games (a page with the game tiles), and Wall mode → Games (the same list, full screen).
 *   A game always opens full screen, with "← Games" to go back.
 *   Nothing is sent anywhere: best scores and the sound setting stay on this device (localStorage, "kal.games:").
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kal.games:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kal.games:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const COL = { tomato: '#ff5b4d', sun: '#ffc531', leaf: '#26bf72', sky: '#3d8bff', grape: '#8b5cf6', pink: '#ff7eb6', ink: '#1b1a3a' };
  const COLS = [COL.tomato, COL.sun, COL.leaf, COL.sky, COL.grape, COL.pink];
  // A full-screen layer goes inside whatever is full screen (Wall mode), otherwise on the page.
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const host = () => fsEl() || document.body;

  /* ---------- sound ---------- */
  let sound = store.get('sound', true), ac = null;
  function beep(freq, dur, type, vol) {
    if (!sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type || 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || .12, t); g.gain.exponentialRampToValueAtTime(.0001, t + (dur || .16));
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + (dur || .16) + .02);
    } catch (e) { /* no audio */ }
  }
  const SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];
  const note = (i) => beep(SCALE[Math.abs(i) % SCALE.length]);
  function voice(t) {
    if (!sound) return;
    try { if (!('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = .85; u.pitch = 1.25; speechSynthesis.speak(u); } catch (e) { /* no voice */ }
  }
  function soundChip() {
    const b = el('button', 'kg-chip'); b.type = 'button';
    const paint = () => { b.textContent = sound ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(sound)); };
    b.addEventListener('click', () => { sound = !sound; store.set('sound', sound); paint(); if (sound) note(4); else { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } } });
    paint(); return b;
  }

  /* ---------- effects ---------- */
  function confetti(n) {
    if (reduce()) n = Math.min(n, 6);
    let fx = host().querySelector(':scope > .kg-fx');
    if (!fx) { fx = el('div', 'kg-fx'); fx.setAttribute('aria-hidden', 'true'); host().append(fx); }
    for (let i = 0; i < n; i++) {
      if (fx.childElementCount > 140) break;
      const s = el('span', 'bit');
      if (Math.random() < .4) { s.textContent = pick(['🎉', '⭐', '✨', '🎈']); s.style.fontSize = rand(20, 38) + 'px'; }
      else { const w = rand(8, 14); Object.assign(s.style, { width: w + 'px', height: w * 1.5 + 'px', background: pick(COLS), border: '2px solid ' + COL.ink, borderRadius: '3px' }); }
      s.style.left = rand(0, 100) + 'vw'; fx.appendChild(s);
      const a = s.animate([{ transform: 'translate(0,-8vh) rotate(0deg)' }, { transform: 'translate(' + rand(-18, 18) + 'vw,108vh) rotate(' + rand(-720, 720) + 'deg)' }],
        { duration: rand(1500, 2800), delay: rand(0, 350), easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'both' });
      a.onfinish = () => s.remove();
    }
  }
  /* ================= every game is its own page (games/<folder>/index.html) ================= */
  // The game's own page (served unchanged by the server) fills the game area in a frame.
  // Closing removes the frame, which stops its sound and speech.
  // A game page may send its score and confetti to this bar and screen (postMessage kg:score / kg:confetti / kg:close),
  // and, if it uses the keyboard (keys: true in games.json), gets the keys pressed while Kalendaryo has the focus.
  function makeFrame(src, label, keys) {
    return function (root, api) {
      const f = document.createElement('iframe');
      f.src = src; f.title = label;
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block';
      // Esc inside the game closes it too, like the other games (the page is from this same site).
      // Short phones (iPhone SE and the like): while a ride is on, the bar above the game is put away (see games.css),
      // so the whole question fits on one screen. It comes back on the game's own first screen.
      let watch = null;
      f.addEventListener('load', () => {
        try { f.contentWindow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); api.close(); } }); } catch (e) { /* ignore */ }
        try { f.focus(); } catch (e) { /* ignore */ }
        try {
          const layer = root.closest('.kg-layer'), body = f.contentDocument.body;
          if (layer && body && typeof MutationObserver === 'function') {
            const sync = () => layer.classList.toggle('kg-riding', body.classList.contains('ride-on'));
            if (watch) watch.disconnect();
            watch = new MutationObserver(sync); watch.observe(body, { attributes: true, attributeFilter: ['class'] }); sync();
          }
        } catch (e) { /* ignore */ }
      });
      const onMsg = (e) => {
        if (e.source !== f.contentWindow || e.origin !== location.origin || !e.data) return;
        const d = e.data;
        if (d.type === 'kg:score') api.score(String(d.text));
        else if (d.type === 'kg:confetti') api.confetti(Math.max(0, Math.min(200, Number(d.n) || 0)));
        else if (d.type === 'kg:close') api.close();
      };
      window.addEventListener('message', onMsg);
      root.append(f);
      const game = {
        destroy() {
          window.removeEventListener('message', onMsg);
          if (watch) watch.disconnect();
          try { f.contentWindow.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
          f.src = 'about:blank'; f.remove();
        }
      };
      if (keys) game.key = (e) => { try { const k = f.contentWindow.__kgKey; if (k) k(e); } catch (err) { /* ignore */ } };
      return game;
    };
  }

  /* ---------- the list of games ---------- */
  // Our own drawings (no emoji) for the tiles and the title.
  const TITLE_HTML = '<svg class="kg-title-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h10a5 5 0 015 5v.5a4.5 4.5 0 01-8.1 2.7L13 15h-2l-.9 1.2A4.5 4.5 0 012 13.5V13a5 5 0 015-5zM7 11v3M5.5 12.5h3M16 11.5h.01M18 13.5h.01"/></svg><span>Games</span>';
  // Every game is its own page in its own folder (games/<folder>), listed in games/games.json,
  // put on the page by client/build.js as window.KAL_GAMES (in tile order). Each tile's icon is the game's own:
  // a drawing (icoHtml) or a picture from its folder (icoSrc), filling the tile's icon box.
  const icoImg = (src) => '<img src="' + src + '" alt="" width="78" height="78" style="display:block;width:78px;height:78px;border-radius:15px">';
  const fromList = (g) => {
    if (g.type !== 'page') return null;
    const d = { id: g.id, title: g.title, ico: g.icoHtml || icoImg(g.icoSrc), c: g.colour, blurb: g.blurb, make: makeFrame(g.route, g.title, !!g.keys) };
    if (g.titleHtml) d.titleHtml = g.titleHtml;
    if (g.logoHtml) d.logoHtml = g.logoHtml;
    if (g.oneRow) d.oneRow = true;
    return d;
  };
  const GAMES = (window.KAL_GAMES || []).map(fromList).filter(Boolean);
  function tiles() {
    const box = el('div', 'kg-tiles');
    GAMES.forEach((g) => {
      const b = el('button', 'kg-tile'); b.type = 'button'; b.dataset.game = g.id; b.style.setProperty('--c', g.c);
      b.innerHTML = '<span class="kg-tilehead"><span class="kg-ico" aria-hidden="true">' + g.ico + '</span></span><h3>' + (g.titleHtml || g.title) + '</h3><p>' + g.blurb + '</p>';
      b.addEventListener('click', () => openGame(g));
      box.append(b);
    });
    return box;
  }

  /* ---------- full-screen layers (keys, closing, cleanup) ---------- */
  const layers = []; // top of the list = the one on screen
  function openLayer(node, onClose) {
    const layer = el('div', 'kg kg-layer');
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true');
    layer.append(node);
    const entry = { layer, onClose, closed: false };
    entry.close = () => {
      if (entry.closed) return; entry.closed = true;
      clearInterval(entry.watch);
      try { onClose && onClose(); } catch (e) { /* ignore */ }
      layer.remove();
      const i = layers.indexOf(entry); if (i >= 0) layers.splice(i, 1);
      if (!layers.length) { document.documentElement.style.overflow = ''; window.removeEventListener('keydown', onKey, true); try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    };
    // If Wall mode closes underneath (it removes everything inside it), stop the game too.
    entry.watch = setInterval(() => { if (!layer.isConnected) entry.close(); }, 500);
    host().append(layer);
    if (!layers.length) { document.documentElement.style.overflow = 'hidden'; window.addEventListener('keydown', onKey, true); }
    layers.push(entry);
    try { document.activeElement && document.activeElement.blur(); } catch (e) { /* ignore */ }
    return entry;
  }
  // Keys go to the top layer only: Esc closes it (and never closes Wall mode underneath).
  function onKey(e) {
    const top = layers[layers.length - 1]; if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); top.close(); return; }
    if (top.game && top.game.key) { top.game.key(e); e.stopPropagation(); }
  }
  function openGame(def) {
    const back = el('button', 'kg-back'); back.type = 'button'; back.textContent = '← Games';
    const title = el('h2'); title.innerHTML = def.logoHtml || def.titleHtml || def.title;
    const score = el('div', 'kg-score'); score.setAttribute('aria-live', 'polite');
    const bar = el('div', 'kg-bar'); bar.append(back, title, score);
    if (def.oneRow) bar.classList.add('kg-bar-one');   // Brain Train on phones: button and title on one line
    const main = el('div', 'kg-main');
    const box = el('div'); box.style.cssText = 'display:flex;flex-direction:column;height:100%';
    box.append(bar, main);
    let game = null;
    const entry = openLayer(box, () => {
      if (game && game.destroy) game.destroy();
      // Leave full screen only if this game turned it on (Wall mode keeps its own full screen).
      if (entry.ownFs && fsEl() === entry.layer) { try { const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    });
    back.addEventListener('click', entry.close);
    // Full screen right away, like Wall mode. Not on iPhone (Safari does not allow it for web pages),
    // and not when something is already full screen (Wall mode), so Wall mode is never closed by mistake.
    // Swiping out of full screen just keeps playing in the normal window.
    if (!fsEl()) {
      const L = entry.layer, req = L.requestFullscreen || L.webkitRequestFullscreen;
      if (req) { try { const p = req.call(L); entry.ownFs = true; if (p && p.catch) p.catch(() => { entry.ownFs = false; }); } catch (e) { entry.ownFs = false; } }
    }
    const api = { score: (t) => { score.textContent = t; }, confetti, voice, note, beep, close: () => entry.close() };
    game = def.make(main, api);
    entry.game = game;
    return entry;
  }
  // From Wall mode: the games list, full screen, with "← Back to Wall".
  function openPicker() {
    const back = el('button', 'kg-back'); back.type = 'button'; back.textContent = '← Back to Wall';
    const top = el('div', 'kg-top'); top.append(back, soundChip());
    const t = el('h2', 'kg-title'); t.innerHTML = TITLE_HTML;
    const inner = el('div', 'kg-pick-in'); inner.append(top, t, tiles());
    const pickEl = el('div', 'kg-pick'); pickEl.append(inner);
    const entry = openLayer(pickEl);
    back.addEventListener('click', entry.close);
    return entry;
  }

  // kalendaryo.co/games: the games on their own page (no home, no sign-up), with a link to Kalendaryo.
  function mountStandalone(root) {
    const brand = el('a', 'kg-brand'); brand.href = '/'; brand.innerHTML = '<span class="kg-brand-pill">Kalendaryo</span>';
    const top = el('div', 'kg-top'); top.append(brand, soundChip());
    const t = el('h1', 'kg-title'); t.innerHTML = TITLE_HTML;
    const sub = el('p', 'kg-sub'); sub.textContent = 'Have fun! Free, no sign-up, no ads. Scores stay on this device.';
    const foot = el('p', 'kg-foot');
    foot.innerHTML = 'Made by <a href="/">Kalendaryo</a>, a free calendar and family board for your home. <a href="/">Try it →</a>';
    const inner = el('div', 'kg-pick-in'); inner.append(top, t, sub, tiles(), foot);
    const pg = el('main', 'kg kg-pick kg-standalone'); pg.append(inner);
    root.replaceChildren(pg);
  }

  PL.games = { openPicker, openGame: (id) => openGame(GAMES.find((g) => g.id === id)), list: GAMES, mountStandalone };

  /* ---------- the Games page (side menu) ---------- */
  PL.screens.games = {
    mount(root) {
      const page = h('div', { class: 'screen-page games-page' },
        h('header', { class: 'page-head' }, h('h1', {}, 'Games'), h('span', { class: 'kg' }, soundChip())),
        h('p', { class: 'sub' }, 'Have fun! Scores stay on this device.'),
        h('div', { class: 'kg' }, tiles()));
      root.append(page);
      return { destroy() { while (layers.length) layers[layers.length - 1].close(); } };
    }
  };
})();
