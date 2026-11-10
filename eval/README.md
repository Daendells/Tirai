# Detector evaluation

This folder measures how well the sensitive-number detector in `extension/shared/detect.js` works.

## What is measured

The detector looks for six types of sensitive text in chat messages: Indonesian ID numbers (nik), bank cards (card), bank accounts (account), one-time codes (otp), phone numbers (phone) and e-mail addresses (email). Each hit becomes a mask.

- Precision is the share of masks that were right.
- Recall is the share of sensitive items that got masked.
- F1 combines the two into one number.

A mask counts as right when it has the same type as a labelled item and covers at least 80% of the labelled span. Each labelled item can be matched by only one mask, and matching goes in order of position (see `score.js`). A mask with no match is a false positive (fp). A labelled item with no match is a miss (fn).

## How the sets were made

Dev set (`dev.jsonl`, 282 lines): written by the detector's author with a seeded generator, `make-dev.js`. It was used to tune the rules, so its scores are expected to be high.

Test set (`test.jsonl`, 200 lines): 200 synthetic messages written by a separate writer who never saw the detector. The writer worked from a brief that listed only the type definitions and the hard-negative categories (ordinary numbers that must not be masked). The generator is `make-test.py`. It was measured once on 2026-11-10 and the detector was not changed afterwards. 76 of the 200 messages have no sensitive item at all.

Run them with `node eval/run.js dev` and `node eval/run.js test`. Results are saved in `results-dev.json` and `results-test.json`.

## Results (2026-11-10)

Dev set

| type | tp | fp | fn | precision % | recall % | F1 % |
|---|---|---|---|---|---|---|
| nik | 33 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| card | 30 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| account | 44 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| otp | 47 | 1 | 0 | 97.9 | 100.0 | 98.9 |
| phone | 39 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| email | 11 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| micro | 204 | 1 | 0 | 99.5 | 100.0 | 99.8 |

Blind test set

| type | tp | fp | fn | precision % | recall % | F1 % |
|---|---|---|---|---|---|---|
| nik | 26 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| card | 25 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| account | 25 | 0 | 1 | 100.0 | 96.2 | 98.0 |
| otp | 29 | 0 | 1 | 100.0 | 96.7 | 98.3 |
| phone | 30 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| email | 12 | 0 | 0 | 100.0 | 100.0 | 100.0 |
| micro | 147 | 0 | 2 | 100.0 | 98.7 | 99.3 |

In practice: on the blind set the detector masked none of the ordinary numbers (prices, quantities, dates, plate numbers and similar) in any message. That includes all 76 messages that contain nothing sensitive. It missed 2 of 149 sensitive items, one bank account and one one-time code.

## Known limits

- Landline numbers are not masked.
- A 4-digit code after the bare word "kode" is not masked.
- Text like "Pin lokasi ... 1234" can be masked by mistake.
- Both sets are small, so a few items move the percentages a lot. The test set is a spot check, not a guarantee.

All numbers in both sets are synthetic. No real person's data is used.
