/*
 * rewards-data.js — stars. They are never stored as a running total; they are worked out
 * from what happened, so unticking a chore takes its star back and nothing can drift.
 *
 *   earned  = stars of every ticked chore the person was given
 *           + stars of every routine the person finished (all steps ticked)
 *   spent   = the cost of every reward they redeemed
 *   balance = earned - spent
 * "Anyone" chores and routines have no owner, so they earn no stars.
 */
(function () {
  const PL = (window.PL = window.PL || {});

  const starsOn = () => PL.state.settings.starsOn !== false;
  const value = (x) => (x.stars == null ? 1 : x.stars);

  function earned(memberId) {
    const S = PL.state;
    let n = 0;
    const chores = new Map(S.chores.map((c) => [c.id, c]));
    S.completions.forEach((c) => { if (c.memberId === memberId && chores.has(c.choreId)) n += value(chores.get(c.choreId)); });
    const routines = new Map(S.routines.map((r) => [r.id, r]));
    S.rlogs.forEach((l) => {
      const r = routines.get(l.routineId);
      if (l.memberId !== memberId || !r || !r.steps.length) return;
      if (r.steps.every((s) => (l.done || []).includes(s.id))) n += value(r);
    });
    return n;
  }
  const spent = (memberId) => PL.state.redemptions.filter((x) => x.memberId === memberId).reduce((a, x) => a + (x.cost || 0), 0);
  const balance = (memberId) => earned(memberId) - spent(memberId);

  const redeem = (reward, memberId) => PL.store.add('redemptions', { rewardId: reward.id, title: reward.title, cost: reward.cost, memberId, date: PL.D.today(), by: PL.state.uid });
  const undo = (redemption) => PL.store.del('redemptions', redemption.id);
  const saveReward = (id, data) => (id
    ? PL.store.set('rewards', id, Object.assign({}, PL.state.rewards.find((r) => r.id === id), data))
    : PL.store.add('rewards', data));
  const removeReward = (id) => PL.store.del('rewards', id);

  PL.stars = { starsOn, earned, spent, balance, redeem, undo, saveReward, removeReward };
})();
