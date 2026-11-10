// Span scoring: a prediction matches a gold span of the same type when it
// overlaps at least 80% of the gold length. Greedy, one-to-one, by start.
const MIN_OVERLAP = 0.8;

const ratio = (a, b) => (b ? a / b : 0);
const prf = (tp, fp, fn) => {
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  return { tp, fp, fn, precision, recall, f1: ratio(2 * precision * recall, precision + recall) };
};

function score(gold, pred) {
  const byStart = (a, b) => a.start - b.start;
  const g = [...gold].sort(byStart);
  const p = [...pred].sort(byStart);
  const used = new Array(p.length).fill(false);
  const counts = {};
  const bump = (type, key) => {
    (counts[type] = counts[type] || { tp: 0, fp: 0, fn: 0 })[key]++;
  };

  for (const gs of g) {
    let hit = -1;
    for (let i = 0; i < p.length; i++) {
      if (used[i] || p[i].type !== gs.type) continue;
      if (p[i].start >= gs.end) break;
      const overlap = Math.min(gs.end, p[i].end) - Math.max(gs.start, p[i].start);
      if (overlap >= MIN_OVERLAP * (gs.end - gs.start)) { hit = i; break; }
    }
    if (hit < 0) bump(gs.type, 'fn');
    else { used[hit] = true; bump(gs.type, 'tp'); }
  }
  p.forEach((ps, i) => { if (!used[i]) bump(ps.type, 'fp'); });

  const perType = {};
  const total = { tp: 0, fp: 0, fn: 0 };
  for (const [type, c] of Object.entries(counts)) {
    perType[type] = prf(c.tp, c.fp, c.fn);
    total.tp += c.tp; total.fp += c.fp; total.fn += c.fn;
  }
  return { perType, micro: prf(total.tp, total.fp, total.fn) };
}

module.exports = { score };
