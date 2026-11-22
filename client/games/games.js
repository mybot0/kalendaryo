/*
 * games.js — Kalendaryo Games (from Keybop): Pares-Pares and Hangry Snake.
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
  function panel(root, title, text, btns) {
    const p = el('div', 'kg-panel'), c = el('div', 'kg-pcard'), hd = el('h3'), t = el('p');
    hd.textContent = title; t.textContent = text; c.append(hd, t);
    btns.forEach(([label, fn]) => { const b = el('button', 'kg-big'); b.type = 'button'; b.textContent = label; b.onclick = () => { p.remove(); fn(); }; c.append(b); });
    p.append(c); root.append(p);
    const f = c.querySelector('button'); if (f) f.focus();
  }
  function rr(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ================= Pares-Pares (memory) ================= */
  // 10 levels (pairs per level). Every card count fills a full grid (3x4, 4x4, 4x5, 5x6, 6x6, 6x7, 6x8),
  // the same on phones and tablets. Levels 8-10 use look-alike pictures; level 9 gives stars; level 10 is Champion.
  const LEVELS = [6, 8, 10, 15, 18, 21, 24, 24, 24, 24];
  const TRICKY_FROM = 7, STARS = 8, CHAMP = 9, CHAMP_MOVES = 36;
  const TRICKY = ['🍎', '🍓', '🍒', '🍅', '🌹', '🎈', '🐞', '🦀', '🌶️', '🍉', '❤️', '🚒', '🐶', '🐕', '🦮', '🐩', '🐺', '🦊', '🐱', '🐈', '🐯', '🦁', '🐆', '🐅'];
  const POOL = ['🐶', '🐱', '🦊', '🐸', '🐼', '🦁', '🐙', '🦄', '🐢', '🦋', '🍓', '🍕', '🚀', '🚂', '⚽', '🎈', '🌈', '🍩', '🐝', '🐳',
    '🦒', '🍉', '🚁', '🐨', '🧁', '🦀', '🍌', '🚲', '🐧', '🌵'];
  function makeMemory(root, api) {
    let lv = 0, pairs = LEVELS[0], flipped = [], matched = 0, moves = 0, lock = false;
    const timers = [];
    const wrap = el('div', 'kg-mem'); root.append(wrap);
    const label = () => api.score('Level ' + (lv + 1) + ' · Moves ' + moves);
    function deal() {
      moves = 0; matched = 0; flipped = []; lock = false; label();
      const set = shuffle(lv >= TRICKY_FROM ? TRICKY : POOL).slice(0, pairs), grid = el('div', 'kg-mgrid');
      shuffle([...set, ...set]).forEach((v) => {
        const c = el('button', 'kg-mcard'); c.type = 'button'; c.dataset.v = v; c.setAttribute('aria-label', 'card');
        c.innerHTML = '<span class="kg-minner"><span class="kg-mface q">?</span><span class="kg-mface v">' + v + '</span></span>';
        c.addEventListener('click', () => flip(c)); grid.append(c);
      });
      wrap.replaceChildren(grid); fit();
    }
    // Square cards as big as the screen allows, using ONLY layouts where every row is full (never a half-empty row).
    // If two layouts give the same card size, use the squarer one.
    function fit() {
      const g = wrap.firstChild; if (!g || !wrap.clientWidth) return;
      const n = pairs * 2, gap = 10, W = wrap.clientWidth - 32, H = wrap.clientHeight - 28, opts = [];
      for (let c = 2; c <= 12; c++) { if (n % c) continue; const r = n / c; opts.push({ c, s: Math.floor(Math.min((W - gap * (c - 1)) / c, (H - gap * (r - 1)) / r)) }); }
      const maxS = Math.max(...opts.map((o) => o.s));
      const best = opts.filter((o) => o.s >= maxS - 1).reduce((a, b) => (Math.abs(b.c - n / b.c) < Math.abs(a.c - n / a.c) ? b : a));
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
      // Best score per level (levels 1-7 keep their old keys, so earlier best scores still count).
      const key = 'best:memory:' + (lv >= TRICKY_FROM ? 'L' + (lv + 1) : pairs), prev = store.get(key, 0);
      if (!prev || moves < prev) store.set(key, moves);
      const best = Math.min(prev || moves, moves), last = lv === LEVELS.length - 1;
      const stars = moves <= 40 ? '⭐⭐⭐' : moves <= 50 ? '⭐⭐' : '⭐';
      const champ = lv === CHAMP && moves <= CHAMP_MOVES;
      api.confetti(champ ? 140 : 70);
      let title = 'All matched!', text = 'Done in ' + moves + ' moves. Best for this level: ' + best + '.';
      if (lv === STARS) text = stars + ' ' + text;
      if (lv === CHAMP) {
        title = champ ? '🏆 Champion!' : 'All matched!';
        text = champ ? 'You did every level in Champion time: ' + moves + ' moves!' : 'Done in ' + moves + ' moves. Finish in ' + CHAMP_MOVES + ' moves or less to be Champion. Best: ' + best + '.';
      }
      timers.push(setTimeout(() => {
        panel(root, title, text, [
          [last ? (champ ? 'Play again' : 'Try again') : 'Next level', () => { if (!last) { lv++; pairs = LEVELS[lv]; } deal(); }]
        ]);
      }, 700));
    }
    deal();
    return { destroy() { timers.forEach(clearTimeout); ro.disconnect(); } };
  }

  /* ================= Hangry Snake (snake) ================= */
  function makeSnake(root, api) {
    const N = 16; // squares on the short side; the long side gets more, so the board fills the screen
    let NX = N, NY = N;
    const wrap = el('div', 'kg-snake'), cv = el('canvas'), spd = el('div', 'kg-speed'), mod = el('div', 'kg-speed'), opts = el('div', 'kg-opts'), pad = el('div', 'kg-dpad' + (coarse() ? ' on' : ''));
    cv.setAttribute('aria-label', 'Hangry Snake board');
    pad.innerHTML = '<button class="u" type="button" aria-label="Up">▲</button><button class="l" type="button" aria-label="Left">◀</button><button class="d" type="button" aria-label="Down">▼</button><button class="r" type="button" aria-label="Right">▶</button>';
    // Speed: 1 = slow (half of 2, the default), 2 = normal, 3 = fast. The last choice is remembered on this device.
    const SPEED = { 1: 2, 2: 1, 3: 0.65 };
    let speed = SPEED[store.get('speed:snake', 1)] ? store.get('speed:snake', 1) : 1;
    spd.innerHTML = '<span>Speed</span>' + [1, 2, 3].map((n) => '<button type="button" data-s="' + n + '" aria-label="Speed ' + n + '">' + n + '</button>').join('');
    const paintSpd = () => spd.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.s === speed)));
    spd.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; speed = +b.dataset.s; store.set('speed:snake', speed); paintSpd(); b.blur(); });
    paintSpd();
    // Mode: 1 = one apple (the default), 2 = lots of fruit, 3 = lots of fruit that blinks and then disappears.
    const MODES = { 1: 'One apple', 2: 'Lots of fruit', 3: 'Fruit disappears! Be quick.' };
    let mode = MODES[store.get('mode:snake', 1)] ? store.get('mode:snake', 1) : 1;
    mod.innerHTML = '<span>Mode</span>' + [1, 2, 3].map((n) => '<button type="button" data-m="' + n + '" aria-label="Mode ' + n + ': ' + MODES[n] + '">' + n + '</button>').join('');
    const paintMod = () => { mod.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.m === mode))); mod.title = 'Mode ' + mode + ': ' + MODES[mode]; };
    mod.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const m = +b.dataset.m; b.blur(); if (m === mode) return; mode = m; store.set('mode:snake', mode); paintMod(); reset(); });
    paintMod();
    opts.append(spd, mod);
    wrap.append(opts, cv, pad); root.append(wrap);
    const ctx = cv.getContext('2d');
    let cell = 20, sized = false;
    let snake, dir, moved, fruits = [], eaten, ms, acc, last, raf, started = false, flash, clock = 0, best = 0;
    const FRUIT = ['🍎', '🍌', '🍇', '🍓', '🍊', '🥭', '🍉', '🍒', '🍐', '🍑'];
    const bestKey = () => (mode === 1 ? 'best:snake' : 'best:snake:m' + mode);
    function size() {
      if (!root.clientWidth) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const padH = (pad.classList.contains('on') ? (pad.offsetHeight || 180) + 34 : 40) + (opts.offsetHeight || 44) + 14;
      const aw = root.clientWidth - 32, ah = root.clientHeight - padH;
      if (!sized || !started) { // before the first move the board may change shape (full screen, turning the iPad)
        cell = Math.max(12, Math.floor(Math.min(aw, ah) / N)); const nx = Math.max(N, Math.floor(aw / cell)), ny = Math.max(N, Math.floor(ah / cell));
        const changed = sized && (nx !== NX || ny !== NY); NX = nx; NY = ny; sized = true;
        if (changed && snake) reset();
      }
      cell = Math.max(10, Math.floor(Math.min(aw / NX, ah / NY)));
      const BW = cell * NX, BH = cell * NY;
      cv.width = BW * dpr; cv.height = BH * dpr; cv.style.width = BW + 'px'; cv.style.height = BH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const ro = new ResizeObserver(size); ro.observe(root);
    const label = () => api.score((mode === 1 ? '🍎 ' : '🍓 ') + eaten + ' · best ' + best);
    function addFruit() {
      let p, tries = 0;
      do { p = { x: Math.floor(Math.random() * NX), y: Math.floor(Math.random() * NY) }; tries++; }
      while (tries < 500 && (snake.some((q) => q.x === p.x && q.y === p.y) || fruits.some((f) => f.x === p.x && f.y === p.y)));
      p.e = mode === 1 ? '🍎' : FRUIT[Math.floor(Math.random() * FRUIT.length)];
      p.end = mode === 3 ? clock + 4000 + Math.random() * 5000 : Infinity; // mode 3: gone after 4 to 9 seconds
      fruits.push(p);
    }
    const fruitCount = () => (mode === 1 ? 1 : 5);
    function fillFruit() { while (fruits.length < fruitCount()) addFruit(); }
    function reset() {
      const cx = Math.floor(NX / 2), cy = Math.floor(NY / 2);
      snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }]; dir = { x: 1, y: 0 }; moved = { x: 0, y: 0 };
      eaten = 0; ms = 150; acc = 0; last = 0; clock = 0; started = false; flash = 0; best = store.get(bestKey(), 0); fruits = []; fillFruit(); label();
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
      const fi = fruits.findIndex((f) => f.x === hx && f.y === hy), grow = fi >= 0;
      const bodyCells = grow ? snake : snake.slice(0, -1);
      const idx = bodyCells.findIndex((s) => s.x === hx && s.y === hy);
      if (idx >= 0) { snake = bodyCells.slice(0, Math.max(3, idx)); flash = 1; api.beep(180, .25, 'sawtooth', .08); }
      else snake = bodyCells;
      snake.unshift({ x: hx, y: hy });
      if (grow) {
        eaten++; ms = Math.max(85, 150 - eaten * 4);
        if (eaten > best) { best = eaten; store.set(bestKey(), best); }
        label(); api.note(eaten); api.confetti(5); fruits.splice(fi, 1); fillFruit();
      }
    }
    function draw() {
      const bw = cell * NX, bh = cell * NY;
      for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { ctx.fillStyle = (x + y) % 2 ? '#cdeed6' : '#dff5e3'; ctx.fillRect(x * cell, y * cell, cell, cell); }
      ctx.font = Math.floor(cell * .8) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fruits.forEach((f) => {
        const left = f.end - clock;
        if (left < 1500 && Math.floor(left / 180) % 2) return; // blink before it disappears
        ctx.fillText(f.e, f.x * cell + cell / 2, f.y * cell + cell / 2 + 1);
      });
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
      if (started) {
        acc += dt; clock += dt; const t = ms * SPEED[speed]; while (acc >= t) { acc -= t; step(); }
        if (mode === 3) { const n = fruits.length; fruits = fruits.filter((f) => f.end > clock); if (fruits.length < n) fillFruit(); }
      }
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
  // Our own drawings (no emoji) for the tiles and the title.
  const ICO_PARES = '<svg viewBox="0 0 64 64" width="72" height="72"><g stroke="#1b1a3a" stroke-width="3" stroke-linejoin="round"><g transform="rotate(-14 21 33)"><rect x="5" y="13" width="31" height="42" rx="6" fill="#fff"/><rect x="10" y="18" width="21" height="32" rx="3" fill="#ffc531" stroke-width="2.5"/><path d="M20.5 25l6 9-6 9-6-9z" fill="#fff" stroke-width="2.5"/></g><g transform="rotate(12 43 33)"><rect x="27" y="11" width="31" height="42" rx="6" fill="#fff"/><path d="M42.5 43s-10-5.5-10-12.5a5 5 0 0110-1.8 5 5 0 0110 1.8c0 7-10 12.5-10 12.5z" fill="#ff5b4d" stroke-width="2.5"/></g></g></svg>';
  const ICO_HANGRY = '<svg viewBox="0 0 64 64" width="72" height="72"><g stroke="#1b1a3a" stroke-linecap="round" stroke-linejoin="round"><path d="M8 54c2-9 10-9 17-9s13-3 13-11" fill="none" stroke-width="14"/><path d="M8 54c2-9 10-9 17-9s13-3 13-11" fill="none" stroke="#26bf72" stroke-width="8"/><circle cx="36" cy="25" r="15" fill="#26bf72" stroke-width="3"/><circle cx="27" cy="29" r="3" fill="#ff7eb6" stroke="none" opacity=".9"/><circle cx="47" cy="27" r="3" fill="#ff7eb6" stroke="none" opacity=".9"/><circle cx="31" cy="22" r="5" fill="#fff" stroke-width="2.5"/><circle cx="42" cy="20" r="5" fill="#fff" stroke-width="2.5"/><circle cx="32.5" cy="23" r="2.2" fill="#1b1a3a" stroke="none"/><circle cx="40.5" cy="21" r="2.2" fill="#1b1a3a" stroke="none"/><path d="M25 14l9 5M48 11l-8 6" fill="none" stroke-width="3.5"/><path d="M33 33q4-3 8-1" fill="none" stroke-width="3"/><path d="M17 12c-3 0-4-3-2-4 0-3 4-3 5-1 2-1 4 1 3 3 1 2-1 3-3 2-1 1-3 1-3 0z" fill="#fff" stroke-width="2"/><path d="M53 6c-2.5 0-3.5-2.5-1.5-3.5 0-2.5 3.5-2.5 4-1 1.8-1 3.5 1 2.5 2.5 1 1.8-1 2.8-2.5 1.8-1 1-2.5 1-2.5.2z" fill="#fff" stroke-width="2"/><path d="M51 44c-3-2.5-9-1.5-9 5 0 5 4 9.5 6.5 9.5 1 0 1.5-.6 2.5-.6s1.5.6 2.5.6c2.5 0 6.5-4.5 6.5-9.5 0-6.5-6-7.5-9-5z" fill="#c9182b" stroke-width="2.5"/><path d="M51 44c0-2.5 1-4.5 3-5.5" fill="none" stroke-width="2.5"/><path d="M53 41.5c2-2.5 5-2.5 6.5-1.5-1.5 2.5-4 3-6.5 1.5z" fill="#26bf72" stroke-width="2"/><path d="M46 48.5q.5-2 2.5-2.5" fill="none" stroke="#fff" stroke-width="2"/></g></svg>';
  const TITLE_HTML = '<svg class="kg-title-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h10a5 5 0 015 5v.5a4.5 4.5 0 01-8.1 2.7L13 15h-2l-.9 1.2A4.5 4.5 0 012 13.5V13a5 5 0 015-5zM7 11v3M5.5 12.5h3M16 11.5h.01M18 13.5h.01"/></svg><span>Games</span>';
  const GAMES = [
    { id: 'memory', title: 'Pares-Pares', ico: ICO_PARES, c: COL.grape, blurb: '<b>A memory game!</b> Flip two cards and find every pair.', make: makeMemory },
    { id: 'snake', title: 'Hangry Snake', logoHtml: '<span class="kg-logo" role="img" aria-label="Hangry Snake">' + ICO_HANGRY + '<span class="kg-logo-t" aria-hidden="true"><span>H<span class="a">ANGRY</span></span><span class="s">SNAKE</span></span></span>', titleHtml: 'H<span class="kg-angry">ANGRY</span> Snake', ico: ICO_HANGRY, c: COL.tomato, blurb: '<b>So hungry, it’s ANGRY!</b> A snake game: eat the fruit and grow longer. Walls wrap around, so nobody crashes.', make: makeSnake }
  ];
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
    const api = { score: (t) => { score.textContent = t; }, confetti, voice, note, beep };
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
