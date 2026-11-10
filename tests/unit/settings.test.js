const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../extension/shared/settings.js');

test('normalize(undefined) equals DEFAULTS and is unfrozen', () => {
  const n = S.normalize(undefined);
  assert.deepEqual(n, S.DEFAULTS);
  assert.equal(Object.isFrozen(n), false);
  assert.equal(Object.isFrozen(S.DEFAULTS.sensitive.types), true);
});

test('normalize clamps and repairs', () => {
  const n = S.normalize({ blurPx: 99, lampPx: 1, mode: 'x', auto: { idleSeconds: 5 } });
  assert.equal(n.blurPx, 30);
  assert.equal(n.lampPx, 40);
  assert.equal(n.mode, 'normal');
  assert.equal(n.auto.idleSeconds, 15);
});

test('normalize drops unknown keys, fixes lastOnMode, never throws', () => {
  const n = S.normalize({ junk: 1, lastOnMode: 'off', sensitive: { types: { nik: false, bad: true } } });
  assert.equal(n.junk, undefined);
  assert.equal(n.lastOnMode, 'normal');
  assert.equal(n.sensitive.types.nik, false);
  assert.equal(n.sensitive.types.bad, undefined);
  for (const bad of [null, 5, 'x', [], { chats: 5, auto: 'x', sensitive: null }]) {
    assert.doesNotThrow(() => S.normalize(bad));
  }
});

test('chats capped at 500, bad entries dropped', () => {
  const chats = {};
  for (let i = 0; i < 600; i++) chats['c' + i] = 'hide';
  assert.equal(Object.keys(S.normalize({ chats }).chats).length, 500);
  const n = S.normalize({ chats: { ' a ': 'show', '': 'hide', b: 'maybe', ['x'.repeat(201)]: 'hide' } });
  assert.deepEqual(n.chats, { a: 'show' });
});

test('chatRule and withChatRule', () => {
  const s = S.normalize();
  assert.equal(S.chatRule(s, 'Mama'), 'auto');
  const h = S.withChatRule(s, 'Mama', 'hide');
  assert.deepEqual(h.chats, { Mama: 'hide' });
  assert.deepEqual(s.chats, {});
  assert.equal(S.chatRule(h, 'Mama'), 'hide');
  assert.deepEqual(S.withChatRule(h, 'Mama', 'auto').chats, {});
});

test('nextMode transitions', () => {
  const m = (mode, lastOnMode) => ({ mode, lastOnMode });
  assert.deepEqual(S.nextMode(m('normal', 'normal'), 'toggle-full'), m('full', 'full'));
  assert.deepEqual(S.nextMode(m('full', 'full'), 'toggle-full'), m('normal', 'normal'));
  assert.deepEqual(S.nextMode(m('off', 'full'), 'toggle-full'), m('full', 'full'));
  assert.deepEqual(S.nextMode(m('normal', 'normal'), 'toggle-off'), m('off', 'normal'));
  assert.deepEqual(S.nextMode(m('full', 'normal'), 'toggle-off'), m('off', 'full'));
  assert.deepEqual(S.nextMode(m('off', 'full'), 'toggle-off'), m('full', 'full'));
});

test('chatRule and withChatRule trim the title', () => {
  const s = S.normalize({ chats: { 'Budi Santoso': 'hide' } });
  assert.equal(S.chatRule(s, '  Budi Santoso '), 'hide');
  assert.equal(S.chatRule(s, ''), 'auto');
  assert.equal(S.chatRule(s, null), 'auto');
  assert.deepEqual(S.withChatRule(s, ' Sari Dewi  ', 'show').chats, { 'Budi Santoso': 'hide', 'Sari Dewi': 'show' });
  assert.deepEqual(S.withChatRule(s, '  Budi Santoso ', 'auto').chats, {});
  assert.deepEqual(S.withChatRule(s, '   ', 'hide').chats, s.chats);
  assert.deepEqual(S.withChatRule(s, undefined, 'hide').chats, s.chats);
});
