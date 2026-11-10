(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['geometry'] = api;
})(function () {
  function intersect(a, b) {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
  }

  function subtract(rect, hole) {
    const i = intersect(rect, hole);
    if (!i) return [rect];
    const pieces = [
      { x: rect.x, y: rect.y, w: rect.w, h: i.y - rect.y },
      { x: rect.x, y: i.y + i.h, w: rect.w, h: rect.y + rect.h - (i.y + i.h) },
      { x: rect.x, y: i.y, w: i.x - rect.x, h: i.h },
      { x: i.x + i.w, y: i.y, w: rect.x + rect.w - (i.x + i.w), h: i.h },
    ];
    return pieces.filter((p) => p.w > 0 && p.h > 0);
  }

  function cut(rects, holes) {
    let out = rects;
    for (const hole of holes) out = out.flatMap((r) => subtract(r, hole));
    return out.filter((r) => r.w >= 1 && r.h >= 1);
  }

  function splitAtX(rects, xs) {
    return rects.flatMap((r) => {
      const cuts = xs.filter((x) => x > r.x && x < r.x + r.w).sort((a, b) => a - b);
      const edges = [r.x, ...cuts, r.x + r.w];
      return edges.slice(1).map((e, i) => ({ x: edges[i], y: r.y, w: e - edges[i], h: r.h }));
    });
  }

  function tiles({ cover, holes = [], splits = [] }) {
    return cut(splitAtX(cover, splits), holes);
  }

  function lampBand(tile, pointer, lampPx) {
    if (!pointer) return null;
    if (pointer.x < tile.x || pointer.x >= tile.x + tile.w) return null;
    if (pointer.y < tile.y || pointer.y >= tile.y + tile.h) return null;
    const local = pointer.y - tile.y;
    const clamp = (v) => Math.min(tile.h, Math.max(0, v));
    return { top: clamp(local - lampPx / 2), bottom: clamp(local + lampPx / 2) };
  }

  function bandFromRect(tile, rect) {
    if (rect.y + rect.h <= tile.y || rect.y >= tile.y + tile.h) return null;
    const clamp = (v) => Math.min(tile.h, Math.max(0, v));
    return { top: clamp(rect.y - tile.y), bottom: clamp(rect.y + rect.h - tile.y) };
  }

  function lampMask(band, featherPx) {
    if (!band) return 'none';
    const fade = Math.max(0, band.top - featherPx);
    return `linear-gradient(to bottom, #000 0px, #000 ${fade}px, transparent ${band.top}px, transparent ${band.bottom}px, #000 ${band.bottom + featherPx}px, #000 100%)`;
  }

  return { intersect, subtract, cut, splitAtX, tiles, lampBand, bandFromRect, lampMask };
});
