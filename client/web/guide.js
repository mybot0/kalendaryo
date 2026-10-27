/*
 * guide.js — web version only. A friendly first-visit guide on the start page.
 *
 * A small reusable engine: each step says what to say and which part of the page to light up.
 * The page goes dark except the highlighted part, which glows; a bubble with an arrow points at it.
 * After the guide, the "Your name" boxes glow softly until the person starts typing.
 *
 * Each page has its own guide. It shows every time the page opens, until the person clicks Skip (or presses Esc);
 * that is saved in this browser for that page only (kal.guide.<page>). Finishing with "Got it" does not save.
 * Inside a home, a "Guided tour" On/Off switch sits at the top right of every page (kal.tour = 'off' turns all tours off;
 * turning it back On clears every page's Skip).
 * Keyboard: Enter or → next, ← back, Esc skip. Respects "reduce motion".
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon;
  const SEEN = (page) => 'kal.guide.' + page;
  const PLANE = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M12 33l40-17-13 33-9-13z"/></svg>';
  const WAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V6a1.5 1.5 0 0 1 3 0v5M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.3 13a1.5 1.5 0 0 1 2.4-1.8L8 13"/></svg>';

  const svg = (s) => { const t = h('span', { class: 'g-svg' }); t.innerHTML = s; return t; };
  const chips = (list, trip) => h('div', { class: 'g-chips' + (trip ? ' trip' : '') }, list.map(([i, t]) => h('span', { class: 'g-chip' }, i ? icon(i) : null, t)));
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  /* ---------- the steps (start page) ---------- */
  function startSteps(tri) {
    const steps = [
      { id: 'welcome', center: true, icon: svg(WAVE), tone: 'sun', title: 'Welcome to Kalendaryo!', sub: 'Let’s show you around.',
        body: tri ? [h('p', {}, 'Kalendaryo keeps two parts of life organized: ', h('b', {}, 'life at home'), ' and ', h('b', {}, 'your trips together'), '. It only takes a minute.')]
          : [h('p', {}, 'Kalendaryo keeps ', h('b', {}, 'life at home'), ' organized, for everyone you live with. It only takes a minute.')],
        next: 'Let’s go' },
      { id: 'home', target: tri ? '.land-pick-home' : '.land-card', side: 'right', icon: icon('home'), title: 'This is Kalendaryo',
        body: [h('p', {}, 'For ', h('b', {}, 'everyday life'), ' with everyone you live with.'),
          chips([['calendar', 'Calendar'], ['check', 'Chores'], ['meal', 'Meals'], ['list', 'Lists'], ['image', 'Photos'], ['users', 'People']])] }
    ];
    if (tri) {
      steps.push(
        { id: 'trip', target: '.land-pick-trip', side: 'left', trip: true, icon: svg(PLANE), title: 'This is Triply',
          body: [h('p', {}, 'For ', h('b', {}, 'trips together'), ': one itinerary, every booking and a group chat for everyone going.'),
            chips([[null, 'Flights'], [null, 'Hotels'], [null, 'Activities'], [null, 'Packing'], [null, 'Costs'], [null, 'Group chat']], true)] },
        { id: 'which', center: true, icon: icon('sparkle'), tone: 'sun', title: 'Which one do I use?',
          body: [h('p', { class: 'g-rule' }, h('b', { class: 'g-green' }, 'Kalendaryo'), ' for everyday life.'),
            h('p', { class: 'g-rule' }, h('b', { class: 'g-terra' }, 'Triply'), ' when you’re going somewhere together.'),
            h('p', { class: 'g-small' }, 'You can make both, any time.')] }
      );
    }
    steps.push(tri
      ? { id: 'start', target: '.land-pick input[autocomplete=given-name]', side: 'below', pad: 8, icon: icon('edit'), title: 'Start here',
          body: [h('p', { class: 'g-rule' }, h('b', { class: 'g-green' }, 'Organizing your home?'), ' Type your name in the ', h('b', {}, 'green card'), ', then tap ', h('b', {}, 'Create your home'), '.'),
            h('p', { class: 'g-rule' }, h('b', { class: 'g-terra' }, 'Planning a trip?'), ' Use the ', h('b', {}, 'orange card'), ', then tap ', h('b', {}, 'Create your trip'), '.')],
          next: 'Got it' }
      : { id: 'start', target: '.land-card input[autocomplete=given-name]', side: 'below', pad: 8, icon: icon('edit'), title: 'Start here',
          body: [h('p', {}, 'Type ', h('b', {}, 'your name'), ', then the home name, and tap ', h('b', {}, 'Create your home'), '.')], next: 'Got it' });
    return steps;
  }

  /* ---------- the engine ---------- */
  function run(steps, opts) {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0, target = null, raf = 0, readTimers = [];
    const lastFocus = document.activeElement;
    const shade = h('div', { class: 'g-shade' });
    const spot = h('div', { class: 'g-spot', 'aria-hidden': 'true' });
    const live = h('div', { class: 'g-live', 'aria-live': 'polite' });
    const box = h('div', { class: 'g-box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'g-title', tabindex: '-1' });
    const layer = h('div', { class: 'g-layer' + (reduce ? ' g-still' : '') }, shade, spot, box, live);
    document.body.append(layer);
    document.documentElement.classList.add('g-open');

    function place() {
      const s = steps[i];
      if (s.center || !target) { spot.classList.add('g-gone'); box.classList.remove('g-arrow-l', 'g-arrow-r', 'g-arrow-t', 'g-arrow-b'); box.style.left = box.style.top = ''; box.classList.add('g-center'); return; }
      box.classList.remove('g-center');
      const rs = (innerWidth < 640 ? target.slice(0, 1) : target).map((el) => el.getBoundingClientRect()); // phones: cards are stacked, light the first
      const r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)), right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
      r.width = r.right - r.left; r.height = r.bottom - r.top;
      const pad = s.pad || 12;
      spot.classList.remove('g-gone');
      Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const W = innerWidth, H = innerHeight, bw = box.offsetWidth, bh = box.offsetHeight, gap = 26;
      box.classList.remove('g-arrow-l', 'g-arrow-r', 'g-arrow-t', 'g-arrow-b', 'g-sheet');
      box.classList.remove('g-sheet-top');
      if (W < 640) { // phones: a sheet at the bottom, or at the top when the lit part is low on the screen (like the bottom menu)
        box.classList.add('g-sheet'); box.style.left = box.style.top = '';
        if (r.top + r.height / 2 > H / 2) box.classList.add('g-sheet-top');
        return;
      }
      let side = s.side;
      if (side === 'right' && r.right + pad + gap + bw > W - 12) side = r.left - pad - gap - bw > 12 ? 'left' : 'below';
      if (side === 'left' && r.left - pad - gap - bw < 12) side = r.right + pad + gap + bw < W - 12 ? 'right' : 'below';
      if (side === 'below' && r.bottom + pad + gap + bh > H - 12 && r.top - pad - gap - bh > 12) side = 'above';
      let x, y;
      if (side === 'right') { x = r.right + pad + gap; y = Math.min(Math.max(12, r.top + 20), H - bh - 12); box.classList.add('g-arrow-l'); }
      else if (side === 'left') { x = r.left - pad - gap - bw; y = Math.min(Math.max(12, r.top + 20), H - bh - 12); box.classList.add('g-arrow-r'); }
      else if (side === 'above') { x = Math.min(Math.max(12, r.left), W - bw - 12); y = r.top - pad - gap - bh; box.classList.add('g-arrow-b'); }
      else { x = Math.min(Math.max(12, r.left), W - bw - 12); y = Math.min(r.bottom + pad + gap, H - bh - 12); box.classList.add('g-arrow-t'); }
      box.style.left = x + 'px'; box.style.top = y + 'px';
      box.style.setProperty('--ax', Math.min(Math.max(28, r.left + Math.min(r.width / 2, 60) - x), bw - 40) + 'px');
    }
    const follow = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

    function show(n) {
      i = Math.max(0, Math.min(steps.length - 1, n));
      const s = steps[i];
      target = s.target ? [...document.querySelectorAll(s.target)] : null;
      if (target && !target.length) target = null;
      if (s.target && !target) return show(i + 1 < steps.length ? i + 1 : i);
      const dots = h('div', { class: 'g-dots', 'aria-hidden': 'true' }, steps.map((_, k) => h('i', { class: k === i ? 'on' : k < i ? 'done' : '' })));
      const last = i === steps.length - 1;
      const nextBtn = h('button', { type: 'button', class: 'g-next' + (s.trip ? ' trip' : '') }, s.next || (last ? 'Got it' : 'Next'), last ? null : icon('right'));
      nextBtn.addEventListener('click', () => (last ? finish(false) : show(i + 1)));
      const backBtn = i > 0 ? h('button', { type: 'button', class: 'g-back', 'aria-label': 'Back' }, icon('left')) : null;
      if (backBtn) backBtn.addEventListener('click', () => show(i - 1));
      const skipBtn = last ? null : h('button', { type: 'button', class: 'g-skip' }, 'Skip');
      if (skipBtn) skipBtn.addEventListener('click', () => finish(true));
      box.className = 'g-box' + (s.trip ? ' trip' : '');
      box.replaceChildren(...[
        h('div', { class: 'g-top' }, h('span', { class: 'g-badge' + (s.trip ? ' trip' : '') }, 'Step ' + (i + 1) + ' of ' + steps.length)),
        h('div', { class: 'g-head' }, h('span', { class: 'g-icon ' + (s.tone ? 'g-' + s.tone : s.trip ? 'g-trip' : 'g-home') }, s.icon), h('div', {}, h('h2', { id: 'g-title' }, s.title), s.sub ? h('p', { class: 'g-sub' }, s.sub) : null)),
        ...s.body,
        h('div', { class: 'g-foot' }, dots, h('span', { class: 'g-fill' }), skipBtn, backBtn, nextBtn)
      ].filter(Boolean));
      live.textContent = 'Step ' + (i + 1) + ' of ' + steps.length + ': ' + s.title;
      box.classList.remove('g-pop'); void box.offsetWidth; box.classList.add('g-pop');
      if (target) target[0].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      place(); setTimeout(place, reduce ? 0 : 380); // after the smooth scroll
      setTimeout(() => box.focus({ preventScroll: true }), 30); // the bubble takes focus, so Next has no ring until it blinks
      readAlong(nextBtn);
    }

    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(true); }
      else if (e.key === 'Enter' && document.activeElement === box) { e.preventDefault(); const b = box.querySelector('.g-next'); if (b) b.click(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); i < steps.length - 1 ? show(i + 1) : finish(false); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
      else if (e.key === 'Tab') { // keep focus inside the guide
        const f = [...box.querySelectorAll('button')]; if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    // Read-along: light up one piece of text at a time (title, then each line), at an easy reading pace.
    // What is not read yet is faded, so the eye knows exactly where to look. When done, Next starts to blink.
    function readAlong(nextBtn) {
      readTimers.forEach(clearTimeout); readTimers = [];
      const parts = [...box.querySelectorAll('.g-head h2, .g-sub, p, .g-chip')];
      if (reduce) { nextBtn.classList.add('g-ready'); return; }
      parts.forEach((el) => el.classList.add('g-seg', 'g-later'));
      let t = 250;
      parts.forEach((el) => {
        const words = (el.textContent || '').trim().split(/\s+/).length;
        const ms = el.classList.contains('g-chip') ? 420 : Math.max(800, words * 330); // about 3 words a second
        readTimers.push(setTimeout(() => { el.classList.remove('g-later'); el.classList.add('g-now'); }, t));
        readTimers.push(setTimeout(() => el.classList.remove('g-now'), t + ms));
        t += ms;
      });
      readTimers.push(setTimeout(() => nextBtn.classList.add('g-ready'), t));
    }

    function finish(skipped) {
      readTimers.forEach(clearTimeout);
      running = null;
      document.removeEventListener('keydown', key, true);
      removeEventListener('scroll', follow, true); removeEventListener('resize', follow);
      layer.classList.add('g-leave');
      setTimeout(() => { layer.remove(); document.documentElement.classList.remove('g-open'); }, reduce ? 0 : 220);
      if (skipped) set(SEEN(opts.page), '1'); // only Skip (or Esc) is remembered
      if (opts && opts.onDone) opts.onDone();
      else if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', key, true);
    addEventListener('scroll', follow, true); addEventListener('resize', follow);
    shade.addEventListener('click', () => box.classList.remove('g-pop') || (void box.offsetWidth, box.classList.add('g-pop'))); // a click outside nudges the bubble
    running = { close: () => finish(false) };
    show(0);
  }
  let running = null; // the guide on screen now, if any

  /* ---------- after the guide: the "Your name" boxes glow until used ---------- */
  function glowStart() {
    const inputs = [...document.querySelectorAll('.land-pick input[autocomplete=given-name], .land-card input[autocomplete=given-name]')];
    if (!inputs.length) return;
    const tags = inputs.map((el) => {
      const wrap = el.closest('.field') || el.parentElement;
      const trip = !!el.closest('.land-pick-trip');
      const tag = h('span', { class: 'g-here' + (trip ? ' trip' : ''), 'aria-hidden': 'true' }, inputs.length > 1 ? (trip ? 'Start here for a trip 👇' : 'Start here for your home 👇') : 'Start here 👇');
      wrap.classList.add('g-glow', 'g-here-wrap'); wrap.prepend(tag);
      return tag;
    });
    const stop = () => {
      document.querySelectorAll('.g-glow').forEach((el) => el.classList.remove('g-glow'));
      tags.forEach((t) => t.remove()); document.querySelectorAll('.g-here-wrap').forEach((el) => el.classList.remove('g-here-wrap'));
      document.removeEventListener('focusin', onFocus, true); document.removeEventListener('pointerdown', onFocus, true);
    };
    const onFocus = (e) => { if (e.target.closest && e.target.closest('.land-pick, .land-card, .land-lists')) stop(); };
    document.addEventListener('focusin', onFocus, true); document.addEventListener('pointerdown', onFocus, true);
  }

  /* ---------- page tours inside a home ---------- */
  const COMPASS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>';
  const tourOn = () => get('kal.tour') !== 'off';
  const PAGE_TOURS = {
    home: () => [
      { id: 'h-welcome', center: true, icon: icon('home'), tone: 'sun', title: 'This is your Home page', sub: 'Everything for today, in one place.',
        body: [h('p', {}, 'Each box shows one part of your home. Tap ', h('b', {}, 'Open'), ' on any box to see more.')] },
      { id: 'h-today', target: '.widget[aria-label="Today"]', side: 'right', icon: icon('calendar'), title: 'Today',
        body: [h('p', {}, 'What is happening ', h('b', {}, 'today'), ', for everyone you live with.'), h('p', {}, 'Tap an event to see it or change it.')] },
      { id: 'h-add', target: '.quick .btn.primary', side: 'below', pad: 8, icon: icon('plus'), title: 'Add an event',
        body: [h('p', {}, 'Tap ', h('b', {}, 'Add event'), ' for a party, a doctor visit, school pickup… anything with a date.')] },
      { id: 'h-week', target: '.widget[aria-label="This week"]', side: 'above', icon: icon('calendar'), title: 'This week',
        body: [h('p', {}, 'The next 7 days at a glance. ', h('b', {}, 'Tap a day'), ' to see everything on it.')] },
      { id: 'h-wall', target: '.quick .btn:not(.primary)', side: 'below', pad: 8, icon: icon('expand'), title: 'Wall mode',
        body: [h('p', {}, 'Turn a tablet or old screen into a ', h('b', {}, 'family board'), ' with a big clock, today and chores.')] },
      { id: 'h-nav', target: '.nav', side: 'right', icon: icon('list'), title: 'Your pages',
        body: [h('p', {}, 'Go to ', h('b', {}, 'Calendar, Chores, Meals, Lists, Photos and People'), ' here. Each page has its own short tour.')] },
      { id: 'h-switch', target: '.tour-switch', side: 'below', pad: 6, icon: svg(COMPASS), title: 'Turn tours on or off',
        body: [h('p', {}, 'Tap ', h('b', {}, 'Guided tour'), ' to stop these tours. Turn it back on any time to see them again.')], next: 'Got it' }
    ]
  };
  function pageTour(id) {
    if (!tourOn() || !PAGE_TOURS[id] || get(SEEN('page.' + id)) || running) return;
    if (window.KAL && KAL.me && KAL.me.viewing) return; // the site owner viewing a home: no tours
    // Wait until any pop-up (like "Welcome, here is your link") is closed, then start.
    let tries = 0;
    const tryStart = () => {
      if (running || !PL.nav || PL.nav.current() !== id || !tourOn()) return;
      if (document.querySelector('.sheet') && tries++ < 600) return setTimeout(tryStart, 500);
      run(PAGE_TOURS[id](), { page: 'page.' + id });
    };
    setTimeout(tryStart, 700);
  }
  // The switch at the top right of every page inside a home.
  function installSwitch() {
    if (document.querySelector('.tour-switch')) return;
    const label = h('span', { class: 'tour-label' }, 'Guided tour');
    const state = h('span', { class: 'tour-state' });
    const btn = h('button', { type: 'button', class: 'tour-switch', role: 'switch' }, svg(COMPASS), label, state);
    const paint = () => { const on = tourOn(); btn.setAttribute('aria-checked', String(on)); btn.classList.toggle('off', !on); state.textContent = on ? 'On' : 'Off';
      btn.title = on ? 'Guided tour is on. Tap to turn it off.' : 'Guided tour is off. Tap to turn it on.'; };
    btn.addEventListener('click', () => {
      if (tourOn()) { set('kal.tour', 'off'); if (running) running.close(); }
      else {
        try { localStorage.removeItem('kal.tour'); Object.keys(localStorage).filter((k) => k.startsWith('kal.guide.page.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* fine */ }
        pageTour(PL.nav.current());
      }
      paint();
    });
    paint();
    document.body.append(btn);
  }
  // Inside a home: follow page changes (PL.nav.go) and show each page's tour.
  function watchPages() {
    if (!window.KAL || !KAL.token || !PL.nav || PL.nav.__toured) return false;
    // The page area is redrawn when someone opens another page: notice that and show that page's tour.
    let last = PL.nav.current();
    new MutationObserver(() => {
      const now = PL.nav.current();
      if (now === last) return;
      last = now;
      if (running) running.close();
      pageTour(now);
    }).observe(document.getElementById('main'), { childList: true });
    PL.nav.__toured = true;
    installSwitch();
    pageTour(PL.nav.current());
    return true;
  }
  if (window.KAL && KAL.token) {
    const wait = setInterval(() => { if (document.querySelector('.app .nav') && (KAL.me || KAL.invalid)) { clearInterval(wait); if (!KAL.invalid && !(KAL.me && KAL.me.viewing)) watchPages(); } }, 200);
    setTimeout(() => clearInterval(wait), 30000);
  }

  PL.guide = {
    // Called by the start page after it draws. Shows until the person clicks Skip.
    maybeStart() { if (!get(SEEN('start')) && !running) setTimeout(() => { if (!running) this.start(); }, 450); },
    start() { run(startSteps(!!window.KAL_TRIPLY), { page: 'start', onDone: glowStart }); },
    reset(page) { try { localStorage.removeItem(SEEN(page || 'start')); } catch (e) { /* fine */ } }
  };
})();
