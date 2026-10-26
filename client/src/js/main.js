/* main.js — start the app. */
(function () {
  const PL = window.PL;
  function boot() {
    if (PL.beforeBoot && PL.beforeBoot() === false) return; // the web version shows its start page instead
    const root = document.getElementById('porchlight-root');
    const started = PL.store.init(); // loads device settings and the saved copy right away
    PL.shell.build(root);
    const saved = PL.storage.get('lastScreen', 'home');
    PL.nav.go(PL.screens[saved] ? saved : 'home');
    PL.shell.status();
    PL.notify.start();
    started.then(() => PL.shell.status());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

