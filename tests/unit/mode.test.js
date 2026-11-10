const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../extension/shared/settings.js');
const { effectiveState } = require('../../extension/shared/mode.js');

const cfg = (mode, auto = {}) => {
  const s = S.normalize();
  s.mode = mode;
  Object.assign(s.auto, auto);
  return s;
};
const st = (mode, reason, lamp) => ({ mode, reason, lamp });

test('off ignores every trigger', () => {
  const s = cfg('off', { share: true, unfocus: true, idle: true });
  assert.deepEqual(effectiveState(s, { sharing: true, idle: 'locked' }, { focused: false }), st('off', 'user', false));
});
test('default and chosen full', () => {
  assert.deepEqual(effectiveState(cfg('normal')), st('normal', 'user', true));
  assert.deepEqual(effectiveState(cfg('full')), st('full', 'user', true));
});
test('sharing', () => {
  assert.deepEqual(effectiveState(cfg('normal', { share: true }), { sharing: true, idle: 'active' }), st('full', 'share', false));
  assert.deepEqual(effectiveState(cfg('normal'), { sharing: true, idle: 'active' }), st('normal', 'user', true));
});
test('idle and unfocus', () => {
  assert.deepEqual(effectiveState(cfg('normal', { idle: true }), { sharing: false, idle: 'locked' }), st('full', 'idle', false));
  assert.deepEqual(effectiveState(cfg('normal', { unfocus: true }), undefined, { focused: false }), st('full', 'unfocus', false));
});
test('share wins when all triggers are on', () => {
  const s = cfg('normal', { share: true, idle: true, unfocus: true });
  assert.equal(effectiveState(s, { sharing: true, idle: 'locked' }, { focused: false }).reason, 'share');
});
