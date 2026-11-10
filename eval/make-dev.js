// Regenerates eval/dev.jsonl. Every number is synthetic and the PRNG is seeded,
// so the file is reproducible: node eval/make-dev.js
const fs = require('node:fs');
const path = require('node:path');

let seed = 20261110;
const rnd = () => { // mulberry32
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[ri(0, a.length - 1)];
const digits = (n) => Array.from({ length: n }, () => ri(0, 9)).join('');
const nz = (n) => ri(1, 9) + digits(n - 1);
const pad = (n, w = 2) => String(n).padStart(w, '0');
// Splits s by sizes and joins with sep. A size of 0 means "the rest".
const chunk = (s, sizes, sep) => {
  const out = [];
  let i = 0;
  for (const z of sizes) { out.push(z ? s.slice(i, i + z) : s.slice(i)); i += z; }
  return out.join(sep);
};

const luhnDigit = (body) => {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let n = +body[body.length - 1 - i];
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return String((10 - (sum % 10)) % 10);
};
const luhnNumber = (prefix, len) => { const b = prefix + digits(len - 1 - prefix.length); return b + luhnDigit(b); };

const PROVINCES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53, 61, 62, 63, 64, 65,
  71, 72, 73, 74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96, 97];
const nik = () => {
  const day = ri(1, 28) + (rnd() < 0.4 ? 40 : 0);
  const year = pad(rnd() < 0.8 ? ri(60, 99) : ri(0, 5));
  return pad(pick(PROVINCES)) + pad(ri(1, 79)) + pad(ri(1, 30)) + pad(day) + pad(ri(1, 12)) + year + pad(ri(1, 9999), 4);
};
const visaMc = () => (rnd() < 0.6 ? luhnNumber('4', 16) : luhnNumber('5' + ri(1, 5), 16));
const phone = () => '08' + ri(1, 9) + digits(rnd() < 0.7 ? 8 : 9);
const intl = () => pick([
  () => `+44 7${digits(3)} ${digits(6)}`,
  () => `+65 ${pick(['8', '9'])}${digits(3)} ${digits(4)}`,
  () => `+1 ${nz(3)} ${nz(3)} ${digits(4)}`,
  () => `+60 1${ri(0, 9)} ${digits(3)} ${digits(4)}`,
])();
const word = () => pick(['budi', 'sari', 'dewi', 'andi', 'rina', 'joko', 'putri', 'dimas', 'maya', 'hendra']);
const email = () => `${word()}${pick(['.', '_', ''])}${pick(['santoso', 'wijaya', 'pratama', 'lestari', 'kusuma'])}${ri(1, 99)}`
  + `@${pick(['gmail.com', 'yahoo.co.id', 'outlook.com', 'kantormaju.co.id', 'student.univ.ac.id'])}`;
const npwp = () => {
  const d = digits(15);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d[8]}-${d.slice(9, 12)}.${d.slice(12)}`;
};

// Placeholders: name -> [type, value]. Negative ones have type null.
const G = {
  nik: () => ['nik', nik()],
  nikSp: () => ['nik', chunk(nik(), [4, 4, 4, 4], ' ')],
  npwp: () => ['nik', npwp()],
  npwp15: () => ['nik', nz(15)],
  card: () => ['card', visaMc()],
  cardG: () => ['card', chunk(visaMc(), [4, 4, 4, 4], ' ')],
  cardD: () => ['card', chunk(visaMc(), [4, 4, 4, 4], '-')],
  amex: () => ['card', luhnNumber(pick(['34', '37']), 15)],
  acct10: () => ['account', nz(10)],
  acct10Sp: () => ['account', chunk(nz(10), [3, 3, 4], ' ')],
  acct10D: () => ['account', chunk(nz(10), [3, 3, 4], '-')],
  acct11: () => ['account', nz(11)],
  acct12: () => ['account', nz(12)],
  acct13: () => ['account', nz(13)],
  acct15: () => ['account', nz(15)],
  acct16: () => ['account', '8' + digits(15)],
  otp4: () => ['otp', digits(4)],
  otp5: () => ['otp', digits(5)],
  otp6: () => ['otp', digits(6)],
  otp8: () => ['otp', digits(8)],
  otpS: () => ['otp', `${digits(3)} ${digits(3)}`],
  otpD: () => ['otp', `${digits(3)}-${digits(3)}`],
  ph: () => ['phone', phone()],
  phD: () => ['phone', chunk(phone().padEnd(12, '0').slice(0, 12), [4, 4, 4], '-')],
  ph62: () => ['phone', '62' + phone().slice(1)],
  phP: () => ['phone', '+62' + phone().slice(1)],
  phPs: () => ['phone', '+62 ' + chunk(phone().slice(1).padEnd(11, '0').slice(0, 11), [3, 4, 4], ' ')],
  phIntl: () => ['phone', intl()],
  email: () => ['email', email()],
  price: () => [null, pick(['Rp 1.250.000', 'Rp1250000', 'Rp 85.000', 'IDR 2,500,000', '$1,299.00', 'Rp. 15.000.000', 'Rp 12.500,-',
    `Rp ${ri(1, 99)}.${pad(ri(0, 999), 3)}.${pad(ri(0, 999), 3)}`])],
  date: () => [null, pick([`${pad(ri(1, 28))}/${pad(ri(1, 12))}/2026`, `${pad(ri(1, 28))}-${pad(ri(1, 12))}-2026`,
    `2026-${pad(ri(1, 12))}-${pad(ri(1, 28))}`, `${pad(ri(1, 28))}.${pad(ri(1, 12))}.2026`])],
  time: () => [null, pick([`${pad(ri(7, 21))}.${pad(ri(0, 59))}`, `${pad(ri(7, 21))}:${pad(ri(0, 59))}`,
    `${pad(ri(7, 21))}.${pad(ri(0, 59))} WIB`, `${pad(ri(7, 21))}${pad(ri(0, 59))}`])],
  inv: () => [null, pick([`INV/2026/${pad(ri(1, 12))}/${pad(ri(1, 9999), 6)}`, `INV-2026${pad(ri(1, 12))}10-${pad(ri(1, 999), 4)}`])],
  resi: () => [null, pick([`JP${digits(10)}`, `JNE 0${digits(12)}`, `JT${digits(12)}`, `SPXID${digits(12)}`, `SiCepat 000${digits(9)}`])],
  pos: () => [null, String(ri(10000, 99999))],
};

function build(template) {
  let text = '';
  const spans = [];
  for (const part of template.split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) { text += part; continue; }
    if (!G[m[1]]) throw new Error(`unknown placeholder ${part}`);
    const [type, value] = G[m[1]]();
    if (type) spans.push({ start: text.length, end: text.length + value.length, type, value });
    text += value;
  }
  return { text, spans };
}

// The first TWICE_COUNT templates (nik, card, account, otp, phone) are used twice with fresh numbers.
const TWICE_COUNT = 81;
const POSITIVE = [
  // nik
  'NIK saya {nik} ya', 'ini ktp ku: {nik}', 'No KTP: {nik}, tolong dicek ya kak', 'Untuk daftar BPJS, NIK {nikSp} dan KK menyusul',
  'Data diri\nNama: Budi Santoso\nNIK: {nik}\nTTL: Surabaya', 'my national ID number (NIK) is {nik}', 'KTP bapak {nik} tolong difotokopi',
  'NPWP saya {npwp}', 'NIK istri {nik}, NIK saya {nik}', '{nik} itu NIK nya Dewi', 'Isi form: NIK {nik} / HP {ph}',
  'pls use this ID for the visa form: KTP {nik}', 'Nomor NPWP perusahaan: {npwp}, mohon dicatat', 'no nik: {nik}',
  // card
  'kartu kredit gue {cardG}, exp 08/28', 'Pakai kartu aku aja: {card}', 'my visa is {cardG} exp 03/29 cvv 123', 'CC: {cardD} a/n Budi',
  '{cardG}', 'nomor kartu debit {card}', 'Mastercard {cardG}', 'pembayaran pake {card} aja ya', 'card number {card}, expiry 11/27',
  'kartu amex {amex}', 'tolong gesek kartu {card} ya, nanti ku ganti', 'This is my credit card: {cardG}', 'No kartu: {card}',
  'debit BNI {card} sudah aktif',
  // account
  'Transfer ke BCA {acct10} a/n Sari Dewi', 'rek mandiri {acct13} an. Pak Joko', 'norek: {acct10}', 'No rekening BRI {acct15}, atas nama Toko Maju',
  'tf ke {acct10} (BNI) ya', 'kirim ke {acct12} jago, nanti kabarin', 'VA BCA {acct16}', 'my account number is {acct10} at BCA',
  'Rek BSI {acct10} a.n. CV Maju Jaya', 'bank transfer details: BCA {acct10}, Sari Dewi', 'pembayaran bisa ke seabank {acct12} ya',
  'Rekening Permata {acct10}\nA/N PT Sinar Abadi', 'Tolong transfer ke {acct13} Mandiri sebesar Rp 500.000', 'no rek ku {acct10}, bca ya',
  'send to BCA {acct10} please', 'BCA {acct10D} atas nama Rina', 'Acc no {acct11} CIMB', '{acct10} BCA a.n Budi Santoso', 'sudah ditransfer ke {acct13} kemarin',
  // otp
  'Kode OTP kamu {otp6}, jangan kasih ke siapa pun', 'JANGAN BERIKAN kode ini ke siapa pun. Kode verifikasi: {otp6}',
  '{otp6} adalah kode OTP Anda. Berlaku 5 menit.', 'Your verification code is {otp6}', 'OTP {otp4} untuk login',
  'PIN baru kamu {otp4}, segera ganti', 'kode wa gue {otpS}, tolong ya', 'G-{otp6} is your Google verification code',
  'Token: {otp8}', 'Use {otp6} as your Grab code', 'Kode verifikasi Tokopedia {otp5}', 'Passcode {otp6}',
  'Pls send me the otp you just got: {otp6}', 'Kode OTP BCA mobile {otp6}. Rahasia, jangan dibagikan', 'jam 14.30 tadi dapat OTP {otp6}',
  'tadi kode nya {otp6} ya', 'one-time passcode {otp6}, expires in 10 minutes',
  'kodenya {otp6} ya, cepetan', 'WhatsApp code {otpD}, do not share', 'jangan dibagi ke siapa pun, {otp6} itu kode rahasia mu',
  // phone
  'Hubungi saya di {ph}', 'wa aku {phD} ya', 'Nomor baru: {ph62}', 'call me on {phPs}', 'Bu Rina {ph} / Pak Joko {ph}',
  '{ph} itu nomor driver nya', 'contact: {phIntl}', 'WA {phP} kak', 'save nomor ku ya {phD}', 'tolong hubungi {ph}, bilang dari Budi',
  'my number: {phPs}', 'No HP: {ph} (WA aktif)', 'pic lapangan: {phD}', 'text me at {phIntl} if you land early',
  // email (once)
  'email gue {email}', 'kirim cv ke {email} ya', 'contact me at {email}', 'cc {email} dan {email}', 'Email kantor: {email}',
  'pls reply to {email}', 'emailnya {email}', 'login pakai {email} ya',
  // mixed (once)
  'Transfer {price} ke BCA {acct10} a/n Sari Dewi', 'Rapat tgl {date} jam {time}, OTP {otp6}', 'NIK {nik}, HP {ph}',
  'Booking {inv} atas nama Budi, hubungi {ph}', 'Total {price}. Rek BRI {acct15}', 'resi {resi} sudah dikirim ke {email}',
  'Kode OTP {otp6} berlaku sampai jam {time}', 'Pembayaran {price} pakai kartu {cardG} ya',
  'Kirim fotokopi KTP ({nik}) ke {email}', 'Ketemu {date}, kabari di {ph}',
  // number first, spaced accounts, transfer ke with a phone, wa.me links, amex, NPWP without dots, code statements
  '{acct10} BCA a/n Sari', '{acct10} a.n Budi', 'BCA {acct10Sp}', 'Kirim ke {ph}', 'Transfer ke BCA {acct10} a/n Sari Dewi {ph}',
  'Klik https://wa.me/{ph62} buat chat', 'chat aja di wa.me/{ph62}', 'amex {amex}', 'NPWP: {npwp15}',
  '{otp6} adalah kode verifikasi Anda', '{otp6} itu kode rahasia', 'G-{otp6} adalah kode Google Anda', 'Kode rahasia kamu {otp6}, simpan baik-baik', 'tahun 2026 pin {otp4}',
];

const NEGATIVE = [
  'Harganya {price} ya, bisa nego dikit', 'Total belanja {price} sudah termasuk ongkir', 'Tolong transfer {price} dulu buat DP',
  'DP nya cuma {price}, sisanya nanti', 'Ketemu tanggal {date} jam {time}', 'Rapat dipindah ke {date} ya', 'Deadline {date}, jangan lupa',
  'Sampai jumpa jam {time} di lobi', 'Nomor invoice {inv}', 'Resi JNE: {resi}', 'Paketmu sudah dikirim, resi {resi}',
  'No resi {resi} tolong dicek di web nya', 'kode pos {pos}', 'alamat: Jl. Mawar No. 12, Surabaya {pos}', 'Kodepos {pos} ya kak',
  'Tahun 2026 targetnya naik 20%', 'Angkatan 2021 kumpul di kafe', 'Beli 12 pcs, kirim 3 box', 'stok tinggal 5000 pcs',
  'Kamar 1204 ya, lantai 12', 'Penerbangan GA 412 mendarat jam {time}', 'Pesawat QZ 7512 delay 1 jam', 'Mobilnya plat L 1234 AB',
  'Plat B 1234 XYZ yang parkir di depan', 'Update ke versi 2.10.4 dulu', 'Android 14 sudah bisa', 'Suhu hari ini 36.5 derajat',
  'IPK ku 3.85 alhamdulillah', 'Jaraknya 12.5 km dari sini', 'Diskon 25% sampai {date}', 'ukuran 2.5 x 1.5 m', 'Berat 12.500 gram',
  'Antrian nomor 128, tunggu sebentar', 'https://shopee.co.id/product/123456789/9876543210',
  'Rp 1.250.000 + Rp 85.000 = Rp 1.335.000', 'tanggal lahir 14-02-1999', 'Meeting zoom jam 09:15 WIB', 'ID order ORD-20261110-00123',
  'Pesanan #20261110001 sedang diproses', 'Struk no. 000123456789 tgl {date}', 'Kode booking ABC123 sudah ku kirim',
  'Kode promo HEMAT50 dapat potongan {price}', 'Gaji bulan ini {price} cair tanggal 25', 'Skor 3-2 buat Persebaya',
  'Lagu ke 14 di album itu bagus', 'Km 12 tol Cipali macet 5 km', 'Jam 1830 ya, jangan telat', 'Berat paket 2.5 kg, ongkir {price}',
  'Rp 12.500,- per porsi', 'Nomor rumah 27B, RT 05 RW 03', 'Kelas 12 IPA 3 jam 07.30', 'udah 3 hari ga bales',
  'Total {price} (3 item x {price})', 'kontrak 2026-2028 ditandatangani', 'Saldo tinggal {price}', 'Aku ada di lantai 3 kamar 305',
  'The invoice total is {price}, due {date}', 'Flight GA 412 lands at {time}', 'Your tracking number is {resi}',
  "Let's meet on {date} at {time}", 'Version 3.2.1 is out, please update', 'It costs $1,299.00 plus tax', 'Order #20261110001 has shipped',
  'Room 1204 on the 12th floor', 'We sold 12,500 units in 2026', 'zip 94107, San Francisco', 'Postal code 10110',
  'Sprint 14 ends on {date}', 'Table for 4 at {time}?', 'Ref INV/2026/11/000123 attached', 'price dropped to IDR 2,500,000',
  'https://example.com/p/4111111111111111', 'kode barang 48213 stok kosong', 'kode produk 1234567 masih ada',
  'Total 125000, pakai kode promo HEMAT', 'harga 150000 dengan kode voucher', 'Ongkir 25000 kode booking ABC', 'Bayar 2500000 via kode QR',
  'Pesanan 123456 sudah dikirim, kode resi menyusul', 'qty 12000 kode barang A1', 'ada 12345 token yg tersisa',
  'Token listrik 1234 5678 9012 3456 7890 sudah masuk', 'Nomor surat 123/456/2026', 'Order ID 1234567890123 sudah dibayar',
  'telp kantor 021 5551234 ext 12', 'OTP expired jam 14.30 tadi', 'Tiket kereta kode 7K2P9 kursi 12A', 'Pin lokasi di Jl. Merdeka 1234',
];

const lines = [];
POSITIVE.forEach((t, i) => { for (let k = 0; k < (i < TWICE_COUNT ? 2 : 1); k++) lines.push(build(t)); });
for (const t of NEGATIVE) lines.push(build(t));

// Seeded shuffle, so positives and negatives are mixed.
for (let i = lines.length - 1; i > 0; i--) { const j = ri(0, i); [lines[i], lines[j]] = [lines[j], lines[i]]; }

for (const { text, spans } of lines) {
  spans.forEach((s, i) => {
    if (text.slice(s.start, s.end) !== s.value) throw new Error(`span mismatch in ${JSON.stringify(text)}`);
    if (i && s.start < spans[i - 1].end) throw new Error(`overlap in ${JSON.stringify(text)}`);
  });
}
const out = lines.map(({ text, spans }) => JSON.stringify({ text, spans: spans.map(({ start, end, type }) => ({ start, end, type })) }));
fs.writeFileSync(path.join(__dirname, 'dev.jsonl'), out.join('\n') + '\n');
const count = {};
for (const l of lines) for (const s of l.spans) count[s.type] = (count[s.type] || 0) + 1;
console.log(`${lines.length} lines, ${lines.filter((l) => !l.spans.length).length} negative-only`, count);
