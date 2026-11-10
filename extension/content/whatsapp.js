(function () {
  const T = globalThis.Tirai;
  const { normalize, chatRule } = T.settings;
  const { effectiveState, coverPlan } = T.mode;
  const { findRegions, currentChatTitle } = T.regions;
  const REGION_THROTTLE_MS = 250;
  const BLUR_DEBOUNCE_MS = 250;
  const WATCHDOG_MS = 2000;
  const DEFAULT_LIVE = { sharing: false, idle: 'active' };
  const DEFAULT_SHORTCUT = 'Alt+Shift+Z';

  const root = document.documentElement;
  const id = crypto.randomUUID();
  root.querySelectorAll('tirai-curtain').forEach((el) => el.remove());
  root.dataset.tiraiInstance = id;

  const ac = new AbortController();
  const listen = (target, type, fn, capture = false) => target.addEventListener(type, fn, { capture, signal: ac.signal });

  let settings = normalize(undefined);
  let live = DEFAULT_LIVE;
  let shortcuts = {};
  let focused = document.hasFocus();
  let regions = { side: null, main: null, sideEl: null, mainEl: null, sideSource: null, mainSource: null, loggedIn: true };
  let title = null;
  let tiles = [];
  let status = null;
  let popupEls = [];
  let dead = false;
  let frame = 0, retry = 0, blurTimer = 0, trailing = 0, lastScan = 0;
  let curtain = T.curtain.createCurtain(document);
  // Hides sensitive numbers. It watches the whole page (not just the chat pane), so a chat pane that WhatsApp swaps
  // out is covered from its first frame, and chat list previews are masked too. A change in how many are hidden is
  // repainted into the state.
  const masker = T.masker.createMasker({ getRoot: () => document.body, onChange: () => queueMicrotask(scheduleRender) });
  let maskError = false;
  const tracker = T.lamp.createLampTracker({ win: window, getTiles: () => tiles, onChange: scheduleRender });

  // Fail closed: if anything goes wrong while planning, cover the whole window rather than nothing.
  function fallbackView() {
    const w = window.innerWidth, h = window.innerHeight;
    return {
      tiles: [{ x: 0, y: 0, w, h }], blurPx: settings.blurPx, lamp: null, pill: null,
      state: { mode: 'full', reason: 'error', lamp: false, health: 'fallback', rule: 'auto', sideSource: null, mainSource: null },
    };
  }

  // The row or message under the lamp pointer, read only. Anything outside the chat list and chat pane, or too
  // small or too tall to be one row, gives no rect and the lamp keeps its fixed band.
  const SNAP_TARGET = '[role="row"], [role="listitem"], [data-testid="msg-container"], .message-in, .message-out';
  function lampRect(p, lampPx) {
    if (!p) return undefined;
    const { sideEl, mainEl } = regions;
    const hit = document.elementsFromPoint(p.x, p.y).find((el) => (sideEl && sideEl.contains(el)) || (mainEl && mainEl.contains(el)));
    const target = hit && hit.closest(SNAP_TARGET);
    if (!target) return undefined;
    const r = target.getBoundingClientRect();
    const rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    return rect.h >= 24 && rect.h <= 2.5 * lampPx ? rect : undefined;
  }

  function compute() {
    const state = effectiveState(settings, live, { focused });
    // Share, idle and unfocus cover everything: no per-chat rule and no open holes.
    const user = state.reason === 'user';
    const rule = user ? chatRule(settings, liveTitle()) : 'auto';
    const plan = coverPlan({ mode: state.mode, regions, rule, viewport: { w: window.innerWidth, h: window.innerHeight } });
    const holes = user && plan.cover.length ? plan.holes.concat(T.holes.popupRects(popupEls, document, [regions.side, regions.main]), T.holes.focusHole(document)) : [];
    const next = T.geometry.tiles({ cover: plan.cover, holes, splits: plan.splits });
    let pill = null;
    if (state.mode === 'full' && state.reason === 'user') {
      pill = chrome.i18n.getMessage('pillFull', [shortcuts.toggleFull || DEFAULT_SHORTCUT]);
    } else if (state.mode === 'full' && state.reason === 'share') {
      pill = chrome.i18n.getMessage('pillShare');
    }
    const pointer = state.lamp ? tracker.pointer() : null;
    return {
      tiles: next, blurPx: settings.blurPx, pill,
      lamp: state.lamp ? { pointer, lampPx: settings.lampPx, featherPx: 10, rect: lampRect(pointer, settings.lampPx) } : null,
      state: { mode: state.mode, reason: state.reason, lamp: state.lamp, health: plan.health, rule,
        sideSource: regions.sideSource, mainSource: regions.mainSource },
    };
  }

  // Masks run while the curtain is on and sensitive data is enabled. A masker failure never takes the cover down,
  // and the state says so (maskError) while it lasts.
  function syncMasker(mode) {
    try {
      if (mode !== 'off' && settings.sensitive.enabled) {
        masker.setTypes(settings.sensitive.types);
        masker.start();
      } else masker.stop();
      maskError = false;
      return masker.count();
    } catch { maskError = true; return 0; }
  }

  // The open chat's name is read where it is now, so a chat switch uses its own rule on the next frame.
  function liveTitle() {
    const el = regions.mainEl;
    return el && el.isConnected ? currentChatTitle(document, el) : title;
  }

  function render() {
    frame = 0;
    if (dead) return;
    if (root.dataset.tiraiInstance !== id || !chrome.runtime?.id) return destroy();
    if (!curtain.host.isConnected) curtain = T.curtain.createCurtain(document);
    let view;
    try { view = compute(); } catch { view = fallbackView(); }
    view.state.masks = syncMasker(view.state.mode);
    if (maskError) view.state.maskError = true;
    tiles = view.tiles;
    status = view.state;
    let drawn = false;
    try { drawn = curtain.render(view); } catch {
      try { drawn = curtain.render(fallbackView()); } catch { /* retried below */ }
    }
    if (!drawn && !retry) retry = setTimeout(() => { retry = 0; scheduleRender(); }, REGION_THROTTLE_MS);
  }

  // A hidden tab runs no animation frames, so it renders at once and never shows an old, less covered first frame.
  function scheduleRender() {
    if (dead) return;
    if (document.hidden) { cancelAnimationFrame(frame); render(); } else if (!frame) frame = requestAnimationFrame(render);
  }

  // Region detection runs at most once per REGION_THROTTLE_MS: right away after a quiet period, otherwise trailing.
  const sizeWatcher = new ResizeObserver(() => scanSoon());
  // A popup can close with a class, style or hidden change and no node change, so its own attributes are watched too.
  const popupWatcher = new MutationObserver(scheduleRender);
  let watched = [];
  function scan() {
    if (dead) return;
    clearTimeout(trailing);
    trailing = 0;
    lastScan = Date.now();
    try {
      regions = findRegions(document);
      title = currentChatTitle(document, regions.mainEl);
      popupEls = T.holes.popupElements(document);
    } catch { regions = { ...regions, side: null, main: null, loggedIn: true }; title = null; popupEls = []; }
    popupWatcher.disconnect();
    for (const el of popupEls) popupWatcher.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    const els = [regions.sideEl, regions.mainEl].filter(Boolean);
    if (els.length !== watched.length || els.some((el, i) => el !== watched[i])) {
      sizeWatcher.disconnect();
      els.forEach((el) => sizeWatcher.observe(el));
      watched = els;
    }
    scheduleRender();
  }
  function scanSoon() {
    if (dead || trailing) return;
    const wait = lastScan + REGION_THROTTLE_MS - Date.now();
    if (wait <= 0) scan();
    else trailing = setTimeout(scan, wait);
  }

  // Render at once (cheap: the title is read live) and rescan regions and popups on the throttle.
  const bodyWatcher = new MutationObserver(() => { scheduleRender(); scanSoon(); });
  bodyWatcher.observe(document.body, { childList: true, subtree: true });
  // Fail closed: notice at once when our host is removed or a newer instance takes over.
  const rootWatcher = new MutationObserver(scheduleRender);
  rootWatcher.observe(root, { childList: true, attributes: true, attributeFilter: ['data-tirai-instance'] });

  const setFocused = (v) => { if (focused !== v) { focused = v; scheduleRender(); } };
  listen(window, 'focus', () => { clearTimeout(blurTimer); setFocused(true); });
  listen(window, 'blur', () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => setFocused(false), BLUR_DEBOUNCE_MS);
  });
  listen(window, 'resize', scan);
  listen(document, 'focusin', scheduleRender, true);
  listen(document, 'focusout', scheduleRender, true);
  listen(document, 'scroll', scheduleRender, true);
  listen(document, 'visibilitychange', () => { if (!document.hidden) { cancelAnimationFrame(frame); render(); } });

  const watchdog = setInterval(scheduleRender, WATCHDOG_MS);

  function onStorage(changes, area) {
    if (area === 'local' && changes.settings) settings = normalize(changes.settings.newValue);
    if (area === 'session') {
      if (changes.live) live = { ...DEFAULT_LIVE, ...changes.live.newValue };
      if (changes.shortcuts) shortcuts = changes.shortcuts.newValue || {};
    }
    scheduleRender();
  }
  function onMessage(msg, _sender, sendResponse) {
    if (msg && msg.type === 'status') {
      const { mode, reason, lamp, health, rule, sideSource, mainSource } = status || {};
      sendResponse({ title, state: { mode, reason, lamp }, health, rule, sideSource, mainSource });
    }
  }
  chrome.storage.onChanged.addListener(onStorage);
  chrome.runtime.onMessage.addListener(onMessage);

  function destroy() {
    dead = true;
    ac.abort();
    cancelAnimationFrame(frame);
    clearTimeout(retry);
    clearTimeout(blurTimer);
    clearTimeout(trailing);
    clearInterval(watchdog);
    sizeWatcher.disconnect();
    popupWatcher.disconnect();
    bodyWatcher.disconnect();
    rootWatcher.disconnect();
    tracker.destroy();
    masker.stop();
    curtain.destroy();
    try {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch { /* the extension context is already gone */ }
  }

  // Cover from the first frame with the defaults, then follow the stored state. A failed read keeps the defaults.
  scan();
  const read = (area, keys) => Promise.resolve().then(() => chrome.storage[area].get(keys)).catch(() => ({}));
  Promise.all([read('local', 'settings'), read('session', ['live', 'shortcuts'])]).then(([local, session]) => {
    if (dead) return;
    if (local.settings) settings = normalize(local.settings);
    if (session.live) live = { ...DEFAULT_LIVE, ...session.live };
    if (session.shortcuts) shortcuts = session.shortcuts;
    scheduleRender();
  });
})();
