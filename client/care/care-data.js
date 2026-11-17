/*
 * care/care-data.js — Care: medicines for someone at home. The data and the rules, no screens.
 *
 *   meds/{id}     { who, name, kind, times:['08:00','20:00'], each, count, countAt, box, start, days, food, helper, remind, addedBy, checked, stopped }
 *                 count = pills left at the moment countAt. Pills taken after that are counted from doses.
 *   doses/{id}    { who, med, date, time, status: taken|late|skipped, at, by }   id = med~date~0800 (one per pill time)
 *   carelog/{id}  { who, kind, med, name, text, at, by }   help, added, bought, taken, late, skipped, snooze, remind, reply, gave
 *
 * Kalendaryo is a reminder helper, not a medical device: doses and times always come from the family.
 * Care lives in its own folder (client/care), so it can become its own app later.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;
  const text = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const isKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  /* ---------- what the medicine is for, and common names (generic names, most used first) ---------- */
  const KINDS = [
    { id: 'bp', emoji: '❤️', label: 'Blood pressure', names: ['Amlodipine', 'Losartan', 'Lisinopril', 'Metoprolol', 'Telmisartan', 'Valsartan', 'Hydrochlorothiazide', 'Ramipril'] },
    { id: 'sugar', emoji: '🩸', label: 'Sugar', names: ['Metformin', 'Gliclazide', 'Glimepiride', 'Sitagliptin', 'Empagliflozin', 'Dapagliflozin', 'Linagliptin', 'Insulin'] },
    { id: 'chol', emoji: '🧈', label: 'Cholesterol', names: ['Atorvastatin', 'Rosuvastatin', 'Simvastatin', 'Pravastatin', 'Ezetimibe'] },
    { id: 'heart', emoji: '💓', label: 'Heart', names: ['Bisoprolol', 'Carvedilol', 'Digoxin', 'Isosorbide', 'Amiodarone', 'Nitroglycerin'] },
    { id: 'thin', emoji: '🩹', label: 'Blood thinner', names: ['Aspirin', 'Clopidogrel', 'Apixaban', 'Rivaroxaban', 'Warfarin', 'Dabigatran'] },
    { id: 'thyroid', emoji: '🦋', label: 'Thyroid', names: ['Levothyroxine', 'Methimazole'] },
    { id: 'stomach', emoji: '🫃', label: 'Stomach', names: ['Omeprazole', 'Pantoprazole', 'Esomeprazole', 'Famotidine', 'Lansoprazole'] },
    { id: 'water', emoji: '💧', label: 'Water pill', names: ['Furosemide', 'Hydrochlorothiazide', 'Spironolactone', 'Indapamide', 'Torsemide'] },
    { id: 'bones', emoji: '🦴', label: 'Bones & joints', names: ['Calcium', 'Vitamin D', 'Alendronate', 'Allopurinol', 'Colchicine', 'Glucosamine'] },
    { id: 'mind', emoji: '🧠', label: 'Memory & mood', names: ['Donepezil', 'Memantine', 'Sertraline', 'Escitalopram', 'Citalopram', 'Mirtazapine'] },
    { id: 'breath', emoji: '🫁', label: 'Breathing', names: ['Salbutamol inhaler', 'Tiotropium inhaler', 'Budesonide inhaler', 'Fluticasone inhaler', 'Montelukast'] },
    { id: 'bladder', emoji: '🚻', label: 'Bladder', names: ['Tamsulosin', 'Finasteride', 'Oxybutynin', 'Mirabegron', 'Solifenacin'] },
    { id: 'eyes', emoji: '👁️', label: 'Eye drops', names: ['Latanoprost', 'Timolol', 'Artificial tears', 'Brimonidine', 'Dorzolamide'] },
    { id: 'pain', emoji: '😴', label: 'Sleep & pain', names: ['Acetaminophen', 'Gabapentin', 'Pregabalin', 'Melatonin', 'Celecoxib', 'Tramadol'] },
    { id: 'vit', emoji: '🌿', label: 'Vitamins', names: ['Vitamin D', 'Vitamin B12', 'Calcium', 'Multivitamin', 'Fish oil', 'Iron', 'Folic acid', 'Magnesium'] },
    { id: 'other', emoji: '💊', label: 'Other', names: [] }
  ];
  const kind = (id) => KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];

  /* ---------- data shapes (cleaned before saving, like the rest of the app) ---------- */
  const models = {
    med(d) {
      const times = [...new Set((Array.isArray(d.times) ? d.times : []).filter(isTime))].sort();
      return {
        who: text(d.who, 120),
        name: text(d.name, 60) || kind(d.kind).label + ' pill',
        kind: kind(d.kind).id,
        times: times.length ? times : ['08:00'],
        each: num(d.each, 0.25, 10, 1),
        count: Math.round(num(d.count, 0, 9999, 0) * 100) / 100,
        countAt: typeof d.countAt === 'string' && d.countAt ? d.countAt.slice(0, 30) : new Date().toISOString(),
        box: Math.round(num(d.box, 1, 1000, 30)),
        start: isKey(d.start) ? d.start : D.today(),
        days: d.days ? Math.round(num(d.days, 1, 365, 7)) : null,
        food: ['with', 'before', 'after'].includes(d.food) ? d.food : '',
        helper: text(d.helper, 120),
        remind: Math.round(num(d.remind, 0, 14, 2)),
        addedBy: d.addedBy === 'board' ? 'board' : '',
        added: typeof d.added === 'string' && d.added ? d.added.slice(0, 30) : new Date().toISOString(),
        checked: !!d.checked,
        stopped: !!d.stopped
      };
    },
    dose(d) {
      return { who: text(d.who, 120), med: text(d.med, 120), date: isKey(d.date) ? d.date : D.today(), time: isTime(d.time) ? d.time : '08:00',
        status: ['taken', 'late', 'skipped'].includes(d.status) ? d.status : 'taken', at: typeof d.at === 'string' ? d.at.slice(0, 30) : new Date().toISOString(), by: text(d.by, 120) || 'board' };
    },
    carelog(d) {
      const out = { who: text(d.who, 120), kind: text(d.kind, 20), at: typeof d.at === 'string' ? d.at.slice(0, 30) : new Date().toISOString(), by: text(d.by, 120) || 'board' };
      if (d.med) out.med = text(d.med, 120);
      if (d.name) out.name = text(d.name, 60);
      if (d.text) out.text = text(d.text, 200);
      if (d.time) out.time = isTime(d.time) ? d.time : '';
      if (d.date) out.date = isKey(d.date) ? d.date : '';
      return out;
    }
  };
  PL.models = PL.models || {};
  Object.assign(PL.models, models);

  /* ---------- settings (settings/main → care) ---------- */
  const ALERTS = { late: true, low: true, help: true, offline: true, added: true, quiet: false };
  const BOARD = { sound: true, ring: true, awake: true, letAdd: true };
  function settings() {
    const c = (PL.state.settings && PL.state.settings.care) || {};
    return { on: c.on !== false, people: Array.isArray(c.people) ? c.people : [], show: c.show === 'adults' ? 'adults' : 'all',
      alerts: Object.assign({}, ALERTS, c.alerts || {}), boards: c.boards || {} };
  }
  const boardSettings = (who) => Object.assign({}, BOARD, settings().boards[who] || {});
  function saveCare(patch) {
    const c = Object.assign({}, (PL.state.settings && PL.state.settings.care) || {}, patch);
    return PL.store.saveSettings({ care: c });
  }
  function saveBoard(who, patch) {
    const boards = Object.assign({}, settings().boards);
    boards[who] = Object.assign({}, boardSettings(who), patch);
    return saveCare({ boards });
  }
  // People who get care: chosen in Settings, plus anyone with a medicine.
  function people() {
    const ids = new Set(settings().people);
    PL.state.meds.forEach((m) => { if (!m.stopped) ids.add(m.who); });
    return PL.state.members.filter((m) => ids.has(m.id));
  }
  // Can the person using this device see Care? (Settings → Care → Who can see it)
  function canSee() {
    const s = settings();
    if (!s.on) return false;
    if (s.show === 'adults' && window.KAL && KAL.me && KAL.me.memberId) {
      const m = PL.store.member(KAL.me.memberId);
      if (m && m.role === 'child') return false;
    }
    return true;
  }

  /* ---------- pills and times ---------- */
  const hm = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const timeId = (t) => t.replace(':', '');
  const doseId = (medId, date, time) => medId + '~' + date + '~' + timeId(time);
  function activeOn(m, date) {
    if (m.stopped || date < m.start) return false;
    if (m.days && date >= D.addDays(m.start, m.days)) return false;
    return true;
  }
  const medsOf = (who) => PL.state.meds.filter((m) => m.who === who);
  // An ISO time as the home's clock: { date, min, hm } (the home's time zone, Settings).
  function local(iso) { const d = PL.now(Date.parse(iso)); return { date: D.key(d), min: d.getHours() * 60 + d.getMinutes(), hm: D.pad(d.getHours()) + ':' + D.pad(d.getMinutes()) }; }
  // A medicine added today only counts from the time it was added (no "late" for 8 AM when it was added at noon).
  const counts = (m, date, time) => { if (!m.added || date !== m.start) return true; const a = local(m.added); return a.date !== date || hm(time) >= a.min - 1; };
  const medsAt = (who, date, time) => medsOf(who).filter((m) => activeOn(m, date) && m.times.includes(time) && counts(m, date, time));
  // The pill times (rows of the pill box) for a person: every time used by a medicine they take now.
  function times(who) {
    const today = D.today(), set = new Set();
    medsOf(who).forEach((m) => { if (!m.stopped && (activeOn(m, today) || m.start > today)) m.times.forEach((t) => set.add(t)); });
    return [...set].sort();
  }
  function slotName(t) { const h = hm(t) / 60; return h < 11 ? 'morning' : h < 15 ? 'midday' : h < 18 ? 'afternoon' : 'night'; }
  function rowLabel(t) { const h = hm(t) / 60; return h < 11 ? 'AM' : h < 15 ? 'Noon' : h < 18 ? 'PM' : 'PM'; }
  const clock = (t) => { const [a, b] = t.split(':').map(Number); const h12 = PL.state.settings.hour12 !== false; if (!h12) return t; return (a % 12 || 12) + (b ? ':' + D.pad(b) : '') + (a < 12 ? ' AM' : ' PM'); };
  const clockFull = (t) => { const [a, b] = t.split(':').map(Number); const h12 = PL.state.settings.hour12 !== false; if (!h12) return t; return (a % 12 || 12) + ':' + D.pad(b) + (a < 12 ? ' AM' : ' PM'); };
  const nowParts = () => { const n = PL.now(); return { date: D.key(n), min: n.getHours() * 60 + n.getMinutes() }; };
  const dosesOf = (who) => PL.state.doses.filter((d) => d.who === who);
  const doseFor = (medId, date, time) => PL.state.doses.find((d) => d.med === medId && d.date === date && d.time === time) || null;

  const MISS_AFTER = 180;  // minutes: after 3 hours a pill time is "missed" and the board asks about it
  const LATE_ALERT = 30;   // minutes: the family is told after 30 minutes
  // State of one pill time on one day: null (nothing), 'future', 'now', 'miss', 'gone' (old and never marked), 'ok', 'skip'.
  function slotState(who, date, time, at) {
    const meds = medsAt(who, date, time);
    if (!meds.length) return null;
    const marks = meds.map((m) => doseFor(m.id, date, time));
    if (marks.every(Boolean)) return marks.every((d) => d.status === 'skipped') ? 'skip' : 'ok';
    const n = at || nowParts();
    if (date > n.date || (date === n.date && hm(time) > n.min)) return 'future';
    const late = (D.diff(date, n.date) * 1440) + n.min - hm(time); // minutes since the pill time
    if (late >= 1440 + 180) return 'gone';
    return late >= MISS_AFTER ? 'miss' : 'now';
  }
  const minutesLate = (date, time) => { const n = nowParts(); return D.diff(date, n.date) * 1440 + n.min - hm(time); };
  // What the board should show first: a missed pill time (ask about it), then the one due now.
  function focus(who) {
    const n = nowParts(), list = [];
    [D.addDays(n.date, -1), n.date].forEach((date) => times(who).forEach((t) => {
      const st = slotState(who, date, t, n);
      if (st === 'miss' || st === 'now') list.push({ date, time: t, state: st, meds: medsAt(who, date, t) });
    }));
    return list.find((x) => x.state === 'miss') || list.find((x) => x.state === 'now') || null;
  }
  function next(who) {
    const n = nowParts();
    for (let k = 0; k < 8; k++) {
      const date = D.addDays(n.date, k);
      for (const t of times(who)) if (slotState(who, date, t, n) === 'future') return { date, time: t, meds: medsAt(who, date, t) };
    }
    return null;
  }

  /* ---------- how many pills are left ---------- */
  function left(m) {
    const since = m.countAt || '';
    const used = PL.state.doses.filter((d) => d.med === m.id && d.status !== 'skipped' && d.at > since).length * m.each;
    return Math.max(0, Math.round((m.count - used) * 100) / 100);
  }
  const perDay = (m) => m.each * m.times.length;
  function daysLeft(m) { const p = perDay(m); return p ? Math.floor(left(m) / p) : 99; }
  // Short-term medicines: "Day 3 of 7"
  function course(m, date) {
    if (!m.days) return null;
    const day = D.diff(m.start, date || D.today()) + 1;
    return { day, of: m.days, last: D.addDays(m.start, m.days - 1) };
  }
  // Running low: the pills end within "remind" days (and it is not a short-term medicine ending anyway).
  function low(m) {
    if (m.stopped) return false;
    const dl = daysLeft(m);
    if (m.days) { const c = course(m); if (c && D.addDays(D.today(), dl) >= c.last) return false; }
    return dl <= Math.max(1, m.remind || 2);
  }
  const runsOut = (m) => D.addDays(D.today(), daysLeft(m));

  /* ---------- writing ---------- */
  const by = () => (window.KAL && KAL.me && KAL.me.care ? 'board' : (window.KAL && KAL.me && KAL.me.memberId) || 'family');
  async function mark(who, date, time, status, byWho) {
    const meds = medsAt(who, date, time), at = new Date().toISOString(), b = byWho || by();
    let ok = true;
    for (const m of meds) {
      if (doseFor(m.id, date, time)) continue;
      ok = (await PL.store.setDoc('doses/' + doseId(m.id, date, time), models.dose({ who, med: m.id, date, time, status, at, by: b }))) && ok;
    }
    return ok;
  }
  async function unmark(who, date, time) {
    let ok = true;
    for (const m of medsAt(who, date, time)) if (doseFor(m.id, date, time)) ok = (await PL.store.deleteDoc('doses/' + doseId(m.id, date, time))) && ok;
    return ok;
  }
  function log(who, k, extra) {
    return PL.store.add('carelog', Object.assign({ who, kind: k, at: new Date().toISOString(), by: by() }, extra || {}));
  }
  // "I bought more": add pills, and start counting again from now.
  async function bought(m, pills) {
    const ok = await PL.store.set('meds', m.id, Object.assign({}, m, { count: left(m) + pills, countAt: new Date().toISOString() }));
    if (ok) { log(m.who, 'bought', { med: m.id, name: m.name, text: String(pills) }); refillDone(m); }
    return ok;
  }

  /* ---------- refill task in Chores (for the person who picks up refills) ---------- */
  const refillId = (m) => 'refill-' + m.id;
  function refillDone(m) {
    if (window.KAL && KAL.me && KAL.me.care) return; // the board cannot touch chores; the family app cleans up
    if (PL.state.chores.find((c) => c.id === refillId(m))) PL.store.deleteDoc('chores/' + refillId(m));
  }
  // Run by the family app: add "Pick up Amlodipine for Nana Rosa" to the helper's chores when it runs low,
  // and remove it again when pills were bought. Safe to run on every phone (same id every time).
  function syncRefills() {
    if (!PL.state.live || (window.KAL && KAL.me && (KAL.me.care || KAL.me.viewing || KAL.me.role === 'viewer'))) return;
    if (!settings().on) return;
    PL.state.meds.forEach((m) => {
      const has = PL.state.chores.find((c) => c.id === refillId(m));
      if (m.helper && low(m) && !has && PL.store.member(m.helper)) {
        const p = PL.store.member(m.who);
        PL.store.setDoc('chores/' + refillId(m), PL.models.chore({ title: 'Pick up ' + m.name + (p ? ' for ' + p.name : ''), stars: 0, memberIds: [m.helper], date: D.today(), repeat: null }));
      } else if (has && (!low(m) || m.stopped)) PL.store.deleteDoc('chores/' + refillId(m));
    });
  }

  PL.care = Object.assign(PL.care || {}, {
    KINDS, kind, settings, boardSettings, saveCare, saveBoard, people, canSee,
    hm, local, doseId, activeOn, medsOf, medsAt, times, slotName, rowLabel, clock, clockFull, nowParts, dosesOf, doseFor,
    slotState, minutesLate, focus, next, left, perDay, daysLeft, course, low, runsOut, MISS_AFTER, LATE_ALERT,
    mark, unmark, log, bought, syncRefills, refillId
  });
})();
