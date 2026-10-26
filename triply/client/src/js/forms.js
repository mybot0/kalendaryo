/*
 * forms.js — the sheets for making and changing things: a trip, a plan, a person's profile.
 * Shared by several screens, so they live here instead of in one screen.
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, D = TR.D, cfg = TR.config;

  const input = (type, value, extra) => h('input', Object.assign({ type, value: value == null ? '' : value }, extra || {}));

  function emojiPicker(value, onChange) {
    let current = value;
    const btns = cfg.coverEmojis.map((e) => h('button', { type: 'button', class: 'emoji-opt', 'aria-label': e, onclick: () => { current = e; paint(); onChange && onChange(e); } }, e));
    function paint() { btns.forEach((b) => { const on = b.textContent === current; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    paint();
    return { el: h('div', { class: 'cover-pick' }, btns), get: () => current };
  }
  function swatches(value, onChange) {
    let current = value;
    const btns = cfg.coverColors.map((c) => h('button', { type: 'button', class: 'swatch', style: '--c:' + c, 'aria-label': 'Color ' + c, onclick: () => { current = c; paint(); onChange && onChange(c); } }));
    function paint() { btns.forEach((b, i) => { const on = cfg.coverColors[i] === current; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    paint();
    return { el: h('div', { class: 'swatches' }, btns), get: () => current };
  }

  /* ---------- trip: create / edit ---------- */
  // opts: { session }  -> edit that trip;  none -> make a new one
  function tripSheet(opts) {
    const o = opts || {}, session = o.session, trip = session ? session.trip() : null;
    const name = input('text', trip ? trip.name : '', { maxlength: 80, placeholder: 'Spain & Mediterranean Cruise', autofocus: true });
    const dest = input('text', trip ? trip.destination : '', { maxlength: 120, placeholder: 'Spain' });
    const route = input('text', trip ? trip.route.join(' → ') : '', { placeholder: 'Vancouver → Madrid → Barcelona' });
    const start = input('date', trip ? trip.start_date : '');
    const end = input('date', trip ? trip.end_date : '');
    const desc = h('textarea', { rows: 3, maxlength: 600, placeholder: 'What is this trip about?' }); desc.value = trip ? trip.description || '' : '';
    let coverBlob = trip ? trip.cover_blob : null, newPhoto = null, removePhoto = false;
    const emoji = emojiPicker(trip ? trip.cover_emoji : '✈️');
    const color = swatches(trip ? trip.cover_color : cfg.coverColors[1]);
    const prev = h('div', { class: 'photo-prev' });
    function paintPrev() {
      const photo = newPhoto ? URL.createObjectURL(newPhoto) : !removePhoto && coverBlob ? TR.blobUrl(coverBlob) : '';
      prev.style.setProperty('--c', color.get()); prev.style.backgroundImage = photo ? 'url("' + photo + '")' : '';
      prev.textContent = photo ? '' : emoji.get();
    }
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { newPhoto = e.target.files[0] || null; removePhoto = false; paintPrev(); } });
    const origEmoji = emoji.el, origColor = color.el;
    [origEmoji, origColor].forEach((el) => el.addEventListener('click', () => { setTimeout(paintPrev, 0); }));
    const viewers = ui.toggle('Viewers can chat and share photos', trip ? trip.viewers_chat : true);
    const me = TR.profile.get();
    const ownName = input('text', me.name, { maxlength: 40, placeholder: 'Your name' });
    const ownAv = ui.avatarPicker(me.avatar);
    const err = h('p', { class: 'form-error', role: 'alert' });

    const body = h('form', { class: 'event-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      ui.field('Trip name', name),
      ui.field('Destination', dest),
      ui.field('Route', route, 'Optional. Separate stops with → or commas.'),
      h('div', { class: 'row2' }, ui.field('Starts', start), ui.field('Ends', end)),
      trip ? ui.field('About', desc) : null,
      h('div', { class: 'sect' }, h('h4', {}, 'Cover'), prev,
        h('div', { class: 'btn-row' },
          ui.button('Use a photo', { icon: 'image', onClick: () => fileIn.click() }),
          trip && (coverBlob || newPhoto) ? ui.button('Remove photo', { variant: 'ghost', onClick: () => { newPhoto = null; removePhoto = true; paintPrev(); } }) : null, fileIn),
        emoji.el, color.el),
      trip ? h('div', { class: 'sect' }, h('h4', {}, 'People'), viewers.el) : null,
      trip ? null : h('div', { class: 'sect' }, h('h4', {}, 'About you'), ui.field('Your name', ownName), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Your picture'), ownAv.el)),
      err, h('button', { type: 'submit', hidden: true }));

    const saveBtn = ui.button(trip ? 'Save' : 'Create trip', { variant: 'primary', big: true, onClick: () => save() });
    const sheet = ui.sheet({
      title: trip ? 'Trip details' : 'New trip', body,
      footer: [
        trip && session.can('trip.delete') ? ui.button('Delete trip', { variant: 'danger', icon: 'trash', onClick: () => removeTrip() }) : null,
        h('span', { class: 'spacer' }),
        ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => sheet.close() }), saveBtn]
    });
    paintPrev();

    async function removeTrip() {
      const ok = await ui.confirm({ title: 'Delete this trip?', message: 'The plans, chat and files are deleted for everyone. This cannot be undone.', confirmLabel: 'Delete trip', danger: true });
      if (!ok) return;
      try { await TR.api.call('DELETE', '/trips/' + trip.id, { token: session.token }); } catch (e) { return ui.toast(e.message); }
      TR.saved.remove(trip.id); sheet.close(); TR.go('/'); ui.toast('Trip deleted.');
    }
    async function save() {
      err.textContent = '';
      if (!name.value.trim()) { err.textContent = 'Please give the trip a name.'; name.focus(); return; }
      if (!trip && !ownName.value.trim()) { err.textContent = 'Please add your name.'; ownName.focus(); return; }
      const payload = { name: name.value, destination: dest.value, route: route.value, start_date: start.value || null, end_date: end.value || null, cover_emoji: emoji.get(), cover_color: color.get() };
      saveBtn.disabled = true;
      try {
        if (trip) {
          payload.description = desc.value; payload.viewers_chat = viewers.get();
          if (newPhoto) { const b = await TR.api.upload(trip.id, session.token, newPhoto); payload.cover_blob = b.id; }
          else if (removePhoto) payload.cover_blob = null;
          await session.req('PATCH', '', payload);
          await session.refresh();
          sheet.close(); ui.toast('Saved.');
        } else {
          payload.owner = { name: ownName.value, avatar: ownAv.get() };
          const r = await TR.api.call('POST', '/trips', { body: payload });
          TR.saved.add(r.trip.id, r.token);
          TR.profile.set({ name: ownName.value, avatar: ownAv.get() });
          if (newPhoto) { try { const b = await TR.api.upload(r.trip.id, r.token, newPhoto); await TR.api.call('PATCH', '/trips/' + r.trip.id, { token: r.token, body: { cover_blob: b.id } }); } catch (e) { /* the cover can be added later */ } }
          sheet.close();
          TR.go('/trip/' + r.trip.id + '/overview');
          linkSheet(r.token, 'Your trip is ready');
        }
      } catch (e) { err.textContent = e.message; saveBtn.disabled = false; }
    }
    return sheet;
  }

  // "This link is your key" — shown once after making or joining a trip.
  function linkSheet(token, title) {
    const link = TR.personalLink(token);
    const s = ui.sheet({
      title: title || 'Your personal link',
      body: h('div', { class: 'stack' },
        h('p', { class: 'sheet-text' }, 'Triply has no passwords. This link is how you get back in from another phone or computer, so save it somewhere safe (your notes, or e-mail it to yourself).'),
        ui.copyBox(link, 'Your personal link'),
        h('p', { class: 'warn-box' }, 'Keep it private: anyone with this link can act as you in this trip. To add other people, invite them from the People tab.')),
      footer: [ui.button('Got it', { variant: 'primary', big: true, onClick: () => s.close() })]
    });
    return s;
  }

  /* ---------- plan: choose a type, then fill it in ---------- */
  function typePicker(session, date) {
    const s = ui.sheet({
      title: 'What are you adding?',
      body: h('div', { class: 'type-grid' }, cfg.typeOrder.map((t) => {
        const T = cfg.types[t];
        return h('button', { type: 'button', class: 'type-opt', onclick: () => { s.close(); itemSheet({ session, type: t, date }); } },
          h('span', { class: 'tp-ic', style: '--c:' + T.color }, TR.icon(T.icon)), T.label);
      }))
    });
  }

  // opts: { session, type, item?, date? }
  function itemSheet(opts) {
    const session = opts.session, item = opts.item || null, src = item || opts.template || null, type = src ? src.type : opts.type;
    const T = cfg.types[type];
    const trip = session.trip();
    const today = D.today();
    const defDate = opts.date || (trip.start_date && trip.start_date > today ? trip.start_date : trip.end_date && trip.end_date < today ? trip.start_date : trip.start_date ? (today >= trip.start_date ? today : trip.start_date) : '');
    const title = input('text', src ? src.title : '', { maxlength: 120, placeholder: T.titlePlaceholder, autofocus: true });
    const dataIn = {};
    const dataFields = T.fields.map((f) => {
      const el = input(f[3] === 'number' ? 'number' : 'text', src && src.data[f[0]] !== undefined ? src.data[f[0]] : '', { placeholder: f[2] || '', inputmode: f[3] === 'number' ? 'decimal' : undefined, step: f[3] === 'number' ? 'any' : undefined });
      dataIn[f[0]] = el;
      return ui.field(f[1], el);
    });
    const sd = input('date', src ? src.start_date || '' : T.needsStart ? defDate : opts.date || '');
    const st = input('time', src ? src.start_time || '' : '');
    const ed = input('date', src ? src.end_date || '' : '');
    const et = input('time', src ? src.end_time || '' : '');
    const loc = input('text', src ? src.location : '', { maxlength: 200, placeholder: '' });
    const conf = input('text', src ? src.confirmation : '', { maxlength: 60, placeholder: 'Booking or confirmation number', autocapitalize: 'characters' });
    const notes = h('textarea', { rows: 3, maxlength: 4000, placeholder: 'Anything to remember' }); notes.value = src ? src.notes || '' : '';
    const err = h('p', { class: 'form-error', role: 'alert' });
    if (type === 'note') { title.placeholder = 'Note title (optional)'; }

    const body = h('form', { class: 'event-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'detail-title' }, h('span', { class: 'tp-ic', style: '--c:' + T.color }, TR.icon(T.icon)), h('h3', {}, (item ? 'Edit ' : 'New ') + T.label.toLowerCase())),
      ui.field(type === 'flight' || type === 'car' || type === 'cruise' ? 'Name (optional)' : 'Name', title),
      dataFields.length ? h('div', { class: 'sect' }, h('h4', {}, T.label + ' details'), h('div', { class: 'field-inline' }, dataFields)) : null,
      h('div', { class: 'sect' }, h('h4', {}, 'When' + (T.needsStart ? '' : ' (optional)')),
        h('div', { class: 'row2' }, ui.field(T.startLabel + ' – day', sd), ui.field('Time', st)),
        h('div', { class: 'row2' }, ui.field(T.endLabel + ' – day', ed), ui.field('Time', et))),
      h('div', { class: 'sect' }, h('h4', {}, 'More'),
        ui.field(T.locationLabel, loc), ui.field('Confirmation number', conf), ui.field('Notes', notes)),
      err, h('button', { type: 'submit', hidden: true }));

    const saveBtn = ui.button(item ? 'Save' : 'Add to trip', { variant: 'primary', big: true, onClick: () => save() });
    const sheet = ui.sheet({
      title: '', wide: true, body,
      footer: [item ? ui.button('Delete', { variant: 'danger', icon: 'trash', onClick: () => remove() }) : null, h('span', { class: 'spacer' }),
        ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => sheet.close() }), saveBtn]
    });

    function payload() {
      const data = {};
      Object.keys(dataIn).forEach((k) => { data[k] = dataIn[k].value; });
      return { title: title.value, data, start_date: sd.value || null, start_time: sd.value ? st.value || null : null, end_date: ed.value || null, end_time: ed.value || sd.value ? et.value || null : null, location: loc.value, confirmation: conf.value, notes: notes.value };
    }
    async function save() {
      err.textContent = '';
      saveBtn.disabled = true;
      const p = payload();
      try {
        if (item) { p.version = item.version; await session.req('PATCH', '/items/' + item.id, p); }
        else { p.type = type; await session.req('POST', '/items', p); }
        await session.refresh();
        sheet.close(); ui.toast(item ? 'Saved.' : 'Added to the trip.');
        opts.onDone && opts.onDone();
      } catch (e) {
        saveBtn.disabled = false;
        if (e.code === 'version_conflict' && e.item) return conflict(e.item, p);
        err.textContent = e.message;
      }
    }
    async function conflict(theirs, mine) {
      const pick = await ui.choose({ title: 'Someone changed this plan', message: 'Another person saved changes while you were editing.',
        options: [{ value: 'mine', label: 'Keep my changes', description: 'Replace their version with what you typed.' }, { value: 'theirs', label: 'Use their version', description: 'Throw away what you typed.' }] });
      try {
        if (pick === 'mine') { mine.version = theirs.version; await session.req('PATCH', '/items/' + item.id, mine); }
        await session.refresh(); sheet.close();
      } catch (e) { err.textContent = e.message; }
    }
    async function remove() {
      const ok = await ui.confirm({ title: 'Delete this ' + T.label.toLowerCase() + '?', message: '“' + item.title + '” will be removed for everyone.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      try { await session.req('DELETE', '/items/' + item.id); await session.refresh(); sheet.close(); ui.toast('Deleted.'); opts.onDone && opts.onDone(); } catch (e) { ui.toast(e.message); }
    }
    return sheet;
  }

  /* ---------- me: name + picture ---------- */
  function profileSheet(session) {
    const me = session.me();
    const name = input('text', me.name, { maxlength: 40, autofocus: true });
    const av = ui.avatarPicker(me.avatar);
    const err = h('p', { class: 'form-error', role: 'alert' });
    const save = ui.button('Save', { variant: 'primary', big: true, onClick: async () => {
      if (!name.value.trim()) { err.textContent = 'Please add your name.'; return; }
      try { await session.req('PATCH', '/members/me', { name: name.value, avatar: av.get() }); TR.profile.set({ name: name.value, avatar: av.get() }); await session.refresh(); s.close(); ui.toast('Saved.'); } catch (e) { err.textContent = e.message; }
    } });
    const s = ui.sheet({ title: 'Your name and picture', body: h('div', { class: 'event-form' }, ui.field('Name', name), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Picture'), av.el), err),
      footer: [ui.button('Cancel', { variant: 'ghost', big: true, onClick: () => s.close() }), save] });
  }

  TR.forms = { tripSheet, linkSheet, typePicker, itemSheet, profileSheet, input };
})();
