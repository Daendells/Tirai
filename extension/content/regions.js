(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['regions'] = api;
})(function () {
  const ROW = '[role="row"],[role="listitem"]';

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }

  // A zero-sized element (display:none, collapsed) is as good as absent.
  const shown = (el) => { const r = rectOf(el); return r.w > 0 && r.h > 0; };

  const titledRows = (root) => [...root.querySelectorAll(ROW)].filter((r) => r.querySelector('span[title]'));

  // First ancestor (not the element itself) that is nearly full height and narrower than the window.
  function tallAncestor(el, win) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const r = p.getBoundingClientRect();
      if (r.height >= 0.8 * win.innerHeight && r.width < win.innerWidth) return p;
    }
    return null;
  }

  function findMain(doc, win) {
    const byId = doc.getElementById('main');
    if (byId && shown(byId)) return { el: byId, source: 'main' };
    for (const box of doc.querySelectorAll('footer [contenteditable="true"]')) {
      const el = tallAncestor(box, win);
      if (el) return { el, source: 'compose' };
    }
    return { el: null, source: null };
  }

  function findSide(doc, win, main) {
    const mainRect = main.el && rectOf(main.el);
    const side = doc.getElementById('side');
    if (side && shown(side)) return { el: side, source: 'side' };
    const pane = doc.getElementById('pane-side');
    if (pane) {
      const el = tallAncestor(pane, win) || pane;
      if (shown(el)) return { el, source: 'pane-side' };
    }
    for (const list of doc.querySelectorAll('[role="grid"],[role="list"]')) {
      if (titledRows(list).length < 3 || !shown(list)) continue;
      const r = rectOf(list);
      if (mainRect && r.x + r.w > mainRect.x + 2) continue;
      return { el: tallAncestor(list, win) || list, source: 'list' };
    }
    return { el: null, source: null };
  }

  function findRegions(doc = document) {
    const win = doc.defaultView;
    const main = findMain(doc, win);
    let side = findSide(doc, win, main);
    let sideRect = side.el && rectOf(side.el);
    const mainRect = main.el && rectOf(main.el);
    if (!side.el && mainRect && mainRect.x > 0) {
      sideRect = { x: 0, y: 0, w: mainRect.x, h: win.innerHeight };
      side = { el: null, source: 'left-of-main' };
    }
    return {
      side: sideRect, main: mainRect, sideEl: side.el, mainEl: main.el,
      sideSource: side.source, mainSource: main.source,
      loggedIn: !!doc.querySelector('img[src^="https://pps.whatsapp.net"]') || titledRows(doc).length >= 3,
    };
  }

  function currentChatTitle(doc = document) {
    const { mainEl } = findRegions(doc);
    if (!mainEl) return null;
    for (const s of mainEl.querySelectorAll('header span[title]')) {
      const t = s.getAttribute('title').trim();
      if (t) return t;
    }
    for (const s of mainEl.querySelectorAll('header [dir="auto"]')) {
      const t = s.textContent.trim();
      if (t) return t;
    }
    return null;
  }

  return { findRegions, currentChatTitle };
});
