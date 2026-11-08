/*
 * sky.js — the little animated sky next to the clock on Home and in wall mode (part of the Cozy look).
 * It has its own colors (filled shapes), so it stands out from the thin-line doodles of the page background:
 *   the sun moves across the sky with the real time of day (sunrise to sunset), then a moon and twinkling stars at night,
 *   and the current weather from the Weather box: sunny, windy, cloudy, rain, snow, thunderstorm.
 * Everything moves so it can be seen: clouds drift across and come back around, the sun pulses, rain and snow fall,
 * lightning flashes every few seconds.
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
      g('sky-stars', STARS.map((s) => '<g transform="translate(' + s[0] + ' ' + s[1] + ')"><path d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z"/></g>').join('')) +
      g('sky-sun', '<circle class="sky-glow" r="22"/><g class="sky-rays">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => '<path d="M0 -19 V-27" transform="rotate(' + a + ')"/>').join('') + '</g><circle class="sky-disc" r="13"/>') +
      g('sky-moon', '<circle class="sky-glow" r="22"/><path class="sky-disc" d="M10 -12 A14 14 0 1 0 12 10 A11 11 0 1 1 10 -12Z"/>') +
      g('sky-clouds', [0, 1, 2, 3, 4].map(() => '<g><path d="' + CLOUD + '"/></g>').join('')) +
      g('sky-rain', Array.from({ length: 24 }, () => '<path d="M0 0 l-4 12"/>').join('')) +
      g('sky-snow', Array.from({ length: 20 }, () => '<g><circle r="4.5"/></g>').join('')) +
      g('sky-wind', Array.from({ length: 4 }, () => '<path d="M0 0 h40 q10 0 10 -7 q0 -6 -6 -6"/>').join('')) +
      g('sky-bolt', '<path d="M0 0 l-10 22 h10 l-6 20 l18 -28 h-10 l6 -14z"/>') + '</svg>';
    const q = (s) => box.querySelector(s), qa = (s) => [...box.querySelectorAll(s)];
    const sun = q('.sky-sun'), rays = q('.sky-rays'), sunGlow = q('.sky-sun .sky-glow'), moon = q('.sky-moon'), moonGlow = q('.sky-moon .sky-glow');
    const stars = qa('.sky-stars > g'), starsG = q('.sky-stars');
    const clouds = qa('.sky-clouds > g'), rain = qa('.sky-rain path'), rainG = q('.sky-rain'), snow = qa('.sky-snow > g'), snowG = q('.sky-snow');
    const wind = qa('.sky-wind path'), windG = q('.sky-wind'), bolt = q('.sky-bolt');
    const show = (n, on) => { n.style.display = on ? '' : 'none'; };

    let raf = 0, last = 0, wx = null, wxAt = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (!box.isConnected) { if (ts - last > 2000) cancelAnimationFrame(raf); return; }
      const still = document.documentElement.classList.contains('reduce-motion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (ts - last < (still ? 30000 : 33)) return; // about 30 frames a second, or once in a while when still
      last = ts;
      if (!wx || Date.now() - wxAt > 60000) { wx = PL.weather && PL.weather.current ? PL.weather.current() : null; wxAt = Date.now(); }
      const t = still ? 0 : ts / 1000; // seconds, for the motion
      const now = PL.now(), m = mins(now);
      const rise = hm(wx && wx.sun && wx.sun.rise, 7 * 60), set = hm(wx && wx.sun && wx.sun.set, 19 * 60);
      const isDay = m >= rise && m < set;
      const f = isDay ? (m - rise) / (set - rise) : ((m - set + 1440) % 1440) / (1440 - (set - rise));
      const x = 20 + 540 * f, y = 104 - 4 * f * (1 - f) * 62;
      const kind = wx ? kindOf(wx.now.code) : 'sunny';
      const windy = !!(wx && wx.now.wind >= 30);
      const dark = kind === 'gloomy' || kind === 'storm';
      const clear = kind === 'sunny' || kind === 'partly';
      const pulse = Math.sin(t * 2);

      show(sun, isDay); show(moon, !isDay); show(starsG, !isDay && clear);
      if (isDay) {
        sun.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + (1 + 0.06 * pulse) + ')');
        rays.setAttribute('transform', 'rotate(' + (t * 30 % 360) + ')');
        sunGlow.setAttribute('r', 21 + 4 * pulse);
        sun.style.opacity = clear ? 1 : 0.8;
      } else {
        moon.setAttribute('transform', 'translate(' + x + ' ' + (y + 3 * Math.sin(t * 1.2)) + ')');
        moonGlow.setAttribute('r', 20 + 4 * pulse);
        moon.style.opacity = clear ? 1 : 0.8;
        stars.forEach((s, i) => { const k = Math.sin(t * 2.4 + i * 1.7); s.setAttribute('opacity', 0.35 + 0.65 * Math.abs(k)); s.firstChild.setAttribute('transform', 'scale(' + (0.7 + 0.5 * Math.abs(k)) + ')'); });
      }

      // clouds drift across the whole sky and come back around
      const nClouds = { sunny: 1, partly: 2, gloomy: 5, rain: 4, snow: 4, storm: 5 }[kind] + (windy && kind === 'sunny' ? 1 : 0);
      const speed = windy ? 60 : 16, span = W + 140, cy = [18, 4, 26, 10, 22];
      const flash = kind === 'storm' && !still && (t % 4 < 0.12 || (t % 4 > 0.22 && t % 4 < 0.4));
      clouds.forEach((c, i) => {
        show(c, i < nClouds);
        if (i >= nClouds) return;
        const cx = ((i * span / nClouds + t * speed * (1 + i * 0.12)) % span) - 90;
        c.setAttribute('transform', 'translate(' + cx + ' ' + (cy[i] + 3 * Math.sin(t * 1.3 + i)) + ') scale(' + (dark ? 1.35 : 1.1) + ')');
        c.setAttribute('opacity', Math.min(1, (cx + 90) / 50, (W + 50 - cx) / 50));
      });
      box.classList.toggle('sky-dark', dark);
      box.classList.toggle('sky-flash', flash);

      const rainy = kind === 'rain' || kind === 'storm';
      show(rainG, rainy);
      if (rainy) rain.forEach((r, i) => { const p = (t * 1.6 + i * 0.37) % 1; r.setAttribute('transform', 'translate(' + (70 + (i % 12) * 38 + (i > 11 ? 18 : 0) - p * 14) + ' ' + (50 + p * 70) + ')'); r.setAttribute('opacity', p < 0.85 ? 1 : (1 - p) * 6); });
      show(snowG, kind === 'snow');
      if (kind === 'snow') snow.forEach((s, i) => { const p = (t * 0.35 + i * 0.41) % 1; s.setAttribute('transform', 'translate(' + (60 + (i % 10) * 48 + Math.sin(p * 7 + i) * 14) + ' ' + (48 + p * 74) + ') scale(' + (0.7 + (i % 3) * 0.2) + ')'); s.setAttribute('opacity', p < 0.85 ? 1 : (1 - p) * 6); });
      show(windG, windy);
      if (windy) wind.forEach((w, i) => { const p = (t * 0.5 + i * 0.27) % 1; w.setAttribute('transform', 'translate(' + (-40 + p * 620) + ' ' + (50 + i * 16) + ')'); w.setAttribute('opacity', Math.sin(p * Math.PI)); });
      show(bolt, kind === 'storm');
      if (kind === 'storm') { bolt.setAttribute('transform', 'translate(' + (200 + 140 * (Math.floor(t / 4) % 3)) + ' 52)'); bolt.style.opacity = flash ? 1 : 0; }
    }
    raf = requestAnimationFrame(frame);
    return box;
  }
  PL.sky = { el, kindOf };
})();
