/*
 * theme.js — light and dark mode. Colors for dark mode live in styles/dark.css.
 *
 *   TR.theme.get()        'auto' | 'light' | 'dark'   (saved on this device)
 *   TR.theme.set(v)
 *   TR.theme.isDark()     what is showing right now
 *   TR.theme.toggle()     the quick switch at the bottom of the menu
 *   TR.theme.wallLook()   'app' | 'night' | 'dark' | 'light'  (not used in Triply)
 *   TR.theme.setWall(on)  wall mode tells us when it opens and closes
 *   TR.theme.button()     the small "Dark mode / Light mode" menu line
 *
 * Auto follows the phone or computer (prefers-color-scheme). Wall mode can go dark at night by itself.
 */
(function () {
  const TR = (window.TR = window.TR || {});
  const KEY = 'theme', WALL = 'wallLook', NIGHT_FROM = 21, NIGHT_TO = 7; // 9 PM to 7 AM
  const store = { get: (k, d) => { try { const v = localStorage.getItem('triply.' + k); return v == null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('triply.' + k, v); } catch (e) { /* private mode: still works until reload */ } } };
  let mode = store.get(KEY, 'auto'), wall = store.get(WALL, 'night'), inWall = false;
  const listeners = new Set();
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const night = () => { const hr = new Date().getHours(); return hr >= NIGHT_FROM || hr < NIGHT_TO; };

  function appDark() { return mode === 'dark' || (mode === 'auto' && !!(mq && mq.matches)); }
  function isDark() {
    if (inWall && wall !== 'app') return wall === 'dark' || (wall === 'night' && night());
    return appDark();
  }
  function apply() {
    const d = isDark();
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', d ? '#1D1917' : '#F4F3EE');
    listeners.forEach((f) => { try { f(d); } catch (e) { /* ignore */ } });
  }
  if (mq) (mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply));
  setInterval(() => { if (inWall && wall === 'night') apply(); }, 60 * 1000);

  const MOON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
  const SUN = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function button(cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls || 'nav-btn theme-btn';
    const paint = () => { const d = isDark(); b.innerHTML = (d ? SUN : MOON) + '<span class="nav-label">' + (d ? 'Light mode' : 'Dark mode') + '</span>'; b.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); };
    b.addEventListener('click', () => TR.theme.toggle());
    listeners.add(paint); paint();
    return b;
  }

  TR.theme = {
    get: () => mode,
    set(v) { mode = ['light', 'dark'].includes(v) ? v : 'auto'; store.set(KEY, mode); apply(); },
    isDark,
    toggle() {
      if (inWall) { wall = isDark() ? 'light' : 'dark'; store.set(WALL, wall); return apply(); }
      TR.theme.set(appDark() ? 'light' : 'dark');
    },
    wallLook: () => wall,
    setWallLook(v) { wall = ['app', 'night', 'dark', 'light'].includes(v) ? v : 'night'; store.set(WALL, wall); apply(); },
    setWall(on) { inWall = !!on; apply(); },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    button
  };
  apply();
})();
