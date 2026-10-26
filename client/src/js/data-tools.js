/*
 * data-tools.js — sample family, backup (export) and restore (import).
 * Sample items use fixed ids starting with "demo-", so loading twice never doubles them,
 * and "Remove sample data" deletes exactly those.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const D = PL.D;

  /* ---------- sample family (fictional) ---------- */
  function sampleDocs() {
    const today = D.today();
    // The Monday inside the week the family sees (a Sunday-start week shows the Monday after Sunday).
    const ws = D.startOfWeek(today, PL.state.settings.weekStart || 0);
    const mon = D.addDays(ws, (8 - D.dow(ws)) % 7);
    const d = (n) => D.addDays(mon, n);      // a day of this week (0 = Monday)
    const t = (n) => D.addDays(today, n);    // relative to today
    const P = PL.config.palette.map((p) => p.hex);
    const [coral, , butter, sage, , sky, lavender] = P;

    const members = {
      'demo-mara':  { name: 'Mara',  role: 'parent', avatar: '🦊', color: coral,    birthday: '1988-04-21' },
      'demo-jonas': { name: 'Jonas', role: 'parent', avatar: '🐼', color: sky,      birthday: '1986-12-09' },
      'demo-ivy':   { name: 'Ivy',   role: 'child',  avatar: '🦄', color: lavender, birthday: '2017-03-14' },
      'demo-theo':  { name: 'Theo',  role: 'child',  avatar: '🚀', color: butter,   birthday: '2020-09-02' },
      'demo-nana':  { name: 'Nana Rosa', role: 'other', avatar: '🌻', color: sage,  birthday: '1955-11-05' }
    };
    const weekly = (...wd) => ({ freq: 'weekly', interval: 1, weekdays: wd, end: { type: 'never' } });
    const ev = (o) => Object.assign({ allDay: false, memberIds: [], repeat: null, reminder: null }, o);
    const events = {
      'demo-e01': ev({ title: 'School run', date: d(0 - 7), start: '08:15', end: '08:45', memberIds: ['demo-ivy', 'demo-theo'], repeat: weekly(1, 2, 3, 4, 5), location: 'Maple Grove Elementary', reminder: 15 }),
      'demo-e02': ev({ title: 'Soccer practice', date: d(1 - 7), start: '16:00', end: '17:00', memberIds: ['demo-ivy'], repeat: weekly(2, 4), location: 'Riverside Field', reminder: 30 }),
      'demo-e03': ev({ title: 'Piano lesson', date: d(2 - 7), start: '15:30', end: '16:15', memberIds: ['demo-theo'], repeat: weekly(3), location: 'Ms. Alder’s studio' }),
      'demo-e04': ev({ title: 'Team check-in', date: d(0 - 7), start: '10:00', end: '10:30', memberIds: ['demo-mara'], repeat: weekly(1, 3, 5) }),
      'demo-e05': ev({ title: 'Trash and recycling', date: d(2 - 7), allDay: true, repeat: weekly(3), reminder: 1440 }),
      'demo-e06': ev({ title: 'Family movie night', date: d(4 - 7), start: '19:00', end: '21:00', repeat: weekly(5), notes: 'Whoever picked last week gets to skip.' }),
      'demo-e07': ev({ title: 'Sunday dinner at Nana’s', date: d(6 - 7), start: '17:30', end: '20:00', memberIds: ['demo-nana'], repeat: weekly(0), location: 'Nana’s house' }),
      'demo-e08': ev({ title: 'Dentist (Theo)', date: t(3), start: '14:00', end: '14:45', memberIds: ['demo-theo'], location: 'Bright Smiles Dental', notes: 'Bring the insurance card.', reminder: 60 }),
      'demo-e09': ev({ title: 'Parent-teacher meeting', date: t(4), start: '18:00', end: '18:30', memberIds: ['demo-mara', 'demo-jonas'], location: 'Room 12' }),
      'demo-e10': ev({ title: 'Date night', date: t(2), start: '19:30', end: '22:00', memberIds: ['demo-mara', 'demo-jonas'], repeat: { freq: 'monthly', interval: 1, end: { type: 'never' } } }),
      'demo-e11': ev({ title: 'No school (teacher day)', date: t(9), allDay: true, memberIds: ['demo-ivy', 'demo-theo'] }),
      'demo-e12': ev({ title: 'Science fair', date: t(12), start: '10:00', end: '12:00', memberIds: ['demo-ivy'], location: 'School gym' }),
      'demo-e13': ev({ title: 'Grocery run', date: d(5 - 7), start: '10:00', end: '11:00', memberIds: ['demo-jonas'], repeat: weekly(6) }),
      'demo-e14': ev({ title: 'Book club', date: t(5), start: '19:00', end: '21:00', memberIds: ['demo-mara'], repeat: { freq: 'monthly', interval: 1, end: { type: 'after', count: 6 } }, location: 'The Corner Café' })
    };
    const daily = { freq: 'daily', interval: 1, end: { type: 'never' } };
    const chore = (o) => Object.assign({ memberIds: [], repeat: null }, o);
    const chores = {
      'demo-c01': chore({ title: 'Make your bed', date: d(0 - 7), memberIds: ['demo-ivy', 'demo-theo'], repeat: daily }),
      'demo-c02': chore({ title: 'Unload the dishwasher', date: d(0 - 7), memberIds: ['demo-ivy'], repeat: weekly(1, 2, 3, 4, 5) }),
      'demo-c03': chore({ title: 'Set the table', date: d(0 - 7), memberIds: ['demo-theo'], repeat: weekly(0, 1, 2, 3, 4, 5) }),
      'demo-c04': chore({ title: 'Tidy the playroom', date: d(5 - 7), memberIds: ['demo-theo', 'demo-ivy'], repeat: weekly(6) }),
      'demo-c05': chore({ title: 'Water the plants', date: d(5 - 7), repeat: weekly(6) }),
      'demo-c06': chore({ title: 'Take out the trash', date: d(2 - 7), memberIds: ['demo-jonas'], repeat: weekly(3) }),
      'demo-c07': chore({ title: 'Laundry', date: d(6 - 7), memberIds: ['demo-mara'], repeat: weekly(0, 3) })
    };
    const completions = {};
    [['demo-c01', 'demo-ivy'], ['demo-c01', 'demo-theo'], ['demo-c02', 'demo-ivy']].forEach(([c, m]) => { completions[c + '~' + today + '~' + m] = { choreId: c, date: today, memberId: m }; });
    // Past ticks, so the stars have something to show.
    ['demo-ivy', 'demo-theo'].forEach((m) => { for (let n = 1; n <= 5; n++) { const dt = t(-n); completions['demo-c01~' + dt + '~' + m] = { choreId: 'demo-c01', date: dt, memberId: m }; } });
    const steps = (...t) => t.map((text, i) => ({ id: 's' + (i + 1), text }));
    const routines = {
      'demo-r1': { title: 'Morning routine', when: 'morning', memberIds: ['demo-ivy', 'demo-theo'], weekdays: [1, 2, 3, 4, 5], stars: 2, steps: steps('Get dressed', 'Eat breakfast', 'Brush teeth', 'Pack school bag') },
      'demo-r2': { title: 'Bedtime routine', when: 'bedtime', memberIds: ['demo-ivy', 'demo-theo'], weekdays: [0, 1, 2, 3, 4, 5, 6], stars: 2, steps: steps('Bath', 'Pyjamas', 'Brush teeth', 'Story time') }
    };
    const rlogs = { ['demo-r2~' + today + '~demo-ivy']: { routineId: 'demo-r2', date: today, memberId: 'demo-ivy', done: ['s1', 's2'] } };
    for (let n = 1; n <= 5; n++) { const dt = t(-n); rlogs['demo-r2~' + dt + '~demo-ivy'] = { routineId: 'demo-r2', date: dt, memberId: 'demo-ivy', done: ['s1', 's2', 's3', 's4'] }; }
    const rewards = {
      'demo-w1': { title: 'Pick the movie', emoji: '🎬', cost: 5 },
      'demo-w2': { title: 'Ice cream outing', emoji: '🍦', cost: 8 },
      'demo-w3': { title: 'Extra story at bedtime', emoji: '📚', cost: 3 },
      'demo-w4': { title: 'Park trip with a friend', emoji: '🛝', cost: 15 }
    };
    const redemptions = { 'demo-x1': { rewardId: 'demo-w3', title: 'Extra story at bedtime', cost: 3, memberId: 'demo-theo', date: t(-1) } };
    const lists = { 'demo-l1': { title: 'Groceries' }, 'demo-l2': { title: 'Weekend packing' }, 'demo-l3': { title: 'Family to-do' } };
    const now = Date.now();
    const listitems = {};
    [['demo-l1', 'Milk', 0], ['demo-l1', 'Eggs', 0], ['demo-l1', 'Bananas', 0], ['demo-l1', 'Rice', 1], ['demo-l1', 'Pasta', 0],
     ['demo-l2', 'Swimsuits', 0], ['demo-l2', 'Sunscreen', 0], ['demo-l2', 'Phone chargers', 1],
     ['demo-l3', 'Book dentist for Mara', 0], ['demo-l3', 'Return library books', 0], ['demo-l3', 'Fix bike tire', 1]]
      .forEach(([listId, text, done], i) => { listitems['demo-i' + String(i + 1).padStart(2, '0')] = { listId, text, done: !!done, at: now - (100 - i) * 1000 }; });
    const recipes = {
      'demo-c1': { title: 'Spaghetti bolognese', emoji: '🍝', servings: 4, ingredients: ['400 g spaghetti', '500 g ground beef', '1 onion', '2 garlic cloves', '1 can crushed tomatoes', 'Olive oil', 'Salt'], steps: 'Cook the onion and garlic in oil.\nAdd the beef and brown it.\nAdd the tomatoes and simmer 20 minutes.\nBoil the spaghetti and mix.' },
      'demo-c2': { title: 'Veggie fried rice', emoji: '🍚', servings: 4, ingredients: ['3 cups cooked rice', '2 eggs', '1 cup frozen peas and carrots', '3 green onions', '2 tbsp soy sauce'], steps: 'Scramble the eggs and set aside.\nFry the vegetables for 3 minutes.\nAdd the rice and soy sauce.\nMix in the eggs and green onions.' },
      'demo-c3': { title: 'Weekend pancakes', emoji: '🥞', servings: 4, ingredients: ['2 cups flour', '2 tbsp sugar', '2 tsp baking powder', '2 eggs', '1.5 cups milk', 'Butter'], steps: 'Mix the dry ingredients.\nWhisk in eggs and milk.\nCook spoonfuls in a buttered pan until golden on both sides.' }
    };
    const meals = {};
    [[0, 'dinner', 'Spaghetti bolognese', 'demo-c1'], [1, 'dinner', 'Veggie fried rice', 'demo-c2'], [2, 'dinner', 'Tacos', ''], [3, 'dinner', 'Soup and bread', ''],
     [4, 'dinner', 'Homemade pizza', ''], [5, 'breakfast', 'Weekend pancakes', 'demo-c3']]
      .forEach(([n, slot, title, recipeId]) => { meals[d(n) + '~' + slot] = { date: d(n), slot, title, recipeId }; });
    const countdowns = {
      'demo-k1': { title: 'Summer holiday', emoji: '🏖️', date: t(45), yearly: false },
      'demo-k2': { title: 'Ivy’s school play', emoji: '🎭', date: t(12), yearly: false }
    };
    return { members, events, chores, completions, routines, rlogs, rewards, redemptions, lists, listitems, recipes, meals, countdowns };
  }

  async function loadSample() {
    const { members, events, chores, completions, routines, rlogs, rewards, redemptions, lists, listitems, recipes, meals, countdowns } = sampleDocs();
    for (const [id, m] of Object.entries(members)) {
      if (!(await PL.store.setDoc('members/' + id, PL.models.member(Object.assign({ demo: true }, m))))) return false;
    }
    for (const [id, e] of Object.entries(events)) {
      if (!(await PL.store.setDoc('events/' + id, PL.models.event(Object.assign({ demo: true }, e))))) return false;
    }
    for (const [id, c] of Object.entries(chores)) {
      if (!(await PL.store.setDoc('chores/' + id, PL.models.chore(Object.assign({ demo: true }, c))))) return false;
    }
    for (const [id, c] of Object.entries(completions)) {
      if (!(await PL.store.setDoc('completions/' + id, PL.models.completion(Object.assign({ demo: true }, c))))) return false;
    }
    const more = [['routines', routines, 'routine'], ['rlogs', rlogs, 'rlog'], ['rewards', rewards, 'reward'], ['redemptions', redemptions, 'redemption'], ['lists', lists, 'list'], ['listitems', listitems, 'listitem'], ['recipes', recipes, 'recipe'], ['meals', meals, 'meal'], ['countdowns', countdowns, 'countdown']];
    for (const [col, docs, kind] of more) {
      for (const [id, x] of Object.entries(docs)) {
        if (!(await PL.store.setDoc(col + '/' + id, PL.models[kind](Object.assign({ demo: true }, x))))) return false;
      }
    }
    return true;
  }
  const hasSample = () => PL.state.members.some((m) => m.demo) || PL.state.events.some((e) => e.demo) || PL.state.chores.some((c) => c.demo) || PL.state.routines.some((c) => c.demo) || PL.state.lists.some((c) => c.demo) || PL.state.recipes.some((c) => c.demo) || PL.state.countdowns.some((c) => c.demo);
  async function removeSample() {
    for (const m of PL.state.members.filter((x) => x.demo)) await PL.store.deleteDoc('members/' + m.id);
    for (const e of PL.state.events.filter((x) => x.demo)) await PL.store.deleteDoc('events/' + e.id);
    for (const c of PL.state.chores.filter((x) => x.demo)) await PL.store.deleteDoc('chores/' + c.id);
    for (const c of PL.state.completions.filter((x) => x.demo || String(x.choreId).startsWith('demo-'))) await PL.store.deleteDoc('completions/' + c.id);
    const isDemo = (v) => String(v).startsWith('demo-');
    for (const x of PL.state.routines.filter((y) => y.demo)) await PL.store.deleteDoc('routines/' + x.id);
    for (const x of PL.state.rlogs.filter((y) => y.demo || isDemo(y.routineId))) await PL.store.deleteDoc('rlogs/' + x.id);
    for (const x of PL.state.rewards.filter((y) => y.demo)) await PL.store.deleteDoc('rewards/' + x.id);
    for (const x of PL.state.redemptions.filter((y) => y.demo || isDemo(y.memberId))) await PL.store.deleteDoc('redemptions/' + x.id);
    for (const x of PL.state.lists.filter((y) => y.demo)) await PL.store.deleteDoc('lists/' + x.id);
    for (const x of PL.state.listitems.filter((y) => y.demo || isDemo(y.listId))) await PL.store.deleteDoc('listitems/' + x.id);
    for (const x of PL.state.recipes.filter((y) => y.demo)) await PL.store.deleteDoc('recipes/' + x.id);
    for (const x of PL.state.meals.filter((y) => y.demo)) await PL.store.deleteDoc('meals/' + x.id);
    for (const x of PL.state.countdowns.filter((y) => y.demo)) await PL.store.deleteDoc('countdowns/' + x.id);
  }

  /* ---------- backup ---------- */
  function snapshot() {
    return {
      app: 'kalendaryo', version: 1, exportedAt: new Date().toISOString(),
      settings: Object.assign({}, PL.state.settings, { pinHash: undefined }), // the PIN stays out of backup files
      members: PL.state.members, // each item keeps its own "id"
      events: PL.state.events,
      chores: PL.state.chores,
      completions: PL.state.completions,
      routines: PL.state.routines,
      rlogs: PL.state.rlogs,
      rewards: PL.state.rewards,
      redemptions: PL.state.redemptions,
      lists: PL.state.lists,
      listitems: PL.state.listitems,
      recipes: PL.state.recipes,
      meals: PL.state.meals,
      countdowns: PL.state.countdowns
    };
  }
  async function saveBackup() {
    let dl = null;
    try { dl = window.claude && (await window.claude.use('downloads')); } catch (e) { /* not available */ }
    if (!dl) { PL.ui.toast('Saving files is not available in this view.'); return; }
    try {
      await dl.save({ filename: 'kalendaryo-backup-' + D.today() + '.json', data: JSON.stringify(snapshot(), null, 2) });
      PL.ui.toast('Backup saved.');
    } catch (e) {
      if (!e || e.code !== 'declined') PL.ui.toast('Could not save the backup file.');
    }
  }

  // Read a chosen file and check it. Returns { ok, error?, data?, counts? }
  async function readBackup(file) {
    try {
      const obj = JSON.parse(await file.text());
      if (!obj || (obj.app !== 'kalendaryo' && obj.app !== 'porchlight') || !Array.isArray(obj.members) || !Array.isArray(obj.events)) {
        return { ok: false, error: 'That file is not a Kalendaryo backup.' };
      }
      return { ok: true, data: obj, counts: { members: obj.members.length, events: obj.events.length, chores: (obj.chores || []).length } };
    } catch (e) {
      return { ok: false, error: 'That file could not be read. Pick a backup file saved from this app.' };
    }
  }
  const safeId = (id) => typeof id === 'string' && /^[A-Za-z0-9_\-.~:@+]{1,100}$/.test(id) && id !== '.' && id !== '..';

  // Items with the same id are replaced; nothing else is touched.
  async function applyBackup(obj) {
    for (const m of obj.members) {
      const doc = PL.models.member(m);
      if (safeId(m.id)) { if (!(await PL.store.setDoc('members/' + m.id, doc))) return false; }
      else if (!(await PL.store.addMember(doc))) return false;
    }
    for (const e of obj.events) {
      const doc = PL.models.event(e);
      if (safeId(e.id)) { if (!(await PL.store.setDoc('events/' + e.id, doc))) return false; }
      else if (!(await PL.store.addEvent(doc))) return false;
    }
    for (const c of obj.chores || []) {
      const doc = PL.models.chore(c);
      if (safeId(c.id)) { if (!(await PL.store.setDoc('chores/' + c.id, doc))) return false; }
      else if (!(await PL.store.addChore(doc))) return false;
    }
    for (const c of obj.completions || []) {
      if (safeId(c.id)) { if (!(await PL.store.setDoc('completions/' + c.id, PL.models.completion(c)))) return false; }
    }
    for (const [col, kind] of [['routines', 'routine'], ['rlogs', 'rlog'], ['rewards', 'reward'], ['redemptions', 'redemption'], ['lists', 'list'], ['listitems', 'listitem'], ['recipes', 'recipe'], ['meals', 'meal'], ['countdowns', 'countdown']]) {
      for (const x of obj[col] || []) {
        const doc = PL.models[kind](x);
        if (safeId(x.id)) { if (!(await PL.store.setDoc(col + '/' + x.id, doc))) return false; }
        else if (!(await PL.store.add(col, doc))) return false;
      }
    }
    if (obj.settings) { const s = Object.assign({}, obj.settings); delete s.pinHash; await PL.store.saveSettings(s); }
    return true;
  }

  PL.data = { sampleDocs, loadSample, removeSample, hasSample, snapshot, saveBackup, readBackup, applyBackup };
})();

