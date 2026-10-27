/*
 * screens/meals.js — the Meals screen: a week plan and a recipe box.
 *   meals/{date~slot}  { date, slot, title, recipeId, shopped? }   one meal per slot per day
 *   recipes/{id}       { title, emoji, servings, ingredients[], steps }
 * "Add to groceries" puts a meal's ingredients on the grocery list, under a heading for that meal
 * (listitems get group: "Tue · Chicken adobo"). Dishes found with ✨ are saved as recipes, so next time is instant.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;
  const SLOTS = [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }];
  const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
  const EMOJI = ['🍝', '🍚', '🥞', '🍕', '🌮', '🍲', '🥗', '🍗', '🐟', '🥪', '🍜', '🍔', '🥘', '🧁', '🍳', '🥦', '🍛', '🍽️'];

  const mealId = (date, slot) => date + '~' + slot;
  const mealAt = (date, slot) => PL.state.meals.find((m) => m.id === mealId(date, slot)) || null;
  const recipeOf = (id) => (id ? PL.state.recipes.find((r) => r.id === id) || null : null);
  const recipeNamed = (name) => PL.state.recipes.find((r) => r.title.trim().toLowerCase() === String(name || '').trim().toLowerCase() && r.ingredients.length) || null;
  const people = () => Math.max(2, Math.min(12, PL.state.members.length || 4));
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const groupLabel = (date, title) => (date ? D.fmt(date, { weekday: 'short' }) + ' · ' : '') + title;

  // Rows for the Home widget: every planned meal on these dates.
  function dayRows(dates) {
    const out = [];
    dates.forEach((date) => SLOTS.forEach((s) => {
      const m = mealAt(date, s.id);
      if (m) out.push({ date, title: m.title, slotLabel: SLOT_LABEL[s.id] });
    }));
    return out;
  }

  /* ---------- "Finding your recipe…" ---------- */
  function cooking(text) {
    return h('div', { class: 'cooking', role: 'status' }, h('span', { class: 'cooking-pot', 'aria-hidden': 'true' }, '🍲'), h('span', {}, text || 'Finding your recipe… this takes about 10 seconds.'));
  }
  function aiError(e) {
    const c = e && e.code;
    if (e && e.userMessage) return e.userMessage;
    if (c === 'not_granted') return 'Claude was not allowed to help. You can try again and allow it.';
    if (c === 'rate_limited') return 'Too many tries. Please wait a moment.';
    if (c === 'unavailable') return 'Finding recipes is not available here. You can still write the recipe yourself.';
    return 'Could not find that right now. Please try again.';
  }
  async function sampler() {
    const s = window.claude && (await window.claude.use('sample'));
    if (!s) throw { code: 'unavailable' };
    return s;
  }
  const cleanIng = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 40);
  const cleanSteps = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => String(x).trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean).join('\n').slice(0, 3000);
  const cleanEmoji = (v) => { const e = String(v || '').trim().slice(0, 8); return e && !/[A-Za-z0-9]/.test(e) ? e : '🍽️'; };

  /* ---------- asking Claude for recipes ---------- */
  // One dish. Uses a saved recipe with the same name first (no waiting).
  async function askIngredients(name, servings, opts) {
    const found = !(opts && opts.fresh) && recipeNamed(name);
    if (found) return { title: found.title, emoji: found.emoji, ingredients: found.ingredients.slice(), steps: found.steps, fromRecipe: found };
    const sample = await sampler();
    const res = await sample.json('A family wants to cook "' + String(name).trim().slice(0, 80) + '" for ' + servings + ' people. List what to buy to make it. ' +
      'Give each ingredient with a simple amount, like "500 g ground beef" or "2 onions". Leave out water. Include the usual staples (oil, salt, spices) only if they matter to the dish. ' +
      'Also give 4 to 8 short cooking steps, and one food emoji for the dish. Reply with ONLY JSON like {"title":"Nice name of the dish","emoji":"🍛","ingredients":["..."],"steps":["..."]}.', { modelTier: 'quick', cache: false });
    const ing = cleanIng(res && res.ingredients);
    if (!ing.length) throw { code: 'empty' };
    return { title: String(res.title || name).trim().slice(0, 80) || name, emoji: cleanEmoji(res.emoji), ingredients: ing, steps: cleanSteps(res.steps), fromRecipe: null };
  }

  // Many dishes in ONE request. Returns an array in the same order (null where nothing came back).
  async function askMany(names, servings) {
    const sample = await sampler();
    const res = await sample.json('A family wants to cook these dishes, each for ' + servings + ' people:\n' + names.map((n, i) => (i + 1) + '. ' + String(n).slice(0, 80)).join('\n') + '\n' +
      'For each dish, list what to buy, each with a simple amount like "500 g ground beef" or "2 onions". Leave out water. Include staples (oil, salt, spices) only if they matter. ' +
      'Also give 4 to 6 short cooking steps and one food emoji. Reply with ONLY a JSON array in the same order, like [{"title":"Dish","emoji":"🍛","ingredients":["..."],"steps":["..."]}].', { modelTier: 'quick', cache: false });
    const arr = Array.isArray(res) ? res : (res && Array.isArray(res.dishes) ? res.dishes : []);
    return names.map((n, i) => {
      const x = arr[i];
      const ing = cleanIng(x && x.ingredients);
      return ing.length ? { title: n, emoji: cleanEmoji(x.emoji), ingredients: ing, steps: cleanSteps(x.steps) } : null;
    });
  }

  // Ingredients for planned meals. Saved recipes are used as they are; the rest are found in one request,
  // saved to Recipes, and linked to the meal. Returns [{ label, items, meal }].
  async function ingredientsFor(meals) {
    const groups = meals.map((m) => {
      const r = recipeOf(m.recipeId) || recipeNamed(m.title);
      return { meal: m, label: groupLabel(m.date, m.title), recipe: r, items: r ? r.ingredients.slice() : null };
    });
    for (const g of groups) { // a saved recipe with the same name: link it to the meal
      if (g.recipe && g.meal.date && g.meal.recipeId !== g.recipe.id) await PL.store.set('meals', g.meal.id || mealId(g.meal.date, g.meal.slot), Object.assign({}, g.meal, { recipeId: g.recipe.id }));
    }
    const missing = groups.filter((g) => !g.items);
    if (missing.length) {
      const found = await askMany(missing.map((g) => g.meal.title), people());
      for (let i = 0; i < missing.length; i++) {
        const g = missing[i], f = found[i];
        if (!f) continue;
        g.items = f.ingredients;
        const id = await PL.store.add('recipes', { title: g.meal.title, emoji: f.emoji, servings: people(), ingredients: f.ingredients, steps: f.steps });
        if (id && g.meal.date) await PL.store.set('meals', g.meal.id || mealId(g.meal.date, g.meal.slot), Object.assign({}, g.meal, { recipeId: id }));
      }
    }
    const out = groups.filter((g) => g.items && g.items.length);
    out.notFound = groups.filter((g) => !g.items || !g.items.length).map((g) => g.meal.title);
    return out;
  }

  /* ---------- the grocery list ---------- */
  async function groceryListId() {
    const lists = PL.state.lists.slice().sort((a, b) => a.title.localeCompare(b.title));
    const g = lists.find((l) => /grocer/i.test(l.title)) || lists.find((l) => /shopping/i.test(l.title));
    return g ? g.id : PL.store.add('lists', { title: 'Groceries' });
  }

  // groups: [{ label, items: [text] }]. Same thing in two meals = one line, "also for …".
  function mergeGroups(groups) {
    const firstOf = new Map();
    return groups.map((g) => {
      const rows = [];
      g.items.forEach((text) => {
        const k = norm(text);
        if (!k) return;
        const first = firstOf.get(k);
        if (first) { if (first.group !== g) first.also.push(g.label.split(' · ').pop()); return; }
        const row = { text: text.trim(), on: true, also: [], group: g };
        firstOf.set(k, row);
        rows.push(row);
      });
      return Object.assign({}, g, { rows });
    }).filter((g) => g.rows.length);
  }

  // "Tue · Chicken adobo" -> a small pill ("Tue") and the name, like on the grocery list.
  function headParts(label) {
    const i = label.indexOf(' · ');
    return i > 0 ? [h('span', { class: 'li-pill' }, label.slice(0, i)), h('span', {}, label.slice(i + 3))] : [h('span', {}, label)];
  }

  async function addGroceries(merged) {
    const listId = await groceryListId();
    if (!listId) return null;
    const open = new Set(PL.state.listitems.filter((i) => i.listId === listId && !i.done).map((i) => norm(i.text)));
    const ids = [];
    let at = Date.now(), skipped = 0;
    for (const g of merged) {
      for (const r of g.rows) {
        if (!r.on || !r.text.trim()) continue;
        if (open.has(norm(r.text))) { skipped++; continue; }
        const also = r.also.length ? 'also for ' + r.also.slice(0, 2).join(', ') : '';
        const id = await PL.store.add('listitems', { listId, text: r.text.trim(), done: false, at: at++, group: g.label, also });
        if (!id) return null;
        ids.push(id);
      }
    }
    const list = PL.state.lists.find((l) => l.id === listId);
    const name = list ? list.title : 'Groceries';
    const n = ids.length;
    ui.toast(!n && skipped ? 'Everything is already on ' + name + '.' : n + (n === 1 ? ' item' : ' items') + ' added to ' + name + (skipped ? ' (' + skipped + ' already there)' : '') + '.', n ? {
      action: 'Undo', onAction: async () => { for (const id of ids) await PL.store.del('listitems', id); ui.toast('Taken off ' + name + '.'); }
    } : null);
    return { listId, ids };
  }

  // The check list: grouped by meal, untick what you have, then add. onAdded runs after a good add.
  function openGroceryCheck(groups, onAdded, note) {
    const merged = mergeGroups(groups);
    if (!merged.length) { ui.toast('There is nothing to add.'); return; }
    const count = () => merged.reduce((n, g) => n + g.rows.filter((r) => r.on).length, 0);
    const addBtn = ui.button('Add', { variant: 'primary', big: true, icon: 'cart', onClick: async () => {
      if (!count()) { ui.toast('Tick at least one item.'); return; }
      addBtn.disabled = true;
      const done = await addGroceries(merged);
      addBtn.disabled = false;
      if (done) { s.close(); onAdded && onAdded(done); }
    } });
    const total = h('span', { class: 'sub gc-total' });
    const sync = () => { const n = count(); addBtn.querySelector('span').textContent = 'Add ' + n + (n === 1 ? ' item' : ' items'); addBtn.disabled = !n; total.textContent = n + (n === 1 ? ' item' : ' items'); };
    const body = h('div', { class: 'gc' },
      h('p', { class: 'sub' }, 'Untick what you already have at home.'),
      note ? h('p', { class: 'form-error' }, note) : null,
      merged.map((g) => h('section', { class: 'gc-group' },
        g.label ? h('h3', { class: 'gc-head' }, ...headParts(g.label)) : null,
        g.rows.map((r) => {
          const cb = h('input', { type: 'checkbox', 'aria-label': r.text });
          cb.checked = r.on;
          cb.addEventListener('change', () => { r.on = cb.checked; row.classList.toggle('off', !r.on); sync(); });
          const row = h('label', { class: 'gc-row' }, cb, h('span', { class: 'gc-text' }, r.text), r.also.length ? h('span', { class: 'gc-also' }, 'also for ' + r.also.slice(0, 2).join(', ')) : null);
          return row;
        }))));
    const s = ui.sheet({ title: 'Add to groceries', wide: true, body, footer: [total, ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), addBtn] });
    sync();
  }

  // Planned meals → check list → groceries; marks the meals with 🛒 afterwards.
  async function shopMeals(meals, statusEl) {
    let groups;
    const needAi = meals.some((m) => !(recipeOf(m.recipeId) || recipeNamed(m.title)));
    if (needAi && statusEl) statusEl.replaceChildren(cooking(meals.length > 1 ? 'Finding the ingredients for ' + meals.length + ' meals… this takes about 20 seconds.' : null));
    try { groups = await ingredientsFor(meals); }
    catch (e) { if (statusEl) statusEl.replaceChildren(h('p', { class: 'form-error', role: 'alert' }, aiError(e))); else ui.toast(aiError(e)); return false; }
    if (statusEl) statusEl.replaceChildren();
    if (!groups.length) { ui.toast('No ingredients came back. Please try again.'); return false; }
    const missed = groups.notFound || [];
    openGroceryCheck(groups, async () => {
      for (const g of groups) {
        const m = g.meal;
        if (!m.date) continue;
        const now = mealAt(m.date, m.slot);
        if (now && !now.shopped) await PL.store.set('meals', now.id, Object.assign({}, now, { shopped: true }));
      }
      if (missed.length) setTimeout(() => ui.toast('Could not find the ingredients for ' + missed.join(', ') + '. Tap that day to try again.'), 4600);
    }, missed.length ? 'Could not find the ingredients for ' + missed.join(', ') + '. You can try that day again later.' : '');
    return true;
  }

  function shopRecipe(r) {
    if (!r.ingredients.length) { ui.toast('This recipe has no ingredients yet. Tap Edit to add them.'); return; }
    openGroceryCheck([{ label: (r.emoji || '🍽️') + ' · ' + r.title, items: r.ingredients }]);
  }

  // Kept for older code: send a plain list of ingredients.
  async function sendToList(ingredients, what) {
    openGroceryCheck([{ label: what || '', items: ingredients }]);
    return true;
  }

  /* ---------- recipe view and form ---------- */
  function openRecipe(r) {
    const s = ui.sheet({
      title: (r.emoji ? r.emoji + ' ' : '') + r.title, wide: true,
      body: h('div', { class: 'stack' },
        h('p', { class: 'sub' }, 'Serves ' + r.servings),
        r.ingredients.length ? [h('h3', { class: 'mini-h' }, 'Ingredients'), h('ul', { class: 'ing-list' }, r.ingredients.map((i) => h('li', {}, i)))] : h('p', { class: 'sub' }, 'No ingredients written yet.'),
        r.steps ? [h('h3', { class: 'mini-h' }, 'Steps'), h('ol', { class: 'step-list' }, r.steps.split('\n').filter((x) => x.trim()).map((x) => h('li', {}, x.trim())))] : null),
      footer: [
        ui.button('Edit', { icon: 'edit', onClick: () => { s.close(); openRecipeForm(r); } }),
        ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() }),
        r.ingredients.length ? ui.button('Add to groceries', { variant: 'primary', big: true, icon: 'cart', onClick: () => { s.close(); shopRecipe(r); } }) : null]
    });
  }

  function openRecipeForm(r, onSaved, prefill) {
    const p = prefill || r || null;
    let emoji = p && p.emoji ? p.emoji : EMOJI[0];
    const title = h('input', { type: 'text', maxlength: '80', placeholder: 'For example: Chicken adobo', autocomplete: 'off', autofocus: true });
    title.value = p ? p.title : '';
    const servings = h('input', { type: 'number', min: '1', max: '99', class: 'num', 'aria-label': 'Servings' });
    servings.value = p && p.servings ? p.servings : people();
    const ing = h('textarea', { rows: '7', placeholder: 'One ingredient on each line' });
    ing.value = p ? (p.ingredients || []).join('\n') : '';
    const steps = h('textarea', { rows: '6', placeholder: 'One step on each line' });
    steps.value = p ? p.steps || '' : '';
    const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Picture' });
    const paint = () => grid.replaceChildren(...EMOJI.map((e) => h('button', { type: 'button', role: 'radio', class: 'avatar-opt' + (e === emoji ? ' on' : ''), 'aria-checked': e === emoji ? 'true' : 'false', 'aria-label': e, onclick: () => { emoji = e; paint(); } }, e)));
    paint();
    const fillMsg = h('div');
    const fill = ui.button('Fill in for me', { icon: 'sparkle', variant: 'gold', onClick: async () => {
      const t = title.value.trim();
      if (!t) { ui.toast('Type the name of the dish first.'); title.focus(); return; }
      if ((ing.value.trim() || steps.value.trim()) && !(await ui.confirm({ title: 'Replace what you wrote?', message: 'The ingredients and steps will be filled in for you.', confirmLabel: 'Fill in' }))) return;
      fill.disabled = true; fillMsg.replaceChildren(cooking());
      try {
        const res = await askIngredients(t, parseInt(servings.value, 10) || people(), { fresh: true });
        ing.value = res.ingredients.join('\n'); steps.value = res.steps;
        if (res.emoji && EMOJI.includes(res.emoji)) { emoji = res.emoji; paint(); }
        fillMsg.replaceChildren(h('p', { class: 'hint' }, 'Filled in. Change anything you like, then save.'));
      } catch (e) { fillMsg.replaceChildren(h('p', { class: 'form-error', role: 'alert' }, aiError(e))); }
      fill.disabled = false;
    } });
    async function save() {
      const t = title.value.trim();
      if (!t) { ui.toast('Please type a name first.'); title.focus(); return; }
      const data = { title: t, emoji, servings: servings.value, ingredients: ing.value, steps: steps.value };
      saveBtn.disabled = true;
      let ok, id = r ? r.id : null;
      if (r) ok = await PL.store.set('recipes', r.id, data); else { id = await PL.store.add('recipes', data); ok = !!id; }
      saveBtn.disabled = false;
      if (ok) { s.close(); ui.toast(r ? 'Recipe saved.' : 'Recipe added.'); onSaved && onSaved(id); }
    }
    async function del() {
      if (!(await ui.confirm({ title: 'Delete this recipe?', message: '“' + r.title + '” will be removed for everyone. Meals in the plan keep their names.', confirmLabel: 'Delete', danger: true }))) return;
      if (await PL.store.del('recipes', r.id)) { s.close(); ui.toast('Recipe deleted.'); }
    }
    const saveBtn = ui.button(r ? 'Save changes' : 'Save recipe', { variant: 'primary', big: true, onClick: save });
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), saveBtn];
    if (r) footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: del }));
    const s = ui.sheet({
      title: r ? 'Edit recipe' : 'New recipe', wide: true, footer,
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('Name', title), h('div', { class: 'fill-row' }, fill, h('span', { class: 'hint' }, 'Type the name, then tap this to get the ingredients and steps.')), fillMsg,
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Picture'), grid),
        ui.field('Servings', servings), ui.field('Ingredients', ing), ui.field('Steps', steps))
    });
  }

  /* ---------- one meal slot ---------- */
  function openSlot(date, slot) {
    const m = mealAt(date, slot);
    if (!m) { editSlot(date, slot); return; }
    const r = recipeOf(m.recipeId) || recipeNamed(m.title);
    const status = h('div');
    const shopBtn = ui.button(m.shopped ? 'Add ingredients again' : 'Add ingredients to groceries', { variant: 'primary', big: true, block: true, icon: 'cart', onClick: async () => {
      shopBtn.disabled = true;
      const ok = await shopMeals([Object.assign({ id: m.id }, m)], status);
      shopBtn.disabled = false;
      if (ok) s.close();
    } });
    const s = ui.sheet({
      title: SLOT_LABEL[slot] + ' · ' + D.fmt(date, { weekday: 'long', month: 'short', day: 'numeric' }),
      body: h('div', { class: 'stack slot-view' },
        h('h2', { class: 'slot-title' }, (r && r.emoji ? r.emoji + ' ' : '') + m.title),
        m.shopped ? h('p', { class: 'slot-done' }, icon('check'), 'The ingredients are on your grocery list.') : null,
        shopBtn,
        r ? ui.button('View recipe', { big: true, block: true, icon: 'book', onClick: () => { s.close(); openRecipe(r); } }) : null,
        status,
        h('p', { class: 'hint' }, r ? r.ingredients.length + ' ingredients from your saved recipe. No waiting.' : 'We find the ingredients for you and save the recipe, so next time is instant.')),
      footer: [
        ui.button('Change ' + SLOT_LABEL[slot].toLowerCase(), { icon: 'edit', onClick: () => { s.close(); editSlot(date, slot); } }),
        ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() })]
    });
  }

  function editSlot(date, slot) {
    const m = mealAt(date, slot);
    let recipeId = m ? m.recipeId : '';
    const title = h('input', { type: 'text', maxlength: '80', placeholder: 'For example: Tacos', autocomplete: 'off', autofocus: true });
    title.value = m ? m.title : '';
    title.addEventListener('input', () => { const r = recipeOf(recipeId); if (r && r.title !== title.value) recipeId = ''; paint(); });
    const chips = h('div', { class: 'chip-row' });
    function paint() {
      const recipes = PL.state.recipes.slice().sort((a, b) => a.title.localeCompare(b.title));
      chips.replaceChildren(...recipes.map((r) => h('button', { type: 'button', class: 'person-pick', 'aria-pressed': r.id === recipeId ? 'true' : 'false',
        onclick: () => { recipeId = r.id; title.value = r.title; paint(); } }, (r.emoji ? r.emoji + ' ' : '') + r.title)));
    }
    paint();
    async function save() {
      const t = title.value.trim();
      if (!t) { ui.toast('Please type what is for ' + SLOT_LABEL[slot].toLowerCase() + '.'); title.focus(); return; }
      const same = m && m.title === t && m.recipeId === recipeId;
      if (await PL.store.set('meals', mealId(date, slot), { date, slot, title: t, recipeId, shopped: same && m.shopped })) { s.close(); ui.toast('Saved.'); }
    }
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Save', { variant: 'primary', big: true, onClick: save })];
    if (m) footer.unshift(ui.button('Clear', { variant: 'danger', icon: 'trash', onClick: async () => { if (await PL.store.del('meals', m.id)) { s.close(); ui.toast('Cleared.'); } } }));
    const s = ui.sheet({
      title: SLOT_LABEL[slot] + ' · ' + D.fmt(date, { weekday: 'long', month: 'short', day: 'numeric' }), footer,
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('What is for ' + SLOT_LABEL[slot].toLowerCase() + '?', title),
        PL.state.recipes.length ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Or pick a recipe'), chips) : h('p', { class: 'hint' }, 'Add recipes in the Recipes tab to pick them here.'))
    });
  }

  /* ---------- dinner ideas ---------- */
  async function openSuggest(weekStart) {
    const dates = Array.from({ length: 7 }, (_, i) => D.addDays(weekStart, i)).filter((d) => d >= D.today() && !mealAt(d, 'dinner'));
    if (!dates.length) { ui.toast('Every dinner from today on is already planned this week.'); return; }
    const sample = window.claude && (await window.claude.use('sample'));
    if (!sample) { ui.toast('Dinner ideas are not available on this page.'); return; }
    const notes = h('textarea', { rows: '3', placeholder: 'Optional. For example: no pork, quick meals on school nights, one vegetarian night.' });
    const out = h('div', { class: 'stack' });
    const status = h('div');
    let picks = [];
    async function ask() {
      go.disabled = true;
      out.replaceChildren(cooking('Thinking of dinners… this takes about 10 seconds.'));
      const rs = PL.state.recipes;
      const prompt = 'You plan simple, affordable family dinners. Suggest one dinner for each of these dates: ' + dates.join(', ') + '.\n' +
        (rs.length ? 'The family already has these recipes (prefer them, and use their exact id): ' + JSON.stringify(rs.map((r) => ({ id: r.id, title: r.title }))) + '.\n' : '') +
        'Do not repeat a dinner. Mix meat, fish and vegetarian meals.\n' + (notes.value.trim() ? 'Family notes (follow them): ' + notes.value.trim().slice(0, 400) + '\n' : '') +
        'Reply with ONLY a JSON array like [{"date":"YYYY-MM-DD","title":"Dinner name","recipeId":"id from the list or empty string"}].';
      try {
        const res = await sample.json(prompt, { modelTier: 'quick', cache: false });
        const ids = new Set(rs.map((r) => r.id));
        picks = (Array.isArray(res) ? res : []).filter((x) => x && dates.includes(x.date) && typeof x.title === 'string' && x.title.trim())
          .map((x) => ({ date: x.date, title: x.title.trim().slice(0, 80), recipeId: ids.has(x.recipeId) ? x.recipeId : '', on: true }))
          .filter((x, i, a) => a.findIndex((y) => y.date === x.date) === i);
        if (!picks.length) { out.replaceChildren(h('p', { class: 'form-error' }, 'No ideas came back. Please try again.')); go.disabled = false; return; }
        out.replaceChildren(h('p', { class: 'ai-note' }, 'Untick any you do not want. Nothing is saved until you press Add.'),
          ...picks.map((p) => { const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': p.title }); cb.addEventListener('change', () => { p.on = cb.checked; });
            return h('label', { class: 'ai-pick' }, cb, h('span', { class: 'meal-slot' }, D.fmt(p.date, { weekday: 'short' })), h('span', { class: 'meal-title' }, p.title)); }));
        addBtn.hidden = false; bothBtn.hidden = false;
      } catch (e) { out.replaceChildren(h('p', { class: 'form-error' }, aiError(e))); }
      go.disabled = false;
    }
    async function addAll() {
      const added = [];
      for (const p of picks.filter((x) => x.on)) {
        if (mealAt(p.date, 'dinner')) continue;
        const data = { date: p.date, slot: 'dinner', title: p.title, recipeId: p.recipeId };
        if (await PL.store.set('meals', mealId(p.date, 'dinner'), data)) added.push(Object.assign({ id: mealId(p.date, 'dinner') }, data));
      }
      return added;
    }
    const go = ui.button('Suggest dinners', { icon: 'sparkle', onClick: ask });
    const addBtn = ui.button('Add to plan', { big: true, onClick: async () => {
      const added = await addAll();
      s.close(); ui.toast(added.length + (added.length === 1 ? ' dinner added.' : ' dinners added.'));
    } });
    const bothBtn = ui.button('Add to plan + groceries', { variant: 'primary', big: true, icon: 'cart', onClick: async () => {
      if (!picks.some((x) => x.on)) { ui.toast('Tick at least one dinner.'); return; }
      addBtn.disabled = bothBtn.disabled = true;
      const added = await addAll();
      if (!added.length) { s.close(); return; }
      const ok = await shopMeals(added, status);
      addBtn.disabled = bothBtn.disabled = false;
      if (ok) s.close(); else { addBtn.hidden = true; bothBtn.querySelector('span').textContent = 'Try groceries again'; bothBtn.onclick = async () => { bothBtn.disabled = true; if (await shopMeals(added, status)) s.close(); bothBtn.disabled = false; }; }
    } });
    addBtn.hidden = true; bothBtn.hidden = true;
    const s = ui.sheet({ title: 'Dinner ideas', wide: true, footer: [ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() }), addBtn, bothBtn],
      body: h('div', { class: 'event-form' }, h('p', { class: 'sub' }, 'Get dinner ideas for the days that are still empty. Only your recipe names and the notes you type are sent.'), ui.field('Anything to keep in mind?', notes), go, out, status) });
  }

  PL.mealsUi = { askIngredients, dayRows, openRecipe, openRecipeForm, sendToList, openGroceryCheck, shopRecipe };

  /* ---------- screen ---------- */
  PL.screens.meals = {
    mount(root, params) {
      let tab = (params && params.tab) || PL.storage.get('mealTab', 'plan');
      if (tab !== 'plan' && tab !== 'recipes') tab = 'recipes'; // the old Shop tab lives in Recipes now
      let cursor = D.startOfWeek((params && params.date) || D.today(), PL.state.settings.weekStart);
      let showAll = PL.storage.get('mealAll', false);
      const el = h('div', { class: 'screen-page meals' });
      root.append(el);

      function planPanel() {
        const today = D.today();
        const slots = showAll ? SLOTS : SLOTS.filter((s) => s.id === 'dinner');
        const end = D.addDays(cursor, 6);
        const label = D.fmt(cursor, { month: 'short', day: 'numeric' }) + ' – ' + D.fmt(end, { month: 'short', day: 'numeric' });
        const bar = h('div', { class: 'chores-bar' },
          ui.iconButton('left', 'Previous week', () => { cursor = D.addDays(cursor, -7); render(); }),
          ui.button('This week', { onClick: () => { cursor = D.startOfWeek(today, PL.state.settings.weekStart); render(); } }),
          ui.iconButton('right', 'Next week', () => { cursor = D.addDays(cursor, 7); render(); }),
          h('h2', { class: 'chores-day' }, label));
        const weekStatus = h('div');
        const weekBtn = ui.button('Add week to groceries', { icon: 'cart', onClick: async () => {
          const meals = [];
          for (let i = 0; i < 7; i++) SLOTS.forEach((s) => { const m = mealAt(D.addDays(cursor, i), s.id); if (m) meals.push(m); });
          if (!meals.length) { ui.toast('Nothing is planned this week yet.'); return; }
          weekBtn.disabled = true;
          await shopMeals(meals, weekStatus);
          weekBtn.disabled = false;
        } });
        const opts = h('div', { class: 'meal-opts' },
          ui.toggle('Show breakfast and lunch', showAll, (v) => { showAll = v; PL.storage.set('mealAll', v); render(); }).el,
          ui.button('Suggest dinners', { icon: 'sparkle', onClick: () => openSuggest(cursor) }),
          weekBtn);
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = D.addDays(cursor, i);
          return h('section', { class: 'chore-group meal-day' + (date === today ? ' today' : ''), 'aria-label': D.fmt(date, { weekday: 'long', month: 'long', day: 'numeric' }) },
            h('div', { class: 'cg-head' }, h('h3', { class: 'cg-name' }, D.fmt(date, { weekday: 'long' })), h('span', { class: 'cg-count' }, D.fmt(date, { month: 'short', day: 'numeric' }))),
            slots.map((s) => {
              const m = mealAt(date, s.id);
              const r = m && recipeOf(m.recipeId);
              return h('button', { type: 'button', class: 'meal-row', onclick: () => openSlot(date, s.id), 'aria-label': SLOT_LABEL[s.id] + ', ' + (m ? m.title + (m.shopped ? ', on the grocery list' : '') : 'nothing planned. Tap to add') },
                h('span', { class: 'meal-slot' }, SLOT_LABEL[s.id]),
                h('span', { class: 'meal-title' + (m ? '' : ' empty') }, m ? m.title : 'Add'),
                m && m.shopped ? h('span', { class: 'meal-cart', title: 'On the grocery list' }, icon('cart')) : null,
                r ? icon('book') : (m ? null : icon('plus')));
            }));
        });
        return [bar, opts, weekStatus, h('div', { class: 'meal-week' }, days)];
      }

      /* Recipes: "What do you want to cook?" on top, the recipe box below. */
      let find = { name: '', servings: people(), busy: false, err: '', result: null };
      function findBox() {
        const name = h('input', { type: 'text', maxlength: '80', placeholder: 'For example: Thai green chicken curry', autocomplete: 'off', 'aria-label': 'Dish name', id: 'find-dish' });
        name.value = find.name;
        name.addEventListener('input', () => { find.name = name.value; });
        const num = h('b', { class: 'stepper-num', 'aria-live': 'polite' }, String(find.servings));
        const stepper = h('div', { class: 'stepper', role: 'group', 'aria-label': 'How many people' },
          h('span', {}, 'For'),
          h('button', { type: 'button', 'aria-label': 'Fewer people', onclick: () => { find.servings = Math.max(1, find.servings - 1); num.textContent = find.servings; } }, '−'),
          num,
          h('button', { type: 'button', 'aria-label': 'More people', onclick: () => { find.servings = Math.min(30, find.servings + 1); num.textContent = find.servings; } }, '+'),
          h('span', {}, 'people'));
        async function go(e) {
          e && e.preventDefault();
          const n = name.value.trim();
          if (!n) { ui.toast('Type a dish first.'); name.focus(); return; }
          const have = recipeNamed(n);
          if (have) { find.name = ''; render(); openRecipe(have); ui.toast('You already have this recipe.'); return; }
          find.name = n; find.busy = true; find.err = ''; find.result = null; render();
          try {
            const r = await askIngredients(n, find.servings, { fresh: true });
            find.result = { title: r.title, emoji: r.emoji, servings: find.servings, steps: r.steps, items: r.ingredients.map((t) => ({ text: t, on: true })) };
          } catch (err) { find.err = aiError(err); }
          find.busy = false; render();
        }
        return h('form', { class: 'find-box', onsubmit: go },
          h('h2', {}, icon('sparkle'), 'What do you want to cook?'),
          h('div', { class: 'find-row' }, name, stepper,
            ui.button(find.busy ? 'Finding…' : 'Find recipe', { variant: 'gold', big: true, icon: 'sparkle', type: 'submit', disabled: find.busy })),
          find.busy ? cooking() : h('p', { class: 'find-tip' }, 'Type any dish. You get the ingredients and the steps, and you can change anything before saving.'),
          find.err ? h('p', { class: 'form-error', role: 'alert' }, find.err) : null);
      }

      function foundCard() {
        const r = find.result;
        const title = h('input', { type: 'text', maxlength: '80', class: 'found-title', 'aria-label': 'Recipe name' });
        title.value = r.title;
        title.addEventListener('input', () => { r.title = title.value; });
        const rows = h('div', { class: 'found-ings' });
        function paintRows() {
          rows.replaceChildren(...r.items.map((it, i) => {
            const cb = h('input', { type: 'checkbox', 'aria-label': 'Add ' + it.text + ' to groceries' }); cb.checked = it.on;
            cb.addEventListener('change', () => { it.on = cb.checked; sync(); });
            const t = h('input', { type: 'text', maxlength: '100', 'aria-label': 'Ingredient' }); t.value = it.text;
            t.addEventListener('input', () => { it.text = t.value; });
            return h('div', { class: 'ing-pick' }, cb, t, ui.iconButton('x', 'Remove ' + it.text, () => { r.items.splice(i, 1); paintRows(); sync(); }));
          }));
        }
        paintRows();
        const steps = h('textarea', { rows: '8', 'aria-label': 'Steps' });
        steps.value = r.steps;
        steps.addEventListener('input', () => { r.steps = steps.value; });
        const recipeData = () => ({ title: r.title.trim() || find.name, emoji: r.emoji, servings: r.servings, ingredients: r.items.map((x) => x.text.trim()).filter(Boolean), steps: r.steps });
        async function saveIt() {
          const id = await PL.store.add('recipes', recipeData());
          if (id) { find = { name: '', servings: find.servings, busy: false, err: '', result: null }; render(); }
          return id;
        }
        const both = ui.button('Save and add to groceries', { variant: 'primary', big: true, icon: 'cart', onClick: async () => {
          const data = recipeData();
          const chosen = r.items.filter((x) => x.on && x.text.trim()).map((x) => x.text.trim());
          if (!(await saveIt())) return;
          ui.toast('Recipe saved.');
          if (chosen.length) openGroceryCheck([{ label: (data.emoji || '🍽️') + ' · ' + data.title, items: chosen }]);
        } });
        const sync = () => { both.disabled = !r.items.some((x) => x.on && x.text.trim()); };
        sync();
        return h('section', { class: 'card found' },
          h('div', { class: 'found-head' }, h('span', { class: 'found-emoji' }, r.emoji || '🍽️'),
            h('div', { class: 'found-mid' }, h('span', { class: 'found-badge' }, 'Found for you ✨'), title, h('span', { class: 'sub' }, 'For ' + r.servings + ' people · tap anything to change it'))),
          h('div', { class: 'found-cols' },
            h('div', {}, h('h3', { class: 'mini-h' }, 'Ingredients'), rows,
              ui.button('Add an ingredient', { icon: 'plus', onClick: () => { r.items.push({ text: '', on: true }); paintRows(); sync(); const ins = rows.querySelectorAll('input[type=text]'); ins[ins.length - 1].focus(); } })),
            h('div', {}, h('h3', { class: 'mini-h' }, 'Steps'), steps)),
          h('div', { class: 'found-foot' },
            ui.button('Try again', { variant: 'ghost', onClick: () => { find.result = null; render(); const i = el.querySelector('#find-dish'); i && i.focus(); } }),
            ui.button('Save recipe', { icon: 'book', onClick: async () => { if (await saveIt()) ui.toast('Recipe saved.'); } }),
            both));
      }

      function recipesPanel() {
        const rs = PL.state.recipes.slice().sort((a, b) => a.title.localeCompare(b.title));
        return [
          findBox(),
          find.result ? foundCard() : null,
          h('div', { class: 'recipes-head' }, h('h2', {}, 'Your recipes'), ui.button('Write my own', { icon: 'plus', onClick: () => openRecipeForm(null) })),
          rs.length
            ? h('div', { class: 'recipe-grid' }, rs.map((r) => h('div', { class: 'recipe-card' },
                h('button', { type: 'button', class: 'recipe-open', onclick: () => openRecipe(r) },
                  h('span', { class: 'recipe-emoji' }, r.emoji || '🍽️'), h('strong', {}, r.title), h('span', { class: 'sub' }, r.ingredients.length + (r.ingredients.length === 1 ? ' ingredient' : ' ingredients'))),
                r.ingredients.length ? ui.button('Add to groceries', { icon: 'cart', onClick: () => shopRecipe(r) }) : null)))
            : ui.emptyState({ icon: 'book', title: 'No recipes yet', text: 'Find a dish above, or write your own. Every recipe can go to the grocery list in one tap.' })
        ].filter(Boolean);
      }

      function render() {
        const tabs = ui.segmented([{ value: 'plan', label: 'Plan' }, { value: 'recipes', label: 'Recipes' }], tab, (v) => { tab = v; PL.storage.set('mealTab', v); render(); }, 'Meals');
        tabs.el.classList.add('task-tabs');
        el.replaceChildren(h('header', { class: 'page-head' }, h('h1', {}, 'Meals')), tabs.el, ...(tab === 'recipes' ? recipesPanel() : planPanel()));
      }
      render();
      return { update: () => { const a = document.activeElement; if (tab === 'recipes' && (find.busy || find.result || (a && el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)))) return; render(); }, destroy() {} };
    }
  };
})();
