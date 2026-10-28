/*
 * covers.js — drawn trip covers. Each trip gets a little scene that matches where it goes
 * (Japan → Mt Fuji, Banff → lake and mountains, "cruise" → a ship). No photos to download, nothing to pay for.
 *
 *   TR.covers.pick(trip)        -> scene key, from trip.cover_scene or the words in the name, destination and route
 *   TR.covers.el(key, cls)      -> a <div> that draws the scene at any size
 *   TR.covers.list              -> [{ key, name, level }] for the picker
 *
 * A scene is a sky gradient plus layers:
 *   lay(...)  stretches across the full width (hills, sea, ground) so it fits a card or a wide header
 *   mk(...)   keeps its shape (a tower, a palm tree) and sits at a spot
 *   parts marked "wide" only show when the cover is wide (the trip header), so it never looks empty.
 */
(function () {
  const TR = window.TR;

  /* ---------- drawing helpers (return SVG/HTML strings) ---------- */
  function pos(p) {
    if (p === 'c') return 'left:50%;transform:translateX(-50%);bottom:0';
    return p.split(' ').map((s) => {
      const k = { l: 'left', r: 'right', t: 'top', b: 'bottom' }[s[0]];
      return s[1] === 'x' ? 'left:50%;transform:translateX(-50%)' : k + ':' + s.slice(1) + '%';
    }).join(';');
  }
  const lay = (d, h) => '<svg class="cv-l" style="height:' + h + '%" viewBox="0 0 400 100" preserveAspectRatio="none">' + d + '</svg>';
  const mk = (d, w, hh, h, p, wide) => '<svg class="cv-m' + (wide ? ' cv-x' : '') + '" style="height:' + h + '%;' + pos(p) + '" viewBox="0 0 ' + w + ' ' + hh + '">' + d + '</svg>';
  const sun = (c, h, p) => mk('<circle cx="40" cy="40" r="34" fill="' + c + '"/>', 80, 80, h, p);
  const moon = (h, p) => mk('<circle cx="40" cy="40" r="30" fill="#F6E7C6"/>', 80, 80, h, p);
  const stars = () => [[8, 12], [18, 30], [27, 8], [41, 22], [56, 10], [66, 26], [78, 9], [88, 20], [95, 34]]
    .map((s, i) => '<i class="cv-star' + (i % 3 === 2 ? ' cv-x' : '') + '" style="left:' + s[0] + '%;top:' + s[1] + '%"></i>').join('');
  const cloud = (c) => '<path d="M10 30 Q10 18 24 18 Q28 6 44 8 Q58 2 66 16 Q82 14 84 28 Q84 34 76 34 H16 Q10 34 10 30Z" fill="' + (c || '#fff') + '" opacity=".9"/>';
  const clouds = (c) => mk(cloud(c), 90, 40, 20, 'l6 t14', true) + mk(cloud(c), 90, 40, 16, 'r30 t22', true);
  const palm = (c) => '<path d="M50 120 Q46 70 58 30" stroke="#7A5236" stroke-width="6" fill="none"/><path d="M58 30 Q30 18 6 34 Q30 26 58 30 Q40 6 14 6 Q42 12 58 30 Q70 2 98 4 Q72 14 58 30 Q90 16 112 36 Q84 26 58 30Z" fill="' + (c || '#2F8F5B') + '"/>';
  const PALM = (h, p, c) => mk(palm(c), 120, 120, h, p);
  const pine = (x, y, s, c) => '<path d="M' + x + ' ' + y + ' L' + (x + 6 * s) + ' ' + (y - 20 * s) + ' L' + (x + 12 * s) + ' ' + y + 'Z M' + (x + 1.5 * s) + ' ' + (y - 9 * s) + ' L' + (x + 6 * s) + ' ' + (y - 26 * s) + ' L' + (x + 10.5 * s) + ' ' + (y - 9 * s) + 'Z" fill="' + (c || '#2F5D46') + '"/>';
  const pines = (c) => pine(0, 100, 2.4, c) + pine(26, 100, 2, c) + pine(48, 100, 2.6, c);
  const PINES = (h, p, c, wide) => mk(pines(c), 80, 100, h, p, wide);
  const cypress = (c) => '<path d="M10 100 V40" stroke="#6B5A3A" stroke-width="2"/><ellipse cx="10" cy="40" rx="6" ry="24" fill="' + (c || '#5E7F4A') + '"/>';
  const CYP = (h, p, wide) => mk(cypress(), 20, 100, h, p, wide);
  const win = (x, y, c) => '<rect x="' + x + '" y="' + y + '" width="5" height="7" rx="1.5" fill="' + (c || '#4A5A6A') + '"/>';
  const hills = (c, y) => lay('<path d="M0 100 V' + y + ' Q100 ' + (y - 12) + ' 200 ' + (y - 2) + ' T400 ' + (y - 6) + ' V100Z" fill="' + c + '"/>', 60);
  const ground = (c, h) => lay('<path d="M0 100 V70 Q200 58 400 70 V100Z" fill="' + c + '"/>', h || 30);
  const sea = (c, y, h) => lay('<path d="M0 100 V' + y + ' H400 V100Z" fill="' + c + '"/><path d="M20 ' + (y + 8) + ' h40 M150 ' + (y + 14) + ' h60 M290 ' + (y + 6) + ' h50" stroke="#fff" stroke-width="1.5" opacity=".5"/>', h || 55);
  const skyline = (c, h, p) => mk([[0, 18, 40], [20, 14, 58], [36, 20, 46], [58, 12, 72], [72, 22, 52], [96, 16, 84], [114, 20, 44], [136, 14, 62], [152, 22, 38]]
    .map((b) => '<rect x="' + b[0] + '" y="' + (100 - b[2]) + '" width="' + b[1] + '" height="' + b[2] + '" fill="' + c + '"/>').join('') +
    [[4, 66], [24, 50], [40, 62], [62, 40], [62, 56], [78, 58], [100, 30], [104, 44], [118, 64], [140, 46], [156, 70]].map((w) => '<rect x="' + w[0] + '" y="' + w[1] + '" width="3" height="3" fill="#FFD98A"/>').join(''), 174, 100, h, p);
  const houses = (list, roof) => list.map((b) => '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + (100 - b[1]) + '" fill="' + b[3] + '"/>' +
    (roof === 'flat' ? '' : '<path d="M' + (b[0] - 3) + ' ' + b[1] + ' L' + (b[0] + b[2] / 2) + ' ' + (b[1] - 13) + ' L' + (b[0] + b[2] + 3) + ' ' + b[1] + 'Z" fill="' + (roof || '#C3532F') + '"/>') +
    win(b[0] + 6, b[1] + 10) + (b[2] > 26 ? win(b[0] + b[2] - 11, b[1] + 10) : '') + win(b[0] + b[2] / 2 - 2, b[1] + 26)).join('');
  const ROW = [[0, 40, 40, '#F7E6D0'], [46, 28, 34, '#FBEEDD'], [86, 46, 44, '#F3DCC2'], [136, 34, 30, '#FBEEDD'], [172, 48, 40, '#F7E6D0']];
  const lg = (...c) => 'linear-gradient(' + c.join(',') + ')';

  /* ---------- the scenes ---------- */
  const S = {};
  const add = (key, name, level, bg, parts) => { S[key] = { key, name, level, bg, parts: parts.join('') }; };

  // Level 1: famous places
  add('paris', 'Paris', 1, lg('#5E6FA8', '#E9A7A0 70%', '#F6CDA6'), [stars(),
    lay('<path d="M0 100 V66 h30 v-10 h20 v14 h25 v-18 h18 v20 h30 v-8 h22 v12 h40 v-16 h20 v14 h35 v-10 h25 v16 h40 v-12 h30 v10 h45 V100Z" fill="#4A4F7A" opacity=".55"/>', 60),
    mk('<path d="M30 2 L32 2 L34 30 L40 30 L44 52 L54 52 L62 100 L50 100 Q31 72 12 100 L0 100 L8 52 L18 52 L22 30 L28 30Z" fill="#2E3557"/><rect x="16" y="50" width="30" height="4" fill="#2E3557"/><rect x="22" y="28" width="18" height="3" fill="#2E3557"/>', 62, 100, 86, 'lx b6'),
    lay('<path d="M0 100 V84 Q200 76 400 84 V100Z" fill="#2E3557"/>', 30)]);
  add('london', 'London', 1, lg('#9DB7CF', '#E8E2D8 75%'), [clouds(),
    lay('<path d="M0 100 V70 h40 v-8 h30 v10 h50 v-14 h40 v12 h60 v-6 h70 v10 h50 v-12 h60 V100Z" fill="#8A97A8" opacity=".6"/>', 60),
    mk('<rect x="14" y="20" width="20" height="80" fill="#C2A36B"/><path d="M12 20 L24 0 L36 20Z" fill="#5A6470"/><circle cx="24" cy="34" r="7" fill="#F4EBD6" stroke="#5A6470" stroke-width="2"/><path d="M24 34 V29 M24 34 H28" stroke="#26302B" stroke-width="1.5"/><path d="M18 50 v40 M24 50 v40 M30 50 v40" stroke="#A88A55" stroke-width="1.5"/>', 48, 100, 84, 'l58 b8'),
    mk('<circle cx="40" cy="40" r="36" fill="none" stroke="#5A6470" stroke-width="3"/><path d="M40 4 V76 M4 40 H76 M14 14 L66 66 M66 14 L14 66" stroke="#5A6470" stroke-width="1.5"/><path d="M40 40 L28 98 M40 40 L52 98" stroke="#5A6470" stroke-width="3"/>', 80, 100, 60, 'l24 b10'),
    mk('<rect x="0" y="10" width="44" height="30" rx="5" fill="#D2443A"/><rect x="6" y="16" width="32" height="8" fill="#F4EBD6"/><circle cx="10" cy="42" r="4" fill="#26302B"/><circle cx="34" cy="42" r="4" fill="#26302B"/>', 44, 46, 22, 'r14 b10'),
    ground('#7E9A6A')]);
  add('rome', 'Rome', 1, lg('#F7B77A', '#FCE6C4 70%'), [sun('#FFF1C4', 34, 'r12 t10'),
    hills('#D9A86A', 70),
    mk('<path d="M0 100 V30 Q90 10 180 30 V100Z" fill="#D9A06A"/>' + [0, 1, 2, 3, 4, 5, 6].map((i) => '<path d="M' + (8 + i * 24) + ' 100 V' + (60) + ' a8 8 0 0 1 16 0 V100Z M' + (8 + i * 24) + ' 50 V40 a8 8 0 0 1 16 0 V50Z" fill="#B0773F"/>').join('') + '<path d="M0 30 Q90 10 180 30" stroke="#B0773F" stroke-width="3" fill="none"/>', 180, 100, 62, 'lx b10'),
    CYP(56, 'l10 b8'), CYP(46, 'l16 b8'), CYP(56, 'r12 b8', true), ground('#B7A060', 26)]);
  add('venice', 'Venice', 1, lg('#F2A97E', '#FBE3C8 70%'), [sun('#FFE7B0', 30, 'l14 t10'),
    mk(houses([[0, 40, 34, '#E9806E'], [36, 30, 30, '#F2C14E'], [68, 44, 36, '#F6E3C6'], [106, 34, 28, '#D9785E'], [136, 46, 34, '#F2C14E']], '#8A4A3A'), 172, 100, 66, 'lx b24'),
    sea('#3E8FA8', 72, 34),
    mk('<path d="M0 14 Q40 24 80 14 L76 20 Q40 30 4 20Z" fill="#26302B"/><path d="M62 18 V-2" stroke="#26302B" stroke-width="2"/><path d="M40 16 l-2 -14 l4 0Z" fill="#D2443A"/>', 80, 32, 16, 'l30 b8')]);
  add('spain', 'Spain', 1, lg('#FFB36B', '#FFE0A3 75%'), [sun('#FFF3C4', 42, 'r14 t10'),
    lay('<path d="M0 100 V62 Q90 50 180 60 T400 56 V100Z" fill="#E59A5C"/>', 60),
    mk(houses(ROW), 212, 100, 62, 'c'), mk(houses(ROW), 212, 100, 44, 'l6 b0', true), mk(houses(ROW), 212, 100, 50, 'r22 b0', true),
    CYP(70, 'l32 b0', true), CYP(60, 'r12 b0', true)]);
  add('amsterdam', 'Amsterdam', 1, lg('#A9CBE6', '#EEF3F6 75%'), [clouds(),
    mk([[0, 30, 26, '#8A4A3A'], [28, 22, 24, '#2E4A5E'], [54, 34, 26, '#C8763C'], [82, 26, 24, '#5E7F4A'], [108, 32, 26, '#8A4A3A'], [136, 24, 24, '#2E4A5E']].map((b) => '<path d="M' + b[0] + ' 100 V' + b[1] + ' l' + b[2] / 2 + ' -14 l' + b[2] / 2 + ' 14 V100Z" fill="' + b[3] + '"/>' + win(b[0] + 5, b[1] + 8, '#F4EBD6') + win(b[0] + b[2] - 10, b[1] + 8, '#F4EBD6') + win(b[0] + 5, b[1] + 26, '#F4EBD6') + win(b[0] + b[2] - 10, b[1] + 26, '#F4EBD6')).join(''), 160, 100, 64, 'lx b24'),
    sea('#4E7C98', 74, 30),
    mk('<circle cx="10" cy="20" r="8" fill="none" stroke="#26302B" stroke-width="2"/><circle cx="36" cy="20" r="8" fill="none" stroke="#26302B" stroke-width="2"/><path d="M10 20 L20 8 L30 8 L36 20 M20 8 L24 20" stroke="#D2443A" stroke-width="2" fill="none"/>', 46, 30, 16, 'r12 b26')]);
  add('greece', 'Greece', 1, lg('#7CC6F2', '#E8F6FF 70%'), [sun('#FFF6D0', 28, 'r12 t8'),
    sea('#1F7FB8', 64),
    mk([[0, 56, 34], [30, 44, 30], [58, 60, 36], [92, 40, 28], [118, 54, 40], [156, 48, 30], [184, 62, 34]].map((b) => '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + (100 - b[1]) + '" rx="2" fill="#fff"/>').join('') +
      '<path d="M96 40 A12 12 0 0 1 116 40Z M160 48 A11 11 0 0 1 182 48Z" fill="#2B67C6"/><path d="M106 18 v10 M102 22 h8" stroke="#2B67C6" stroke-width="2"/>' + [[10, 70], [40, 58], [70, 74], [100, 56], [130, 68], [166, 62], [196, 74]].map((w) => win(w[0], w[1], '#2B67C6')).join(''), 220, 100, 66, 'lx b0'),
    mk('<path d="M0 100 V50 Q60 30 140 46 V100Z" fill="#C9A06A"/>' + [[10, 52, 24], [36, 44, 22], [60, 54, 26], [90, 46, 22]].map((b) => '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + (100 - b[1]) + '" fill="#fff"/>' + win(b[0] + 6, b[1] + 10, '#2B67C6')).join('') + '<path d="M40 44 A9 9 0 0 1 56 44Z" fill="#2B67C6"/>', 140, 100, 56, 'l0 b0', true),
    mk('<path d="M0 30 Q40 40 80 30 L74 38 Q40 44 6 38Z" fill="#fff"/><path d="M40 30 V0 L64 26Z" fill="#fff"/>', 80, 46, 18, 'r22 b14', true),
    lay('<path d="M0 100 V92 H400 V100Z" fill="#E8DCC8"/>', 20)]);
  add('iceland', 'Iceland', 1, lg('#22304F', '#3E6B7A 60%', '#9AD3B8'), [stars(),
    lay('<path d="M0 30 Q100 10 200 34 T400 24" stroke="#7FF0C0" stroke-width="10" fill="none" opacity=".45"/><path d="M0 40 Q120 22 220 44 T400 36" stroke="#B9A8FF" stroke-width="6" fill="none" opacity=".35"/>', 100),
    lay('<path d="M0 100 V60 L70 40 L140 62 L230 30 L310 58 L400 44 V100Z" fill="#2A3A4A"/><path d="M215 36 L230 30 L246 38 L232 42Z" fill="#E8F2F6"/>', 70),
    mk('<rect x="0" y="16" width="30" height="16" fill="#D2443A"/><path d="M-3 18 L15 6 L33 18Z" fill="#26302B"/><rect x="40" y="22" width="2" height="10" fill="#fff"/>', 44, 32, 16, 'l22 b14'),
    ground('#1E2A36', 26)]);
  add('alps', 'Swiss Alps', 1, lg('#8EC5EE', '#E6F3FB 70%'), [clouds(),
    lay('<path d="M0 100 V54 L60 30 L110 50 L180 8 L240 46 L300 22 L360 44 L400 34 V100Z" fill="#9AAFC6"/><path d="M168 18 L180 8 L194 20 L180 24Z M290 28 L300 22 L312 30Z" fill="#fff"/>', 85),
    hills('#7DBA6A', 76), PINES(34, 'l4 b6'), PINES(30, 'r8 b6', '#2F5D46', true),
    mk('<rect x="6" y="18" width="34" height="20" fill="#8A5A3C"/><path d="M0 20 L23 4 L46 20Z" fill="#5A3A2A"/>' + win(12, 24, '#F4EBD6') + win(28, 24, '#F4EBD6'), 46, 40, 20, 'l40 b14')]);
  add('new-york', 'New York', 1, lg('#2B3C6B', '#E28E6B 80%'), [stars(),
    mk('<path d="M14 100 V60 h-4 l10 -40 l10 40 h-4 V100Z" fill="#3E8A7A"/><path d="M20 20 l-2 -10 l4 0Z M24 22 l8 -14" stroke="#3E8A7A" stroke-width="3"/><circle cx="33" cy="7" r="3" fill="#FFD98A"/>', 40, 100, 50, 'l10 b14'),
    skyline('#2F3358', 78, 'lx b12'), skyline('#3B3F66', 50, 'r4 b12', true),
    lay('<path d="M0 100 V84 H400 V100Z" fill="#26294A"/><path d="M40 90 h50 M180 94 h60 M300 90 h50" stroke="#E28E6B" stroke-width="1.5" opacity=".6"/>', 30)]);
  add('las-vegas', 'Las Vegas', 1, lg('#1F1A3E', '#7A3E8A 65%', '#F27A6A'), [stars(),
    lay('<path d="M0 100 V60 L80 44 L160 60 L260 40 L400 58 V100Z" fill="#3A2A5A"/>', 60),
    mk('<path d="M0 100 V40 H24 V100Z" fill="#2A2050"/><path d="M30 100 V20 L44 10 L58 20 V100Z" fill="#3A2E68"/><path d="M64 100 V50 L84 30 L104 50 V100Z" fill="#2A2050"/><path d="M110 100 V34 H130 V100Z" fill="#3A2E68"/>' +
      '<path d="M6 46 h12 M36 30 h16 M72 56 h24 M114 40 h12" stroke="#FF5FA2" stroke-width="2"/><path d="M6 56 h12 M36 44 h16 M72 66 h24" stroke="#5FE0FF" stroke-width="2"/>', 136, 100, 72, 'lx b14'),
    mk('<path d="M20 0 L40 10 L20 20 L0 10Z" fill="#FFD666"/><rect x="18" y="20" width="4" height="40" fill="#FFD666"/>', 40, 60, 40, 'r14 b14'),
    ground('#2A1E44', 24)]);
  add('san-francisco', 'San Francisco', 1, lg('#FFC69A', '#FDEBD6 60%', '#C9E2EE'), [
    lay('<path d="M0 100 V58 Q60 40 120 56 Q200 70 260 50 Q330 34 400 52 V100Z" fill="#8FA88A"/>', 60),
    sea('#4E8FB0', 70, 40),
    lay('<path d="M0 64 H400" stroke="#D2443A" stroke-width="3"/><path d="M90 64 V14 M100 64 V14 M290 64 V14 M300 64 V14" stroke="#D2443A" stroke-width="5"/><path d="M0 50 Q95 70 95 16 Q195 70 295 16 Q295 70 400 50" stroke="#D2443A" stroke-width="2" fill="none"/>', 80),
    mk(cloud('#fff'), 90, 40, 26, 'l40 t30')]);
  add('hawaii', 'Hawaii', 1, lg('#FF9E7A', '#FFD9B0 55%', '#9FE0E8'), [sun('#FFF0B8', 44, 'l40 t14'),
    lay('<path d="M220 60 Q270 10 330 18 Q370 26 400 50 V60Z" fill="#3E7A5A"/>', 100),
    sea('#21A6B8', 62), lay('<path d="M0 100 V80 Q140 68 260 78 T400 74 V100Z" fill="#F6DFAE"/>', 40),
    PALM(90, 'l4 b-4'), PALM(70, 'r30 b0', '#3E9A5E'), mk('<path d="M20 30 Q10 20 20 10 Q30 20 20 30Z M20 10 Q30 0 40 10 Q30 20 20 10Z" fill="#FF7FA0"/><circle cx="21" cy="17" r="3" fill="#FFD666"/>', 44, 32, 12, 'l20 b10', true)]);
  add('mexico', 'Mexico', 1, lg('#FFAE6E', '#FFE6B8 70%'), [sun('#FFF3C4', 34, 'r14 t8'),
    hills('#8DB36A', 72),
    mk('<path d="M10 100 L24 70 H136 L150 100Z" fill="#C9A06A"/><path d="M28 70 L40 46 H120 L132 70Z" fill="#D8B07A"/><path d="M44 46 L54 26 H106 L116 46Z" fill="#C9A06A"/><rect x="62" y="10" width="36" height="16" fill="#B0773F"/><path d="M72 100 L76 26 H84 L88 100Z" fill="#A86E3C"/>', 160, 100, 70, 'lx b10'),
    mk('<path d="M14 100 V40 M14 60 Q4 56 4 44 M14 70 Q24 64 24 52" stroke="#4A8A5A" stroke-width="6" fill="none" stroke-linecap="round"/>', 30, 100, 44, 'l10 b6'),
    ground('#7FA65A', 22)]);
  add('japan', 'Japan', 1, lg('#F9D3D8', '#FCE9DE 70%'), [
    lay('<path d="M0 100 V70 Q100 60 200 72 T400 66 V100Z" fill="#E9B7C3"/>', 60),
    mk('<path d="M0 80 L70 18 Q80 10 90 18 L160 80Z" fill="#7C8FB5"/><path d="M52 34 L70 18 Q80 10 90 18 L108 34 L98 40 L88 32 L80 40 L70 32 L60 40Z" fill="#fff"/>', 160, 80, 78, 'lx b18'),
    mk('<rect x="12" y="10" width="76" height="8" rx="3" fill="#D2443A"/><rect x="18" y="22" width="64" height="5" fill="#D2443A"/><rect x="24" y="14" width="7" height="66" fill="#D2443A"/><rect x="69" y="14" width="7" height="66" fill="#D2443A"/>', 100, 80, 46, 'r12 b14'),
    lay('<path d="M0 100 V80 Q120 70 240 82 T400 78 V100Z" fill="#8FB59A"/>', 40),
    mk([[20, 20, 16, '#F4A7BB'], [42, 12, 13, '#F8BFCD'], [10, 40, 12, '#F8BFCD'], [36, 34, 14, '#F4A7BB'], [60, 26, 10, '#FAD0DA']].map((c) => '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="' + c[3] + '"/>').join('') + '<path d="M0 60 Q30 40 70 30" stroke="#6B4A3A" stroke-width="3" fill="none"/>', 80, 70, 70, 'l0 t-6'),
    mk('<path d="M30 100 V20 M18 20 H42 L36 12 H24Z M14 44 H46 L38 34 H22Z M10 70 H50 L42 58 H18Z" fill="#8A4A3A" stroke="#8A4A3A" stroke-width="2"/><path d="M22 20 V100 M38 20 V100" stroke="#8A4A3A" stroke-width="3"/>', 60, 100, 56, 'l24 b18', true),
    mk([[60, 20, 16, '#F4A7BB'], [38, 12, 13, '#F8BFCD'], [70, 40, 12, '#F8BFCD'], [44, 34, 14, '#F4A7BB']].map((c) => '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="' + c[3] + '"/>').join('') + '<path d="M80 60 Q50 40 10 30" stroke="#6B4A3A" stroke-width="3" fill="none"/>', 80, 70, 60, 'r0 t-6', true)]);
  add('korea', 'Korea', 1, lg('#BFD8EE', '#F4EEE6 70%'), [clouds(),
    lay('<path d="M0 100 V50 Q60 30 120 46 T260 40 T400 44 V100Z" fill="#A7B7A0"/>', 70),
    mk('<path d="M0 34 Q80 20 160 34 L150 40 H10Z" fill="#3E5A50"/><rect x="18" y="40" width="124" height="8" fill="#D2443A"/><rect x="24" y="48" width="112" height="22" fill="#F4EBD6"/>' + [30, 52, 74, 96, 118].map((x) => '<rect x="' + x + '" y="48" width="4" height="22" fill="#D2443A"/>').join('') +
      '<path d="M8 70 Q80 58 152 70 L144 76 H16Z" fill="#3E5A50"/><rect x="20" y="76" width="120" height="24" fill="#E9DCC6"/><rect x="66" y="82" width="28" height="18" fill="#8A4A3A"/>', 160, 100, 66, 'lx b6'),
    ground('#8DA07A', 20)]);
  add('china', 'China', 1, lg('#F6C58E', '#FCEBD3 70%'), [sun('#FFE7B0', 30, 'l14 t10'),
    lay('<path d="M0 100 V56 Q50 30 100 50 Q150 70 200 40 Q260 14 320 46 Q360 60 400 42 V100Z" fill="#8FA06A"/>', 80),
    lay('<path d="M0 74 Q50 60 100 66 Q150 72 200 54 Q260 36 320 58 Q360 66 400 56" stroke="#C9A97A" stroke-width="6" fill="none"/><path d="M98 62 v-8 h8 v8 M196 52 v-8 h8 v8 M318 54 v-8 h8 v8" fill="#B08A5A" stroke="#B08A5A" stroke-width="2"/>', 80),
    lay('<path d="M0 100 V84 Q200 74 400 84 V100Z" fill="#6E8A54"/>', 30)]);
  add('thailand', 'Thailand', 1, lg('#FFB07A', '#FFE9C8 70%'), [sun('#FFE6A8', 36, 'r16 t12'),
    lay('<path d="M260 64 Q290 20 320 64Z M310 64 Q340 30 380 64Z" fill="#3E7A5A"/>', 100),
    sea('#2AA3B8', 64),
    mk('<path d="M0 40 Q60 54 120 40 L110 50 Q60 60 14 50Z" fill="#8A5A3C"/><path d="M0 40 Q-4 30 4 22" stroke="#8A5A3C" stroke-width="3" fill="none"/><rect x="40" y="30" width="44" height="12" rx="3" fill="#2E5A80"/><path d="M8 26 l6 4" stroke="#FF7FA0" stroke-width="4"/>', 124, 62, 26, 'l20 b22'),
    PALM(80, 'l0 b-4')]);
  add('bali', 'Bali', 1, lg('#FFC18A', '#FFF0D6 70%'), [
    lay('<path d="M0 100 V40 Q100 20 200 36 T400 30 V100Z" fill="#6FA35E"/>', 80),
    lay('<path d="M0 64 Q100 56 200 64 T400 60 M0 74 Q100 66 200 74 T400 70 M0 84 Q100 76 200 84 T400 80" stroke="#9CCB6E" stroke-width="5" fill="none"/>', 80),
    mk('<path d="M0 100 V64 H6 V44 H12 V26 H18 V8 H26 V100Z" fill="#7A4A32"/><path d="M58 100 V64 H52 V44 H46 V26 H40 V8 H32 V100Z" fill="#7A4A32"/><path d="M0 64 H26 M0 44 H26 M32 64 H58 M32 44 H58" stroke="#5A3424" stroke-width="2"/>', 58, 100, 74, 'l58 b10'),
    PALM(76, 'l4 b0')]);
  add('philippines', 'Philippines', 1, lg('#FFB98A', '#FFE7C2 60%'), [sun('#FFF1B8', 40, 'l46 t16'),
    lay('<path d="M0 100 V60 H400 V100Z" fill="#2AA3B8"/><path d="M250 60 Q290 30 330 60Z M300 60 Q340 20 400 46 V60Z" fill="#3E8A62"/>', 60),
    mk('<path d="M10 40 Q60 52 110 40 L100 48 Q60 56 20 48Z" fill="#F6F0E4"/><path d="M0 42 Q60 30 120 42" stroke="#8A5A3C" stroke-width="2" fill="none"/><path d="M58 40 V8 L84 34Z" fill="#E9573F"/><path d="M58 40 V12" stroke="#5A3A2A" stroke-width="2"/>', 120, 60, 34, 'l24 b26'),
    PALM(92, 'l2 b-6'), PALM(70, 'r40 b-4', '#3E9A5E'),
    mk('<path d="M10 40 Q60 52 110 40 L100 48 Q60 56 20 48Z" fill="#F6F0E4"/><path d="M0 42 Q60 30 120 42" stroke="#8A5A3C" stroke-width="2" fill="none"/><path d="M58 40 V8 L84 34Z" fill="#F2C14E"/>', 120, 60, 22, 'l62 b34', true)]);
  add('vietnam', 'Vietnam', 1, lg('#C9DDE0', '#F2EDE2 70%'), [
    lay('<path d="M20 70 Q30 20 50 30 Q60 60 70 70Z M110 70 Q120 10 150 24 Q164 50 170 70Z M230 70 Q246 30 266 36 Q274 56 280 70Z M320 70 Q336 20 360 30 Q372 56 380 70Z" fill="#7A9A8A"/>', 90),
    sea('#5E9AA0', 68, 40),
    mk('<path d="M0 30 Q40 40 80 30 L74 38 Q40 44 6 38Z" fill="#8A4A3A"/><path d="M40 30 V0 Q56 12 52 28Z" fill="#E9A15E"/>', 80, 46, 22, 'l30 b16')]);
  add('singapore', 'Singapore', 1, lg('#2A3F6E', '#6E8ABF 60%', '#F2B48C'), [stars(),
    skyline('#3B4A78', 52, 'l4 b16', true),
    mk('<rect x="0" y="20" width="18" height="80" fill="#5A6A98"/><rect x="34" y="20" width="18" height="80" fill="#5A6A98"/><rect x="68" y="20" width="18" height="80" fill="#5A6A98"/><path d="M-4 14 Q43 6 90 14 L90 22 H-4Z" fill="#7A8AB8"/>', 90, 100, 72, 'lx b16'),
    mk('<path d="M20 100 V50 Q10 40 20 30 Q30 40 20 50" stroke="#7FD3C0" stroke-width="5" fill="none"/><path d="M10 34 Q20 10 30 34" fill="#7FD3C0"/>', 40, 100, 44, 'r16 b16'),
    sea('#1E2E54', 80, 30)]);
  add('dubai', 'Dubai', 1, lg('#F7A35C', '#FCE0A8 70%'), [sun('#FFF3C4', 32, 'l14 t12'),
    lay('<path d="M0 100 V70 Q120 60 240 70 T400 66 V100Z" fill="#E8B26A"/>', 60),
    mk('<path d="M18 100 L22 30 L24 0 L26 30 L30 100Z" fill="#7A8AA0"/><path d="M14 100 L19 60 H29 L34 100Z" fill="#8A9AB0"/>', 48, 100, 90, 'lx b10'),
    skyline('#9AA6B8', 40, 'r10 b10'), skyline('#9AA6B8', 34, 'l8 b10', true),
    ground('#D9A15A', 24)]);
  add('egypt', 'Egypt', 1, lg('#F7A35C', '#FCE0A8 70%'), [sun('#FFF3C4', 34, 'r16 t12'),
    lay('<path d="M0 100 V72 Q120 62 240 70 T400 66 V100Z" fill="#E8B26A"/>', 60),
    mk('<path d="M0 100 L60 30 L120 100Z" fill="#D9984F"/><path d="M60 30 L120 100 L80 100Z" fill="#C08040"/><path d="M110 100 L150 56 L190 100Z" fill="#D9984F"/><path d="M150 56 L190 100 L164 100Z" fill="#C08040"/><path d="M180 100 L204 74 L228 100Z" fill="#D9984F"/>', 228, 100, 74, 'lx b10'),
    PALM(46, 'l6 b6', '#5E8A4A'), lay('<path d="M0 100 V86 Q200 80 400 88 V100Z" fill="#D9A15A"/>', 30)]);
  add('morocco', 'Morocco', 1, lg('#F28C5C', '#FBD7A8 70%'), [sun('#FFE9B8', 32, 'r12 t10'),
    mk('<rect x="0" y="30" width="40" height="70" fill="#D9785E"/><rect x="36" y="44" width="50" height="56" fill="#E9906E"/><rect x="84" y="24" width="34" height="76" fill="#D9785E"/><rect x="116" y="40" width="44" height="60" fill="#E9906E"/>' +
      '<path d="M10 50 a6 6 0 0 1 12 0 v10 h-12Z M50 60 a6 6 0 0 1 12 0 v10 h-12Z M94 40 a6 6 0 0 1 12 0 v10 h-12Z M128 56 a6 6 0 0 1 12 0 v10 h-12Z" fill="#2E6E8A"/><rect x="92" y="0" width="16" height="26" fill="#C9684E"/><path d="M90 0 h20 v4 h-20Z" fill="#B05A40"/>', 160, 100, 66, 'lx b10'),
    PALM(56, 'l8 b6', '#5E8A4A'), PALM(50, 'r10 b6', '#5E8A4A'),
    ground('#C9784E', 22)]);
  add('peru', 'Peru', 1, lg('#A8CFE0', '#EEF2E6 70%'), [clouds(),
    lay('<path d="M0 100 V50 L60 30 L120 54 L190 12 L240 40 L300 26 L400 50 V100Z" fill="#6F9A6A"/><path d="M170 26 Q190 4 214 26 Q200 40 190 40Z" fill="#4E7A52"/>', 85),
    mk('<path d="M0 30 h20 v-10 h20 v10 h30 v-8 h24 v8 h20 v70 h-114Z" fill="#B9AE98"/><path d="M0 50 h114 M0 70 h114" stroke="#9A8E78" stroke-width="2"/>', 114, 100, 34, 'l26 b18'),
    lay('<path d="M0 100 V80 Q200 70 400 80 V100Z" fill="#5E8A5A"/>', 30)]);
  add('rio', 'Rio de Janeiro', 1, lg('#FFB48A', '#FFE7CE 60%', '#A6DDE8'), [
    lay('<path d="M240 60 Q260 10 290 14 Q310 20 300 60Z M300 60 Q320 34 350 40 Q370 48 380 60Z" fill="#3E6A5A"/><path d="M40 60 Q80 20 120 30 Q150 40 170 60Z" fill="#4E7A62"/>', 90),
    mk('<path d="M18 4 h4 v6 h14 v4 h-14 v26 h-4 v-26 h-14 v-4 h14Z" fill="#F4EBD6"/>', 40, 40, 22, 'l26 t10'),
    sea('#2E9AB8', 62), lay('<path d="M0 100 V82 Q140 72 260 80 T400 76 V100Z" fill="#F6DFAE"/>', 40),
    PALM(70, 'r6 b0')]);
  add('sydney', 'Sydney', 1, lg('#7FC3EA', '#E6F6FF 70%'), [clouds(),
    lay('<path d="M220 66 Q300 10 380 66" stroke="#5A6470" stroke-width="4" fill="none"/><path d="M220 66 H380" stroke="#5A6470" stroke-width="3"/>', 90),
    mk('<path d="M0 60 Q20 0 46 60Z" fill="#fff"/><path d="M30 60 Q54 6 80 60Z" fill="#F4F4F4"/><path d="M64 60 Q86 16 110 60Z" fill="#fff"/><path d="M0 60 H116 V68 H0Z" fill="#C9B79C"/>', 116, 70, 50, 'l20 b26'),
    sea('#1F7FB8', 72, 34)]);
  add('new-zealand', 'New Zealand', 1, lg('#9ED0EE', '#EAF6FA 70%'), [clouds(),
    lay('<path d="M0 100 V44 L70 18 L130 40 L200 10 L270 38 L340 20 L400 40 V100Z" fill="#7A8EA8"/><path d="M190 16 L200 10 L212 18Z M332 24 L340 20 L350 26Z" fill="#fff"/>', 85),
    lay('<path d="M0 100 V60 Q100 44 200 58 T400 52 V100Z" fill="#7DBA5A"/>', 60),
    mk('<ellipse cx="12" cy="14" rx="10" ry="7" fill="#fff"/><circle cx="22" cy="10" r="4" fill="#fff"/><path d="M6 20 v6 M16 20 v6" stroke="#26302B" stroke-width="2"/>', 30, 28, 10, 'l30 b16'),
    mk('<ellipse cx="12" cy="14" rx="10" ry="7" fill="#fff"/><circle cx="22" cy="10" r="4" fill="#fff"/><path d="M6 20 v6 M16 20 v6" stroke="#26302B" stroke-width="2"/>', 30, 28, 8, 'l40 b20'),
    ground('#5E9A4A', 22)]);
  add('banff', 'Banff', 1, lg('#9FD0F0', '#E7F4FB 70%'), [clouds(),
    lay('<path d="M0 100 V55 L50 25 L90 48 L150 12 L210 50 L260 22 L320 46 L370 20 L400 34 V100Z" fill="#A7B8CC"/><path d="M140 18 L150 12 L162 20 L154 24Z M252 27 L260 22 L270 28Z M362 25 L370 20 L380 26Z" fill="#fff"/>', 80),
    lay('<path d="M0 100 V70 H400 V100Z" fill="#4FA3B8"/><path d="M30 76 h60 M150 82 h80 M290 78 h70" stroke="#CFEFF5" stroke-width="2"/>', 45),
    PINES(46, 'l0 b0'), PINES(46, 'r0 b0'),
    mk('<path d="M0 30 Q30 38 60 30 L56 36 Q30 42 4 36Z" fill="#D2443A"/>', 60, 44, 10, 'l44 b10')]);
  add('vancouver', 'Vancouver', 1, lg('#A9D4EE', '#EAF4F8 70%'), [clouds(),
    lay('<path d="M0 100 V40 L60 20 L120 38 L200 14 L280 36 L340 18 L400 30 V100Z" fill="#8CA0B8"/><path d="M190 18 L200 14 L212 20Z" fill="#fff"/>', 80),
    skyline('#5A7A98', 54, 'l24 b22'), skyline('#5A7A98', 40, 'r10 b22', true),
    sea('#3E8AA8', 76, 30), PINES(40, 'l0 b0', '#2F5D46'), PINES(36, 'r0 b0', '#2F5D46', true)]);
  add('toronto', 'Toronto', 1, lg('#FFB38A', '#FCE6D6 60%', '#BFD8EE'), [
    skyline('#5A6A88', 50, 'l18 b20'), skyline('#5A6A88', 44, 'r6 b20', true),
    mk('<path d="M20 100 L22 30 H26 L28 100Z" fill="#7A8AA0"/><ellipse cx="24" cy="34" rx="8" ry="4" fill="#6A7A90"/><path d="M23.5 30 V0" stroke="#7A8AA0" stroke-width="2"/>', 48, 100, 90, 'l46 b20'),
    sea('#4E8AB8', 80, 30)]);
  add('quebec', 'Quebec', 1, lg('#BFD8EE', '#F4EEE6 70%'), [clouds(),
    mk('<rect x="10" y="40" width="140" height="60" fill="#C9785E"/><path d="M6 40 L30 18 L54 40Z M54 40 L80 10 L106 40Z M106 40 L130 18 L154 40Z" fill="#3E7A6A"/><rect x="74" y="0" width="12" height="14" fill="#3E7A6A"/>' + [20, 40, 60, 92, 112, 132].map((x) => win(x, 54, '#F4EBD6') + win(x, 72, '#F4EBD6')).join(''), 160, 100, 64, 'lx b16'),
    sea('#4E7C98', 82, 26), PINES(30, 'l4 b10', '#C8763C'), PINES(30, 'r6 b10', '#D9A15A', true)]);
  add('niagara', 'Niagara Falls', 1, lg('#A9D8F0', '#F0F8FC 70%'), [
    lay('<path d="M0 100 V36 H400 V100Z" fill="#5E8A5A"/>', 90),
    lay('<path d="M60 36 H340 V80 H60Z" fill="#8CD3EE"/><path d="M80 36 V80 M110 36 V80 M140 36 V80 M170 36 V80 M200 36 V80 M230 36 V80 M260 36 V80 M290 36 V80 M320 36 V80" stroke="#fff" stroke-width="3" opacity=".7"/>', 90),
    lay('<path d="M0 100 V78 H400 V100Z" fill="#3E8AA8"/><path d="M60 80 Q200 70 340 80" stroke="#fff" stroke-width="6" opacity=".6" fill="none"/>', 40),
    mk('<path d="M0 40 Q40 0 80 40" stroke="#FF7F7F" stroke-width="3" fill="none"/><path d="M4 40 Q40 6 76 40" stroke="#FFD666" stroke-width="3" fill="none"/><path d="M8 40 Q40 12 72 40" stroke="#7FD38A" stroke-width="3" fill="none"/><path d="M12 40 Q40 18 68 40" stroke="#7FB8FF" stroke-width="3" fill="none"/>', 80, 42, 34, 'r12 t10')]);
  add('india', 'India', 1, lg('#F7B98A', '#FCE9D6 70%'), [sun('#FFF1C4', 30, 'l12 t10'),
    mk('<rect x="10" y="50" width="140" height="50" fill="#F4F0EA"/><path d="M50 50 Q50 14 80 6 Q110 14 110 50Z" fill="#fff"/><path d="M80 6 V-6" stroke="#E0D6C6" stroke-width="2"/><rect x="0" y="20" width="8" height="80" fill="#F4F0EA"/><rect x="152" y="20" width="8" height="80" fill="#F4F0EA"/><path d="M68 100 V74 a12 12 0 0 1 24 0 V100Z" fill="#D8CDBD"/>', 160, 108, 70, 'lx b16'),
    lay('<path d="M0 100 V84 H400 V100Z" fill="#7FB0C8"/>', 30), CYP(44, 'l20 b14', true), CYP(44, 'r20 b14', true)]);
  add('turkey', 'Turkey', 1, lg('#F6B18A', '#FCE6D2 70%'), [
    lay('<path d="M0 100 V64 Q30 40 50 64 Q70 30 100 62 Q140 36 170 64 Q210 40 240 62 Q280 34 310 64 Q350 44 400 60 V100Z" fill="#D9A07A"/>', 70),
    ...[['l14 t14', 28, '#E9573F'], ['l40 t26', 20, '#F2C14E'], ['r22 t8', 30, '#4FA3B8'], ['r42 t30', 16, '#E9806E']].map((b) => mk('<path d="M20 4 Q40 4 40 22 Q40 34 24 40 H16 Q0 34 0 22 Q0 4 20 4Z" fill="' + b[2] + '"/><path d="M8 30 Q20 38 32 30" stroke="#fff" stroke-width="1.5" fill="none" opacity=".6"/><rect x="15" y="44" width="10" height="7" fill="#8A5A3C"/><path d="M16 40 L17 44 M24 40 L23 44" stroke="#5A3A2A"/>', 40, 52, b[1], b[0])),
    ground('#C08A5E', 24)]);

  // Level 2: regions, so every country has a fitting picture
  add('old-town', 'European old town', 2, lg('#9CC8E8', '#F6EEDF 75%'), [clouds(),
    mk([[0, 46, 30, '#F2C14E'], [30, 36, 26, '#E9806E'], [56, 50, 32, '#8FC1B5'], [88, 30, 24, '#F6E3C6'], [112, 44, 30, '#E9A15E'], [142, 38, 26, '#B7C6E6'], [168, 52, 30, '#F2C14E']].map((b) => '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + (100 - b[1]) + '" fill="' + b[3] + '"/><path d="M' + b[0] + ' ' + b[1] + ' L' + (b[0] + b[2] / 2) + ' ' + (b[1] - 16) + ' L' + (b[0] + b[2]) + ' ' + b[1] + 'Z" fill="#8A4A3A"/>' + win(b[0] + 5, b[1] + 8) + win(b[0] + b[2] - 10, b[1] + 8) + win(b[0] + 5, b[1] + 26) + win(b[0] + b[2] - 10, b[1] + 26)).join('') +
      '<rect x="94" y="0" width="12" height="30" fill="#C9B79C"/><path d="M92 0 L100 -14 L108 0Z" fill="#8A4A3A"/>', 198, 116, 80, 'c'),
    lay('<path d="M0 100 V94 H400 V100Z" fill="#B9AE98"/>', 20)]);
  add('nordic', 'Nordic fjords', 2, lg('#A8D8D0', '#F0E6F2 70%'), [
    lay('<path d="M0 100 V18 Q40 30 70 54 L110 100Z M400 100 V12 Q350 30 320 56 L290 100Z" fill="#5C7A8C"/><path d="M0 18 L26 30 L10 36Z M400 12 L372 26 L390 32Z" fill="#fff"/>', 95),
    lay('<path d="M0 100 V66 H400 V100Z" fill="#3E7C8C"/><path d="M130 74 h50 M220 80 h60" stroke="#CFEFF5" stroke-width="2"/>', 45),
    mk('<path d="M0 40 Q30 34 70 36 V44 H0Z" fill="#5E7F4A"/><rect x="8" y="22" width="22" height="14" fill="#C8463A"/><path d="M5 24 L19 12 L33 24Z" fill="#3A2A2A"/><rect x="38" y="26" width="18" height="10" fill="#F2C14E"/><path d="M35 28 L47 18 L59 28Z" fill="#3A2A2A"/>', 70, 46, 26, 'l12 b22')]);
  add('mediterranean', 'Mediterranean coast', 2, lg('#8CCBF0', '#EAF6FC 70%'), [sun('#FFF6D0', 28, 'r12 t8'),
    lay('<path d="M0 100 V40 Q60 30 110 50 Q140 62 160 100Z" fill="#C9A06A"/>', 90),
    mk(houses([[0, 50, 26, '#FBEEDD'], [24, 40, 22, '#F2C14E'], [44, 54, 26, '#F6E3C6'], [68, 44, 22, '#E9906E']], '#C3532F'), 92, 100, 40, 'l2 b30'),
    sea('#2A8FC0', 64), mk('<path d="M0 30 Q40 40 80 30 L74 38 Q40 44 6 38Z" fill="#fff"/><path d="M40 30 V0 L64 26Z" fill="#fff"/>', 80, 46, 20, 'r24 b14')]);
  add('se-asia', 'Southeast Asia', 2, lg('#FFC48A', '#FFF0D6 70%'), [sun('#FFE6A8', 40, 'l20 t14'),
    lay('<path d="M0 100 V66 Q100 56 200 64 T400 60 V100Z" fill="#7DAE7A"/>', 60),
    mk('<path d="M60 4 L64 20 L70 20 L74 34 L82 34 L88 54 L96 54 L104 100 L16 100 L24 54 L32 54 L38 34 L46 34 L50 20 L56 20Z" fill="#C98A3C"/><path d="M30 54 h60 M40 34 h40" stroke="#A86E2C" stroke-width="3"/><path d="M0 100 L10 70 L20 100Z M100 100 L110 70 L120 100Z" fill="#C98A3C"/>', 120, 100, 80, 'lx b10'),
    lay('<path d="M0 100 V86 H400 V100Z" fill="#4E8A5A"/>', 30), PALM(70, 'r6 b-4')]);
  add('desert', 'Desert', 2, lg('#F48C4F', '#FFD9A0 70%'), [sun('#FFF0C0', 36, 'r20 t12'),
    lay('<path d="M0 100 V60 Q60 40 130 62 Q200 80 260 54 Q330 32 400 60 V100Z" fill="#E9A15E"/>', 70),
    lay('<path d="M0 100 V78 Q100 64 200 80 T400 74 V100Z" fill="#D9884A"/>', 40),
    mk('<path d="M10 36 Q14 24 22 30 Q26 20 34 28 L40 26 L42 30 L36 32 L34 40 L12 40Z" fill="#5A3A2A"/><path d="M14 40 v10 M20 40 v10 M30 40 v10 M34 40 v10" stroke="#5A3A2A" stroke-width="2"/>', 48, 52, 20, 'l24 b22'),
    mk('<path d="M10 36 Q14 24 22 30 Q26 20 34 28 L40 26 L42 30 L36 32 L34 40 L12 40Z" fill="#5A3A2A"/><path d="M14 40 v10 M20 40 v10 M30 40 v10 M34 40 v10" stroke="#5A3A2A" stroke-width="2"/>', 48, 52, 16, 'l34 b26')]);
  add('savanna', 'African savanna', 2, lg('#F48C4F', '#FFD9A0 70%'), [sun('#FFE7A8', 56, 'l40 t8'),
    lay('<path d="M0 100 V72 Q200 64 400 72 V100Z" fill="#C9A35A"/>', 60),
    mk('<path d="M60 100 V54" stroke="#3A2A20" stroke-width="5"/><path d="M60 58 L30 44 M60 58 L90 40" stroke="#3A2A20" stroke-width="3"/><ellipse cx="60" cy="38" rx="52" ry="12" fill="#3A2A20"/>', 120, 100, 70, 'l8 b16'),
    mk('<path d="M14 60 V96 M20 60 V96 M36 60 V96 M42 60 V96" stroke="#3A2A20" stroke-width="3"/><path d="M8 62 Q8 50 26 50 Q44 50 46 58 L48 66 H10Z" fill="#3A2A20"/><path d="M42 54 Q50 30 56 12 L62 14 Q56 34 50 58Z" fill="#3A2A20"/><path d="M54 12 L66 8 L68 14 L58 16Z" fill="#3A2A20"/><path d="M58 8 l-1 -5 M62 7 l0 -5" stroke="#3A2A20" stroke-width="2"/>', 72, 96, 54, 'r18 b14'),
    mk('<path d="M60 100 V54" stroke="#3A2A20" stroke-width="5"/><ellipse cx="60" cy="40" rx="40" ry="10" fill="#3A2A20"/>', 120, 100, 44, 'r40 b18', true)]);
  add('caribbean', 'Caribbean', 2, lg('#6FD0E8', '#DFF7F6 70%'), [sun('#FFE59A', 30, 'l16 t10'),
    sea('#18B0C8', 58), lay('<path d="M0 100 V78 Q140 66 260 76 T400 72 V100Z" fill="#F8E6BE"/>', 40),
    PALM(92, 'r12 b4'), PALM(70, 'r30 b6', '#3E9A5E'),
    mk('<path d="M0 30 h50 l-4 8 h-42Z" fill="#E9573F"/><path d="M26 30 V4 L44 26Z" fill="#fff"/>', 50, 40, 20, 'l34 b26')]);
  add('andes', 'South America mountains', 2, lg('#A8CFE0', '#F4EEDF 70%'), [sun('#FFF3C4', 26, 'r12 t8'),
    lay('<path d="M0 100 V40 L60 16 L120 44 L190 6 L250 40 L320 14 L400 40 V100Z" fill="#8A7A9A"/><path d="M180 12 L190 6 L202 14Z M310 18 L320 14 L330 20Z M52 20 L60 16 L68 22Z" fill="#fff"/>', 85),
    lay('<path d="M0 100 V64 Q100 52 200 64 T400 58 V100Z" fill="#B9A06A"/>', 55),
    mk('<ellipse cx="22" cy="30" rx="14" ry="9" fill="#F4EBD6"/><path d="M32 26 Q36 10 38 4 L42 6 Q40 16 38 28Z" fill="#F4EBD6"/><path d="M12 36 v12 M18 36 v12 M26 36 v12 M32 36 v12" stroke="#F4EBD6" stroke-width="3"/>', 48, 50, 22, 'l26 b12')]);
  add('pacific', 'Pacific islands', 2, lg('#FF9E7A', '#FFD9B0 55%', '#9FE0E8'), [sun('#FFF0B8', 40, 'l40 t14'),
    sea('#21A6B8', 62),
    mk('<path d="M0 30 Q40 0 80 30Z" fill="#3E7A5A"/>', 80, 30, 18, 'r14 b38'),
    mk('<rect x="10" y="20" width="44" height="18" fill="#C9A06A"/><path d="M4 22 L32 4 L60 22Z" fill="#8A6A3A"/><path d="M14 38 V54 M50 38 V54" stroke="#8A6A3A" stroke-width="3"/>', 64, 56, 26, 'l20 b20'),
    PALM(80, 'r2 b-6')]);
  add('rockies', 'Canadian Rockies', 2, lg('#9FD0F0', '#E7F4FB 70%'), [clouds(),
    lay('<path d="M0 100 V40 L70 14 L140 44 L210 8 L280 40 L350 16 L400 30 V100Z" fill="#8A9AB0"/><path d="M200 14 L210 8 L222 16Z M340 20 L350 16 L360 22Z M62 18 L70 14 L78 20Z" fill="#fff"/>', 85),
    lay('<path d="M0 100 V60 Q100 50 200 60 T400 56 V100Z" fill="#5E8A5A"/>', 55),
    PINES(50, 'l0 b0'), PINES(44, 'l18 b0'), PINES(50, 'r0 b0'), PINES(40, 'r22 b0', '#2F5D46', true),
    mk('<path d="M8 40 Q4 20 20 18 Q22 6 32 10 L36 4 L38 12 Q46 18 40 28 L44 40Z" fill="#5A3A2A"/>', 48, 42, 16, 'l40 b8')]);
  add('canyon', 'Canyons and red rock', 2, lg('#F6A06A', '#FCE2C4 70%'), [sun('#FFF0C0', 30, 'l14 t10'),
    lay('<path d="M0 100 V40 H60 V30 H100 V50 H160 V60 L200 100Z M400 100 V36 H340 V28 H300 V46 H250 V64 L220 100Z" fill="#C9603E"/><path d="M0 52 H60 M300 50 H400" stroke="#A84A30" stroke-width="3"/>', 90),
    lay('<path d="M0 100 V82 Q200 74 400 82 V100Z" fill="#B0503A"/>', 30),
    mk('<path d="M14 100 V40 M14 60 Q4 56 4 44 M14 70 Q24 64 24 52" stroke="#4A7A4A" stroke-width="6" fill="none" stroke-linecap="round"/>', 30, 100, 36, 'r40 b10')]);
  add('jungle', 'Rainforest', 2, lg('#9ED8B8', '#E6F6E8 70%'), [
    lay('<path d="M0 100 V30 Q20 10 40 30 Q60 6 80 30 Q100 14 120 34 Q150 4 180 34 Q210 16 230 36 Q260 8 290 34 Q320 18 340 36 Q370 10 400 30 V100Z" fill="#4E8A5A"/>', 90),
    lay('<path d="M0 100 V56 Q30 40 60 58 Q100 36 140 58 Q180 44 220 60 Q260 40 300 58 Q350 42 400 56 V100Z" fill="#2F6A4A"/>', 70),
    lay('<path d="M120 40 Q130 30 140 40 V100 H120Z" fill="#BFE6EE" opacity=".8"/><path d="M124 44 V100 M132 44 V100" stroke="#fff" stroke-width="2" opacity=".7"/>', 70),
    ground('#245A3A', 24)]);

  // Level 3: kinds of vacation
  add('beach', 'Beach', 3, lg('#7FD3E8', '#D9F4F2 70%'), [sun('#FFE59A', 40, 'l16 t10'), clouds(),
    lay('<path d="M0 100 V58 H400 V100Z" fill="#2BA8C4"/><path d="M0 64 Q50 60 100 64 T200 64 T300 64 T400 64" stroke="#BFEFF5" stroke-width="2" fill="none"/>', 60),
    lay('<path d="M0 100 V78 Q140 66 260 76 T400 72 V100Z" fill="#F6DFAE"/>', 40),
    PALM(92, 'r12 b4'),
    mk('<path d="M20 4 Q0 6 2 20 H38 Q40 6 20 4Z" fill="#E9573F"/><path d="M20 4 V40" stroke="#5A3A2A" stroke-width="2"/><path d="M8 20 Q14 10 20 4 Q26 10 32 20" stroke="#fff" stroke-width="3" fill="none"/>', 40, 40, 30, 'l34 b6')]);
  add('mountains', 'Mountains', 3, lg('#9FD0F0', '#E7F4FB 70%'), [clouds(),
    lay('<path d="M0 100 V55 L50 25 L90 48 L150 12 L210 50 L260 22 L320 46 L370 20 L400 34 V100Z" fill="#A7B8CC"/><path d="M140 18 L150 12 L162 20 L154 24Z M252 27 L260 22 L270 28Z M362 25 L370 20 L380 26Z" fill="#fff"/>', 80),
    lay('<path d="M0 100 V60 Q100 48 200 60 T400 54 V100Z" fill="#7DAE6A"/>', 55),
    PINES(46, 'l0 b0'), PINES(46, 'r0 b0'), PINES(36, 'l40 b0', '#2F5D46', true)]);
  add('city', 'City lights', 3, lg('#2B3C6B', '#8A6AA8 65%', '#F2A07A'), [stars(),
    skyline('#3B3F66', 60, 'l4 b14'), skyline('#2F3358', 76, 'lx b14'), skyline('#3B3F66', 54, 'r4 b14', true),
    lay('<path d="M0 100 V84 H400 V100Z" fill="#26294A"/>', 30)]);
  add('snow', 'Snow and ski', 3, lg('#B9D8F2', '#F2F8FF 70%'), [
    lay('<path d="M0 100 V50 L80 18 L160 52 L240 10 L320 46 L400 22 V100Z" fill="#fff"/><path d="M80 18 L100 30 L60 30Z M240 10 L262 26 L220 26Z" fill="#DDE8F4"/>', 85),
    PINES(50, 'l0 b0'), PINES(46, 'l30 b0', '#2F5D46', true), PINES(50, 'r0 b0'),
    mk('<path d="M0 0 L120 70" stroke="#5A5A6A" stroke-width="1.5"/><rect x="58" y="34" width="14" height="10" rx="2" fill="#C8463A"/><path d="M65 34 V30" stroke="#5A5A6A"/>', 120, 70, 44, 'r10 t4'),
    mk('<path d="M0 30 L60 46" stroke="#26302B" stroke-width="2"/><circle cx="30" cy="10" r="4" fill="#E9573F"/><path d="M30 14 L28 30 L22 38 M28 22 L38 26 M28 30 L34 38" stroke="#2B67C6" stroke-width="3" fill="none"/>', 60, 48, 24, 'l40 b14')]);
  add('cruise', 'Cruise', 3, lg('#7FC3EA', '#E6F6FF 70%'), [sun('#FFF1B8', 34, 'l14 t12'), clouds(),
    lay('<path d="M0 100 V62 H400 V100Z" fill="#2E7FB8"/><path d="M40 74 h40 M300 80 h50" stroke="#fff" stroke-width="1.5" opacity=".5"/>', 55),
    mk('<path d="M0 50 L170 50 L156 72 L14 72Z" fill="#fff"/><path d="M0 60 H168" stroke="#2B4C7E" stroke-width="4"/><rect x="24" y="34" width="120" height="16" fill="#fff"/><rect x="40" y="22" width="84" height="12" fill="#fff"/><rect x="96" y="8" width="14" height="14" fill="#E9573F"/>' + [32, 42, 52, 62, 72, 82, 92, 102, 112, 122, 132].map((x) => '<circle cx="' + x + '" cy="42" r="2.4" fill="#2B4C7E"/>').join(''), 172, 76, 52, 'lx b24')]);
  add('road-trip', 'Road trip', 3, lg('#FFC07A', '#FFF0D6 70%'), [sun('#FFF0C0', 30, 'r14 t10'),
    lay('<path d="M0 100 V58 Q100 40 200 54 T400 48 V100Z" fill="#B7A27A"/>', 70),
    lay('<path d="M0 100 V74 Q200 66 400 74 V100Z" fill="#E1C48A"/><path d="M150 100 L196 70 L204 70 L250 100Z" fill="#4A4A55"/><path d="M200 74 V80 M200 86 V94" stroke="#FFE08A" stroke-width="2"/>', 45),
    mk('<rect x="6" y="14" width="60" height="18" rx="6" fill="#4FA3B8"/><path d="M16 14 L24 2 L50 2 L58 14Z" fill="#4FA3B8"/><path d="M22 12 L28 4 H36 V12Z M40 12 V4 H48 L54 12Z" fill="#E6F6FF"/><circle cx="20" cy="32" r="6" fill="#26302B"/><circle cx="54" cy="32" r="6" fill="#26302B"/><rect x="20" y="-4" width="34" height="6" rx="2" fill="#E9573F"/>', 72, 44, 30, 'l18 b12')]);
  add('camping', 'Camping', 3, lg('#2E3E66', '#A07AA8 70%', '#F2B48C'), [stars(), moon(30, 'r14 t8'),
    lay('<path d="M0 100 V60 L60 34 L130 58 L210 26 L300 56 L400 36 V100Z" fill="#3E4A6E"/>', 70),
    lay('<path d="M0 100 V78 Q200 70 400 78 V100Z" fill="#2E4A3E"/>', 35),
    mk('<path d="M0 60 L34 10 L68 60Z" fill="#F2A35C"/><path d="M34 10 L34 60 L24 60Z" fill="#C8763C"/><path d="M80 60 L92 46 L104 60Z" fill="#FFB347"/><path d="M86 60 L92 50 L98 60Z" fill="#FFE08A"/>' + pine(120, 60, 1.8, '#22382E') + pine(-26, 60, 1.6, '#22382E'), 150, 62, 40, 'lx b6'),
    PINES(40, 'l2 b0', '#22382E', true), PINES(40, 'r2 b0', '#22382E', true)]);
  add('lake', 'Lake and cabin', 3, lg('#F6B38A', '#FCE6D2 60%', '#C9E2EE'), [
    lay('<path d="M0 100 V50 Q100 34 200 48 T400 42 V100Z" fill="#7A8AA0"/>', 70),
    lay('<path d="M0 100 V66 H400 V100Z" fill="#6AA6C0"/><path d="M60 74 h50 M250 80 h70" stroke="#fff" stroke-width="1.5" opacity=".5"/>', 45),
    PINES(48, 'l0 b26'), PINES(40, 'r0 b26'),
    mk('<rect x="6" y="18" width="40" height="22" fill="#8A5A3C"/><path d="M0 20 L26 2 L52 20Z" fill="#5A3A2A"/>' + win(12, 24, '#FFD98A') + win(34, 24, '#FFD98A') + '<path d="M50 40 H90" stroke="#8A6A4A" stroke-width="3"/>', 92, 42, 26, 'l22 b26'),
    mk('<path d="M0 10 Q20 16 40 10 L36 16 Q20 20 4 16Z" fill="#D2443A"/>', 40, 20, 8, 'l46 b14')]);
  add('theme-park', 'Theme park', 3, lg('#8FD0F2', '#F2F9FF 70%'), [clouds(),
    mk('<circle cx="50" cy="50" r="44" fill="none" stroke="#E9573F" stroke-width="3"/><path d="M50 6 V94 M6 50 H94 M19 19 L81 81 M81 19 L19 81" stroke="#E9573F" stroke-width="1.5"/>' + [[50, 6, '#F2C14E'], [94, 50, '#4FA3B8'], [50, 94, '#7FD38A'], [6, 50, '#E9806E'], [81, 19, '#B7A0E6'], [19, 81, '#F2C14E'], [81, 81, '#E9806E'], [19, 19, '#4FA3B8']].map((c) => '<rect x="' + (c[0] - 5) + '" y="' + (c[1] - 3) + '" width="10" height="8" rx="2" fill="' + c[2] + '"/>').join('') + '<path d="M50 50 L36 118 M50 50 L64 118" stroke="#5A6470" stroke-width="3"/>', 100, 118, 84, 'l14 b10'),
    mk('<path d="M0 60 Q20 0 40 40 Q60 80 80 20 Q100 -10 120 60" stroke="#2B67C6" stroke-width="4" fill="none"/><path d="M10 60 V100 M40 40 V100 M80 24 V100 M110 40 V100" stroke="#5A6470" stroke-width="2"/>', 120, 100, 60, 'r10 b10'),
    mk('<path d="M0 30 L15 0 L30 30Z" fill="#E9573F"/><rect x="2" y="30" width="26" height="20" fill="#F4EBD6"/>', 30, 50, 30, 'l46 b10', true),
    ground('#7FC07A', 22)]);
  add('wine', 'Wine country', 3, lg('#F6B88A', '#FCEBD6 70%'), [sun('#FFF1C4', 32, 'r16 t10'),
    lay('<path d="M0 100 V50 Q100 34 200 50 T400 44 V100Z" fill="#A8B87A"/>', 70),
    lay('<path d="M0 64 Q100 52 200 64 T400 58 M0 74 Q100 62 200 74 T400 68 M0 84 Q100 72 200 84 T400 78 M0 94 Q100 82 200 94 T400 88" stroke="#5E7F3A" stroke-width="4" fill="none" stroke-dasharray="6 4"/>', 70),
    mk(houses([[0, 50, 40, '#F4E6CE']], '#B0503A'), 44, 100, 40, 'l30 b30'), CYP(56, 'l24 b26'), CYP(50, 'l46 b28', true)]);

  const DEFAULTS = ['beach', 'mountains', 'city', 'road-trip', 'lake', 'old-town', 'wine', 'camping'];

  /* ---------- place words -> scene ---------- */
  // Longest match wins, so "new york" beats "york" and "costa rica" beats "rica".
  const WORDS = {
    paris: 'paris,france,french,versailles,lyon,bordeaux,provence,cannes,marseille,normandy,loire,strasbourg,monaco',
    london: 'london,england,uk,united kingdom,britain,scotland,edinburgh,manchester,liverpool,oxford,cambridge,wales,ireland,dublin,belfast,bath',
    rome: 'rome,italy,italia,florence,firenze,tuscany,milan,naples,sicily,pompeii,amalfi,vatican,verona,bologna',
    venice: 'venice,venezia,lake como,como',
    spain: 'spain,españa,barcelona,madrid,seville,sevilla,granada,valencia,malaga,ibiza,mallorca,majorca,portugal,lisbon,porto,algarve,andalusia',
    amsterdam: 'amsterdam,netherlands,holland,dutch,rotterdam,belgium,brussels,bruges,ghent',
    greece: 'greece,greek,athens,santorini,mykonos,crete,rhodes,corfu,cyprus',
    iceland: 'iceland,reykjavik,northern lights,aurora,greenland,yukon,yellowknife,lapland',
    alps: 'switzerland,swiss,alps,zurich,geneva,lucerne,interlaken,zermatt,austria,innsbruck,salzburg,chamonix,dolomites,bavaria,liechtenstein',
    'new-york': 'new york,nyc,manhattan,brooklyn',
    'las-vegas': 'las vegas,vegas,nevada,reno,atlantic city,macau',
    'san-francisco': 'san francisco,sf,bay area,california,napa,los angeles,la,san diego,hollywood,oregon,portland,seattle,washington state',
    hawaii: 'hawaii,maui,oahu,honolulu,waikiki,kauai,big island,kona',
    mexico: 'mexico,cancun,cancún,tulum,cabo,los cabos,puerto vallarta,mazatlan,oaxaca,mexico city,playa del carmen,riviera maya,guatemala,belize',
    japan: 'japan,tokyo,kyoto,osaka,hokkaido,okinawa,nara,hiroshima,sapporo,fuji',
    korea: 'korea,seoul,busan,jeju,south korea',
    china: 'china,beijing,shanghai,great wall,hong kong,taiwan,taipei,xian,guilin,chengdu,mongolia',
    thailand: 'thailand,bangkok,phuket,chiang mai,krabi,koh samui,pattaya',
    bali: 'bali,indonesia,ubud,lombok,java,jakarta',
    philippines: 'philippines,manila,cebu,boracay,palawan,el nido,coron,bohol,siargao,davao,iloilo,pinas',
    vietnam: 'vietnam,hanoi,ha long,halong,ho chi minh,saigon,hoi an,da nang,cambodia,angkor,siem reap,laos,luang prabang',
    singapore: 'singapore,kuala lumpur,malaysia,penang,brunei',
    dubai: 'dubai,abu dhabi,uae,emirates,qatar,doha,bahrain,saudi,riyadh,kuwait',
    egypt: 'egypt,cairo,giza,luxor,aswan,nile,sharm',
    morocco: 'morocco,marrakech,marrakesh,fez,casablanca,tunisia,algeria',
    peru: 'peru,machu picchu,cusco,cuzco,lima,bolivia,ecuador,quito',
    rio: 'brazil,rio,rio de janeiro,sao paulo,são paulo,salvador,florianopolis',
    sydney: 'australia,sydney,melbourne,brisbane,gold coast,perth,adelaide,cairns,great barrier reef,tasmania',
    'new-zealand': 'new zealand,nz,auckland,queenstown,wellington,christchurch,rotorua',
    banff: 'banff,lake louise,jasper,canmore,moraine',
    vancouver: 'vancouver,bc,british columbia,victoria,tofino,kelowna,okanagan,squamish,nanaimo,richmond,surrey,burnaby',
    toronto: 'toronto,ontario,ottawa,chicago,detroit,montreal,montréal',
    quebec: 'quebec,québec,quebec city,mont tremblant,new brunswick,nova scotia,halifax,pei,prince edward island,newfoundland,maritimes',
    niagara: 'niagara,niagara falls,waterfall,falls',
    india: 'india,delhi,agra,taj mahal,mumbai,goa,jaipur,kerala,rajasthan,nepal,kathmandu,sri lanka,maldives',
    turkey: 'turkey,türkiye,istanbul,cappadocia,antalya,bodrum',
    'old-town': 'germany,berlin,munich,münchen,frankfurt,hamburg,cologne,prague,czech,vienna,budapest,hungary,poland,krakow,warsaw,slovakia,slovenia,ljubljana,estonia,tallinn,latvia,riga,lithuania,vilnius,romania,bulgaria,serbia,europe,european,luxembourg,scotland,edinburgh,christmas market',
    nordic: 'norway,oslo,bergen,fjord,fjords,sweden,stockholm,finland,helsinki,denmark,copenhagen,faroe,scandinavia,nordic',
    mediterranean: 'croatia,dubrovnik,split,hvar,montenegro,albania,malta,sardinia,corsica,mediterranean,riviera,amalfi coast,cinque terre,capri',
    'se-asia': 'myanmar,burma,cambodia,laos,southeast asia,asia',
    desert: 'jordan,petra,israel,jerusalem,tel aviv,oman,iran,desert,sahara,arizona desert,palm springs,joshua tree,utah desert',
    savanna: 'kenya,tanzania,safari,serengeti,south africa,cape town,johannesburg,botswana,namibia,zimbabwe,victoria falls,uganda,rwanda,africa,zambia,kruger,ghana,nigeria,ethiopia,senegal',
    caribbean: 'caribbean,jamaica,bahamas,nassau,cuba,havana,dominican,punta cana,puerto rico,aruba,barbados,st lucia,turks,caicos,cayman,bermuda,antigua,virgin islands,curacao,costa rica,panama,honduras,roatan,florida,miami,key west',
    andes: 'chile,santiago,patagonia,argentina,buenos aires,colombia,bogota,medellin,cartagena,south america,uruguay,paraguay,venezuela',
    pacific: 'fiji,tahiti,bora bora,french polynesia,samoa,tonga,guam,palau,cook islands,vanuatu,pacific',
    rockies: 'alberta,calgary,edmonton,rockies,rocky mountains,montana,glacier,colorado,denver,aspen,wyoming,yellowstone,jackson hole,idaho',
    canyon: 'grand canyon,arizona,sedona,utah,zion,moab,bryce,new mexico,texas,phoenix,monument valley,route 66',
    jungle: 'amazon,rainforest,jungle,borneo,manaus,iquitos,daintree',
    beach: 'beach,resort,all inclusive,all-inclusive,island,islands,tropical,sun,spring break,honeymoon',
    mountains: 'hike,hiking,trek,trekking,mountain,mountains,national park,park',
    city: 'city,downtown,weekend,conference,work trip,business,concert,usa,united states,america,boston,dc,washington dc,atlanta,nashville,new orleans,austin,dallas,houston,philadelphia',
    snow: 'ski,skiing,snow,snowboard,winter,christmas,big white,sun peaks,revelstoke,whistler,lake tahoe,tahoe,whistler blackcomb,niseko',
    cruise: 'cruise,cruising,ship,sailing,alaska,inside passage,disney cruise,royal caribbean,carnival,norwegian',
    'road-trip': 'road trip,roadtrip,drive,driving,rv,motorhome,campervan,van life,highway',
    camping: 'camping,camp,tent,glamping,campground,cabin camping',
    lake: 'lake,cabin,cottage,muskoka,lake tahoe cabin,harrison,shuswap,lakehouse,lake house',
    'theme-park': 'disney,disneyland,disney world,universal,orlando,anaheim,theme park,six flags,legoland,knott',
    wine: 'wine,winery,wineries,vineyard,napa valley,sonoma,okanagan wine,naramata,champagne,burgundy'
  };
  // Words that are too general to win over a place name.
  const WEAK = new Set(['beach', 'mountains', 'city', 'lake', 'old-town', 'se-asia']);
  const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  const INDEX = [];
  Object.keys(WORDS).forEach((k) => WORDS[k].split(',').forEach((w) => INDEX.push([norm(w), k])));
  INDEX.sort((a, b) => b[0].length - a[0].length);
  
  function guess(t) {
    const route = Array.isArray(t.route) ? t.route : [];
    // The destination matters most, then the trip name, then the stops (the first stop is often home).
    const texts = [t.destination, t.name, route.slice(1).join(' '), route.join(' ')].map(norm);
    let weak = null;
    for (const s of texts) {
      for (const [w, k] of INDEX) {
        if (s.includes(w)) {
          if (!WEAK.has(k)) return k;
          if (!weak) weak = k;
        }
      }
    }
    if (weak) return weak;
    let n = 0; const id = String(t.name || t.id || '');
    for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
    return DEFAULTS[n % DEFAULTS.length];
  }
  const pick = (t) => (t && t.cover_scene && S[t.cover_scene]) ? t.cover_scene : guess(t || {});

  function el(key, cls) {
    const s = S[key] || S.beach;
    const d = document.createElement('div');
    d.className = 'cv' + (cls ? ' ' + cls : '');
    d.style.background = s.bg;
    d.setAttribute('role', 'img'); d.setAttribute('aria-label', s.name);
    d.innerHTML = s.parts; // only our own drawing strings, never user text
    return d;
  }

  TR.covers = { pick, guess, el, list: Object.keys(S).map((k) => ({ key: k, name: S[k].name, level: S[k].level })) };
})();
