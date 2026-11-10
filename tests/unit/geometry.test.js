const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../extension/shared/geometry.js');

const r = { x: 0, y: 0, w: 100, h: 100 };
const overlaps = (a, b) => G.intersect(a, b) !== null;

test('subtract', () => {
  assert.deepEqual(G.subtract(r, { x: 25, y: 25, w: 50, h: 50 }),
    [{ x: 0, y: 0, w: 100, h: 25 }, { x: 0, y: 75, w: 100, h: 25 }, { x: 0, y: 25, w: 25, h: 50 }, { x: 75, y: 25, w: 25, h: 50 }]);
  assert.deepEqual(G.subtract(r, { x: 200, y: 200, w: 5, h: 5 }), [r]);
  assert.deepEqual(G.subtract(r, { x: -1, y: -1, w: 500, h: 500 }), []);
});

test('splitAtX splits only strictly inside', () => {
  assert.deepEqual(G.splitAtX([{ x: 0, y: 0, w: 100, h: 10 }], [30, 100, 0, 150]),
    [{ x: 0, y: 0, w: 30, h: 10 }, { x: 30, y: 0, w: 70, h: 10 }]);
});

test('tiles', () => {
  const hole = { x: 500, y: 100, w: 200, h: 50 };
  const t = G.tiles({ cover: [{ x: 0, y: 0, w: 1000, h: 800 }], splits: [400], holes: [hole] });
  assert.equal(t.reduce((s, q) => s + q.w * q.h, 0), 790000);
  assert.ok(t.every((q) => !overlaps(q, hole)));
  assert.ok(t.every((q) => q.x >= 400 || q.x + q.w <= 400));
});

test('lampBand', () => {
  const tile = { x: 0, y: 100, w: 400, h: 600 };
  assert.deepEqual(G.lampBand(tile, { x: 50, y: 300 }, 72), { top: 164, bottom: 236 });
  assert.deepEqual(G.lampBand(tile, { x: 50, y: 110 }, 72), { top: 0, bottom: 46 });
  assert.equal(G.lampBand(tile, { x: 500, y: 300 }, 72), null);
  assert.equal(G.lampBand(tile, null, 72), null);
});

test('bandFromRect', () => {
  const tile = { x: 0, y: 100, w: 400, h: 600 };
  assert.deepEqual(G.bandFromRect(tile, { x: 10, y: 250, w: 380, h: 72 }), { top: 150, bottom: 222 });
  assert.equal(G.bandFromRect(tile, { x: 10, y: 20, w: 380, h: 72 }), null);
  assert.equal(G.bandFromRect(tile, { x: 10, y: 700, w: 380, h: 72 }), null);
  assert.deepEqual(G.bandFromRect(tile, { x: 10, y: 80, w: 380, h: 72 }), { top: 0, bottom: 52 });
  assert.deepEqual(G.bandFromRect(tile, { x: 10, y: 680, w: 380, h: 72 }), { top: 580, bottom: 600 });
});

test('lampMask', () => {
  assert.equal(G.lampMask(null, 10), 'none');
  assert.equal(G.lampMask({ top: 100, bottom: 172 }, 10),
    'linear-gradient(to bottom, #000 0px, #000 90px, transparent 100px, transparent 172px, #000 182px, #000 100%)');
  assert.equal(G.lampMask({ top: 0, bottom: 46 }, 10),
    'linear-gradient(to bottom, #000 0px, #000 0px, transparent 0px, transparent 46px, #000 56px, #000 100%)');
});
