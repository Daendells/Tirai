(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['masker'] = api;
})(function () {
  const INLINE = new Set(['SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'U', 'S', 'SMALL', 'CODE', 'MARK', 'SUB', 'SUP',
    'BDI', 'BDO', 'Q', 'ABBR', 'TIME', 'IMG', 'BR']);
  // What the user types, and our own curtain, are never masked.
  const SKIP = 'input,textarea,script,style,noscript,tirai-curtain,'
    + '[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]';
  const SHOW = 1 | 4; // NodeFilter.SHOW_ELEMENT | SHOW_TEXT
  const ACCEPT = 1, REJECT = 2, SKIP_NODE = 3;
  const IDLE_TIMEOUT_MS = 200;
  const SYNC_MS = 5;
  const HOVER_THROTTLE_MS = 50;
  const MIN_UNITS = 25;
  const EXPAND_STEP = 500;

  const blockOf = (el) => { while (el && INLINE.has(el.tagName)) el = el.parentElement; return el; };
  const same = (a, b) => a.startContainer === b.startContainer && a.startOffset === b.startOffset
    && a.endContainer === b.endContainer && a.endOffset === b.endOffset;
  const budget = (ms) => { const end = performance.now() + ms; return { timeRemaining: () => end - performance.now() }; };

  // Elements below a segment's own block start segments of their own, so they are not part of its text.
  const segmentFilter = (n) => (n.nodeType === 3 ? ACCEPT : INLINE.has(n.tagName) && !n.matches(SKIP) ? SKIP_NODE : REJECT);
  const treeFilter = (n) => (n.nodeType === 3 ? ACCEPT : n.matches(SKIP) ? REJECT : SKIP_NODE);

  function createMasker({ doc = document, getRoot, highlightName = 'tirai-mask', revealDelayMs = 400, onChange } = {}) {
    const win = doc.defaultView;
    const detect = (text, types) => globalThis.Tirai.detect.detect(text, types);

    let running = false, root = null, highlight = null, types = [], typesKey = '';
    let ctl = null, idle = 0, reported = 0, sweepNeeded = false;
    let candidate = null, candidateTimer = 0, moveTimer = 0, lastMove = 0, px = 0, py = 0;
    const records = new Map(); // segment element -> its masked ranges (ranges that are shown or revealed)
    const queue = new Set();   // segment elements to scan again
    const trees = [];          // walkers over added subtrees, expanded a few hundred text nodes at a time
    const revealed = new Set();

    const observer = new win.MutationObserver(onMutations);

    function notify() {
      const n = highlight ? highlight.size : 0;
      if (onChange && n !== reported) { reported = n; onChange(); }
    }

    function drop(range) {
      highlight.delete(range);
      revealed.delete(range);
      if (candidate === range) { clearTimeout(candidateTimer); candidate = null; }
    }

    function clearAll() {
      queue.clear();
      trees.length = 0;
      sweepNeeded = false;
      records.clear();
      revealed.clear();
      clearTimeout(candidateTimer);
      candidate = null;
      if (highlight) highlight.clear();
    }

    function queueTree(node) {
      if (node.closest(SKIP)) return;
      trees.push(doc.createTreeWalker(node, SHOW, treeFilter));
    }

    function expand(walker) {
      let n = 0, last = null, node = null;
      while (n++ < EXPAND_STEP && (node = walker.nextNode())) {
        const p = node.parentElement;
        if (p === last || !/\S/.test(node.data)) continue;
        last = p;
        const seg = blockOf(p);
        if (seg) queue.add(seg);
      }
      if (!node) trees.shift();
    }

    function rangesFor(seg) {
      const nodes = []; // node, offset of its first character, ...
      let text = '';
      const w = doc.createTreeWalker(seg, SHOW, segmentFilter);
      for (let n; (n = w.nextNode());) { nodes.push(n, text.length); text += n.data; }
      const out = [];
      let s = 0, e = 0;
      for (const m of detect(text, types)) {
        while (s + 2 < nodes.length && nodes[s + 3] <= m.start) s += 2;
        while (e + 2 < nodes.length && nodes[e + 3] <= m.end - 1) e += 2;
        const r = doc.createRange();
        r.setStart(nodes[s], m.start - nodes[s + 1]);
        r.setEnd(nodes[e], m.end - nodes[e + 1]);
        out.push(r);
      }
      return out;
    }

    // Detect again in one segment. Ranges that did not change keep their identity, so a revealed one stays revealed.
    function processSegment(seg) {
      const old = records.get(seg) || [];
      let next = [];
      if (types.length && seg.isConnected && !seg.closest(SKIP)) next = rangesFor(seg).map((r) => old.find((o) => same(o, r)) || r);
      for (const r of next) if (!old.includes(r)) highlight.add(r);
      for (const o of old) if (!next.includes(o)) drop(o);
      if (next.length) records.set(seg, next); else records.delete(seg);
    }

    function sweep() {
      for (const [seg, list] of records) {
        if (seg.isConnected) continue;
        list.forEach(drop);
        records.delete(seg);
      }
    }

    function more() { return trees.length > 0 || queue.size > 0; }

    function pump(deadline, minUnits) {
      let units = 0;
      const ok = () => units++ < minUnits || deadline.timeRemaining() > 0;
      if (sweepNeeded) { sweepNeeded = false; sweep(); }
      while (trees.length && ok()) expand(trees[0]);
      for (const seg of queue) {
        if (!ok()) break;
        queue.delete(seg);
        processSegment(seg);
      }
    }

    function schedule() {
      if (!idle && running) idle = win.requestIdleCallback(onIdle, { timeout: IDLE_TIMEOUT_MS });
    }

    function onIdle(deadline) {
      idle = 0;
      if (!running) return;
      pump(deadline, MIN_UNITS);
      if (more()) schedule();
      notify();
    }

    // A small change is handled before the next paint, so a new number is never shown in the clear first.
    function flush() {
      pump(budget(SYNC_MS), 1);
      if (more()) schedule();
      notify();
    }

    function onMutations(list) {
      for (const m of list) {
        if (m.type === 'characterData') {
          const seg = blockOf(m.target.parentElement);
          if (seg) queue.add(seg);
          continue;
        }
        const seg = blockOf(m.target.nodeType === 1 ? m.target : m.target.parentElement);
        if (seg) queue.add(seg);
        for (const n of m.addedNodes) if (n.nodeType === 1) queueTree(n);
        if (m.removedNodes.length) sweepNeeded = true;
      }
      flush();
    }

    function bind(next) {
      observer.disconnect();
      clearAll();
      root = next;
      if (!root) return;
      observer.observe(root, { childList: true, characterData: true, subtree: true });
      queueTree(root);
      flush();
    }

    // Hover

    const over = (range, x, y) => {
      for (const r of range.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
      return false;
    };

    function rangeAt(x, y) {
      const reg = win.CSS.highlights;
      if (typeof reg.highlightsFromPoint === 'function') {
        for (const hit of reg.highlightsFromPoint(x, y)) if (hit.highlight === highlight) return hit.ranges[0] || null;
        return null;
      }
      const el = doc.elementFromPoint(x, y);
      const list = el && records.get(blockOf(el));
      return (list && list.find((r) => highlight.has(r) && over(r, x, y))) || null;
    }

    function cover(range) {
      revealed.delete(range);
      highlight.add(range);
    }

    function coverAll() {
      clearTimeout(candidateTimer);
      candidate = null;
      revealed.forEach(cover);
      notify();
    }

    function hover() {
      moveTimer = 0;
      lastMove = performance.now();
      for (const r of revealed) if (!over(r, px, py)) cover(r);
      const r = rangeAt(px, py);
      if (r !== candidate) {
        clearTimeout(candidateTimer);
        candidate = r;
        if (r) {
          candidateTimer = setTimeout(() => {
            if (candidate !== r) return;
            candidate = null;
            highlight.delete(r);
            revealed.add(r);
            notify();
          }, revealDelayMs);
        }
      }
      notify();
    }

    function onMove(e) {
      px = e.clientX;
      py = e.clientY;
      if (moveTimer) return;
      const wait = lastMove + HOVER_THROTTLE_MS - performance.now();
      if (wait <= 0) hover(); else moveTimer = setTimeout(hover, wait);
    }

    // API

    function start() {
      if (running) {
        const next = getRoot();
        if (next !== root) bind(next);
        return;
      }
      running = true;
      highlight = new win.Highlight();
      win.CSS.highlights.set(highlightName, highlight);
      ctl = new AbortController();
      doc.addEventListener('pointermove', onMove, { capture: true, passive: true, signal: ctl.signal });
      doc.documentElement.addEventListener('pointerleave', coverAll, { signal: ctl.signal });
      bind(getRoot());
    }

    function stop() {
      if (!running) return;
      running = false;
      observer.disconnect();
      ctl.abort();
      win.cancelIdleCallback(idle);
      clearTimeout(moveTimer);
      idle = moveTimer = 0;
      clearAll();
      if (win.CSS.highlights.get(highlightName) === highlight) win.CSS.highlights.delete(highlightName);
      highlight = root = null;
      reported = 0;
    }

    // Accepts the settings object ({type: boolean}), a list of type names, or null for none.
    function setTypes(enabled) {
      const names = Array.isArray(enabled) ? enabled.slice()
        : enabled && typeof enabled === 'object' ? Object.keys(enabled).filter((k) => enabled[k]) : [];
      const key = names.sort().join();
      if (key === typesKey) return;
      typesKey = key;
      types = names;
      if (!running) return;
      if (names.length) rescan(); else { clearAll(); notify(); }
    }

    function rescan() {
      if (!running) return;
      const next = getRoot();
      if (next !== root) return bind(next);
      if (!root) return;
      queueTree(root);
      flush();
    }

    return {
      setTypes, start, stop, rescan,
      count: () => (highlight ? highlight.size : 0),
      debugTexts: () => (highlight ? [...highlight].map((r) => r.toString()) : []),
    };
  }

  return { createMasker };
});
