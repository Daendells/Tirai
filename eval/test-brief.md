This is the brief the test set's author worked from. Local folder paths were shortened; nothing else was changed.

# Brief: blind test set for a sensitive-number detector

You are writing a **blind test set**: 200 realistic chat messages with labelled sensitive items. They will measure a
detector you must never see. Do not open anything inside the code repo (the code
repo). Work only in the writer's own folder.

## Output

`test.jsonl` in the writer's own folder: exactly 200 lines. Each line is one JSON
object:

```json
{"text": "Kode OTP kamu 482913, jangan kasih ke siapa pun", "spans": [{"start": 14, "end": 20, "type": "otp"}]}
```

- `start`/`end` are JavaScript string indices (UTF-16 code units) into `text`. `end` is exclusive.
- A span covers exactly the characters of the number or address, including separators inside it (spaces, dots or
  dashes between digit groups). It excludes surrounding words and punctuation.
- `spans` is `[]` when the message has nothing sensitive.
- **Do not compute offsets by hand.** Write a small Python script (`make.py` in the same folder) that builds the
  messages from templates with inline markers such as `[[otp:482913]]`, strips the markers, computes the offsets, and
  writes the file. Then verify that every span's text equals the marked value. Keep `make.py` next to the output.

## The six types (label exactly these, nothing else)

| type | what counts |
|---|---|
| `nik` | Indonesian ID number (NIK): 16 digits, written plain or in groups (`3578 0145 1299 0003`). Also an NPWP written in its dotted format `01.234.567.8-901.000`. |
| `card` | Payment card number: 13 to 19 digits, often grouped `4111 1111 1111 1111` or with dashes. Visa, Mastercard, JCB, Amex, GPN debit. |
| `account` | Bank account or virtual account number, when the message is about a bank account, a transfer or a payment to an account (8 to 16 digits, sometimes with dashes or spaces). |
| `otp` | One-time code, login code, verification code, PIN or token (4 to 8 digits). This includes forwarded bank or app messages. |
| `phone` | Phone numbers: Indonesian mobile (`0812...`, `+62 812...`, `62812...`, with or without spaces or dashes) and international numbers that start with `+`. |
| `email` | Email addresses. |

## Synthetic numbers only

Never use real people's numbers. Generate the numbers in `make.py`:

- **NIK:** two-digit province code from {11–19, 21, 31–36, 51–53, 61–65, 71–76, 81, 82, 91–97}, then 2 digits city and
  2 digits district. Then the birth date as DDMMYY, where women add 40 to the day. Then a 4-digit serial that is not
  0000.
- **Cards:** must pass the Luhn check. Use plausible prefixes: 4 Visa, 51–55 Mastercard, 35 JCB, 34/37 Amex, 6 GPN.
- **Accounts:** random digits of realistic lengths: BCA 10, Mandiri 13, BRI 15, BNI 10, BSI 10, virtual accounts 16.
- **OTP:** random 4–8 digits.
- **Phones:** random, valid-looking.
- **Emails:** made-up names at gmail.com, yahoo.co.id, company domains.

## Mix (required)

- **Language:** casual Indonesian WhatsApp style (with slang such as "tf", "norek", "a/n", "nih", "ya", "dong") for
  about 80% of messages, and English for about 20%.
- **Positives** (spans may share a message):
  - at least 25 each for `nik`, `card`, `account`, `otp` and `phone`;
  - at least 10 for `email`.
- **Hard-negative-only messages:** at least 70, with `spans: []`. Draw them from these categories:
  - prices: `Rp 1.250.000`, `Rp1250000`, `IDR 450,000`, `$12.99`;
  - dates: `10/11/2026`, `10-11-2026`, `10 Nov 2026`;
  - times: `14.30`, `09:15`;
  - order and invoice IDs: `INV/2026/11/000123`, `ORD-20261110-8841`;
  - courier tracking numbers: `JP1234567890`, `JNE 0123456789012`, `SPXID0123456789`;
  - postal codes: `kode pos 60111`;
  - years, quantities and percentages;
  - room and table numbers;
  - flight numbers `GA 412`;
  - licence plates `L 1234 AB`;
  - version numbers `v2.3.1`;
  - BPJS or student numbers without bank context;
  - long numbers inside URLs.
- **Tricky positives:**
  - OTP split as `482 913`;
  - accounts with dashes `123-456-7890`;
  - phones with spaces;
  - cards with dashes;
  - an OTP that comes after the code, as in "482913 adalah kode verifikasi Anda".
- **Mixed messages:** some messages hold both a positive and a hard negative (for example a transfer amount next to an
  account number).

## Finish

Validate the file:
- 200 lines, all valid JSON;
- every span inside its text;
- spans do not overlap;
- every `type` is one of the six.

Print counts per type and the number of empty-span lines. Write the counts to `README.md` in the writer's own folder. Report back with the
counts, nothing else.
