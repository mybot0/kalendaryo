/*
 * look.js — the "Cozy look": small drawings for empty boxes and pages.
 * Everything visual that is "decoration" lives here and in styles/cozy.css, so it can be
 * turned off, redesigned, or swapped for a seasonal pack later without touching the screens.
 *
 *   PL.look.art(name)  -> SVG string, or '' when there is no drawing (the plain icon is used then)
 *
 * Names are the same as the empty-state icon names (check, list, meal, …), so screens do not
 * need to know about drawings at all. To turn the drawings off, delete this file from build.js.
 * A future pack (Halloween, Christmas, …) only has to replace entries in ART.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const V = '<svg viewBox="0 0 260 150" aria-hidden="true" focusable="false">';
  const floor = '<ellipse cx="130" cy="141" rx="104" ry="8" fill="#E3ECE4"/>';
  const star = (x, y, s, c) => '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0 -10 L3 -3 L10 -3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10 -3 L-3 -3Z" fill="' + (c || '#FFD666') + '"/>';
  const cal = (num, top) => '<rect x="70" y="32" width="120" height="102" rx="12" fill="#fff" stroke="#D9E3DA" stroke-width="2"/><rect x="70" y="32" width="120" height="28" rx="12" fill="' + top + '"/><rect x="70" y="48" width="120" height="12" fill="' + top + '"/>' +
    '<rect x="92" y="22" width="8" height="20" rx="4" fill="#5A6470"/><rect x="160" y="22" width="8" height="20" rx="4" fill="#5A6470"/>' +
    '<text x="130" y="110" text-anchor="middle" font-size="40" font-weight="800" fill="#26302B" font-family="Outfit,Figtree,system-ui,sans-serif">' + num + '</text>';

  const ART = {
    // Today / nothing planned: a calendar page and the sun
    sparkle: V + floor + cal(new Date().getDate(), '#E9806E') + '<circle cx="210" cy="40" r="16" fill="#FFD666"/><path d="M210 16 v-6 M234 40 h6 M227 23 l4 -4" stroke="#FFD666" stroke-width="3" stroke-linecap="round"/></svg>',
    // Coming up / agenda: a calendar with a little flag
    calendar: V + floor + cal('', '#7FB8E8') + '<path d="M96 76 h16 M120 76 h16 M144 76 h16 M96 96 h16 M120 96 h16" stroke="#C9D6CB" stroke-width="6" stroke-linecap="round"/><circle cx="152" cy="100" r="10" fill="#E9806E"/><path d="M200 40 v40" stroke="#5A6470" stroke-width="3"/><path d="M200 40 h26 l-6 8 l6 8 h-26z" fill="#F2C14E"/></svg>',
    // Chores: a broom, a bubbly bucket and stars
    check: V + floor + '<path d="M70 20 L96 116" stroke="#C8A06A" stroke-width="6" stroke-linecap="round"/><path d="M80 112 L114 104 L124 138 L74 138Z" fill="#F2C14E"/><path d="M84 120 l4 16 M96 116 l4 20 M108 112 l6 24" stroke="#D9A33A" stroke-width="2"/>' +
      '<path d="M140 86 h60 l-6 52 h-48z" fill="#7FB8E8"/><path d="M140 86 q30 -30 60 0" stroke="#5A8FC8" stroke-width="3" fill="none"/><ellipse cx="170" cy="86" rx="30" ry="6" fill="#BFE0F6"/>' +
      '<circle cx="160" cy="70" r="7" fill="#fff" stroke="#BFE0F6" stroke-width="2"/><circle cx="176" cy="62" r="5" fill="#fff" stroke="#BFE0F6" stroke-width="2"/><circle cx="188" cy="74" r="4" fill="#fff" stroke="#BFE0F6" stroke-width="2"/>' + star(220, 40, 1.2) + star(44, 64, 0.9) + '</svg>',
    // Rewards: a jar of stars
    star: V + floor + '<path d="M96 54 h68 v8 q10 6 10 20 v44 q0 12 -12 12 h-64 q-12 0 -12 -12 v-44 q0 -14 10 -20z" fill="#EAF4F8" stroke="#BFD8E2" stroke-width="2"/><rect x="92" y="42" width="76" height="14" rx="5" fill="#C8A06A"/>' +
      star(112, 112, 1.1) + star(140, 120, 1) + star(126, 94, 1.2) + star(152, 98, 0.9) + star(110, 84, 0.8) + star(214, 50, 1.3) + star(48, 70, 0.9, '#F4A7BB') + '</svg>',
    // Lists: a checklist and a grocery bag
    list: V + floor + '<rect x="44" y="20" width="96" height="118" rx="10" fill="#fff" stroke="#D9E3DA" stroke-width="2"/><rect x="72" y="12" width="40" height="16" rx="5" fill="#3E7A5E"/>' +
      [44, 66].map((y) => '<rect x="56" y="' + y + '" width="12" height="12" rx="3" fill="#3E7A5E"/><path d="M58 ' + (y + 6) + ' l3 3 l6 -6" stroke="#fff" stroke-width="2" fill="none"/><path d="M76 ' + (y + 6) + ' h44" stroke="#C9D6CB" stroke-width="4" stroke-linecap="round"/>').join('') +
      [88, 110].map((y) => '<rect x="56" y="' + y + '" width="12" height="12" rx="3" fill="none" stroke="#3E7A5E" stroke-width="2"/><path d="M76 ' + (y + 6) + ' h38" stroke="#26302B" stroke-width="4" stroke-linecap="round" opacity=".7"/>').join('') +
      '<path d="M150 70 h76 l-8 66 h-60z" fill="#E9C48A"/><path d="M164 70 q0 -20 24 -20 q24 0 24 20" stroke="#C8A06A" stroke-width="4" fill="none"/>' +
      '<rect x="160" y="40" width="10" height="40" rx="5" fill="#F2C14E" transform="rotate(-14 165 60)"/><circle cx="196" cy="58" r="14" fill="#E9573F"/><path d="M196 44 q4 -6 10 -6" stroke="#5E8A4A" stroke-width="3" fill="none"/><path d="M210 50 q14 -10 18 4 q-10 4 -18 -4z" fill="#7FB86A"/></svg>',
    // Notes: a notepad and a pencil
    note: V + floor + '<rect x="70" y="24" width="104" height="112" rx="10" fill="#FFF6D8" stroke="#EADBA8" stroke-width="2"/><path d="M70 40 h104" stroke="#F2C14E" stroke-width="6"/>' +
      [62, 80, 98, 116].map((y, i) => '<path d="M86 ' + y + ' h' + [70, 56, 64, 40][i] + '" stroke="#D8C68E" stroke-width="4" stroke-linecap="round"/>').join('') +
      '<g transform="rotate(35 190 90)"><rect x="182" y="40" width="16" height="84" rx="3" fill="#E9806E"/><rect x="182" y="40" width="16" height="12" fill="#F4A7BB"/><path d="M182 124 l8 16 l8 -16z" fill="#F4E6CE"/><path d="M188 134 l2 6 l2 -6z" fill="#26302B"/></g></svg>',
    // Meals: a plate, a fork and a spoon
    meal: V + floor + '<ellipse cx="130" cy="100" rx="70" ry="26" fill="#fff" stroke="#D9E3DA" stroke-width="2"/><ellipse cx="130" cy="96" rx="44" ry="14" fill="#F2C14E"/><circle cx="116" cy="92" r="6" fill="#E9573F"/><circle cx="140" cy="96" r="6" fill="#8CC5A8"/><circle cx="128" cy="100" r="4" fill="#E9806E"/>' +
      '<path d="M50 60 v60 M44 60 v18 q6 6 12 0 v-18 M210 60 q14 10 0 40 v20" stroke="#9AA6A0" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M110 60 q4 -10 0 -18 M130 56 q4 -10 0 -18 M150 60 q4 -10 0 -18" stroke="#C9D6CB" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    // Recipes: an open cookbook
    book: V + floor + '<path d="M130 40 q-34 -14 -70 -6 v96 q36 -8 70 6z" fill="#fff" stroke="#D9E3DA" stroke-width="2"/><path d="M130 40 q34 -14 70 -6 v96 q-36 -8 -70 6z" fill="#fff" stroke="#D9E3DA" stroke-width="2"/><path d="M130 40 v96" stroke="#C9D6CB" stroke-width="2"/>' +
      '<circle cx="96" cy="70" r="14" fill="#F2C14E"/><circle cx="92" cy="66" r="4" fill="#E9573F"/><path d="M76 98 h40 M76 110 h30" stroke="#C9D6CB" stroke-width="4" stroke-linecap="round"/><path d="M146 60 h40 M146 72 h34 M146 84 h40 M146 96 h24" stroke="#C9D6CB" stroke-width="4" stroke-linecap="round"/><path d="M178 40 v26 l6 -5 l6 5 v-28" fill="#E9806E"/></svg>',
    // Photos: two snapshots
    image: V + floor + '<g transform="rotate(-8 110 80)"><rect x="60" y="30" width="100" height="90" rx="6" fill="#fff" stroke="#D9E3DA" stroke-width="2"/><rect x="68" y="38" width="84" height="60" fill="#9FD0F0"/><path d="M68 98 l26 -26 l18 18 l14 -12 l26 20z" fill="#7DAE6A"/></g>' +
      '<g transform="rotate(10 170 90)"><rect x="130" y="50" width="90" height="80" rx="6" fill="#fff" stroke="#D9E3DA" stroke-width="2"/><rect x="138" y="58" width="74" height="52" fill="#F6C28E"/><circle cx="190" cy="74" r="8" fill="#FFF1C4"/><path d="M138 110 l20 -18 l16 12 l14 -10 l24 16z" fill="#C8704D"/></g></svg>',
    // People: a little family
    users: V + floor + '<circle cx="90" cy="68" r="20" fill="#F4A59A"/><path d="M60 136 q30 -54 60 0z" fill="#F4A59A"/><circle cx="170" cy="68" r="20" fill="#7FB8E8"/><path d="M140 136 q30 -54 60 0z" fill="#7FB8E8"/>' +
      '<circle cx="130" cy="92" r="14" fill="#FFD666"/><path d="M108 138 q22 -40 44 0z" fill="#FFD666"/><path d="M84 66 a3 3 0 0 0 6 0 M164 66 a3 3 0 0 0 6 0" stroke="#26302B" stroke-width="2" fill="none"/></svg>',
    // Countdowns: a birthday cake
    cake: V + floor + '<rect x="80" y="80" width="100" height="54" rx="8" fill="#F4A59A"/><rect x="80" y="80" width="100" height="16" rx="8" fill="#fff"/><path d="M84 96 q10 10 20 0 q10 10 20 0 q10 10 20 0 q10 10 20 0 q8 8 12 2" stroke="#fff" stroke-width="5" fill="none"/>' +
      '<path d="M110 80 v-22 M130 80 v-26 M150 80 v-22" stroke="#7FB8E8" stroke-width="5"/><path d="M110 50 q4 -8 0 -12 q-4 4 0 12z M130 46 q4 -8 0 -12 q-4 4 0 12z M150 50 q4 -8 0 -12 q-4 4 0 12z" fill="#FFB347"/>' + star(48, 50, 0.8, '#C7B7EA') + star(214, 60, 1, '#F2C14E') + '</svg>',
    // Weather: sun and a cloud
    sun: V + floor + '<circle cx="110" cy="66" r="30" fill="#FFD666"/><path d="M110 22 v-10 M110 120 v-10 M66 66 h-10 M164 66 h-10 M79 35 l-7 -7 M141 35 l7 -7" stroke="#FFD666" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M120 122 q-24 0 -20 -22 q4 -16 22 -12 q8 -20 30 -14 q20 6 18 26 q18 2 14 16 q-2 6 -10 6z" fill="#fff" stroke="#D9E3DA" stroke-width="2"/></svg>'
  };

  PL.look = { art: (name) => ART[name] || '', ART };
})();
