/*
 * care/care-board.js — the Care board: the screen of the person who gets care (big, simple, no menus).
 *
 *   PL.careBoard.open(memberId)   the family's preview (from the Care page), on top of the app
 *   PL.careBoard.own()            the board's own link (/care/<token>): the whole page is the board
 *
 * Fewest taps: today's box glows → tap it → "Yes, I took them" (2 taps). I need help: 2 taps.
 * Every button is at least 60px and every text at least 18px (care.css).
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, D = PL.D, ui = PL.ui, icon = PL.icon, C = () => PL.care;

  const SNOOZE_MIN = 15;
  const sayList = (names) => names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  const nameOf = (id) => { const m = PL.store.member(id); return m ? m.name : ''; };
  const first = (s) => String(s || '').split(' ')[0];
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('care.' + k) || 'null'); localStorage.setItem('care.' + k, JSON.stringify(v)); } catch (e) { return null; } };

  // Pills drawn in the box: a round tablet or a two-color capsule, one per medicine.
  const SHAPES = ['tb', 'cp', 'tb2', 'cp2'];
  const pillsArt = (n, big) => h('span', { class: 'cb-pills' + (big ? ' big' : '') }, Array.from({ length: Math.min(4, Math.max(1, n)) }, (_, i) => h('i', { class: 'cb-' + SHAPES[i % 4] })));

  // A soft chime (no sound file needed).
  let audio = null;
  function chime() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime + 0.02;
      [[784, 0], [988, 0.28], [1319, 0.56]].forEach(([f, d]) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.2);
        o.connect(g); g.connect(audio.destination); o.start(t0 + d); o.stop(t0 + d + 1.3);
      });
    } catch (e) { /* no sound on this device */ }
  }
  const unlockSound = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* fine */ } };

  /* ---------- big sheets (the app's own sheet, sized for seniors) ---------- */
  function bigSheet(o) {
    const s = ui.sheet(o);
    s.panel.classList.add('wide', 'care-sheet', 'senior');
    if (o.big) s.panel.classList.add('big');
    return s;
  }
  const tile = (emoji, label, onClick, o) => h('button', { type: 'button', class: 'list-card care-tile' + (o && o.on ? ' on' : ''), onclick: onClick },
    h('span', { class: 'em' }, emoji), h('strong', {}, label), o && o.sub ? h('span', { class: 'tile-sub' }, o.sub) : null);
  const tiles = (list, cols) => h('div', { class: 'care-tiles', style: 'grid-template-columns:repeat(' + (cols || 3) + ',1fr)' }, list);
  const stepHead = (n, of) => h('p', { class: 'care-stepn' }, 'Step ' + n + ' of ' + of);

  /* ---------- the board ---------- */
  function create(who, opts) {
    const o = opts || {};
    const timeEl = h('div', { class: 'wall-time' }), dateEl = h('div', { class: 'wall-date' }), greetEl = h('div', { class: 'wall-greet' });
    const helpBtn = h('button', { type: 'button', class: 'btn care-help', onclick: () => askHelp() }, h('span', { 'aria-hidden': 'true' }, '🙋'), h('span', {}, 'I need help'));
    const top = h('header', { class: 'wall-top' }, h('div', { class: 'wall-top-left' }, greetEl, helpBtn), PL.sky ? PL.sky.el() : null, h('div', { class: 'wall-clock' }, timeEl, dateEl));
    const strip = h('section', { class: 'wall-panel care-strip', 'aria-live': 'polite' });
    const box = h('section', { class: 'wall-panel care-box2' });
    const main = h('div', { class: 'care-main' }, strip, box);
    const closeBtn = o.preview ? ui.button('Close preview', { icon: 'x', onClick: () => api.close() }) : null;
    if (closeBtn) closeBtn.classList.add('care-preview-close');
    const root = h('div', { class: 'wall board care-board' + (o.preview ? ' preview' : ''), role: o.preview ? 'dialog' : 'main', 'aria-label': 'Care board', tabindex: '-1' }, closeBtn, top, main);
    const api = { el: root };
    let timers = [], stopClock = null, unsub = null, lastRing = 0, ringSlot = '', seenRemind = store('seenRemind.' + who) || '', lock = null;

    const person = () => PL.store.member(who);
    const bs = () => C().boardSettings(who);
    const snoozeKey = (f) => f.date + '|' + f.time;
    const snoozedUntil = (f) => { const s = store('snooze.' + who) || {}; return s[snoozeKey(f)] || 0; };

    function tick() {
      const now = PL.now();
      PL.clock.fill(timeEl, now, PL.state.settings.hour12);
      dateEl.textContent = D.fmt(D.key(now), { weekday: 'long', month: 'long', day: 'numeric' });
      const hr = now.getHours(), p = person();
      greetEl.textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (p ? ', ' + p.name : '');
    }

    /* ----- the message at the top ----- */
    const whenWord = (f) => {
      const n = C().slotName(f.time), today = D.today();
      if (f.date === today) return n === 'night' ? 'tonight’s' : 'this ' + n + '’s';
      return n === 'night' ? 'last night’s' : 'yesterday ' + n + '’s';
    };
    const pillWord = (f) => (f.meds.length === 1 ? 'pill' : 'pills');
    function recentHelp() {
      const since = new Date(Date.now() - 30 * 60000).toISOString();
      const helps = PL.state.carelog.filter((l) => l.who === who && l.kind === 'help' && l.at > since).sort((a, b) => (a.at < b.at ? 1 : -1));
      if (!helps.length) return null;
      const replies = PL.state.carelog.filter((l) => l.who === who && l.kind === 'reply' && l.at > helps[0].at).sort((a, b) => (a.at < b.at ? -1 : 1));
      return { at: helps[0].at, replies };
    }
    function plansToday() {
      const today = D.today(), nowT = D.nowTime();
      return PL.cal.instances(today, today).filter((i) => (i.memberIds || []).includes(who) && (i.allDay || (i.end || i.start) >= nowT))
        .sort((a, b) => (a.allDay ? '' : a.start || '').localeCompare(b.allDay ? '' : b.start || ''));
    }
    function paintStrip(f) {
      const kids = [];
      const help = recentHelp();
      if (help) {
        const last = help.replies[help.replies.length - 1];
        kids.push(h('div', { class: 'cs-art', 'aria-hidden': 'true' }, '💛'),
          h('div', { class: 's-txt' }, h('div', { class: 'care-say' }, 'Your message was sent'),
            h('div', { class: 'care-sub' }, last ? first(nameOf(last.by)) + ': “' + last.text + '”' : 'Your family will see it when they open Kalendaryo. If it’s urgent, call them. For an emergency, call 911.')));
      } else if (f) {
        const snz = snoozedUntil(f);
        const say = f.state === 'miss' ? 'Did you take ' + whenWord(f) + ' ' + pillWord(f) + '?' : snz > Date.now()
          ? 'Okay, I’ll remind you at ' + C().clockFull(C().local(new Date(snz).toISOString()).hm)
          : 'Time for your ' + (C().slotName(f.time) === 'night' ? 'night' : C().slotName(f.time)) + ' ' + pillWord(f);
        kids.push(h('div', { class: 's-txt' }, h('div', { class: 'care-say' }, say), foodLine(f.meds) ? h('div', { class: 'care-sub' }, foodLine(f.meds)) : null),
          h('button', { type: 'button', class: 's-tap' + (f.state === 'miss' ? ' red' : ''), onclick: () => askAbout(f) }, f.state === 'miss' ? 'Tap the red box' : 'Tap the glowing box'));
      } else if (!C().medsOf(who).filter((m) => !m.stopped).length) {
        kids.push(h('div', { class: 's-txt' }, h('div', { class: 'care-say' }, 'No medicines yet'),
          h('div', { class: 'care-sub' }, bs().letAdd ? 'Tap “Add a medicine”, or ask your family to add them.' : 'Your family adds them in the Kalendaryo app.')));
      } else {
        const nx = C().next(who), today = D.today();
        const doneToday = C().times(who).some((t) => C().slotState(who, today, t) === 'ok');
        const nextTxt = nx ? 'Next ' + pillWord(nx) + ' ' + (nx.date === today ? (C().slotName(nx.time) === 'night' ? 'tonight' : 'today') : nx.date === D.addDays(today, 1) ? 'tomorrow' : D.fmt(nx.date, { weekday: 'long' })) + ' at ' + C().clock(nx.time) : '';
        kids.push(h('div', { class: 'care-tick sm', 'aria-hidden': 'true' }, icon('check')),
          h('div', { class: 's-txt' }, h('div', { class: 'care-say' }, doneToday ? 'All done' : 'No pills right now'), nextTxt ? h('div', { class: 'care-sub' }, nextTxt) : null));
      }
      // Today's plans (calendar events that include this person) and short courses, as small chips.
      const chips = [];
      plansToday().slice(0, 2).forEach((i) => {
        const others = (i.memberIds || []).filter((x) => x !== who).map(nameOf).filter(Boolean).map(first);
        chips.push(h('span', { class: 'care-chip plan' }, '📅 ' + (i.allDay ? 'Today' : C().clock(i.start)) + ' · ' + i.title + (others.length ? ' · with ' + sayList(others) : '')));
      });
      C().medsOf(who).forEach((m) => { const c = C().course(m); if (c && C().activeOn(m, D.today())) chips.push(h('span', { class: 'care-chip' }, '💊 ' + m.name + ' · day ' + c.day + ' of ' + c.of)); });
      if (chips.length && !help) kids.push(h('div', { class: 's-chips' }, chips.slice(0, 2)));
      strip.replaceChildren(h('div', { class: 'wall-panel-body' }, kids));
    }
    function foodLine(meds) {
      const f = meds.map((m) => m.food).find(Boolean);
      return f === 'with' ? 'With food' : f === 'before' ? 'Before eating' : f === 'after' ? 'After eating' : '';
    }

    /* ----- the pill box ----- */
    function days() {
      const today = D.today();
      if (root.clientWidth && root.clientWidth < 640) return [D.addDays(today, -1), today, D.addDays(today, 1)];
      const s = D.startOfWeek(today, PL.state.settings.weekStart || 0);
      return Array.from({ length: 7 }, (_, i) => D.addDays(s, i));
    }
    const PAL = () => PL.config.palette.map((p) => p.hex);
    function paintBox(f) {
      const times = C().times(who), dd = days(), today = D.today(), n = C().nowParts();
      const p = person();
      const head = h('h2', {}, '💊 ' + (p ? p.name + '’s pill box' : 'Pill box'), h('span', { class: 'pb2-hint' }, 'Tap a box to see who gave it'));
      const narrow = dd.length < 7; // phones: 3 days, the page scrolls instead of squeezing the boxes
      const grid = h('div', { class: 'pb2', style: 'grid-template-columns:clamp(64px,7vw,90px) repeat(' + dd.length + ',1fr);grid-template-rows:auto' + (narrow ? ' minmax(96px,auto)' : ' 1fr').repeat(Math.max(1, times.length)) });
      grid.append(h('div'));
      dd.forEach((d) => grid.append(h('div', { class: 'pb2-dh' + (d === today ? ' t' : '') }, d === today ? 'Today' : D.fmt(d, { weekday: 'short' }))));
      times.forEach((t) => {
        grid.append(h('div', { class: 'pb2-rl' }, C().rowLabel(t), h('small', {}, C().clock(t))));
        dd.forEach((d) => {
          const st = C().slotState(who, d, t, n);
          const color = PAL()[Number(D.dow(d)) % PAL().length];
          if (!st) { grid.append(h('div', { class: 'cell none' })); return; }
          const meds = C().medsAt(who, d, t);
          const empty = st === 'future' && meds.some((m) => C().runsOut(m) < d);
          const isFocus = f && f.date === d && f.time === t;
          let cls = 'cell ' + (st === 'ok' || st === 'skip' ? 'open ' + st : st === 'gone' ? 'gone' : empty ? 'empty' : st);
          if (st === 'ok' && d === today) cls += ' today';
          if (isFocus && snoozedUntil(f) > Date.now()) cls += ' snoozed';
          const inside = st === 'ok' ? h('div', { class: 'tick2' }, icon('check')) : st === 'skip' ? h('div', { class: 'tick2 dash' }, '–') : st === 'gone' ? null : pillsArt(meds.length);
          const lid = st === 'ok' || st === 'skip' ? h('div', { class: 'lid2' }) : h('div', { class: 'lid2' }, h('b', {}, D.fmt(d, { weekday: 'narrow' })));
          const label = D.fmt(d, { weekday: 'long' }) + ' ' + C().clock(t) + ': ' + ({ ok: 'taken', skip: 'skipped', now: 'time to take', miss: 'missed', future: 'not yet', gone: 'no answer' }[st] || st);
          grid.append(h('button', { type: 'button', class: cls, style: '--c:' + color, 'aria-label': label, onclick: () => tapCell(d, t, st) },
            h('div', { class: 'well' }, inside), lid, st === 'miss' ? h('em', { 'aria-hidden': 'true' }, '!') : null));
        });
      });
      const foot = h('div', { class: 'pb-foot' });
      const lows = C().medsOf(who).filter((m) => C().low(m));
      if (lows.length) {
        const m = lows[0], hp = m.helper && nameOf(m.helper);
        foot.append(h('div', { class: 'care-warn' }, '💊 ' + (lows.length > 1 ? sayList(lows.map((x) => x.name)) + ' are running low' : m.name + ' runs out ' + runsOutWord(m) + (hp ? ' · ' + first(hp) + ' will pick it up' : ''))),
          h('button', { type: 'button', class: 'btn big care-big foot-btn', onclick: () => boughtFlow(lows) }, icon('plus'), h('span', {}, lows.length > 1 ? 'I bought medicine' : 'I bought ' + m.name)));
      }
      if (bs().letAdd) foot.append(h('button', { type: 'button', class: 'btn big care-big foot-btn add', onclick: () => addFlow() }, icon('plus'), h('span', {}, 'Add a medicine')));
      box.replaceChildren(head, h('div', { class: 'wall-panel-body' }, times.length ? grid : h('p', { class: 'care-sub empty-box' }, 'The pill box fills in when a medicine is added.'), foot));
    }
    function runsOutWord(m) {
      const d = C().runsOut(m), today = D.today();
      return d <= today ? 'today' : d === D.addDays(today, 1) ? 'tomorrow' : D.fmt(d, { weekday: 'long' });
    }

    function paint() {
      if (!root.isConnected && !o.preview) return;
      const f = C().focus(who);
      root.classList.toggle('has-now', !!(f && f.state === 'now'));
      paintStrip(f); paintBox(f);
      ring(f);
      checkRemind();
    }

    /* ----- sound: soft chime when it is time, again every 5 minutes until tapped ----- */
    function ring(f) {
      if (o.preview || !f || f.state !== 'now' || !bs().sound) return;
      if (snoozedUntil(f) > Date.now()) return;
      const k = snoozeKey(f), every = 5 * 60000;
      if (ringSlot !== k) { ringSlot = k; lastRing = 0; }
      if (!lastRing || (bs().ring && Date.now() - lastRing >= every)) { lastRing = Date.now(); chime(); }
    }
    // The family tapped "Remind her" on their phone: ring now.
    function checkRemind() {
      if (o.preview) return;
      const r = PL.state.carelog.filter((l) => l.who === who && l.kind === 'remind' && l.at > new Date(Date.now() - 10 * 60000).toISOString()).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
      if (r && r.at !== seenRemind) { seenRemind = r.at; store('seenRemind.' + who, r.at); if (bs().sound) chime(); ui.toast('🔔 ' + (first(nameOf(r.by)) || 'Your family') + ' says: time for your pills'); }
    }

    /* ----- tapping a box ----- */
    function tapCell(d, t, st) {
      const f = { date: d, time: t, state: st, meds: C().medsAt(who, d, t) };
      if (st === 'now' || st === 'miss') return askAbout(f);
      if (st === 'ok' || st === 'skip') return whoAndWhen(f);
      if (st === 'future') return ui.toast(D.fmt(d, { weekday: 'long' }) + ' · ' + C().clock(t) + ' · not yet');
      ui.toast('No answer for that time.');
    }
    const pillRow = (meds) => h('div', { class: 'ask-pills' }, meds.map((m, i) => h('div', { class: 'care-pw' }, h('div', { class: 'care-pill' }, h('i', { class: 'cb-' + SHAPES[i % 4] })), m.name)));
    function askAbout(f) {
      unlockSound();
      const meds = f.meds, n = meds.length;
      const course = meds.map((m) => C().course(m, f.date)).find(Boolean);
      let s;
      if (f.state === 'miss') {
        s = bigSheet({ title: 'Did you take ' + whenWord(f) + ' ' + pillWord(f) + '?',
          body: h('div', {}, pillRow(meds), h('p', { class: 'care-safe' }, 'Not sure? Call the pharmacist before taking extra.')),
          footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => done('skipped') }, n === 1 ? 'I skipped it' : 'I skipped them'),
            h('button', { type: 'button', class: 'btn primary big care-big', onclick: () => done('late') }, icon('check'), h('span', {}, n === 1 ? 'I took it late' : 'I took them late'))] });
      } else {
        s = bigSheet({ title: 'Did you take your ' + (n === 1 ? 'pill' : n + ' ' + C().slotName(f.time) + ' pills') + '?',
          body: h('div', {}, pillRow(meds), foodLine(meds) || course ? h('p', { class: 'care-safe' }, [foodLine(meds), course ? 'Day ' + course.day + ' of ' + course.of : ''].filter(Boolean).join(' · ')) : null),
          footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => snooze(f, s) }, '⏰ Remind me in ' + SNOOZE_MIN + ' min'),
            h('button', { type: 'button', class: 'btn primary big care-big', onclick: () => done('taken') }, icon('check'), h('span', {}, n === 1 ? 'Yes, I took it' : 'Yes, I took them'))] });
      }
      async function done(status) {
        s.close();
        if (await C().mark(who, f.date, f.time, status)) {
          ui.toast(status === 'skipped' ? 'Marked as skipped.' : status === 'late' ? 'Marked as taken late.' : 'Marked as taken. Well done!', { action: 'Undo', onAction: () => C().unmark(who, f.date, f.time) });
        }
      }
    }
    function snooze(f, s) {
      s.close();
      const until = Date.now() + SNOOZE_MIN * 60000, all = store('snooze.' + who) || {};
      all[snoozeKey(f)] = until; store('snooze.' + who, all);
      C().log(who, 'snooze', { date: f.date, time: f.time });
      lastRing = until - 5 * 60000; // ring again when the 15 minutes are over
      setTimeout(() => { lastRing = 0; paint(); }, SNOOZE_MIN * 60000 + 500);
      paint();
    }
    function whoAndWhen(f) {
      const rows = f.meds.map((m) => {
        const d = C().doseFor(m.id, f.date, f.time);
        if (!d) return null;
        const t = C().clockFull(C().local(d.at).hm);
        const byName = d.by === 'board' ? (person() ? person().name : 'On this board') : nameOf(d.by) || 'Family';
        return h('div', { class: 'care-whorow' }, h('div', { class: 'em' }, d.status === 'skipped' ? '–' : '✓'),
          h('div', { class: 'tt' }, h('b', {}, m.name), h('span', {}, (d.status === 'skipped' ? 'Skipped' : d.status === 'late' ? 'Taken late' : 'Taken') + ' at ' + t + ' · ' + byName)));
      }).filter(Boolean);
      const today = f.date === D.today();
      const s = bigSheet({ title: D.fmt(f.date, { weekday: 'long' }) + ' · ' + C().clock(f.time), body: h('div', { class: 'care-who' }, rows),
        footer: today ? [h('button', { type: 'button', class: 'btn big care-big', onclick: async () => { s.close(); if (await C().unmark(who, f.date, f.time)) ui.toast('Changed back to not taken.'); } }, 'That was a mistake'),
          h('button', { type: 'button', class: 'btn primary big care-big', onclick: () => s.close() }, 'OK')] : [h('button', { type: 'button', class: 'btn primary big care-big', onclick: () => s.close() }, 'OK')] });
      const auto = setTimeout(() => s.close(), 12000);
      s.panel.addEventListener('pointerdown', () => clearTimeout(auto), { once: true });
    }

    /* ----- I need help (2 taps) ----- */
    function askHelp() {
      unlockSound();
      const s = bigSheet({ title: 'Tell your family you need help?',
        body: h('div', { class: 'care-center' }, h('div', { class: 'help-art', 'aria-hidden': 'true' }, '🙋'), h('p', { class: 'care-sub' }, 'Your family sees it when they open Kalendaryo. If it’s urgent, call them.'), h('p', { class: 'care-safe' }, 'For an emergency, call 911.')),
        footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => s.close() }, 'Cancel'),
          h('button', { type: 'button', class: 'btn primary big care-big', onclick: async () => { s.close(); if (await C().log(who, 'help')) ui.toast('Sent. Your family will see it in Kalendaryo.'); } }, 'Yes, tell them')] });
    }

    /* ----- I bought medicine (2 taps; 3 when two are low) ----- */
    function boughtFlow(lows) {
      if (lows.length === 1) return boxes(lows[0]);
      const s = bigSheet({ title: 'Which one did you buy?', body: tiles(lows.map((m) => tile(C().kind(m.kind).emoji, m.name, () => { s.close(); boxes(m); })), Math.min(3, lows.length)),
        footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => s.close() }, 'Cancel')] });
    }
    function boxes(m) {
      const s = bigSheet({ title: 'How many boxes of ' + m.name + '?', body: h('div', {}, tiles([1, 2, 3].map((n) => tile('📦'.repeat(n), n + (n > 1 ? ' boxes' : ' box'), () => save(n * m.box), { sub: n * m.box + ' pills' }))),
        h('button', { type: 'button', class: 'btn ghost big care-big other-num', onclick: () => { s.close(); number('How many pills did you buy?', m.box, (v) => C().bought(m, v).then((ok) => ok && ui.toast('Thank you! ' + m.name + ' was added.'))); } }, 'A different number')),
        footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => s.close() }, 'Cancel')] });
      async function save(pills) { s.close(); if (await C().bought(m, pills)) ui.toast('Thank you! ' + m.name + ' was added.'); }
    }
    function number(title, start, onDone, onBack) {
      let v = start || 30;
      const numEl = h('div', { class: 'num' }, String(v));
      const step = (d) => { v = Math.max(1, Math.min(999, v + d)); numEl.textContent = String(v); };
      const s = bigSheet({ title, body: h('div', { class: 'care-center' }, h('div', { class: 'care-stepper big' },
        h('button', { type: 'button', class: 'icon-btn tbtn', 'aria-label': 'Less', onclick: () => step(-1) }, icon('minus')), numEl,
        h('button', { type: 'button', class: 'icon-btn tbtn', 'aria-label': 'More', onclick: () => step(1) }, icon('plus'))),
        h('div', { class: 'chip-row' }, [10, 30].map((n) => h('button', { type: 'button', class: 'person-pick big-chip', onclick: () => step(n) }, '+' + n)))),
        footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => { s.close(); onBack && onBack(); } }, onBack ? 'Back' : 'Cancel'),
          h('button', { type: 'button', class: 'btn primary big care-big', onclick: () => { s.close(); onDone(v); } }, 'Done')] });
    }

    /* ----- She adds her own medicine: about 5 big taps, no typing needed ----- */
    function addFlow() {
      const d = { who, each: 1, addedBy: 'board' };
      const QUICK = ['bp', 'sugar', 'chol', 'heart', 'vit'];
      const close = (s) => s.close();
      function s1() {
        const s = bigSheet({ big: true, title: 'What is it for?', body: h('div', {}, stepHead(1, 4), tiles(QUICK.map((k) => C().kind(k)).map((k) => tile(k.emoji, k.label, () => { close(s); d.kind = k.id; s2(); }))
          .concat(tile('＋', 'Something else', () => { close(s); d.kind = 'other'; typeName(s1); })))),
          footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => close(s) }, 'Cancel')] });
      }
      function s2() {
        const k = C().kind(d.kind);
        const s = bigSheet({ big: true, title: 'Which one?', body: h('div', {}, stepHead(2, 4), tiles(k.names.slice(0, 4).map((n) => tile(k.emoji, n, () => { close(s); d.name = n; s3(); }))
          .concat(tile('🤷', 'I don’t know the name', () => { close(s); d.name = k.label + ' pill'; s3(); }), tile('⌨️', 'Type it', () => { close(s); typeName(s2); })))),
          footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => { close(s); s1(); } }, 'Back')] });
      }
      function typeName(back) {
        const input = h('input', { type: 'text', class: 'care-input', maxlength: '60', placeholder: 'For example: Vitamin K', autocomplete: 'off', autocapitalize: 'words', autofocus: true });
        const s = bigSheet({ big: true, title: 'What is it called?', body: h('div', { class: 'event-form' }, stepHead(2, 4), input, h('p', { class: 'hint' }, 'Write it the way it is printed on the box.')),
          footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => { close(s); back(); } }, 'Back'),
            h('button', { type: 'button', class: 'btn primary big care-big', onclick: () => { const v = input.value.trim(); if (!v) { ui.toast('Please type the name.'); input.focus(); return; } close(s); d.name = v; s3(); } }, 'Next')] });
      }
      function s3() {
        const CHOICES = [['☀️', 'Morning', ['08:00']], ['🌙', 'Night', ['20:00']], ['☀️🌙', 'Morning and night', ['08:00', '20:00']], ['🕒', '3 times a day', ['08:00', '12:00', '20:00']]];
        let pick = -1, times = [];
        const rows = h('div', { class: 'trows' });
        const nextBtn = h('button', { type: 'button', class: 'btn primary big care-big', hidden: true, onclick: () => { close(s); d.times = times.slice(); s4(); } }, 'Next');
        const grid = h('div', { class: 'care-tiles t4' });
        function paintS3() {
          grid.replaceChildren(...CHOICES.map(([e, l, t], i) => tile(e, l, () => { pick = i; times = t.slice(); paintS3(); }, { on: pick === i })));
          rows.replaceChildren(...times.map((t, i) => timeRow(t, (v) => { times[i] = v; paintS3(); }, i, times.length)));
          if (times.length) rows.append(h('p', { class: 'thint' }, 'Tap − or + to change the time'));
          nextBtn.hidden = !times.length;
        }
        const s = bigSheet({ big: true, title: 'When do you take it?', body: h('div', {}, stepHead(3, 4), grid, rows),
          footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => { close(s); s2(); } }, 'Back'), nextBtn] });
        paintS3();
      }
      function s4() {
        const s = bigSheet({ big: true, title: 'How many pills did you buy?', body: h('div', {}, stepHead(4, 4), tiles([30, 60, 90].map((n) => tile('💊', n + ' pills', () => { close(s); save(n); }))
          .concat(tile('🔢', 'Other number', () => { close(s); number('How many pills did you buy?', 30, save, s4); })), 4),
          h('p', { class: 'hint center' }, '1 pill each time. Your family can change this.')),
          footer: [h('button', { type: 'button', class: 'btn big care-big', onclick: () => { close(s); s3(); } }, 'Back')] });
      }
      async function save(count) {
        const data = Object.assign({}, d, { count, box: count, countAt: new Date().toISOString(), start: D.today() });
        const id = await PL.store.add('meds', data);
        if (id) { C().log(who, 'added', { med: id, name: d.name }); ui.toast(d.name + ' added. Your family was told.'); }
      }
      s1();
    }

    /* ----- start ----- */
    const onResize = () => paint();
    api.close = () => {
      timers.forEach(clearInterval); timers = [];
      if (stopClock) stopClock();
      removeEventListener('resize', onResize);
      if (unsub) unsub();
      try { if (lock) lock.release(); } catch (e) { /* fine */ }
      root.remove();
      if (o.preview) PL.theme.setWall(false);
      document.documentElement.classList.remove('care-open');
      if (o.onClose) o.onClose();
    };
    api.start = () => {
      document.documentElement.classList.add('care-open');
      unsub = PL.store.subscribe(() => paint());
      tick(); paint();
      stopClock = PL.clock.start(tick);
      timers.push(setInterval(paint, 20000));
      if (!o.preview && bs().awake) keepAwake();
      addEventListener('resize', onResize);
    };
    function keepAwake() {
      const req = () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch (e) { /* fine */ } };
      req(); document.addEventListener('visibilitychange', req);
    }
    return api;
  }

  /* ---------- time row with glowing − and + (30 minutes a tap) ---------- */
  function timeRow(t, onChange, idx, count, label) {
    const n = PL.care.slotName(t);
    const names = { morning: '☀️ Morning', midday: '🍲 Midday', afternoon: '🌤️ Afternoon', night: '🌙 Night' };
    const shift = (d) => { let m = PL.care.hm(t) + d; m = (m + 1440) % 1440; onChange(D.pad(Math.floor(m / 60)) + ':' + D.pad(m % 60)); };
    return h('div', { class: 'trow' },
      h('span', { class: 'tl' }, label || names[n]),
      h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Earlier', onclick: () => shift(-30) }, '−'),
      h('span', { class: 'tv' }, PL.care.clockFull(t)),
      h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Later', onclick: () => shift(30) }, '+'));
  }

  /* ---------- the family's preview, on top of the app ---------- */
  let open1 = null;
  function open(who) {
    if (open1) open1.close();
    open1 = create(who, { preview: true, onClose: () => { open1 = null; } });
    document.body.append(open1.el);
    PL.theme.setWall(true);
    open1.start();
    try { open1.el.focus({ preventScroll: true }); } catch (e) { /* fine */ }
    return open1;
  }

  /* ---------- the board's own link: the whole page ---------- */
  function own(rootEl) {
    const who = window.KAL && KAL.me && KAL.me.memberId;
    document.documentElement.classList.add('care-mode');
    const b = create(who, {});
    rootEl.replaceChildren(b.el);
    PL.theme.setWall(true);
    b.start();
    // One tap to start: turns on the sound (tablets only allow sound after a tap).
    if (!sessionStorage.getItem('care.started')) {
      const go = h('div', { class: 'care-start' }, h('div', { class: 'care-start-card' }, h('div', { class: 'help-art', 'aria-hidden': 'true' }, '💊'),
        h('h1', {}, 'Care board'), h('p', {}, 'Tap the button to start. The board will ring softly when it is time for your pills.'),
        h('button', { type: 'button', class: 'btn primary big care-big', onclick: () => { unlockSound(); try { sessionStorage.setItem('care.started', '1'); } catch (e) { /* fine */ } go.remove(); } }, 'Start')));
      b.el.append(go);
    }
    return b;
  }
  // The link was replaced ("Make a new link") or removed.
  function gone(rootEl) {
    document.documentElement.classList.add('care-mode');
    (rootEl || document.getElementById('porchlight-root')).replaceChildren(h('div', { class: 'care-start' }, h('div', { class: 'care-start-card' },
      h('div', { class: 'help-art', 'aria-hidden': 'true' }, '🔗'), h('h1', {}, 'This link was changed'),
      h('p', {}, 'Your family made a new link for this Care board. Ask them to open the new link on this tablet.'))));
  }

  PL.careBoard = { open, own, gone, timeRow, bigSheet, tile, tiles, stepHead, pillsArt };
})();
