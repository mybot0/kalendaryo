/*
 * care/care-page.js — the family side of Care, inside the normal app:
 *   PL.screens.care          the Care page (medicines, today, alerts, the Care board link)
 *   PL.careUi.addMedicine()  "Add a medicine" (4 short steps)
 *   PL.careUi.settingsCards() the Care and Tell the family cards in Settings
 *   alerts                   "Nana Rosa asked for help", "not taken after 30 minutes" … on every page
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, D = PL.D, ui = PL.ui, icon = PL.icon, C = () => PL.care;
  const isDemo = () => !!(window.KAL && KAL.demo);
  const canEdit = () => !(window.KAL && KAL.me && (KAL.me.role === 'viewer' || KAL.me.viewing));
  const nameOf = (id) => { const m = PL.store.member(id); return m ? m.name : ''; };
  const first = (s) => String(s || '').split(' ')[0];
  const myId = () => (window.KAL && KAL.me && KAL.me.memberId) || '';
  const timeOfIso = (iso) => C().clockFull(C().local(iso).hm);
  const dayWord = (key) => { const t = D.today(); return key === t ? 'Today' : key === D.addDays(t, -1) ? 'Yesterday' : D.fmt(key, { weekday: 'long', month: 'short', day: 'numeric' }); };
  const whenText = (m) => {
    const t = m.times.map(C().clock).join(' + ');
    const each = m.each === 0.5 ? '½ pill' : m.each === 1 ? '1 pill' : m.each + ' pills';
    const food = m.food === 'with' ? ' · with food' : m.food === 'before' ? ' · before eating' : m.food === 'after' ? ' · after eating' : '';
    return t + ' · ' + each + food;
  };

  /* ---------- Add a medicine (family): 4 short steps ---------- */
  function addMedicine(forWho) {
    if (!canEdit()) { ui.toast('You can only view Care. Ask an owner to make you an Editor.'); return; }
    const d = { who: forWho || (C().people()[0] && C().people()[0].id) || '', kind: '', name: '', times: ['08:00'], each: 1, count: 30, box: 30, food: '', days: null, helper: '', remind: 2 };
    let step = 1;
    const body = h('div', { class: 'event-form care-add' });
    const back = ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => (step === 1 ? s.close() : go(step - 1)) });
    const nextBtn = ui.button('Next', { variant: 'primary', big: true, onClick: () => next() });
    const s = ui.sheet({ title: 'Add a medicine', body, footer: [back, nextBtn] });
    s.panel.classList.add('wide', 'care-sheet');
    const label = (t) => h('span', { class: 'field-label' }, t);
    function go(n) { step = n; paint(); }
    function next() {
      if (step === 1) { if (!d.who) return ui.toast('Pick who the medicine is for.'); if (!d.kind) return ui.toast('Pick what it is for.'); return go(2); }
      if (step === 2) { if (!d.name.trim()) return ui.toast('Pick or type the name.'); return go(3); }
      if (step === 3) { if (!d.times.length) return ui.toast('Pick when to take it.'); return go(4); }
      save();
    }
    function paint() {
      back.querySelector('span').textContent = step === 1 ? 'Cancel' : 'Back';
      nextBtn.querySelector('span').textContent = step === 4 ? 'Add medicine' : 'Next';
      s.panel.querySelector('.sheet-head h2').textContent = step === 1 ? 'Add a medicine' : (C().kind(d.kind).emoji + ' ' + (d.name || C().kind(d.kind).label));
      const kids = [h('p', { class: 'care-stepn small' }, 'Step ' + step + ' of 4')];
      if (step === 1) {
        const ppl = PL.state.members.filter((m) => m.role !== 'child' || C().people().some((p) => p.id === m.id));
        kids.push(h('div', { class: 'field' }, label('Who is it for?'), h('div', { class: 'chip-row' }, ppl.map((m) => personPick(m, d.who === m.id, () => { d.who = m.id; paint(); })))));
        kids.push(h('div', { class: 'field' }, label('What is it for?'), h('div', { class: 'care-types' }, C().KINDS.map((k) => h('button', { type: 'button', class: 'avatar-opt care-type' + (d.kind === k.id ? ' on' : ''), 'aria-pressed': String(d.kind === k.id), onclick: () => { if (d.kind !== k.id) d.name = ''; d.kind = k.id; paint(); } },
          h('span', { class: 'em' }, k.emoji), k.label)))));
      } else if (step === 2) {
        const k = C().kind(d.kind), typed = d.name && !k.names.includes(d.name) && d.name !== k.label + ' pill';
        const input = h('input', { type: 'text', class: 'care-input', maxlength: '60', placeholder: 'For example: Vitamin K', autocomplete: 'off', value: typed ? d.name : '' });
        input.addEventListener('input', () => { d.name = input.value; });
        if (k.names.length) kids.push(h('div', { class: 'field' }, label('Which one?'), h('div', { class: 'chip-row' }, k.names.map((n) => h('button', { type: 'button', class: 'person-pick name-pick', 'aria-pressed': String(d.name === n), onclick: () => { d.name = n; paint(); } }, n)))));
        kids.push(h('div', { class: 'field' }, label(k.names.length ? 'Not sure, or not in the list?' : 'What is it called?'),
          h('div', { class: 'chip-row' }, h('button', { type: 'button', class: 'person-pick name-pick alt', 'aria-pressed': String(d.name === k.label + ' pill'), onclick: () => { d.name = k.label + ' pill'; paint(); } }, '🤷 I don’t know the name')),
          input, h('p', { class: 'hint' }, 'Type it the way it is printed on the box. “I don’t know the name” saves it as “' + k.label + ' pill”.')));
      } else if (step === 3) {
        const slots = [['AM', '08:00'], ['Noon', '12:00'], ['PM', '20:00']];
        const has = (def) => d.times.some((t) => C().rowLabel(t) === C().rowLabel(def));
        kids.push(h('div', { class: 'field' }, label('When?'), h('div', { class: 'chip-row' }, slots.map(([lb, def]) => h('button', { type: 'button', class: 'person-pick care-time', 'aria-pressed': String(has(def)),
          onclick: () => { d.times = has(def) ? d.times.filter((t) => C().rowLabel(t) !== C().rowLabel(def)) : d.times.concat(def).sort(); paint(); } }, lb, h('small', {}, C().clock(def))))),
          h('div', { class: 'trows fam' }, d.times.map((t, i) => famTimeRow(t, (v) => { d.times[i] = v; d.times.sort(); paint(); }))),
          d.times.length ? h('p', { class: 'hint' }, 'Tap − or + to move the time by 30 minutes, or tap the time to set an exact time.') : null));
        const each = ui.segmented([{ value: 0.5, label: '½ pill' }, { value: 1, label: '1 pill' }, { value: 2, label: '2 pills' }], d.each, (v) => { d.each = Number(v); paint(); }, 'Pills each time');
        kids.push(h('div', { class: 'field' }, label('Pills each time'), each.el || each));
        const per = d.each * Math.max(1, d.times.length);
        kids.push(h('div', { class: 'field' }, label('How many pills do you have?'), stepper(d.count, (v) => { d.count = v; d.box = v; paint(); }, 5, h('span', { class: 'days' }, '= ' + Math.floor(d.count / per) + ' days')),
          h('p', { class: 'hint' }, 'Use what the doctor or pharmacist said.')));
        const food = ui.segmented([{ value: '', label: 'Any time' }, { value: 'with', label: 'With food' }, { value: 'before', label: 'Before eating' }], d.food, (v) => { d.food = v; }, 'Food');
        kids.push(h('div', { class: 'field' }, label('Food'), food.el || food));
      } else {
        const how = ui.segmented([{ value: 'always', label: 'Every day' }, { value: 'short', label: 'For a few days' }], d.days ? 'short' : 'always', (v) => { d.days = v === 'short' ? 7 : null; paint(); }, 'How long');
        kids.push(h('div', { class: 'field' }, label('How long?'), how.el || how,
          d.days ? h('div', { class: 'care-row-inline' }, stepper(d.days, (v) => { d.days = v; paint(); }, 1, h('span', { class: 'days' }, 'days · last day ' + D.fmt(D.addDays(D.today(), d.days - 1), { weekday: 'long', month: 'short', day: 'numeric' })))) : null));
        const helpers = PL.state.members.filter((m) => m.role !== 'child' && m.id !== d.who);
        kids.push(h('div', { class: 'field' }, label('Who picks up refills?'), h('div', { class: 'chip-row' },
          personPick(null, !d.helper, () => { d.helper = ''; paint(); }, 'Nobody'), helpers.map((m) => personPick(m, d.helper === m.id, () => { d.helper = m.id; paint(); }))),
          h('p', { class: 'hint' }, 'They get a “Pick up ' + (d.name || 'it') + '” task in Chores before it runs out.')));
        kids.push(h('div', { class: 'field' }, label('Remind them'), stepper(d.remind, (v) => { d.remind = v; paint(); }, 1, h('span', { class: 'days' }, d.remind === 1 ? 'day before it runs out' : 'days before it runs out'), 1, 14)));
      }
      body.replaceChildren(...kids);
    }
    async function save() {
      const id = await PL.store.add('meds', Object.assign({}, d, { start: D.today(), countAt: new Date().toISOString(), checked: true }));
      if (!id) return;
      const ppl = new Set(C().settings().people); ppl.add(d.who);
      if (!C().settings().people.includes(d.who)) C().saveCare({ people: [...ppl] });
      s.close();
      ui.toast(d.name + ' added for ' + (nameOf(d.who) || 'them') + '.');
    }
    paint();
  }
  function personPick(m, on, onClick, text) {
    return h('button', { type: 'button', class: 'person-pick', 'aria-pressed': String(!!on), onclick: onClick }, m ? ui.avatar(m, 28) : null, h('span', {}, text || m.name));
  }
  function stepper(v, onChange, by, after, min, max) {
    const lo = min == null ? 1 : min, hi = max || 999;
    return h('div', { class: 'care-stepper small' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Less', onclick: () => onChange(Math.max(lo, v - by)) }, icon('minus')),
      h('div', { class: 'num' }, String(v)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'More', onclick: () => onChange(Math.min(hi, v + by)) }, icon('plus')), after || null);
  }
  // Time with glowing − and + (30 minutes a tap). Tapping the time itself sets an exact time.
  function famTimeRow(t, onChange) {
    const exact = h('input', { type: 'time', class: 'tv-input', value: t, 'aria-label': 'Exact time' });
    exact.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(exact.value)) onChange(exact.value); });
    const shift = (dm) => { const m = (C().hm(t) + dm + 1440) % 1440; onChange(D.pad(Math.floor(m / 60)) + ':' + D.pad(m % 60)); };
    const names = { morning: '☀️ Morning', midday: '🍲 Midday', afternoon: '🌤️ Afternoon', night: '🌙 Night' };
    return h('div', { class: 'trow sm' }, h('span', { class: 'tl' }, names[C().slotName(t)]),
      h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Earlier', onclick: () => shift(-30) }, '−'),
      h('label', { class: 'tv' }, h('span', {}, C().clockFull(t)), exact),
      h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Later', onclick: () => shift(30) }, '+'));
  }

  /* ---------- change a medicine ---------- */
  function editMedicine(m) {
    const d = JSON.parse(JSON.stringify(m)); const startLeft = C().left(m); let leftV = startLeft;
    const body = h('div', { class: 'event-form care-add' });
    const nameIn = h('input', { type: 'text', class: 'care-input', maxlength: '60', value: d.name });
    nameIn.addEventListener('input', () => { d.name = nameIn.value; });
    const ro = !canEdit();
    function paint() {
      const helpers = PL.state.members.filter((x) => x.role !== 'child' && x.id !== d.who);
      const each = ui.segmented([{ value: 0.5, label: '½ pill' }, { value: 1, label: '1 pill' }, { value: 2, label: '2 pills' }], d.each, (v) => { d.each = Number(v); }, 'Pills each time');
      const food = ui.segmented([{ value: '', label: 'Any time' }, { value: 'with', label: 'With food' }, { value: 'before', label: 'Before eating' }], d.food, (v) => { d.food = v; }, 'Food');
      body.replaceChildren(...[
        m.addedBy === 'board' && !m.checked ? h('div', { class: 'care-warn' }, '👀 ' + first(nameOf(m.who)) + ' added this on the Care board. Check the name, times and pills, then Save.') : null,
        ui.field('Name', nameIn),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Times'), h('div', { class: 'trows fam' }, d.times.map((t, i) => h('div', { class: 'trow-wrap' }, famTimeRow(t, (v) => { d.times[i] = v; d.times.sort(); paint(); }),
          d.times.length > 1 ? ui.iconButton('trash', 'Remove this time', () => { d.times.splice(i, 1); paint(); }, 'trow-del') : null))),
          d.times.length < 4 ? ui.button('Add a time', { icon: 'plus', onClick: () => { d.times.push(d.times.length ? '20:00' : '08:00'); d.times = [...new Set(d.times)].sort(); paint(); } }) : null),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Pills each time'), each.el || each),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Pills left now'), stepper(leftV, (v) => { leftV = v; paint(); }, 1, h('span', { class: 'days' }, '= ' + Math.floor(leftV / Math.max(0.25, d.each * d.times.length)) + ' days'), 0),
          h('p', { class: 'hint' }, 'Count the pills if the number is wrong.')),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Pills in one box'), stepper(d.box, (v) => { d.box = v; paint(); }, 5)),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Food'), food.el || food),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Who picks up refills?'), h('div', { class: 'chip-row' }, personPick(null, !d.helper, () => { d.helper = ''; paint(); }, 'Nobody'), helpers.map((x) => personPick(x, d.helper === x.id, () => { d.helper = x.id; paint(); })))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Remind them'), stepper(d.remind, (v) => { d.remind = v; paint(); }, 1, h('span', { class: 'days' }, 'days before it runs out'), 1, 14)),
        d.days ? h('p', { class: 'hint' }, 'Short-term medicine: ' + d.days + ' days, from ' + D.fmt(d.start, { month: 'short', day: 'numeric' }) + '.') : null].filter(Boolean));
      if (ro) body.querySelectorAll('button,input').forEach((x) => { x.disabled = true; });
    }
    async function save() {
      if (!d.name.trim()) { ui.toast('Please type the name.'); return; }
      const out = Object.assign({}, d, { checked: true });
      if (leftV !== startLeft) { out.count = leftV; out.countAt = new Date().toISOString(); }
      if (await PL.store.set('meds', m.id, out)) { s.close(); ui.toast('Saved.'); }
    }
    const footer = ro ? [ui.button('Close', { variant: 'primary', big: true, onClick: () => s.close() })] : [
      ui.button('Stop', { variant: 'danger', onClick: async () => {
        if (await ui.confirm({ title: 'Stop ' + m.name + '?', message: 'It leaves ' + first(nameOf(m.who)) + '’s pill box. Its history stays.', confirmLabel: 'Stop it', danger: true }) && await PL.store.set('meds', m.id, Object.assign({}, m, { stopped: true }))) { s.close(); ui.toast(m.name + ' stopped.'); }
      } }),
      ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Save', { variant: 'primary', big: true, onClick: save })];
    const s = ui.sheet({ title: C().kind(m.kind).emoji + ' ' + m.name, body, footer });
    s.panel.classList.add('wide', 'care-sheet');
    paint();
  }

  /* ---------- the Care board link (QR code, settings, make a new link) ---------- */
  let links = null, linksAt = 0;
  async function loadLinks(force) {
    if (isDemo() || !canEdit() || !window.KAL || !KAL.token) return [];
    if (!force && links && Date.now() - linksAt < 30000) return links;
    try { const r = await KAL.api('GET', '/api/care/links'); links = r.links || []; linksAt = Date.now(); } catch (e) { links = links || []; }
    return links;
  }
  const linkOf = (who) => (links || []).find((l) => l.memberId === who) || null;
  function boardStatus(who) {
    if (isDemo()) return 'Demo: the board is not on a real tablet';
    const l = linkOf(who);
    if (!l) return 'Not set up yet';
    if (l.online) return '🟢 On now';
    if (!l.lastSeen) return 'Link made · not opened yet';
    const min = Math.round((Date.now() - new Date(l.lastSeen).getTime()) / 60000);
    return '⚪ Last on ' + (min < 60 ? min + ' min ago' : min < 1440 ? Math.round(min / 60) + ' h ago' : D.fmt(new Date(l.lastSeen).toISOString().slice(0, 10), { month: 'short', day: 'numeric' }));
  }
  async function setupBoard(who) {
    const p = PL.store.member(who);
    const body = h('div', { class: 'care-setup' }, h('p', { class: 'sub' }, 'Loading the link…'));
    const s = ui.sheet({ title: 'Set up ' + (p ? first(p.name) + '’s' : 'the') + ' Care board', body, footer: [ui.button('Preview the board', { icon: 'eye', onClick: () => { s.close(); PL.careBoard.open(who); } }), ui.button('Done', { variant: 'primary', big: true, onClick: () => s.close() })] });
    s.panel.classList.add('wide', 'care-sheet');
    let link = null;
    if (isDemo()) link = { url: location.origin + '/care/cb-demo-link-only-works-in-your-own-home', demo: true };
    else {
      try { const r = await KAL.api('POST', '/api/care/links', { memberId: who }); link = r.link; await loadLinks(true); }
      catch (e) { body.replaceChildren(h('p', { class: 'care-warn' }, e.userMessage || 'Could not make the link. Check your connection and try again.')); return; }
    }
    function paint() {
      const b = C().boardSettings(who);
      const tg = (txt, key) => ui.toggle(txt, b[key], (v) => C().saveBoard(who, { [key]: v })).el;
      body.replaceChildren(...[
        h('div', { class: 'cb-setup' }, h('div', { class: 'cb-qr' }, PL.qr.svg(link.url, 168)),
          h('div', { class: 'cb-steps' }, h('b', {}, 'On ' + (p ? first(p.name) + '’s' : 'the') + ' tablet:'),
            h('ol', {}, h('li', {}, 'Scan this code with the camera, or open the link.'), h('li', {}, 'Tap Share → “Add to Home Screen”. It is called “Care board”.'), h('li', {}, 'Open “Care board” from the home screen, tap Start, and keep the tablet plugged in.')),
            h('div', { class: 'btn-row' }, ui.button('Copy link', { icon: 'copy', onClick: () => copy(link.url) }), navigator.share ? ui.button('Send link', { icon: 'upload', onClick: () => navigator.share({ title: 'Care board', url: link.url }).catch(() => {}) }) : null),
            link.demo ? h('p', { class: 'hint' }, 'This is the demo: in your own home the link opens the real board.') : h('p', { class: 'hint' }, 'The link opens only the Care board: no menus, no other pages. ' + boardStatus(who) + '.'))),
        h('div', { class: 'care-2' }, tg('Soft sound when it is time', 'sound'), tg('Ring again every 5 minutes', 'ring'), tg('Keep the screen awake', 'awake'), tg('Let ' + (p ? first(p.name) : 'them') + ' add medicines', 'letAdd')),
        isDemo() ? null : h('div', { class: 'cb-new' }, h('p', { class: 'hint' }, 'Tablet lost, or link shared by mistake? Make a new link. The old one stops working right away.'),
          ui.button('Make a new link', { variant: 'danger', icon: 'repeat', onClick: async () => {
            if (!(await ui.confirm({ title: 'Make a new link?', message: 'The old link stops working right away. You then open the new link on the tablet.', confirmLabel: 'Make a new link', danger: true }))) return;
            try { const r = await KAL.api('POST', '/api/care/links', { memberId: who, renew: true }); link = r.link; await loadLinks(true); paint(); ui.toast('New link made. Open it on the tablet.'); }
            catch (e) { ui.toast(e.userMessage || 'Could not make a new link.'); }
          } }))].filter(Boolean));
    }
    paint();
    const off = PL.store.subscribe(() => { if (body.isConnected) paint(); else off(); });
  }
  async function copy(t) {
    try { await navigator.clipboard.writeText(t); ui.toast('Link copied.'); }
    catch (e) { ui.toast('Could not copy. Press and hold the link to copy it.'); }
  }

  /* ---------- alerts: what the family should know now ---------- */
  function alertsFor(who) {
    const out = [], A = C().settings().alerts, today = D.today(), p = PL.store.member(who), nm = p ? first(p.name) : 'They';
    const helpSince = new Date(Date.now() - 2 * 3600000).toISOString();
    if (A.help) PL.state.carelog.filter((l) => l.who === who && l.kind === 'help' && l.at > helpSince).forEach((l) => {
      const replied = PL.state.carelog.some((r) => r.who === who && r.kind === 'reply' && r.at > l.at);
      out.push({ key: 'help|' + l.at, level: replied ? 1 : 3, emoji: '🙋', text: nm + ' asked for help · ' + timeOfIso(l.at), help: l, replied });
    });
    if (A.late) [D.addDays(today, -1), today].forEach((date) => C().times(who).forEach((t) => {
      const st = C().slotState(who, date, t);
      const late = C().minutesLate(date, t);
      if ((st === 'now' || st === 'miss') && late >= C().LATE_ALERT) out.push({ key: 'late|' + who + '|' + date + '|' + t, level: 2, emoji: '⏰', who, date, time: t,
        text: nm + ' has not taken ' + (date === today ? 'the ' : 'yesterday’s ') + C().clock(t) + ' pills' + (late < 600 ? ' (' + (late < 60 ? late + ' min' : Math.floor(late / 60) + ' h') + ' late)' : ''), late: true });
    }));
    PL.state.doses.filter((d) => d.who === who && d.date >= D.addDays(today, -1) && d.status === 'skipped').forEach((d) => {
      const k = 'skip|' + d.date + '|' + d.time;
      if (!out.some((x) => x.key === k)) out.push({ key: k, level: 1, emoji: '–', text: nm + ' skipped the ' + C().clock(d.time) + ' pills · ' + dayWord(d.date).toLowerCase() });
    });
    if (A.added) C().medsOf(who).filter((m) => m.addedBy === 'board' && !m.checked && !m.stopped).forEach((m) => out.push({ key: 'added|' + m.id, level: 1, emoji: '👀', text: nm + ' added ' + m.name + ' on the Care board', med: m }));
    if (A.low) C().medsOf(who).filter((m) => C().low(m)).forEach((m) => out.push({ key: 'low|' + m.id + '|' + m.countAt, level: 1, emoji: '💊', text: m.name + ' runs out ' + (C().runsOut(m) <= today ? 'today' : D.fmt(C().runsOut(m), { weekday: 'long' })) + (m.helper ? ' · ' + first(nameOf(m.helper)) + ' will pick it up' : ''), med: m, low: true }));
    if (A.offline && !isDemo()) { const l = linkOf(who); if (l && !l.online && l.lastSeen && Date.now() - new Date(l.lastSeen).getTime() > 30 * 60000 && Date.now() - new Date(l.lastSeen).getTime() < 7 * 86400000) out.push({ key: 'off|' + who + '|' + l.lastSeen.slice(0, 13), level: 1, emoji: '📴', text: nm + '’s Care board is off · ' + boardStatus(who).replace('⚪ ', '') }); }
    if (A.quiet) {
      const n = PL.now(); const any = PL.state.doses.some((d) => d.who === who && d.date === today) || PL.state.carelog.some((l) => l.who === who && l.at.slice(0, 10) === today);
      if (n.getHours() >= 11 && !any) out.push({ key: 'quiet|' + who + '|' + today, level: 1, emoji: '🤔', text: 'No taps on ' + nm + '’s board yet today' });
    }
    return out.sort((a, b) => b.level - a.level);
  }
  function alertRow(a, who, compact) {
    const btns = [];
    if (canEdit()) {
      if (a.help && !a.replied) ['On my way 🚗', 'I’ll call you 📞', 'Coming soon 💛'].forEach((t) => btns.push(ui.button(t, { onClick: () => reply(who, t) })));
      if (a.late) { btns.push(ui.button('I gave it', { variant: 'primary', icon: 'check', onClick: async () => { if (await C().mark(a.who, a.date, a.time, 'taken', myId() || 'family')) ui.toast('Marked as given by you.'); } }));
        if (!compact) btns.push(ui.button('Remind ' + first(nameOf(who)), { icon: 'bell', onClick: async () => { if (await C().log(who, 'remind', { date: a.date, time: a.time })) ui.toast('The Care board will ring now.'); } })); }
      if (a.med && !a.low && !compact) btns.push(ui.button('Check it', { variant: 'primary', onClick: () => editMedicine(a.med) }));
      if (a.low && !compact) btns.push(ui.button('I bought more', { icon: 'plus', onClick: () => boughtSheet(a.med) }));
    }
    return h('div', { class: 'care-alert lvl' + a.level }, h('span', { class: 'ca-em', 'aria-hidden': 'true' }, a.emoji), h('span', { class: 'ca-tx' }, a.text), btns.length ? h('span', { class: 'ca-btns' }, btns) : null);
  }
  const reply = (who, t) => C().log(who, 'reply', { text: t }).then((ok) => ok && ui.toast('Sent to the Care board.'));
  function boughtSheet(m) {
    let pills = m.box;
    const body = h('div', { class: 'event-form' });
    const paint = () => body.replaceChildren(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'How many pills did you buy?'), stepper(pills, (v) => { pills = v; paint(); }, 5),
      h('div', { class: 'chip-row' }, [1, 2, 3].map((n) => h('button', { type: 'button', class: 'person-pick', 'aria-pressed': String(pills === n * m.box), onclick: () => { pills = n * m.box; paint(); } }, n + (n > 1 ? ' boxes' : ' box') + ' · ' + n * m.box)))));
    const s = ui.sheet({ title: 'I bought ' + m.name, body, footer: [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Add pills', { variant: 'primary', big: true, onClick: async () => { if (await C().bought(m, pills)) { s.close(); ui.toast(pills + ' pills added.'); } } })] });
    paint();
  }

  /* ---------- alerts on every page (banner) + a pop-up notification while the app is open ---------- */
  let bannerEl = null, notified = new Set(PL.storage ? PL.storage.get('careNotified', []) : []), dismissed = new Set(PL.storage ? PL.storage.get('careDismissed', []) : []);
  function paintBanner() {
    if (!PL.state.ready || (window.KAL && KAL.me && KAL.me.care)) return;
    const content = document.querySelector('.app .content');
    if (!content) return;
    if (!bannerEl) { bannerEl = h('div', { class: 'care-banner', role: 'status' }); content.prepend(bannerEl); }
    const onCare = PL.nav && PL.nav.current() === 'care';
    const urgent = !C().canSee() || onCare ? [] : C().people().flatMap((p) => alertsFor(p.id).filter((a) => a.level >= 2).map((a) => ({ a, who: p.id }))).filter((x) => !dismissed.has(x.a.key));
    bannerEl.hidden = !urgent.length;
    bannerEl.replaceChildren(...urgent.slice(0, 2).map(({ a, who }) => h('div', { class: 'care-banner-row' }, alertRow(a, who, true),
      ui.button('Open Care', { onClick: () => PL.nav.go('care') }), ui.iconButton('x', 'Hide', () => { dismissed.add(a.key); PL.storage.set('careDismissed', [...dismissed].slice(-100)); paintBanner(); }, 'care-banner-x'))));
    const dot = document.querySelector('.nav-btn[data-screen="care"]');
    if (dot) dot.classList.toggle('has-alert', C().canSee() && C().people().some((p) => alertsFor(p.id).some((a) => a.level >= 2)));
    // pop-up notifications (only while Kalendaryo is open; the same as calendar reminders)
    if (PL.notify && PL.notify.canPopup() && PL.state.device.notify && C().canSee()) C().people().forEach((p) => alertsFor(p.id).filter((a) => a.level >= 2).forEach((a) => {
      if (notified.has(a.key)) return;
      notified.add(a.key); PL.storage.set('careNotified', [...notified].slice(-200));
      try { new Notification(a.help ? 'Help needed' : 'Medicine', { body: a.text, tag: a.key }); } catch (e) { /* ignore */ }
    }));
  }
  let refillT = null;
  function startAlerts() {
    if (window.KAL && KAL.me && KAL.me.care) return;
    PL.store.subscribe(() => { paintBanner(); clearTimeout(refillT); refillT = setTimeout(() => C().syncRefills(), 1500); paintNav(); });
    setInterval(() => { paintBanner(); C().syncRefills(); }, 30000);
    setInterval(() => loadLinks(true).then(paintBanner), 120000);
    setTimeout(() => loadLinks(true).then(paintBanner), 3000);
  }
  // Care in the menu: last, on by default, hidden when the home turns it off.
  function paintNav() {
    const b = document.querySelector('.nav-btn[data-screen="care"]');
    if (b) b.hidden = !C().canSee();
  }

  /* ---------- the Care page ---------- */
  function intro() {
    return h('section', { class: 'card care-intro' },
      h('div', { class: 'ci-art', 'aria-hidden': 'true' }, '💊'),
      h('h2', {}, 'Help someone at home take their medicines on time'),
      h('p', {}, 'For a grandparent, a parent, a child who is sick, or anyone getting better. Add their medicines here. Their own tablet shows a big, simple pill box that glows and rings softly when it is time, and you see on your phone when they took them.'),
      h('ul', { class: 'ci-list' }, h('li', {}, '✅ One tap to say “I took them” — no more “did she take it?”'),
        h('li', {}, '💊 Know when pills run out, with a pick-up task in Chores'),
        h('li', {}, '🙋 A big “I need help” button that tells the family right away')),
      h('p', { class: 'hint' }, 'Kalendaryo is a reminder helper, not a medical device. Always follow the doctor or pharmacist.'),
      canEdit() ? h('div', { class: 'btn-row' }, ui.button('Add a medicine', { variant: 'primary', big: true, icon: 'plus', onClick: () => addMedicine() }),
        ui.button('Not for us. Hide Care', { variant: 'ghost', onClick: async () => { if (await ui.confirm({ title: 'Hide Care?', message: 'Care leaves the menu for everyone. Turn it back on any time in Settings → Care.', confirmLabel: 'Hide Care' }) && await C().saveCare({ on: false })) { ui.toast('Care is hidden. Turn it on again in Settings.'); PL.nav.go('home'); } } })) : null);
  }
  function todayLine(who) {
    const today = D.today();
    return h('div', { class: 'care-todayline' }, C().times(who).map((t) => {
      const st = C().slotState(who, today, t);
      if (!st) return null;
      const meds = C().medsAt(who, today, t);
      const dose = meds.map((m) => C().doseFor(m.id, today, t)).find(Boolean);
      const txt = st === 'ok' ? '✓ ' + C().clock(t) + ' · ' + timeOfIso(dose.at) + (dose.by && dose.by !== 'board' ? ' by ' + first(nameOf(dose.by)) : '') : st === 'skip' ? '– ' + C().clock(t) + ' skipped' : st === 'future' ? C().clock(t) + ' · later' : st === 'now' ? '⏰ ' + C().clock(t) + ' · now' : '! ' + C().clock(t) + ' · not taken';
      return h('span', { class: 'ct-chip ' + st }, txt);
    }));
  }
  function personCard(p) {
    const meds = C().medsOf(p.id).filter((m) => !m.stopped).sort((a, b) => a.times[0].localeCompare(b.times[0]));
    const al = alertsFor(p.id);
    const rows = meds.map((m) => {
      const c = C().course(m), dl = C().daysLeft(m), low = C().low(m);
      const chip = c ? (D.today() > c.last ? 'Finished' : 'Day ' + Math.max(1, c.day) + ' of ' + c.of) : dl >= 99 ? '' : dl + (dl === 1 ? ' day' : ' days') + ' left';
      return h('button', { type: 'button', class: 'care-row' + (m.addedBy === 'board' && !m.checked ? ' new' : ''), onclick: () => editMedicine(m) },
        h('span', { class: 'em', 'aria-hidden': 'true' }, C().kind(m.kind).emoji),
        h('span', { class: 'tt' }, h('b', {}, m.name), h('span', {}, whenText(m))),
        chip ? h('span', { class: 'care-left' + (low ? ' low' : '') }, chip) : null);
    });
    const recent = PL.state.doses.filter((d) => d.who === p.id).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6);
    return h('section', { class: 'card care-card' },
      h('div', { class: 'care-head' }, ui.avatar(p, 44), h('span', { class: 'nm' }, p.name), todayLine(p.id)),
      al.length ? h('div', { class: 'care-alerts' }, al.map((a) => alertRow(a, p.id))) : null,
      h('div', { class: 'care-sec' }, 'Medicines'),
      rows.length ? h('div', { class: 'care-rows' }, rows) : h('p', { class: 'sub' }, 'No medicines yet.'),
      canEdit() ? h('div', { class: 'btn-row' }, ui.button('Add a medicine for ' + first(p.name), { icon: 'plus', onClick: () => addMedicine(p.id) })) : null,
      h('div', { class: 'care-boardcard' }, h('span', { class: 'cb-ic', 'aria-hidden': 'true' }, '📱'),
        h('span', { class: 'nm' }, first(p.name) + '’s Care board', h('small', {}, 'Their own simple screen on a tablet or old phone · ' + boardStatus(p.id))),
        h('span', { class: 'btn-row' }, canEdit() ? ui.button('Set up on a tablet', { variant: 'primary', onClick: () => setupBoard(p.id) }) : null, ui.button('Preview', { icon: 'eye', onClick: () => PL.careBoard.open(p.id) }))),
      recent.length ? h('div', { class: 'care-sec' }, 'Lately') : null,
      recent.length ? h('ul', { class: 'care-recent' }, recent.map((d) => { const m = PL.state.meds.find((x) => x.id === d.med);
        return h('li', {}, h('b', {}, dayWord(d.date) + ' · ' + C().clock(d.time)), ' ' + (m ? m.name : 'Medicine') + ' · ' + (d.status === 'skipped' ? 'skipped' : (d.status === 'late' ? 'taken late ' : 'taken ') + timeOfIso(d.at) + (d.by && d.by !== 'board' ? ' · given by ' + first(nameOf(d.by)) : ''))); })) : null);
  }

  PL.screens.care = {
    mount(root) {
      const el = h('div', { class: 'screen-page care-page' });
      root.append(el);
      function render() {
        const ppl = C().people();
        const head = h('header', { class: 'page-head' }, h('h1', {}, 'Care'), canEdit() && ppl.length ? ui.button('Add a medicine', { variant: 'primary', big: true, icon: 'plus', onClick: () => addMedicine() }) : null);
        if (!C().settings().on) {
          el.replaceChildren(head, ui.emptyState({ icon: 'pill', title: 'Care is turned off', text: 'Turn it on in Settings → Care.', action: canEdit() ? ui.button('Turn Care on', { variant: 'primary', onClick: () => C().saveCare({ on: true }) }) : null }));
          return;
        }
        el.replaceChildren(head, ppl.length ? h('div', { class: 'care-list' }, ppl.map(personCard)) : intro());
      }
      render();
      setTimeout(paintBanner, 0); // the alerts are on this page already, so the banner at the top hides
      loadLinks().then(() => { if (el.isConnected) render(); });
      const t = setInterval(() => { if (!document.querySelector('.sheet')) render(); }, 30000);
      return { update: () => { if (!el.querySelector('input:focus')) render(); }, destroy() { clearInterval(t); setTimeout(paintBanner, 0); } };
    }
  };

  /* ---------- Settings: Care + Tell the family ---------- */
  function settingsCards() {
    const s = C().settings(), ro = !canEdit();
    const section = (title, intro, ...kids) => h('section', { class: 'card settings-card care-set' }, h('h2', {}, title), intro ? h('p', { class: 'sub' }, intro) : null, ...kids);
    const onT = ui.toggle('Show Care in the menu', s.on, (v) => C().saveCare({ on: v }));
    const careCard = section('Care', 'Help someone at home take their medicines on time. Their own tablet shows a simple Care board.', onT.el,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Who gets care'), h('div', { class: 'chip-row' }, PL.state.members.map((m) => personPick(m, s.people.includes(m.id) || PL.state.meds.some((x) => x.who === m.id && !x.stopped), () => {
        const set = new Set(s.people); set.has(m.id) ? set.delete(m.id) : set.add(m.id); C().saveCare({ people: [...set] });
      }))), h('p', { class: 'hint' }, 'Medicines and the Care board are set up on the Care page.')),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Who can see Care'), (function () { const sg = ui.segmented([{ value: 'all', label: 'Everyone' }, { value: 'adults', label: 'Grown-ups only' }], s.show, (v) => C().saveCare({ show: v }), 'Who can see Care'); return sg.el || sg; })()));
    const A = s.alerts;
    const tg = (t, k) => ui.toggle(t, A[k], (v) => C().saveCare({ alerts: Object.assign({}, A, { [k]: v }) })).el;
    const tell = section('Tell the family', 'What shows on the Care page and at the top of the app (and as a pop-up while Kalendaryo is open, if reminders are on for this device).',
      tg('Pills not taken after 30 minutes', 'late'), tg('Medicine running low', 'low'), tg('“I need help”', 'help'), tg('The Care board is off', 'offline'),
      tg('A medicine was added on the Care board', 'added'), tg('No taps on the board by 11 AM', 'quiet'));
    if (ro) [careCard, tell].forEach((c) => c.querySelectorAll('input,button').forEach((x) => { x.disabled = true; }));
    return s.on || !ro ? [careCard, tell] : [careCard];
  }

  PL.careUi = { addMedicine, editMedicine, setupBoard, settingsCards, alertsFor, startAlerts, paintNav, paintBanner };
})();
