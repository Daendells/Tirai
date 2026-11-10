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

  // Rects to leave uncovered: open popups, and the one small element the user is typing in or has selected.
  function collectHoles(doc = document, { maxFocusW = 900, maxFocusH = 240 } = {}) {
    const win = doc.defaultView;
    const holes = [];
    for (const el of doc.querySelectorAll(POPUPS)) {
      const r = rectOf(el);
      const inView = r.x < win.innerWidth && r.x + r.w > 0 && r.y < win.innerHeight && r.y + r.h > 0;
      if (r.w > 0 && r.h > 0 && inView && win.getComputedStyle(el).visibility !== 'hidden') holes.push(r);
    }
    const a = doc.activeElement;
    if (a && a !== doc.body && a !== doc.documentElement) {
      const editable = a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'
        || FOCUS_ROLES.includes(a.getAttribute('role'));
      const r = editable ? rectOf(a) : null;
      if (r && r.w > 0 && r.h > 0 && r.w <= maxFocusW && r.h <= maxFocusH) {
        holes.push({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 });
      }
    }
    return holes;
  }

  return { collectHoles };
});
