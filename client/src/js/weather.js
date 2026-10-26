/*
 * weather.js — a small weather card for Home, from the free Open-Meteo service.
 * It needs the page to be allowed to reach the internet. If that is blocked, the card
 * says so and shows the last saved weather instead. Nothing here is required by other screens.
 *   settings.weatherPlace = { name, lat, lon }     settings.tempUnit = 'c' | 'f'
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, ui = PL.ui, D = PL.D;
  const CODES = [
    [[0], '☀️', 'Clear'], [[1, 2], '🌤️', 'Mostly sunny'], [[3], '☁️', 'Cloudy'], [[45, 48], '🌫️', 'Foggy'],
    [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'], [[71, 73, 75, 77, 85, 86], '❄️', 'Snow'], [[95, 96, 99], '⛈️', 'Thunderstorms']
  ];
  const look = (code) => { const r = CODES.find((c) => c[0].includes(code)); return r ? { emoji: r[1], text: r[2] } : { emoji: '🌡️', text: '' }; };
  const unit = () => (PL.state.settings.tempUnit === 'f' ? 'f' : 'c');
  const deg = (n) => Math.round(n) + '°';

  async function getJson(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('bad status');
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function search(name) {
    const j = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(name));
    return (j.results || []).map((r) => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }));
  }

  async function load(place, u) {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto&temperature_unit=' + (u === 'f' ? 'fahrenheit' : 'celsius');
    const j = await getJson(url);
    const data = { at: Date.now(), now: { t: j.current.temperature_2m, code: j.current.weather_code },
      days: j.daily.time.map((d, i) => ({ date: d, code: j.daily.weather_code[i], hi: j.daily.temperature_2m_max[i], lo: j.daily.temperature_2m_min[i] })) };
    PL.storage.set('wx', { key: place.lat + ',' + place.lon + ',' + u, data });
    return data;
  }

  function paint(box, data, note) {
    const l = look(data.now.code);
    box.replaceChildren(h('div', { class: 'wx' },
      h('div', { class: 'wx-now' }, h('span', { class: 'wx-emoji', 'aria-hidden': 'true' }, l.emoji), h('div', {}, h('div', { class: 'wx-temp' }, deg(data.now.t)), h('div', { class: 'sub' }, l.text + (PL.state.settings.weatherPlace ? ' · ' + PL.state.settings.weatherPlace.name.split(',')[0] : '')))),
      h('div', { class: 'wx-days' }, data.days.map((d, i) => h('div', { class: 'wx-day' }, h('span', {}, i === 0 ? 'Today' : D.fmt(d.date, { weekday: 'short' })), h('span', { 'aria-hidden': 'true' }, look(d.code).emoji), h('b', {}, deg(d.hi)), h('span', { class: 'sub' }, deg(d.lo))))),
      note ? h('p', { class: 'hint' }, note) : null));
  }

  function widget() {
    const place = PL.state.settings.weatherPlace, u = unit();
    if (!place) return ui.emptyState({ icon: 'sun', title: 'Add your town', text: 'Choose a place to see today’s weather on Home.', action: ui.button('Choose a place', { icon: 'pin', onClick: () => openPlace() }) });
    const box = h('div', {});
    const key = place.lat + ',' + place.lon + ',' + u;
    const saved = PL.storage.get('wx', null);
    const cached = saved && saved.key === key ? saved.data : null;
    if (cached) paint(box, cached, Date.now() - cached.at > 3 * 3600000 ? 'Showing older weather.' : '');
    else box.append(h('p', { class: 'sub' }, 'Loading the weather…'));
    if (!cached || Date.now() - cached.at > 30 * 60000) {
      load(place, u).then((d) => { if (box.isConnected || true) paint(box, d); })
        .catch(() => { if (cached) paint(box, cached, 'Could not update. Showing the last saved weather.'); else box.replaceChildren(h('p', { class: 'sub' }, 'The weather could not be loaded. This page may not be allowed to reach the internet.')); });
    }
    return box;
  }

  function openPlace() {
    const q = h('input', { type: 'text', maxlength: '60', placeholder: 'Type a town or city', autocomplete: 'off', autofocus: true, 'aria-label': 'Town or city' });
    const out = h('div', { class: 'choices' });
    async function go() {
      const name = q.value.trim();
      if (!name) { q.focus(); return; }
      out.replaceChildren(h('p', { class: 'sub' }, 'Searching…'));
      try {
        const res = await search(name);
        if (!res.length) { out.replaceChildren(h('p', { class: 'sub' }, 'No place found. Try another spelling.')); return; }
        out.replaceChildren(...res.map((r) => h('button', { type: 'button', class: 'choice', onclick: async () => { if (await PL.store.saveSettings({ weatherPlace: r })) { s.close(); ui.toast('Weather place saved.'); } } }, h('strong', {}, r.name))));
      } catch (e) { out.replaceChildren(h('p', { class: 'form-error' }, 'The search could not be reached. This page may not be allowed to use the internet.')); }
    }
    const s = ui.sheet({ title: 'Weather place', body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); go(); } }, ui.field('Town or city', q), out),
      footer: [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Search', { variant: 'primary', big: true, onClick: go })] });
  }

  PL.weather = { widget, openPlace, unit };
})();
