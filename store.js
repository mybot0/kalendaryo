/*
 * store.js — the app's memory. Holds the family data, keeps it in sync with the
 * shared database, and keeps a saved copy on this device so the screen is useful
 * even when the internet drops.
 *
 *   PL.state            current data (members, events, settings, device, status)
 *   PL.store.subscribe  get told whenever anything changes
 *   PL.store.*          the only functions that write family data
 *
 * Database layout:  members/{id}   events/{id}   chores/{id}   completions/{id}   settings/main
 * Per-device preferences (layout, text size, hidden people) are NOT in the database.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const C = PL.config;

  // Extra collections that are loaded, cached and written the same way.
  const COLLS = ['chores', 'completions', 'routines', 'rlogs', 'rewards', 'redemptions', 'lists', 'listitems', 'recipes', 'meals', 'countdowns', 'photos', 'holidays', 'notes'];
  const MODEL = { chores: 'chore', completions: 'completion', routines: 'routine', rlogs: 'rlog', rewards: 'reward', redemptions: 'redemption', lists: 'list', listitems: 'listitem', recipes: 'recipe', meals: 'meal', countdowns: 'countdown', photos: 'photo', holidays: 'holiday', notes: 'note' };

  const state = (PL.state = {
    ready: false,        // first render can happen
    available: true,     // false when the shared database cannot be reached at all
    live: false,         // true once the database has answered
    fromCache: false,    // showing the saved copy
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    pending: false,      // our own changes are still being sent
    uid: null,
    members: [],
    events: [],
    chores: [], completions: [], routines: [], rlogs: [], rewards: [], redemptions: [], lists: [], listitems: [], recipes: [], meals: [], countdowns: [], photos: [], holidays: [], notes: [],
    settings: Object.assign({}, C.householdDefaults),
    device: {}
  });

  /* ---------- change notifications ---------- */
  const listeners = new Set();
  let queued = false;
  function emit() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
    });
  }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /* ---------- device preferences ---------- */
  function loadDevice() {
    const saved = PL.storage.get('device', {}) || {};
    const d = Object.assign({}, C.deviceDefaults, saved);
    // Keep the saved widget order, but add any widget that is new since the last visit.
    const known = new Set((d.widgets || []).map((w) => w.id));
    C.deviceDefaults.widgets.forEach((w) => { if (!known.has(w.id)) d.widgets.push(Object.assign({}, w)); });
    return d;
  }
  function applyDevice() {
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(state.device.textScale || 1));
    root.classList.toggle('reduce-motion', !!state.device.reduceMotion);
  }
  function setDevice(patch) {
    state.device = Object.assign({}, state.device, patch);
    PL.storage.set('device', state.device);
    applyDevice();
    emit();
  }

  /* ---------- saved copy for offline use ---------- */
  let cacheTimer = null;
  function cacheSoon() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      const snap = { members: state.members, events: state.events, settings: state.settings };
      COLLS.forEach((k) => { snap[k] = state[k]; });
      PL.storage.set('cache', snap);
    }, 400);
  }

  /* ---------- writing ---------- */
  function explain(e) {
    if (e && e.userMessage) return e.userMessage;
    const code = e && e.code;
    if (code === 'quota_exceeded') return 'The shared storage is full. Delete some items and try again.';
    if (code === 'invalid_argument' || code === 'not_granted') return 'You can look at this family but not change it. Ask the page owner for Contributor access.';
    if (!state.online) return 'You are offline. Reconnect and try again.';
    return 'Could not save that. Check your connection and try again.';
  }
  async function write(fn) {
    if (!state.db) { PL.ui && PL.ui.toast('This page cannot reach the shared database right now.'); return false; }
    try { await fn(state.db); return true; } catch (e) { console.warn('write failed', e); PL.ui && PL.ui.toast(explain(e)); return false; }
  }
  const plain = (o) => JSON.parse(JSON.stringify(o)); // drops undefined, makes a safe copy

  const store = {
    subscribe,
    setDevice,

    async addMember(data) {
      let id = null;
      const ok = await write(async (db) => { const ref = await db.collection('members').add(plain(PL.models.member(data))); id = ref.id; });
      return ok ? id : null;
    },
    updateMember: (id, data) => write((db) => db.doc('members/' + id).set(plain(PL.models.member(data)))),
    removeMember: (id) => write((db) => db.doc('members/' + id).delete()),

    async addEvent(data) {
      let id = null;
      const ok = await write(async (db) => { const ref = await db.collection('events').add(plain(PL.models.event(data))); id = ref.id; });
      return ok ? id : null;
    },
    setEvent: (id, data) => write((db) => db.doc('events/' + id).set(plain(PL.models.event(data)))),
    deleteEvent: (id) => write((db) => db.doc('events/' + id).delete()),

    async addChore(data) {
      let id = null;
      const ok = await write(async (db) => { const ref = await db.collection('chores').add(plain(PL.models.chore(data))); id = ref.id; });
      return ok ? id : null;
    },
    setChore: (id, data) => write((db) => db.doc('chores/' + id).set(plain(PL.models.chore(data)))),
    deleteChore: (id) => write((db) => db.doc('chores/' + id).delete()),

    // Generic helpers for the other collections: add(col, data) -> id, set(col, id, data), del(col, id)
    async add(col, data) {
      let id = null;
      const ok = await write(async (db) => { const ref = await db.collection(col).add(plain(PL.models[MODEL[col]](data))); id = ref.id; });
      return ok ? id : null;
    },
    set: (col, id, data) => write((db) => db.doc(col + '/' + id).set(plain(PL.models[MODEL[col]](data)))),
    del: (col, id) => write((db) => db.doc(col + '/' + id).delete()),

    saveSettings: (patch) => write((db) => db.doc('settings/main').set(plain(Object.assign({}, state.settings, patch)))),

    // Used by import and sample data: write a document under a chosen id (safe to repeat).
    setDoc: (path, data) => write((db) => db.doc(path).set(plain(data))),
    deleteDoc: (path) => write((db) => db.doc(path).delete())
  };
  PL.store = store;

  /* ---------- start up ---------- */
  async function init() {
    state.device = loadDevice();
    applyDevice();

    const cache = PL.storage.get('cache', null);
    if (cache) {
      state.members = cache.members || [];
      state.events = cache.events || [];
      COLLS.forEach((k) => { state[k] = cache[k] || []; });
      state.settings = Object.assign({}, C.householdDefaults, cache.settings || {});
      state.fromCache = true;
      state.ready = true;
    }

    window.addEventListener('online', () => { state.online = true; emit(); });
    window.addEventListener('offline', () => { state.online = false; emit(); });

    let db = null, user = null;
    try {
      if (window.claude && window.claude.use) {
        db = await window.claude.use('db');
        user = await window.claude.use('user');
      }
    } catch (e) { console.warn(e); }

    if (!db) { state.available = false; state.ready = true; emit(); return; }
    state.db = db;
    try { state.uid = user ? await user.id() : null; } catch (e) { /* the id is optional */ }

    const got = { members: false, events: false, settings: false };
    COLLS.forEach((k) => { got[k] = false; });
    const arrived = (name, snap) => {
      got[name] = true;
      state.pending = !!(snap && snap.metadata && snap.metadata.hasPendingWrites);
      if (Object.values(got).every(Boolean)) { state.live = true; state.fromCache = false; }
      state.ready = true;
      cacheSoon();
      emit();
    };
    const failed = (e) => { console.warn('database', e); state.ready = true; emit(); };
    const toObj = (d) => Object.assign({ id: d.id }, d.data());

    db.collection('members').onSnapshot((q) => { state.members = q.docs.map(toObj); arrived('members', q); }, failed);
    db.collection('events').onSnapshot((q) => { state.events = q.docs.map(toObj); arrived('events', q); }, failed);
    COLLS.forEach((k) => db.collection(k).onSnapshot((q) => { state[k] = q.docs.map(toObj); arrived(k, q); }, failed));
    db.doc('settings/main').onSnapshot((s) => {
      state.settings = Object.assign({}, C.householdDefaults, s.exists ? s.data() : {});
      arrived('settings', s);
    }, failed);

    // If the database is slow, do not leave the screen blank.
    setTimeout(() => { if (!state.ready) { state.ready = true; emit(); } }, 4000);
    emit();
  }
  store.init = init;

  /* ---------- helpers other files use ---------- */
  store.member = (id) => state.members.find((m) => m.id === id) || null;
})();

