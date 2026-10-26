/*
 * screens/rewards.js — the Rewards tab: star balances, a list of rewards to spend them on,
 * and a short history. Spending stars asks for the parent PIN when one is set.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;
  const EMOJI = ['🎬', '🍦', '🎮', '🍕', '🧁', '🛝', '🎨', '📚', '🚲', '🧸', '🎁', '🎢', '🌙', '⚽', '🎵', '🏊'];
  const plural = (n) => n + (n === 1 ? ' star' : ' stars');

  /* ---------- add / edit form ---------- */
  async function openForm(opts) {
    if (!(await PL.pin.require('Enter the PIN to change rewards.'))) return;
    const rw = (opts && opts.reward) || null;
    let emoji = rw ? rw.emoji : EMOJI[0];
    const title = h('input', { type: 'text', maxlength: '60', placeholder: 'For example: Pick the movie', autocomplete: 'off', autofocus: true });
    title.value = rw ? rw.title : '';
    const cost = h('input', { type: 'number', min: '1', max: '999', class: 'num', 'aria-label': 'Cost in stars' });
    cost.value = rw ? rw.cost : 5;
    const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Picture' });
    const paint = () => grid.replaceChildren(...EMOJI.map((e) => h('button', { type: 'button', role: 'radio', class: 'avatar-opt' + (e === emoji ? ' on' : ''), 'aria-checked': e === emoji ? 'true' : 'false', 'aria-label': e, onclick: () => { emoji = e; paint(); } }, e)));
    paint();

    async function save() {
      const t = title.value.trim();
      const c = parseInt(cost.value, 10);
      if (!t) { ui.toast('Please type a name first.'); title.focus(); return; }
      if (!(c >= 1)) { ui.toast('The cost must be at least 1 star.'); cost.focus(); return; }
      saveBtn.disabled = true;
      const ok = await PL.stars.saveReward(rw ? rw.id : null, { title: t, emoji, cost: c });
      saveBtn.disabled = false;
      if (ok) { s.close(); ui.toast(rw ? 'Reward saved.' : 'Reward added.'); }
    }
    async function del() {
      if (!(await ui.confirm({ title: 'Delete this reward?', message: '“' + rw.title + '” will be removed. Past redemptions stay in the history.', confirmLabel: 'Delete', danger: true }))) return;
      if (await PL.stars.removeReward(rw.id)) { s.close(); ui.toast('Reward deleted.'); }
    }
    const saveBtn = ui.button(rw ? 'Save changes' : 'Add reward', { variant: 'primary', big: true, onClick: save });
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), saveBtn];
    if (rw) footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: del }));
    const s = ui.sheet({
      title: rw ? 'Edit reward' : 'New reward', footer, wide: true,
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('Reward', title), ui.field('Picture', grid), ui.field('Costs (stars)', cost))
    });
  }

  /* ---------- spending ---------- */
  async function redeem(reward) {
    const eligible = PL.state.members.filter((m) => PL.stars.balance(m.id) >= reward.cost);
    if (!eligible.length) { ui.toast('Nobody has ' + plural(reward.cost) + ' yet.'); return; }
    const who = await ui.choose({
      title: 'Who is spending stars?',
      message: reward.title + ' costs ' + plural(reward.cost) + '.',
      options: eligible.map((m) => ({ value: m.id, label: m.name, description: 'Has ' + plural(PL.stars.balance(m.id)) + ', ' + (PL.stars.balance(m.id) - reward.cost) + ' left after' }))
    });
    if (!who) return;
    if (!(await PL.pin.require('Enter the PIN to spend stars.'))) return;
    const m = PL.store.member(who);
    if (await PL.stars.redeem(reward, who)) ui.toast('Enjoy! ' + (m ? m.name : 'Someone') + ' used ' + plural(reward.cost) + '.');
  }
  async function undoRedemption(x) {
    if (!(await PL.pin.require('Enter the PIN to give the stars back.'))) return;
    const m = PL.store.member(x.memberId);
    if (!(await ui.confirm({ title: 'Give the stars back?', message: (m ? m.name : 'They') + ' gets ' + plural(x.cost) + ' back and “' + x.title + '” is removed from the history.', confirmLabel: 'Give back' }))) return;
    if (await PL.stars.undo(x)) ui.toast('Stars given back.');
  }

  /* ---------- panel ---------- */
  function panel() {
    if (!PL.stars.starsOn()) {
      return ui.emptyState({ icon: 'star', title: 'Stars are turned off', text: 'Turn them on to give stars for chores and routines, and let the family spend them on rewards.',
        action: ui.button('Turn on stars', { variant: 'primary', big: true, onClick: async () => { if (await PL.pin.require('Enter the PIN to change this.')) PL.store.saveSettings({ starsOn: true }); } }) });
    }
    const shown = PL.state.members.filter((m) => m.role === 'child' || PL.stars.earned(m.id) > 0 || PL.stars.spent(m.id) > 0);
    const tiles = shown.length
      ? h('div', { class: 'star-tiles' }, shown.map((m) => h('div', { class: 'star-tile', style: '--c:' + m.color },
          ui.avatar(m, 48), h('strong', {}, m.name), h('span', { class: 'star-bal', 'aria-label': plural(Math.max(0, PL.stars.balance(m.id))) }, icon('star'), String(Math.max(0, PL.stars.balance(m.id)))))))
      : h('p', { class: 'sub' }, 'Stars are earned when chores and routines are ticked off. Give a chore to someone and it will show up here.');

    const rewards = PL.state.rewards.slice().sort((a, b) => a.cost - b.cost || a.title.localeCompare(b.title));
    const list = rewards.length
      ? h('div', { class: 'card-list' }, rewards.map((r) => h('div', { class: 'reward-card' },
          h('span', { class: 'reward-emoji', 'aria-hidden': 'true' }, r.emoji || '🎁'),
          h('div', { class: 'reward-main' }, h('strong', {}, r.title), h('span', { class: 'sub' }, plural(r.cost))),
          ui.button('Redeem', { variant: 'primary', onClick: () => redeem(r), aria: 'Redeem ' + r.title }),
          ui.iconButton('edit', 'Edit ' + r.title, () => openForm({ reward: r }), 'sheet-close'))))
      : ui.emptyState({ icon: 'star', title: 'No rewards yet', text: 'Add things worth working for, like picking the movie or an ice cream trip.', action: ui.button('Add a reward', { variant: 'primary', big: true, icon: 'plus', onClick: () => openForm() }) });

    const history = PL.state.redemptions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const hist = history.length ? [h('h3', { class: 'mini-h' }, 'Recently spent'), h('div', { class: 'card-list' }, history.map((x) => {
      const m = PL.store.member(x.memberId);
      return h('div', { class: 'hist-row' }, ui.avatar(m, 32),
        h('span', { class: 'hist-main' }, h('strong', {}, x.title), h('span', { class: 'sub' }, (m ? m.name : 'Someone') + ' · ' + plural(x.cost) + ' · ' + D.fmt(x.date, { month: 'short', day: 'numeric' }))),
        ui.iconButton('trash', 'Give back the stars for ' + x.title, () => undoRedemption(x), 'sheet-close'));
    }))] : [];

    return h('div', { class: 'chores-list' }, tiles, h('h3', { class: 'mini-h' }, 'Rewards'), list, hist);
  }

  PL.rewardsUi = { panel, openForm };
})();
