const test = require('node:test');
const assert = require('node:assert/strict');
const { score } = require('../../eval/score.js');

test('3 gold / 3 pred example', () => {
  const gold = [
    { start: 0, end: 10, type: 'otp' },
    { start: 20, end: 30, type: 'nik' },
    { start: 40, end: 50, type: 'nik' },
  ];
  const pred = [
    { start: 1, end: 10, type: 'otp' }, // overlap 9 >= 8: match
    { start: 25, end: 35, type: 'nik' }, // overlap 5 < 8: fp, and gold 2 is fn
    { start: 40, end: 50, type: 'card' }, // wrong type: fp, gold 3 is fn
  ];
  const r = score(gold, pred);
  assert.deepEqual(r.perType.otp, { tp: 1, fp: 0, fn: 0, precision: 1, recall: 1, f1: 1 });
  assert.deepEqual(r.perType.nik, { tp: 0, fp: 1, fn: 2, precision: 0, recall: 0, f1: 0 });
  assert.deepEqual(r.perType.card, { tp: 0, fp: 1, fn: 0, precision: 0, recall: 0, f1: 0 });
  assert.equal(r.micro.tp, 1);
  assert.equal(r.micro.fp, 2);
  assert.equal(r.micro.fn, 2);
  assert.equal(r.micro.precision, 1 / 3);
  assert.equal(r.micro.recall, 1 / 3);
  assert.equal(r.micro.f1, 1 / 3);
});

test('one-to-one: a prediction matches at most one gold', () => {
  const gold = [{ start: 0, end: 10, type: 'otp' }, { start: 0, end: 10, type: 'otp' }];
  const pred = [{ start: 0, end: 10, type: 'otp' }];
  assert.equal(score(gold, pred).micro.tp, 1);
  assert.equal(score(gold, pred).micro.fn, 1);
});
