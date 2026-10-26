/*
 * expenses.js — Costs: who paid, who shares, and who owes whom.
 * All money maths is done in whole cents. Each currency is settled on its own (no exchange rates).
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, icon = TR.icon;

  const money = (cents, cur) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(cents / 100); } catch (e) { return cur + ' ' + (cents / 100).toFixed(2); } };
  const toCents = (n) => Math.round(Number(n) * 100);

  // Split one cost in cents among people so the shares add up exactly (the extra cents go to the first people in a fixed order).
  function shares(cents, ids) {
    const sorted = ids.slice().sort(), base = Math.floor(cents / sorted.length); let extra = cents - base * sorted.length;
    const out = {}; sorted.forEach((id) => { out[id] = base + (extra-- > 0 ? 1 : 0); });
    return out;
  }

  // -> { [currency]: { total, paid:{id:cents}, share:{id:cents}, balance:{id:cents}, transfers:[{from,to,cents}] } }
  TR.money = {
    format: money,
    compute(expenses, members) {
      const alive = new Set(members.map((m) => m.id)), by = {};
      expenses.forEach((e) => {
        const ids = (e.split || []).filter((id) => alive.has(id)); if (!ids.length) return;
        const c = by[e.currency] || (by[e.currency] = { total: 0, paid: {}, share: {}, balance: {}, transfers: [] });
        const cents = toCents(e.amount), payer = e.paid_by && alive.has(e.paid_by) ? e.paid_by : '_gone';
        c.total += cents; c.paid[payer] = (c.paid[payer] || 0) + cents; c.balance[payer] = (c.balance[payer] || 0) + cents;
        const sh = shares(cents, ids);
        Object.keys(sh).forEach((id) => { c.share[id] = (c.share[id] || 0) + sh[id]; c.balance[id] = (c.balance[id] || 0) - sh[id]; });
      });
      Object.values(by).forEach((c) => {
        const debt = Object.entries(c.balance).filter((x) => x[1] < 0).map((x) => ({ id: x[0], v: -x[1] })).sort((a, b) => b.v - a.v);
        const cred = Object.entries(c.balance).filter((x) => x[1] > 0).map((x) => ({ id: x[0], v: x[1] })).sort((a, b) => b.v - a.v);
        let i = 0, j = 0;
        while (i < debt.length && j < cred.length) {
          const t = Math.min(debt[i].v, cred[j].v);
          if (t > 0) c.transfers.push({ from: debt[i].id, to: cred[j].id, cents: t });
          debt[i].v -= t; cred[j].v -= t;
          if (!debt[i].v) i++; if (!cred[j].v) j++;
        }
      });
      return by;
    }
  };

  function expenseSheet(session, exp) {
    const members = session.state.members, me = session.me(), items = session.items();
    const title = TR.forms.input('text', exp ? exp.title : '', { maxlength: 120, placeholder: 'Dinner at Casa Lucio', autofocus: true });
    const amount = TR.forms.input('number', exp ? exp.amount : '', { inputmode: 'decimal', step: '0.01', min: '0', placeholder: '0.00' });
    const last = session.expenses().length ? session.expenses()[0].currency : 'CAD';
    const cur = TR.forms.input('text', exp ? exp.currency : last, { maxlength: 3, autocapitalize: 'characters' });
    const paid = ui.select(members.map((m) => ({ value: m.id, label: m.name + (m.you ? ' (you)' : '') })), exp && exp.paid_by ? exp.paid_by : me.id);
    const date = TR.forms.input('date', exp ? exp.spent_on || '' : D.today());
    const sel = new Set(exp ? exp.split : members.map((m) => m.id));
    const picks = members.map((m) => {
      const b = h('button', { type: 'button', class: 'person-pick', 'aria-pressed': sel.has(m.id) ? 'true' : 'false', onclick: () => { if (sel.has(m.id)) sel.delete(m.id); else sel.add(m.id); b.setAttribute('aria-pressed', sel.has(m.id) ? 'true' : 'false'); preview(); } }, ui.avatar(m, 30), m.name);
      return b;
    });
    const linkSel = ui.select([{ value: '', label: 'Not linked to a plan' }].concat(items.map((i) => ({ value: i.id, label: i.title }))), exp && exp.item_id ? exp.item_id : '');
    const note = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Optional' }); note.value = exp ? exp.note || '' : '';
    const each = h('p', { class: 'hint' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    function preview() {
      const n = sel.size, v = Number(amount.value);
      each.textContent = n && v > 0 ? 'Each person pays ' + money(Math.round(toCents(v) / n), (cur.value || 'CAD').toUpperCase().slice(0, 3)) + (n > 1 ? ' (about)' : '') : '';
    }
    [amount, cur].forEach((el) => el.addEventListener('input', preview)); preview();
    const body = h('form', { class: 'event-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('What was it for?', title),
      h('div', { class: 'row2' }, ui.field('Amount', amount), ui.field('Currency', cur)),
      h('div', { class: 'row2' }, ui.field('Paid by', paid), ui.field('Date', date)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Shared between'), h('div', { class: 'chip-row' }, picks), each),
      ui.field('Plan', linkSel), ui.field('Note', note), err, h('button', { type: 'submit', hidden: true }));
    const saveBtn = ui.button(exp ? 'Save' : 'Add cost', { variant: 'primary', big: true, onClick: () => save() });
    const s = ui.sheet({ title: exp ? 'Change cost' : 'Add a cost', body, footer: [exp ? ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: remove }) : null, h('span', { class: 'spacer' }), ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), saveBtn] });
    async function save() {
      err.textContent = ''; saveBtn.disabled = true;
      const p = { title: title.value, amount: amount.value, currency: cur.value, paid_by: paid.value, split: [...sel], spent_on: date.value || null, item_id: linkSel.value || null, note: note.value };
      try {
        if (exp) await session.req('PATCH', '/expenses/' + exp.id, p); else await session.req('POST', '/expenses', p);
        await session.refresh(); s.close(); ui.toast(exp ? 'Saved.' : 'Cost added.');
      } catch (e) { err.textContent = e.message; saveBtn.disabled = false; }
    }
    async function remove() {
      if (!(await ui.confirm({ title: 'Delete this cost?', message: '“' + exp.title + '” will be removed for everyone.', confirmLabel: 'Delete', danger: true }))) return;
      try { await session.req('DELETE', '/expenses/' + exp.id); await session.refresh(); s.close(); ui.toast('Deleted.'); } catch (e) { ui.toast(e.message); }
    }
  }

  function mount(root, ctx) {
    const session = ctx.session;
    const name = (id) => { if (id === '_gone' || !id) return 'Former traveler'; const m = session.member(id); return m ? (m.you ? 'You' : m.name) : 'Former traveler'; };
    const canWrite = () => session.can('items.write');

    function summary(by) {
      const curs = Object.keys(by);
      if (!curs.length) return null;
      return curs.map((cur) => {
        const c = by[cur], ids = Object.keys(c.balance);
        return h('section', { class: 'card stack' },
          h('div', { class: 'page-head', style: 'margin:0' }, h('h2', {}, 'Total spent'), h('b', { class: 'money-total' }, money(c.total, cur))),
          h('div', {}, h('h3', { class: 'mini-h' }, 'Who owes whom'),
            c.transfers.length ? c.transfers.map((t) => h('div', { class: 'person-row' }, ui.avatar(session.member(t.from), 36), h('div', { class: 'person-main' }, h('span', {}, h('b', {}, name(t.from)), ' ' + (name(t.from) === 'You' ? 'owe ' : 'owes '), h('b', {}, name(t.to)))), h('b', { class: 'money' }, money(t.cents, cur))))
              : h('p', { class: 'sub' }, 'Everyone is settled up.')),
          h('div', {}, h('h3', { class: 'mini-h' }, 'Each person'),
            h('div', { class: 'bal-table', role: 'table' },
              h('div', { class: 'bal-row head', role: 'row' }, h('span', {}, ''), h('span', {}, 'Paid'), h('span', {}, 'Share'), h('span', {}, 'Balance')),
              ids.sort((a, b) => c.balance[b] - c.balance[a]).map((id) => h('div', { class: 'bal-row', role: 'row' }, h('span', {}, name(id)), h('span', {}, money(c.paid[id] || 0, cur)), h('span', {}, money(c.share[id] || 0, cur)),
                h('b', { class: c.balance[id] > 0 ? 'pos' : c.balance[id] < 0 ? 'neg' : '' }, (c.balance[id] > 0 ? '+' : '') + money(c.balance[id], cur)))))));
      });
    }

    function row(e) {
      const T = e.item_id && session.item(e.item_id) ? session.item(e.item_id) : null;
      const n = e.split.filter((id) => session.member(id)).length;
      return h('button', { type: 'button', class: 'book-card', onclick: () => (canWrite() ? expenseSheet(session, e) : ui.toast(e.title + ': ' + money(toCents(e.amount), e.currency))) },
        h('span', { class: 'tp-ic', style: '--c:#F1DC8B' }, icon('ticket')),
        h('span', { class: 'book-main' }, h('b', {}, e.title), h('span', { class: 'sub' }, [name(e.paid_by) + ' paid', n > 1 ? 'split ' + n + ' ways' : n === 1 ? 'only ' + name(e.split.find((id) => session.member(id))) : '', T ? T.title : '', e.spent_on ? D.short(e.spent_on) : ''].filter(Boolean).join(' · '))),
        h('span', { class: 'book-conf', style: 'color:var(--ink)' }, money(toCents(e.amount), e.currency)));
    }

    function render() {
      const list = session.expenses();
      const by = TR.money.compute(list, session.state.members);
      const head = h('div', { class: 'page-head' }, h('h1', {}, 'Costs'), canWrite() ? ui.button('Add cost', { icon: 'plus', variant: 'primary', onClick: () => expenseSheet(session, null) }) : null);
      if (!list.length) return root.replaceChildren(head, h('div', { class: 'card' }, ui.emptyState({ icon: 'ticket', title: 'No costs yet', text: 'Add what you pay for on the trip. Triply keeps track of who owes whom, so nobody needs a spreadsheet.', action: canWrite() ? ui.button('Add the first cost', { icon: 'plus', variant: 'primary', onClick: () => expenseSheet(session, null) }) : null })));
      root.replaceChildren(head, h('div', { class: 'people-grid' },
        h('div', { class: 'stack' }, ...[].concat(summary(by) || [])),
        h('section', { class: 'stack' }, h('h2', {}, 'All costs'), h('div', { class: 'card-list' }, list.map(row)))));
    }
    render();
    const off = session.on((k) => { if (k === 'state') render(); });
    return { destroy: off };
  }

  TR.screens = TR.screens || {};
  TR.screens.expenses = { mount };
})();
