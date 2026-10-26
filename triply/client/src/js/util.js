/*
 * util.js — small helpers used everywhere:
 *   TR.h        builds DOM elements        TR.icon   draws an icon
 *   TR.D        date helpers (dates are plain "YYYY-MM-DD" text, times "HH:MM")
 *   TR.storage  safe localStorage wrapper  TR.copy   copy text to the clipboard
 */
(function () {
  const TR = (window.TR = window.TR || {});

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
  TR.h = h;

  /* ---------- Icons (24x24 stroke paths) ---------- */
  const ICONS = {
    home: 'M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5',
    calendar: 'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4',
    check: 'M5 12.5l4.2 4.2L19 7',
    meal: 'M7 4v7a2 2 0 002 2v7M11 4v7a2 2 0 01-2 2M7 4v4M11 4v4M17 4c-2 1.5-2.5 4-2.5 7H17v9',
    list: 'M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01',
    users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5M16 6.5a2.6 2.6 0 010 5M18 14.7c1.6.6 2.6 2 3 4.3',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20c.7-3.5 3.5-5 7.5-5s6.8 1.5 7.5 5',
    settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
    plus: 'M12 5v14M5 12h14',
    x: 'M6 6l12 12M18 6L6 18',
    left: 'M14.5 6l-6 6 6 6',
    right: 'M9.5 6l6 6-6 6',
    clock: 'M12 7v5l3 2M12 20a8 8 0 100-16 8 8 0 000 16z',
    pin: 'M12 21s6-5.4 6-10.5a6 6 0 10-12 0C6 15.6 12 21 12 21zM12 12.5a2 2 0 100-4 2 2 0 000 4z',
    note: 'M6 4h12v16H6zM9 9h6M9 13h6M9 17h3',
    bell: 'M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0',
    edit: 'M5 19l1-4L16.5 4.5a1.8 1.8 0 012.5 0l.5.5a1.8 1.8 0 010 2.5L9 18zM14.5 6.5l3 3',
    copy: 'M9 9h10v11H9zM5 15V4h10',
    trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5.5M13.5 11v5.5',
    upload: 'M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14',
    download: 'M12 5v11M7.5 11.5L12 16l4.5-4.5M5 19h14',
    eye: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    star: 'M12 4l2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.7 5.4-.7z',
    image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 3-3L20 16M9 9.5h.01',
    wifioff: 'M4 4l16 16M5 10.5a11 11 0 015.5-2.8M9 14.5a6 6 0 013.5-1.2M12 18.5h.01',
    sparkle: 'M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8zM18.5 4v3M20 5.5h-3',
    /* Triply's own */
    send: 'M4.5 12.5l15-8-5.5 15-3-6.5z',
    plane: 'M12 3c.8 0 1.3.8 1.3 1.8V9l7 4v2l-7-2v4l2 1.5v1.5L12 19.5 8.7 21v-1.5l2-1.5v-4l-7 2v-2l7-4V4.8C10.7 3.8 11.2 3 12 3z',
    bed: 'M3 18V7M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5M7 11.5h.01',
    car: 'M5 16l1.5-5.5A2 2 0 018.4 9h7.2a2 2 0 011.9 1.5L19 16M4 16h16v3H4zM7.5 17.5h.01M16.5 17.5h.01',
    ship: 'M3 17l2 3h14l2-3zM6 17v-5h12v5M12 12V6M12 6h4M9 14h.01M12 14h.01M15 14h.01',
    ticket: 'M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4zM14 6v12',
    map: 'M9 5L4 7v12l5-2 6 2 5-2V5l-5 2zM9 5v12M15 7v12',
    chat: 'M5 5h14v11h-9l-4 3.5V16H5z',
    link: 'M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.6l-1 1M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.6l1-1',
    clip: 'M18 11l-7 7a4 4 0 01-5.7-5.7l8-8a2.7 2.7 0 013.8 3.8l-8 8a1.3 1.3 0 01-1.9-1.9l7-7',
    bag: 'M5 8h14v11H5zM9 8V5h6v3M5 13h14',
    share: 'M12 4v11M8 8l4-4 4 4M5 14v5h14v-5',
    logout: 'M10 5H5v14h5M14 8l4 4-4 4M18 12H9',
    smile: 'M12 20a8 8 0 100-16 8 8 0 000 16zM9 10h.01M15 10h.01M8.5 14c1 1.5 2.2 2.2 3.5 2.2s2.5-.7 3.5-2.2',
    dots: 'M5 12h.01M12 12h.01M19 12h.01',
    globe: 'M12 20a8 8 0 100-16 8 8 0 000 16zM4 12h16M12 4c2.5 2.2 3.5 5 3.5 8s-1 5.8-3.5 8c-2.5-2.2-3.5-5-3.5-8s1-5.8 3.5-8z',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
    file: 'M7 3h7l4 4v14H7zM14 3v4h4',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM16.5 16.5L21 21'
  };
  TR.icon = function icon(name, extraClass) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ic' + (extraClass ? ' ' + extraClass : ''));
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.note);
    svg.append(p);
    return svg;
  };

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
  D.startOfWeek = (k, weekStart) => D.addDays(k, -((D.dow(k) - (weekStart || 0) + 7) % 7));
  D.minutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  D.fmtTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  D.fmt = (k, opts) => D.parse(k).toLocaleDateString(undefined, opts);
  D.short = (k) => D.fmt(k, { month: 'short', day: 'numeric' });
  D.long = (k) => D.fmt(k, { weekday: 'long', month: 'long', day: 'numeric' });
  D.withYear = (k) => D.fmt(k, { month: 'short', day: 'numeric', year: 'numeric' });
  D.nowTime = () => { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); };
  D.at = (k, t) => { const d = D.parse(k); const [h, m] = (t || '00:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
  // "Jul 23 – Aug 5, 2027" (or one day, or nothing)
  D.range = (a, b) => {
    if (!a) return 'Dates not set';
    if (!b || a === b) return D.withYear(a);
    const sameYear = a.slice(0, 4) === b.slice(0, 4);
    return D.short(a) + (sameYear ? '' : ', ' + a.slice(0, 4)) + ' – ' + D.short(b) + ', ' + b.slice(0, 4);
  };
  TR.D = D;

  /* ---------- Storage (this device only) ---------- */
  TR.storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem('tr.' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('tr.' + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
  };

  /* ---------- Clipboard ---------- */
  TR.copy = async function (text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
    try {
      const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' });
      ta.value = text; document.body.append(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  };

  // Plain-text helpers
  TR.plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
  TR.initial = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase();
  TR.mapsUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
})();
