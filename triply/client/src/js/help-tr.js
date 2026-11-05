/*
 * help-tr.js — plugs "Help & ideas" (help.js) into Triply. Each person on a trip has their own conversation
 * with the Triply team, about that trip. Not shown on My Trips (no trip open) or in the owner's read-only view.
 */
(function () {
  const TR = window.TR;
  if (!window.HelpUI) return;
  const demo = !!window.TRIPLY_DEMO;
  const s = () => TR.currentTrip && TR.currentTrip();
  const live = () => { const x = s(); return x && x.state && !(x.ownerView && x.ownerView()) ? x : null; };
  const DEMO = [
    { team: true, auto: true, body: 'Hi Maya! 👋 Thank you for planning your trip with Triply. It means a lot to us. We build it around what travelers actually need, so if anything is confusing, missing, or could be better, just reply here. Every message is read, and many of our updates come straight from ideas like yours. ✈️💛', at: new Date(Date.now() - 3 * 86400000).toISOString() },
    { team: false, tag: 'question', body: 'Can my brother edit the itinerary too?', at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { team: true, body: 'Yes! Go to People, then make him an Editor. 😊', at: new Date(Date.now() - 2 * 86400000 + 3600000).toISOString() }
  ];
  TR.help = HelpUI.create({
    app: 'Triply',
    ready: () => !!live(),
    demo: demo ? DEMO : null,
    get: () => live().req('GET', '/help'),
    unread: () => live().req('GET', '/help/unread'),
    send: (b) => live().req('POST', '/help', b),
    seen: () => live().req('POST', '/help/seen')
  });
  // A different trip is a different conversation: check for new replies whenever the open trip changes.
  // The person's saved light/dark choice for this trip is applied at the same time.
  let lastId = null;
  TR.help.tripShown = (session) => {
    const id = session && session.state ? session.id : null;
    if (id !== lastId) { lastId = id; TR.help.refresh(); if (live() && session.state.me && session.state.me.theme) TR.theme.load(session.state.me.theme); }
  };
  // Light/dark is saved to the person (for this trip), so it follows them to every device.
  TR.theme.onSave((v) => { const x = live(); if (x && !demo) x.req('PATCH', '/members/me/theme', { theme: v }).catch(() => {}); });
})();
