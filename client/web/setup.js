/*
 * setup.js — web version only. The questions after "Create a hub" on the start page:
 *   Step 1  hub name, your name, where you live (sets the hub's time zone and weather)  → the hub is made here
 *   Step 2  who is in your hub: people (who they are to you, where they live, Editor or Viewer) and pets
 *   Step 3  a quick sample with their own names (it can be cleared with one tap)
 *   Done    each person's own link to copy (the same link is in People until they join)
 * After step 1 the hub exists, so a reload comes back to step 2 (sessionStorage "kal.setup").
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, ui = PL.ui, D = PL.D;
  const KEY = 'kal.setup';
  const ICONS = ['🦊', '🦁', '🌻', '🚀', '🐼', '🦋', '🐨', '🐬', '🌈', '⭐', '🐢', '🦄', '🐸', '🐝', '🎨', '🎸', '🧸', '🍓'];
  const REL_MAIN = ['Husband', 'Wife', 'Partner', 'Son', 'Daughter', 'Mom', 'Dad', 'Grandma', 'Grandpa', 'Friend', 'Pet'];
  const REL_MORE = ['Boyfriend', 'Girlfriend', 'Sister', 'Brother', 'Aunt', 'Uncle', 'Cousin', 'Roommate', 'Nanny / Helper', 'Other'];
  const SHE = ['Wife', 'Daughter', 'Mom', 'Grandma', 'Girlfriend', 'Sister', 'Aunt'];
  const HE = ['Husband', 'Son', 'Dad', 'Grandpa', 'Boyfriend', 'Brother', 'Uncle'];
  const VIEWER = ['Son', 'Daughter', 'Grandma', 'Grandpa']; // kids and grandparents start as Viewer; anyone can be changed
  const PETS = [['Dog', '🐶'], ['Cat', '🐱'], ['Bunny', '🐰'], ['Fish', '🐟'], ['Bird', '🐦'], ['Other', '🐾']];
  const PARTNER = ['Husband', 'Wife', 'Partner', 'Boyfriend', 'Girlfriend'];
  const roleFor = (rel) => (rel === 'Pet' ? 'pet' : rel === 'Son' || rel === 'Daughter' ? 'child' : PARTNER.includes(rel) ? 'parent' : 'other');
  const pron = (rel) => (SHE.includes(rel) ? ['she', 'her'] : HE.includes(rel) ? ['he', 'his'] : rel === 'Pet' ? ['it', 'its'] : ['they', 'their']);
  const ROLE_TXT = { editor: 'Editors can add and change plans.', viewer: 'Viewers see everything but can’t change things.' };

  /* ---------- small helpers ---------- */
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = (v) => { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch (e) { /* fine */ } };
  async function call(token, method, url, body) {
    const r = await fetch(url, { method, cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || 'Something went wrong. Please try again.'); e.userMessage = e.message; e.status = r.status; throw e; }
    return j;
  }
  const errorBox = () => h('p', { class: 'form-error', role: 'alert', hidden: true });
  const showErr = (el, msg) => { el.textContent = msg || ''; el.hidden = !msg; };
  const timeIn = (tz, at) => { try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(at || new Date()); } catch (e) { return ''; } };
  const deviceZone = () => (PL.deviceZone ? PL.deviceZone() : Intl.DateTimeFormat().resolvedOptions().timeZone);
  function dots(n) { return h('div', { class: 'fl-dots', 'aria-hidden': 'true' }, [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' }))); }
  function head(n, title, sub) {
    return [dots(n), h('span', { class: 'land-kicker' }, n ? 'Step ' + n + ' of 3' : 'All set'), h('h2', {}, title), sub ? h('p', { class: 'land-pick-sub' }, sub) : null];
  }
  const card = (...kids) => h('section', { class: 'card land-pick fl' }, ...kids);
  const link = (text, onClick) => h('a', { class: 'fl-skip', href: '#', onclick: (e) => { e.preventDefault(); onClick(); } }, text);

  /* ---------- city search (the free Open-Meteo place list, the same one the weather card uses) ---------- */
  async function search(name) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(name), { signal: ctl.signal });
      if (!r.ok) throw new Error('bad status');
      return ((await r.json()).results || []).filter((x) => x.timezone).map((x) => ({
        name: [x.name, x.country].filter(Boolean).join(', '), long: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude, tz: x.timezone }));
    } finally { clearTimeout(t); }
  }
  // Returns { el, input, resolve() }. resolve() gives the picked place, null when empty, or 'bad' when nothing matches.
  function cityField(start, onPick) {
    let picked = start || null, timer = 0, seq = 0;
    const input = h('input', { type: 'text', maxlength: '60', placeholder: 'Type a city', autocomplete: 'off', value: start ? start.name : '' });
    const list = h('div', { class: 'choices fl-cities' });
    const pick = (p) => { picked = p; input.value = p.name; list.replaceChildren(); onPick && onPick(p); };
    input.addEventListener('input', () => {
      picked = null; onPick && onPick(null);
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.replaceChildren(); return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const res = await search(q);
          if (my !== seq) return;
          list.replaceChildren(...res.slice(0, 5).map((p) => h('button', { type: 'button', class: 'choice', onclick: () => pick(p) }, h('strong', {}, p.long))));
        } catch (e) { if (my === seq) list.replaceChildren(); }
      }, 350);
    });
    async function resolve() {
      const q = input.value.trim();
      if (!q) return null;
      if (picked && picked.name === q) return picked;
      try { const res = await search(q); if (res[0]) { pick(res[0]); return res[0]; } return 'bad'; }
      catch (e) { return 'offline'; }
    }
    return { el: h('div', { class: 'fl-city' }, input, list), input, resolve, set: (p) => { if (p) pick(p); }, get: () => picked };
  }
  // A first guess from the phone's time zone ("America/Vancouver" → Vancouver, Canada).
  async function guessCity() {
    const tz = deviceZone();
    if (!tz || tz.indexOf('/') < 0) return null;
    const city = tz.split('/').pop().replace(/_/g, ' ');
    try { return (await search(city)).find((p) => p.tz === tz) || null; } catch (e) { return null; }
  }

  /* ---------- the flow ---------- */
  let main = null, back = null, box = null;
  function show(...kids) {
    const next = card(...kids);
    if (box && box.isConnected) box.replaceWith(next); else main.append(next);
    box = next;
    window.scrollTo(0, 0);
  }

  // Step 1: name, your name, where you live → makes the hub.
  function step1() {
    if (location.hash !== '#new') history.replaceState(null, '', '#new');
    const hub = h('input', { type: 'text', maxlength: '40', placeholder: PL.examples.home(), autocomplete: 'off' });
    const you = h('input', { type: 'text', maxlength: '30', placeholder: PL.examples.name(), autocomplete: 'given-name' });
    const hint = h('p', { class: 'hint' }, 'It sets your time and weather.');
    const city = cityField(null, () => { hint.textContent = 'It sets your time and weather.'; });
    guessCity().then((p) => { if (p && !city.input.value.trim()) { city.set(p); hint.textContent = 'We guessed this from your phone. It sets your time and weather.'; } });
    const err = errorBox();
    const next = ui.button('Next', { variant: 'primary', big: true, block: true, type: 'submit' });
    async function go(e) {
      e.preventDefault();
      if (!you.value.trim()) { showErr(err, 'Please type your name.'); you.focus(); return; }
      next.disabled = true; showErr(err, '');
      const place = await city.resolve();
      if (place === 'bad') { showErr(err, 'We could not find that city. Pick one from the list, or leave it empty.'); next.disabled = false; return; }
      const p = place && place !== 'offline' ? place : null;
      try {
        const r = await call(null, 'POST', '/api/families', { yourName: you.value.trim(), familyName: hub.value.trim(), timeZone: (p && p.tz) || deviceZone(), place: p });
        const me = await call(r.token, 'GET', '/api/me');
        await call(r.token, 'PUT', '/api/me/profile', { avatar: ICONS[0] }).catch(() => {});
        KAL.recent.remember(r.token, me.family.name, me.me.name);
        save({ token: r.token, meId: me.me.memberId, hub: me.family.name, tz: (p && p.tz) || deviceZone(), step: 'people' });
        history.replaceState(null, '', '#setup');
        step2();
      } catch (x) { showErr(err, x.userMessage || 'Could not make your hub. Please try again.'); next.disabled = false; }
    }
    show(h('form', { class: 'fl', onsubmit: go },
      ...head(1, 'Let’s set up your hub', 'Takes about a minute.'),
      ui.field('Hub name', hub), ui.field('Your name', you),
      h('div', { class: 'field' }, h('label', {}, 'Where do you live?'), city.el, hint),
      err, next, link('← Back', back)));
  }

  async function members(st) {
    const j = await call(st.token, 'GET', '/api/state');
    return ((j.docs && j.docs.members) || []).map((d) => Object.assign({ id: d.id }, d.data)).filter((m) => !m.demo)
      .sort((a, b) => rank(a, st) - rank(b, st) || a.name.localeCompare(b.name));
  }
  // You first, then partners, kids, everyone else, and pets last.
  const rank = (m, st) => (m.id === st.meId ? 0 : PARTNER.includes(m.relation) ? 1 : m.role === 'child' ? 2 : m.role === 'pet' ? 4 : 3);
  function subFor(m, st) {
    if (m.id === st.meId) return 'You';
    if (m.role === 'pet') return (m.relation ? m.relation + ' · ' : '') + 'Pet';
    const where = m.place ? m.place.name.split(',')[0] + (m.place.tz && m.place.tz !== st.tz ? ' · ' + timeIn(m.place.tz) + ' there' : '') : 'Lives with you';
    return [m.relation, where].filter(Boolean).join(' · ');
  }
  function row(m, st, end, onClick, sub) {
    const kids = [ui.avatar(m, 44), h('div', { class: 'who' }, h('strong', {}, m.name), h('span', { class: 'sub' }, sub || subFor(m, st))), end];
    return onClick ? h('button', { type: 'button', class: 'fl-row fl-tap', onclick: onClick }, ...kids) : h('div', { class: 'fl-row' }, ...kids);
  }
  const tag = (m, st) => (m.id === st.meId ? h('span', { class: 'fl-tag' }, 'Owner') : m.role === 'pet' ? null
    : h('span', { class: 'fl-tag' + (m.access === 'editor' ? '' : ' v') }, m.access === 'editor' ? 'Editor' : 'Viewer'));

  // Step 2: who is in your hub.
  async function step2() {
    const st = load();
    if (!st) return step1();
    st.step = 'people'; save(st);
    let list = [];
    try { list = await members(st); } catch (e) { list = []; }
    show(h('div', { class: 'fl' },
      ...head(2, 'Who’s in your hub?', 'Add the people you want to keep in sync. You can change this later.'),
      h('div', {}, list.map((m) => row(m, st, tag(m, st), m.id === st.meId ? null : () => person(st, list, m)))),
      ui.button('Add a person', { big: true, block: true, icon: 'plus', onClick: () => person(st, list, null) }),
      ui.button('Next', { variant: 'primary', big: true, block: true, onClick: () => step3() })));
  }

  // Add or change one person (or pet).
  function person(st, list, m) {
    const used = new Set(list.map((x) => x.avatar)), usedC = new Set(list.map((x) => x.color));
    let rel = m ? (m.role === 'pet' ? 'Pet' : m.relation || '') : '';
    let kind = m && m.role === 'pet' ? m.relation || '' : '';
    let avatar = m ? m.avatar : (ICONS.find((a) => !used.has(a)) || ICONS[list.length % ICONS.length]);
    let ownPick = !!m;
    const color = m ? m.color : ((PL.config.palette.find((p) => !usedC.has(p.hex)) || PL.config.palette[list.length % PL.config.palette.length]).hex);
    let away = !!(m && m.place);
    let access = m && m.access ? m.access : 'editor';
    let more = REL_MORE.includes(rel);

    const pic = h('button', { type: 'button', class: 'fl-pic', 'aria-label': 'Change the picture' });
    const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Picture', hidden: true });
    const paintPic = () => {
      pic.replaceChildren(ui.avatar({ name: name.value || '?', avatar, color }, 64), h('span', { class: 'hint' }, 'Tap to change'));
      grid.replaceChildren(...ICONS.concat(PETS.map((p) => p[1])).map((a) => h('button', { type: 'button', role: 'radio', class: 'avatar-opt' + (a === avatar ? ' on' : ''), 'aria-checked': a === avatar ? 'true' : 'false', 'aria-label': a,
        onclick: () => { avatar = a; ownPick = true; grid.hidden = true; paintPic(); } }, a)));
    };
    pic.addEventListener('click', () => { grid.hidden = !grid.hidden; });
    const name = h('input', { type: 'text', maxlength: '30', placeholder: 'Their name', autocomplete: 'off', value: m ? m.name : '' });

    const relLabel = h('label', {}, 'Who is this to you?');
    const relBox = h('div', { class: 'chip-row' });
    const paintRel = () => relBox.replaceChildren(...REL_MAIN.concat(more ? REL_MORE : ['More…']).map((r) => h('button', { type: 'button', class: 'person-pick', 'aria-pressed': r === rel ? 'true' : 'false',
      onclick: () => { if (r === 'More…') { more = true; paintRel(); return; } pickRel(r); } }, r)));

    const kindBox = h('div', { class: 'chip-row' });
    const paintKind = () => kindBox.replaceChildren(...PETS.map(([k, e]) => h('button', { type: 'button', class: 'person-pick', 'aria-pressed': k === kind ? 'true' : 'false',
      onclick: () => { kind = k; if (!ownPick) { avatar = e; paintPic(); } paintKind(); } }, e + ' ' + k)));
    const petHint = h('p', { class: 'hint' });
    const paintPetHint = () => { petHint.textContent = 'Pets don’t need a link. You can give them chores, vet visits and a birthday, like “feed ' + (name.value.trim() || 'the dog') + '”.'; };
    const petPart = h('div', { class: 'fl-part' }, h('div', { class: 'field' }, h('label', {}, 'What kind of pet?'), kindBox),
      petHint);

    const whereLabel = h('label', {}, 'Where do they live?');
    const where = ui.segmented([{ value: 'with', label: 'With me' }, { value: 'away', label: 'Somewhere else' }], away ? 'away' : 'with', (v) => { away = v === 'away'; cityPart.hidden = !away; }, 'Where they live');
    const cityHint = h('p', { class: 'hint' });
    const city = cityField(m && m.place ? { name: m.place.name, tz: m.place.tz } : null, (p) => { cityHint.textContent = p && p.tz ? 'It’s ' + timeIn(p.tz) + ' there now.' : ''; });
    if (m && m.place && m.place.tz) cityHint.textContent = 'It’s ' + timeIn(m.place.tz) + ' there now.';
    const cityPart = h('div', { class: 'field' }, h('label', {}, 'City'), city.el, cityHint);
    cityPart.hidden = !away;
    const roleLabelEl = h('label', {}, 'What can they do?');
    const roleHint = h('p', { class: 'hint' });
    const role = ui.segmented([{ value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Viewer' }], access, (v) => { access = v; roleHint.textContent = ROLE_TXT[v]; }, 'What they can do');
    roleHint.textContent = ROLE_TXT[access];
    const personPart = h('div', { class: 'fl-part' }, h('div', { class: 'field' }, whereLabel, where.el), cityPart, h('div', { class: 'field' }, roleLabelEl, role.el, roleHint));

    function pickRel(r) {
      const wasPet = rel === 'Pet';
      rel = r;
      if (!m || !m.access) { access = VIEWER.includes(r) ? 'viewer' : 'editor'; role.set(access); roleHint.textContent = ROLE_TXT[access] + (VIEWER.includes(r) ? ' We picked this for ' + (r === 'Son' || r === 'Daughter' ? 'kids.' : 'grandparents.') : ''); }
      if (r === 'Pet' && !kind) { kind = 'Dog'; if (!ownPick) avatar = '🐶'; }
      if (wasPet && r !== 'Pet' && !ownPick) avatar = ICONS.find((a) => !used.has(a)) || ICONS[0];
      paint();
    }
    function paint() {
      const [p] = pron(rel);
      relLabel.textContent = rel && rel !== 'Pet' && rel !== 'Other' ? 'Who is ' + (p === 'they' ? 'this' : p) + ' to you?' : 'Who is this to you?';
      whereLabel.textContent = 'Where ' + (p === 'they' ? 'do they' : 'does ' + p) + ' live?';
      roleLabelEl.textContent = 'What can ' + p + ' do?';
      petPart.hidden = rel !== 'Pet'; personPart.hidden = rel === 'Pet';
      paintRel(); paintKind(); paintPic(); label(); paintPetHint();
    }
    const err = errorBox();
    const go = ui.button(m ? 'Save' : 'Add person', { variant: 'primary', big: true, icon: m ? null : 'plus', onClick: () => done() });
    const label = () => { go.querySelector('span').textContent = m ? 'Save' : 'Add ' + (name.value.trim() || 'person'); };
    name.addEventListener('input', () => { label(); paintPetHint(); });
    async function done() {
      const nm = name.value.trim();
      if (!nm) { showErr(err, 'Please type a name.'); name.focus(); return; }
      go.disabled = true; showErr(err, '');
      let place = null;
      if (rel !== 'Pet' && away) {
        place = await city.resolve();
        if (place === 'bad') { showErr(err, 'We could not find that city. Pick one from the list.'); go.disabled = false; return; }
        if (place === 'offline') place = { name: city.input.value.trim(), tz: '' };
      }
      const pet = rel === 'Pet';
      const data = PL.models.member({ name: nm, role: roleFor(rel), avatar, color, birthday: m ? m.birthday : '',
        relation: pet ? (kind === 'Other' ? '' : kind) : (rel === 'Other' ? '' : rel), place: place ? { name: place.name, tz: place.tz } : null, access: pet ? '' : access });
      try {
        if (m) await call(st.token, 'PUT', '/api/docs/members/' + encodeURIComponent(m.id), { data });
        else await call(st.token, 'POST', '/api/docs/members', { data });
        s.close(); step2();
      } catch (x) { showErr(err, x.userMessage); go.disabled = false; }
    }
    async function remove() {
      if (!(await ui.confirm({ title: 'Remove ' + m.name + '?', message: m.name + ' will not be in your hub.', confirmLabel: 'Remove', danger: true }))) return;
      try { await call(st.token, 'DELETE', '/api/docs/members/' + encodeURIComponent(m.id)); s.close(); step2(); } catch (x) { ui.toast(x.userMessage); }
    }
    const footer = m ? [ui.button('Remove', { variant: 'danger', icon: 'trash', onClick: remove }), h('span', { class: 'spacer' }), go] : [go];
    const s = ui.sheet({ title: m ? m.name : 'Add a person', body: h('form', { class: 'event-form fl-sheet', onsubmit: (e) => { e.preventDefault(); done(); } },
      pic, grid, ui.field('Name', name), h('div', { class: 'field' }, relLabel, relBox), petPart, personPart, err), footer });
    if (!m) go.classList.add('block');
    paint();
  }

  /* ---------- Step 3: a quick sample with their own names ---------- */
  const weekly = (...wd) => ({ freq: 'weekly', interval: 1, weekdays: wd, end: { type: 'never' } });
  const daily = { freq: 'daily', interval: 1, end: { type: 'never' } };
  function zparts(t, tz) {
    const o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).forEach((x) => { o[x.type] = x.value; });
    return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute);
  }
  // The moment a wall-clock time in one zone happens (for "Sat 7:00 PM · Sun 11:00 AM in Manila").
  function instant(key, hm, tz) {
    const [y, mo, d] = key.split('-').map(Number), [H, M] = hm.split(':').map(Number);
    const want = Date.UTC(y, mo - 1, d, H, M);
    let t = want;
    try { for (let i = 0; i < 3; i++) t += want - zparts(t, tz); } catch (e) { /* unknown zone: leave it */ }
    return new Date(t);
  }
  const wd = (at, tz) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(at);
  function plan(list, st) {
    const today = D.today(), t = (n) => D.addDays(today, n), next = (dow) => D.addDays(today, (dow - D.dow(today) + 7) % 7);
    const me = list.find((m) => m.id === st.meId) || list[0];
    const ppl = list.filter((m) => m.role !== 'pet');
    const kids = ppl.filter((m) => m.role === 'child');
    const kid = kids[0], partner = ppl.find((m) => PARTNER.includes(m.relation));
    const other = partner || ppl.find((m) => m.id !== st.meId && m.role !== 'child') || me;
    const far = ppl.find((m) => m.place && m.place.tz);
    const pet = list.find((m) => m.role === 'pet');
    const ev = (o) => Object.assign({ allDay: false, memberIds: [], repeat: null, reminder: null }, o);
    const events = {}, chores = {}, preview = [];
    events['demo-e01'] = kid ? ev({ title: kid.name + '’s piano lesson', date: next(2), start: '16:00', end: '16:45', memberIds: [kid.id], repeat: weekly(2) })
      : ev({ title: 'Yoga class', date: next(2), start: '18:00', end: '19:00', memberIds: [me.id], repeat: weekly(2) });
    preview.push([kid || me, events['demo-e01'].title, 'Tue · ' + (kid ? '4:00 PM' : '6:00 PM')]);
    if (pet) {
      const who = kid || other;
      chores['demo-c01'] = { title: 'Feed ' + pet.name, date: today, memberIds: [who.id], repeat: daily };
      preview.push([who, who.name + ': feed ' + pet.name, 'Chore · every day']);
      events['demo-e06'] = ev({ title: 'Vet check-up for ' + pet.name, date: t(6), start: '10:00', end: '10:30', memberIds: [pet.id] });
    }
    if (kids.length) chores['demo-c02'] = { title: 'Make your bed', date: today, memberIds: kids.map((k) => k.id), repeat: daily };
    if (!pet && kid) preview.push([kid, kid.name + ': make your bed', 'Chore · every day']);
    if (far) {
      const day = next(6), city = far.place.name.split(',')[0], at = instant(day, '19:00', st.tz);
      events['demo-e02'] = ev({ title: 'Video call with ' + far.name, date: day, start: '19:00', end: '19:30', memberIds: [me.id, far.id], repeat: weekly(6), notes: 'It is ' + wd(at, far.place.tz) + ' ' + timeIn(far.place.tz, at) + ' in ' + city + '.' });
      preview.push([far, 'Video call with ' + far.name, 'Sat 7:00 PM · ' + wd(at, far.place.tz) + ' ' + timeIn(far.place.tz, at) + ' in ' + city]);
    }
    events['demo-e03'] = ev({ title: 'Movie night', date: next(5), start: '19:00', end: '21:00', repeat: weekly(5) });
    if (!far) preview.push([null, 'Movie night', 'Fri · 7:00 PM · everyone']);
    if (kid) events['demo-e04'] = ev({ title: 'Dentist (' + kid.name + ')', date: t(3), start: '14:00', end: '14:45', memberIds: [kid.id], reminder: 60 });
    if (partner) events['demo-e05'] = ev({ title: 'Date night', date: t(2), start: '19:30', end: '22:00', memberIds: [me.id, partner.id] });
    events['demo-e07'] = ev({ title: 'Trash and recycling', date: next(3), allDay: true, repeat: weekly(3) });
    chores['demo-c03'] = { title: 'Buy groceries', date: next(6), memberIds: [other.id], repeat: weekly(6) };
    chores['demo-c04'] = { title: 'Take out the trash', date: next(3), memberIds: [other.id], repeat: weekly(3) };
    preview.push([other, other.name + ': buy groceries', 'List · 6 items']);
    const items = {};
    ['Milk', 'Eggs', 'Bread', 'Rice', 'Bananas', 'Chicken'].forEach((text, i) => { items['demo-i' + (i + 1)] = { listId: 'demo-l1', text, done: false, at: Date.now() - (10 - i) * 1000 }; });
    const meals = {};
    ['Chicken adobo', 'Spaghetti', 'Tacos', 'Soup and bread'].forEach((title, i) => { meals[t(i) + '~dinner'] = { date: t(i), slot: 'dinner', title, recipeId: '' }; });
    return {
      preview: preview.slice(0, 4),
      docs: [['events', events, 'event'], ['chores', chores, 'chore'], ['lists', { 'demo-l1': { title: 'Groceries' } }, 'list'], ['listitems', items, 'listitem'], ['meals', meals, 'meal'],
        ['countdowns', { 'demo-k1': { title: 'Summer holiday', emoji: '🏖️', date: t(45), yearly: false } }, 'countdown']]
    };
  }
  async function step3() {
    const st = load();
    if (!st) return step1();
    st.step = 'sample'; save(st);
    let list = [];
    try { list = await members(st); } catch (e) { list = []; }
    const p = plan(list, st);
    const err = errorBox();
    const yes = ui.button('Yes, show me', { variant: 'primary', big: true, block: true, onClick: async () => {
      yes.disabled = true; showErr(err, '');
      try {
        for (const [col, docs, kind] of p.docs) {
          for (const [id, x] of Object.entries(docs)) await call(st.token, 'PUT', '/api/docs/' + col + '/' + encodeURIComponent(id), { data: PL.models[kind](Object.assign({ demo: true }, x)) });
        }
        doneStep();
      } catch (x) { showErr(err, x.userMessage); yes.disabled = false; }
    } });
    yes.replaceChildren(h('span', {}, 'Yes, show me'), h('span', { class: 'fl-rec' }, 'Recommended'));
    const sub = h('p', { class: 'land-pick-sub' }, 'We’ll add a few example plans with your people’s names, so you can see how it all works. ', h('strong', {}, 'We suggest yes.'), ' You can clear it with one tap anytime.');
    show(h('div', { class: 'fl' }, dots(3), h('span', { class: 'land-kicker' }, 'Step 3 of 3'), h('h2', {}, 'See your hub come alive'), sub,
      ...p.preview.map(([m, title, when]) => h('div', { class: 'fl-ev' }, ui.avatar(m, 36), h('div', { class: 't' }, h('strong', {}, title), h('span', { class: 'sub' }, when)))),
      err, yes, link('No thanks, start empty', () => doneStep()), link('← Back', () => step2())));
  }

  /* ---------- Done: each person's own link ---------- */
  async function doneStep() {
    const st = load();
    if (!st) return step1();
    st.step = 'done'; save(st);
    let list = [];
    try { list = await members(st); } catch (e) { list = []; }
    const ppl = list.filter((m) => m.id !== st.meId && m.role !== 'pet');
    async function copyFor(m) {
      try {
        const r = await call(st.token, 'POST', '/api/invites/member', { memberId: m.id, role: m.access || 'viewer' });
        const url = location.origin + '/join/' + r.code;
        try { await navigator.clipboard.writeText(url); ui.toast(m.name + '’s link copied.'); }
        catch (e) {
          const s = ui.sheet({ title: m.name + '’s link', body: h('div', { class: 'event-form' }, h('p', {}, 'Copy this link and send it to ' + m.name + '.'),
            h('input', { type: 'text', readonly: true, value: url, class: 'link-input', 'aria-label': 'Link', onfocus: (ev) => ev.target.select() })),
          footer: [ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() })] });
        }
      } catch (x) { ui.toast(x.userMessage); }
    }
    const open = ui.button('Open my hub', { variant: 'primary', big: true, block: true, onClick: () => {
      try { localStorage.setItem('kal.newlink', '1'); } catch (e) { /* fine */ }
      save(null);
      location.href = '/c/' + st.token;
    } });
    show(h('div', { class: 'fl' }, dots(3), h('span', { class: 'land-kicker' }, 'All set'), h('h2', {}, 'Your hub is ready! 🎉'),
      h('p', { class: 'land-pick-sub' }, ppl.length ? 'Copy each person’s link and send it to them. No sign-up needed.' : 'You can add people anytime in People.'),
      ppl.length ? h('div', {}, ppl.map((m) => row(m, st, ui.button('Copy link', { icon: 'copy', onClick: () => copyFor(m) }), null, [m.relation, m.access === 'editor' ? 'Editor' : 'Viewer'].filter(Boolean).join(' · ')))) : null,
      ppl.length ? h('p', { class: 'hint fl-note' }, 'You can find everyone’s own link anytime in ', h('strong', {}, 'People'), '.') : null,
      open));
  }

  PL.setup = {
    mount(m, opts) {
      main = m; back = opts.back; box = null;
      const st = load();
      if (location.hash === '#setup' && st && st.token) {
        if (st.step === 'sample') step3(); else if (st.step === 'done') doneStep(); else step2();
      } else step1();
    }
  };
})();
