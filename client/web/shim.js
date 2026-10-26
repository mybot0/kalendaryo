/*
 * shim.js — web version only. Loads first.
 * Gives the app the same "window.claude" helpers it uses inside Claude (db, user, sample, assets,
 * downloads), but backed by the Kalendaryo server. The rest of the app does not need to change.
 *   /c/<token>      a person's own link into their family
 *   /join/<code>    an invite link
 *   /               the start page
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const path = location.pathname;
  const mc = path.match(/^\/c\/([A-Za-z0-9_-]{10,100})\/?$/);
  const mj = path.match(/^\/join\/([A-Za-z0-9_-]{10,100})\/?$/);
  const listeners = {};
  const KAL = (window.KAL = {
    token: mc ? mc[1] : null, joinCode: mj ? mj[1] : null, me: null, family: null, ai: { enabled: false, left: 0 }, people: [], invalid: null,
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, x) { (listeners[ev] || []).forEach((fn) => { try { fn(x); } catch (e) { console.error(e); } }); }
  });

  // Each family keeps its own saved copy on this device.
  const short = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  if (KAL.token) window.PL_STORAGE_PREFIX = 'pl.' + short(KAL.token) + '.';

  /* families opened on this device, for the start page */
  KAL.recent = {
    all() { try { return JSON.parse(localStorage.getItem('kal.families') || '[]'); } catch (e) { return []; } },
    save(list) { try { localStorage.setItem('kal.families', JSON.stringify(list.slice(0, 12))); } catch (e) { /* private mode */ } },
    remember(t, name, who) { const l = this.all().filter((x) => x.t !== t); l.unshift({ t, name, who }); this.save(l); },
    forget(t) { this.save(this.all().filter((x) => x.t !== t)); }
  };

  /* ---------- talking to the server ---------- */
  async function api(method, url, body, raw) {
    const headers = {};
    if (KAL.token) headers.Authorization = 'Bearer ' + KAL.token;
    let payload;
    if (raw) { payload = raw; headers['Content-Type'] = raw.type || 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    let r;
    try { r = await fetch(url, { method, headers, body: payload, cache: 'no-store' }); }
    catch (e) { throw { code: 'offline', userMessage: 'Could not reach Kalendaryo. Check your internet and try again.' }; }
    let j = {};
    try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) {
      const err = { code: j.error || 'error', status: r.status, userMessage: j.message || 'Something went wrong. Please try again.' };
      if (r.status === 401 && KAL.token) KAL.emit('removed');
      throw err;
    }
    return j;
  }
  KAL.api = api;

  /* ---------- live family data, shaped like the database the app expects ---------- */
  const cache = {}; const colSubs = {}; const docSubs = {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const snapCol = (c) => ({ metadata: { hasPendingWrites: false }, docs: [...(cache[c] || new Map())].map(([id, data]) => ({ id, data: () => clone(data) })) });
  const snapDoc = (c, id) => { const v = cache[c] && cache[c].get(id); return { exists: !!v, id, metadata: { hasPendingWrites: false }, data: () => clone(v || {}) }; };
  let queued = new Set(), flushing = false;
  function notify(c, id) {
    queued.add(c + '\u0000' + id);
    if (flushing) return;
    flushing = true;
    setTimeout(() => {
      const items = [...queued]; queued = new Set(); flushing = false;
      const cols = new Set();
      items.forEach((k) => { const [cc, ii] = k.split('\u0000'); cols.add(cc); (docSubs[cc + '/' + ii] || []).forEach((cb) => cb(snapDoc(cc, ii))); });
      cols.forEach((cc) => (colSubs[cc] || []).forEach((cb) => cb(snapCol(cc))));
    }, 0);
  }
  function apply(c, id, data) {
    cache[c] = cache[c] || new Map();
    if (data === null) cache[c].delete(id); else cache[c].set(id, data);
    notify(c, id);
  }
  function replaceAll(docs) {
    const cols = new Set([...Object.keys(cache), ...Object.keys(docs)]);
    cols.forEach((c) => { cache[c] = new Map((docs[c] || []).map((d) => [d.id, d.data])); });
    Object.keys(colSubs).forEach((c) => (colSubs[c] || []).forEach((cb) => cb(snapCol(c))));
    Object.keys(docSubs).forEach((p) => { const [c, id] = p.split('/'); docSubs[p].forEach((cb) => cb(snapDoc(c, id))); });
  }
  let loaded = null;
  function load() {
    if (!loaded) loaded = api('GET', '/api/state').then((r) => { replaceAll(r.docs || {}); connect(); });
    return loaded;
  }
  let es = null, opened = false;
  function connect() {
    if (es || !window.EventSource) return;
    es = new EventSource('/api/stream?t=' + encodeURIComponent(KAL.token));
    es.addEventListener('hello', () => {
      if (opened) api('GET', '/api/state').then((r) => replaceAll(r.docs || {})).catch(() => {}); // catch up after a reconnect
      opened = true;
    });
    es.addEventListener('doc', (e) => { try { const m = JSON.parse(e.data); apply(m.col, m.id, m.data); } catch (x) { /* ignore */ } });
    es.addEventListener('people', () => KAL.emit('people'));
    es.addEventListener('me', () => refreshMe());
    es.addEventListener('removed', () => KAL.emit('removed'));
  }
  const db = {
    collection: (c) => ({
      add: async (o) => { const r = await api('POST', '/api/docs/' + c, { data: o }); apply(c, r.id, clone(o)); return { id: r.id }; },
      onSnapshot: (cb, err) => { (colSubs[c] = colSubs[c] || []).push(cb); load().then(() => cb(snapCol(c)), (e) => err && err(e)); return () => { colSubs[c] = colSubs[c].filter((x) => x !== cb); }; }
    }),
    doc: (p) => {
      const i = p.indexOf('/'); const c = p.slice(0, i), id = p.slice(i + 1);
      return {
        set: async (o) => { await api('PUT', '/api/docs/' + c + '/' + encodeURIComponent(id), { data: o }); apply(c, id, clone(o)); },
        delete: async () => { await api('DELETE', '/api/docs/' + c + '/' + encodeURIComponent(id)); apply(c, id, null); },
        onSnapshot: (cb, err) => { (docSubs[p] = docSubs[p] || []).push(cb); load().then(() => cb(snapDoc(c, id)), (e) => err && err(e)); return () => { docSubs[p] = docSubs[p].filter((x) => x !== cb); }; }
      };
    }
  };

  /* ---------- the other helpers ---------- */
  function parseJson(text) {
    const t = String(text || '').trim();
    try { return JSON.parse(t); } catch (e) { /* look for the JSON inside */ }
    const m = t.match(/[[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) { /* fall through */ } }
    throw { code: 'bad_json', userMessage: 'The ideas came back in a strange shape. Please try again.' };
  }
  async function askAi(input) {
    const prompt = Array.isArray(input) ? input.map((m) => m.content).join('\n\n') : String(input);
    try {
      const r = await api('POST', '/api/ai', { prompt });
      KAL.ai.left = r.left;
      return r.text;
    } catch (e) {
      if (e.code === 'daily_limit' || e.code === 'rate_limited') e.code = 'rate_limited';
      throw e;
    }
  }
  const sample = async (input) => ({ text: await askAi(input), truncated: false });
  sample.json = async (input) => parseJson(await askAi(input));
  sample.limits = async () => ({ images: false });

  const assets = {
    upload: async (blob) => api('POST', '/api/blobs', undefined, blob),
    delete: async (id) => api('DELETE', '/api/blobs/' + encodeURIComponent(id)),
    list: async () => ({ assets: [], usage: {} })
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename || 'kalendaryo.json';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return { saved: true };
    }
  };

  async function refreshMe() {
    const r = await api('GET', '/api/me');
    KAL.me = r.me; KAL.family = r.family; KAL.ai = r.ai || { enabled: false, left: 0 };
    KAL.recent.remember(KAL.token, r.family.name, r.me.name);
    KAL.emit('me', r.me);
    return r;
  }
  KAL.refreshMe = refreshMe;
  KAL.ready = KAL.token ? refreshMe().catch((e) => { KAL.invalid = e; if (e.status === 401) KAL.recent.forget(KAL.token); }) : Promise.resolve();

  window.claude = {
    use: async (name) => {
      await KAL.ready;
      if (!KAL.me) return null;
      const canEdit = KAL.me.role !== 'viewer';
      if (name === 'db') return db;
      if (name === 'user') return { id: async () => KAL.me.id, isOwner: () => KAL.me.role === 'owner', canEdit: () => canEdit };
      if (name === 'sample') return KAL.ai.enabled && canEdit ? sample : null;
      if (name === 'assets') return canEdit ? assets : null;
      if (name === 'downloads') return downloads;
      return null;
    }
  };

  PL.blobUrl = (id) => '/api/blobs/' + encodeURIComponent(id) + '?t=' + encodeURIComponent(KAL.token || '');
  PL.beforeBoot = () => {
    if (KAL.token) return true;
    PL.landing.mount();
    return false;
  };
})();
