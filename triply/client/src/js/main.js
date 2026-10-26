/* main.js — start the app. */
(function () {
  const TR = window.TR;
  function boot() {
    TR.shell.build(document.getElementById('triply-root'));
    TR.shell.route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
