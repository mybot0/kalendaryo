/*
 * games.js — Games for the kids (from Keybop): Memory Match and Snack Snake.
 *   Side menu → Games (a page with the game tiles), and Wall mode → 🎮 Games (the same list, full screen).
 *   A game always opens full screen, with "← Games" to go back.
 *   Nothing is sent anywhere: best scores and the sound setting stay on this device (localStorage, "kal.games:").
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kal.games:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kal.games:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const coarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const COL = { tomato: '#ff5b4d', sun: '#ffc531', leaf: '#26bf72', sky: '#3d8bff', grape: '#8b5cf6', pink: '#ff7eb6', ink: '#1b1a3a' };
  const COLS = [COL.tomato, COL.sun, COL.leaf, COL.sky, COL.grape, COL.pink];
  // A full-screen layer goes inside whatever is full screen (Wall mode), otherwise on the page.
  const host = () => document.fullscreenElement || document.webkitFullscreenElement || document.body;

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
  function panel(root, title, text, btns) {
    const p = el('div', 'kg-panel'), c = el('div', 'kg-pcard'), hd = el('h3'), t = el('p');
    hd.textContent = title; t.textContent = text; c.append(hd, t);
    btns.forEach(([label, fn]) => { const b = el('button', 'kg-big'); b.type = 'button'; b.textContent = label; b.onclick = () => { p.remove(); fn(); }; c.append(b); });
    p.append(c); root.append(p);
    const f = c.querySelector('button'); if (f) f.focus();
  }
  function rr(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ================= Memory Match ================= */
  // Card counts per level, chosen so every row is full and the cards fill the screen.
  // Phones stop at 32 cards (about 80px each); tablets at 54 cards (about 110px each).
  const PHONE_PAIRS = [6, 9, 14, 16];
  const TABLET_PAIRS = [6, 10, 12, 20, 24, 27];
  const POOL = ['🐶', '🐱', '🦊', '🐸', '🐼', '🦁', '🐙', '🦄', '🐢', '🦋', '🍓', '🍕', '🚀', '🚂', '⚽', '🎈', '🌈', '🍩', '🐝', '🐳',
    '🦒', '🍉', '🚁', '🐨', '🧁', '🦀', '🍌', '🚲', '🐧', '🌵'];
  function makeMemory(root, api) {
    const isPhone = Math.min(innerWidth, innerHeight) < 600;
    const LEVELS = isPhone ? PHONE_PAIRS : TABLET_PAIRS;
    let lv = 0, pairs = LEVELS[0], flipped = [], matched = 0, moves = 0, lock = false;
    const timers = [];
    const wrap = el('div', 'kg-mem'); root.append(wrap);
    const label = () => api.score('Level ' + (lv + 1) + ' · Moves ' + moves);
    function deal() {
      moves = 0; matched = 0; flipped = []; lock = false; label();
      const set = shuffle(POOL).slice(0, pairs), grid = el('div', 'kg-mgrid');
      shuffle([...set, ...set]).forEach((v) => {
        const c = el('button', 'kg-mcard'); c.type = 'button'; c.dataset.v = v; c.setAttribute('aria-label', 'card');
        c.innerHTML = '<span class="kg-minner"><span class="kg-mface q">?</span><span class="kg-mface v">' + v + '</span></span>';
        c.addEventListener('click', () => flip(c)); grid.append(c);
      });
      wrap.replaceChildren(grid); fit();
    }
    // Square cards as big as the screen allows; among sizes within 8% of the biggest, use the most columns
    // whose rows are all full (so the grid fills the width and no row is half empty).
    function fit() {
      const g = wrap.firstChild; if (!g || !wrap.clientWidth) return;
      const n = pairs * 2, gap = 10, W = wrap.clientWidth - 32, H = wrap.clientHeight - 28, opts = [];
      for (let c = 2; c <= 10; c++) { const r = Math.ceil(n / c); opts.push({ c, s: Math.floor(Math.min((W - gap * (c - 1)) / c, (H - gap * (r - 1)) / r)) }); }
      const maxS = Math.max(...opts.map((o) => o.s)), near = opts.filter((o) => o.s >= maxS * .92), full = near.filter((o) => n % o.c === 0);
      const best = (full.length ? full : near).pop();
      Object.assign(g.style, { gap: gap + 'px', gridTemplateColumns: 'repeat(' + best.c + ',' + best.s + 'px)', gridAutoRows: best.s + 'px' });
      g.querySelectorAll('.kg-mface').forEach((f) => { f.style.fontSize = Math.floor(best.s * .5) + 'px'; });
    }
    const ro = new ResizeObserver(fit); ro.observe(wrap);
    function flip(c) {
      if (lock || c.classList.contains('up')) return;
      c.classList.add('up'); api.note(flipped.length + 2); flipped.push(c);
      if (flipped.length < 2) return;
      moves++; label();
      const [a, b] = flipped;
      if (a.dataset.v === b.dataset.v) {
        a.classList.add('done'); b.classList.add('done'); flipped = []; matched++;
        api.note(7); api.voice('Match!');
        if (matched === pairs) win();
      } else {
        lock = true;
        timers.push(setTimeout(() => { a.classList.remove('up'); b.classList.remove('up'); flipped = []; lock = false; }, 850));
      }
    }
    function win() {
      const key = 'best:memory:' + pairs, prev = store.get(key, 0);
      if (!prev || moves < prev) store.set(key, moves);
      const best = Math.min(prev || moves, moves), last = lv === LEVELS.length - 1;
      api.confetti(70);
      timers.push(setTimeout(() => {
        panel(root, last ? 'You did every level!' : 'All matched!', 'Done in ' + moves + ' moves. Best for this level: ' + best + '.', [
          [last ? 'Play again' : 'Next level', () => { if (!last) { lv++; pairs = LEVELS[lv]; } deal(); }]
        ]);
      }, 700));
    }
    deal();
    return { destroy() { timers.forEach(clearTimeout); ro.disconnect(); } };
  }

  /* ================= Snack Snake ================= */
  function makeSnake(root, api) {
    const N = 16; // squares on the short side; the long side gets more, so the board fills the screen
    let NX = N, NY = N;
    const wrap = el('div', 'kg-snake'), cv = el('canvas'), pad = el('div', 'kg-dpad' + (coarse() ? ' on' : ''));
    cv.setAttribute('aria-label', 'Snack Snake board');
    pad.innerHTML = '<button class="u" type="button" aria-label="Up">▲</button><button class="l" type="button" aria-label="Left">◀</button><button class="d" type="button" aria-label="Down">▼</button><button class="r" type="button" aria-label="Right">▶</button>';
    wrap.append(cv, pad); root.append(wrap);
    const ctx = cv.getContext('2d');
    let cell = 20, sized = false;
    function size() {
      if (!root.clientWidth) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const padH = pad.classList.contains('on') ? (pad.offsetHeight || 180) + 34 : 40;
      const aw = root.clientWidth - 32, ah = root.clientHeight - padH;
      if (!sized) { cell = Math.max(12, Math.floor(Math.min(aw, ah) / N)); NX = Math.max(N, Math.floor(aw / cell)); NY = Math.max(N, Math.floor(ah / cell)); sized = true; }
      cell = Math.max(10, Math.floor(Math.min(aw / NX, ah / NY)));
      const BW = cell * NX, BH = cell * NY;
      cv.width = BW * dpr; cv.height = BH * dpr; cv.style.width = BW + 'px'; cv.style.height = BH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const ro = new ResizeObserver(size); ro.observe(root);
    let snake, dir, moved, apple, eaten, ms, acc, last, raf, started, flash, best = store.get('best:snake', 0);
    const label = () => api.score('🍎 ' + eaten + ' · best ' + best);
    function placeApple() {
      let p;
      do { p = { x: Math.floor(Math.random() * NX), y: Math.floor(Math.random() * NY) }; } while (snake.some((s) => s.x === p.x && s.y === p.y));
      apple = p;
    }
    function reset() {
      const cx = Math.floor(NX / 2), cy = Math.floor(NY / 2);
      snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }]; dir = { x: 1, y: 0 }; moved = { x: 0, y: 0 };
      eaten = 0; ms = 150; acc = 0; last = 0; started = false; flash = 0; placeApple(); label();
    }
    function setDir(dx, dy) {
      if (!started) {
        const hd = snake[0];
        snake = [hd, { x: (hd.x - dx + NX) % NX, y: (hd.y - dy + NY) % NY }, { x: (hd.x - 2 * dx + NX + NX) % NX, y: (hd.y - 2 * dy + NY + NY) % NY }];
        dir = { x: dx, y: dy }; started = true; return;
      }
      if (dx === -moved.x && dy === -moved.y) return;
      dir = { x: dx, y: dy };
    }
    function step() {
      moved = dir;
      const hx = (snake[0].x + dir.x + NX) % NX, hy = (snake[0].y + dir.y + NY) % NY;
      const grow = hx === apple.x && hy === apple.y;
      const bodyCells = grow ? snake : snake.slice(0, -1);
      const idx = bodyCells.findIndex((s) => s.x === hx && s.y === hy);
      if (idx >= 0) { snake = bodyCells.slice(0, Math.max(3, idx)); flash = 1; api.beep(180, .25, 'sawtooth', .08); }
      else snake = bodyCells;
      snake.unshift({ x: hx, y: hy });
      if (grow) {
        eaten++; ms = Math.max(85, 150 - eaten * 4);
        if (eaten > best) { best = eaten; store.set('best:snake', best); }
        label(); api.note(eaten); api.confetti(5); placeApple();
      }
    }
    function draw() {
      const bw = cell * NX, bh = cell * NY;
      for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { ctx.fillStyle = (x + y) % 2 ? '#cdeed6' : '#dff5e3'; ctx.fillRect(x * cell, y * cell, cell, cell); }
      ctx.font = Math.floor(cell * .8) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🍎', apple.x * cell + cell / 2, apple.y * cell + cell / 2 + 1);
      snake.forEach((s, i) => {
        const p = i === 0 ? 1 : 3;
        ctx.fillStyle = COL.leaf; rr(ctx, s.x * cell + p, s.y * cell + p, cell - p * 2, cell - p * 2, cell * .32); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = COL.ink; ctx.stroke();
      });
      const hd = snake[0], ex = hd.x * cell + cell / 2 + dir.x * cell * .12, ey = hd.y * cell + cell / 2 + dir.y * cell * .12;
      const ox = dir.y !== 0 ? cell * .2 : 0, oy = dir.y !== 0 ? 0 : cell * .2;
      [[-1, -1], [1, 1]].forEach(([a, b]) => {
        const px = ex + (dir.y !== 0 ? a * ox : 0), py = ey + (dir.y !== 0 ? 0 : b * oy);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, cell * .13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(px + dir.x * cell * .03, py + dir.y * cell * .03, cell * .07, 0, Math.PI * 2); ctx.fill();
      });
      if (flash > 0) { ctx.fillStyle = 'rgba(255,91,77,' + (flash * .3).toFixed(2) + ')'; ctx.fillRect(0, 0, bw, bh); }
      if (!started) {
        ctx.fillStyle = 'rgba(27,26,58,.55)'; ctx.fillRect(0, bh / 2 - cell * 1.4, bw, cell * 2.8);
        ctx.fillStyle = '#fff'; ctx.font = '400 ' + Math.floor(cell * 1.05) + 'px "Lilita One","Trebuchet MS",sans-serif';
        ctx.fillText(coarse() ? 'Swipe or tap arrows' : 'Press an arrow key', bw / 2, bh / 2);
      }
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, last ? ts - last : 0); last = ts;
      if (started) { acc += dt; while (acc >= ms) { acc -= ms; step(); } }
      flash = Math.max(0, flash - dt / 900);
      draw();
    }
    let sx = 0, sy = 0;
    cv.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    cv.addEventListener('pointerup', (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0); else setDir(0, dy > 0 ? 1 : -1);
    });
    [['.u', 0, -1], ['.l', -1, 0], ['.d', 0, 1], ['.r', 1, 0]].forEach(([s, dx, dy]) => {
      pad.querySelector(s).addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(dx, dy); });
    });
    reset(); raf = requestAnimationFrame(frame);
    const KEYS = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
    return {
      key(e) { const k = KEYS[e.key]; if (k) { e.preventDefault(); setDir(k[0], k[1]); } },
      destroy() { cancelAnimationFrame(raf); ro.disconnect(); }
    };
  }

  /* ---------- the list of games ---------- */
  const GAMES = [
    { id: 'memory', title: 'Memory Match', ico: '🃏', c: COL.grape, age: 'Ages 3–8', blurb: 'Flip two cards at a time and find every pair.', make: makeMemory },
    { id: 'snake', title: 'Snack Snake', ico: '🐍', c: COL.tomato, age: 'Ages 6+', blurb: 'Steer the snake to the apples. Walls wrap around, so nobody crashes.', make: makeSnake }
  ];
  function tiles() {
    const box = el('div', 'kg-tiles');
    GAMES.forEach((g) => {
      const b = el('button', 'kg-tile'); b.type = 'button'; b.dataset.game = g.id; b.style.setProperty('--c', g.c);
      b.innerHTML = '<span class="kg-tilehead"><span class="kg-ico" aria-hidden="true">' + g.ico + '</span><span class="kg-age">' + g.age + '</span></span><h3>' + g.title + '</h3><p>' + g.blurb + '</p>';
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
    const title = el('h2'); title.textContent = def.title;
    const score = el('div', 'kg-score'); score.setAttribute('aria-live', 'polite');
    const bar = el('div', 'kg-bar'); bar.append(back, title, score);
    const main = el('div', 'kg-main');
    const box = el('div'); box.style.cssText = 'display:flex;flex-direction:column;height:100%';
    box.append(bar, main);
    let game = null;
    const entry = openLayer(box, () => { if (game && game.destroy) game.destroy(); });
    back.addEventListener('click', entry.close);
    const api = { score: (t) => { score.textContent = t; }, confetti, voice, note, beep };
    game = def.make(main, api);
    entry.game = game;
    return entry;
  }
  // From Wall mode: the games list, full screen, with "← Back to Wall".
  function openPicker() {
    const back = el('button', 'kg-back'); back.type = 'button'; back.textContent = '← Back to Wall';
    const top = el('div', 'kg-top'); top.append(back, soundChip());
    const t = el('h2', 'kg-title'); t.textContent = '🎮 Games';
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
    const t = el('h1', 'kg-title'); t.textContent = '🎮 Games';
    const sub = el('p', 'kg-sub'); sub.textContent = 'Free games for kids. No sign-up, no ads. Scores stay on this device.';
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
        h('p', { class: 'sub' }, 'For the kids. Scores stay on this device.'),
        h('div', { class: 'kg' }, tiles()));
      root.append(page);
      return { destroy() { while (layers.length) layers[layers.length - 1].close(); } };
    }
  };
})();
