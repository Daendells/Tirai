(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['detect'] = api;
})(function () {
  // Higher priority first. On overlap the earlier type wins, then the longer span.
  const PRIORITY = ['card', 'nik', 'account', 'otp', 'phone', 'email'];

  // A run of digit groups joined by single separators, not touching a letter, digit or slash.
  const RUN = /(?<![\p{L}\d/])\+?\d+(?:[ .-]\d+){0,31}(?![\p{L}\d/])/gu;
  const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}/g;
  const LINK = /https?:\/\/\S+/gi;
  const CURRENCY = /(?:^|[^a-z])(?:rp|idr|usd)|\$/i;
  const NPWP = /^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/;
  const PHONE_ID = /^(?:\+62|62|0)8[1-9]\d{6,10}$/;
  const PHONE_INTL = /^\+[1-9]\d{7,14}$/;

  const WA_ME = /wa\.me\/(\d{8,15})(?!\d)/gi;

  const BANKS = 'bca|bri|bni|mandiri|bsi|cimb|permata|danamon|btn|ocbc|maybank|jago|seabank|jenius|blu';
  const KW_NIK = /\b(?:nik|ktp)\b/i;
  const KW_NPWP = /\bnpwp\b/i;
  const KW_CARD = /\b(?:kartu|amex|card|cc|visa|mastercard|debit|kredit|credit)\b/i;
  const KW_ACCOUNT = new RegExp(String.raw`\b(?:(?:no\.? ?)?rek(?:ening)?|a\/n|acc|account|va|(?:(?:di)?transfer|tf|kirim) ke|${BANKS})\b`, 'i');
  // A number shaped like a mobile phone is an account only with a keyword right before it.
  // "transfer ke" and "kirim ke" are not enough, and a/n counts only when it directly precedes the number.
  const ACCOUNT_BEFORE_MOBILE = new RegExp(String.raw`(?:\b(?:(?:no\.? ?)?rek(?:ening)?|acc|account|va|${BANKS})\b[^\d]{0,14}|(?:\ba\/n|\ba\.n|\ban\.|atas nama)\s{0,2})$`, 'i');
  const ACCOUNT_AFTER = new RegExp(String.raw`(?:\b(?:a\/n|a\.n|atas nama|${BANKS})\b|\ban\.)`, 'i');
  const OWNER_AFTER = /^\s{0,2}(?:a\/n|a\.n|an\.|atas nama)/i;
  const KW_OTP = /\b(?:(?:otp|kode|code)(?:nya)?|verifikasi|verification|token|pin|passcode)\b/i;
  const KW_OTP4 = /\b(?:otp(?:nya)?|pin|verifikasi|verification|token|passcode)\b/i;
  // After the number only strong words count, or a weak one in a statement like "482913 adalah kode ...".
  const OTP_AFTER = /\b(?:otp(?:nya)?|verifikasi|verification|passcode)\b/i;
  const CODE_STATEMENT = /^\s+(?:adalah|itu|is|as)\s+(?:(?:your|anda|kamu|the)\s+)?(?:[a-z]+\s+)?(?:kode|code|pin|token)\b(?!\s+(?:promo|voucher|kupon|coupon|booking|barang|produk|product|item|pesanan|order|referral|resi|qr|pos))/i;
  const NOT_OTP = /(?:kode ?(?:pos|barang|produk|item|promo|voucher|kupon|booking|pesanan|referral|resi|qr)|postal code|zip(?: ?code)?|(?:product|item|promo|voucher|coupon|booking|order|referral) code)[^\d]{0,15}$/i;

  const PROVINCES = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 31, 32, 33, 34, 35, 36, 51, 52, 53,
    61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 76, 81, 82, 91, 92, 93, 94, 95, 96, 97]);

  const luhn = (digits) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let n = digits.charCodeAt(digits.length - 1 - i) - 48;
      if (n < 0 || n > 9) return false;
      if (i % 2) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return digits.length > 0 && sum % 10 === 0;
  };

  const isNik = (digits) => {
    if (!/^\d{16}$/.test(digits)) return false;
    const day = +digits.slice(6, 8);
    const month = +digits.slice(8, 10);
    return PROVINCES.has(+digits.slice(0, 2)) && (day >= 1 && day <= 31 || day >= 41 && day <= 71)
      && month >= 1 && month <= 12 && digits.slice(12) !== '0000';
  };

  const enabledOf = (enabled) => {
    if (Array.isArray(enabled)) return (t) => enabled.includes(t);
    if (enabled && typeof enabled === 'object') return (t) => Boolean(enabled[t]);
    return () => false;
  };

  // Scratch space for the group boundaries of one run (at most 32 groups).
  const gs = new Int32Array(32);
  const ge = new Int32Array(32);

  function detect(text, enabled) {
    const on = enabledOf(enabled);
    const found = [];
    if (typeof text !== 'string' || !text) return found;

    if (on('nik') || on('card') || on('account') || on('otp') || on('phone')) {
      const urls = [];
      if (text.includes('http')) for (const m of text.matchAll(LINK)) urls.push(m.index, m.index + m[0].length);
      let u = 0;
      let floor = 0; // keywords only count after the previous number, so each keyword belongs to the nearest number
      let ng = 0;
      const back = (at, n) => text.slice(at - n > floor ? at - n : floor, at);

      // Type of digit groups a..b (inclusive) of the current run, or null.
      const classify = (a, b, plus) => {
        let n = 0;
        for (let g = a; g <= b; g++) n += ge[g] - gs[g];
        if (n < 4 || n > 19) return null;
        const start = gs[a];
        const end = ge[b];
        const groups = b - a + 1;
        const digits = text.slice(start, end).replace(/\D/g, '');
        // Account groups join with "-", or with single spaces when every group has 3 or 4 digits.
        const joined = () => {
          let spaced = false;
          for (let g = a; g < b; g++) {
            const c = text[ge[g]];
            if (c === ' ') spaced = true; else if (c !== '-') return false;
          }
          for (let g = a; spaced && g <= b; g++) if (ge[g] - gs[g] < 3 || ge[g] - gs[g] > 4) return false;
          return true;
        };
        const num = plus ? '+' + digits : digits;
        const mobile = PHONE_ID.test(num);
        // Text after the number, up to the next digit.
        const after = (k) => text.slice(end, end + k).split(/\d/, 1)[0];

        if (n === 15 && groups === 6 && on('nik') && NPWP.test(text.slice(start, end))) return 'nik';
        if (groups === 1 && (n === 15 || n === 16) && on('nik') && KW_NPWP.test(back(start, 30))) return 'nik';
        const nikLike = n === 16 && on('nik') && isNik(digits);
        if (nikLike && KW_NIK.test(back(start, 30))) return 'nik';

        if (on('card') && n >= 13 && luhn(digits) && digits.charCodeAt(0) >= 50 && digits.charCodeAt(0) <= 54
          && ((groups === 4 && n === 16 && ge[a] - gs[a] === 4 && ge[a + 1] - gs[a + 1] === 4
              && ge[a + 2] - gs[a + 2] === 4)
            || KW_CARD.test(back(start, 40)) || KW_CARD.test(after(40))
            || (n === 16 && (digits[0] === '4' || digits[0] === '5')))) return 'card';

        if (nikLike) return 'nik';

        if (on('account') && n >= 8 && n <= 16 && joined()) {
          const near = (mobile ? ACCOUNT_BEFORE_MOBILE : KW_ACCOUNT).test(back(start, 40));
          if (near || (n >= 10 && (mobile ? OWNER_AFTER : ACCOUNT_AFTER).test(after(25)))) return 'account';
        }

        if (on('otp') && n <= 8) {
          const shape = groups === 1 || (groups === 2 && (text[ge[a]] === ' ' || text[ge[a]] === '-')
            && ge[a] - gs[a] >= 3 && ge[b] - gs[b] >= 3);
          const crowded = (a > 0 && ge[a - 1] - gs[a - 1] >= 3) || (b + 1 < ng && ge[b + 1] - gs[b + 1] >= 3);
          if (shape && !crowded) {
            const pre = back(start, 60);
            const kw = n === 4 ? KW_OTP4 : KW_OTP;
            const post = after(30);
            if ((kw.test(pre) && !NOT_OTP.test(pre)) || OTP_AFTER.test(post) || (n >= 5 && CODE_STATEMENT.test(post))) return 'otp';
          }
        }

        if (on('phone')) {
          if (mobile || PHONE_INTL.test(num)) return 'phone';
        }
        return null;
      };

      let prevEnd = 0;
      for (const run of text.matchAll(RUN)) {
        const base = run.index;
        const s = run[0];
        const from = prevEnd;
        prevEnd = base + s.length;
        while (u < urls.length && urls[u + 1] <= base) u += 2;
        if (u < urls.length && urls[u] <= base) continue;
        if (CURRENCY.test(text.slice(base > 4 ? base - 4 : 0, base))) continue;

        let n = 0;
        let i = s[0] === '+' ? 1 : 0;
        while (i < s.length) {
          gs[n] = base + i;
          while (i < s.length && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) i++;
          ge[n++] = base + i;
          i++;
        }
        ng = n;
        for (let a = 0; a < n;) {
          floor = a === 0 ? from : ge[a - 1];
          let type = null;
          let b = Math.min(n - 1, a + 5);
          for (; b >= a; b--) if ((type = classify(a, b, a === 0 && s[0] === '+'))) break;
          if (type) { found.push({ start: a === 0 ? base : gs[a], end: ge[b], type }); a = b + 1; } else a++;
        }
      }
    }

    // Links are skipped above, except the number in a wa.me link.
    if (on('phone') && /wa\.me\//i.test(text)) {
      for (const m of text.matchAll(WA_ME)) {
        if (PHONE_ID.test(m[1]) || PHONE_INTL.test('+' + m[1])) {
          found.push({ start: m.index + m[0].length - m[1].length, end: m.index + m[0].length, type: 'phone' });
        }
      }
    }

    if (on('email') && text.includes('@')) {
      for (const m of text.matchAll(EMAIL)) found.push({ start: m.index, end: m.index + m[0].length, type: 'email' });
    }
    return resolve(found);
  }

  const better = (a, b) => {
    const pa = PRIORITY.indexOf(a.type);
    const pb = PRIORITY.indexOf(b.type);
    return pa !== pb ? pa < pb : a.end - a.start > b.end - b.start;
  };

  // Numbers come out sorted and disjoint, so overlaps only involve e-mail addresses.
  function resolve(found) {
    found.sort((a, b) => a.start - b.start);
    const out = [];
    for (const m of found) {
      const last = out[out.length - 1];
      if (!last || m.start >= last.end) out.push(m);
      else if (better(m, last)) out[out.length - 1] = m;
    }
    return out;
  }

  return { detect, luhn, isNik };
});
