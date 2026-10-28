/*
 * ai.js — "✨ Add bookings for me" and "✨ Build a trip for me".
 *   TR.ai.bookings(session)   upload / paste / flight number -> preview -> add the ones you tick
 *   TR.ai.plan(session)       describe the trip -> draft plan + rough cost -> add what you tick
 * The server does the AI work (server/ai.js) and only suggests; plans are added with the normal routes.
 * Calendar files (.ics) are read for free. Everything else uses a little AI, inside the site's daily limit.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, icon = TR.icon, cfg = TR.config;

  const money = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'CAD', maximumFractionDigits: 0 }).format(n); } catch (e) { return (cur || '') + ' ' + Math.round(n); } };
  function thinking(text) {
    return h('div', { class: 'ai-think', role: 'status' }, h('span', { class: 'ai-think-ic', 'aria-hidden': 'true' }, '✨'), h('span', {}, text));
  }
  // "Ask for more free plans": a note to the person who runs the site.
  function askBox(session, asked) {
    const box = h('div', { class: 'ai-ask' });
    if (asked) { box.append(h('b', {}, '✉️ You already asked for more.'), h('p', { class: 'sub' }, 'The builder will look at it soon. Try again later.')); return box; }
    const ta = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Optional: tell the builder about your trip', 'aria-label': 'Message to the builder' });
    const send = ui.button('Ask for more free plans', { icon: 'send', variant: 'primary', onClick: async () => {
      send.disabled = true;
      try { await session.req('POST', '/ai/request', { message: ta.value }); box.replaceChildren(h('b', {}, '✉️ Sent! Thank you.'), h('p', { class: 'sub' }, 'The builder will look at it and add more free plans if they can. Try again later.')); }
      catch (e) { ui.toast(e.message); send.disabled = false; }
    } });
    box.append(h('b', {}, 'Want more free trip plans?'), h('p', { class: 'sub' }, 'Send a short message to the builder of Triply.'), ta, send);
    return box;
  }
  function trouble(e, session) {
    if (e && e.code === 'ai_user_limit') {
      return h('div', { class: 'stack' }, h('div', { class: 'ai-rest' }, h('span', { class: 'ai-rest-ic', 'aria-hidden': 'true' }, '🎟️'),
        h('div', {}, h('b', {}, 'You have used your 2 free trip plans.'), h('p', {}, 'You can still plan by hand, or ask for more.'))), session ? askBox(session, false) : null);
    }
    if (e && (e.code === 'ai_resting' || e.code === 'ai_trip_limit' || e.code === 'ai_off')) {
      return h('div', { class: 'ai-rest' }, h('span', { class: 'ai-rest-ic', 'aria-hidden': 'true' }, '😴'),
        h('div', {}, h('b', {}, e.code === 'ai_off' ? 'AI help is not on.' : e.code === 'ai_trip_limit' ? 'That’s all for today on this trip.' : 'AI help is resting until tomorrow.'),
          h('p', {}, e.message + ' ')));
    }
    return h('p', { class: 'form-error', role: 'alert' }, (e && e.message) || 'Something went wrong. Please try again.');
  }
  const when = (it) => TR.plan && TR.plan.when ? TR.plan.when(it) : [it.start_date, it.start_time].filter(Boolean).join(' ');

  // A ticked list of found bookings. rows: [{ item, price, currency, extra, on }]
  function foundList(rows, onChange) {
    return h('div', { class: 'ai-found' }, rows.map((r) => {
      const T = cfg.types[r.item.type] || cfg.types.note;
      const cb = h('input', { type: 'checkbox', 'aria-label': r.item.title }); cb.checked = r.on !== false;
      cb.addEventListener('change', () => { r.on = cb.checked; row.classList.toggle('off', !r.on); onChange && onChange(); });
      const d = r.item.data || {};
      const bits = r.item.type === 'flight' ? [[d.airline, d.flightNo].filter(Boolean).join(' '), when(r.item), d.terminal ? 'Terminal ' + d.terminal : '', d.seat ? 'Seat ' + d.seat : '']
        : r.item.type === 'hotel' ? [when(r.item), d.room, r.item.location, d.contact] : [when(r.item), r.item.location, d.company, d.vehicle];
      const row = h('label', { class: 'ai-row' + (r.on === false ? ' off' : '') }, cb,
        h('span', { class: 'tp-ic', style: '--c:' + T.color }, icon(T.icon)),
        h('span', { class: 'ai-row-main' }, h('b', {}, r.item.title), h('span', { class: 'sub' }, bits.filter(Boolean).join(' · ')),
          r.extra ? h('span', { class: 'sub' }, r.extra) : null,
          r.item.confirmation || r.price ? h('span', { class: 'ai-conf' }, [r.item.confirmation ? 'Conf. ' + r.item.confirmation : '', r.price ? money(r.price, r.currency || 'CAD') + ' total' : ''].filter(Boolean).join(' · ')) : null));
      return row;
    }));
  }

  // Add the ticked plans (one request), and their prices to Costs if asked.
  async function addAll(session, rows, opts) {
    const chosen = rows.filter((r) => r.on !== false);
    if (!chosen.length) { ui.toast('Tick at least one.'); return false; }
    const res = await session.req('POST', '/items/bulk', { items: chosen.map((r) => r.item), label: opts.label || '' });
    if (opts.costs) {
      const everyone = session.state.members.map((m) => m.id);
      for (let i = 0; i < chosen.length; i++) {
        const r = chosen[i], it = res.items[i];
        if (!r.price || !it) continue;
        try { await session.req('POST', '/expenses', { title: it.title, amount: r.price, currency: r.currency || 'CAD', paid_by: session.me().id, split: everyone, spent_on: it.start_date || D.today(), item_id: it.id }); } catch (e) { /* the plan is in; the cost can be added by hand */ }
      }
    }
    await session.refresh();
    return res.items.length;
  }

  /* ---------- ✨ Add bookings for me ---------- */
  function bookings(session, start) {
    let way = start || 'upload', rows = [], blobs = [], busy = false;
    const out = h('div', { class: 'stack' });
    const wayBox = h('div', { class: 'ai-ways', role: 'radiogroup', 'aria-label': 'How to add' });
    const WAYS = [['upload', 'upload', 'Upload a booking', 'PDF, screenshot or photo'], ['paste', 'copy', 'Paste the email', 'Copy the confirmation email'], ['flight', 'plane', 'Flight number', 'Type AC 880, Jun 4']];
    const panel = h('div', { class: 'stack' });
    const costs = h('input', { type: 'checkbox', checked: true }), keep = h('input', { type: 'checkbox', checked: true });
    const addBtn = ui.button('Add', { variant: 'primary', big: true, onClick: async () => {
      addBtn.disabled = true;
      try {
        const n = await addAll(session, rows, { costs: costs.checked, label: 'from a booking ✨' });
        if (n === false) { addBtn.disabled = false; return; }
        if (!keep.checked) for (const b of blobs) { try { await session.req('DELETE', '/files/' + b); } catch (e) { /* fine */ } }
        s.close(); ui.toast(n + (n === 1 ? ' booking added.' : ' bookings added.'));
      } catch (e) { ui.toast(e.message); addBtn.disabled = false; }
    } });
    addBtn.hidden = true;

    function paintWays() {
      wayBox.replaceChildren(...WAYS.map(([id, ic, t, sub]) => h('button', { type: 'button', role: 'radio', class: 'ai-way' + (way === id ? ' on' : ''), 'aria-checked': way === id ? 'true' : 'false',
        onclick: () => { if (busy) return; way = id; paintWays(); paintPanel(); } }, icon(ic), h('b', {}, t), h('span', { class: 'sub' }, sub))));
    }
    function paintPanel() {
      if (way === 'upload') {
        const input = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/*,.ics,text/calendar', hidden: true });
        input.addEventListener('change', () => { if (input.files.length) readFiles([...input.files]); });
        const drop = h('button', { type: 'button', class: 'ai-drop', onclick: () => input.click() }, h('span', { class: 'ai-drop-ic' }, icon('upload')),
          h('b', {}, 'Drop your booking here'), h('span', { class: 'sub' }, 'or tap to choose · PDF, JPG, PNG · several at once is fine'));
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) readFiles([...e.dataTransfer.files]); });
        panel.replaceChildren(drop, input, h('p', { class: 'hint' }, '💡 Free: if the email has an “Add to calendar” file (.ics), upload that. Everything else uses a tiny bit of AI.'));
      } else if (way === 'paste') {
        const ta = h('textarea', { rows: 8, maxlength: 60000, placeholder: 'Paste the whole confirmation email here…', 'aria-label': 'Booking email' });
        panel.replaceChildren(ta, ui.button('Read it for me', { icon: 'sparkle', variant: 'primary', onClick: () => { if (ta.value.trim().length < 20) { ui.toast('Paste the booking email first.'); return; } read([{ text: ta.value }]); } }));
      } else {
        const q = TR.forms.input('text', '', { maxlength: 120, placeholder: 'AC 880, Jun 4' });
        const go = (e) => { e && e.preventDefault(); if (q.value.trim().length < 3) { ui.toast('Type a flight number and date.'); return; } findFlight(q.value); };
        panel.replaceChildren(h('form', { class: 'ai-inline', onsubmit: go }, q, ui.button('Find flight', { icon: 'sparkle', variant: 'gold', type: 'submit' })),
          h('p', { class: 'hint' }, 'Or type a route, like “YVR to Paris, Jun 4”, and pick from real flights. Add your seat and confirmation number after.'));
      }
    }
    async function readFiles(files) {
      const jobs = [];
      for (const f of files.slice(0, 6)) {
        if (/\.ics$/i.test(f.name) || f.type === 'text/calendar') jobs.push({ text: await f.text() });
        else jobs.push({ file: f });
      }
      read(jobs);
    }
    async function read(jobs) {
      busy = true; out.replaceChildren(thinking('Reading your booking… this takes a few seconds.'));
      const found = []; let err = null;
      for (const j of jobs) {
        try {
          let body = { text: j.text };
          if (j.file) { const b = await TR.api.upload(session.id, session.token, j.file); blobs.push(b.id); body = { blobId: b.id }; }
          const r = await session.req('POST', '/ai/read', body);
          found.push(...r.found);
        } catch (e) { err = e; }
      }
      busy = false; show(found, err, jobs.length);
    }
    async function findFlight(q) {
      busy = true; out.replaceChildren(thinking('Looking up that flight…'));
      try { const r = await session.req('POST', '/ai/flight', { query: q }); busy = false; show(r.found.map((x, i) => Object.assign(x, { on: i === 0 })), null, 1, true); }
      catch (e) { busy = false; show([], e, 1); }
    }
    function show(found, err, n, pick) {
      rows = found.map((x) => Object.assign({ on: true }, x));
      if (!rows.length) { out.replaceChildren(err ? trouble(err) : h('p', { class: 'form-error' }, pick ? 'That flight could not be found. Check the number and date, or add it by hand.' : 'No bookings were found in that. Try a clearer file, or add it by hand.')); addBtn.hidden = true; return; }
      const fl = rows.filter((r) => r.item.type === 'flight').length, ho = rows.filter((r) => r.item.type === 'hotel').length, other = rows.length - fl - ho;
      const title = [fl ? fl + (fl === 1 ? ' flight' : ' flights') : '', ho ? ho + (ho === 1 ? ' hotel' : ' hotels') : '', other ? other + (other === 1 ? ' other booking' : ' other bookings') : ''].filter(Boolean).join(' and ');
      const sync = () => { const k = rows.filter((r) => r.on !== false).length; addBtn.querySelector('span').textContent = k ? 'Add ' + k + (k === 1 ? ' booking' : ' bookings') : 'Add'; addBtn.disabled = !k; };
      const hasPrice = rows.some((r) => r.price);
      out.replaceChildren(...[
        h('div', {}, h('span', { class: 'ai-badge' }, pick ? 'FOUND ✨' : 'FOUND IN ' + n + (n === 1 ? ' BOOKING' : ' BOOKINGS') + ' ✨'), h('h3', { class: 'ai-title' }, pick ? 'Pick your flight' : title),
          h('p', { class: 'sub' }, 'Untick anything you don’t want. You can change anything after it’s added.')),
        foundList(rows, sync),
        hasPrice ? h('label', { class: 'ai-opt' }, costs, h('b', {}, 'Also add the prices to Costs'), h('span', { class: 'sub' }, '(paid by you, shared by everyone; change it later)')) : null,
        blobs.length ? h('label', { class: 'ai-opt' }, keep, h('b', {}, 'Save the files to the trip'), h('span', { class: 'sub' }, 'so everyone has the tickets')) : null,
        err ? trouble(err) : null].filter(Boolean));
      addBtn.hidden = false; sync();
    }
    paintWays(); paintPanel();
    const s = ui.sheet({ title: '✨ Add bookings for me', wide: true,
      body: h('div', { class: 'event-form' }, h('p', { class: 'sub' }, 'Flights and hotels. We read it and fill everything in. You check it before it’s added.'), wayBox, panel, out),
      footer: [ui.button('Type it in myself', { variant: 'ghost', onClick: () => { s.close(); TR.forms.typePicker(session); } }), h('span', { class: 'spacer' }), ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), addBtn] });
  }

  /* ---------- ✨ Build a trip for me ---------- */
  function plan(session) {
    const trip = session.trip();
    const route = (trip.route || []).slice();
    if (route.length > 2 && route[0] === route[route.length - 1]) route.pop();
    const home = route.length > 1 ? route.shift() : '';
    let cities = route.slice(0, 6), transport = 'Trains', level = 'comfortable', result = null, busy = false;
    const desc = h('textarea', { rows: 4, maxlength: 1500, 'aria-label': 'Describe your trip',
      placeholder: 'For example: 14 days in France and Italy, 4 of us (kids 10 and 7)' + (home ? ', flying from ' + home : '') + '. Nice hotels, a few bus tours, good food, not too rushed.' });
    desc.value = trip.description || '';
    const n0 = session.state.members.length;
    const travelers = TR.forms.input('number', n0 > 1 ? String(n0) : '', { min: 1, max: 40, placeholder: 'From the description', 'aria-label': 'Travelers' });
    const cityBox = h('div', { class: 'chip-row' }), cityIn = TR.forms.input('text', '', { maxlength: 40, placeholder: 'Add a city', 'aria-label': 'Add a city' });
    function paintCities() {
      cityBox.replaceChildren(...cities.map((c, i) => h('button', { type: 'button', class: 'person-pick', 'aria-pressed': 'true', title: 'Remove ' + c, onclick: () => { cities.splice(i, 1); paintCities(); } }, c, ' ×')));
    }
    cityIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = cityIn.value.trim(); if (v && cities.length < 8) { cities.push(v); cityIn.value = ''; paintCities(); } } });
    paintCities();
    const tSeg = ui.segmented([{ value: 'Trains', label: 'Trains' }, { value: 'Flights', label: 'Flights' }, { value: 'Car', label: 'Car' }, { value: 'whatever is best', label: 'Best way' }], transport, (v) => { transport = v; }, 'Between cities');
    const lSeg = ui.segmented([{ value: 'save', label: 'Save' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'fancy', label: 'Fancy' }], level, (v) => { level = v; }, 'Budget');
    const form = h('div', { class: 'event-form' },
      ui.field('Describe your trip', desc),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Cities, in order'), cityBox, cityIn),
      ui.field('Between cities', tSeg.el), ui.field('Budget style', lSeg.el), ui.field('How many people?', travelers),
      h('p', { class: 'hint' }, 'Uses real places from the web. Plans go on ' + D.short(trip.start_date) + ' – ' + D.short(trip.end_date) + '. Prices are estimates, check before booking.'));
    const out = h('div', { class: 'stack' });
    const go = ui.button('Make my plan', { icon: 'sparkle', variant: 'gold', big: true, onClick: () => make() });
    const addBtn = ui.button('Add to my trip', { variant: 'primary', big: true, onClick: () => add() });
    const again = ui.button('Start over', { variant: 'ghost', onClick: () => { result = null; out.replaceChildren(); form.hidden = false; go.hidden = false; addBtn.hidden = true; again.hidden = true; } });
    addBtn.hidden = true; again.hidden = true;

    async function make(lv) {
      if (busy) return;
      if (desc.value.trim().length < 5) { ui.toast('Tell us a little about the trip first.'); desc.focus(); return; }
      if (lv) level = lv;
      busy = true; go.disabled = true; form.hidden = true; go.hidden = true; addBtn.hidden = true; again.hidden = true;
      out.replaceChildren(thinking('Planning your trip with real places… this can take about a minute.'));
      try {
        result = await session.req('POST', '/ai/plan', { description: desc.value, cities, transport, level, travelers: travelers.value });
        result.items.forEach((x) => { x.on = true; });
        showPlan();
      } catch (e) { out.replaceChildren(trouble(e, session)); form.hidden = e.code === 'ai_user_limit'; go.hidden = e.code === 'ai_user_limit'; }
      busy = false; go.disabled = false; refreshLeft();
    }
    // "You have 2 free trip plans" next to the button; when none are left, the ask box instead.
    const leftNote = h('p', { class: 'ai-left' });
    async function refreshLeft() {
      try {
        const st = await session.req('GET', '/ai/status');
        const n = st.left ? st.left.myPlans : null;
        if (n == null) { leftNote.textContent = ''; return; }
        leftNote.textContent = n > 0 ? '🎟️ You have ' + n + (n === 1 ? ' free trip plan' : ' free trip plans') + ' left. “Make it cheaper” and “Go fancier” use one too.' : '';
        if (n < 1 && !result) { form.hidden = true; go.hidden = true; out.replaceChildren(trouble({ code: 'ai_user_limit' }, null), askBox(session, st.left.asked)); }
      } catch (e) { /* the note is optional */ }
    }
    refreshLeft();
    function showPlan() {
      const r = result, c = r.cost, cur = c.currency;
      const byDay = {}; r.items.forEach((x) => { (byDay[x.day] = byDay[x.day] || []).push(x); });
      const parts = [['✈️ Flights', c.flights, '#A8CDEA'], ['🏨 Hotels', c.hotels, '#C7B7EA'], ['🎟️ Tours', c.tours, '#F6C28E'], ['🍝 Food', c.food, '#F4A59A'], ['🚆 Trains and transfers', c.transport, '#B4D9AA']].filter((p) => p[1] > 0);
      const sum = parts.reduce((a, p) => a + p[1], 0) || 1;
      const pack = h('input', { type: 'checkbox', checked: r.packing.length > 0 });
      const budget = h('input', { type: 'checkbox', checked: !trip.budget });
      const canBudget = session.can('trip.edit') && c.high > 0;
      const sync = () => { const k = r.items.filter((x) => x.on).length; addBtn.querySelector('span').textContent = 'Add ' + k + (k === 1 ? ' plan' : ' plans') + ' to my trip'; addBtn.disabled = !k; };
      out.replaceChildren(...[
        h('section', { class: 'card ai-cost' },
          h('span', { class: 'ai-badge' }, 'DRAFT PLAN · ' + r.level.toUpperCase()),
          r.summary ? h('p', { style: 'margin:8px 0 4px' }, r.summary) : null,
          r.cities.length ? h('div', { class: 'ai-cities' }, r.cities.map((x) => h('div', { class: 'ai-city' }, h('b', {}, 'Days ' + x.from_day + (x.to_day > x.from_day ? '–' + x.to_day : '') + ' · ' + x.name), h('span', { class: 'sub' }, x.highlights)))) : null),
        c.high > 0 ? h('section', { class: 'card ai-cost' },
          h('h3', {}, 'Rough cost'),
          h('p', { class: 'ai-cost-total' }, h('b', {}, c.low && c.low !== c.high ? money(c.low, cur) + ' – ' + money(c.high, cur) : money(c.high, cur)), h('span', { class: 'sub' }, ' for ' + r.travelers + (r.travelers === 1 ? ' person' : ' people'))),
          h('div', { class: 'ai-bar' }, parts.map((p) => h('i', { style: 'width:' + (p[1] / sum * 100) + '%;background:' + p[2] }))),
          h('div', { class: 'ai-cost-rows' }, parts.map((p) => [h('span', {}, p[0]), h('b', {}, money(p[1], cur))])),
          h('div', { class: 'btn-row' }, ui.button('Make it cheaper', { onClick: () => make(r.level === 'fancy' ? 'comfortable' : 'save') }), ui.button('Go fancier', { onClick: () => make(r.level === 'save' ? 'comfortable' : 'fancy') })),
          h('p', { class: 'hint' }, 'An estimate from the AI. Real prices change, so check before you book.')) : null,
        h('h3', {}, 'The plan, day by day'),
        ...Object.keys(byDay).sort((a, b) => a - b).map((d) => h('section', { class: 'ai-day' },
          h('h4', {}, 'Day ' + d + ' · ' + D.fmt(byDay[d][0].item.start_date || trip.start_date, { weekday: 'short', month: 'short', day: 'numeric' })),
          foundList(byDay[d].map((x) => Object.assign(x, { extra: x.est ? 'about ' + money(x.est, x.currency || cur) : '' })), sync))),
        r.packing.length ? h('label', { class: 'ai-opt' }, pack, h('b', {}, 'Add the packing list'), h('span', { class: 'sub' }, '(' + r.packing.length + ' things)')) : null,
        canBudget ? h('label', { class: 'ai-opt' }, budget, h('b', {}, 'Set the trip budget to ' + money(Math.round((c.low + c.high) / 2 || c.high), cur))) : null
      ].filter(Boolean));
      addBtn.hidden = false; again.hidden = false; sync();
      out._pack = pack; out._budget = canBudget ? budget : null;
    }
    async function add() {
      addBtn.disabled = true;
      try {
        const n = await addAll(session, result.items, { label: 'trip plan ✨' });
        if (n === false) { addBtn.disabled = false; return; }
        if (out._pack && out._pack.checked) for (const p of result.packing) { try { await session.req('POST', '/packing', { title: p }); } catch (e) { break; } }
        if (out._budget && out._budget.checked) { const c = result.cost; try { await session.req('PATCH', '', { budget: Math.round((c.low + c.high) / 2 || c.high), budget_currency: c.currency }); } catch (e) { /* owners only */ } }
        await session.refresh(); s.close(); ui.toast(n + ' plans added to your trip. 🎉');
      } catch (e) { ui.toast(e.message); addBtn.disabled = false; }
    }
    const s = ui.sheet({ title: '✨ Build a trip for me', wide: true, body: h('div', { class: 'stack' }, form, leftNote, out),
      footer: [again, h('span', { class: 'spacer' }), ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() }), go, addBtn] });
  }

  // The two buttons, for page headers. Hidden for viewers.
  function buttons(session) {
    if (!session.can('items.write')) return [];
    return [ui.button('Add bookings', { icon: 'sparkle', variant: 'gold', onClick: () => bookings(session) }), ui.button('Build a trip for me', { icon: 'sparkle', onClick: () => plan(session) })];
  }

  TR.ai = { bookings, plan, buttons };
})();
