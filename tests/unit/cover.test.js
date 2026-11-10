const test = require('node:test');
const assert = require('node:assert/strict');
const { coverPlan } = require('../../extension/shared/mode.js');

const viewport = { w: 1280, h: 800 };
const side = { x: 64, y: 0, w: 420, h: 800 };
const main = { x: 484, y: 0, w: 796, h: 800 };
const plan = (mode, regions, rule = 'auto') => coverPlan({ mode, regions, rule, viewport });
const known = { side, main, loggedIn: true };

test('off covers nothing', () => {
  assert.deepEqual(plan('off', known), { cover: [], holes: [], splits: [], health: 'ok' });
});

test('normal covers the chat list only', () => {
  assert.deepEqual(plan('normal', known), { cover: [side], holes: [], splits: [484], health: 'ok' });
});

test('normal with hide also covers the open chat', () => {
  const p = plan('normal', known, 'hide');
  assert.deepEqual(p.cover, [side, main]);
  assert.deepEqual(p.splits, [484]);
  assert.equal(p.health, 'ok');
});

test('normal with hide but no open chat covers the list only', () => {
  const p = plan('normal', { side, main: null, loggedIn: true }, 'hide');
  assert.deepEqual(p.cover, [side]);
  assert.deepEqual(p.splits, [484]);
});

test('normal falls back to the viewport when logged in and the list is unknown', () => {
  const p = plan('normal', { side: null, main: null, loggedIn: true });
  assert.deepEqual(p, { cover: [{ x: 0, y: 0, w: 1280, h: 800 }], holes: [], splits: [], health: 'fallback' });
});

test('normal on the QR page stays idle', () => {
  const p = plan('normal', { side: null, main: null, loggedIn: false });
  assert.deepEqual(p, { cover: [], holes: [], splits: [], health: 'idle' });
});

test('full covers the viewport', () => {
  const p = plan('full', known);
  assert.deepEqual(p.cover, [{ x: 0, y: 0, w: 1280, h: 800 }]);
  assert.deepEqual(p.holes, []);
  assert.deepEqual(p.splits, [484]);
  assert.equal(p.health, 'ok');
});

test('full with show leaves the open chat as a hole', () => {
  const p = plan('full', known, 'show');
  assert.deepEqual(p.holes, [main]);
  assert.deepEqual(p.cover, [{ x: 0, y: 0, w: 1280, h: 800 }]);
});

test('full with show but no open chat has no hole', () => {
  assert.deepEqual(plan('full', { side, main: null, loggedIn: true }, 'show').holes, []);
});

test('full on the QR page stays idle', () => {
  const p = plan('full', { side: null, main: null, loggedIn: false }, 'show');
  assert.deepEqual(p, { cover: [], holes: [], splits: [], health: 'idle' });
});

test('full with unknown regions on a logged-in page is a fallback', () => {
  const p = plan('full', { side: null, main: null, loggedIn: true }, 'show');
  assert.equal(p.health, 'fallback');
  assert.deepEqual(p.cover, [{ x: 0, y: 0, w: 1280, h: 800 }]);
  assert.deepEqual(p.holes, []);
});

test('full covers the viewport when logged out but one region is known', () => {
  const p = plan('full', { side, main: null, loggedIn: false });
  assert.equal(p.health, 'ok');
  assert.equal(p.cover.length, 1);
});

test('splits are rounded and de-duplicated', () => {
  const touching = { side: { x: 64, y: 0, w: 420, h: 800 }, main: { x: 484, y: 0, w: 796, h: 800 }, loggedIn: true };
  assert.deepEqual(plan('normal', touching).splits, [484]);
  const frac = { side: { x: 64, y: 0, w: 419.6, h: 800 }, main: { x: 484, y: 0, w: 796, h: 800 }, loggedIn: true };
  assert.deepEqual(plan('normal', frac).splits, [484]);
  const gap = { side, main: { ...main, x: 490 }, loggedIn: true };
  assert.deepEqual(plan('normal', gap).splits, [484, 490]);
});

test('normal with hide covers everything right of the list, so a side drawer is covered too', () => {
  // With a drawer open, #main is narrower than the space right of the chat list.
  const narrow = { side, main: { x: 484, y: 0, w: 500, h: 800 }, loggedIn: true };
  const p = plan('normal', narrow, 'hide');
  assert.deepEqual(p.cover, [side, { x: 484, y: 0, w: 796, h: 800 }]);
  assert.equal(p.health, 'ok');
});

test('normal with hide does not add an empty right-hand rectangle', () => {
  const wide = { side: { x: 0, y: 0, w: 1280, h: 800 }, main: { x: 1280, y: 0, w: 10, h: 800 }, loggedIn: true };
  assert.deepEqual(plan('normal', wide, 'hide').cover, [wide.side]);
});
