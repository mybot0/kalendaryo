/* main.js — start the app. */
(function () {
  const PL = window.PL;
  function boot() {
    if (PL.beforeBoot && PL.beforeBoot() === false) return; // the web version shows its start page instead
    const root = document.getElementById('porchlight-root');
    if (window.KAL && KAL.care) return bootCare(root); // a Care board link: only the Care board (client/care)
    const started = PL.store.init(); // loads device settings and the saved copy right away
    PL.shell.build(root);
    const saved = PL.storage.get('lastScreen', 'home');
    PL.nav.go(PL.screens[saved] ? saved : 'home');
    PL.shell.status();
    PL.notify.start();
    if (PL.careUi) { PL.careUi.paintNav(); PL.careUi.startAlerts(); }
    started.then(() => PL.shell.status());
  }
  function bootCare(root) {
    KAL.ready.then(() => {
      if (KAL.invalid || !KAL.me) return PL.careBoard.gone(root);
      PL.store.init();
      PL.careBoard.own(root);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

