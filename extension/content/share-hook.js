// Runs in the page's own world. Tells the relay when this page starts and stops sharing the screen. It never changes
// what getDisplayMedia or stop() do or return for the page, and nothing in here is allowed to throw into the page.
(() => {
  const KEY = Symbol.for('tirai.share');
  const MD = globalThis.MediaDevices && MediaDevices.prototype;
  const MST = globalThis.MediaStreamTrack && MediaStreamTrack.prototype;
  if (!MD || !MST || MD[KEY] || typeof MD.getDisplayMedia !== 'function' || typeof MST.stop !== 'function') return;
  Object.defineProperty(MD, KEY, { value: true });

  const POLL_MS = 2000;
  const shares = new Set();
  let seq = 0;
  let timer = 0;

  const post = (active, id) => { try { window.postMessage({ __tirai: 'share', active, id }, '*'); } catch { /* ignore */ } };

  function finish(share) {
    if (!shares.delete(share)) return;
    post(false, share.id);
    if (!shares.size) { clearInterval(timer); timer = 0; }
  }
  function check() {
    for (const share of [...shares]) if (share.tracks.every((t) => t.readyState === 'ended')) finish(share);
  }
  const safeCheck = () => { try { check(); } catch { /* ignore */ } };

  function begin(stream) {
    const tracks = stream && typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : [];
    if (!tracks.length) return;
    const share = { id: ++seq + '-' + Math.random().toString(36).slice(2, 10), tracks };
    shares.add(share);
    tracks.forEach((t) => t.addEventListener('ended', safeCheck));
    if (!timer) timer = setInterval(safeCheck, POLL_MS);
    post(true, share.id);
  }

  const getDisplayMedia = MD.getDisplayMedia;
  MD.getDisplayMedia = function () {
    const result = getDisplayMedia.apply(this, arguments);
    try { Promise.resolve(result).then((stream) => { try { begin(stream); } catch { /* ignore */ } }, () => {}); } catch { /* ignore */ }
    return result;
  };

  const stop = MST.stop;
  MST.stop = function () {
    try { return stop.apply(this, arguments); } finally { safeCheck(); }
  };

  window.addEventListener('pagehide', () => { for (const share of [...shares]) finish(share); });
})();
