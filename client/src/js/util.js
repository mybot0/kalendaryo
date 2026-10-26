/*
 * util.js — small helpers used everywhere:
 *   PL.h      builds DOM elements        PL.icon  draws an icon
 *   PL.D      date helpers (all dates are plain "YYYY-MM-DD" strings, times "HH:MM")
 *   PL.storage  safe localStorage wrapper
 */
(function () {
  const PL = (window.PL = window.PL || {});

  /* ---------- DOM builder ---------- */
  // h('div', {class:'x', onclick:fn}, child, [children]) -> element
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat(3)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  PL.h = h;

  /* ---------- Icons (24x24 stroke paths, drawn for this app) ---------- */
  const ICONS = {
    home: 'M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5',
    calendar: 'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4',
    check: 'M5 12.5l4.2 4.2L19 7',
    meal: 'M7 4v7a2 2 0 002 2v7M11 4v7a2 2 0 01-2 2M7 4v4M11 4v4M17 4c-2 1.5-2.5 4-2.5 7H17v9',
    list: 'M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01',
    users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5M16 6.5a2.6 2.6 0 010 5M18 14.7c1.6.6 2.6 2 3 4.3',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l1.6-1-1.6-3-1.9.4a6.5 6.5 0 00-1.6-.9L15 5.5h-3.4l-.5 2a6.5 6.5 0 00-1.6.9L7.6 8 6 11l1.6 1a6.5 6.5 0 000 1.8L6 15l1.600 3 1.9-.5c.5.4 1 .7 1.600.9l.5 2H15l.5-2c.6-.2 1.100-.5 1.600-.9l1.900.5 1.600-3-1.600-1.200c.1-.6.1-1.200 0-1.800z',
    plus: 'M12 5v14M5 12h14',
    x: 'M6 6l12 12M18 6L6 18',
    left: 'M14.5 6l-6 6 6 6',
    right: 'M9.5 6l6 6-6 6',
    repeat: 'M17 3l3 3-3 3M4 11V9.500A3.500 3.500 0 017.500 6H20M7 21l-3-3 3-3M20 13v1.500a3.500 3.500 0 01-3.500 3.500H4',
    clock: 'M12 7v5l3 2M12 20a8 8 0 100-16 8 8 0 000 16z',
    pin: 'M12 21s6-5.400 6-10.500a6 6 0 10-12 0C6 15.600 12 21 12 21zM12 12.500a2 2 0 100-4 2 2 0 000 4z',
    note: 'M6 4h12v16H6zM9 9h6M9 13h6M9 17h3',
    bell: 'M6 16V11a6 6 0 1112 0v5l1.500 2h-15zM10 20.500a2 2 0 004 0',
    edit: 'M5 19l1-4L16.500 4.500a1.800 1.800 0 012.500 0l.5.5a1.800 1.800 0 010 2.500L9 18zM14.500 6.500l3 3',
    copy: 'M9 9h10v11H9zM5 15V4h10',
    move: 'M12 4v16M4 12h16M12 4l-2.500 2.500M12 4l2.500 2.500M12 20l-2.500-2.500M12 20l2.500-2.500M4 12l2.500-2.500M4 12l2.500 2.500M20 12l-2.500-2.500M20 12l-2.500 2.500',
    trash: 'M5 7h14M10 7V4.500h4V7M7 7l1 13h8l1-13M10.500 11v5.500M13.500 11v5.500',
    expand: 'M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4',
    cake: 'M5 20h14v-6H5zM5 14c1.500 0 1.500-1.500 3.500-1.500S10 14 12 14s2-1.500 3.500-1.500S17.500 14 19 14M12 12V8M12 8c-1-1 0-2.500 0-3.500 1 1 1 2.500 0 3.500z',
    upload: 'M12 16V5M7.500 9.500L12 5l4.500 4.500M5 19h14',
    download: 'M12 5v11M7.500 11.500L12 16l4.500-4.500M5 19h14',
    eye: 'M3 12s3.500-6 9-6 9 6 9 6-3.500 6-9 6-9-6-9-6zM12 14.500a2.500 2.500 0 100-5 2.500 2.500 0 000 5z',
    eyeoff: 'M4 4l16 16M9.500 6.300A8.700 8.700 0 0112 6c5.500 0 9 6 9 6a15 15 0 01-3 3.500M6.500 8.200A15 15 0 003 12s3.500 6 9 6c1.200 0 2.300-.3 3.300-.7',
    up: 'M6 14l6-6 6 6',
    down: 'M6 10l6 6 6-6',
    star: 'M12 4l2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.7 5.4-.7z',
    cart: 'M4 5h2l2 10h9l2-7H7M10 19.500h.01M16 19.500h.01',
    book: 'M5 5h6a2 2 0 012 2v12a2 2 0 00-2-2H5zM19 5h-6a2 2 0 00-2 2M19 5v12h-6',
    sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600L7 7M17 17l1.400 1.400M5.600 18.400L7 17M17 7l1.400-1.400',
    image: 'M4 5h16v14H4zM4 16l4.500-4.500 4 4 3-3L20 16M9 9.500h.01',
    wifioff: 'M4 4l16 16M5 10.500a11 11 0 015.500-2.800M9 14.500a6 6 0 013.500-1.200M12 18.500h.01',
    sparkle: 'M12 4l1.800 4.700L18.500 10.500l-4.700 1.800L12 17l-1.800-4.700L5.500 10.500l4.700-1.800zM18.500 4v3M20 5.500h-3'
  };
  function icon(name, extraClass) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ic' + (extraClass ? ' ' + extraClass : ''));
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.note);
    svg.append(p);
    return svg;
  }
  PL.icon = icon;

  /* ---------- Dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const D = {};
  D.pad = pad;
  D.key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  D.parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  D.today = () => D.key(new Date());
  D.addDays = (k, n) => { const d = D.parse(k); d.setDate(d.getDate() + n); return D.key(d); };
  // Whole days from key a to key b (b - a). Uses UTC so daylight-saving changes never skew it.
  D.diff = (a, b) => {
    const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  };
  D.dow = (k) => D.parse(k).getDay();
  D.daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
  D.startOfWeek = (k, weekStart) => D.addDays(k, -((D.dow(k) - weekStart + 7) % 7));
  D.monthStart = (k) => k.slice(0, 8) + '01';
  // Move by whole months, clamping the day (Jan 31 + 1 month = Feb 28).
  D.addMonths = (k, n) => {
    const d = D.parse(k), day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(day, D.daysInMonth(t.getFullYear(), t.getMonth())));
    return D.key(t);
  };
  D.minutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  D.fmtTime = (t, hour12) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: hour12 !== false });
  };
  D.fmt = (k, opts) => D.parse(k).toLocaleDateString(undefined, opts);
  D.weekdayShort = (i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }); // 0 = Sunday
  D.weekdayLong = (i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'long' });
  D.ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  D.nowTime = () => { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); };
  // A moment in time from a date key and "HH:MM".
  D.at = (k, t) => { const d = D.parse(k); const [h, m] = (t || '00:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
  PL.D = D;

  /* ---------- Storage (this device only) ---------- */
  // The web version sets PL_STORAGE_PREFIX so each family keeps its own saved copy on a shared browser.
  const SP = window.PL_STORAGE_PREFIX || 'pl.';
  PL.storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem(SP + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(SP + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
  };
})();

