(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['lamp'] = api;
})(function () {
  // Tracks where the reading lamp is. Entering a different tile closes the lamp and waits delayMs before it
  // opens there, so sweeping the mouse across the screen does not flash chats. Moves inside the tile are instant.
  function createLampTracker({ win = window, delayMs = 120, getTiles, onChange }) {
    const ac = new AbortController();
    const opts = { capture: true, passive: true, signal: ac.signal };
    let active = null, latest = null, tileKey = null, timer = null;

    const keyAt = (p) => {
      const t = getTiles().find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h);
      return t ? `${t.x},${t.y},${t.w},${t.h}` : null;
    };

    function release() {
      clearTimeout(timer);
      timer = latest = tileKey = null;
      if (active) { active = null; onChange(); }
    }

    function move(e) {
      const p = { x: e.clientX, y: e.clientY };
      const key = keyAt(p);
      if (key === null) return release();
      latest = p;
      if (key === tileKey) {
        if (active && (active.x !== p.x || active.y !== p.y)) { active = p; onChange(); }
        return;
      }
      tileKey = key;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; active = latest; onChange(); }, delayMs);
      if (active) { active = null; onChange(); }
    }

    win.addEventListener('pointermove', move, opts);
    win.document.addEventListener('mouseleave', release, opts);
    win.addEventListener('pointerout', (e) => { if (!e.relatedTarget) release(); }, opts);

    return {
      pointer: () => active,
      destroy() { ac.abort(); clearTimeout(timer); },
    };
  }

  return { createLampTracker };
});
