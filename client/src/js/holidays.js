/*
 * holidays.js — public holidays on the calendar.
 *   holidays/{set~date~n}   { date, title, set, check? }       one per holiday
 *   settings.holidaySets    [{ key, name, flag, years[], auto, ai? }]
 * Web version: dates come from the official public holiday list (the server asks date.nager.at),
 * by country or by province/state. If a place is not on that list, Claude finds them and they are marked "please check".
 * Inside Claude (no server), Claude finds them.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;
  const COLOR = '#F6C1D3';

  const flagOf = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🎉');
  const SUBS = {
    CA: { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon' },
    US: { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' }
  };
  let COUNTRIES = { CA: 'Canada', US: 'United States', PH: 'Philippines', GB: 'United Kingdom', AU: 'Australia', NZ: 'New Zealand', IE: 'Ireland', MX: 'Mexico', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', JP: 'Japan', KR: 'South Korea', SG: 'Singapore', NL: 'Netherlands', BR: 'Brazil', ZA: 'South Africa' };
  const ALIAS = { usa: 'US', america: 'US', 'united states of america': 'US', states: 'US', uk: 'GB', england: 'GB', britain: 'GB', 'great britain': 'GB', pinas: 'PH', pilipinas: 'PH', philippine: 'PH', filipino: 'PH', canadian: 'CA', american: 'US', bc: 'CA-BC', 'b.c.': 'CA-BC', pei: 'CA-PE', nyc: 'US-NY', korea: 'KR' };

  const country = (cc) => ({ key: cc, cc, sub: '', name: COUNTRIES[cc] || cc, full: COUNTRIES[cc] || cc, flag: flagOf(cc) });
  const subdivision = (cc, s) => ({ key: cc + '-' + s, cc, sub: cc + '-' + s, name: SUBS[cc][s], full: (COUNTRIES[cc] || cc) + ' · ' + SUBS[cc][s], flag: flagOf(cc) });
  function placeOf(key) {
    const [cc, s] = String(key).split('-');
    if (s && SUBS[cc] && SUBS[cc][s]) return subdivision(cc, s);
    return COUNTRIES[cc] ? country(cc) : null;
  }
  const QUICK = ['CA', 'CA-BC', 'US', 'PH'];

  const isWeb = () => !!(window.KAL && window.KAL.api);
  let countriesLoaded = false;
  async function loadCountries() {
    if (countriesLoaded || !isWeb()) return;
    countriesLoaded = true;
    try { const r = await KAL.api('GET', '/api/holidays/countries'); (r.countries || []).forEach((c) => { if (/^[A-Z]{2}$/.test(c.code)) COUNTRIES[c.code] = COUNTRIES[c.code] || c.name; }); }
    catch (e) { countriesLoaded = false; }
  }

  // "BC holidays" -> British Columbia. Returns the best places first.
  function search(text) {
    const q = String(text || '').toLowerCase().replace(/\b(public|stat|statutory|national|bank|holidays?|days?|the|in|of|for|my)\b/g, ' ').replace(/[^a-z.\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return [];
    const out = new Map();
    const add = (p, score) => { if (p && (!out.has(p.key) || out.get(p.key).score < score)) out.set(p.key, { p, score }); };
    if (ALIAS[q]) add(placeOf(ALIAS[q]), 100);
    Object.keys(COUNTRIES).forEach((cc) => {
      const n = COUNTRIES[cc].toLowerCase();
      if (n === q) add(country(cc), 98);
      else if (q === cc.toLowerCase()) add(country(cc), 90);
      else if (n.startsWith(q)) add(country(cc), 70);
      else if (q.length > 3 && (n.includes(q) || q.includes(n))) add(country(cc), 55);
    });
    Object.keys(SUBS).forEach((cc) => Object.keys(SUBS[cc]).forEach((s) => {
      const n = SUBS[cc][s].toLowerCase();
      if (n === q) add(subdivision(cc, s), 97);
      else if (q === s.toLowerCase()) add(subdivision(cc, s), cc === 'CA' ? 85 : 80);
      else if (n.startsWith(q)) add(subdivision(cc, s), 68);
      else if (q.length > 3 && (n.includes(q) || q.includes(n))) add(subdivision(cc, s), 52);
    }));
    return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.p);
  }

  /* ---------- getting the holidays ---------- */
  async function fromList(place, year) {
    const r = await KAL.api('GET', '/api/holidays/' + year + '/' + place.cc);
    const seen = new Set();
    return (r.holidays || []).filter((x) => x.global || (place.sub && (x.counties || []).includes(place.sub)))
      .map((x) => ({ date: x.date, title: x.name || x.localName, only: !x.global && place.sub ? place.sub.split('-')[1] : '' }))
      .filter((x) => { const k = x.date + x.title; if (seen.has(k) || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return false; seen.add(k); return true; })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async function fromAi(place, year) {
    const sample = window.claude && (await window.claude.use('sample'));
    if (!sample) throw { code: 'unavailable', userMessage: 'Holidays for this place are not available here.' };
    const res = await sample.json('List the official public holidays (days off) for ' + place.full + ' in ' + year + '. Use the real date for ' + year + ' for holidays that move each year. ' +
      'Reply with ONLY a JSON array like [{"date":"' + year + '-01-01","title":"New Year\'s Day"}].', { modelTier: 'quick', cache: false });
    const seen = new Set();
    return (Array.isArray(res) ? res : []).filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.date.startsWith(String(year)) && x.title)
      .map((x) => ({ date: x.date, title: String(x.title).trim().slice(0, 80), check: true }))
      .filter((x) => { const k = x.date + x.title; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  // Returns { list, ai } — ai is true when Claude found them (please check).
  async function fetchYear(place, year) {
    if (isWeb() && !place.ai) {
      try { const list = await fromList(place, year); if (list.length) return { list, ai: false }; }
      catch (e) { if (e && e.code !== 'not_found' && e.code !== 'holidays_down') throw e; }
    }
    return { list: await fromAi(place, year), ai: true };
  }

  /* ---------- saving ---------- */
  const sets = () => (Array.isArray(PL.state.settings.holidaySets) ? PL.state.settings.holidaySets : []);
  const ofSet = (key, year) => PL.state.holidays.filter((x) => x.set === key && (!year || x.date.startsWith(String(year))));
  async function saveYear(place, year, list, ai, auto) {
    for (const x of ofSet(place.key, year)) await PL.store.del('holidays', x.id);
    const n = {};
    for (const x of list) {
      n[x.date] = (n[x.date] || 0) + 1;
      if (!(await PL.store.set('holidays', place.key + '~' + x.date + '~' + n[x.date], { date: x.date, title: x.title, set: place.key, check: x.check }))) return false;
    }
    const all = sets().filter((s) => s.key !== place.key);
    const old = sets().find((s) => s.key === place.key);
    const years = [...new Set([...(old ? old.years : []), year])].sort();
    all.push({ key: place.key, name: place.name, full: place.full, flag: place.flag, years, auto: auto == null ? (old ? old.auto : true) : !!auto, ai: !!ai || undefined });
    return PL.store.saveSettings({ holidaySets: all });
  }
  async function removeSet(key) {
    for (const x of ofSet(key)) await PL.store.del('holidays', x.id);
    return PL.store.saveSettings({ holidaySets: sets().filter((s) => s.key !== key) });
  }

  // Next year's holidays add themselves in December (and this year's, if they were missed).
  let autoDone = false;
  async function ensureAuto() {
    if (autoDone || !PL.state.live || !sets().some((s) => s.auto)) return;
    autoDone = true;
    try { const u = window.claude && (await window.claude.use('user')); if (u && u.canEdit && !u.canEdit()) return; } catch (e) { return; }
    const now = new Date(), y = now.getFullYear();
    const want = now.getMonth() === 11 ? [y, y + 1] : [y];
    for (const s of sets().filter((x) => x.auto)) {
      const place = placeOf(s.key) || { key: s.key, cc: s.key.split('-')[0], sub: '', name: s.name, full: s.full || s.name, flag: s.flag, ai: true };
      for (const year of want) {
        if (s.years.includes(year) || Math.max(...s.years) > year) continue;
        try { const r = await fetchYear(place, year); if (r.list.length) await saveYear(place, year, r.list, r.ai, true); } catch (e) { /* try again next time */ }
      }
    }
  }
  PL.store && PL.store.subscribe && PL.store.subscribe(() => { if (PL.state.live && !autoDone) setTimeout(ensureAuto, 3000); });

  /* ---------- calendar ---------- */
  function instances(from, to) {
    const names = {};
    sets().forEach((s) => { names[s.key] = s; });
    return PL.state.holidays.filter((x) => x.date >= from && x.date <= to).map((x) => ({
      key: 'hol:' + x.id + '@' + x.date, id: 'hol:' + x.id, date: x.date, ev: null, virtual: true, kind: 'holiday',
      title: '🎉 ' + x.title, allDay: true, start: '', end: '', location: '', notes: '', color: COLOR, memberIds: [], reminder: null,
      set: x.set, setName: names[x.set] ? names[x.set].flag + ' ' + (names[x.set].full || names[x.set].name) : '', check: !!x.check
    }));
  }

  /* ---------- the "Add holidays" sheet ---------- */
  function openAdd(onDone) {
    loadCountries();
    const thisYear = new Date().getFullYear();
    let place = null, year = new Date().getMonth() >= 9 ? thisYear + 1 : thisYear, auto = true, rows = [], ai = false, busy = false, err = '';
    const input = h('input', { type: 'search', maxlength: '60', placeholder: 'For example: BC holidays', autocomplete: 'off', 'aria-label': 'Which holidays?', autofocus: true });
    const matches = h('div', { class: 'chip-row hol-chips' });
    const listBox = h('div', { class: 'hol-list' });
    const addBtn = ui.button('Add', { variant: 'primary', big: true, onClick: add });
    const total = h('span', { class: 'sub gc-total' });

    function chip(p, on) {
      return h('button', { type: 'button', class: 'person-pick hol-chip', 'aria-pressed': on ? 'true' : 'false', onclick: () => pick(p) }, p.flag + ' ' + p.name);
    }
    function paintChips(found) {
      const shown = found && found.length ? found : QUICK.map(placeOf);
      const typed = input.value.trim();
      const extra = typed && found && !found.length ? [h('button', { type: 'button', class: 'person-pick hol-chip', onclick: () => pick({ key: 'X-' + typed.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14), cc: 'X', sub: '', name: typed, full: typed, flag: '🎉', ai: true }) }, '✨ Look up “' + typed + '”')] : [];
      matches.replaceChildren(...shown.map((p) => chip(p, place && place.key === p.key)), ...extra);
    }
    function doSearch(e) {
      e && e.preventDefault();
      const found = search(input.value);
      paintChips(found);
      if (found.length) pick(found[0]);
      else if (input.value.trim()) { place = null; rows = []; paint(); }
    }
    input.addEventListener('input', () => { const f = search(input.value); paintChips(input.value.trim() ? f : null); });
    async function pick(p) {
      place = p; paintChips(search(input.value).length ? search(input.value) : null);
      await load();
    }
    async function load() {
      if (!place) return;
      busy = true; err = ''; rows = []; paint();
      try {
        const r = await fetchYear(place, year);
        ai = r.ai;
        rows = r.list.map((x) => Object.assign({ on: true }, x));
        if (!rows.length) err = 'No holidays came back for ' + place.full + ' in ' + year + '.';
      } catch (e) { err = (e && e.userMessage) || 'Could not get the holidays right now. Please try again.'; }
      busy = false; paint();
    }
    function paint() {
      const n = rows.filter((r) => r.on).length;
      addBtn.querySelector('span').textContent = n ? 'Add ' + n + (n === 1 ? ' holiday' : ' holidays') : 'Add';
      addBtn.disabled = !n || busy;
      total.textContent = n ? n + (n === 1 ? ' holiday' : ' holidays') : '';
      if (!place) { listBox.replaceChildren(h('p', { class: 'hint' }, input.value.trim() ? 'Nothing matched. Try a country or province name, like “Canada” or “Ontario”.' : 'Pick a place above, or type a country, province or state.')); return; }
      const years = h('div', { class: 'hol-years', role: 'group', 'aria-label': 'Year' }, [thisYear, thisYear + 1].map((y) =>
        h('button', { type: 'button', class: 'hol-year', 'aria-pressed': y === year ? 'true' : 'false', onclick: () => { if (year !== y) { year = y; load(); } } }, String(y))));
      const had = ofSet(place.key, year).length;
      listBox.replaceChildren(...[
        h('div', { class: 'hol-head' }, h('h3', {}, place.flag + ' ' + place.full), years),
        busy ? h('div', { class: 'cooking', role: 'status' }, h('span', { class: 'cooking-pot', 'aria-hidden': 'true' }, '🎉'), 'Getting the holidays…') : null,
        err ? h('p', { class: 'form-error', role: 'alert' }, err) : null,
        rows.length ? h('div', { class: 'hol-rows' }, rows.map((r) => {
          const cb = h('input', { type: 'checkbox', 'aria-label': r.title });
          cb.checked = r.on;
          cb.addEventListener('change', () => { r.on = cb.checked; row.classList.toggle('off', !r.on); paint(); });
          const row = h('label', { class: 'gc-row' + (r.on ? '' : ' off') }, cb, h('span', { class: 'hol-date' }, D.fmt(r.date, { weekday: 'short', month: 'short', day: 'numeric' })),
            h('span', { class: 'gc-text' }, '🎉 ' + r.title), r.only ? h('span', { class: 'hol-tag' }, r.only + ' only') : null);
          return row;
        })) : null,
        rows.length ? ui.toggle('Add next year’s holidays by itself', auto, (v) => { auto = v; }).el : null,
        rows.length ? h('p', { class: 'hol-src' + (ai ? ' ai' : '') }, ai ? '⚠ These dates were looked up by AI. Please check them.' : '✓ Dates from the official public holiday list') : null,
        had && rows.length ? h('p', { class: 'hint' }, 'You already have these. Adding again replaces them.') : null].filter(Boolean));
    }
    async function add() {
      const chosen = rows.filter((r) => r.on);
      if (!place || !chosen.length) return;
      addBtn.disabled = true;
      const ok = await saveYear(place, year, chosen, ai, auto);
      addBtn.disabled = false;
      if (ok) { s.close(); ui.toast(chosen.length + (chosen.length === 1 ? ' holiday' : ' holidays') + ' added to the calendar.'); onDone && onDone(); }
    }
    const s = ui.sheet({
      title: '🎉 Add holidays', wide: true,
      body: h('div', { class: 'event-form hol' },
        h('form', { class: 'hol-search', onsubmit: doSearch }, input, ui.button('Search', { variant: 'primary', type: 'submit', icon: 'search' })),
        matches, listBox),
      footer: [total, ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), addBtn]
    });
    paintChips(null); paint();
  }

  /* ---------- "Your holidays" ---------- */
  function openManage() {
    const body = h('div', { class: 'stack' });
    function paint() {
      const list = sets();
      if (!list.length) { body.replaceChildren(h('p', { class: 'sub' }, 'No holidays on the calendar yet.')); return; }
      body.replaceChildren(h('p', { class: 'sub' }, 'Holidays are pink, so they stand out from family events.'), ...list.map((x) => {
        const n = ofSet(x.key).length;
        const yrs = x.years.length > 1 ? x.years[0] + '–' + x.years[x.years.length - 1] : String(x.years[0] || '');
        return h('section', { class: 'hol-set' },
          h('div', { class: 'hol-set-head' }, h('strong', {}, x.flag + ' ' + (x.full || x.name) + ' · ' + yrs), h('span', { class: 'hol-count' }, n + (n === 1 ? ' day' : ' days'))),
          x.ai ? h('p', { class: 'hint' }, '⚠ Looked up by AI. Please check the dates.') : null,
          h('div', { class: 'hol-set-row' },
            ui.toggle('Add next year by itself (in December)', !!x.auto, async (v) => { await PL.store.saveSettings({ holidaySets: sets().map((y) => (y.key === x.key ? Object.assign({}, y, { auto: v }) : y)) }); }).el,
            ui.button('Remove all', { variant: 'danger', icon: 'trash', onClick: async () => {
              if (!(await ui.confirm({ title: 'Remove these holidays?', message: (x.full || x.name) + ': ' + n + (n === 1 ? ' day is' : ' days are') + ' taken off the calendar for everyone.', confirmLabel: 'Remove', danger: true }))) return;
              if (await removeSet(x.key)) { ui.toast('Holidays removed.'); setTimeout(paint, 50); }
            } })));
      }));
    }
    paint();
    const s = ui.sheet({ title: '🎉 Your holidays', wide: true, body,
      footer: [ui.button('Add more', { icon: 'plus', onClick: () => { s.close(); openAdd(); } }), ui.button('Done', { variant: 'primary', big: true, onClick: () => s.close() })] });
  }

  // The small pink bar above the calendar (only when holidays are on).
  function bar() {
    const list = sets();
    if (!list.length) return null;
    return h('div', { class: 'hol-bar' }, h('span', { class: 'hol-bar-label' }, '🎉 Holidays:'),
      list.map((x) => h('span', { class: 'hol-pill' }, x.flag + ' ' + x.name)),
      ui.button('Manage', { onClick: openManage }));
  }
  const open = () => (sets().length ? openManage() : openAdd());

  PL.holidays = { instances, openAdd, openManage, open, bar, search, color: COLOR, ensureAuto };
})();
