const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, openFixture, loadModules, EXT_DIR } = require('./harness');

const ALL = { nik: true, card: true, account: true, otp: true, phone: true, email: true };
let browser;
before(async () => { ({ browser } = await launch({ install: false })); });
after(async () => { if (browser) await browser.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The masker runs in the page's own world here, with mask.css added the way the manifest does for the extension.
async function withMasker(fn, { types = ALL, start = true } = {}) {
  const page = await openFixture(browser, 'https://web.whatsapp.com/', 'whatsapp.html');
  try {
    await loadModules(page, ['shared/detect.js', 'content/masker.js']);
    await page.addStyleTag({ path: path.join(EXT_DIR, 'content', 'mask.css') });
    await page.evaluate((types, start) => {
      window.rootEl = document.getElementById('main');
      window.m = Tirai.masker.createMasker({ getRoot: () => window.rootEl });
      window.m.setTypes(types);
      if (start) window.m.start();
    }, types, start);
    await fn(page);
  } finally {
    await page.close();
  }
}

const texts = (page) => page.evaluate(() => window.m.debugTexts());
async function until(page, predicate, timeout = 1000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const t = await texts(page);
    if (predicate(t)) return t;
    if (Date.now() >= deadline) throw new Error('until timed out, last: ' + JSON.stringify(t));
    await sleep(25);
  }
}
const centreOf = (page, s) => page.evaluate((s) => {
  const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const i = n.data.indexOf(s);
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + s.length);
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return null;
}, s);
const append = (page, text) => page.evaluate((text) => {
  const d = document.createElement('div');
  d.className = 'message-in';
  d.innerHTML = '<div><span class="selectable-text"></span></div>';
  d.querySelector('span').textContent = text;
  document.getElementById('msgs').append(d);
}, text);

test('masks sensitive numbers and leaves the rest readable', async () => {
  await withMasker(async (page) => {
    const t = await until(page, (x) => x.length >= 3);
    for (const s of ['482913', '1234567890', '3578014512990003']) assert.ok(t.includes(s), s + ' in ' + JSON.stringify(t));
    for (const s of ['1.250.000', 'JP1234567890', '10/11/2026', '14.30']) assert.ok(!t.includes(s), s + ' in ' + JSON.stringify(t));
    assert.equal(await page.evaluate(() => window.m.count()), t.length);
    assert.equal(await page.evaluate(() => CSS.highlights.has('tirai-mask')), true);
  });
});

test('never changes the page DOM', async () => {
  await withMasker(async (page) => {
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    await page.evaluate(() => window.m.start());
    await until(page, (x) => x.length >= 3);
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before);
  }, { start: false });
});

test('text typed in the compose box is not masked', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await page.focus('div[contenteditable="true"][role="textbox"]');
    await page.keyboard.type('kode OTP 112233');
    await sleep(300);
    const t = await texts(page);
    assert.ok(!t.includes('112233'), JSON.stringify(t));
    assert.equal(t.length, 3);
  });
});

test('a new message is masked within 500 ms and edits clear it', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await append(page, 'PIN 9087');
    await until(page, (x) => x.includes('9087'), 500);
    await page.evaluate(() => {
      const spans = document.querySelectorAll('#msgs .selectable-text');
      spans[spans.length - 1].firstChild.data = 'PIN';
    });
    await until(page, (x) => !x.includes('9087'), 500);
    assert.equal(await page.evaluate(() => window.m.count()), 3);
  });
});

test('a removed message takes its mask with it', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await page.evaluate(() => {
      const w = document.createTreeWalker(document.getElementById('msgs'), NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) if (n.data.includes('482913')) return n.parentElement.closest('.message-out').remove();
    });
    await until(page, (x) => !x.includes('482913') && x.length === 2, 500);
    assert.equal(await page.evaluate(() => window.m.count()), 2);
  });
});

test('a number split over inline elements is masked as one', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.innerHTML = 'Kode OTP <b>48</b><i>29</i><span>13</span> ya';
      document.getElementById('msgs').append(d);
    });
    const t = await until(page, (x) => x.filter((s) => s === '482913').length === 2, 500);
    assert.equal(t.length, 4);
  });
});

test('setTypes re-runs detection', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await page.evaluate((all) => window.m.setTypes({ ...all, otp: false }), ALL);
    const t = await until(page, (x) => !x.includes('482913'), 500);
    assert.ok(t.includes('1234567890'));
    await page.evaluate((all) => window.m.setTypes(all), ALL);
    await until(page, (x) => x.includes('482913'), 500);
    await page.evaluate(() => window.m.setTypes(null));
    await until(page, (x) => x.length === 0, 500);
  });
});

test('stop clears every mask and start brings them back', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await page.evaluate(() => window.m.stop());
    assert.equal(await page.evaluate(() => window.m.count()), 0);
    assert.deepEqual(await texts(page), []);
    assert.equal(await page.evaluate(() => CSS.highlights.has('tirai-mask')), false);
    await append(page, 'PIN 9087');
    await sleep(300);
    assert.deepEqual(await texts(page), []);
    await page.evaluate(() => window.m.start());
    await until(page, (x) => x.length >= 4 && x.includes('9087'), 1000);
  });
});

test('a changed root is scanned again', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await page.evaluate(() => { window.rootEl = document.getElementById('pane-side'); window.m.start(); });
    await until(page, (x) => x.length === 0, 500);
    await page.evaluate(() => { window.rootEl = document.getElementById('main'); window.m.start(); });
    await until(page, (x) => x.length >= 3, 500);
  });
});

test('hovering a mask for a moment reveals it and leaving covers it again', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    const p = await centreOf(page, '482913');
    await page.mouse.move(p.x, p.y);
    await sleep(200);
    assert.ok((await texts(page)).includes('482913'), 'still masked after 200 ms');
    await until(page, (x) => !x.includes('482913'), 700);
    assert.equal(await page.evaluate(() => window.m.count()), 2);
    const other = await centreOf(page, '1234567890');
    await page.mouse.move(other.x, other.y);
    await until(page, (x) => x.includes('482913'), 300);
    await page.mouse.move(p.x, p.y);
    await sleep(100);
    await page.mouse.move(900, 60);
    await sleep(700);
    assert.ok((await texts(page)).includes('482913'), 'a short pass reveals nothing');
  });
});

test('hover also works without highlightsFromPoint', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    await page.evaluate(() => { CSS.highlights.highlightsFromPoint = undefined; });
    const p = await centreOf(page, '3578014512990003');
    await page.mouse.move(p.x, p.y);
    await until(page, (x) => !x.includes('3578014512990003'), 900);
    await page.mouse.move(900, 60);
    await until(page, (x) => x.includes('3578014512990003'), 300);
  });
});

test('copying a masked number still gives the real digits', async () => {
  await withMasker(async (page) => {
    await until(page, (x) => x.length >= 3);
    const copied = await page.evaluate(() => {
      const w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        if (!n.data.includes('482913')) continue;
        const s = getSelection();
        s.selectAllChildren(n.parentElement);
        return s.toString();
      }
    });
    assert.match(copied, /482913/);
  });
});
