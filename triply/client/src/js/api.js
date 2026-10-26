/*
 * api.js — talks to the server. Every call can carry a person's token; errors become Error objects with
 * .status, .code and (for version conflicts) .item.
 */
(function () {
  const TR = window.TR;

  async function call(method, path, opts) {
    const o = opts || {};
    const headers = {};
    if (o.token) headers.Authorization = 'Bearer ' + o.token;
    let body;
    if (o.raw) { body = o.raw; Object.assign(headers, o.headers || {}); }
    else if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
    let res;
    try { res = await fetch(TR.config.api + path, { method, headers, body, signal: o.signal }); }
    catch (e) {
      if (e.name === 'AbortError') throw e;
      const err = new Error('Cannot reach Triply. Check your connection and try again.');
      err.offline = true; err.status = 0; err.code = 'offline';
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const e = (data && data.error) || {};
      const err = new Error(e.message || 'Something went wrong (' + res.status + ').');
      err.status = res.status; err.code = e.code || 'error'; err.item = e.item;
      throw err;
    }
    return data || {};
  }

  // Live updates. fetch() is used instead of EventSource because EventSource cannot send the token header.
  // Returns { close }. Reconnects on its own, and calls onOpen(again) each time the stream (re)starts.
  function stream(tripId, token, handlers) {
    let stopped = false, ctl = null, delay = 1000, timer = null;
    async function run() {
      ctl = new AbortController();
      try {
        const res = await fetch(TR.config.api + '/trips/' + tripId + '/stream', { headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' }, signal: ctl.signal });
        if (res.status === 401 || res.status === 404) { stopped = true; handlers.onDenied && handlers.onDenied(); return; }
        if (!res.ok || !res.body) throw new Error('stream ' + res.status);
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '', first = true;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /^event: (.*)$/m.exec(block), data = /^data: (.*)$/m.exec(block);
            if (!ev) continue;
            if (ev[1] === 'hello') { delay = 1000; handlers.onOpen && handlers.onOpen(!first); first = false; }
            else if (ev[1] === 'change' && data) { try { handlers.onChange(JSON.parse(data[1])); } catch (e) { /* ignore bad event */ } }
          }
        }
      } catch (e) { if (e.name === 'AbortError') return; }
      if (stopped) return;
      handlers.onLost && handlers.onLost();
      timer = setTimeout(run, delay);
      delay = Math.min(delay * 2, 15000);
    }
    run();
    return { close() { stopped = true; clearTimeout(timer); if (ctl) ctl.abort(); } };
  }

  // Shrink big photos before sending (phones take 4–8 MB pictures). Other files go as they are.
  async function prepareFile(file) {
    const type = (file.type || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type) || file.size < 400 * 1024) return { blob: file, mime: type || 'application/octet-stream', name: file.name };
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      if (blob && blob.size < file.size) return { blob, mime: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' };
    } catch (e) { /* use the original */ }
    return { blob: file, mime: type, name: file.name };
  }

  async function upload(tripId, token, file) {
    const p = await prepareFile(file);
    const r = await call('POST', '/trips/' + tripId + '/blobs', { token, raw: p.blob, headers: { 'Content-Type': p.mime, 'X-Filename': encodeURIComponent(p.name || 'file') } });
    return r.blob;
  }

  TR.api = { call, stream, upload };
})();
