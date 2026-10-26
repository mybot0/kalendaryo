/*
 * ui-kit.js — reusable interface pieces (buttons, sheets, dialogs, toggles, avatars).
 * Screens are built from these, so a change here changes the look everywhere.
 * The matching styles are in styles/components.css.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon;
  let uid = 0;
  const nextId = (p) => p + '-' + ++uid;

  /* ---------- toast (short message at the bottom) ---------- */
  let toastTimer = null;
  function toast(message) {
    let el = document.getElementById('pl-toast');
    if (!el) {
      el = h('div', { id: 'pl-toast', role: 'status', 'aria-live': 'polite', class: 'toast' });
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
  }

  /* ---------- avatar ---------- */
  function avatar(member, size) {
    const s = size || 40;
    const label = member ? member.name : 'Everyone';
    const content = member ? (member.avatar || (member.name || '?').trim().charAt(0).toUpperCase()) : '★';
    return h('span', {
      class: 'avatar' + (member && member.avatar ? ' emoji' : ''),
      style: '--c:' + (member ? member.color : PL.config.neutralColor) + ';--s:' + s + 'px',
      title: label, role: 'img', 'aria-label': label
    }, content);
  }

  /* ---------- buttons ---------- */
  // variant: 'primary' | 'soft' | 'ghost' | 'danger'
  function button(label, opts) {
    const o = opts || {};
    return h('button', {
      type: o.type || 'button',
      class: 'btn ' + (o.variant || 'soft') + (o.big ? ' big' : '') + (o.block ? ' block' : ''),
      onclick: o.onClick, disabled: o.disabled, 'aria-label': o.aria
    }, o.icon ? icon(o.icon) : null, label ? h('span', {}, label) : null);
  }
  function iconButton(name, label, onClick, cls) {
    return h('button', { type: 'button', class: 'icon-btn' + (cls ? ' ' + cls : ''), 'aria-label': label, title: label, onclick: onClick }, icon(name));
  }

  /* ---------- form pieces ---------- */
  function field(label, control, hint) {
    if (!control.id) control.id = nextId('f');
    return h('div', { class: 'field' },
      h('label', { for: control.id }, label),
      control,
      hint ? h('p', { class: 'hint' }, hint) : null);
  }

  // Row of choices, one selected. Returns { el, get, set }.
  function segmented(options, value, onChange, ariaLabel) {
    let current = value;
    const btns = options.map((o) => h('button', {
      type: 'button', role: 'radio', class: 'seg-btn', dataset: { v: String(o.value) },
      onclick: () => { set(o.value); onChange && onChange(o.value); }
    }, o.label));
    const el = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': ariaLabel || '' }, btns);
    function set(v) {
      current = v;
      btns.forEach((b, i) => {
        const on = String(options[i].value) === String(v);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.classList.toggle('on', on);
      });
    }
    set(value);
    return { el, get: () => current, set };
  }

  // On/off switch with a label. Returns { el, get, set }.
  function toggle(label, checked, onChange) {
    const input = h('input', { type: 'checkbox', class: 'switch-input' });
    input.checked = !!checked;
    input.addEventListener('change', () => onChange && onChange(input.checked));
    const el = h('label', { class: 'switch' }, input, h('span', { class: 'track', 'aria-hidden': 'true' }, h('span', { class: 'thumb' })), h('span', { class: 'switch-label' }, label));
    return { el, input, get: () => input.checked, set: (v) => { input.checked = !!v; } };
  }

  function select(options, value, onChange) {
    const el = h('select', { class: 'select' }, options.map((o) => h('option', { value: String(o.value) }, o.label)));
    el.value = String(value);
    if (onChange) el.addEventListener('change', () => onChange(el.value));
    return el;
  }

  function colorPicker(value, allowAuto, onChange) {
    let current = value || '';
    const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
    const make = (hex, name) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'swatch' + (hex ? '' : ' auto'), style: hex ? '--c:' + hex : '', 'aria-label': name, title: name,
        onclick: () => { current = hex; paint(); onChange && onChange(hex); } }, hex ? null : 'Auto');
      b.dataset.hex = hex;
      return b;
    };
    if (allowAuto) wrap.append(make('', 'Automatic'));
    PL.config.palette.forEach((p) => wrap.append(make(p.hex, p.name)));
    function paint() {
      wrap.querySelectorAll('.swatch').forEach((b) => {
        const on = b.dataset.hex === current;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.classList.toggle('on', on);
      });
    }
    paint();
    return { el: wrap, get: () => current, set: (v) => { current = v || ''; paint(); } };
  }

  function emptyState(o) {
    return h('div', { class: 'empty-state' },
      o.icon ? h('div', { class: 'empty-icon' }, icon(o.icon)) : null,
      h('h3', {}, o.title),
      o.text ? h('p', {}, o.text) : null,
      o.action ? o.action : null);
  }

  /* ---------- sheets (popup panels) ---------- */
  const stack = [];
  function sheet(opts) {
    const prevFocus = document.activeElement;
    const titleId = nextId('sheet-title');
    let pressedBackdrop = false;
    const api = {};
    const panel = h('div', { class: 'sheet' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      h('div', { class: 'sheet-head' },
        h('h2', { id: titleId }, opts.title || ''),
        iconButton('x', 'Close', () => api.close(), 'sheet-close')),
      h('div', { class: 'sheet-body' }, opts.body),
      opts.footer ? h('div', { class: 'sheet-foot' }, opts.footer) : null);
    const wrap = h('div', { class: 'sheet-wrap',
      onpointerdown: (e) => { pressedBackdrop = e.target === wrap; },
      onclick: (e) => { if (e.target === wrap && pressedBackdrop) api.close(); } }, panel);

    api.el = wrap; api.panel = panel;
    api.close = function (result) {
      if (!wrap.isConnected) return;
      wrap.remove();
      const i = stack.indexOf(api); if (i > -1) stack.splice(i, 1);
      if (!stack.length) document.documentElement.classList.remove('has-sheet');
      if (prevFocus && prevFocus.isConnected && prevFocus.focus) prevFocus.focus();
      opts.onClose && opts.onClose(result);
    };
    stack.push(api);
    document.documentElement.classList.add('has-sheet');
    document.body.append(wrap);
    const first = panel.querySelector('[autofocus]') || panel.querySelector('input:not([type=hidden]),textarea,select');
    (first || panel).focus({ preventScroll: true });
    return api;
  }
  document.addEventListener('keydown', (e) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); top.close(); return; }
    if (e.key === 'Tab') { // keep keyboard focus inside the open sheet
      const items = [...top.panel.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  });

  // Ask yes/no. Resolves true or false.
  function confirm(o) {
    return new Promise((resolve) => {
      let answer = false;
      const s = sheet({
        title: o.title, onClose: () => resolve(answer),
        body: o.message ? h('p', { class: 'sheet-text' }, o.message) : h('span'),
        footer: [
          button(o.cancelLabel || 'Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }),
          button(o.confirmLabel || 'OK', { variant: o.danger ? 'danger-solid' : 'primary', big: true, onClick: () => { answer = true; s.close(); } })
        ]
      });
    });
  }

  // Pick one of several actions. options: [{value,label,description,danger}]. Resolves value or null.
  function choose(o) {
    return new Promise((resolve) => {
      let picked = null;
      const s = sheet({
        title: o.title, onClose: () => resolve(picked),
        body: h('div', { class: 'choices' },
          o.message ? h('p', { class: 'sheet-text' }, o.message) : null,
          o.options.map((opt) => h('button', { type: 'button', class: 'choice' + (opt.danger ? ' danger' : ''), onclick: () => { picked = opt.value; s.close(); } },
            h('strong', {}, opt.label), opt.description ? h('span', {}, opt.description) : null)))
      });
    });
  }

  /* ---------- gestures ---------- */
  // Press-and-hold (touch) or double-click (mouse) on an element.
  function onHold(el, fn) {
    let timer = null, sx = 0, sy = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(() => { timer = null; el.dataset.held = '1'; fn(e); }, 550);
    });
    const cancel = () => { clearTimeout(timer); timer = null; };
    el.addEventListener('pointermove', (e) => { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel(); });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', (e) => { if (el.dataset.held) e.preventDefault(); });
    el.addEventListener('dblclick', (e) => { if (e.target.closest('button')) return; fn(e); });
    // The click that follows a long press should not also open the day.
    el.addEventListener('click', (e) => { if (el.dataset.held) { e.stopImmediatePropagation(); e.preventDefault(); delete el.dataset.held; } }, true);
  }

  // Swipe left/right on touch screens.
  function onSwipe(el, onLeft, onRight) {
    let sx = 0, sy = 0, active = false;
    el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; active = true; sx = e.clientX; sy = e.clientY; });
    el.addEventListener('pointerup', (e) => {
      if (!active) return; active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) (dx < 0 ? onLeft : onRight)();
    });
    el.addEventListener('pointercancel', () => { active = false; });
  }

  PL.ui = { toast, avatar, button, iconButton, field, segmented, toggle, select, colorPicker, emptyState, sheet, confirm, choose, onHold, onSwipe };
})();

