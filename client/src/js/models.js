/*
 * models.js — the shape of the data, and cleaning of anything before it is saved.
 *
 * FamilyMember: { name, role, avatar, color, birthday, demo? }
 * Event:        { title, date, allDay, start, end, location, notes, memberIds[],
 *                 color, repeat, exdates[], reminder, by, demo? }
 *   repeat:     null, or { freq: 'daily'|'weekly'|'monthly'|'yearly', interval: 1,
 *                          weekdays: [0-6] (weekly only), end: {type:'never'|'on'|'after', date, count} }
 *   exdates:    dates removed from a repeating series ("delete this one")
 *
 * Later rounds add: Task, Routine, Reward, Meal, Recipe, List, Countdown.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const C = PL.config;

  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const isKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

  const stars = (v) => (v == null || v === '' ? 1 : Math.min(10, Math.max(0, parseInt(v, 10) || 0)));

  function cleanRepeat(r) {
    if (!r || !['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) return null;
    const out = { freq: r.freq, interval: Math.min(99, Math.max(1, parseInt(r.interval, 10) || 1)) };
    if (r.freq === 'weekly') {
      const wd = (r.weekdays || []).map(Number).filter((n) => n >= 0 && n <= 6);
      out.weekdays = [...new Set(wd)].sort((a, b) => a - b);
    }
    const e = r.end || { type: 'never' };
    if (e.type === 'on' && isKey(e.date)) out.end = { type: 'on', date: e.date };
    else if (e.type === 'after') out.end = { type: 'after', count: Math.min(999, Math.max(1, parseInt(e.count, 10) || 1)) };
    else out.end = { type: 'never' };
    return out;
  }

  PL.models = {
    cleanRepeat,

    chore(d) {
      const out = {
        title: text(d.title, 80) || 'Chore',
        stars: stars(d.stars),
        memberIds: Array.isArray(d.memberIds) ? [...new Set(d.memberIds.map(String))] : [],
        date: isKey(d.date) ? d.date : PL.D.today(),
        repeat: cleanRepeat(d.repeat),
        exdates: Array.isArray(d.exdates) ? d.exdates.filter(isKey) : [],
        by: d.by || null
      };
      if (!out.repeat) out.exdates = [];
      if (d.demo) out.demo = true;
      return out;
    },

    completion(d) {
      const out = { choreId: String(d.choreId || ''), date: isKey(d.date) ? d.date : PL.D.today(), memberId: String(d.memberId || ''), by: d.by || null };
      if (d.demo) out.demo = true;
      return out;
    },

    routine(d) {
      const steps = (Array.isArray(d.steps) ? d.steps : []).map((s, i) => ({ id: text(s && s.id, 20) || 's' + i, text: text(s && s.text, 80) })).filter((s) => s.text).slice(0, 20);
      const wd = (Array.isArray(d.weekdays) ? d.weekdays : []).map(Number).filter((n) => n >= 0 && n <= 6);
      const out = {
        title: text(d.title, 60) || 'Routine',
        when: ['morning', 'afternoon', 'bedtime', 'anytime'].includes(d.when) ? d.when : 'anytime',
        memberIds: Array.isArray(d.memberIds) ? [...new Set(d.memberIds.map(String))] : [],
        weekdays: wd.length ? [...new Set(wd)].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6],
        steps,
        stars: stars(d.stars),
        by: d.by || null
      };
      if (d.demo) out.demo = true;
      return out;
    },

    rlog(d) {
      const out = { routineId: String(d.routineId || ''), date: isKey(d.date) ? d.date : PL.D.today(), memberId: String(d.memberId || ''),
        done: Array.isArray(d.done) ? [...new Set(d.done.map(String))].slice(0, 40) : [], by: d.by || null };
      if (d.demo) out.demo = true;
      return out;
    },

    reward(d) {
      const out = { title: text(d.title, 60) || 'Reward', emoji: text(d.emoji, 8), cost: Math.min(999, Math.max(1, parseInt(d.cost, 10) || 5)) };
      if (d.demo) out.demo = true;
      return out;
    },

    redemption(d) {
      const out = { rewardId: String(d.rewardId || ''), title: text(d.title, 60) || 'Reward', cost: Math.min(999, Math.max(0, parseInt(d.cost, 10) || 0)),
        memberId: String(d.memberId || ''), date: isKey(d.date) ? d.date : PL.D.today(), by: d.by || null };
      if (d.demo) out.demo = true;
      return out;
    },

    list(d) {
      const out = { title: text(d.title, 40) || 'List' };
      if (d.demo) out.demo = true;
      return out;
    },

    listitem(d) {
      const at = Number(d.at);
      const out = { listId: String(d.listId || ''), text: text(d.text, 100) || 'Item', done: !!d.done, at: Number.isFinite(at) ? at : Date.now() };
      const group = text(d.group, 90), also = text(d.also, 60);
      if (group) out.group = group; // the meal these groceries are for, like "Tue · Chicken adobo"
      if (also) out.also = also;    // "also for Adobo" when two meals need the same thing
      if (d.demo) out.demo = true;
      return out;
    },

    recipe(d) {
      const lines = (v, n) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => text(x, 120)).filter(Boolean).slice(0, n);
      const sv = parseInt(d.servings, 10);
      const out = { title: text(d.title, 80) || 'Recipe', emoji: text(d.emoji, 8), servings: sv >= 1 && sv <= 99 ? sv : 4,
        ingredients: lines(d.ingredients, 60), steps: text(d.steps, 4000), by: d.by || null };
      if (d.demo) out.demo = true;
      return out;
    },

    meal(d) {
      const out = { date: isKey(d.date) ? d.date : PL.D.today(), slot: ['breakfast', 'lunch', 'dinner'].includes(d.slot) ? d.slot : 'dinner',
        title: text(d.title, 80) || 'Meal', recipeId: text(d.recipeId, 100) };
      if (d.shopped) out.shopped = true; // its ingredients were sent to the groceries
      if (d.demo) out.demo = true;
      return out;
    },

    countdown(d) {
      const out = { title: text(d.title, 60) || 'Countdown', date: isKey(d.date) ? d.date : PL.D.today(), emoji: text(d.emoji, 8), yearly: !!d.yearly };
      if (d.demo) out.demo = true;
      return out;
    },

    // A public holiday on the calendar. set = which holiday list it came from, like "CA-BC".
    holiday(d) {
      const out = { date: isKey(d.date) ? d.date : PL.D.today(), title: text(d.title, 80) || 'Holiday', set: text(d.set, 20) };
      if (d.check) out.check = true; // dates guessed by AI: please check
      return out;
    },

    // Notes page: a plain note, or a simple table (a mini spreadsheet).
    note(d) {
      const kind = d.kind === 'table' ? 'table' : 'note';
      const at = Number(d.at);
      const out = { kind, title: text(d.title, 80) || (kind === 'table' ? 'Table' : 'Note'), by: text(d.by, 40), at: Number.isFinite(at) ? at : Date.now() };
      if (kind === 'note') out.text = String(d.text == null ? '' : d.text).slice(0, 20000);
      else {
        const types = ['text', 'number', 'check'];
        out.cols = (Array.isArray(d.cols) ? d.cols : []).slice(0, 12).map((c) => ({ name: text(c && c.name, 40) || 'Column', type: types.includes(c && c.type) ? c.type : 'text' }));
        if (!out.cols.length) out.cols = [{ name: 'Item', type: 'text' }];
        out.rows = (Array.isArray(d.rows) ? d.rows : []).slice(0, 300).map((r) => out.cols.map((c, i) => {
          const v = Array.isArray(r) ? r[i] : '';
          return c.type === 'check' ? !!v : text(v, 200);
        }));
      }
      return out;
    },

    photo(d) {
      const at = Number(d.at);
      return { assetId: String(d.assetId || '').replace(/[^0-9a-f]/gi, '').slice(0, 64), at: Number.isFinite(at) ? at : Date.now() };
    },

    member(d) {
      const roles = C.roles.map((r) => r.id);
      const out = {
        name: text(d.name, 30) || 'Family member',
        role: roles.includes(d.role) ? d.role : 'other',
        avatar: text(d.avatar, 8),
        color: /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : C.palette[0].hex,
        birthday: isKey(d.birthday) ? d.birthday : ''
      };
      if (d.demo) out.demo = true;
      return out;
    },

    event(d) {
      const allDay = !!d.allDay;
      const out = {
        title: text(d.title, 80) || 'Untitled event',
        date: isKey(d.date) ? d.date : PL.D.today(),
        allDay,
        start: !allDay && isTime(d.start) ? d.start : '',
        end: !allDay && isTime(d.end) ? d.end : '',
        location: text(d.location, 120),
        notes: text(d.notes, 1000),
        memberIds: Array.isArray(d.memberIds) ? [...new Set(d.memberIds.map(String))] : [],
        color: /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '',
        repeat: cleanRepeat(d.repeat),
        exdates: Array.isArray(d.exdates) ? d.exdates.filter(isKey) : [],
        reminder: d.reminder === null || d.reminder === undefined || d.reminder === '' ? null : Number(d.reminder),
        by: d.by || null
      };
      if (!out.repeat) out.exdates = [];
      if (d.demo) out.demo = true;
      return out;
    }
  };
})();

