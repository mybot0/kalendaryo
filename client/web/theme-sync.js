/*
 * theme-sync.js — web version only. Light/dark is saved to the person (their link), so it follows them to
 * every device. The device also remembers it, so the page opens in the right look before the server answers.
 * The site owner's read-only view never saves anything.
 */
(function () {
  const PL = window.PL, KAL = window.KAL;
  if (!PL || !PL.theme || !KAL) return;
  KAL.on('me', (me) => { if (me && me.theme && !me.viewing) PL.theme.load(me.theme); });
  PL.theme.onSave((v) => { if (KAL.token && KAL.me && !KAL.me.viewing && !KAL.demo) KAL.api('PATCH', '/api/me/theme', { theme: v }).catch(() => {}); });
})();
