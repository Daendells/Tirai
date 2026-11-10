(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['masker'] = api;
})(function () {
  const INLINE = new Set(['SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'U', 'S', 'SMALL', 'CODE', 'MARK', 'SUB', 'SUP',
    'BDI', 'BDO', 'Q', 'ABBR', 'TIME', 'IMG', 'BR']);
  // A line break or an image splits a number like a block does.
  const BREAKS = new Set(['BR', 'IMG']);
  // What the user types, and our own curtain, are never masked.
  const SKIP = 'input,textarea,script,style,noscript,tirai-curtain,'
    + '[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]';
  const SHOW = 1 | 4; // NodeFilter.SHOW_ELEMENT | SHOW_TEXT
  const ACCEPT = 1, REJECT = 2, SKIP_NODE = 3;
  const IDLE_TIMEOUT_MS = 200;
  const HOVER_THROTTLE_MS = 50;
  const MIN_UNITS = 25;

  const blockOf = (el) => { while (el && INLINE.has(el.tagName)) el = el.parentElement; return el; };
  const same = (a, b) => a.startContainer === b.startContainer && a.startOffset === b.startOffset
    && a.endContainer === b.endContainer && a.endOffset === b.endOffset;
  const treeFilter = (n) => (n.nodeType === 3 ? ACCEPT : n.matches(SKIP) ? REJECT : SKIP_NODE);

  function createMasker({ doc = document, getRoot, highlightName = 'tirai-mask', revealDelayMs = 400, onChange } = {}) {
    const win = doc.defaultView;
    const detect = (text, types) => globalThis.Tirai.detect.detect(text, types);

    let running = false, root = null, highlight = null, types = [], typesKey = '';
    let ctl = null, idle = 0, reported = 0, sweepNeeded = false, gap = false;
    let candidate = null, candidateTimer = 0, moveTimer = 0, lastMove = 0, px = 0, py = 0;
    const records = new Map(); // segment element -> its masked ranges (shown or revealed)
    const queue = new Set();   // segment elements to scan again
    const revealed = new Set();

    const observer = new win.MutationObserver(onMutations);

    // Text of a segment stops at a nested block, so the filter notes where one was skipped.
    const segmentFilter = (n) => {
      if (n.nodeType === 3) return ACCEPT;
      const inline = INLINE.has(n.tagName) && !n.matches(SKIP);
      if (!inline || BREAKS.has(n.tagName)) gap = true;
      return inline ? SKIP_NODE : REJECT;
    };

    const count = () => (highlight ? highlight.size + revealed.size : 0);

    function notify() {
      const n = count();
      if (onChange && n !== reported) { reported = n; onChange(); }
    }

    function drop(range) {
      highlight.delete(range);
      revealed.delete(range);
      if (candidate === range) { clearTimeout(candidateTimer); candidate = null; }
    }

    function clearAll() {
      queue.clear();
      sweepNeeded = false;
      records.clear();
      revealed.clear();
      clearTimeout(candidateTimer);
      candidate = null;
      if (highlight) highlight.clear();
    }

    // Queue every segment that has text under `node`. Only walks text nodes, so it is cheap enough to run at once.
    function queueTree(node) {
      if (node.closest(SKIP)) return;
      const w = doc.createTreeWalker(node, SHOW, treeFilter);
      let last = null;
      for (let n; (n = w.nextNode());) {
        const p = n.parentElement;
        if (p === last || !/\S/.test(n.data)) continue;
        last = p;
        const seg = blockOf(p);
        if (seg) queue.add(seg);
      }
    }

    function rangesFor(seg) {
      const nodes = []; // node, offset of its first character, ...
      let text = '';
      gap = false;
      const w = doc.createTreeWalker(seg, SHOW, segmentFilter);
      for (let n; (n = w.nextNode());) {
        if (gap && text) text += '\n';
        gap = false;
        nodes.push(n, text.length);
        text += n.data;
      }
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

    function onScreen(seg) {
      const r = seg.getBoundingClientRect();
      return r.bottom > 0 && r.top < win.innerHeight && r.right > 0 && r.left < win.innerWidth;
    }

    // Everything the user can see is handled now, with no time limit, so no number is painted in the clear.
    function syncVisible() {
      if (sweepNeeded) { sweepNeeded = false; sweep(); }
      for (const seg of queue) {
        if (!onScreen(seg)) continue;
        queue.delete(seg);
        processSegment(seg);
      }
    }

    function schedule() {
      if (!idle && running) idle = win.requestIdleCallback(onIdle, { timeout: IDLE_TIMEOUT_MS });
    }

    // What is off screen waits for idle time, a few segments at a time.
    function onIdle(deadline) {
      idle = 0;
      if (!running) return;
      let units = 0;
      for (const seg of queue) {
        if (units++ >= MIN_UNITS && deadline.timeRemaining() <= 0) break;
        queue.delete(seg);
        processSegment(seg);
      }
      if (queue.size) schedule();
      notify();
    }

    function flush() {
      syncVisible();
      if (queue.size) schedule();
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

    // Keeps the ranges that are still inside the new root, so a root change never uncovers anything.
    function bind(next) {
      observer.disconnect();
      root = next;
      queue.clear();
      for (const [seg, list] of records) {
        if (root && seg.isConnected && root.contains(seg)) continue;
        list.forEach(drop);
        records.delete(seg);
      }
      if (!root) return notify();
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

    // The pointer may be away or the page may have moved under it, so anything revealed is covered again.
    function coverAll() {
      clearTimeout(candidateTimer);
      candidate = null;
      revealed.forEach(cover);
    }

    function hover() {
      moveTimer = 0;
      lastMove = performance.now();
      for (const r of revealed) if (!over(r, px, py)) cover(r);
      const r = rangeAt(px, py);
      if (r === candidate) return;
      clearTimeout(candidateTimer);
      candidate = r;
      if (!r) return;
      candidateTimer = setTimeout(() => {
        if (candidate !== r) return;
        candidate = null;
        highlight.delete(r);
        revealed.add(r);
      }, revealDelayMs);
    }

    function onMove(e) {
      px = e.clientX;
      py = e.clientY;
      if (moveTimer) return;
      const wait = lastMove + HOVER_THROTTLE_MS - performance.now();
      if (wait <= 0) hover(); else moveTimer = setTimeout(hover, wait);
    }

    // New content scrolls into view or the tab comes back: handle the queued segments that are on screen now.
    function catchUp() {
      syncVisible();
      notify();
    }

    // API

    function start() {
      if (running) {
        const next = getRoot();
        if (next !== root) bind(next);
        return;
      }
      const h = new win.Highlight();
      win.CSS.highlights.set(highlightName, h);
      running = true;
      highlight = h;
      ctl = new AbortController();
      const o = { signal: ctl.signal };
      doc.addEventListener('pointermove', onMove, { ...o, capture: true, passive: true });
      doc.addEventListener('scroll', () => { coverAll(); catchUp(); }, { ...o, capture: true, passive: true });
      doc.addEventListener('visibilitychange', () => { if (doc.hidden) coverAll(); else catchUp(); }, o);
      win.addEventListener('blur', coverAll, o);
      doc.documentElement.addEventListener('pointerleave', coverAll, o);
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
      setTypes, start, stop, rescan, count,
      debugTexts: () => (highlight ? [...highlight].map((r) => r.toString()) : []),
    };
  }

  return { createMasker };
});
