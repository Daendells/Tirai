const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openFixture, loadModules, curtainInfo, shot } = require('./harness');

let browser;
before(async () => { ({ browser } = await launch({ install: false })); });
after(async () => { if (browser) await browser.close(); });

async function withCurtain(fn) {
  const page = await openFixture(browser, 'https://example.com/', 'blank.html');
  try {
    await loadModules(page, ['shared/geometry.js', 'content/curtain.js']);
    await page.evaluate(() => { window.c = Tirai.curtain.createCurtain(); });
    await fn(page);
  } finally {
    await page.close();
  }
}

const view = (over = {}) => ({
  tiles: [{ x: 10, y: 20, w: 200, h: 100 }, { x: 300, y: 40, w: 150, h: 300 }],
  blurPx: 8, lamp: null, pill: null, state: { mode: 'work', n: 2 }, ...over,
});
const render = (page, v) => page.evaluate((v) => window.c.render(v), v);
const masks = (page) => page.evaluate(() => [...window.c.host.shadowRoot.querySelectorAll('.tile')]
  .map((t) => t.style.maskImage || t.style.webkitMaskImage));

test('renders tiles with matching rects and the state', async () => {
  await withCurtain(async (page) => {
    assert.equal(await render(page, view()), true);
    const info = await curtainInfo(page);
    assert.deepEqual(info.tiles, view().tiles);
    assert.deepEqual(info.state, { mode: 'work', n: 2 });
    const style = await page.evaluate(() => {
      const t = window.c.host.shadowRoot.querySelector('.tile');
      const cs = getComputedStyle(t);
      return { filter: cs.backdropFilter, h: getComputedStyle(window.c.host).position };
    });
    assert.match(style.filter, /blur\(8px\)/);
    assert.equal(style.h, 'fixed');
  });
});

test('the lamp opens only the tile under the pointer', async () => {
  await withCurtain(async (page) => {
    await render(page, view({ lamp: { pointer: { x: 350.4, y: 120.6 }, lampPx: 60, featherPx: 12 } }));
    const [m1, m2] = await masks(page);
    assert.equal(m1, 'none');
    assert.match(m2, /transparent/);
  });
});

test('re-rendering with fewer tiles removes the extras and reuses the rest', async () => {
  await withCurtain(async (page) => {
    await render(page, view());
    const same = await page.evaluate(() => {
      const first = window.c.host.shadowRoot.querySelector('.tile');
      window.c.render({ tiles: [{ x: 0, y: 0, w: 50, h: 50 }], blurPx: 4, lamp: null, pill: null, state: {} });
      const tiles = window.c.host.shadowRoot.querySelectorAll('.tile');
      return tiles.length === 1 && tiles[0] === first;
    });
    assert.equal(same, true);
    assert.equal((await curtainInfo(page)).tiles.length, 1);
  });
});

test('the pill shows its text, turns compact after 4 s and goes away on null', async () => {
  await withCurtain(async (page) => {
    await render(page, view({ pill: 'Curtain on' }));
    assert.equal((await curtainInfo(page)).pill, 'Curtain on');
    const compact = () => page.evaluate(() => window.c.host.shadowRoot.querySelector('.pill').classList.contains('compact'));
    assert.equal(await compact(), false);
    await new Promise((r) => setTimeout(r, 4200));
    assert.equal(await compact(), true);
    assert.equal((await curtainInfo(page)).pill, 'Curtain on');
    await render(page, view({ pill: 'Curtain off' }));
    assert.equal(await compact(), false);
    await render(page, view({ pill: null }));
    assert.equal((await curtainInfo(page)).pill, null);
  });
});

test('destroy removes the host and can be called twice', async () => {
  await withCurtain(async (page) => {
    await render(page, view({ pill: 'x' }));
    const threw = await page.evaluate(() => {
      window.c.destroy();
      try { window.c.destroy(); return false; } catch { return true; }
    });
    assert.equal(threw, false);
    assert.equal((await curtainInfo(page)).present, false);
  });
});

test('render returns false after the host is removed', async () => {
  await withCurtain(async (page) => {
    await page.evaluate(() => window.c.host.remove());
    assert.equal(await render(page, view()), false);
  });
});

test('the curtain does not catch pointer events', async () => {
  await withCurtain(async (page) => {
    await render(page, view());
    const ok = await page.evaluate(() => {
      const el = document.elementFromPoint(110, 70);
      return !!el && el !== window.c.host && el.tagName !== 'TIRAI-CURTAIN';
    });
    assert.equal(ok, true);
  });
});

test('screenshot with the lamp open', async () => {
  await withCurtain(async (page) => {
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:20px;line-height:1.6;margin-top:40px';
      p.innerHTML = Array.from({ length: 12 }, (_, i) => `Pesan nomor ${i + 1}: jangan bagikan kode 4821${i} kepada siapa pun.`).join('<br>');
      document.body.append(p);
    });
    await render(page, view({
      tiles: [{ x: 0, y: 0, w: 640, h: 500 }, { x: 660, y: 0, w: 620, h: 500 }],
      blurPx: 8,
      lamp: { pointer: { x: 300, y: 250 }, lampPx: 80, featherPx: 16 },
      pill: 'Curtain on',
    }));
    await new Promise((r) => setTimeout(r, 300)); // let the pill fade in
    await shot(page, 'curtain-basic');
  });
});

test('page CSS cannot hide or fade the curtain', async () => {
  await withCurtain(async (page) => {
    await page.addStyleTag({ content: 'tirai-curtain{display:none!important;opacity:0!important;transform:scale(0)!important;clip-path:inset(100%)!important} *{visibility:hidden!important}' });
    await render(page, view());
    const cs = await page.evaluate(() => {
      const h = window.c.host, t = h.shadowRoot.querySelector('.tile');
      const ch = getComputedStyle(h);
      return { display: ch.display, opacity: ch.opacity, transform: ch.transform, clip: ch.clipPath,
        position: ch.position, tile: getComputedStyle(t).visibility };
    });
    assert.deepEqual(cs, { display: 'block', opacity: '1', transform: 'none', clip: 'none', position: 'fixed', tile: 'visible' });
  });
});

test('the pill stays above tiles when the tile count grows', async () => {
  await withCurtain(async (page) => {
    await render(page, view({ tiles: [{ x: 0, y: 0, w: 50, h: 50 }], pill: 'Curtain on' }));
    await render(page, view({ tiles: [0, 1, 2].map((i) => ({ x: i * 60, y: 0, w: 50, h: 50 })), pill: 'Curtain on' }));
    const z = await page.evaluate(() => {
      const r = window.c.host.shadowRoot;
      const n = (el) => parseInt(getComputedStyle(el).zIndex, 10) || 0;
      return { pill: n(r.querySelector('.pill')), tiles: [...r.querySelectorAll('.tile')].map(n) };
    });
    assert.equal(z.tiles.length, 3);
    for (const t of z.tiles) assert.ok(z.pill > t, JSON.stringify(z));
  });
});

test('an invalid blur still blurs', async () => {
  await withCurtain(async (page) => {
    for (const blurPx of [NaN, undefined, -3, 0]) {
      await render(page, view({ blurPx }));
      const f = await page.evaluate(() => getComputedStyle(window.c.host.shadowRoot.querySelector('.tile')).backdropFilter);
      assert.match(f, /blur\(14px\)/, String(blurPx));
    }
  });
});

test('rendering the same state does not touch data-state', async () => {
  await withCurtain(async (page) => {
    await render(page, view());
    const counts = await page.evaluate(async () => {
      const seen = [];
      const mo = new MutationObserver((rs) => seen.push(...rs));
      mo.observe(window.c.host, { attributes: true, attributeFilter: ['data-state'] });
      const tick = () => new Promise((r) => setTimeout(r, 20));
      const state = { mode: 'work', n: 2 };
      window.c.render({ tiles: [], blurPx: 8, lamp: null, pill: null, state });
      window.c.render({ tiles: [], blurPx: 8, lamp: null, pill: null, state: { ...state } });
      await tick();
      const same = seen.length;
      window.c.render({ tiles: [], blurPx: 8, lamp: null, pill: null, state: { mode: 'off' } });
      await tick();
      mo.disconnect();
      return { same, total: seen.length };
    });
    assert.deepEqual(counts, { same: 0, total: 1 });
  });
});
