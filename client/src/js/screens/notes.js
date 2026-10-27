/*
 * screens/notes.js — shared notes and simple tables (a mini spreadsheet).
 *   notes/{id}  { kind: 'note', title, text, by, at }
 *               { kind: 'table', title, cols: [{ name, type: 'text'|'number'|'check' }], rows: [[...]], by, at }
 * Changes save by themselves a moment after typing stops.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;
  const TYPES = [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'check', label: 'Check box' }];

  const myName = () => (PL.me && PL.me.member() ? PL.me.member().name : (window.KAL && KAL.me ? KAL.me.name : ''));
  const readOnly = () => !!(window.KAL && KAL.me && KAL.me.role === 'viewer');
  const copy = (o) => JSON.parse(JSON.stringify(o));
  function when(at) {
    const d = new Date(at), k = D.key(d), t = D.today();
    if (k === t) return 'today';
    if (k === D.addDays(t, -1)) return 'yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  // "$1,234.50" -> 1234.5
  const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
  function total(rows, i) {
    let sum = 0, any = false, money = false, dec = 0;
    rows.forEach((r) => {
      const v = num(r[i]);
      if (v === null) return;
      any = true; sum += v;
      if (/\$/.test(r[i])) money = true;
      const m = String(r[i]).match(/\.(\d+)/); if (m) dec = Math.max(dec, Math.min(2, m[1].length));
    });
    if (!any) return '';
    return (money ? '$' : '') + sum.toLocaleString(undefined, { minimumFractionDigits: money ? 2 : dec, maximumFractionDigits: money ? 2 : dec });
  }

  PL.screens.notes = {
    mount(root, params) {
      let openId = (params && params.id) || null;
      let work = null, workId = null, timer = null, saving = false, madeAt = 0;
      const el = h('div', { class: 'screen-page notes-page' });
      root.append(el);
      const status = h('span', { class: 'note-status', 'aria-live': 'polite' });

      const sorted = () => PL.state.notes.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
      async function make(kind) {
        const data = kind === 'table'
          ? { kind, title: 'New table', cols: [{ name: 'Item', type: 'text' }, { name: 'Amount', type: 'number' }, { name: 'Done', type: 'check' }], rows: [['', '', false], ['', '', false], ['', '', false]], by: myName(), at: Date.now() }
          : { kind, title: 'New note', text: '', by: myName(), at: Date.now() };
        const id = await PL.store.add('notes', data);
        if (id) { openId = id; work = null; madeAt = Date.now(); render(); setTimeout(() => { const t = el.querySelector('.note-title'); if (t) { t.focus(); t.select(); } }, 60); }
      }
      function changed() {
        status.textContent = 'Saving…';
        clearTimeout(timer);
        timer = setTimeout(saveNow, 700);
      }
      async function saveNow() {
        clearTimeout(timer); timer = null;
        if (!work || !workId) return;
        saving = true;
        const ok = await PL.store.set('notes', workId, Object.assign(copy(work), { at: Date.now(), by: myName() || work.by }));
        saving = false;
        status.textContent = ok ? 'Saved' : 'Not saved';
      }

      /* ---------- the list ---------- */
      function listPane(n) {
        const notes = sorted();
        return h('div', { class: 'note-list' + (openId ? ' has-open' : '') },
          notes.length ? notes.map((x) => h('button', { type: 'button', class: 'note-item' + (x.id === openId ? ' on' : ''), onclick: async () => { if (timer) await saveNow(); openId = x.id; work = null; render(); } },
            h('span', { class: 'note-kind ' + x.kind }, icon(x.kind === 'table' ? 'table' : 'note')),
            h('span', { class: 'note-item-text' }, h('strong', {}, x.title), h('span', { class: 'sub' }, (x.kind === 'table' ? 'Table' : 'Note') + (x.by ? ' · ' + x.by : '') + ', ' + when(x.at)))))
            : ui.emptyState({ icon: 'note', title: 'No notes yet', text: 'Keep Wi-Fi codes, gift ideas and plans here, or make a table for a budget. Everyone in the home can see and change them.' }));
      }

      /* ---------- a note ---------- */
      function noteEditor(x) {
        const ro = readOnly();
        const title = h('input', { type: 'text', class: 'note-title', maxlength: '80', 'aria-label': 'Title', readonly: ro });
        title.value = work.title;
        title.addEventListener('input', () => { work.title = title.value; changed(); });
        const head = h('div', { class: 'note-head' },
          h('button', { type: 'button', class: 'link-btn note-back', onclick: async () => { if (timer) await saveNow(); openId = null; work = null; render(); } }, icon('left'), 'All notes'),
          title, status,
          ro ? null : ui.iconButton('trash', 'Delete', async () => {
            if (!(await ui.confirm({ title: 'Delete “' + work.title + '”?', message: 'It is removed for everyone.', confirmLabel: 'Delete', danger: true }))) return;
            clearTimeout(timer); timer = null;
            if (await PL.store.del('notes', x.id)) { openId = null; work = null; render(); ui.toast('Deleted.'); }
          }));
        if (work.kind === 'note') {
          const text = h('textarea', { class: 'note-text', 'aria-label': 'Note', placeholder: 'Write anything…', readonly: ro });
          text.value = work.text || '';
          text.addEventListener('input', () => { work.text = text.value; changed(); });
          return h('section', { class: 'card note-editor' }, head, text);
        }
        return h('section', { class: 'card note-editor' }, head, tableEditor(ro));
      }

      /* ---------- a table ---------- */
      function tableEditor(ro) {
        const wrap = h('div', { class: 'tbl-wrap' });
        function cell(r, i) {
          const c = work.cols[i];
          if (c.type === 'check') {
            const cb = h('input', { type: 'checkbox', 'aria-label': c.name + ', row ' + (r + 1), disabled: ro });
            cb.checked = !!work.rows[r][i];
            cb.addEventListener('change', () => { work.rows[r][i] = cb.checked; changed(); paintFoot(); });
            return h('td', { class: 'tbl-check' }, cb);
          }
          const inp = h('input', { type: 'text', inputmode: c.type === 'number' ? 'decimal' : 'text', maxlength: '200', 'aria-label': c.name + ', row ' + (r + 1), readonly: ro, dataset: { r: String(r), c: String(i) } });
          inp.value = work.rows[r][i] || '';
          inp.addEventListener('input', () => { work.rows[r][i] = inp.value; changed(); paintFoot(); });
          inp.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (r === work.rows.length - 1 && !ro) { addRow(); }
            const next = wrap.querySelector('input[data-r="' + (r + 1) + '"][data-c="' + i + '"]');
            if (next) next.focus();
          });
          return h('td', { class: c.type === 'number' ? 'num' : '' }, inp);
        }
        let foot;
        function paintFoot() {
          if (!foot) return;
          const any = work.cols.some((c) => c.type !== 'text');
          foot.hidden = !any;
          foot.replaceChildren(h('tr', {}, work.cols.map((c, i) => h('td', { class: c.type === 'number' ? 'num' : '' },
            i === 0 && c.type === 'text' ? 'Total' : c.type === 'number' ? total(work.rows, i) : c.type === 'check' ? work.rows.filter((r) => r[i]).length + ' of ' + work.rows.length : '')),
            ro ? null : h('td', {})));
        }
        function addRow() { work.rows.push(work.cols.map((c) => (c.type === 'check' ? false : ''))); changed(); paint(); }
        function paint() {
          foot = h('tfoot', {});
          const table = h('table', { class: 'tbl', style: 'min-width:' + Math.max(280, work.cols.length * 100 + (ro ? 0 : 44)) + 'px' },
            h('thead', {}, h('tr', {}, work.cols.map((c, i) => h('th', { class: c.type === 'number' ? 'num' : c.type === 'check' ? 'tbl-check' : '' },
              ro ? c.name : h('button', { type: 'button', class: 'tbl-col', onclick: () => openColumn(i), 'aria-label': 'Change column ' + c.name }, c.name))), ro ? null : h('th', { class: 'tbl-x' }))),
            h('tbody', {}, work.rows.map((row, r) => h('tr', {}, work.cols.map((c, i) => cell(r, i)),
              ro ? null : h('td', { class: 'tbl-x' }, ui.iconButton('x', 'Delete row ' + (r + 1), () => { work.rows.splice(r, 1); changed(); paint(); }))))),
            foot);
          paintFoot();
          wrap.replaceChildren(...[h('div', { class: 'tbl-scroll' }, table),
            ro ? null : h('div', { class: 'btn-row' },
              ui.button('Add row', { icon: 'plus', onClick: () => { addRow(); const ins = wrap.querySelectorAll('tbody tr:last-child input[type=text]'); if (ins[0]) ins[0].focus(); } }),
              work.cols.length < 12 ? ui.button('Add column', { icon: 'plus', onClick: () => openColumn(-1) }) : null),
            ro ? null : h('p', { class: 'hint' }, 'Tap a column name to rename it or make it a number or check box column. Number columns add up at the bottom.')].filter(Boolean));
        }
        function openColumn(i) {
          const isNew = i < 0;
          const c = isNew ? { name: '', type: 'text' } : work.cols[i];
          const name = h('input', { type: 'text', maxlength: '40', autocomplete: 'off', autofocus: true, placeholder: 'For example: Cost' });
          name.value = c.name;
          let type = c.type;
          const seg = ui.segmented(TYPES, type, (v) => { type = v; }, 'Kind of column');
          const save = () => {
            const n = name.value.trim() || 'Column';
            if (isNew) { work.cols.push({ name: n, type }); work.rows.forEach((r) => r.push(type === 'check' ? false : '')); }
            else {
              if (type !== c.type) work.rows.forEach((r) => { r[i] = type === 'check' ? !!(r[i] && r[i] !== 'false') : (r[i] === true ? 'Yes' : r[i] === false ? '' : r[i]); });
              work.cols[i] = { name: n, type };
            }
            changed(); s.close(); paint();
          };
          const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button(isNew ? 'Add column' : 'Save', { variant: 'primary', big: true, onClick: save })];
          if (!isNew) {
            const move = (d) => { const j = i + d; if (j < 0 || j >= work.cols.length) return; [work.cols[i], work.cols[j]] = [work.cols[j], work.cols[i]]; work.rows.forEach((r) => { [r[i], r[j]] = [r[j], r[i]]; }); changed(); s.close(); paint(); };
            footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: async () => {
              if (work.cols.length === 1) { ui.toast('A table needs at least one column.'); return; }
              if (!(await ui.confirm({ title: 'Delete the “' + c.name + '” column?', message: 'Everything in this column is removed.', confirmLabel: 'Delete', danger: true }))) return;
              work.cols.splice(i, 1); work.rows.forEach((r) => r.splice(i, 1)); changed(); s.close(); paint();
            } }));
            if (i > 0) footer.unshift(ui.iconButton('left', 'Move left', () => move(-1)));
            if (i < work.cols.length - 1) footer.unshift(ui.iconButton('right', 'Move right', () => move(1)));
          }
          const s = ui.sheet({ title: isNew ? 'New column' : 'Column', footer,
            body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } }, ui.field('Name', name), ui.field('Kind', seg.el)) });
        }
        paint();
        return wrap;
      }

      function render() {
        const x = openId && PL.state.notes.find((n) => n.id === openId);
        if (openId && !x && PL.state.live && Date.now() - madeAt > 4000) openId = null;
        if (x && (!work || workId !== x.id)) { work = copy(x); workId = x.id; status.textContent = ''; }
        el.classList.toggle('open', !!x);
        el.replaceChildren(
          h('header', { class: 'page-head' }, h('h1', {}, 'Notes'),
            readOnly() ? null : h('div', { class: 'btn-row' },
              ui.button('New note', { icon: 'note', onClick: () => make('note') }),
              ui.button('New table', { variant: 'primary', icon: 'table', onClick: () => make('table') }))),
          h('div', { class: 'notes-cols' }, listPane(), x ? noteEditor(x) : (openId ? h('p', { class: 'sub' }, 'Opening…') : h('div', { class: 'note-empty' }, PL.state.notes.length ? h('p', { class: 'sub' }, 'Pick a note to open it.') : null))));
      }

      render();
      return {
        update: () => {
          const a = document.activeElement;
          if (timer || saving || (a && el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName))) return; // do not disturb typing
          const x = openId && PL.state.notes.find((n) => n.id === openId);
          if (x && work && JSON.stringify(Object.assign({}, x, { id: undefined, at: 0, by: '' })) !== JSON.stringify(Object.assign({}, work, { id: undefined, at: 0, by: '' }))) work = null; // someone else changed it
          render();
        },
        destroy() { if (timer) saveNow(); }
      };
    }
  };
})();
