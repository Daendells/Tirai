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
  let popups = [];
  let dead = false;
  let frame = 0, retry = 0, blurTimer = 0, trailing = 0, lastScan = 0;
  let curtain = T.curtain.createCurtain(document);
  const tracker = T.lamp.createLampTracker({ win: window, getTiles: () => tiles, onChange: scheduleRender });

  // Fail closed: if anything goes wrong while planning, cover the whole window rather than nothing.
  function fallbackView() {
    const w = window.innerWidth, h = window.innerHeight;
    return {
      tiles: [{ x: 0, y: 0, w, h }], blurPx: settings.blurPx, lamp: null, pill: null,
      state: { mode: 'full', reason: 'error', lamp: false, health: 'fallback', rule: 'auto', sideSource: null, mainSource: null },
    };
  }

  function compute() {
    const state = effectiveState(settings, live, { focused });
    // Share, idle and unfocus cover everything: no per-chat rule and no open holes.
    const user = state.reason === 'user';
    const rule = user ? chatRule(settings, liveTitle()) : 'auto';
    const plan = coverPlan({ mode: state.mode, regions, rule, viewport: { w: window.innerWidth, h: window.innerHeight } });
    const holes = user && plan.cover.length ? plan.holes.concat(popups, T.holes.focusHole(document)) : [];
    const next = T.geometry.tiles({ cover: plan.cover, holes, splits: plan.splits });
    let pill = null;
    if (state.mode === 'full' && state.reason === 'user') {
      pill = chrome.i18n.getMessage('pillFull', [shortcuts.toggleFull || DEFAULT_SHORTCUT]);
    } else if (state.mode === 'full' && state.reason === 'share') {
      pill = chrome.i18n.getMessage('pillShare');
    }
    return {
      tiles: next, blurPx: settings.blurPx, pill,
      lamp: state.lamp ? { pointer: tracker.pointer(), lampPx: settings.lampPx, featherPx: 10 } : null,
      state: { mode: state.mode, reason: state.reason, lamp: state.lamp, health: plan.health, rule,
        sideSource: regions.sideSource, mainSource: regions.mainSource },
    };
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
    tiles = view.tiles;
    status = view.state;
    let drawn = false;
    try { drawn = curtain.render(view); } catch {
      try { drawn = curtain.render(fallbackView()); } catch { /* retried below */ }
    }
    if (!drawn && !retry) retry = setTimeout(() => { retry = 0; scheduleRender(); }, REGION_THROTTLE_MS);
  }

  function scheduleRender() {
    if (!frame && !dead) frame = requestAnimationFrame(render);
  }

  // Region detection runs at most once per REGION_THROTTLE_MS: right away after a quiet period, otherwise trailing.
  const sizeWatcher = new ResizeObserver(() => scanSoon());
  let watched = [];
  function scan() {
    if (dead) return;
    clearTimeout(trailing);
    trailing = 0;
    lastScan = Date.now();
    try {
      regions = findRegions(document);
      title = currentChatTitle(document, regions.mainEl);
      popups = T.holes.popupHoles(document, [regions.side, regions.main]);
    } catch { regions = { ...regions, side: null, main: null, loggedIn: true }; title = null; popups = []; }
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
    bodyWatcher.disconnect();
    rootWatcher.disconnect();
    tracker.destroy();
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
