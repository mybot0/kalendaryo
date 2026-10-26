/*
 * pin.js — optional parent PIN. A convenience only: it keeps little fingers out of
 * chore, routine and reward settings and asks before stars are spent.
 * It is NOT security. The PIN is saved (hashed) in the shared household settings,
 * and anyone who can open this page can get around it. Say so wherever it is offered.
 *
 *   PL.pin.require(reason)  -> Promise<true|false>  (true at once when no PIN is set)
 *   PL.pin.set() / change() / remove() / lockNow()
 * After a correct PIN, this device stays unlocked for 10 minutes.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h;
  const WINDOW_MS = 10 * 60 * 1000;
  let unlockedUntil = 0;

  async function hash(pin) {
    const text = 'kalendaryo:' + pin;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { // very old or restricted browsers: a simple fallback is fine for a convenience lock
      let x = 5381;
      for (let i = 0; i < text.length; i++) x = ((x << 5) + x + text.charCodeAt(i)) >>> 0;
      return 'h' + x.toString(16);
    }
  }

  const isSet = () => !!PL.state.settings.pinHash;
  const isUnlocked = () => !isSet() || Date.now() < unlockedUntil;

  // Number pad. Resolves with 4 digits, or null when closed without finishing.
  function keypad(o) {
    return new Promise((resolve) => {
      let value = '', result = null;
      const dots = h('div', { class: 'pin-dots', 'aria-label': 'Digits typed' }, [0, 1, 2, 3].map(() => h('span', { class: 'pin-dot' })));
      const err = h('p', { class: 'form-error', role: 'alert', hidden: !o.error }, o.error || '');
      const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < value.length));
      function press(d) {
        if (value.length >= 4) return;
        value += d; paint();
        if (value.length === 4) { result = value; setTimeout(() => s.close(), 120); }
      }
      const back = () => { value = value.slice(0, -1); paint(); };
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) => (k === '' ? h('span') :
        h('button', { type: 'button', class: 'pin-key', 'aria-label': k === '⌫' ? 'Delete' : k, onclick: () => (k === '⌫' ? back() : press(k)) }, k)));
      const s = PL.ui.sheet({
        title: o.title, onClose: () => resolve(result),
        body: h('div', { class: 'pin-pad' }, o.message ? h('p', { class: 'sheet-text' }, o.message) : null, dots, err, h('div', { class: 'pin-keys' }, keys))
      });
      s.panel.addEventListener('keydown', (e) => {
        if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); back(); }
      });
    });
  }

  async function require(reason) {
    if (isUnlocked()) return true;
    let error = '';
    for (;;) {
      const pin = await keypad({ title: 'Parent PIN', message: reason || 'Enter the PIN to continue.', error });
      if (pin == null) return false;
      if ((await hash(pin)) === PL.state.settings.pinHash) { unlockedUntil = Date.now() + WINDOW_MS; return true; }
      error = 'That is not the right PIN. Try again.';
    }
  }

  async function set() {
    const a = await keypad({ title: 'Choose a PIN', message: 'Pick 4 digits.' });
    if (a == null) return false;
    const b = await keypad({ title: 'Type it again', message: 'Once more, to be sure.' });
    if (b == null) return false;
    if (a !== b) { PL.ui.toast('The two PINs did not match. Nothing was changed.'); return false; }
    const ok = await PL.store.saveSettings({ pinHash: await hash(a) });
    if (ok) unlockedUntil = Date.now() + WINDOW_MS;
    return ok;
  }
  async function change() {
    if (isSet() && !(await require('Enter the current PIN first.'))) return false;
    return set();
  }
  async function remove() {
    if (!(await require('Enter the PIN to turn it off.'))) return false;
    return PL.store.saveSettings({ pinHash: '' });
  }
  const lockNow = () => { unlockedUntil = 0; };

  PL.pin = { isSet, isUnlocked, require, set, change, remove, lockNow };
})();
