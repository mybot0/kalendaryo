/*
 * photos.js — family photos, the slideshow and wall mode.
 *   photos/{id}  { assetId, at }     the picture itself is stored with the page's file storage.
 * Wall mode is a full-screen, hands-off display: a big clock, today's plans and tonight's dinner,
 * over a slow photo show. Slideshow shows only the photos. Tap the screen to bring the buttons back.
 * Photos are not part of backups (only their list is), because the pictures live in file storage.
 */
(function () {
  const PL = (window.PL = window.PL || {});
  const h = PL.h, icon = PL.icon, D = PL.D, ui = PL.ui;
  const urlOf = (p) => (PL.blobUrl ? PL.blobUrl(p.assetId) : '/_blob/' + p.assetId);
  const sortedPhotos = () => PL.state.photos.slice().sort((a, b) => a.at - b.at);

  // Shrink a picture before saving, so the page stays quick and storage lasts.
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
      return blob || file;
    } catch (e) { return file; }
  }

  async function add(files) {
    const assets = window.claude && (await window.claude.use('assets'));
    if (!assets) { ui.toast('Adding photos needs edit access to this page.'); return 0; }
    let n = 0, at = Date.now();
    for (const f of files) {
      if (!/^image\//.test(f.type)) continue;
      try {
        const blob = await shrink(f);
        const a = await assets.upload(blob);
        if (await PL.store.add('photos', { assetId: a.id, at: at++ })) n++;
      } catch (e) { ui.toast('One photo could not be saved.'); }
    }
    if (n) ui.toast(n + (n === 1 ? ' photo added.' : ' photos added.'));
    return n;
  }

  async function remove(p) {
    if (!(await ui.confirm({ title: 'Remove this photo?', message: 'It will be removed for everyone.', confirmLabel: 'Remove', danger: true }))) return;
    if (await PL.store.del('photos', p.id)) {
      try { const assets = await window.claude.use('assets'); if (assets) await assets.delete(p.assetId); } catch (e) { /* the picture file may stay in storage; harmless */ }
    }
  }

  /* ---------- the picture viewer ---------- */
  function openViewer(start) {
    let i = Math.min(Math.max(0, start), Math.max(0, sortedPhotos().length - 1));
    const img = h('img', { class: 'viewer-img', alt: 'Family photo' });
    const count = h('span', { class: 'viewer-count' });
    const prev = ui.iconButton('left', 'Previous photo', () => go(-1)), next = ui.iconButton('right', 'Next photo', () => go(1));
    const del = ui.button('Remove', { variant: 'danger', icon: 'trash', onClick: async () => {
      const p = sortedPhotos()[i]; if (!p) return;
      const n = sortedPhotos().length;
      await remove(p);
      if (sortedPhotos().length < n) { if (!sortedPhotos().length) close(); else { i = Math.min(i, sortedPhotos().length - 1); paint(); } }
    } });
    const closeBtn = ui.button('Close', { icon: 'x', onClick: () => close() });
    const root = h('div', { class: 'viewer', role: 'dialog', 'aria-label': 'Photo viewer', tabindex: '-1' },
      h('div', { class: 'viewer-top' }, count, h('span', { class: 'spacer' }), del, closeBtn), h('div', { class: 'viewer-stage' }, prev, img, next));
    function go(d) { const n = sortedPhotos().length; if (!n) return; i = (i + d + n) % n; paint(); }
    function paint() {
      const ps = sortedPhotos();
      if (!ps.length) { close(); return; }
      i = Math.min(i, ps.length - 1);
      img.src = urlOf(ps[i]); count.textContent = (i + 1) + ' of ' + ps.length;
      prev.hidden = next.hidden = ps.length < 2;
    }
    function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); }
    let x0 = null;
    root.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    root.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 60) go(e.clientX < x0 ? 1 : -1); x0 = null; });
    function close() { document.removeEventListener('keydown', onKey); unsub(); root.remove(); }
    const unsub = PL.store.subscribe(() => { if (root.isConnected) paint(); });
    document.addEventListener('keydown', onKey);
    document.body.append(root);
    paint(); closeBtn.focus();
  }

  // Wall mode and the slideshow now live in wall.js.
  const openWall = (mode) => PL.wall.open(mode);

  PL.photos = { add, remove, openWall, openViewer, list: sortedPhotos, url: urlOf };
})();
