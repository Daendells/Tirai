// Puts the curtain on any page, on request, until the page reloads. Injected by the background worker.
(function () {
  // A document without a body (an SVG file, a bare frameset) cannot be covered, and half-starting would leave an orphan curtain.
  if (globalThis.__tiraiPage || !document.body) return;
  const T = globalThis.Tirai;
  const settings = T.settings.normalize(globalThis.__tiraiSettings);
  const shortcut = globalThis.__tiraiShortcut || 'Alt+Shift+Z';
  const pill = (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage('pillPage', [shortcut]))
    || `Curtain on this tab · ${shortcut} to remove`;

  const ac = new AbortController();
  const listen = (target, type, fn, capture = false) => target.addEventListener(type, fn, { capture, signal: ac.signal });
  let tiles = [];
  let frame = 0, dead = false;
  let curtain = T.curtain.createCurtain(document);
  const masker = T.masker.createMasker({ getRoot: () => document.body, onChange: () => {} });
  const tracker = T.lamp.createLampTracker({ win: window, getTiles: () => tiles, onChange: scheduleRender });

  function render() {
    frame = 0;
    if (dead) return;
    if (!curtain.host.isConnected) curtain = T.curtain.createCurtain(document);
    const full = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    let holes = [];
    try { holes = T.holes.collectHoles(document); } catch { /* stay fully covered */ }
    tiles = T.geometry.tiles({ cover: [full], holes });
    try {
      if (settings.sensitive.enabled) { masker.setTypes(settings.sensitive.types); masker.start(); } else masker.stop();
    } catch { /* the cover stays up without masks */ }
    curtain.render({
      tiles, blurPx: settings.blurPx, pill,
      lamp: { pointer: tracker.pointer(), lampPx: settings.lampPx, featherPx: 10 },
      state: { mode: 'page', masks: masker.count() },
    });
  }
  function scheduleRender() {
    if (dead) return;
    if (document.hidden) { cancelAnimationFrame(frame); render(); } else if (!frame) frame = requestAnimationFrame(render);
  }

  // Popups open and close with node, class or style changes, so watch those and the focus.
  const watcher = new MutationObserver(scheduleRender);
  watcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
  listen(window, 'resize', scheduleRender);
  listen(document, 'focusin', scheduleRender, true);
  listen(document, 'focusout', scheduleRender, true);
  listen(document, 'scroll', scheduleRender, true);
  listen(document, 'visibilitychange', () => { if (!document.hidden) scheduleRender(); });

  // Each step is guarded, so one that throws never leaves the curtain or the global behind.
  function destroy() {
    delete globalThis.__tiraiPage;
    dead = true;
    for (const step of [() => ac.abort(), () => cancelAnimationFrame(frame), () => watcher.disconnect(),
      () => tracker.destroy(), () => masker.stop(), () => curtain.destroy()]) {
      try { step(); } catch { /* keep tearing down */ }
    }
  }
  globalThis.__tiraiPage = { destroy };
  render();
})();
