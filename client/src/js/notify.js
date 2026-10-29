/*
 * notify.js — event reminders on this device. They only appear while Kalendaryo is open
 * (a web page cannot wake itself up). Each reminder shows once.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;
  const fired = new Set(PL.storage.get('fired', []));
  const keyOf = (i) => i.date + '|' + (i.id || i.eventId || i.title) + '|' + (i.start || '');

  function check() {
    if (!PL.state.device.notify || !PL.state.ready) return;
    const now = PL.now();
    PL.cal.dueReminders(now).forEach((i) => {
      const k = keyOf(i);
      if (fired.has(k)) return;
      fired.add(k);
      PL.storage.set('fired', [...fired].slice(-200));
      const when = i.allDay ? 'Today' : PL.cal.rangeLabel(i);
      PL.ui.toast('Reminder: ' + i.title + ' · ' + when);
      try { if (window.Notification && Notification.permission === 'granted') new Notification(i.title, { body: when }); } catch (e) { /* ignore */ }
    });
  }

  async function enable() {
    try { if (window.Notification && Notification.permission === 'default') await Notification.requestPermission(); } catch (e) { /* ignore */ }
    return true;
  }
  const canPopup = () => { try { return !!window.Notification && Notification.permission === 'granted'; } catch (e) { return false; } };

  PL.notify = { check, enable, canPopup, start() { setInterval(check, 30000); setTimeout(check, 4000); } };
})();
