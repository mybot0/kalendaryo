/*
 * look.js — the "Cozy look" for Triply: small drawings for empty boxes and pages.
 * Decoration lives here and in styles/cozy.css (the trip covers live in covers.js), so it can be
 * turned off, redesigned, or swapped for a seasonal pack later without touching the screens.
 *
 *   TR.look.art(name) -> SVG string, or '' (then the plain icon is used)
 *
 * Names match the empty-state icon names (ticket, bag, chat, …). A screen can ask for another
 * drawing with ui.emptyState({ art: 'receipt', … }). To turn the drawings off, drop this file from build.js.
 */
(function () {
  const TR = window.TR;
  const V = '<svg viewBox="0 0 260 150" aria-hidden="true" focusable="false">';
  const floor = '<ellipse cx="130" cy="141" rx="104" ry="8" fill="#F1E3DA"/>';
  const F = 'font-family="Outfit,Figtree,system-ui,sans-serif"';

  const ART = {
    // Bookings: a boarding pass and a hotel key card
    ticket: V + floor + '<g transform="rotate(-8 90 80)"><rect x="20" y="40" width="150" height="80" rx="10" fill="#fff" stroke="#E7D3C8" stroke-width="2"/><rect x="20" y="40" width="150" height="24" rx="10" fill="#B8583A"/><rect x="20" y="54" width="150" height="10" fill="#B8583A"/>' +
      '<text x="32" y="57" font-size="10" font-weight="800" fill="#fff" ' + F + ' letter-spacing="1.5">BOARDING PASS</text><text x="32" y="92" font-size="20" font-weight="800" fill="#26302B" ' + F + '>YVR</text><text x="118" y="92" font-size="20" font-weight="800" fill="#B8583A" ' + F + '>CDG</text>' +
      '<path d="M78 85 h28" stroke="#C9A595" stroke-width="2" stroke-dasharray="3 4"/><path d="M104 80 l6 5 l-6 5" fill="none" stroke="#B8583A" stroke-width="2"/><path d="M32 104 h50 M32 110 h30" stroke="#E7D3C8" stroke-width="3" stroke-linecap="round"/><path d="M140 100 v14 M145 100 v14 M150 100 v14 M153 100 v14 M158 100 v14" stroke="#26302B" stroke-width="2"/></g>' +
      '<g transform="rotate(10 200 90)"><rect x="160" y="50" width="70" height="90" rx="10" fill="#C7B7EA"/><circle cx="195" cy="80" r="14" fill="#fff" opacity=".85"/><text x="195" y="85" text-anchor="middle" font-size="13" font-weight="800" fill="#6A4BA6" ' + F + '>207</text><path d="M175 110 h40 M175 118 h28" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/></g>' +
      '<path d="M200 20 l14 6 l-4 4 l-14 -4z" fill="#7FB8E8"/><path d="M196 18 l26 12" stroke="#5A8FC8" stroke-width="3" stroke-linecap="round"/><path d="M150 26 q20 -14 40 -6" stroke="#C9A595" stroke-width="2" stroke-dasharray="2 5" fill="none"/></svg>',
    // Costs: a receipt and coins
    receipt: V + floor + '<path d="M80 18 h90 v118 l-10 -6 l-10 6 l-10 -6 l-10 6 l-10 -6 l-10 6 l-10 -6 l-10 6 l-10 -6z" fill="#fff" stroke="#E7D3C8" stroke-width="2"/>' +
      '<path d="M94 40 h50 M94 56 h36 M94 70 h44 M94 84 h30" stroke="#E7D3C8" stroke-width="4" stroke-linecap="round"/><path d="M94 106 h62" stroke="#26302B" stroke-width="2"/><text x="156" y="124" text-anchor="end" font-size="15" font-weight="800" fill="#B8583A" ' + F + '>€96</text>' +
      '<ellipse cx="200" cy="128" rx="20" ry="7" fill="#D9A33A"/><rect x="180" y="114" width="40" height="14" fill="#F2C14E"/><ellipse cx="200" cy="114" rx="20" ry="7" fill="#FFD666"/><ellipse cx="206" cy="102" rx="20" ry="7" fill="#F2C14E"/><ellipse cx="206" cy="98" rx="20" ry="7" fill="#FFD666"/><text x="206" y="102" text-anchor="middle" font-size="10" font-weight="800" fill="#B07A1A" ' + F + '>$</text>' +
      '<circle cx="52" cy="110" r="16" fill="#8CC5A8"/><text x="52" y="116" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" ' + F + '>÷</text></svg>',
    // Files: a folder with papers
    file: V + floor + '<rect x="70" y="30" width="80" height="96" rx="6" fill="#fff" stroke="#E7D3C8" stroke-width="2" transform="rotate(-8 110 78)"/><rect x="104" y="24" width="80" height="96" rx="6" fill="#fff" stroke="#E7D3C8" stroke-width="2" transform="rotate(6 144 72)"/>' +
      '<path d="M120 48 h44 M120 60 h36 M120 72 h40" stroke="#E7D3C8" stroke-width="4" stroke-linecap="round" transform="rotate(6 144 72)"/><rect x="132" y="80" width="26" height="14" rx="3" fill="#E9573F" transform="rotate(6 144 72)"/><text x="145" y="91" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" ' + F + ' transform="rotate(6 144 72)">PDF</text>' +
      '<path d="M54 72 h50 l10 10 h92 v50 q0 8 -8 8 h-136 q-8 0 -8 -8z" fill="#F2A65A"/><path d="M54 90 h152 v42 q0 8 -8 8 h-136 q-8 0 -8 -8z" fill="#F6C28E"/></svg>',
    // Chat: speech bubbles
    chat: V + floor + '<path d="M50 30 h104 q14 0 14 14 v40 q0 14 -14 14 h-64 l-22 18 v-18 h-18 q-14 0 -14 -14 v-40 q0 -14 14 -14z" fill="#fff" stroke="#E7D3C8" stroke-width="2"/>' +
      '<circle cx="80" cy="64" r="7" fill="#F2A65A"/><circle cx="104" cy="64" r="7" fill="#F2A65A"/><circle cx="128" cy="64" r="7" fill="#F2A65A"/>' +
      '<path d="M140 76 h68 q12 0 12 12 v26 q0 12 -12 12 h-8 v16 l-18 -16 h-42 q-12 0 -12 -12 v-26 q0 -12 12 -12z" fill="#8CC5A8"/><text x="174" y="110" text-anchor="middle" font-size="20" ' + F + '>👋</text></svg>',
    // Itinerary / overview: a map with a dotted route and pins
    calendar: V + floor + '<path d="M40 40 l60 -14 l60 14 l60 -14 v94 l-60 14 l-60 -14 l-60 14z" fill="#F6F0E4" stroke="#E4D6BE" stroke-width="2"/><path d="M100 26 v94 M160 40 v94" stroke="#E4D6BE" stroke-width="2"/>' +
      '<path d="M40 90 q40 -20 70 6 q30 26 60 -4" stroke="#D5E6DA" stroke-width="12" fill="none"/><path d="M64 104 C90 60 130 110 150 70 S190 40 196 52" stroke="#B8583A" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round" fill="none"/>' +
      '<circle cx="64" cy="104" r="7" fill="#fff" stroke="#B8583A" stroke-width="3"/><path d="M196 56 C182 40 182 22 196 18 C210 22 210 40 196 56Z" fill="#B8583A"/><circle cx="196" cy="34" r="6" fill="#fff"/></svg>',
    // Updates: a bell with a check
    bell: V + floor + '<path d="M130 26 q-36 0 -38 40 v26 l-12 20 h100 l-12 -20 v-26 q-2 -40 -38 -40z" fill="#F2C14E"/><circle cx="130" cy="122" r="10" fill="#D9A33A"/><rect x="124" y="16" width="12" height="12" rx="6" fill="#D9A33A"/>' +
      '<circle cx="178" cy="44" r="18" fill="#8CC5A8"/><path d="M170 44 l6 6 l11 -12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M70 50 q-8 14 0 28 M58 44 q-12 20 0 40" stroke="#E7D3C8" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    // Packing / trips: an open suitcase
    bag: V + floor + '<rect x="40" y="70" width="180" height="66" rx="12" fill="#C8704D"/><path d="M48 70 L60 30 H200 L212 70Z" fill="#A65E41"/><path d="M60 30 H200 L196 40 H64Z" fill="#8A4A35"/>' +
      '<rect x="56" y="54" width="54" height="22" rx="6" fill="#7FB8E8" transform="rotate(-6 83 65)"/><rect x="104" y="50" width="50" height="24" rx="6" fill="#FFD666" transform="rotate(4 129 62)"/><rect x="150" y="54" width="48" height="20" rx="6" fill="#8CC5A8" transform="rotate(-3 174 64)"/>' +
      '<circle cx="80" cy="100" r="9" fill="#26302B"/><circle cx="104" cy="100" r="9" fill="#26302B"/><path d="M89 100 h6" stroke="#26302B" stroke-width="3"/><rect x="150" y="88" width="34" height="24" rx="4" fill="#fff" opacity=".9"/><path d="M156 96 h22 M156 104 h14" stroke="#B8583A" stroke-width="2"/>' +
      '<path d="M120 70 v66" stroke="#A65E41" stroke-width="3"/><circle cx="120" cy="104" r="4" fill="#FFD666"/></svg>',
    // Search / nothing found: a magnifying glass over a map
    sparkle: V + floor + '<path d="M50 44 l50 -12 l50 12 l50 -12 v80 l-50 12 l-50 -12 l-50 12z" fill="#F6F0E4" stroke="#E4D6BE" stroke-width="2"/><path d="M100 32 v80 M150 44 v80" stroke="#E4D6BE" stroke-width="2"/>' +
      '<circle cx="146" cy="74" r="30" fill="#fff" fill-opacity=".7" stroke="#B8583A" stroke-width="7"/><path d="M168 96 l26 26" stroke="#B8583A" stroke-width="10" stroke-linecap="round"/><text x="146" y="84" text-anchor="middle" font-size="26" font-weight="800" fill="#C9A595" ' + F + '>?</text></svg>'
  };

  TR.look = { art: (name) => ART[name] || '', ART };
})();
