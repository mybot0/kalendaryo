/*
 * in-app.js — KalRadio inside a Kalendaryo home: side menu → Radio.
 * Shows the /radio page in the app's main area. It passes the person's link key in the #hash
 * (never sent to the server in the address), so the stations are the home's own.
 * client/build.js adds this file only if the kalradio folder is there (TOUCH POINT R3).
 * Music stops when you go to another page of the app.
 * If the home has a parent PIN (Settings), the radio asks for it before searching or changing stations (PL.pin).
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};

  PL.screens.radio = {
    mount(main) {
      const KAL = window.KAL || {};
      const f = document.createElement('iframe');
      f.title = 'KalRadio';
      f.allow = 'autoplay';
      f.src = '/radio?embed=1' + (KAL.token && !KAL.care ? '#t=' + encodeURIComponent(KAL.token) : '');
      f.style.cssText = 'display:block;width:100%;border:0;background:transparent;min-height:420px';
      main.appendChild(f);
      // Fill the space between the top of the frame and the bottom of the screen (above the phone's bottom bar).
      function fit() {
        const nav = document.querySelector('nav.nav');
        const nr = nav ? nav.getBoundingClientRect() : null;
        const bottomBar = nr && nr.top > window.innerHeight / 2 ? window.innerHeight - nr.top : 0;
        const top = f.getBoundingClientRect().top + window.scrollY; // where the frame sits on the page, not on screen
        f.style.height = Math.max(260, Math.floor(window.innerHeight - top - bottomBar)) + 'px';
      }
      fit(); requestAnimationFrame(fit); const later = setTimeout(fit, 600);
      window.addEventListener('resize', fit);
      // The radio asks: "may this person search or change stations?" -> the home's parent PIN, if it has one.
      async function onMsg(e) {
        if (e.source !== f.contentWindow || e.origin !== location.origin || !e.data || e.data.type !== 'kalradio:pin') return;
        let ok = true;
        try { if (PL.pin && PL.pin.require) ok = !!(await PL.pin.require('Enter the PIN to search or change radio stations.')); } catch (err) { ok = false; }
        f.contentWindow.postMessage({ type: 'kalradio:pin-ok', id: e.data.id, ok }, location.origin);
      }
      window.addEventListener('message', onMsg);
      return { destroy() { clearTimeout(later); window.removeEventListener('resize', fit); window.removeEventListener('message', onMsg); f.src = 'about:blank'; } };
    }
  };
})();
