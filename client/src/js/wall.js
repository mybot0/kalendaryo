/*
 * wall.js — Wall mode: a full-screen family board for a tablet, TV or old screen on the wall.
 *
 *   ┌ big clock ─────────────────────────────── greeting ┐
 *   │ Today            │  the panels you choose            │
 *   │ ── Coming up ──  │  (Chores, Meals, Weather …)       │
 *   └──────────────────┴───────────────────────────────────┘
 *
 * "Today and coming up" is one box, always on the left: it is the first thing you read.
 * The other panels share the space to its right and are always sized to fit one screen
 * (a phone is too small for that, so there the board is one column that scrolls).
 *
 * Kids can tick their own chores on the wall: they tap their name in the Chores panel,
 * get a big, simple screen of today's chores and routine steps, and a small celebration
 * when everything is done. Ticking never needs the parent PIN; changing chores still does.
 *
 *   PL.wall.open('wall' | 'photos')   PL.wall.card() for Settings   PL.wall.openOptions()
 * Choices are saved on this device, so each screen in the house can show different panels.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;

  // The panels. `on` = shown by default. "agenda" is the left box.
  const PANELS = [
    { id: 'agenda', label: 'Today and coming up', on: true },
    { id: 'chores', label: 'Chores', on: true, tall: true },
    { id: 'weather', label: 'Weather', on: true },
    { id: 'meals', label: 'Meals', on: true },
    { id: 'countdowns', label: 'Countdowns', on: true },
    { id: 'photos', label: 'Photos', on: true, tall: true },
    { id: 'week', label: 'This week', on: false, wide: true },
    { id: 'shopping', label: 'Shopping list', on: false },
    { id: 'family', label: 'People', on: false }
  ];
  const PHOTO_MODES = [{ value: 'tile', label: 'In a panel' }, { value: 'background', label: 'Background' }, { value: 'off', label: 'Off' }];
  const KID_IDLE_MS = 20000, CHEER_MS = 6000;

  function settings() {
    const saved = (PL.state.device && PL.state.device.wall) || {};
    const sp = saved.panels || {};
    const panels = {};
    PANELS.forEach((p) => { panels[p.id] = typeof sp[p.id] === 'boolean' ? sp[p.id] : p.on; });
    // Older choices had "Today" and "Coming up" as two panels.
    if (typeof sp.agenda !== 'boolean' && sp.today === false && sp.upcoming === false) panels.agenda = false;
    return { panels, photo: PHOTO_MODES.some((m) => m.value === saved.photo) ? saved.photo : 'tile', layout: cleanLayout(saved.layout) };
  }
  function save(patch) {
    const cur = settings();
    PL.store.setDevice({ wall: { panels: Object.assign({}, cur.panels, patch.panels || {}), photo: patch.photo || cur.photo, layout: patch.layout !== undefined ? patch.layout : cur.layout } });
  }

  /* ---------- your own layout (Arrange) ----------
   * The board is a grid of cells: 12 x 8 on a wide screen, 8 x 12 on a tall one. Each card has a
   * box { x, y, w, h } in cells. When you drop a card, it takes exactly that spot; the cards it
   * covers move into the space it left (or other free space) and resize to fit. Nothing overlaps
   * and the board always fits the screen. A screen remembers one layout per shape:
   *   layout[shape] = { boxes: { id: { x, y, w, h } } }
   */
  const GRIDS = { land: { c: 12, r: 8 }, port: { c: 8, r: 12 } };
  const MIN = 2; // the smallest a card can be: 2 x 2 cells
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = (b, g) => b.x >= 0 && b.y >= 0 && b.w >= 1 && b.h >= 1 && b.x + b.w <= g.c && b.y + b.h <= g.r;
  const sameBox = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  function occupancy(boxes, g) {
    const occ = Array.from({ length: g.r }, () => Array(g.c).fill(null));
    Object.keys(boxes).forEach((id) => { const b = boxes[id]; for (let i = 0; i < b.h; i++) for (let j = 0; j < b.w; j++) if (occ[b.y + i] && b.x + j < g.c) occ[b.y + i][b.x + j] = id; });
    return occ;
  }
  const freeIn = (occ, b) => { for (let i = 0; i < b.h; i++) for (let j = 0; j < b.w; j++) if (occ[b.y + i][b.x + j]) return false; return true; };
  const mark = (occ, b, id) => { for (let i = 0; i < b.h; i++) for (let j = 0; j < b.w; j++) occ[b.y + i][b.x + j] = id; };

  // Older layouts kept an order and sizes: pack them in order to get boxes.
  function packOrder(order, size, g) {
    const occ = Array.from({ length: g.r }, () => Array(g.c).fill(null));
    const pos = {};
    order.forEach((id) => {
      const z = size[id]; if (!z) return;
      for (let y = 0; y + z.h <= g.r; y++) for (let x = 0; x + z.w <= g.c; x++) {
        const b = { x, y, w: z.w, h: z.h };
        if (freeIn(occ, b)) { mark(occ, b, id); pos[id] = b; return; }
      }
    });
    return pos;
  }
  function cleanLayout(l) {
    const out = {};
    if (!l || typeof l !== 'object') return out;
    const known = new Set(PANELS.map((p) => p.id));
    Object.keys(GRIDS).forEach((o) => {
      const g = GRIDS[o], src = l[o];
      if (!src || typeof src !== 'object') return;
      let raw = {};
      if (src.boxes && typeof src.boxes === 'object') raw = src.boxes;
      else if (Array.isArray(src.order)) {
        const size = {};
        src.order.forEach((id) => { const z = src.size && src.size[id]; if (z) size[id] = { w: z.w | 0, h: z.h | 0 }; });
        raw = packOrder(src.order.filter((id) => known.has(id)), size, g);
      } else raw = src; // the first version: one box per card
      const boxes = {};
      Object.keys(raw).forEach((id) => {
        const b = raw[id];
        if (!known.has(id) || !b || typeof b !== 'object') return;
        const box = { x: b.x | 0, y: b.y | 0, w: b.w | 0, h: b.h | 0 };
        if (inside(box, g) && Object.keys(boxes).every((k) => !overlaps(box, boxes[k]))) boxes[id] = box;
      });
      out[o] = { boxes };
    });
    return out;
  }
  // The biggest free spot for a card that was just turned on.
  function findSpot(occ, g) {
    for (const [w, hh] of [[4, 3], [3, 3], [4, 2], [3, 2], [2, 3], [2, 2]]) {
      for (let y = 0; y + hh <= g.r; y++) for (let x = 0; x + w <= g.c; x++) { const b = { x, y, w, h: hh }; if (freeIn(occ, b)) return b; }
    }
    return null;
  }
  // The best free spot for a card that has to move: as big as it was if possible, else as big as fits.
  // Among spots of that size, prefer ones inside the space the moved card left, then snug against
  // edges and other cards (so the next card still has room), then close to where it was.
  function bestSpot(occ, g, want, near) {
    const sizes = [];
    for (let w = Math.min(want.w, g.c); w >= MIN; w--) for (let hh = Math.min(want.h, g.r); hh >= MIN; hh--) sizes.push({ w, h: hh });
    sizes.sort((a, b) => (b.w * b.h - a.w * a.h) || (Math.abs(a.w / a.h - want.w / want.h) - Math.abs(b.w / b.h - want.w / want.h)));
    const cx = want.x + want.w / 2, cy = want.y + want.h / 2;
    const solid = (x, y) => x < 0 || y < 0 || x >= g.c || y >= g.r || !!occ[y][x];
    let best = null;
    for (const z of sizes) {
      if (best && z.w * z.h < best.area) break;
      for (let y = 0; y + z.h <= g.r; y++) for (let x = 0; x + z.w <= g.c; x++) {
        const b = { x, y, w: z.w, h: z.h };
        if (!freeIn(occ, b)) continue;
        let inNear = 0;
        for (let i = 0; i < z.h; i++) for (let j = 0; j < z.w; j++) if (x + j >= near.x && x + j < near.x + near.w && y + i >= near.y && y + i < near.y + near.h) inNear++;
        let contact = 0;
        for (let j = 0; j < z.w; j++) { if (solid(x + j, y - 1)) contact++; if (solid(x + j, y + z.h)) contact++; }
        for (let i = 0; i < z.h; i++) { if (solid(x - 1, y + i)) contact++; if (solid(x + z.w, y + i)) contact++; }
        const d = Math.abs(x + z.w / 2 - cx) + Math.abs(y + z.h / 2 - cy);
        const score = inNear * 3 + contact * 2 - d * 0.25;
        if (!best || z.w * z.h > best.area || score > best.score) best = { box: b, area: z.w * z.h, score };
      }
    }
    return best && best.box;
  }
  // Put card `id` at `target`. Cards it covers move into free space (first where it came from) and
  // shrink if they must. Returns { ok, boxes, covered, failed }.
  function takeSpot(boxes, id, target, g) {
    const from = boxes[id];
    const base = {};
    Object.keys(boxes).forEach((k) => { if (k !== id) base[k] = Object.assign({}, boxes[k]); });
    const covered = Object.keys(base).filter((k) => overlaps(base[k], target));
    covered.forEach((k) => delete base[k]);
    base[id] = Object.assign({}, target);
    // Try the covered cards in every order (there are only a few) and keep the plan that
    // keeps them biggest; ties go to the plan that keeps them closest to where they were.
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map((r) => [x].concat(r))));
    const orders = covered.length <= 5 ? perms(covered) : [covered.slice().sort((a, b) => boxes[b].w * boxes[b].h - boxes[a].w * boxes[a].h)];
    let best = null;
    for (const order of orders) {
      const next = Object.assign({}, base);
      const occ = occupancy(next, g);
      const failed = [];
      let area = 0, dist = 0;
      order.forEach((k) => {
        const spot = bestSpot(occ, g, boxes[k], from || target);
        if (!spot) { failed.push(k); return; }
        next[k] = spot; mark(occ, spot, k);
        area += spot.w * spot.h;
        dist += Math.abs(spot.x - boxes[k].x) + Math.abs(spot.y - boxes[k].y);
      });
      const score = { ok: !failed.length, area, dist };
      if (!best || (score.ok && !best.ok) || (score.ok === best.ok && (area > best.area || (area === best.area && dist < best.dist)))) best = Object.assign(score, { boxes: next, failed });
      if (best.ok && best.area === covered.reduce((a, k) => a + boxes[k].w * boxes[k].h, 0)) break; // nobody had to shrink
    }
    return { ok: best ? best.ok : true, boxes: best ? best.boxes : base, covered, failed: best ? best.failed : [] };
  }
  // After a drop, close the gaps the move made: cards next to a newly empty space grow into it.
  // Space that was already empty before the move is left alone.
  function fillGaps(before, after, g, skip) {
    const was = occupancy(before, g), now = occupancy(after, g);
    const fresh = (x, y) => !!was[y][x] && !now[y][x];
    const boxes = {};
    Object.keys(after).forEach((k) => { boxes[k] = Object.assign({}, after[k]); });
    for (let pass = 0; pass < 40; pass++) {
      let grew = false;
      for (const k of Object.keys(boxes).sort((a, b) => (a === skip) - (b === skip))) {
        const b = boxes[k];
        const tries = [
          { dx: 0, dy: 0, dw: 0, dh: 1, strip: () => Array.from({ length: b.w }, (_, j) => [b.x + j, b.y + b.h]) },
          { dx: 0, dy: -1, dw: 0, dh: 1, strip: () => Array.from({ length: b.w }, (_, j) => [b.x + j, b.y - 1]) },
          { dx: 0, dy: 0, dw: 1, dh: 0, strip: () => Array.from({ length: b.h }, (_, i) => [b.x + b.w, b.y + i]) },
          { dx: -1, dy: 0, dw: 1, dh: 0, strip: () => Array.from({ length: b.h }, (_, i) => [b.x - 1, b.y + i]) }
        ];
        for (const t of tries) {
          const cells = t.strip();
          if (!cells.every(([x, y]) => x >= 0 && y >= 0 && x < g.c && y < g.r && fresh(x, y) && !now[y][x])) continue;
          cells.forEach(([x, y]) => { now[y][x] = k; });
          b.x += t.dx; b.y += t.dy; b.w += t.dw; b.h += t.dh;
          grew = true; break;
        }
      }
      if (!grew) break;
    }
    return boxes;
  }

  /* ---------- the choices (used in Settings and inside wall mode) ---------- */
  function optionsBody() {
    const s = settings();
    const toggles = h('div', { class: 'wall-toggles' }, PANELS.map((p) => ui.toggle(p.label, s.panels[p.id], (v) => save({ panels: { [p.id]: v } })).el));
    const photo = ui.segmented(PHOTO_MODES, s.photo, (v) => save({ photo: v }), 'Photos on the wall');
    return h('div', { class: 'stack' },
      h('h3', { class: 'mini-h' }, 'Show on the wall'), toggles,
      ui.field('Photos', photo.el),
      h('p', { class: 'hint' }, 'Today and coming up always sits on the left. Everything is sized to fit one screen: the more you turn on, the smaller each part gets. These choices are saved on this device only.'));
  }
  function openOptions() {
    const s = ui.sheet({ title: 'Choose what shows', body: optionsBody(), footer: [ui.button('Done', { variant: 'primary', big: true, onClick: () => s.close() })] });
  }

  /* ---------- people, chores and stars for today ---------- */
  const starsOn = () => PL.stars && PL.stars.starsOn();
  const val = (x) => (x.stars == null ? 1 : x.stars);
  function todayFor(memberId) {
    const today = D.today();
    const chores = PL.chores.instances(today, today).filter((i) => (i.memberId || null) === memberId);
    const routines = PL.routines.forDay(today).filter((r) => (r.memberId || null) === memberId);
    return { chores, routines };
  }
  function tally(t) {
    const total = t.chores.length + t.routines.reduce((a, r) => a + r.total, 0);
    const done = t.chores.filter((c) => c.done).length + t.routines.reduce((a, r) => a + r.done, 0);
    return { done, total };
  }
  function starsToday(t) {
    return t.chores.filter((c) => c.done).reduce((a, c) => a + val(c.chore), 0) + t.routines.filter((r) => r.complete).reduce((a, r) => a + val(r.routine), 0);
  }
  // Everyone with something to do today: children first (big buttons), then the rest, then "anyone".
  function peopleToday() {
    const out = [];
    PL.state.members.forEach((m) => { const t = todayFor(m.id); if (t.chores.length || t.routines.length) out.push({ member: m, t }); });
    const anyone = todayFor(null);
    const kids = out.filter((x) => x.member.role === 'child');
    const big = kids.length ? kids : out;
    const small = out.filter((x) => !big.includes(x));
    if (anyone.chores.length || anyone.routines.length) small.push({ member: null, t: anyone });
    return { big, small };
  }
  const nameOf = (m) => (m ? m.name : 'Anyone');
  const tint = (m) => 'color-mix(in srgb, ' + (m ? m.color : PL.config.neutralColor) + ' 30%, #fff)';
  const countText = (p) => (p.total && p.done === p.total ? 'All done' : p.done + ' of ' + p.total + ' done');

  /* ---------- panels ---------- */
  function agendaPanel() {
    const today = D.today();
    const items = PL.cal.instances(today, today);
    const later = PL.cal.instances(D.addDays(today, 1), D.addDays(today, 30)).slice(0, 14);
    const who = (i) => { const ps = PL.cal.people(i); return ps.length ? ps.map((p) => p.name).join(', ') : ''; };
    const when = (i) => (i.allDay ? 'All day' : D.fmtTime(i.start, PL.state.settings.hour12 !== false));
    return h('div', { class: 'ag' },
      h('div', { class: 'ag-head' }, h('h2', {}, 'Today'), items.length ? h('span', { class: 'ag-count' }, items.length + (items.length === 1 ? ' thing' : ' things')) : ''),
      items.length
        ? h('div', { class: 'ag-today' }, items.map((i) => h('div', { class: 'ag-ev', style: '--c:' + PL.cal.color(i) },
            h('span', { class: 'ag-bar', 'aria-hidden': 'true' }),
            h('span', { class: 'ag-main' }, h('span', { class: 'ag-meta' }, when(i) + (who(i) ? ' · ' + who(i) : '')), h('span', { class: 'ag-title' }, i.title)))))
        : h('p', { class: 'wall-quiet' }, 'Nothing planned today.'),
      h('div', { class: 'ag-sep', role: 'separator' }, h('h3', {}, 'Coming up'), h('span', { class: 'ag-line', 'aria-hidden': 'true' })),
      later.length
        ? h('div', { class: 'ag-later' }, later.map((i) => h('div', { class: 'ag-row', style: '--c:' + PL.cal.color(i) },
            h('span', { class: 'ag-date' }, h('b', {}, String(D.parse(i.date).getDate())), D.fmt(i.date, { weekday: 'short' })),
            h('span', { class: 'ag-bar', 'aria-hidden': 'true' }),
            h('span', { class: 'ag-main' }, h('span', { class: 'ag-title' }, i.title), h('span', { class: 'ag-meta' }, when(i))))))
        : h('p', { class: 'wall-quiet' }, 'Nothing else on the calendar yet.'));
  }

  function choresPanel(openKid) {
    const { big, small } = peopleToday();
    if (!big.length && !small.length) return h('p', { class: 'wall-quiet' }, 'No chores today.');
    const star = (m) => (starsOn() && m ? h('span', { class: 'star-chip wch-star' }, icon('star'), String(Math.max(0, PL.stars.balance(m.id)))) : null);
    return h('div', { class: 'wch' },
      big.length ? h('p', { class: 'wch-hint' }, 'Tap your name') : '',
      big.map(({ member, t }) => {
        const p = tally(t);
        return h('button', { type: 'button', class: 'wch-kid', style: '--c:' + member.color + ';--t:' + tint(member), onclick: () => openKid(member ? member.id : null),
          'aria-label': member.name + ', ' + countText(p) + (starsOn() ? ', ' + Math.max(0, PL.stars.balance(member.id)) + ' stars' : '') + '. Open ' + member.name + '’s chores' },
          ui.avatar(member, 64),
          h('span', { class: 'wch-mid' },
            h('span', { class: 'wch-top' }, h('span', { class: 'wch-name' }, member.name), star(member)),
            h('span', { class: 'cg-bar', 'aria-hidden': 'true' }, h('i', { style: '--p:' + (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%' })),
            h('span', { class: 'wch-count' + (p.done === p.total ? ' all' : '') }, countText(p))),
          icon('right'));
      }),
      small.length ? h('div', { class: 'wch-small' }, small.map(({ member, t }) => {
        const p = tally(t);
        return h('button', { type: 'button', class: 'wch-row', onclick: () => openKid(member ? member.id : null), 'aria-label': nameOf(member) + ', ' + countText(p) },
          h('span', {}, nameOf(member)), h('span', { class: 'wch-count' + (p.done === p.total ? ' all' : '') }, countText(p)));
      })) : '');
  }

  function shoppingPanel() {
    const lists = PL.state.lists || [];
    const list = lists.find((l) => /grocer|shopping/i.test(l.title)) || lists[0];
    if (!list) return h('p', { class: 'sub' }, 'No lists yet.');
    const items = (PL.state.listitems || []).filter((i) => i.listId === list.id && !i.done).sort((a, b) => a.at - b.at);
    return h('div', { class: 'stack wall-list' }, h('p', { class: 'sub' }, list.title),
      items.length ? h('ul', { class: 'wall-items' }, items.map((i) => h('li', {}, i.text))) : h('p', {}, 'Nothing to buy.'));
  }
  function render(id) {
    const reg = PL.widgetRegistry || {};
    if (id === 'shopping') return shoppingPanel();
    if (reg[id]) return reg[id].render();
    return h('p', { class: 'sub' }, '');
  }

  /* ---------- photo layers (a panel or the background) ---------- */
  function photoLayers(cls) {
    const a = h('div', { class: cls }), b = h('div', { class: cls });
    let idx = 0, layer = 0;
    const el = [a, b];
    function next() {
      const ps = PL.photos.list();
      if (!ps.length) { el.forEach((x) => x.classList.remove('on')); return false; }
      const p = ps[idx % ps.length]; idx++;
      layer = 1 - layer;
      el[layer].style.backgroundImage = 'url("' + PL.photos.url(p) + '")';
      el[layer].dataset.credit = p.credit ? 'Photo: ' + p.credit + ' / Unsplash' : '';
      el[layer].classList.add('on'); el[1 - layer].classList.remove('on');
      return true;
    }
    return { el, next };
  }

  /* ---------- the kid screen: tick today's chores and routine steps ---------- */
  function kidScreen(host) {
    let memberId = null, open = false, cheer = false, idleT = null, cheerT = null;
    const localChore = new Map();   // chore instance id -> done (what the child just tapped)
    const localSteps = new Map();   // routine instance id -> Set of done step ids
    const el = h('div', { class: 'wall-kid', role: 'dialog', 'aria-modal': 'true', hidden: true });
    el.addEventListener('pointerdown', () => armIdle());

    const member = () => (memberId ? PL.store.member(memberId) : null);
    function armIdle() { clearTimeout(idleT); if (open && !cheer) idleT = setTimeout(close, KID_IDLE_MS); }
    function show(id) {
      memberId = id; open = true; cheer = false; localChore.clear(); localSteps.clear();
      el.hidden = false; paint(); armIdle();
      const first = el.querySelector('.kid-check, .kid-back'); if (first) first.focus();
    }
    function close() {
      open = false; cheer = false; clearTimeout(idleT); clearTimeout(cheerT);
      el.hidden = true; el.replaceChildren(); host.focusBoard();
    }

    // Today's list as the child sees it: saved ticks, overlaid with taps not saved yet.
    function view() {
      const t = todayFor(memberId);
      const chores = t.chores.map((c) => Object.assign({}, c, { done: localChore.has(c.id) ? localChore.get(c.id) : c.done }));
      const routines = t.routines.map((r) => {
        const ids = localSteps.get(r.id) || new Set(r.doneIds);
        return Object.assign({}, r, { doneIds: [...ids], done: ids.size, complete: ids.size === r.total });
      });
      return { chores, routines };
    }

    async function tapChore(c) {
      const next = !c.done;
      localChore.set(c.id, next);
      paint(); maybeCheer();
      const ok = await PL.chores.toggle(Object.assign({}, c, { done: !next }));
      if (!ok) { localChore.delete(c.id); paint(); }
    }
    async function tapStep(r, stepId) {
      const ids = new Set(localSteps.get(r.id) || r.doneIds);
      ids.has(stepId) ? ids.delete(stepId) : ids.add(stepId);
      localSteps.set(r.id, ids);
      paint(); maybeCheer();
      const path = 'rlogs/' + r.id;
      const ok = ids.size
        ? await PL.store.setDoc(path, PL.models.rlog({ routineId: r.routine.id, date: r.date, memberId: r.memberId || '', done: [...ids], by: PL.state.uid }))
        : await PL.store.deleteDoc(path);
      if (!ok) { localSteps.delete(r.id); paint(); }
    }
    function maybeCheer() {
      const p = tally(view());
      if (p.total && p.done === p.total && !cheer) { cheer = true; clearTimeout(idleT); setTimeout(paint, 450); cheerT = setTimeout(close, CHEER_MS); }
    }

    const check = (on, label, onTap, big) => h('button', { type: 'button', class: 'kid-check' + (big ? ' big' : ''), 'aria-pressed': on ? 'true' : 'false', 'aria-label': label + (on ? ', done' : ', not done yet'), onclick: onTap }, icon('check'));

    function paintList() {
      const m = member(), v = view(), p = tally(v);
      const name = nameOf(m);
      const bal = starsOn() && m ? Math.max(0, PL.stars.balance(m.id)) : null;
      const chores = v.chores.length ? h('section', { class: 'kid-card', 'aria-label': 'Chores' }, h('h2', {}, 'Chores'),
        v.chores.map((c) => h('div', { class: 'kid-row' + (c.done ? ' done' : '') },
          check(c.done, c.title, () => tapChore(c), true), h('span', { class: 'kid-text' }, c.title),
          starsOn() && m && val(c.chore) > 0 ? h('span', { class: 'star-chip' }, '+' + val(c.chore), icon('star')) : null))) : null;
      const routines = v.routines.map((r) => h('section', { class: 'kid-card', 'aria-label': r.routine.title },
        h('div', { class: 'kid-card-head' }, h('h2', {}, r.routine.title),
          starsOn() && m && val(r.routine) > 0 ? h('span', { class: 'kid-bonus' }, '+' + val(r.routine) + (val(r.routine) === 1 ? ' star' : ' stars') + ' when all done') : null),
        r.routine.steps.map((s) => { const on = r.doneIds.includes(s.id); return h('div', { class: 'kid-row' + (on ? ' done' : '') }, check(on, s.text, () => tapStep(r, s.id)), h('span', { class: 'kid-text' }, s.text)); })));
      el.setAttribute('aria-label', name + '’s chores');
      el.style.setProperty('--t', tint(m)); el.style.setProperty('--c', m ? m.color : PL.config.neutralColor);
      el.replaceChildren(
        h('header', { class: 'kid-head' }, ui.avatar(m, 88),
          h('div', { class: 'kid-titles' }, h('h1', {}, m ? name + '’s chores today' : 'Chores for anyone'), h('p', {}, 'Tap the circle when you finish one.')),
          bal != null ? h('span', { class: 'kid-stars', 'aria-label': bal + ' stars' }, icon('star'), String(bal)) : null,
          h('button', { type: 'button', class: 'btn big kid-back', onclick: close }, icon('left'), h('span', {}, 'Back to the board'))),
        h('div', { class: 'kid-progress' }, h('span', { class: 'cg-bar', 'aria-hidden': 'true' }, h('i', { style: '--p:' + (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%' })),
          h('span', { class: 'kid-count', role: 'status' }, p.total && p.done === p.total ? 'All done! Great job' + (m ? ', ' + name : '') + '!' : p.done + ' of ' + p.total + ' done')),
        h('div', { class: 'kid-cols' + (chores && routines.length ? ' two' : '') }, chores, routines.length ? h('div', { class: 'kid-stack' }, routines) : null),
        h('footer', { class: 'kid-foot' }, h('p', {}, 'Goes back to the board by itself after 20 seconds without a tap.'),
          h('button', { type: 'button', class: 'btn primary big kid-done', onclick: () => { if (p.total && p.done === p.total && m) { cheer = true; clearTimeout(idleT); paint(); cheerT = setTimeout(close, CHEER_MS); } else close(); } }, icon('check'), h('span', {}, 'I’m done'))));
    }

    function paintCheer() {
      const m = member();
      const name = nameOf(m);
      const kids = [];
      if (starsOn() && m) {
        const bal = Math.max(0, PL.stars.balance(m.id));
        const today = starsToday(todayFor(m.id));
        const rewards = (PL.state.rewards || []).slice().sort((a, b) => a.cost - b.cost);
        const can = rewards.filter((r) => r.cost <= bal).pop();
        const next = rewards.find((r) => r.cost > bal);
        kids.push(h('p', { class: 'cheer-sub' }, today ? 'You earned ' + today + (today === 1 ? ' star' : ' stars') + ' today.' : 'Everything is ticked off.'),
          h('div', { class: 'cheer-tiles' },
            h('div', { class: 'cheer-tile' }, h('span', {}, 'Your stars'), h('b', { class: 'kid-stars' }, icon('star'), String(bal))),
            can ? h('div', { class: 'cheer-tile' }, h('span', {}, 'You can get'), h('b', {}, (can.emoji ? can.emoji + ' ' : '') + can.title), h('span', { class: 'cheer-note' }, can.cost + ' stars · ask a parent'))
              : next ? h('div', { class: 'cheer-tile' }, h('span', {}, 'Next reward'), h('b', {}, (next.emoji ? next.emoji + ' ' : '') + next.title), h('span', { class: 'cheer-note' }, (next.cost - bal) + ' more stars')) : null));
      } else kids.push(h('p', { class: 'cheer-sub' }, 'Everything is ticked off.'));
      el.setAttribute('aria-label', 'All done');
      el.replaceChildren(h('div', { class: 'cheer' },
        h('div', { class: 'cheer-confetti', 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) => h('i', { style: '--i:' + i }))),
        h('div', { class: 'cheer-star', 'aria-hidden': 'true' }, icon('star')),
        h('h1', {}, 'All done' + (m ? ', ' + name : '') + '!'), ...kids,
        h('button', { type: 'button', class: 'btn primary big', onclick: close }, h('span', {}, 'Back to the board')),
        h('p', { class: 'cheer-note' }, 'Goes back by itself in a few seconds.')));
      const b = el.querySelector('.cheer .btn'); if (b) b.focus();
    }

    function paint() {
      if (!open) return;
      // Keep the finger's place: after a redraw, focus the same button again.
      const a = document.activeElement;
      const idx = a && el.contains(a) ? [...el.querySelectorAll('button')].indexOf(a) : -1;
      cheer ? paintCheer() : paintList();
      if (idx >= 0 && !cheer) { const b = el.querySelectorAll('button')[idx]; if (b) b.focus({ preventScroll: true }); }
    }
    return { el, show, close, paint, isOpen: () => open };
  }

  /* ---------- the board ---------- */
  function open(mode) {
    let curMode = mode === 'photos' ? 'photos' : 'wall', timers = [], lock = null, idleT = null, renderT = null;
    const bg = photoLayers('wall-bg');
    const tile = photoLayers('wall-photo-img');
    const tileEl = h('section', { class: 'wall-panel wall-photo', 'aria-label': 'Photos' }, tile.el, h('p', { class: 'wall-photo-empty sub' }, 'Add photos in the Photos tab.'));
    const timeEl = h('div', { class: 'wall-time' }), dateEl = h('div', { class: 'wall-date' }), greetEl = h('div', { class: 'wall-greet' });
    const agendaEl = h('section', { class: 'wall-panel wall-agenda', 'aria-label': 'Today and coming up' });
    const grid = h('div', { class: 'wall-grid' });
    const freeEl = h('div', { class: 'wall-free' });
    const main = h('div', { class: 'wall-main' }, agendaEl, grid);
    let arranging = false, draft = null, draftShape = null, history = [];
    const live = h('p', { class: 'arr-live', role: 'status', 'aria-live': 'polite' });
    const HINT = 'Drag a card where you want it. Cards it covers move into its old space. Drag any edge to resize.';
    const arrHint = h('span', { class: 'arr-hint' }, HINT);
    const arrBtn = ui.button('Arrange', { icon: 'move', aria: 'Arrange the board', onClick: () => startArrange() });
    const roomBtn = ui.button('', { icon: 'move', onClick: () => startArrange() });
    roomBtn.classList.add('wall-room'); roomBtn.hidden = true;
    const modeBtn = ui.button('Photos only', { icon: 'image', onClick: () => { curMode = curMode === 'wall' ? 'photos' : 'wall'; kid.close(); paint(); nextPhotoIfBlank(); } });
    const optBtn = ui.button('Choose what shows', { icon: 'settings', aria: 'Choose what shows', onClick: openOptions });
    const closeBtn = ui.button('Close', { icon: 'x', aria: 'Close', onClick: close });
    const bar = h('div', { class: 'wall-bar' }, arrBtn, optBtn, modeBtn, PL.theme.button('btn theme-wall'), closeBtn);
    const undoBtn = ui.button('Undo', { icon: 'left', onClick: () => undoArrange() });
    const arrBar = h('div', { class: 'wall-bar arr-bar' }, arrHint, undoBtn,
      ui.button('Reset to automatic', { icon: 'repeat', onClick: () => resetArrange() }),
      ui.button('Done', { variant: 'primary', icon: 'check', onClick: () => finishArrange() }));
    arrBar.hidden = true;
    const top = h('header', { class: 'wall-top' }, h('div', { class: 'wall-clock' }, timeEl, dateEl), PL.sky ? PL.sky.el() : null, h('div', { class: 'wall-top-right' }, roomBtn, greetEl));
    const root = h('div', { class: 'wall board', role: 'dialog', 'aria-label': 'Wall mode', tabindex: '-1' }, bg.el, h('div', { class: 'wall-veil' }), bar, arrBar, top, main, live);
    const kid = kidScreen({ focusBoard: () => { try { root.focus({ preventScroll: true }); } catch (e) { /* fine */ } } });
    root.append(kid.el);

    function tick() {
      const now = PL.now();
      PL.clock.fill(timeEl, now, PL.state.settings.hour12);
      dateEl.textContent = D.fmt(D.key(now), { weekday: 'long', month: 'long', day: 'numeric' });
      const hr = now.getHours();
      greetEl.textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (PL.state.settings.householdName ? ', ' + PL.state.settings.householdName : '');
    }

    // How many columns and rows, so every panel fits next to the left box, and where each goes.
    // Panels are placed in order; spare cells let "tall" panels grow down and "wide" ones grow right,
    // and any cell still empty is filled by stretching a neighbour, so there are never gaps.
    function layout(list, W, H) {
      const n = list.length, landscape = W >= H * 0.9;
      let cols;
      if (landscape) cols = n <= 2 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
      else cols = n <= 3 ? 1 : n <= 8 ? 2 : 3;
      if (W < 640 && cols > 2) cols = 2;
      if (W < 420) cols = 1;
      cols = Math.max(1, Math.min(cols, n || 1));
      const rows = Math.max(1, Math.ceil(n / cols));
      let free = rows * cols - n;
      const occ = Array.from({ length: rows }, () => Array(cols).fill(null));
      const place = {};
      list.forEach((p) => {
        let r = -1, c = -1;
        outer: for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (!occ[rr][cc]) { r = rr; c = cc; break outer; }
        if (r < 0) return;
        let rs = 1, cs = 1;
        if (p.tall && free > 0 && r + 1 < rows && !occ[r + 1][c]) { rs = 2; free--; }
        else if (p.wide && free > 0 && c + 1 < cols && !occ[r][c + 1]) { cs = 2; free--; }
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) occ[r + i][c + j] = p.id;
        place[p.id] = { r, c, rs, cs };
      });
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (occ[r][c]) continue;
        const up = r > 0 && occ[r - 1][c] && place[occ[r - 1][c]];
        const left = c > 0 && occ[r][c - 1] && place[occ[r][c - 1]];
        if (up && up.cs === 1 && up.r + up.rs === r) { up.rs++; occ[r][c] = occ[r - 1][c]; }
        else if (left && left.rs === 1 && left.c + left.cs === c) { left.cs++; occ[r][c] = occ[r][c - 1]; }
      }
      return { cols, rows, place };
    }

    const shapeOf = (W, H) => (W >= H ? 'land' : 'port');
    function panelEl(p) {
      const el = buildPanel(p);
      el.dataset.pid = p.id;
      return el;
    }
    function buildPanel(p) {
      if (p.id === 'agenda') { agendaEl.replaceChildren(h('div', { class: 'wall-panel-body', inert: '' }, agendaPanel())); return agendaEl; }
      if (p.id === 'photos') { tileEl.className = 'wall-panel wall-photo'; tileEl.classList.toggle('empty', !PL.photos.list().length); return tileEl; }
      let body;
      try { body = p.id === 'chores' ? choresPanel(kid.show) : render(p.id); } catch (e) { console.warn('wall panel', p.id, e); body = h('p', { class: 'sub' }, 'Could not show this.'); }
      // Panels are for reading; only Chores can be tapped (so kids can tick their own).
      const b = h('div', p.id === 'chores' && !arranging ? { class: 'wall-panel-body' } : { class: 'wall-panel-body', inert: '' }, body);
      return h('section', { class: 'wall-panel wall-' + p.id, 'aria-label': p.label }, h('h2', {}, p.label), b);
    }
    const clearPos = (el) => {
      el.style.gridRow = ''; el.style.gridColumn = ''; el.style.transform = '';
      el.removeAttribute('tabindex'); el.classList.remove('arr-item', 'dragging', 'resizing', 'swap-target');
      if (el.dataset.pid) el.setAttribute('aria-label', (PANELS.find((q) => q.id === el.dataset.pid) || {}).label || '');
      el.querySelectorAll(':scope > .arr-edge, :scope > .arr-size, :scope > .arr-chip').forEach((x) => x.remove());
      el.classList.remove('edge-l', 'edge-r', 'edge-t', 'edge-b', 'limit', 'covered'); el.style.cursor = '';
      return el;
    };

    function paintPanels() {
      const s = settings();
      const photosOn = s.photo !== 'off' && PL.photos.list().length > 0;
      const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight;
      const scroll = W < 560; // a phone: one column that scrolls
      const shape = shapeOf(W, H);
      root.classList.toggle('scroll', scroll);
      root.classList.toggle('port', shape === 'port');
      root.classList.toggle('bgphoto', s.photo === 'background' && photosOn);
      arrBtn.hidden = scroll;
      if (scroll && arranging) { arranging = false; draft = null; }
      const enabled = PANELS.filter((p) => s.panels[p.id] && (p.id !== 'photos' || s.photo === 'tile'));
      if (arranging && draftShape !== shape) { draft = seedLayout(enabled, shape, W, H); draftShape = shape; }
      const own = !scroll && (arranging ? draft : s.layout[shape]);
      if (own) paintFree(enabled, own, shape); else paintAuto(enabled, s, W, H, scroll);
      // Fade the bottom of a panel only when its content does not fit.
      requestAnimationFrame(() => root.querySelectorAll('.wall-panel-body').forEach((b) => b.classList.toggle('clip', b.scrollHeight > b.clientHeight + 2)));
    }

    function paintAuto(enabled, s, W, H, scroll) {
      roomBtn.hidden = true;
      if (main.firstChild !== agendaEl || main.childNodes.length !== 2) main.replaceChildren(agendaEl, grid);
      const showAgenda = !!enabled.find((p) => p.id === 'agenda');
      agendaEl.hidden = !showAgenda;
      if (showAgenda) clearPos(panelEl({ id: 'agenda' }));
      const list = enabled.filter((p) => p.id !== 'agenda');
      const gridW = showAgenda && !scroll ? W * (W >= H ? 0.66 : 0.58) : W;
      const { cols, rows, place } = scroll ? { cols: 1, rows: list.length, place: {} } : layout(list, gridW, H);
      grid.style.setProperty('--cols', cols);
      grid.style.setProperty('--rows', rows);
      const kids = list.map((p) => {
        const el = clearPos(panelEl(p)), q = place[p.id];
        if (q) { el.style.gridRow = (q.r + 1) + ' / span ' + q.rs; el.style.gridColumn = (q.c + 1) + ' / span ' + q.cs; }
        return el;
      });
      if (!kids.length && !showAgenda) kids.push(h('section', { class: 'wall-panel' }, h('p', { class: 'sub' }, 'Nothing is turned on. Tap "Choose what shows" to add panels.')));
      grid.hidden = !kids.length;
      grid.replaceChildren(...kids);
    }

    // Your own layout: every turned-on card at its box; a card just turned on goes in the biggest free spot.
    let missingNow = [];
    function completeLayout(enabled, lay, g) {
      const on = new Set(enabled.map((p) => p.id));
      const boxes = {};
      Object.keys(lay.boxes || {}).forEach((id) => {
        const b = lay.boxes[id];
        if (on.has(id) && inside(b, g) && Object.keys(boxes).every((k) => !overlaps(b, boxes[k]))) boxes[id] = Object.assign({}, b);
      });
      const missing = [];
      enabled.forEach((p) => {
        if (boxes[p.id]) return;
        const spot = findSpot(occupancy(boxes, g), g);
        if (spot) boxes[p.id] = spot; else missing.push(p.id);
      });
      return { boxes, missing };
    }
    function paintFree(enabled, saved, shape) {
      const g = GRIDS[shape];
      const { boxes, missing } = completeLayout(enabled, saved, g);
      if (arranging) draft = { boxes };
      missingNow = missing;
      const names = missing.map(labelOf);
      roomBtn.hidden = arranging || !names.length;
      if (names.length) roomBtn.replaceChildren(icon('move'), h('span', {}, 'No room for ' + names.join(', ') + '. Arrange'));
      if (arranging) arrHint.textContent = names.length ? 'No room for ' + names.join(', ') + ' yet. Make a card smaller to fit it.' : HINT;
      undoBtn.disabled = !history.length;
      freeEl.style.setProperty('--gc', g.c); freeEl.style.setProperty('--gr', g.r);
      const cells = arranging ? h('div', { class: 'arr-cells', 'aria-hidden': 'true' }, Array.from({ length: g.c * g.r }, () => h('i', {}))) : null;
      const kids = enabled.filter((p) => boxes[p.id]).map((p) => {
        const el = clearPos(panelEl(p));
        el.hidden = false;
        place(el, boxes[p.id]);
        if (arranging) makeArrangeable(el, p, g);
        return el;
      });
      freeEl.replaceChildren(...[cells].concat(kids).filter(Boolean));
      if (main.firstChild !== freeEl || main.childNodes.length !== 1) main.replaceChildren(freeEl);
    }

    // Start Arrange from what you already see: the automatic layout, turned into boxes.
    function seedLayout(enabled, shape, W, H) {
      const g = GRIDS[shape];
      const s = settings();
      if (s.layout[shape]) return JSON.parse(JSON.stringify(s.layout[shape]));
      const boxes = {};
      const hasAgenda = !!enabled.find((p) => p.id === 'agenda');
      const aw = hasAgenda ? (shape === 'land' ? 4 : 3) : 0;
      if (hasAgenda) boxes.agenda = { x: 0, y: 0, w: aw, h: g.r };
      const list = enabled.filter((p) => p.id !== 'agenda');
      if (list.length) {
        const rc = g.c - aw;
        const auto = layout(list, W * (rc / g.c), H);
        const cols = Math.min(auto.cols, Math.floor(rc / MIN)) || 1;
        const rows = auto.rows;
        const colW = Math.floor(rc / cols), extraC = rc - colW * cols;
        const rowH = Math.floor(g.r / rows), extraR = g.r - rowH * rows;
        list.forEach((p) => {
          const q = auto.place[p.id];
          if (!q || q.c + q.cs > cols) return;
          boxes[p.id] = { x: aw + q.c * colW, y: q.r * rowH, w: q.cs * colW + (q.c + q.cs === cols ? extraC : 0), h: q.rs * rowH + (q.r + q.rs === rows ? extraR : 0) };
        });
      }
      return { boxes };
    }

    /* ---------- dragging and resizing (Arrange) ---------- */
    const place = (el, b) => { el.style.gridColumn = (b.x + 1) + ' / span ' + b.w; el.style.gridRow = (b.y + 1) + ' / span ' + b.h; };
    const labelOf = (id) => (PANELS.find((q) => q.id === id) || {}).label || id;
    const andList = (ids) => { const n = ids.map(labelOf); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
    const sayBox = (id) => { const b = draft.boxes[id]; if (b) live.textContent = labelOf(id) + ': column ' + (b.x + 1) + ', row ' + (b.y + 1) + ', ' + b.w + ' wide, ' + b.h + ' tall.'; };
    function pitch(g) {
      const st = getComputedStyle(freeEl);
      const gx = parseFloat(st.columnGap) || 0, gy = parseFloat(st.rowGap) || 0;
      return { x: (freeEl.clientWidth + gx) / g.c, y: (freeEl.clientHeight + gy) / g.r };
    }
    const calm = () => document.documentElement.classList.contains('reduce-motion');
    const rectsNow = () => new Map([...freeEl.querySelectorAll('.arr-item')].map((el) => [el.dataset.pid, el.getBoundingClientRect()]));
    // Slide cards from where they were to where they are now.
    function slideFrom(before, skip) {
      if (calm()) return;
      freeEl.querySelectorAll('.arr-item').forEach((el) => {
        const a = before.get(el.dataset.pid);
        if (!a || el.dataset.pid === skip || !el.animate) return;
        const z = el.getBoundingClientRect();
        const dx = a.left - z.left, dy = a.top - z.top, sx = a.width / Math.max(1, z.width), sy = a.height / Math.max(1, z.height);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
        el.animate([{ transformOrigin: '0 0', transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' }, { transformOrigin: '0 0', transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
    // Apply a new set of boxes: remember the old one for Undo, redraw, slide, and label what changed.
    function commit(nextBoxes, movedId) {
      const prev = draft.boxes;
      history.push(JSON.stringify(prev)); if (history.length > 30) history.shift();
      const before = rectsNow();
      draft = { boxes: nextBoxes };
      paintPanels();
      slideFrom(before, null);
      Object.keys(nextBoxes).forEach((k) => {
        if (k === movedId || !prev[k]) return;
        const a = prev[k], b = nextBoxes[k];
        const tag = b.w * b.h < a.w * a.h ? 'Smaller' : b.w * b.h > a.w * a.h ? 'Bigger' : (a.x !== b.x || a.y !== b.y) ? 'Moved' : '';
        const el = freeEl.querySelector('[data-pid="' + k + '"]');
        if (tag && el) { const c = h('span', { class: 'arr-chip' + (tag === 'Smaller' ? ' warn' : ''), 'aria-hidden': 'true' }, tag); el.append(c); setTimeout(() => c.remove(), 2600); }
      });
    }
    function undoArrange() {
      if (!history.length) return;
      const before = rectsNow();
      draft = { boxes: JSON.parse(history.pop()) };
      paintPanels(); slideFrom(before, null);
      live.textContent = 'Undone.';
    }
    // Which edges of a card the pointer is on (a wide zone, so a finger can grab it).
    function edgesAt(el, e) {
      const r = el.getBoundingClientRect();
      const z = e.pointerType === 'touch' ? 30 : 18;
      return { l: e.clientX - r.left < z, r: r.right - e.clientX < z, t: e.clientY - r.top < z, b: r.bottom - e.clientY < z };
    }
    const anyEdge = (k) => k.l || k.r || k.t || k.b;
    const cursorFor = (k) => ((k.l && k.t) || (k.r && k.b) ? 'nwse-resize' : (k.r && k.t) || (k.l && k.b) ? 'nesw-resize' : k.l || k.r ? 'ew-resize' : k.t || k.b ? 'ns-resize' : 'grab');
    const clearPreview = () => freeEl.querySelectorAll('.covered').forEach((x) => x.classList.remove('covered'));

    function makeArrangeable(el, p, g) {
      el.classList.add('arr-item');
      el.tabIndex = 0;
      el.setAttribute('aria-label', p.label + '. Drag to move, drag an edge to resize. Arrow keys move it, Shift and arrow keys resize it.');
      ['l', 'r', 't', 'b'].forEach((k) => el.append(h('span', { class: 'arr-edge arr-edge-' + k, 'aria-hidden': 'true' })));
      const sizeTag = h('span', { class: 'arr-size', 'aria-hidden': 'true' });
      el.append(sizeTag);

      el.addEventListener('pointermove', (e) => {
        if (el.classList.contains('dragging') || el.classList.contains('resizing')) return;
        const k = edgesAt(el, e);
        el.style.cursor = cursorFor(k);
        ['l', 'r', 't', 'b'].forEach((x) => el.classList.toggle('edge-' + x, !!k[x]));
      });
      el.addEventListener('pointerleave', () => { ['l', 'r', 't', 'b'].forEach((x) => el.classList.remove('edge-' + x)); });
      el.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        e.preventDefault();
        const k = edgesAt(el, e);
        el.setPointerCapture(e.pointerId);
        if (anyEdge(k)) startResize(e, k); else startDrag(e);
      });

      // Move: the card follows the finger. The cards under it light up; when you let go, the card
      // takes that spot and they move into the space it left, resizing to fit.
      function startDrag(e) {
        const fr = freeEl.getBoundingClientRect(), r0 = el.getBoundingClientRect();
        const grab = { x: e.clientX - r0.left, y: e.clientY - r0.top };
        const sx = e.clientX, sy = e.clientY;
        const from = Object.assign({}, draft.boxes[p.id]);
        let started = false, frame = 0, last = e, plan = null, target = null;
        const ghost = h('div', { class: 'arr-ghost' });
        const dest = h('div', { class: 'arr-dest', 'aria-hidden': 'true' });
        const follow = () => {
          frame = 0;
          const pt = pitch(g);
          const tx = last.clientX - fr.left - grab.x, ty = last.clientY - fr.top - grab.y;
          el.style.transform = 'translate(' + (tx - el.offsetLeft) + 'px,' + (ty - el.offsetTop) + 'px)';
          const t = { x: Math.max(0, Math.min(g.c - from.w, Math.round(tx / pt.x))), y: Math.max(0, Math.min(g.r - from.h, Math.round(ty / pt.y))), w: from.w, h: from.h };
          if (sameBox(t, target)) return;
          target = t;
          clearPreview();
          place(ghost, t);
          if (sameBox(t, from)) { plan = null; ghost.classList.remove('bad'); dest.hidden = true; arrHint.textContent = HINT; return; }
          plan = takeSpot(draft.boxes, p.id, t, g);
          ghost.classList.toggle('bad', !plan.ok);
          plan.covered.forEach((k) => { const x = freeEl.querySelector('[data-pid="' + k + '"]'); if (x) x.classList.add('covered'); });
          dest.hidden = !plan.covered.length || !plan.ok;
          if (!dest.hidden) { place(dest, from); dest.textContent = andList(plan.covered) + (plan.covered.length > 1 ? ' move here' : ' moves here'); }
          arrHint.textContent = !plan.ok ? 'No room for ' + andList(plan.failed) + ' there. Try another spot, or make a card smaller.'
            : plan.covered.length ? 'Let go to put ' + p.label + ' here. ' + andList(plan.covered) + (plan.covered.length > 1 ? ' will move.' : ' will move.')
            : 'Let go to put ' + p.label + ' here.';
        };
        const move = (ev) => {
          last = ev;
          if (!started) {
            if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
            started = true; el.classList.add('dragging'); place(ghost, from); freeEl.append(dest, ghost); dest.hidden = true;
          }
          if (!frame) frame = requestAnimationFrame(follow);
        };
        const up = () => {
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
          if (frame) cancelAnimationFrame(frame);
          ghost.remove(); dest.remove(); clearPreview(); arrHint.textContent = HINT;
          if (!started) return;
          if (frame === 0 && last) { /* the last position is already applied */ }
          if (plan && plan.ok) {
            const a = el.getBoundingClientRect();
            const filled = fillGaps(draft.boxes, plan.boxes, g, p.id);
            commit(filled, p.id);
            const nel = freeEl.querySelector('[data-pid="' + p.id + '"]');
            if (nel && nel.animate && !calm()) { const z = nel.getBoundingClientRect(); nel.animate([{ transform: 'translate(' + (a.left - z.left) + 'px,' + (a.top - z.top) + 'px)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' }); }
            sayBox(p.id);
          } else {
            const a = el.getBoundingClientRect();
            el.style.transform = ''; el.classList.remove('dragging');
            const z = el.getBoundingClientRect();
            if (el.animate && !calm()) el.animate([{ transform: 'translate(' + (a.left - z.left) + 'px,' + (a.top - z.top) + 'px)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
            if (plan && !plan.ok) live.textContent = 'There is no room there.';
          }
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      }

      // Resize from any edge or corner. Cards it grows over move out of the way and shrink if they
      // must; when nothing more fits, the edge turns red and stops.
      function startResize(e, k) {
        const start = JSON.parse(JSON.stringify(draft.boxes));
        const orig = start[p.id];
        const sx = e.clientX, sy = e.clientY;
        el.classList.add('resizing');
        let changed = false;
        const show = () => { const z = draft.boxes[p.id]; sizeTag.textContent = z.w + ' wide · ' + z.h + ' tall'; };
        show();
        const move = (ev) => {
          const pt = pitch(g);
          const dx = Math.round((ev.clientX - sx) / pt.x), dy = Math.round((ev.clientY - sy) / pt.y);
          const t = Object.assign({}, orig);
          if (k.r) t.w = orig.w + dx;
          if (k.l) { t.x = orig.x + dx; t.w = orig.w - dx; }
          if (k.b) t.h = orig.h + dy;
          if (k.t) { t.y = orig.y + dy; t.h = orig.h - dy; }
          if (t.w < MIN) { if (k.l) t.x = orig.x + orig.w - MIN; t.w = MIN; }
          if (t.h < MIN) { if (k.t) t.y = orig.y + orig.h - MIN; t.h = MIN; }
          if (t.x < 0) { t.w += t.x; t.x = 0; } if (t.y < 0) { t.h += t.y; t.y = 0; }
          t.w = Math.min(t.w, g.c - t.x); t.h = Math.min(t.h, g.r - t.y);
          if (sameBox(t, draft.boxes[p.id])) return;
          const plan = takeSpot(start, p.id, t, g);
          if (!plan.ok) { el.classList.add('limit'); return; }
          el.classList.remove('limit');
          const before = rectsNow();
          draft = { boxes: plan.boxes };
          freeEl.querySelectorAll('.arr-item').forEach((x) => { const b = draft.boxes[x.dataset.pid]; if (b) place(x, b); });
          slideFrom(before, p.id);
          changed = !sameBox(t, orig) || changed;
          show();
        };
        const up = () => {
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
          el.classList.remove('resizing', 'limit'); sizeTag.textContent = '';
          if (changed) { history.push(JSON.stringify(start)); if (history.length > 30) history.shift(); }
          paintPanels(); // redraw the cards' contents at their new size
          sayBox(p.id);
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      }

      // Keyboard: arrows move the card one cell (it takes the spot); Shift + arrows resize from the right or bottom edge.
      el.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d) return;
        e.preventDefault();
        const b = draft.boxes[p.id];
        const t = e.shiftKey ? { x: b.x, y: b.y, w: Math.max(MIN, b.w + d[0]), h: Math.max(MIN, b.h + d[1]) } : { x: b.x + d[0], y: b.y + d[1], w: b.w, h: b.h };
        if (!inside(t, g) || sameBox(t, b)) { live.textContent = 'It cannot go further that way.'; return; }
        const plan = takeSpot(draft.boxes, p.id, t, g);
        if (!plan.ok) { live.textContent = 'There is no room for ' + andList(plan.failed) + '.'; return; }
        commit(e.shiftKey ? plan.boxes : fillGaps(draft.boxes, plan.boxes, g, p.id), p.id);
        const nel = freeEl.querySelector('[data-pid="' + p.id + '"]'); if (nel) nel.focus();
        sayBox(p.id);
      });
    }

    function startArrange() {
      const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight;
      const s = settings();
      const enabled = PANELS.filter((p) => s.panels[p.id] && (p.id !== 'photos' || s.photo === 'tile'));
      kid.close();
      arranging = true; draftShape = shapeOf(W, H); history = [];
      draft = seedLayout(enabled, draftShape, W, H);
      root.classList.add('arranging'); bar.hidden = true; arrBar.hidden = false;
      paintPanels();
      const first = freeEl.querySelector('.arr-item'); if (first) first.focus();
    }
    function finishArrange() {
      const s = settings();
      const layoutAll = Object.assign({}, s.layout, { [draftShape]: { boxes: draft.boxes } });
      arranging = false; draft = null; history = [];
      root.classList.remove('arranging'); bar.hidden = false; arrBar.hidden = true;
      save({ layout: layoutAll });
      paintPanels();
      ui.toast('Layout saved on this screen.');
    }
    function resetArrange() {
      const s = settings();
      const layoutAll = Object.assign({}, s.layout); delete layoutAll[draftShape];
      arranging = false; draft = null;
      root.classList.remove('arranging'); bar.hidden = false; arrBar.hidden = true;
      save({ layout: layoutAll });
      paintPanels();
      ui.toast('Back to the automatic layout.');
    }

    function paint() {
      root.className = 'wall ' + (curMode === 'wall' ? 'board' : 'photos') + ['idle', 'bgphoto', 'scroll', 'port', 'arranging'].filter((k) => root.classList.contains(k)).map((k) => ' ' + k).join('');
      modeBtn.replaceChildren(icon(curMode === 'wall' ? 'image' : 'calendar'), h('span', {}, curMode === 'wall' ? 'Photos only' : 'Show the board'));
      modeBtn.setAttribute('aria-label', curMode === 'wall' ? 'Photos only' : 'Show the board');
      optBtn.hidden = curMode !== 'wall';
      arrBtn.hidden = curMode !== 'wall' || root.classList.contains('scroll');
      tick();
      if (curMode === 'wall') { paintPanels(); kid.paint(); }
      else root.classList.toggle('nophotos', !PL.photos.list().length);
    }
    function nextPhoto() {
      const s = settings();
      if (curMode === 'photos' || s.photo === 'background') bg.next(); else bg.el.forEach((x) => x.classList.remove('on'));
      if (curMode === 'wall' && s.photo === 'tile') tile.next();
    }
    // After a change, make sure whatever should show a photo has one.
    function nextPhotoIfBlank() {
      const s = settings();
      if ((curMode === 'photos' || s.photo === 'background') && !bg.el.some((x) => x.classList.contains('on'))) bg.next();
      if (curMode === 'wall' && s.photo === 'tile' && !tile.el.some((x) => x.classList.contains('on'))) tile.next();
    }
    function wake() { root.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => root.classList.add('idle'), 5000); }
    function onKey(e) {
      if (e.key !== 'Escape' || document.querySelector('.sheet-wrap')) return;
      if (arranging) finishArrange(); else if (kid.isOpen()) kid.close(); else close();
    }
    const soon = () => { clearTimeout(renderT); renderT = setTimeout(() => { if (root.querySelector('.dragging, .resizing')) return soon(); paint(); nextPhotoIfBlank(); }, 250); };
    function close() {
      timers.forEach((t) => (t && t.stop ? t.stop() : clearInterval(t))); clearTimeout(idleT); clearTimeout(renderT); kid.close();
      document.removeEventListener('keydown', onKey); removeEventListener('resize', soon);
      try { if (lock) lock.release(); } catch (e) { /* ignore */ }
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
      root.remove(); unsub(); PL.theme.setWall(false);
    }
    const unsub = PL.store.subscribe(soon);
    document.body.append(root);
    PL.theme.setWall(true);
    root.addEventListener('pointerdown', wake); root.addEventListener('mousemove', wake);
    document.addEventListener('keydown', onKey); addEventListener('resize', soon);
    paint(); nextPhoto(); wake(); closeBtn.focus();
    const stopClock = PL.clock.start(tick); // every second, and right away when the screen wakes up
    timers.push({ stop: stopClock }, setInterval(() => { if (!kid.isOpen() && !arranging) paint(); }, 60000), setInterval(nextPhoto, 12000));
    try { if (root.requestFullscreen) { const p = root.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* ignore */ }
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch (e) { /* ignore */ }
    return { close, openKid: kid.show, arrange: startArrange };
  }

  /* ---------- Settings card ---------- */
  function card() {
    return h('section', { class: 'card settings-card' }, h('h2', {}, 'Wall mode'),
      h('p', { class: 'sub' }, 'Turn a tablet, TV or old screen into a family board: a big clock, today and what is coming up, and the parts of Home you choose, all on one screen. Kids can tick their own chores on it.'),
      h('div', { class: 'btn-row' }, ui.button('Start wall mode', { variant: 'primary', icon: 'expand', onClick: () => open('wall') })),
      optionsBody());
  }

  PL.wall = { open, card, openOptions, PANELS, layoutTools: { takeSpot, fillGaps, GRIDS } };
})();
