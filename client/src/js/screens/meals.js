/*
 * screens/meals.js — the Meals screen: a week plan and a recipe box.
 *   meals/{date~slot}  { date, slot, title, recipeId }     one meal per slot per day
 *   recipes/{id}       { title, emoji, servings, ingredients[], steps }
 * Ingredients can be sent to any shared list, one tap.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;
  const SLOTS = [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }];
  const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
  const EMOJI = ['🍝', '🍚', '🥞', '🍕', '🌮', '🍲', '🥗', '🍗', '🐟', '🥪', '🍜', '🍔', '🥘', '🧁', '🍳', '🥦'];

  const mealId = (date, slot) => date + '~' + slot;
  const mealAt = (date, slot) => PL.state.meals.find((m) => m.id === mealId(date, slot)) || null;
  const recipeOf = (id) => (id ? PL.state.recipes.find((r) => r.id === id) || null : null);

  // Rows for the Home widget: every planned meal on these dates.
  function dayRows(dates) {
    const out = [];
    dates.forEach((date) => SLOTS.forEach((s) => {
      const m = mealAt(date, s.id);
      if (m) out.push({ date, title: m.title, slotLabel: SLOT_LABEL[s.id] });
    }));
    return out;
  }

  /* ---------- sending ingredients to a shared list ---------- */
  async function sendToList(ingredients, what) {
    const wanted = [];
    const seen = new Set();
    ingredients.forEach((i) => { const k = i.trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); wanted.push(i.trim()); } });
    if (!wanted.length) { ui.toast('There is nothing to add.'); return false; }
    const lists = PL.state.lists.slice().sort((a, b) => a.title.localeCompare(b.title));
    let listId;
    if (!lists.length) listId = await PL.store.add('lists', { title: 'Groceries' });
    else {
      const grocery = lists.find((l) => /grocer|shopping/i.test(l.title));
      const options = lists.map((l) => ({ value: l.id, label: l.title, description: grocery && grocery.id === l.id ? 'Suggested' : '' }));
      options.push({ value: '__new', label: 'A new list called Groceries' });
      const pick = await ui.choose({ title: 'Add to which list?', message: what + ': ' + wanted.length + (wanted.length === 1 ? ' item' : ' items') + '.', options });
      if (!pick) return false;
      listId = pick === '__new' ? await PL.store.add('lists', { title: 'Groceries' }) : pick;
    }
    if (!listId) return false;
    const have = new Set(PL.state.listitems.filter((i) => i.listId === listId && !i.done).map((i) => i.text.trim().toLowerCase()));
    let n = 0, skipped = 0, at = Date.now();
    for (const text of wanted) {
      if (have.has(text.toLowerCase())) { skipped++; continue; }
      if (!(await PL.store.add('listitems', { listId, text, done: false, at: at++ }))) return false;
      n++;
    }
    const list = PL.state.lists.find((l) => l.id === listId);
    ui.toast(n + (n === 1 ? ' item' : ' items') + ' added' + (list ? ' to ' + list.title : '') + (skipped ? '. ' + skipped + ' already there.' : '.'));
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
        r.ingredients.length ? ui.button('Add to a list', { variant: 'primary', big: true, icon: 'cart', onClick: async () => { if (await sendToList(r.ingredients, r.title)) s.close(); } }) : null,
        ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() })]
    });
  }

  function openRecipeForm(r, onSaved) {
    let emoji = r ? r.emoji : EMOJI[0];
    const title = h('input', { type: 'text', maxlength: '80', placeholder: 'For example: Chicken adobo', autocomplete: 'off', autofocus: true });
    title.value = r ? r.title : '';
    const servings = h('input', { type: 'number', min: '1', max: '99', class: 'num', 'aria-label': 'Servings' });
    servings.value = r ? r.servings : 4;
    const ing = h('textarea', { rows: '6', placeholder: 'One ingredient on each line' });
    ing.value = r ? r.ingredients.join('\n') : '';
    const steps = h('textarea', { rows: '6', placeholder: 'One step on each line' });
    steps.value = r ? r.steps : '';
    const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Picture' });
    const paint = () => grid.replaceChildren(...EMOJI.map((e) => h('button', { type: 'button', role: 'radio', class: 'avatar-opt' + (e === emoji ? ' on' : ''), 'aria-checked': e === emoji ? 'true' : 'false', 'aria-label': e, onclick: () => { emoji = e; paint(); } }, e)));
    paint();
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
    const saveBtn = ui.button(r ? 'Save changes' : 'Add recipe', { variant: 'primary', big: true, onClick: save });
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), saveBtn];
    if (r) footer.unshift(ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: del }));
    const s = ui.sheet({
      title: r ? 'Edit recipe' : 'New recipe', wide: true, footer,
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('Name', title), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Picture'), grid),
        ui.field('Servings', servings), ui.field('Ingredients', ing), ui.field('Steps', steps))
    });
  }

  /* ---------- one meal slot ---------- */
  function openSlot(date, slot) {
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
      if (await PL.store.set('meals', mealId(date, slot), { date, slot, title: t, recipeId })) { s.close(); ui.toast('Saved.'); }
    }
    const footer = [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), ui.button('Save', { variant: 'primary', big: true, onClick: save })];
    if (m) footer.unshift(ui.button('Clear', { variant: 'danger', icon: 'trash', onClick: async () => { if (await PL.store.del('meals', m.id)) { s.close(); ui.toast('Cleared.'); } } }));
    const rec = recipeOf(m && m.recipeId);
    if (rec) footer.splice(footer.length - 1, 0, ui.button('View recipe', { icon: 'book', onClick: () => { s.close(); openRecipe(rec); } }));
    const s = ui.sheet({
      title: SLOT_LABEL[slot] + ' · ' + D.fmt(date, { weekday: 'long', month: 'short', day: 'numeric' }), footer,
      body: h('form', { class: 'event-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        ui.field('What is for ' + SLOT_LABEL[slot].toLowerCase() + '?', title),
        PL.state.recipes.length ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Or pick a recipe'), chips) : h('p', { class: 'hint' }, 'Add recipes in the Recipes tab to pick them here.'))
    });
  }

  /* ---------- AI dinner ideas (asks Claude through the page's "sample" ability) ---------- */
  async function openSuggest(weekStart) {
    const dates = Array.from({ length: 7 }, (_, i) => D.addDays(weekStart, i)).filter((d) => d >= D.today() && !mealAt(d, 'dinner'));
    if (!dates.length) { ui.toast('Every dinner from today on is already planned this week.'); return; }
    const sample = window.claude && (await window.claude.use('sample'));
    if (!sample) { ui.toast('Dinner ideas are not available on this page.'); return; }
    const notes = h('textarea', { rows: '3', placeholder: 'Optional. For example: no pork, quick meals on school nights, one vegetarian night.' });
    const out = h('div', { class: 'stack' });
    let picks = [];
    async function ask() {
      go.disabled = true;
      out.replaceChildren(h('p', { class: 'sub', role: 'status' }, 'Thinking of dinners… this can take a little while.'));
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
        out.replaceChildren(h('p', { class: 'ai-note' }, 'Untick any you do not want. Nothing is saved until you press Add to plan.'),
          ...picks.map((p) => { const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': p.title }); cb.addEventListener('change', () => { p.on = cb.checked; });
            return h('label', { class: 'ai-pick' }, cb, h('span', { class: 'meal-slot' }, D.fmt(p.date, { weekday: 'short' })), h('span', { class: 'meal-title' }, p.title)); }));
        addBtn.hidden = false;
      } catch (e) {
        const code = e && e.code;
        out.replaceChildren(h('p', { class: 'form-error' }, (e && e.userMessage) || (code === 'not_granted' ? 'Claude was not allowed to help. You can try again and allow it.' : code === 'rate_limited' ? 'Too many tries. Please wait a moment.' : 'Could not get ideas right now. Please try again.')));
      }
      go.disabled = false;
    }
    async function addAll() {
      let n = 0;
      for (const p of picks.filter((x) => x.on)) { if (mealAt(p.date, 'dinner')) continue; if (await PL.store.set('meals', mealId(p.date, 'dinner'), { date: p.date, slot: 'dinner', title: p.title, recipeId: p.recipeId })) n++; }
      s.close(); ui.toast(n + (n === 1 ? ' dinner added.' : ' dinners added.'));
    }
    const go = ui.button('Suggest dinners', { icon: 'sparkle', onClick: ask });
    const addBtn = ui.button('Add to plan', { variant: 'primary', big: true, onClick: addAll });
    addBtn.hidden = true;
    const s = ui.sheet({ title: 'Dinner ideas', wide: true, footer: [ui.button('Close', { variant: 'ghost', big: true, onClick: () => s.close() }), addBtn],
      body: h('div', { class: 'event-form' }, h('p', { class: 'sub' }, 'Claude suggests dinners for the days that are still empty. It uses your own Claude account and sees only your recipe names and the notes you type.'), ui.field('Anything to keep in mind?', notes), go, out) });
  }

  /* ---------- screen ---------- */
  /* ---------- Shop: type a meal, get the ingredients, send them to a list ---------- */
  async function askIngredients(name, servings) {
    const found = PL.state.recipes.find((r) => r.title.trim().toLowerCase() === name.trim().toLowerCase());
    if (found && found.ingredients.length) return { title: found.title, ingredients: found.ingredients.slice(), steps: found.steps, fromRecipe: found };
    const sample = window.claude && (await window.claude.use('sample'));
    if (!sample) throw { code: 'unavailable' };
    const res = await sample.json('A family wants to cook "' + name.trim().slice(0, 80) + '" for ' + servings + ' people. List what to buy to make it. ' +
      'Give each ingredient with a simple amount, like "500 g ground beef" or "2 onions". Leave out water. Include the usual staples (oil, salt, spices) only if they matter to the dish. ' +
      'Also give 4 to 8 short cooking steps. Reply with ONLY JSON like {"title":"Nice name of the dish","ingredients":["..."],"steps":["..."]}.', { modelTier: 'quick', cache: false });
    const ing = (res && Array.isArray(res.ingredients) ? res.ingredients : []).map((x) => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 40);
    if (!ing.length) throw { code: 'empty' };
    const steps = (Array.isArray(res.steps) ? res.steps : []).map((x) => String(x).trim()).filter(Boolean).join('\n').slice(0, 3000);
    return { title: String(res.title || name).trim().slice(0, 80) || name, ingredients: ing, steps, fromRecipe: null };
  }

  PL.mealsUi = { askIngredients, dayRows, openRecipe, openRecipeForm, sendToList };

  PL.screens.meals = {
    mount(root, params) {
      let tab = (params && params.tab) || PL.storage.get('mealTab', 'plan');
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
        const opts = h('div', { class: 'meal-opts' },
          ui.toggle('Show breakfast and lunch', showAll, (v) => { showAll = v; PL.storage.set('mealAll', v); render(); }).el,
          ui.button('Suggest dinners', { icon: 'sparkle', onClick: () => openSuggest(cursor) }),
          ui.button('Add week to a list', { icon: 'cart', onClick: async () => {
            const ids = new Set();
            for (let i = 0; i < 7; i++) SLOTS.forEach((s) => { const m = mealAt(D.addDays(cursor, i), s.id); if (m && m.recipeId) ids.add(m.recipeId); });
            const ings = [...ids].map(recipeOf).filter(Boolean).flatMap((r) => r.ingredients);
            if (!ings.length) { ui.toast('No recipes are planned this week. Pick a recipe for a meal first.'); return; }
            await sendToList(ings, 'Ingredients for the week');
          } }));
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = D.addDays(cursor, i);
          return h('section', { class: 'chore-group meal-day' + (date === today ? ' today' : ''), 'aria-label': D.fmt(date, { weekday: 'long', month: 'long', day: 'numeric' }) },
            h('div', { class: 'cg-head' }, h('h3', { class: 'cg-name' }, D.fmt(date, { weekday: 'long' })), h('span', { class: 'cg-count' }, D.fmt(date, { month: 'short', day: 'numeric' }))),
            slots.map((s) => {
              const m = mealAt(date, s.id);
              const r = m && recipeOf(m.recipeId);
              return h('button', { type: 'button', class: 'meal-row', onclick: () => openSlot(date, s.id), 'aria-label': SLOT_LABEL[s.id] + ', ' + (m ? m.title : 'nothing planned. Tap to add') },
                h('span', { class: 'meal-slot' }, SLOT_LABEL[s.id]),
                h('span', { class: 'meal-title' + (m ? '' : ' empty') }, m ? m.title : 'Add'),
                r ? icon('book') : (m ? null : icon('plus')));
            }));
        });
        return [bar, opts, h('div', { class: 'meal-week' }, days)];
      }

      function recipesPanel() {
        const rs = PL.state.recipes.slice().sort((a, b) => a.title.localeCompare(b.title));
        return [
          h('div', { class: 'chores-bar' }, ui.button('New recipe', { variant: 'primary', big: true, icon: 'plus', onClick: () => openRecipeForm(null) })),
          rs.length
            ? h('div', { class: 'family-grid' }, rs.map((r) => h('button', { type: 'button', class: 'list-card recipe-card', onclick: () => openRecipe(r) },
                h('span', { class: 'recipe-emoji' }, r.emoji || '🍽️'), h('strong', {}, r.title), h('span', { class: 'sub' }, r.ingredients.length + (r.ingredients.length === 1 ? ' ingredient' : ' ingredients')))))
            : ui.emptyState({ icon: 'book', title: 'No recipes yet', text: 'Keep the family favorites here. You can send a recipe’s ingredients to a shopping list.', action: ui.button('Add the first recipe', { icon: 'plus', onClick: () => openRecipeForm(null) }) })
        ];
      }

      let shop = { name: '', servings: 4, result: null, busy: false, err: '', saveRecipe: true, planDate: '' };
      function shopPanel() {
        const name = h('input', { type: 'text', maxlength: '80', placeholder: 'For example: Chicken adobo', autocomplete: 'off', 'aria-label': 'Meal name' });
        name.value = shop.name;
        name.addEventListener('input', () => { shop.name = name.value; });
        const sv = h('input', { type: 'number', min: '1', max: '30', class: 'num', 'aria-label': 'How many people' });
        sv.value = shop.servings;
        sv.addEventListener('input', () => { shop.servings = Math.min(30, Math.max(1, parseInt(sv.value, 10) || 4)); });
        async function find(e) {
          e && e.preventDefault();
          const n = name.value.trim();
          if (!n) { ui.toast('Please type a meal first.'); name.focus(); return; }
          shop.name = n; shop.busy = true; shop.err = ''; shop.result = null; render();
          try {
            const r = await askIngredients(n, shop.servings);
            shop.result = { title: r.title, steps: r.steps, fromRecipe: r.fromRecipe, items: r.ingredients.map((t) => ({ text: t, on: true })) };
          } catch (err) {
            const c = err && err.code;
            shop.err = (err && err.userMessage) || (c === 'not_granted' ? 'Claude was not allowed to help. You can try again and allow it.' : c === 'rate_limited' ? 'Too many tries. Please wait a moment.' : c === 'unavailable' ? 'Ingredient ideas are not available on this page. You can still add the meal as a recipe.' : 'Could not get the ingredients. Please try again, or write the recipe yourself.');
          }
          shop.busy = false; render();
        }
        const parts = [h('form', { class: 'shop-box', onsubmit: find },
          h('p', { class: 'sub' }, 'Type something you feel like eating. You get the shopping list for it, ready to add to your groceries.'),
          h('div', { class: 'shop-row' }, ui.field('What do you want to eat?', name), ui.field('People', sv)),
          ui.button(shop.busy ? 'Looking…' : 'Find ingredients', { variant: 'primary', big: true, icon: 'sparkle', type: 'submit', disabled: shop.busy }))];
        if (shop.busy) parts.push(h('p', { class: 'sub', role: 'status' }, 'Thinking of what you need… this can take a little while.'));
        if (shop.err) parts.push(h('p', { class: 'form-error', role: 'alert' }, shop.err));
        const r = shop.result;
        if (r) {
          const rows = r.items.map((it) => {
            const cb = h('input', { type: 'checkbox', 'aria-label': 'Buy ' + it.text }); cb.checked = it.on; cb.addEventListener('change', () => { it.on = cb.checked; sync(); });
            const t = h('input', { type: 'text', maxlength: '100', 'aria-label': 'Ingredient' }); t.value = it.text; t.addEventListener('input', () => { it.text = t.value; });
            return h('div', { class: 'ing-pick' }, cb, t);
          });
          const days = Array.from({ length: 7 }, (_, i) => D.addDays(D.today(), i));
          const planSel = ui.select([{ value: '', label: 'Not on the plan' }].concat(days.map((d) => ({ value: d, label: 'Dinner on ' + D.fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }) }))), shop.planDate, (v) => { shop.planDate = v; });
          const saveTog = r.fromRecipe ? null : ui.toggle('Also save it as a recipe', shop.saveRecipe, (v) => { shop.saveRecipe = v; });
          const addBtn = ui.button('Add', { variant: 'primary', big: true, icon: 'cart', onClick: async () => {
            const chosen = r.items.filter((x) => x.on && x.text.trim()).map((x) => x.text.trim());
            if (!chosen.length) { ui.toast('Tick at least one ingredient.'); return; }
            const ok = await sendToList(chosen, r.title);
            if (!ok) return;
            let recipeId = r.fromRecipe ? r.fromRecipe.id : '';
            if (!r.fromRecipe && shop.saveRecipe) recipeId = (await PL.store.add('recipes', { title: r.title, emoji: '🍽️', servings: shop.servings, ingredients: r.items.filter((x) => x.text.trim()).map((x) => x.text.trim()), steps: r.steps })) || '';
            if (shop.planDate) await PL.store.set('meals', mealId(shop.planDate, 'dinner'), { date: shop.planDate, slot: 'dinner', title: r.title, recipeId });
            shop = { name: '', servings: shop.servings, result: null, busy: false, err: '', saveRecipe: true, planDate: '' };
            render();
          } });
          const sync = () => { const n = r.items.filter((x) => x.on).length; addBtn.querySelector('span').textContent = 'Add ' + n + (n === 1 ? ' item' : ' items') + ' to a list'; addBtn.disabled = !n; };
          sync();
          parts.push(h('section', { class: 'card shop-box' },
            h('h2', {}, r.title), h('p', { class: 'sub' }, (r.fromRecipe ? 'From your recipe box. ' : 'Amounts are a guess. ') + 'Untick what you already have, or fix a line.'),
            h('div', { class: 'stack' }, rows), saveTog ? saveTog.el : null, ui.field('Put it on the plan?', planSel), addBtn));
        }
        return parts;
      }

      function render() {
        const tabs = ui.segmented([{ value: 'plan', label: 'Plan' }, { value: 'recipes', label: 'Recipes' }, { value: 'shop', label: 'Shop' }], tab, (v) => { tab = v; PL.storage.set('mealTab', v); render(); }, 'Meals');
        tabs.el.classList.add('task-tabs');
        el.replaceChildren(h('header', { class: 'page-head' }, h('h1', {}, 'Meals')), tabs.el, ...(tab === 'recipes' ? recipesPanel() : tab === 'shop' ? shopPanel() : planPanel()));
      }
      render();
      return { update: () => { const a = document.activeElement; if (tab === 'shop' && a && el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return; render(); }, destroy() {} };
    }
  };
})();
