import random, re, json, collections
R = random.Random(20261110)
D = lambda n: ''.join(R.choice('0123456789') for _ in range(n))
D1 = lambda n: str(R.randint(1, 9)) + D(n - 1)


def grp(s, sizes, sep):
    out, i = [], 0
    for z in sizes:
        out.append(s[i:i + z])
        i += z
    return sep.join(out)


NAMES = ['Budi', 'Sari', 'Rina', 'Dimas', 'Agus', 'Putri', 'Hendra', 'Nadia', 'Fajar', 'Wulan', 'Eko', 'Citra']
LAST = ['Santoso', 'Wijaya', 'Pratama', 'Lestari', 'Kusuma', 'Hakim', 'Saputra', 'Nugroho']


def name():
    return R.choice(NAMES) + ' ' + R.choice(LAST)


def nik():
    prov = R.choice([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53, 61, 62, 63, 64, 65,
                     71, 72, 73, 74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96, 97])
    day = R.randint(1, 28) + (40 if R.random() < .5 else 0)
    yy = R.randint(60, 105) % 100
    s = f"{prov}{R.randint(1,30):02d}{R.randint(1,20):02d}{day:02d}{R.randint(1,12):02d}{yy:02d}{R.randint(1,9999):04d}"
    assert len(s) == 16
    r = R.random()
    if r < .4:
        return s
    if r < .85:
        return grp(s, [4, 4, 4, 4], ' ')
    return grp(s, [6, 6, 4], ' ')


def npwp():
    s = D(15)
    return f"{s[:2]}.{s[2:5]}.{s[5:8]}.{s[8]}-{s[9:12]}.{s[12:]}"


def luhn(p, n):
    b = p + D(n - len(p) - 1)
    t = 0
    for i, c in enumerate(reversed(b)):
        d = int(c)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        t += d
    return b + str((10 - t % 10) % 10)


def card():
    k = R.choice(['visa', 'visa', 'mc', 'mc', 'jcb', 'amex', 'gpn'])
    if k == 'amex':
        s = luhn(R.choice(['34', '37']), 15)
        return R.choice([s, grp(s, [4, 6, 5], ' ')])
    p = {'visa': '4', 'mc': str(R.randint(51, 55)), 'jcb': '35', 'gpn': '6'}[k]
    s = luhn(p, 16)
    return R.choice([s, grp(s, [4] * 4, ' '), grp(s, [4] * 4, '-'), grp(s, [4] * 4, ' ')])


def acc():
    n, g = R.choice([(10, [3, 3, 4]), (13, [4, 4, 5]), (15, [4, 4, 4, 3]), (10, [10]), (10, [10]), (16, [16])])
    s = D1(n)
    r = R.random()
    if len(g) > 1 and r < .35:
        return grp(s, g, '-')
    if len(g) > 1 and r < .45:
        return grp(s, g, ' ')
    return s


def otp():
    n = R.choice([4, 6, 6, 6, 6, 5, 8])
    s = D(n)
    if n == 6 and R.random() < .25:
        return s[:3] + ' ' + s[3:]
    return s


def phone():
    pre = R.choice(['811', '812', '813', '821', '822', '852', '857', '878', '895', '896', '899', '838'])
    rest = D(R.choice([7, 8]))
    n = pre + rest
    r = R.random()
    if r < .2:
        return '0' + n
    if r < .35:
        return '0' + pre + '-' + rest[:4] + '-' + rest[4:]
    if r < .5:
        return '0' + pre + ' ' + rest[:4] + ' ' + rest[4:]
    if r < .65:
        return '+62 ' + pre + ' ' + rest[:4] + ' ' + rest[4:]
    if r < .75:
        return '+62' + n
    if r < .85:
        return '62' + n
    if r < .92:
        return '+' + R.choice(['44 7', '1 4', '61 4', '65 8', '60 12', '81 90']) + D(2) + ' ' + D(3) + ' ' + D(4)
    return '+62-' + pre + '-' + rest[:4] + '-' + rest[4:]


def email():
    n = R.choice(NAMES).lower()
    l = R.choice(LAST).lower()
    u = R.choice([f"{n}.{l}", f"{n}{R.randint(1,99)}", f"{n}_{l}", f"{n[0]}{l}{R.randint(80,99)}"])
    return u + '@' + R.choice(['gmail.com', 'gmail.com', 'yahoo.co.id', 'outlook.com', 'kantorku.co.id', 'acme-corp.com',
                               'mail.ugm.ac.id'])


def price():
    return R.choice([f"Rp {R.randint(1,99)}.{D(3)}.{D(3)}", f"Rp{R.randint(10,900)*1000}", f"Rp {R.randint(10,990)}.{D(3)}",
                     f"{R.randint(10,990)}rb", f"IDR {R.randint(10,990)},{D(3)}", f"${R.randint(2,300)}.{D(2)}"])


def price_en():
    return R.choice([f"${R.randint(2,900)}.{D(2)}", f"IDR {R.randint(10,990)},{D(3)}", f"${R.randint(1,9)},{D(3)}.00"])


def bank():
    return R.choice(['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'CIMB', 'Permata'])


def ctx():
    return dict(nik='[[nik:%s]]' % nik(), card='[[card:%s]]' % card(), acc='[[account:%s]]' % acc(),
                otp='[[otp:%s]]' % otp(), phone='[[phone:%s]]' % phone(), email='[[email:%s]]' % email(),
                price=price(), name=name(), bank=bank(), pe=price_en(), n=R.choice(NAMES),
                d=f"{R.randint(1,28):02d}/{R.randint(1,12):02d}/2026",
                app=R.choice(['Gojek', 'Tokopedia', 'Shopee', 'Grab', 'BCA mobile', 'Dana', 'OVO', 'Traveloka']))


P = {}
P['nik'] = (["NIK gue {nik} ya, buat daftar BPJS", "ini KTP aku bro, NIK nya {nik}, tolong diproses",
             "data buat KK: nama {name}, NIK {nik}", "NIK: {nik}\na/n {name}", "yg buat ngurus SIM nik nya {nik} dong",
             "eh NIK ortu kamu berapa? --> {nik} nih", "tolong cek status vaksin NIK {nik} ya kak",
             "KTP ku {nik} tgl terbit {d}", "nik istri {nik}, nik saya udah dikirim td",
             "buat PPDB anak, NIK {nik} sama no KK nya blm ada", "kirim ke pajak ya, NPWP {nik}",
             "no ktp: {nik} mohon dicek kak", "isi form dulu: nama {name} / NIK {nik} / {bank}",
             "NIK nya salah ya? yg bener {nik}"],
            ["My national ID (NIK) is {nik}, please update the form", "Use NIK {nik} for the visa application",
             "Employee record: {name}, NIK {nik}, joined {d}"])
P['nikphone'] = (["NIK {nik}, wa {phone} ya kak", "data diri: NIK {nik} hp {phone}",
                  "daftar vaksin pake nik {nik} nomor aku {phone} nih"],
                 ["ID number {nik}, call me on {phone}"])
P['card'] = (["kartu kredit gue {card}, exp 08/28 tapi cvv ga usah ya", "nomor kartu {card} a/n {name}",
              "pake kartu ini aja {card} buat bayar {price}", "cc nya {card} dong, aku bayarin dulu",
              "kartu debit GPN {card} kepake buat belanja {price} td", "tolong blokir kartu {card} hilang di grab",
              "no kartu: {card}\nberlaku s/d 11/29", "tf lewat kartu aja ya {card}, total {price}",
              "kartu aku kedebet 2x nih {card} tgl {d}", "ini kartu visa ku {card} tolong didaftarin di {app}"],
             ["My card number is {card}, expires 09/29", "Charge it to {card} please, total {pe}",
              "Lost my Amex {card}, please block it", "Card on file: {card}"])
P['cardotp'] = (["transaksi {pe} pakai kartu {card}, kode OTP {otp} jgn dikasih siapa2",
                 "kartu {card} mau didaftarin, otp nya {otp} apa?", "OTP {otp} buat transaksi kartu {card} di {app}"],
                ["Your OTP {otp} is for card {card}, do not share"])
P['account'] = (["tf ke norek {acc} {bank} a/n {name} ya, {price}", "norek {bank} gue {acc} a/n {name}",
                 "transfer {price} ke rekening {acc} ya kak", "rek {bank}: {acc} an {name}, jgn lupa kasih bukti tf",
                 "udah tf {price} ke {acc} ({bank}) barusan, cek ya", "VA {app} nya {acc}, bayar sebelum {d}",
                 "no rekening buat DP: {acc} {bank}, {price}", "norek lama {acc} udh ga aktif, pake yg ini {acc2}",
                 "mau bayar kost ke {bank} {acc} a/n {name} {price} per bulan",
                 "cicilan masuk ke virtual account {acc} ya",
                 "pls transfer ke {bank} {acc} a/n {name}. nominal {price}",
                 "gaji masuk ke rek {acc} {bank} kan? {price} udh masuk blm", "patungan {price} ke {acc} dong, {bank} kan?"],
                ["Please wire {pe} to account {acc} at {bank}, under {name}", "Bank account: {acc} ({bank}), name {name}",
                 "I transferred {pe} to account number {acc} just now",
                 "Virtual account for the invoice is {acc}, pay before {d}"])
P['accphone'] = (["tf {price} ke norek {acc} {bank} a/n {name}, konfirmasi wa {phone}",
                  "rek {bank} {acc}, kalau ada masalah hub {phone}"],
                 ["Pay to account {acc}, questions? call {phone}"])
P['otp'] = (["Kode OTP kamu {otp}, jangan kasih ke siapa pun", "{otp} adalah kode verifikasi Anda. Jangan bagikan kode ini.",
             "kode verifikasi {app}: {otp}. berlaku 5 menit", "bro tolong kirim kode yg masuk td, {otp}",
             "PIN ATM baru gue {otp} jgn bilang2 ya", "Kode login {app} {otp}, berlaku 3 menit. Waspada penipuan!",
             "RAHASIA! Kode OTP {otp} utk login {app}. JANGAN BERIKAN kode kpd siapapun", "nih otp nya {otp} cepet masukin",
             "jgn kasih tau siapa2, token verifikasi {otp}", "{otp} is your {app} code",
             "kak ini kode nya ya {otp}, sebelum jam 14.30", "OTP buat reset password: {otp}",
             "token mbanking {otp} jgn disebar, ini utk transaksi {price}", "kode konfirmasi {otp}, abis ini langsung masuk ya",
             "PIN kartu ku {otp} ya, jgn dishare"],
            ["Your verification code is {otp}. Do not share it with anyone.",
             "{otp} is your {app} login code, valid for 10 minutes", "Use code {otp} to confirm your sign-in",
             "Hey the 2FA code just came in: {otp}", "Your PIN is {otp}"])
P['phone'] = (["wa gue {phone} ya", "nomor hp ku {phone}, save dong", "hubungi cs di {phone} jam 09:00-17:00",
               "telp {phone} a/n {name}, kalo lama bales", "nomor baru nih {phone}, yg lama udah mati",
               "gojek driver nya {phone}, udah di depan", "no wa admin: {phone}",
               "tolong hubungi {name} di {phone} buat konfirmasi pesanan #{ord}", "kontak darurat {phone} (ibu)",
               "bisa telp ke {phone} ga? penting", "hp pembeli {phone}, tolong kirim resi ke dia",
               "kalau gaada kabar telp aja {phone}"],
              ["Call me on {phone}", "My new number is {phone}, please update", "WhatsApp me at {phone} when you land",
               "Contact the driver at {phone}"])
P['emailphone'] = (["email aku {email}, wa {phone}", "kirim cv ke {email} atau wa {phone}", "kontak: {email} / {phone}"],
                   ["Reach me at {email} or {phone}"])
P['email'] = (["email gue {email} ya", "kirim invoicenya ke {email} dong kak", "cv nya udah aku kirim ke {email} cek ya",
               "akun {app} aku daftar pake {email}", "email kantor: {email}", "bales ke {email} aja, wa jarang buka",
               "tolong undang {email} ke grup proyek"],
              ["Send the report to {email}", "My email is {email}, feel free to reach out", "Invite {email} to the meeting"])
P['emailotp'] = (["kode verifikasi dikirim ke {email}: {otp}", "cek inbox {email} ada kode {otp} ga?"],
                 ["Code {otp} was sent to {email}"])


def neg_ctx():
    return dict(price=price(), pe=price_en(),
                d=R.choice([f"{R.randint(1,28):02d}/{R.randint(1,12):02d}/2026", f"{R.randint(1,28):02d}-{R.randint(1,12):02d}-2026",
                            f"{R.randint(1,28)} {R.choice(['Nov','Des','Jan','Mar','Agu'])} 2026"]),
                t=R.choice([f"{R.randint(8,22)}.{R.randint(0,59):02d}", f"{R.randint(8,22):02d}:{R.randint(0,59):02d}"]),
                inv=f"INV/2026/{R.randint(1,12):02d}/{R.randint(1,999999):06d}",
                ordid=f"ORD-2026{R.randint(1,12):02d}{R.randint(1,28):02d}-{D(4)}",
                resi=R.choice([f"JP{D(10)}", f"JNE {D(13)}", f"SPXID{D(10)}", f"JX{D(10)}", f"TKP{D(12)}"]),
                pos=R.choice(['60111', '40115', '12950', '55281', '10110', '80361', '65145']), yr=R.randint(1990, 2030),
                q=R.randint(2, 99), pct=R.randint(5, 90), rm=R.randint(101, 1520), tb=R.randint(1, 40),
                fl=f"{R.choice(['GA','JT','QG','SQ','ID'])} {R.randint(100,999)}",
                plate=f"{R.choice(['L','B','D','AB','N'])} {R.randint(1000,9999)} {R.choice(['AB','XY','KD','ZZ','RN'])}",
                ver=f"v{R.randint(1,5)}.{R.randint(0,12)}.{R.randint(0,20)}", bpjs=D(13),
                nrp=f"{R.choice(['5025','5124','1121'])}{D(6)}", url=f"https://tokopedia.link/p/{D(14)}",
                url2=f"https://shopee.co.id/product/{D(8)}/{D(11)}", km=R.randint(2, 40), kg=R.randint(1, 20))


NEG_ID = ["total belanja {price}, udah termasuk ongkir", "harga di toko {price}, di online {price}? mahal bgt",
          "meeting dipindah ke {d} jam {t} ya", "no invoice {inv}, tolong dicek statusnya",
          "pesanan {ordid} udah dikirim kak", "resi nya {resi}, bisa dilacak di web ekspedisi",
          "alamat: Jl. Mawar 12, Surabaya kode pos {pos}", "aku lahir tahun {yr} lho, kamu?",
          "pesen {q} porsi nasi goreng ya, {price}", "diskon {pct}% buat member, cek app", "aku di kamar {rm}, lantai 7",
          "meja {tb} udah di-booking ya jam {t}", "pesawat {fl} berangkat {t}, jangan telat",
          "plat motor gue {plate}, parkir di basement", "update ke {ver} dulu baru bisa login",
          "no BPJS ku {bpjs}, mau cek faskes", "NRP mahasiswa {nrp}, kelas {tb}", "cek link ini {url}",
          "produknya di sini {url2} stok tinggal {q}", "jam {t} ya, jangan telat. {d} kita ketemu",
          "udh bayar {price} cash tadi, ga usah tf", "ongkirnya {price} doang, resi {resi}",
          "laporan keuangan Q3 naik {pct}% dari tahun lalu", "tagihan listrik bulan ini {price}, jatuh tempo {d}",
          "tiket {fl} {d} jam {t} harga {price}", "barang {kg} kg udah sampe? resi {resi}",
          "jarak ke kantor {km} km, sekitar {q} menit", "pengiriman {ordid}, estimasi tiba {d}",
          "nginep di hotel kamar {rm} sampe {d}", "INV {inv} jatuh tempo {d}, total {price}",
          "kode pos {pos}, rt 03 rw 05 ya", "ibu bayar arisan {price} tiap tanggal {tb}",
          "webinar {d} pk {t}, link zoom nanti dikirim", "versi aplikasi {ver} masih ada bug di halaman {tb}",
          "pesenan {ordid} total {price}, bayar di tempat", "salary naik {pct}% jadi {price}",
          "gue dapet harga promo {price}, hemat {pct}%", "kos baru sebulan {price}, kamar {rm}",
          "tracking {resi} lagi transit di Jakarta", "bonus lembur {price} cair tgl {d}"]
NEG_EN = ["Order {ordid} total {pe}, shipped {d}", "Flight {fl} departs at {t}, gate {tb}",
          "Your invoice {inv} is due {d}, amount {pe}", "Tracking number {resi}, should arrive by {d}",
          "The meeting is on {d} at {t}, room {rm}", "Updated to {ver}, please restart the app",
          "Table {tb} for {q} at {t}, see you there", "Revenue grew {pct}% in {yr}, up to {pe}", "Check this out {url2}",
          "Parcel {resi} weighs {kg} kg, ETA {d}", "Plate number {plate}, parking level {tb}",
          "Sale ends {d}, everything {pct}% off, from {pe}"]

out = []


def build(pool, count):
    ids, ens = P[pool]
    for i in range(count):
        t = R.choice(ens if i % 5 == 4 else ids)
        c = ctx()
        if pool == 'nik' and R.random() < .12:
            c['nik'] = '[[nik:%s]]' % npwp()
        c['acc2'] = '[[account:%s]]' % acc()
        c['ord'] = D(6)
        out.append(t.format(**c))


build('nik', 18); build('nikphone', 8); build('card', 19); build('cardotp', 6)
build('account', 21); build('accphone', 4); build('otp', 22); build('phone', 14)
build('emailphone', 4); build('email', 6); build('emailotp', 2)
for i in range(200 - len(out)):
    out.append(R.choice(NEG_EN if i % 5 == 4 else NEG_ID).format(**neg_ctx()))
R.shuffle(out)

M = re.compile(r'\[\[(\w+):(.*?)\]\]')
u16 = lambda s: len(s.encode('utf-16-le')) // 2
lines = []
for m in out:
    text, spans, last = '', [], 0
    for mt in M.finditer(m):
        text += m[last:mt.start()]
        s = u16(text)
        text += mt.group(2)
        spans.append({"start": s, "end": s + u16(mt.group(2)), "type": mt.group(1), "_v": mt.group(2)})
        last = mt.end()
    text += m[last:]
    lines.append((text, spans))

cnt = collections.Counter()
empty = 0
TYPES = {'nik', 'card', 'account', 'otp', 'phone', 'email'}
with open('test.jsonl', 'w', encoding='utf-8', newline='\n') as f:
    for text, spans in lines:
        u = text.encode('utf-16-le')
        prev = 0
        for s in sorted(spans, key=lambda x: x['start']):
            assert s['type'] in TYPES and s['start'] >= prev and s['end'] <= len(u) // 2
            assert u[s['start'] * 2:s['end'] * 2].decode('utf-16-le') == s['_v']
            assert '[[' not in text
            prev = s['end']
            cnt[s['type']] += 1
            del s['_v']
        empty += not spans
        f.write(json.dumps({"text": text, "spans": spans}, ensure_ascii=False) + '\n')
assert len(lines) == 200
assert all(cnt[t] >= 25 for t in ['nik', 'card', 'account', 'otp', 'phone']) and cnt['email'] >= 10 and empty >= 70, (cnt, empty)
print(dict(cnt), empty)
with open('README.md', 'w') as f:
    f.write("# Blind test set\n\n200 lines in test.jsonl, built by make.py (synthetic numbers).\n\nSpans per type: "
            + ", ".join(f"{k} {cnt[k]}" for k in sorted(cnt)) + f"\n\nEmpty-span lines: {empty}\n")
