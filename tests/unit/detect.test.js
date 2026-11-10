const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../extension/shared/detect.js');

const ALL = { nik: true, card: true, account: true, otp: true, phone: true, email: true };
const found = (text, enabled = ALL) => D.detect(text, enabled).map((m) => [text.slice(m.start, m.end), m.type]);

test('luhn', () => {
  assert.equal(D.luhn('4111111111111111'), true);
  assert.equal(D.luhn('4111111111111112'), false);
});

test('isNik', () => {
  assert.equal(D.isNik('3578014512990003'), true);
  assert.equal(D.isNik('9978014512990003'), false);
  assert.equal(D.isNik('3578014512990000'), false);
  assert.equal(D.isNik('3578014513990003'), false);
  assert.equal(D.isNik('357801451299003'), false);
});

test('fixture sentences', () => {
  assert.deepEqual(found('Kode OTP kamu 482913, jangan kasih ke siapa pun'), [['482913', 'otp']]);
  assert.deepEqual(found('Transfer ke BCA 1234567890 a/n Sari Dewi'), [['1234567890', 'account']]);
  assert.deepEqual(found('NIK saya 3578014512990003 ya'), [['3578014512990003', 'nik']]);
  assert.deepEqual(found('Harganya Rp 1.250.000 ya'), []);
  assert.deepEqual(found('Resi JNE: JP1234567890'), []);
  assert.deepEqual(found('Ketemu tanggal 10/11/2026 jam 14.30'), []);
});

test('hard negatives stay unmasked', () => {
  for (const t of ['Rp1250000 ya', 'INV/2026/11/000123', 'JNE 0123456789012', 'kode pos 60111', 'GA 412 jam 14.30',
    'plat L 1234 AB', 'versi 2.10.4', 'https://example.com/p/4111111111111111', 'USD 4111111111111111']) {
    assert.deepEqual(found(t), [], t);
  }
});

test('positives with offsets', () => {
  assert.deepEqual(found('kartu 4111 1111 1111 1111 ya'), [['4111 1111 1111 1111', 'card']]);
  assert.deepEqual(found('hubungi 0812-3456-7890'), [['0812-3456-7890', 'phone']]);
  assert.deepEqual(found('wa +62 812 3456 7890'), [['+62 812 3456 7890', 'phone']]);
  assert.deepEqual(found('mail budi.s@mail.co.id ok'), [['budi.s@mail.co.id', 'email']]);
  assert.deepEqual(found('NPWP 09.254.294.3-407.000'), [['09.254.294.3-407.000', 'nik']]);
});

test('disabled types yield nothing, array form accepted', () => {
  const t = 'Kode OTP kamu 482913, mail a@b.co';
  assert.deepEqual(found(t, { ...ALL, otp: false, email: false }), []);
  assert.deepEqual(found(t, {}), []);
  assert.deepEqual(found(t, ['email']), [['a@b.co', 'email']]);
});

test('overlap priority: card over nik, nik keyword flips it', () => {
  assert.deepEqual(found('kartu 3578014512990018'), [['3578014512990018', 'card']]);
  assert.deepEqual(found('kartu KTP 3578014512990018'), [['3578014512990018', 'nik']]);
});

test('results are sorted and non-overlapping', () => {
  const t = 'NIK 3578014512990003 rek BCA 1234567890 OTP 482913 hp 081234567890 a@b.co';
  const r = D.detect(t, ALL);
  assert.equal(r.length, 5);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].start >= r[i - 1].end);
});

test('50,000 chars in under 50 ms', () => {
  const chunk = 'Halo, rek BCA 1234567890 dan OTP 482913 jam 14.30 Rp 1.250.000 tgl 10/11/2026 ';
  const text = chunk.repeat(Math.ceil(50000 / chunk.length)).slice(0, 50000);
  D.detect(text, ALL);
  const t0 = performance.now();
  D.detect(text, ALL);
  assert.ok(performance.now() - t0 < 50);
});
