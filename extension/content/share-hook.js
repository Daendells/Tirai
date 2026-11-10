// Runs in the page's own world. Tells the relay when this page starts and stops sharing the screen. It never changes
// what getDisplayMedia, stop() or clone() do or return for the page, and nothing in here is allowed to throw into the
// page. Everything it needs from the page's globals is saved first, so a page that replaces them cannot break it.
(() => {
  const KEY = Symbol.for('tirai.share');
  const MD = globalThis.MediaDevices && MediaDevices.prototype;
  const MST = globalThis.MediaStreamTrack && MediaStreamTrack.prototype;
  if (!MD || !MST || MD[KEY] || typeof MD.getDisplayMedia !== 'function' || typeof MST.stop !== 'function') return;
  Object.defineProperty(MD, KEY, { value: true });

  const POLL_MS = 2000;
  const { setInterval: startTimer, clearInterval: stopTimer, postMessage: sendMessage } = window;
  const resolve = Promise.resolve.bind(Promise);
  const then = Promise.prototype.then;
  const shares = new Set();
  let seq = 0;
  let timer = 0;

  const post = (active, id) => { try { sendMessage.call(window, { __tirai: 'share', active, id }, '*'); } catch { /* ignore */ } };

  function finish(share) {
    if (!shares.delete(share)) return;
    post(false, share.id);
    if (!shares.size) { stopTimer(timer); timer = 0; }
  }
  function check() {
    for (const share of [...shares]) if (share.tracks.every((t) => t.readyState === 'ended')) finish(share);
  }
  const safeCheck = () => { try { check(); } catch { /* ignore */ } };

  // Every two seconds: notice endings nobody told us about, and say again that each live share is still going,
  // so a background that lost track of it hears about it again.
  function tick() {
    safeCheck();
    for (const share of shares) post(true, share.id);
  }

  function watch(share, track) {
    share.tracks.push(track);
    track.addEventListener('ended', safeCheck);
  }

  function begin(stream) {
    const tracks = stream && typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : [];
    if (!tracks.length) return;
    const share = { id: ++seq + '-' + Math.random().toString(36).slice(2, 10), tracks: [] };
    shares.add(share);
    tracks.forEach((t) => watch(share, t));
    if (!timer) timer = startTimer(tick, POLL_MS);
    post(true, share.id);
  }

  const getDisplayMedia = MD.getDisplayMedia;
  MD.getDisplayMedia = function () {
    const result = getDisplayMedia.apply(this, arguments);
    try { then.call(resolve(result), (stream) => { try { begin(stream); } catch { /* ignore */ } }, () => {}); } catch { /* ignore */ }
    return result;
  };

  const stop = MST.stop;
  MST.stop = function () {
    try { return stop.apply(this, arguments); } finally { safeCheck(); }
  };

  // A clone of a shared track keeps the capture alive, so the share lasts until the clone ends too.
  const clone = MST.clone;
  if (typeof clone === 'function') {
    MST.clone = function () {
      const copy = clone.apply(this, arguments);
      try { for (const share of shares) if (share.tracks.includes(this)) watch(share, copy); } catch { /* ignore */ }
      return copy;
    };
  }

  window.addEventListener('pagehide', () => { for (const share of [...shares]) finish(share); });
})();
