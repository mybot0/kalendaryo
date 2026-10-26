/*
 * store.js — what this device remembers, and the open trip.
 *   TR.saved    the trips (secret links) saved on this device — this is what "My Trips" is built from
 *   TR.profile  the name/picture used the next time a form asks
 *   TR.openTrip(id) -> session: the trip's data, live updates, chat cache
 */
(function () {
  const TR = window.TR;

  /* ---------- tiny event helper ---------- */
  function emitter() {
    const fns = new Set();
    return { on(fn) { fns.add(fn); return () => fns.delete(fn); }, emit(...a) { fns.forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); } };
  }
  TR.emitter = emitter;

  /* ---------- trips saved on this device ---------- */
  const savedBus = emitter();
  TR.saved = {
    all() { return TR.storage.get('trips', []).filter((x) => x && typeof x.token === 'string' && x.tripId); },
    find(tripId) { return this.all().find((x) => x.tripId === tripId) || null; },
    add(tripId, token) {
      const list = this.all().filter((x) => x.tripId !== tripId);
      list.push({ tripId, token, added: Date.now() });
      TR.storage.set('trips', list); savedBus.emit();
    },
    remove(tripId) { TR.storage.set('trips', this.all().filter((x) => x.tripId !== tripId)); savedBus.emit(); },
    on: savedBus.on
  };

  TR.profile = {
    get() { return Object.assign({ name: '', avatar: TR.config.avatars[0] }, TR.storage.get('profile', {})); },
    set(p) { TR.storage.set('profile', { name: p.name || '', avatar: p.avatar || '' }); }
  };

  /* ---------- an open trip ---------- */
  let current = null;

  function openTrip(tripId) {
    if (current && current.id === tripId) return current;
    if (current) current.close();
    const saved = TR.saved.find(tripId);
    current = createSession(tripId, saved ? saved.token : null);
    return current;
  }
  function closeTrip() { if (current) { current.close(); current = null; } }

  function createSession(tripId, token) {
    const bus = emitter();
    const s = {
      id: tripId, token, state: null, status: token ? 'loading' : 'denied', error: '',
      threads: {},        // 'trip' | memberId -> { list: [], more: false, loaded: false }
      viewing: null,      // the chat thread on screen right now
      online: true
    };
    let streamH = null, refreshTimer = null, closed = false;

    s.on = bus.on;
    s.req = (method, path, body) => TR.api.call(method, '/trips/' + tripId + path, { token, body });
    s.can = (perm) => !!(s.state && s.state.perms && s.state.perms[perm]);
    s.me = () => (s.state ? s.state.me : null);
    s.member = (id) => (s.state ? s.state.members.find((m) => m.id === id) || null : null);
    s.trip = () => (s.state ? s.state.trip : null);
    s.items = () => (s.state ? s.state.items : []);
    s.packing = () => (s.state ? s.state.packing || [] : []);
    s.expenses = () => (s.state ? s.state.expenses || [] : []);
    s.item = (id) => s.items().find((i) => i.id === id) || null;
    s.link = () => TR.personalLink(token);
    s.unreadTotal = () => {
      const u = s.state && s.state.unread; if (!u) return 0;
      return (u.trip || 0) + Object.values(u.dm || {}).reduce((a, b) => a + b, 0);
    };

    /* ----- "what is new since I last looked" (built from what others changed; chat counts come from unread) ----- */
    const seenKey = 'seen.' + tripId;
    s.seenAt = () => TR.storage.get(seenKey, null) || (s.me() ? s.me().joined_at : '1970-01-01');
    s.markSeen = () => { TR.storage.set(seenKey, new Date().toISOString()); bus.emit('unread'); };
    s.updates = function () {
      if (!s.state) return [];
      const seen = s.seenAt(), me = s.me().id, out = [];
      const who = (id) => { const m = s.member(id); return m ? m.name : 'Someone'; };
      const label = (t) => (TR.config.types[t] ? TR.config.types[t].label.toLowerCase() : 'plan');
      s.items().forEach((i) => {
        if (i.created_at > seen && i.created_by !== me) out.push({ at: i.created_at, icon: TR.config.types[i.type].icon, text: [who(i.created_by), ' added a ' + label(i.type) + ': ', i.title], go: { item: i.id } });
        else if (i.updated_at > seen && i.updated_by && i.updated_by !== me && i.updated_at > i.created_at) out.push({ at: i.updated_at, icon: 'edit', text: [who(i.updated_by), ' changed ', i.title], go: { item: i.id } });
      });
      s.expenses().forEach((e) => { if (e.created_at > seen && e.created_by !== me) out.push({ at: e.created_at, icon: 'cart', text: [who(e.created_by), ' added a cost: ', e.title], go: { screen: 'expenses' } }); });
      s.packing().forEach((x) => { if (x.created_at > seen && x.created_by !== me) out.push({ at: x.created_at, icon: 'bag', text: [who(x.created_by), ' added to the packing list: ', x.title], go: { screen: 'packing' } }); });
      s.state.members.forEach((m) => { if (!m.you && m.joined_at > seen) out.push({ at: m.joined_at, icon: 'users', text: [m.name, ' joined the trip'], go: { screen: 'people' } }); });
      out.sort((a, b) => b.at.localeCompare(a.at));
      const u = s.state.unread, dm = Object.values(u.dm || {}).reduce((a, b) => a + b, 0);
      const chat = [];
      if (u.trip) chat.push({ at: '9999', icon: 'chat', text: [TR.plural(u.trip, 'unread message') + ' in the group chat' + (u.mentions ? ' (' + u.mentions + ' mention' + (u.mentions > 1 ? '' : '') + ' of you)' : '')], go: { screen: 'chat' } });
      if (dm) chat.push({ at: '9998', icon: 'chat', text: [TR.plural(dm, 'unread private message')], go: { screen: 'chat' } });
      return chat.concat(out);
    };

    function denied(reason) {
      s.status = 'denied'; s.error = reason || '';
      TR.saved.remove(tripId);
      bus.emit('status');
    }

    async function load() {
      if (!token) return denied('');
      try {
        s.state = await s.req('GET', '/state');
        s.status = 'ready'; s.online = true;
        // Keep the saved list's picture of the trip fresh (name for the device list)
        bus.emit('state');
      } catch (e) {
        if (e.status === 401 || e.status === 404) return denied(e.message);
        s.online = false; s.error = e.message;
        if (!s.state) s.status = 'error';
        bus.emit('status');
      }
    }
    // Several changes in a row become one reload.
    function refreshSoon() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (!closed) load(); }, 150);
    }
    s.refresh = load;

    /* ----- chat cache ----- */
    const thread = (key) => s.threads[key] || (s.threads[key] = { list: [], more: false, loaded: false });
    s.thread = thread;
    // Which conversation does this message belong to, from my side?
    function threadOf(m) {
      if (!m.to_member) return 'trip';
      return m.sender_id === (s.me() && s.me().id) ? m.to_member : m.sender_id;
    }
    function addMessage(m) {
      const key = threadOf(m);
      const t = thread(key);
      if (t.list.some((x) => x.id === m.id)) return false;
      t.list.push(m);
      return true;
    }
    s.loadThread = async function (key, before) {
      const t = thread(key);
      const q = '?thread=' + encodeURIComponent(key) + '&limit=40' + (before ? '&before=' + before : '');
      const r = await s.req('GET', '/messages' + q);
      if (before) t.list = r.messages.concat(t.list);
      else if (!t.loaded) t.list = r.messages.concat(t.list.filter((x) => !r.messages.some((y) => y.id === x.id)));
      else t.list = mergeLists(t.list, r.messages);
      t.more = r.more; t.loaded = true;
      bus.emit('chat', key);
      return t;
    };
    function mergeLists(a, b) {
      const seen = new Map();
      a.concat(b).forEach((m) => seen.set(m.id, m));
      return [...seen.values()].sort((x, y) => (BigInt(x.id) < BigInt(y.id) ? -1 : 1));
    }
    s.send = async function (key, body, blobId) {
      const r = await s.req('POST', '/messages', { thread: key, body, blobId });
      if (addMessage(r.message)) bus.emit('chat', key);
      return r.message;
    };
    let readTimer = null;
    s.markRead = function (key) {
      const t = thread(key);
      const last = [...t.list].reverse().find((m) => m.kind === 'text');
      const u = s.state && s.state.unread;
      if (u) { if (key === 'trip') { u.trip = 0; u.mentions = 0; } else delete u.dm[key]; bus.emit('unread'); }
      if (!last) return;
      clearTimeout(readTimer);
      readTimer = setTimeout(() => { s.req('POST', '/reads', { thread: key, lastId: last.id }).catch(() => {}); }, 300);
    };

    function onChange(ev) {
      switch (ev.kind) {
        case 'chat': {
          const m = ev.message; if (!m) return;
          const key = threadOf(m);
          const isNew = addMessage(m);
          if (!isNew) return;
          const mine = s.me() && m.sender_id === s.me().id;
          if (m.kind === 'text' && !mine && s.state) {
            if (s.viewing === key && !document.hidden) s.markRead(key);
            else if (key === 'trip') { s.state.unread.trip++; if ((m.mentions || []).includes(s.me().id)) s.state.unread.mentions++; }
            else s.state.unread.dm[key] = (s.state.unread.dm[key] || 0) + 1;
          }
          bus.emit('chat', key);
          bus.emit('unread');
          break;
        }
        case 'kicked': denied('You were removed from this trip.'); break;
        case 'trip_deleted': denied('This trip was deleted.'); break;
        case 'items': case 'trip': case 'members': case 'invites': refreshSoon(); break;
        default: refreshSoon();
      }
    }

    s.start = function () {
      load().then(() => {
        if (closed || s.status !== 'ready') return;
        streamH = TR.api.stream(tripId, token, {
          onOpen(again) { s.online = true; if (again) { load(); Object.keys(s.threads).forEach((k) => { if (s.threads[k].loaded) s.loadThread(k).catch(() => {}); }); } bus.emit('status'); },
          onChange,
          onLost() { s.online = false; bus.emit('status'); },
          onDenied() { denied('You no longer have access to this trip.'); }
        });
      });
    };
    s.close = function () { closed = true; clearTimeout(refreshTimer); clearTimeout(readTimer); if (streamH) streamH.close(); };
    s.start();
    return s;
  }

  TR.openTrip = openTrip;
  TR.closeTrip = closeTrip;
  TR.currentTrip = () => current;
})();
