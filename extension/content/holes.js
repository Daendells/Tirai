(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['holes'] = api;
})(function () {
  const POPUPS = '[role="menu"],[role="dialog"],[role="listbox"],[role="tooltip"]';
  const FOCUS_ROLES = ['row', 'listitem', 'option', 'gridcell', 'textbox'];

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  };

  const encloses = (a, b) => a.x <= b.x + 2 && a.y <= b.y + 2 && a.x + a.w >= b.x + b.w - 2 && a.y + a.h >= b.y + b.h - 2;

  function isShown(el, win) {
    if (typeof el.checkVisibility !== 'function') return win.getComputedStyle(el).visibility !== 'hidden';
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
  }

  // Open popups. A popup that is more than half the window or wraps a whole region (a full-screen dialog
  // wrapper, a listbox holding the chat list) is not a popup we can safely leave open, so it stays covered.
  function popupHoles(doc = document, avoid = []) {
    const win = doc.defaultView;
    const half = (win.innerWidth * win.innerHeight) / 2;
    const holes = [];
    for (const el of doc.querySelectorAll(POPUPS)) {
      const r = rectOf(el);
      const inView = r.x < win.innerWidth && r.x + r.w > 0 && r.y < win.innerHeight && r.y + r.h > 0;
      if (r.w <= 0 || r.h <= 0 || !inView || r.w * r.h > half) continue;
      if (avoid.some((a) => a && encloses(r, a)) || !isShown(el, win)) continue;
      holes.push(r);
    }
    return holes;
  }

  // The one small element the user is typing in or has selected.
  function focusHole(doc = document, { maxFocusW = 900, maxFocusH = 240 } = {}) {
    const a = doc.activeElement;
    if (!a || a === doc.body || a === doc.documentElement) return [];
    const editable = a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'
      || FOCUS_ROLES.includes(a.getAttribute('role'));
    if (!editable) return [];
    const r = rectOf(a);
    if (r.w <= 0 || r.h <= 0 || r.w > maxFocusW || r.h > maxFocusH) return [];
    return [{ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }];
  }

  function collectHoles(doc = document, opts = {}) {
    return popupHoles(doc, opts.avoid).concat(focusHole(doc, opts));
  }

  return { collectHoles, popupHoles, focusHole };
});
