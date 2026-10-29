/*
 * sky.js — the little animated sky next to the clock on Home and in wall mode (part of the Cozy look).
 * Drawn in the same thin-line doodle style as the page background:
 *   the sun moves across the sky with the real time of day (sunrise to sunset), then a moon and stars at night,
 *   and the current weather from the Weather box: sunny, windy, cloudy, rain, snow, thunderstorm.
 *
 *   PL.sky.el()  -> element; it animates itself and stops when removed from the page.
 * "Reduce motion" (Settings) keeps it still. No weather place set = just the sun or moon.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const NS = 'http://www.w3.org/2000/svg';
  const W = 580, H = 122;
  const CLOUD = 'M10 30 Q10 20 20 20 Q24 10 36 12 Q46 6 52 18 Q64 18 64 28 Q64 34 58 34 H16 Q10 34 10 30Z';
  const STARS = [[80, 30], [170, 14], [260, 40], [350, 18], [440, 34], [520, 20]];

  // Open-Meteo weather code -> kind of sky
  function kindOf(code) {
    if ([95, 96, 99].includes(code)) return 'storm';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    if ([3, 45, 48].includes(code)) return 'gloomy';
    if (code === 2) return 'partly';
    return 'sunny';
  }
  const mins = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const hm = (iso, dflt) => { const m = iso && /T(\d{2}):(\d{2})/.exec(iso); return m ? +m[1] * 60 + +m[2] : dflt; };

  function el() {
    const box = document.createElement('div');
    box.className = 'sky'; box.setAttribute('aria-hidden', 'true');
    const g = (cls, inner) => '<g class="' + cls + '">' + inner + '</g>';
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="' + NS + '">' +
      g('sky-sun', '<circle r="13"/><g class="sky-rays">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => '<path d="M0 -20 V-26" transform="rotate(' + a + ')"/>').join('') + '</g>') +
      g('sky-moon', '<path d="M10 -12 A14 14 0 1 0 12 10 A11 11 0 1 1 10 -12Z"/>') +
      g('sky-stars', STARS.map((s) => '<path d="M' + s[0] + ' ' + s[1] + ' m-4 0 h8 m-4 -4 v8"/>').join('')) +
      g('sky-clouds', [0, 1, 2, 3].map(() => '<g><path d="' + CLOUD + '"/></g>').join('')) +
      g('sky-rain', Array.from({ length: 18 }, () => '<path d="M0 0 l-4 11"/>').join('')) +
      g('sky-snow', Array.from({ length: 16 }, () => '<path d="M-4 0 h8 M0 -4 v8 M-3 -3 l6 6 M3 -3 l-6 6"/>').join('')) +
      g('sky-wind', Array.from({ length: 4 }, () => '<path d="M0 0 h40 q10 0 10 -7 q0 -6 -6 -6"/>').join('')) +
      g('sky-bolt', '<path d="M0 0 l-10 22 h10 l-6 20 l18 -28 h-10 l6 -14z"/>') + '</svg>';
    const q = (s) => box.querySelector(s), qa = (s) => [...box.querySelectorAll(s)];
    const sun = q('.sky-sun'), rays = q('.sky-rays'), moon = q('.sky-moon'), stars = qa('.sky-stars path'), starsG = q('.sky-stars');
    const clouds = qa('.sky-clouds > g'), rain = qa('.sky-rain path'), rainG = q('.sky-rain'), snow = qa('.sky-snow path'), snowG = q('.sky-snow');
    const wind = qa('.sky-wind path'), windG = q('.sky-wind'), bolt = q('.sky-bolt');
    const show = (n, on) => { n.style.display = on ? '' : 'none'; };

    let raf = 0, last = 0, wx = null, wxAt = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (!box.isConnected) { if (ts - last > 2000) cancelAnimationFrame(raf); return; }
      const still = document.documentElement.classList.contains('reduce-motion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (ts - last < (still ? 30000 : 50)) return; // about 20 frames a second, or once in a while when still
      last = ts;
      if (!wx || Date.now() - wxAt > 60000) { wx = PL.weather && PL.weather.current ? PL.weather.current() : null; wxAt = Date.now(); }
      const t = still ? 0 : ts / 1000; // seconds, for the gentle motion
      const now = PL.now(), m = mins(now);
      const rise = hm(wx && wx.sun && wx.sun.rise, 7 * 60), set = hm(wx && wx.sun && wx.sun.set, 19 * 60);
      const isDay = m >= rise && m < set;
      // where the sun (or moon) is on its arc, 0 = left, 1 = right
      const f = isDay ? (m - rise) / (set - rise) : ((m - set + 1440) % 1440) / (1440 - (set - rise));
      const x = 20 + 540 * f, y = 104 - 4 * f * (1 - f) * 62;
      const kind = wx ? kindOf(wx.now.code) : 'sunny';
      const windy = !!(wx && wx.now.wind >= 30);
      const dark = kind === 'gloomy' || kind === 'storm';

      show(sun, isDay); show(moon, !isDay); show(starsG, !isDay && (kind === 'sunny' || kind === 'partly'));
      if (isDay) { sun.setAttribute('transform', 'translate(' + x + ' ' + y + ')'); rays.setAttribute('transform', 'rotate(' + (t * 6 % 360) + ')'); sun.style.opacity = kind === 'sunny' || kind === 'partly' ? 1 : 0.45; }
      else { moon.setAttribute('transform', 'translate(' + x + ' ' + y + ')'); moon.style.opacity = kind === 'sunny' || kind === 'partly' ? 1 : 0.45; stars.forEach((s, i) => s.setAttribute('opacity', 0.3 + 0.7 * Math.abs(Math.sin(t * 0.8 + i * 1.7)))); }

      const nClouds = { sunny: 1, partly: 2, gloomy: 4, rain: 3, snow: 3, storm: 4 }[kind] + (windy && kind === 'sunny' ? 1 : 0);
      const cx = [60, 200, 330, 450], cy = [20, 8, 26, 12];
      clouds.forEach((c, i) => {
        show(c, i < nClouds);
        if (i < nClouds) c.setAttribute('transform', 'translate(' + (cx[i] + Math.sin(t * (windy ? 0.5 : 0.15) + i) * (windy ? 26 : 14)) + ' ' + cy[i] + ') scale(' + (dark ? 1.3 : 1) + ')');
      });
      box.classList.toggle('sky-dark', dark);

      const rainy = kind === 'rain' || kind === 'storm';
      show(rainG, rainy);
      if (rainy) rain.forEach((r, i) => { const p = (t * 0.9 + i * 0.37) % 1; r.setAttribute('transform', 'translate(' + (90 + (i % 9) * 45 + (i > 8 ? 20 : 0) - p * 10) + ' ' + (58 + p * 60) + ')'); r.setAttribute('opacity', p < 0.85 ? 1 : (1 - p) * 6); });
      show(snowG, kind === 'snow');
      if (kind === 'snow') snow.forEach((s, i) => { const p = (t * 0.18 + i * 0.41) % 1; s.setAttribute('transform', 'translate(' + (90 + (i % 8) * 55 + Math.sin(p * 6 + i) * 8) + ' ' + (56 + p * 62) + ') rotate(' + (p * 180) + ')'); });
      show(windG, windy);
      if (windy) wind.forEach((w, i) => { const p = (t * 0.25 + i * 0.27) % 1; w.setAttribute('transform', 'translate(' + (-40 + p * 620) + ' ' + (50 + i * 16) + ')'); w.setAttribute('opacity', Math.sin(p * Math.PI)); });
      show(bolt, kind === 'storm');
      if (kind === 'storm') { bolt.setAttribute('transform', 'translate(270 60)'); bolt.style.opacity = !still && Math.floor(t * 2) % 7 === 0 ? 1 : 0; }
    }
    raf = requestAnimationFrame(frame);
    return box;
  }

  PL.sky = { el, kindOf };
})();
