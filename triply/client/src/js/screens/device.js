/*
 * device.js — settings for this device: default name/picture, and the saved trip links
 * (copy them to another device or to a new web address, or paste links in).
 */
(function () {
  const TR = window.TR;
  const h = TR.h, ui = TR.ui, icon = TR.icon;

  function mount(root) {
    function render() {
      const me = TR.profile.get();
      const name = TR.forms.input('text', me.name, { maxlength: 40, placeholder: 'Your name' });
      const av = ui.avatarPicker(me.avatar);
      const saved = TR.saved.all();
      const all = saved.map((s) => TR.personalLink(s.token)).join('\n');
      const paste = h('textarea', { rows: 4, placeholder: 'Paste personal links here, one per line' });
      root.replaceChildren(
        h('div', { class: 'page-head' }, h('h1', {}, 'Settings')),
        h('div', { class: 'settings-grid' },
          h('section', { class: 'card settings-card' }, h('h2', {}, 'About you'),
            h('p', { class: 'sub' }, 'Used to fill in the form when you start or join a trip on this device.'),
            ui.field('Name', name), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Picture'), av.el),
            ui.button('Save', { variant: 'primary', onClick: () => { TR.profile.set({ name: name.value, avatar: av.get() }); ui.toast('Saved.'); } })),
          h('section', { class: 'card settings-card' }, h('h2', {}, 'Trips on this device'),
            h('p', { class: 'sub' }, saved.length ? TR.plural(saved.length, 'trip') + ' saved. Your links are the only key — copy them somewhere safe to open your trips on another device.' : 'No trips saved yet.'),
            saved.length ? [h('textarea', { rows: Math.min(6, saved.length + 1), readonly: true, 'aria-label': 'Your personal links', onfocus: (e) => e.target.select() }, all),
              ui.button('Copy all links', { icon: 'copy', onClick: async () => ui.toast((await TR.copy(all)) ? 'Copied.' : 'Select the text and copy it.') })] : null,
            h('h3', { class: 'mini-h' }, 'Add trips from links'), paste,
            ui.button('Add these trips', { icon: 'plus', onClick: async (e) => {
              const tokens = [...paste.value.matchAll(/#\/t\/([A-Za-z0-9_-]{20,})/g)].map((m) => m[1]);
              if (!tokens.length) return ui.toast('No personal links found in that text.');
              let added = 0;
              for (const token of tokens) { try { const r = await TR.api.call('GET', '/me', { token }); TR.saved.add(r.trip.id, token); added++; } catch (err) { /* skip bad links */ } }
              ui.toast(added ? 'Added ' + TR.plural(added, 'trip') + '.' : 'None of those links work.'); render();
            } })),
          h('section', { class: 'card settings-card' }, h('h2', {}, 'About Triply'),
            h('p', { class: 'sub' }, 'Triply by Kalendaryo. Plan trips together: one shared itinerary, bookings and chat. There are no accounts or passwords; each person has a private link.'),
            saved.length ? ui.button('Forget all trips on this device', { variant: 'danger', onClick: async () => {
              if (await ui.confirm({ title: 'Forget all trips here?', message: 'The trips are not deleted. You can open them again with your links.', confirmLabel: 'Forget', danger: true })) { saved.forEach((s) => TR.saved.remove(s.tripId)); render(); }
            } }) : null)));
    }
    render();
    return {};
  }

  TR.screens = TR.screens || {};
  TR.screens.device = { mount };
})();
