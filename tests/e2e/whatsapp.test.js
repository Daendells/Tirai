const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, openFixture, setSettings, setLive, curtainInfo, waitForState, shot } = require('./harness');

const URL = 'https://web.whatsapp.com/';
const VIEWPORT = { x: 0, y: 0, w: 1280, h: 800 };
const SIDE = { x: 64, y: 0, w: 420, h: 800 };
const MAIN_CENTRE = { x: 882, y: 400 };
const COMPOSE = 'div[contenteditable="true"][role="textbox"]';
let browser, worker;

before(async () => {
  ({ browser, worker } = await launch());
  for (let i = 0; i < 50; i++) {
    if (await worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
});
after(async () => { if (browser) await browser.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const area = (tiles) => tiles.reduce((s, t) => s + t.w * t.h, 0);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const holds = (t, p) => p.x >= t.x && p.x < t.x + t.w && p.y >= t.y && p.y < t.y + t.h;
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

async function reset(patch = {}) {
  await worker.evaluate(async (patch) => {
    await chrome.storage.local.set({ settings: Tirai.settings.normalize(patch) });
    await chrome.storage.session.set({ live: { sharing: false, idle: 'active', sharingTabs: {} } });
  }, patch);
}

async function withPage(fixture, patch, fn) {
  await reset(patch);
  const page = await openFixture(browser, URL, fixture);
  try {
    await waitForState(page, (i) => i.present && i.state);
    await fn(page);
  } finally {
    await page.close();
  }
}

const masks = (page) => page.evaluate(() => [...document.querySelector('tirai-curtain').shadowRoot.querySelectorAll('.tile')]
  .map((t) => ({ x: parseFloat(t.style.left), y: parseFloat(t.style.top), w: parseFloat(t.style.width),
    h: parseFloat(t.style.height), mask: t.style.maskImage || t.style.webkitMaskImage })));

test('normal covers the chat list only', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    const info = await curtainInfo(page);
    assert.equal(info.state.mode, 'normal');
    assert.equal(info.state.health, 'ok');
    assert.equal(info.state.sideSource, 'side');
    assert.ok(near(area(info.tiles), SIDE.w * SIDE.h, SIDE.w * SIDE.h * 0.01), 'area ' + area(info.tiles));
    const main = { x: 484, y: 0, w: 796, h: 800 };
    for (const t of info.tiles) {
      assert.ok(t.x >= SIDE.x - 2 && t.x + t.w <= SIDE.x + SIDE.w + 2, JSON.stringify(t));
      assert.equal(meets(t, main), false, JSON.stringify(t));
    }
    await shot(page, 'wa-normal');
  });
});

test('full covers the viewport', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await setSettings(worker, { mode: 'full' });
    const info = await waitForState(page, (i) => i.state.mode === 'full', 2000);
    assert.ok(near(area(info.tiles), VIEWPORT.w * VIEWPORT.h, VIEWPORT.w * VIEWPORT.h * 0.01), 'area ' + area(info.tiles));
    assert.equal(info.state.reason, 'user');
    assert.match(info.pill, /Alt\+Shift\+Z/);
    await shot(page, 'wa-full');
  });
});

test('off covers nothing', async () => {
  await withPage('whatsapp.html', { mode: 'off' }, async (page) => {
    const info = await curtainInfo(page);
    assert.equal(info.state.mode, 'off');
    assert.equal(info.tiles.length, 0);
    assert.equal(info.pill, null);
  });
});

test('per-chat hide covers the open chat in normal', async () => {
  await withPage('whatsapp.html', { chats: { 'Budi Santoso': 'hide' } }, async (page) => {
    const info = await curtainInfo(page);
    assert.equal(info.state.rule, 'hide');
    assert.ok(info.tiles.some((t) => holds(t, MAIN_CENTRE)), JSON.stringify(info.tiles));
  });
});

test('per-chat show keeps the open chat readable in full', async () => {
  await withPage('whatsapp.html', { mode: 'full', chats: { 'Budi Santoso': 'show' } }, async (page) => {
    const info = await curtainInfo(page);
    assert.equal(info.state.rule, 'show');
    assert.equal(info.tiles.some((t) => holds(t, MAIN_CENTRE)), false);
    assert.ok(info.tiles.some((t) => holds(t, { x: 200, y: 300 })));
  });
});

test('list fallback', async () => {
  await withPage('whatsapp-noid.html', {}, async (page) => {
    const info = await curtainInfo(page);
    assert.equal(info.state.sideSource, 'list');
    assert.ok(near(area(info.tiles), SIDE.w * SIDE.h, SIDE.w * SIDE.h * 0.01));
  });
});

test('fails closed on unknown logged-in layout', async () => {
  await withPage('whatsapp-unknown.html', {}, async (page) => {
    const info = await curtainInfo(page);
    assert.equal(info.state.health, 'fallback');
    assert.ok(near(area(info.tiles), VIEWPORT.w * VIEWPORT.h, VIEWPORT.w * VIEWPORT.h * 0.01));
  });
});

test('QR page stays clear', async () => {
  await withPage('whatsapp-qr.html', {}, async (page) => {
    const normal = await curtainInfo(page);
    assert.equal(normal.tiles.length, 0);
    assert.equal(normal.state.health, 'idle');
    await setSettings(worker, { mode: 'full' });
    const full = await waitForState(page, (i) => i.state.mode === 'full', 2000);
    assert.equal(full.tiles.length, 0);
  });
});

test('lamp opens after dwell', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.mouse.move(200, 300);
    await sleep(250);
    const hit = (await masks(page)).find((t) => holds(t, { x: 200, y: 300 }));
    assert.ok(hit, 'a tile under the pointer');
    assert.match(hit.mask, /transparent/);
    await shot(page, 'wa-lamp');
    await page.mouse.move(900, 300);
    await sleep(100);
    assert.doesNotMatch((await masks(page))[0].mask, /transparent/);
  });
});

test('clicks pass through the curtain', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.mouse.click(264, 352);
    assert.equal(await page.evaluate(() => window.__clicked), 'Budi Santoso');
  });
});

test('focused compose box is a hole', async () => {
  await withPage('whatsapp.html', { mode: 'full' }, async (page) => {
    await page.focus(COMPOSE);
    const box = await page.$eval(COMPOSE, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const info = await waitForState(page, (i) => i.tiles.length > 1, 2000);
    assert.equal(info.tiles.some((t) => holds(t, centre)), false);
    assert.ok(info.tiles.some((t) => holds(t, MAIN_CENTRE)));
  });
});

test('focusing the whole chat list does not open it', async () => {
  await withPage('whatsapp.html', { mode: 'full' }, async (page) => {
    await page.evaluate(() => {
      const p = document.getElementById('pane-side');
      p.tabIndex = 0;
      p.setAttribute('role', 'listitem');
      p.focus();
    });
    await sleep(200);
    const info = await curtainInfo(page);
    assert.ok(near(area(info.tiles), VIEWPORT.w * VIEWPORT.h, VIEWPORT.w * VIEWPORT.h * 0.01));
  });
});

test('open menu is a hole', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => { document.getElementById('fx-menu').style.display = 'block'; });
    const menu = { x: 200, y: 300, w: 180, h: 160 };
    const info = await waitForState(page, (i) => i.tiles.length > 1 && i.tiles.every((t) => !meets(t, menu)), 2000);
    assert.ok(info.tiles.length > 1);
  });
});

test('unfocus auto', async () => {
  const auto = { share: false, unfocus: true, idle: false, idleSeconds: 60 };
  await withPage('whatsapp.html', { auto }, async (page) => {
    await waitForState(page, (i) => i.state.mode === 'normal', 2000);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await waitForState(page, (i) => i.state.reason === 'unfocus', 600);
    assert.equal(blurred.state.mode, 'full');
    assert.equal(blurred.state.lamp, false);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const back = await waitForState(page, (i) => i.state.mode === 'normal', 600);
    assert.equal(back.state.reason, 'user');
  });
});

test('share auto shows the share pill', async () => {
  const auto = { share: true, unfocus: false, idle: false, idleSeconds: 60 };
  await withPage('whatsapp.html', { auto }, async (page) => {
    await setLive(worker, { sharing: true });
    const info = await waitForState(page, (i) => i.state.reason === 'share', 2000);
    assert.equal(info.state.mode, 'full');
    assert.match(info.pill, /sharing/i);
  });
});

test('resize', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.setViewport({ width: 1000, height: 700 });
    const info = await waitForState(page, (i) => i.tiles.length > 0 && near(i.tiles[0].h, 700), 2000);
    assert.ok(near(area(info.tiles), 420 * 700, 420 * 700 * 0.01), 'area ' + area(info.tiles));
  });
});

test('survives host removal', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => document.querySelector('tirai-curtain').remove());
    await page.mouse.move(200, 300);
    await waitForState(page, (i) => i.present && i.tiles.length > 0, 2000);
    assert.equal(await page.evaluate(() => document.querySelectorAll('tirai-curtain').length), 1);
  });
});

test('yields to a newer instance', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => { document.documentElement.dataset.tiraiInstance = 'other'; });
    await page.mouse.move(200, 300);
    await waitForState(page, (i) => !i.present, 2000);
    await sleep(400);
    assert.equal(await page.evaluate(() => document.querySelectorAll('tirai-curtain').length), 0);
  });
});

test('answers status messages', async () => {
  await withPage('whatsapp.html', {}, async () => {
    const res = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      return chrome.tabs.sendMessage(tab.id, { type: 'status' });
    });
    assert.equal(res.title, 'Budi Santoso');
    assert.equal(res.health, 'ok');
    assert.equal(res.rule, 'auto');
    assert.equal(res.sideSource, 'side');
    assert.equal(res.mainSource, 'main');
    assert.equal(res.state.mode, 'normal');
  });
});
