// Usage: node eval/run.js <dev|test> [--check] [--errors]
const fs = require('node:fs');
const path = require('node:path');
const { TYPES, DEFAULTS } = require('../extension/shared/settings.js');
const { detect } = require('../extension/shared/detect.js');
const { score } = require('./score.js');

const [set, ...flags] = process.argv.slice(2);
if (set !== 'dev' && set !== 'test') {
  console.error('Usage: node eval/run.js <dev|test> [--check] [--errors]');
  process.exit(2);
}
const file = path.join(__dirname, `${set}.jsonl`);
if (!fs.existsSync(file)) {
  console.error(`Missing ${file}`);
  process.exit(2);
}

const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const allOn = Object.fromEntries(TYPES.map((t) => [t, true]));
const gold = [];
const pred = [];
const errors = [];
rows.forEach((row, line) => {
  // Offset each line so spans from different lines never meet in the scorer.
  const base = line * 1e6;
  const shift = (s) => ({ start: s.start + base, end: s.end + base, type: s.type });
  const g = row.spans.map(shift);
  const p = detect(row.text, allOn).map(shift);
  gold.push(...g);
  pred.push(...p);
  if (flags.includes('--errors')) {
    const r = score(g, p);
    if (r.micro.fp || r.micro.fn) {
      const show = (a) => a.map((s) => `${s.type}:${row.text.slice(s.start - base, s.end - base)}`).join(' | ');
      errors.push(`#${line + 1} ${JSON.stringify(row.text)}\n   gold ${show(g)}\n   pred ${show(p)}`);
    }
  }
});

const result = score(gold, pred);
const pct = (x) => (x * 100).toFixed(1).padStart(6);
const row = (name, m) => `${name.padEnd(8)} ${String(m.tp).padStart(4)} ${String(m.fp).padStart(4)} ${String(m.fn).padStart(4)} ${pct(m.precision)} ${pct(m.recall)} ${pct(m.f1)}`;
console.log(`${set}: ${rows.length} lines\n${'type'.padEnd(8)} ${'tp'.padStart(4)} ${'fp'.padStart(4)} ${'fn'.padStart(4)}   prec%    rec%     f1%`);
for (const t of TYPES) if (result.perType[t]) console.log(row(t, result.perType[t]));
console.log(row('micro', result.micro));
if (errors.length) console.log(`\n${errors.join('\n')}`);

fs.writeFileSync(path.join(__dirname, `results-${set}.json`), `${JSON.stringify(result, null, 2)}\n`);

if (flags.includes('--check')) {
  const bad = TYPES.filter((t) => DEFAULTS.sensitive.types[t]).filter((t) => {
    const m = result.perType[t];
    return !m || m.precision < 0.95 || m.recall < 0.9;
  });
  if (bad.length) {
    console.error(`\nCheck failed (need precision >= 0.95 and recall >= 0.90): ${bad.join(', ')}`);
    process.exit(1);
  }
  console.log('\nCheck passed.');
}
