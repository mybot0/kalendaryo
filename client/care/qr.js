/*
 * care/qr.js — a small QR code maker (byte mode, error correction M, versions 1–10), so the family can
 * scan the Care board link with the tablet's camera. No outside library and no network.
 *   PL.qr.svg(text, size) -> <svg> element
 * Based on the QR Code standard (ISO/IEC 18004): Reed–Solomon blocks, 8 masks, the lowest-penalty mask wins.
 */
(function () {
  const PL = (window.PL = window.PL || {});

  // Error correction M, versions 1–10: [ecc codewords per block, blocks in group 1, data cw per block g1, blocks g2, data cw per block g2]
  const EC_M = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // Galois field GF(256) with the QR polynomial 0x11d.
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsRem(data, n) {
    const g = rsGen(n), r = new Array(n).fill(0);
    for (const b of data) { const f = b ^ r[0]; r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); }
    return r;
  }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 0;
    for (let v = 1; v <= 10; v++) { const e = EC_M[v], cap = e[1] * e[2] + e[3] * e[4]; if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) { ver = v; break; } }
    if (!ver) throw new Error('Text is too long for a QR code.');
    const e = EC_M[ver], capBytes = e[1] * e[2] + e[3] * e[4];
    // data bits: mode 0100 (byte), length, bytes, terminator, pad
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, capBytes * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0; data.length < capBytes; p++) data.push(p % 2 ? 0x11 : 0xec);
    // split into blocks, add error correction, interleave
    const blocks = [];
    let k = 0;
    for (let i = 0; i < e[1]; i++) { blocks.push(data.slice(k, k + e[2])); k += e[2]; }
    for (let i = 0; i < e[3]; i++) { blocks.push(data.slice(k, k + e[4])); k += e[4]; }
    const ecc = blocks.map((b) => rsRem(b, e[0]));
    const out = [];
    const maxD = Math.max(e[2], e[4]);
    for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < e[0]; i++) ecc.forEach((b) => out.push(b[i]));
    return { ver, codewords: out };
  }

  function matrix(text) {
    const { ver, codewords } = encode(text);
    const n = ver * 4 + 17;
    const m = Array.from({ length: n }, () => new Array(n).fill(null)); // null = free, 0/1 = set
    const fn = Array.from({ length: n }, () => new Array(n).fill(false)); // function patterns (no mask)
    const set = (r, c, v) => { m[r][c] = v ? 1 : 0; fn[r][c] = true; };
    // finder patterns + separators
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r0, c0]) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, on);
      }
    });
    // timing patterns
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // alignment patterns
    const al = ALIGN[ver];
    const last = al.length - 1;
    al.forEach((r, i) => al.forEach((c, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; // those corners hold finder patterns
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }));
    // dark module + reserve format areas
    set(n - 8, 8, 1);
    for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, 0); if (!fn[i][8]) set(i, 8, 0); }
    for (let i = 0; i < 8; i++) { if (!fn[8][n - 1 - i]) set(8, n - 1 - i, 0); if (!fn[n - 1 - i][8]) set(n - 1 - i, 8, 0); }
    // version info (version 7+)
    if (ver >= 7) {
      let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const vbits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) { const b = (vbits >>> i) & 1, a = n - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
    }
    // place data bits (zigzag from the bottom right)
    const allBits = [];
    codewords.forEach((cw) => { for (let i = 7; i >= 0; i--) allBits.push((cw >>> i) & 1); });
    let bi = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const c = right - j, upward = ((right + 1) & 2) === 0, r = upward ? n - 1 - vert : vert;
        if (fn[r][c]) continue;
        m[r][c] = bi < allBits.length ? allBits[bi++] : 0;
      }
    }
    // try the 8 masks, keep the one with the lowest penalty
    const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
    let best = null, bestScore = Infinity;
    for (let mk = 0; mk < 8; mk++) {
      const g = m.map((row, r) => row.map((v, c) => (fn[r][c] ? v : v ^ (MASKS[mk](r, c) ? 1 : 0))));
      format(g, n, mk);
      const sc = penalty(g, n);
      if (sc < bestScore) { bestScore = sc; best = g; }
    }
    return best;
  }
  function format(g, n, mask) {
    const data = (0 << 3) | mask; // error correction M = 00
    let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const b = (i) => (bits >>> i) & 1;
    // g[row][col]; first copy around the top-left finder, second copy split under/right of the others
    for (let i = 0; i <= 5; i++) g[i][8] = b(i);
    g[7][8] = b(6); g[8][8] = b(7); g[8][7] = b(8);
    for (let i = 9; i < 15; i++) g[8][14 - i] = b(i);
    for (let i = 0; i < 8; i++) g[8][n - 1 - i] = b(i);
    for (let i = 8; i < 15; i++) g[n - 15 + i][8] = b(i);
    g[n - 8][8] = 1;
  }
  function penalty(g, n) {
    let s = 0;
    const lines = (get) => {
      for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b < n; b++) { if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; }
        for (let b = 0; b + 10 < n; b++) {
          const p = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], q = p.slice().reverse();
          if (p.every((v, i) => get(a, b + i) === v) || q.every((v, i) => get(a, b + i) === v)) s += 40;
        }
      }
    };
    lines((a, b) => g[a][b]); lines((a, b) => g[b][a]);
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = g[r][c]; if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) s += 3; }
    let dark = 0; g.forEach((row) => row.forEach((v) => { dark += v; }));
    s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return s;
  }

  function svg(text, size) {
    const g = matrix(text), n = g.length, q = 4, total = n + q * 2;
    let d = '';
    g.forEach((row, r) => row.forEach((v, c) => { if (v) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z'; }));
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
    el.setAttribute('width', String(size || 180)); el.setAttribute('height', String(size || 180));
    el.setAttribute('shape-rendering', 'crispEdges'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'QR code for the Care board link');
    el.innerHTML = '<rect width="100%" height="100%" fill="#fff"/><path fill="#1F2A25" d="' + d + '"/>';
    return el;
  }

  PL.qr = { svg, matrix };
})();
