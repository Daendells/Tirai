(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['curtain'] = api;
})(function () {
  const COMPACT_MS = 4000;

  const BLUR_FALLBACK_PX = 14;

  // Page CSS can reach the host element but not the shadow tree. The shadow's own !important :host rule
  // beats the page's !important rules, so the curtain cannot be hidden, clipped or faded from outside.
  const CSS = `
:host { all: initial !important; display: block !important; position: fixed !important; inset: 0 !important;
  z-index: 2147483647 !important; pointer-events: none !important; }
.tile { position: absolute; background: rgba(127,127,127,0.12); border-radius: 0; }
.pill {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  max-width: calc(100vw - 32px); box-sizing: border-box; padding: 8px 14px; border-radius: 999px;
  font: 13px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #fff; background: rgba(28,27,25,0.86); white-space: nowrap; opacity: 0; z-index: 1;
}
.pill.on { opacity: 1; }
.pill.compact { width: 10px; height: 10px; padding: 0; overflow: hidden; }
.pill.compact .t { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (prefers-reduced-motion: no-preference) { .pill { transition: opacity 150ms; } }
@media (prefers-reduced-motion: reduce) { .pill { transition: none; } }
`;

  function createCurtain(doc = document) {
    const { lampBand, bandFromRect, lampMask } = globalThis.Tirai.geometry;
    const host = doc.createElement('tirai-curtain');
    for (const [k, v] of [['position', 'fixed'], ['inset', '0'], ['z-index', '2147483647'], ['pointer-events', 'none'],
      ['display', 'block'], ['visibility', 'visible'], ['opacity', '1']]) host.style.setProperty(k, v, 'important');
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    root.append(style);
    doc.documentElement.append(host);

    const tileEls = [];
    let pillEl = null, pillText = null, timer = null, lastState = null;

    function renderTiles(view) {
      const { tiles, lamp } = view;
      const blurPx = Number.isFinite(view.blurPx) && view.blurPx > 0 ? view.blurPx : BLUR_FALLBACK_PX;
      tiles.forEach((r, i) => {
        let el = tileEls[i];
        if (!el) { el = tileEls[i] = doc.createElement('div'); el.className = 'tile'; root.append(el); }
        const s = el.style;
        s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
        s.backdropFilter = `blur(${blurPx}px) saturate(0.9)`;
        let mask = 'none';
        if (lamp) {
          const p = lamp.pointer && { x: Math.round(lamp.pointer.x), y: Math.round(lamp.pointer.y) };
          const snap = lamp.rect && lamp.rect.h <= 2.5 * lamp.lampPx && lampBand(r, p, 0) && bandFromRect(r, lamp.rect);
          mask = lampMask(snap || lampBand(r, p, lamp.lampPx), lamp.featherPx);
        }
        s.maskImage = mask;
        s.webkitMaskImage = mask;
      });
      while (tileEls.length > tiles.length) tileEls.pop().remove();
    }

    function stopTimer() { clearTimeout(timer); timer = null; }

    function renderPill(text) {
      if (text === null || text === undefined) {
        stopTimer();
        if (pillEl) pillEl.remove();
        pillEl = pillText = null;
        return;
      }
      if (!pillEl) {
        pillEl = doc.createElement('div');
        pillEl.className = 'pill';
        pillEl.append(doc.createElement('span'));
        pillEl.firstChild.className = 't';
        root.append(pillEl);
        pillEl.offsetWidth; // commit opacity 0 so the fade-in runs
        pillEl.classList.add('on');
      }
      if (text === pillText) return;
      pillText = text;
      pillEl.firstChild.textContent = text;
      pillEl.classList.remove('compact');
      stopTimer();
      timer = setTimeout(() => pillEl && pillEl.classList.add('compact'), COMPACT_MS);
    }

    function render(view) {
      if (!host.isConnected) return false;
      renderTiles(view);
      renderPill(view.pill);
      const state = JSON.stringify(view.state);
      if (state !== lastState) { lastState = state; host.dataset.state = state; }
      return true;
    }

    function destroy() {
      stopTimer();
      host.remove();
    }

    return { host, render, destroy };
  }

  return { createCurtain };
});
