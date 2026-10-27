/*
 * screens/photos.js — the Photos tab: a family gallery, a full-screen viewer, slideshow and wall mode.
 * Photos are stored with PL.photos (see photos.js). Newest photos come first here.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  PL.screens = PL.screens || {};
  const h = PL.h, icon = PL.icon, ui = PL.ui;

  function widget() {
    const ps = PL.photos.list().slice(-4).reverse();
    if (!ps.length) return ui.emptyState({ icon: 'image', title: 'No photos yet', text: 'Add family photos to see them here and on the wall screen.', action: ui.button('Open Photos', { icon: 'image', onClick: () => PL.nav.go('photos') }) });
    return h('div', { class: 'photo-grid wide' }, ps.map((p, i) => h('button', { type: 'button', class: 'photo-thumb', 'aria-label': 'Open photo', onclick: () => PL.photos.openViewer(PL.photos.list().length - 1 - i) },
      h('img', { src: PL.photos.url(p, 600), alt: 'Family photo', loading: 'lazy' }))));
  }
  PL.photosUi = { widget };

  PL.screens.photos = {
    mount(root) {
      const el = h('div', { class: 'screen-page photos' });
      root.append(el);
      const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
      fileIn.addEventListener('change', async () => {
        const fs = [...fileIn.files]; fileIn.value = '';
        if (!fs.length) return;
        busy = true; render();
        await PL.photos.add(fs);
        busy = false; render();
      });
      let busy = false;
      function render() {
        const ps = PL.photos.list(); // oldest first
        const shown = ps.slice().reverse();
        el.replaceChildren(
          h('header', { class: 'page-head' }, h('h1', {}, 'Photos'), ui.button(busy ? 'Adding…' : 'Add photos', { variant: 'primary', big: true, icon: 'plus', onClick: () => fileIn.click() })),
          h('div', { class: 'btn-row photo-actions' },
            ui.button('Slideshow', { icon: 'image', onClick: () => { if (!ps.length) ui.toast('Add some photos first.'); else PL.photos.openWall('photos'); } }),
            ui.button('Wall mode', { icon: 'expand', onClick: () => PL.photos.openWall('wall') })),
          shown.length
            ? h('div', { class: 'photo-grid big' }, shown.map((p, i) => h('button', { type: 'button', class: 'photo-thumb', 'aria-label': 'Open photo ' + (i + 1), onclick: () => PL.photos.openViewer(ps.length - 1 - i) },
                h('img', { src: PL.photos.url(p, 600), alt: 'Family photo', loading: 'lazy' }))))
            : ui.emptyState({ icon: 'image', title: 'No photos yet', text: 'Add the pictures your family loves. They play on the slideshow and on the wall screen. Pictures are shrunk before they are saved.', action: ui.button('Add the first photos', { icon: 'plus', onClick: () => fileIn.click() }) }),
          fileIn);
      }
      render();
      return { update: render, destroy() {} };
    }
  };
})();
