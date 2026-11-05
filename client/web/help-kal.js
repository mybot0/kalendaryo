/*
 * help-kal.js — plugs "Help & ideas" (help.js) into Kalendaryo. Web version only (it needs the server).
 * Each person in a home has their own conversation with the Kalendaryo team. The demo home shows a sample.
 */
(function () {
  const PL = window.PL, KAL = window.KAL;
  if (!PL || !KAL || !window.HelpUI) return;
  const DEMO = [
    { team: true, body: 'Hi Maya! 👋 Thank you for using Kalendaryo. It means a lot to us. We build it around what families actually need, so if anything is confusing, missing, or could be better, just reply here. Every message is read, and many of our updates come straight from ideas like yours. 💛', at: new Date(Date.now() - 3 * 86400000).toISOString() },
    { team: false, tag: 'idea', body: 'Could we print the grocery list for the store?', at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { team: true, body: 'Great idea! A Print button for Lists is on the way. 🛒', at: new Date(Date.now() - 2 * 86400000 + 3600000).toISOString() }
  ];
  PL.help = HelpUI.create({
    app: 'Kalendaryo',
    ready: () => !!(KAL.demo || (KAL.token && KAL.me && !KAL.me.viewing)),
    demo: KAL.demo ? DEMO : null,
    get: () => KAL.api('GET', '/api/help'),
    unread: () => KAL.api('GET', '/api/help/unread'),
    send: (b) => KAL.api('POST', '/api/help', b),
    seen: () => KAL.api('POST', '/api/help/seen')
  });
  KAL.on('me', () => PL.help.refresh());
  setTimeout(() => PL.help.refresh(), 1500);
})();
