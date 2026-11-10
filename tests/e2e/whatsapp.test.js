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
    // The curtain draws the defaults first, so wait until the stored settings have been applied.
    const mode = patch.mode || 'normal';
    const rule = patch.chats && patch.chats['Budi Santoso'];
    await waitForState(page, (i) => i.state && i.state.mode === mode && (!rule || i.state.rule === rule), 2000);
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

test('fails closed on app chrome that has no known marker and no QR code', async () => {
  await withPage('whatsapp-chrome.html', {}, async (page) => {
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

test('lamp stays open while the pointer crosses rows', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.mouse.move(200, 300);
    await sleep(250);
    for (const [x, y] of [[200, 330], [260, 360], [300, 400], [150, 440], [260, 500], [200, 560]]) {
      await page.mouse.move(x, y);
      await sleep(40);
      const hit = (await masks(page)).find((t) => holds(t, { x, y }));
      assert.match(hit.mask, /transparent/, `lamp closed at ${x},${y}`);
    }
  });
});

const stops = (m) => { const x = /transparent (\d+)px, transparent (\d+)px/.exec(m); return x && [+x[1], +x[2]]; };
const rectOf = (page, sel, n) => page.evaluate((sel, n) => {
  const r = document.querySelectorAll(sel)[n].getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}, sel, n);

async function bandAt(page, p) {
  await page.mouse.move(p.x, p.y);
  await sleep(300);
  const t = (await masks(page)).find((q) => holds(q, p));
  return { t, band: t && stops(t.mask) };
}

test('lamp snaps to the chat row under the pointer', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    const row = await rectOf(page, 'div[role="row"]', 2);
    const { t, band } = await bandAt(page, { x: 200, y: row.y + 30 });
    assert.ok(band, 'band');
    assert.ok(near(band[0], row.y - t.y) && near(band[1], row.y + row.h - t.y), `${band} vs ${JSON.stringify(row)}`);
    await shot(page, 'wa-lamp-row');
  });
});

test('lamp snaps to the message under the pointer in full mode', async () => {
  await withPage('whatsapp.html', { mode: 'full' }, async (page) => {
    const m = await rectOf(page, '[data-testid="msg-container"]', 2);
    const { t, band } = await bandAt(page, { x: m.x + 10, y: m.y + 10 });
    assert.ok(band, 'band');
    assert.ok(near(band[0], m.y - t.y) && near(band[1], m.y + m.h - t.y), `${band} vs ${JSON.stringify(m)}`);
  });
});

test('a message taller than 2.5 lamps keeps the fixed band', async () => {
  await withPage('whatsapp.html', { mode: 'full' }, async (page) => {
    await page.evaluate(() => { document.querySelectorAll('[data-testid="msg-container"]')[2].style.minHeight = '240px'; });
    const m = await rectOf(page, '[data-testid="msg-container"]', 2);
    const { band } = await bandAt(page, { x: m.x + 10, y: m.y + 100 });
    assert.ok(band, 'band');
    assert.equal(band[1] - band[0], 72);
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
    const info = await waitForState(page, (i) => !i.tiles.some((t) => holds(t, centre)), 2000);
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
    await page.evaluate(() => {
      const m = document.createElement('div');
      m.id = 'real-menu';
      m.setAttribute('role', 'menu');
      m.style.cssText = 'position:fixed;left:200px;top:300px;width:180px;height:160px;background:#233138';
      document.body.append(m);
    });
    const menu = { x: 200, y: 300, w: 180, h: 160 };
    const info = await waitForState(page, (i) => i.tiles.length > 1 && i.tiles.every((t) => !meets(t, menu)), 2000);
    assert.ok(info.tiles.length > 1);
    await page.evaluate(() => document.getElementById('real-menu').remove());
    const closed = await waitForState(page, (i) => i.tiles.length === 1, 2000);
    assert.ok(near(area(closed.tiles), SIDE.w * SIDE.h, SIDE.w * SIDE.h * 0.01));
  });
});

test('popups that are not visible do not open holes', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => {
      const hidden = document.createElement('div');
      hidden.style.display = 'none';
      const inner = document.createElement('div');
      inner.setAttribute('role', 'menu');
      inner.style.cssText = 'position:fixed;left:200px;top:300px;width:180px;height:160px';
      hidden.append(inner);
      const faded = document.createElement('div');
      faded.setAttribute('role', 'menu');
      faded.style.cssText = 'position:fixed;left:200px;top:500px;width:180px;height:100px;opacity:0';
      document.body.append(hidden, faded);
    });
    await sleep(400);
    const info = await curtainInfo(page);
    assert.equal(info.tiles.length, 1);
  });
});

test('a viewport-sized dialog does not open a hole', async () => {
  await withPage('whatsapp.html', { mode: 'full' }, async (page) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('role', 'dialog');
      d.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none';
      document.body.append(d);
    });
    await sleep(400);
    const info = await curtainInfo(page);
    assert.ok(near(area(info.tiles), VIEWPORT.w * VIEWPORT.h, VIEWPORT.w * VIEWPORT.h * 0.01), 'area ' + area(info.tiles));
  });
});

test('a listbox the size of the chat list does not open a hole', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('role', 'listbox');
      d.style.cssText = 'position:fixed;left:64px;top:0;width:420px;height:800px;pointer-events:none';
      document.body.append(d);
    });
    await sleep(400);
    const info = await curtainInfo(page);
    assert.ok(near(area(info.tiles), SIDE.w * SIDE.h, SIDE.w * SIDE.h * 0.01), 'area ' + area(info.tiles));
  });
});

test('a panel over most of the chat list does not open a hole', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('role', 'dialog');
      d.style.cssText = 'position:fixed;left:64px;top:0;width:420px;height:480px;pointer-events:none';
      document.body.append(d);
    });
    await sleep(400);
    const info = await curtainInfo(page);
    assert.ok(near(area(info.tiles), SIDE.w * SIDE.h, SIDE.w * SIDE.h * 0.01), 'area ' + area(info.tiles));
  });
});

test('a small panel in the chat list still opens a hole', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('role', 'dialog');
      d.style.cssText = 'position:fixed;left:100px;top:100px;width:300px;height:200px;pointer-events:none';
      document.body.append(d);
    });
    await waitForState(page, (i) => i.tiles.length > 1 && area(i.tiles) < SIDE.w * SIDE.h - 50000, 2000);
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

test('auto cover ignores the show rule', async () => {
  const auto = { share: false, unfocus: true, idle: false, idleSeconds: 60 };
  await withPage('whatsapp.html', { mode: 'full', auto, chats: { 'Budi Santoso': 'show' } }, async (page) => {
    const open = await waitForState(page, (i) => i.state.reason === 'user' && !i.tiles.some((t) => holds(t, MAIN_CENTRE)), 2000);
    assert.equal(open.state.rule, 'show');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const info = await waitForState(page, (i) => i.state.reason === 'unfocus', 1000);
    assert.ok(info.tiles.some((t) => holds(t, MAIN_CENTRE)), JSON.stringify(info.tiles));
    assert.equal(area(info.tiles), VIEWPORT.w * VIEWPORT.h);
  });
});

test('auto cover ignores a focused compose box', async () => {
  const auto = { share: false, unfocus: true, idle: false, idleSeconds: 60 };
  await withPage('whatsapp.html', { mode: 'full', auto }, async (page) => {
    await page.focus(COMPOSE);
    const box = await page.$eval(COMPOSE, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await waitForState(page, (i) => !i.tiles.some((t) => holds(t, box)), 2000);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const info = await waitForState(page, (i) => i.state.reason === 'unfocus', 1000);
    assert.ok(info.tiles.some((t) => holds(t, box)), JSON.stringify(info.tiles));
    assert.equal(area(info.tiles), VIEWPORT.w * VIEWPORT.h);
  });
});

test('a newly opened chat uses its own rule on the next frame', async () => {
  await withPage('whatsapp.html', { chats: { 'Sari Dewi': 'hide' } }, async (page) => {
    await sleep(300);
    assert.equal((await curtainInfo(page)).tiles.some((t) => holds(t, MAIN_CENTRE)), false);
    await page.evaluate(() => {
      const s = document.querySelector('#main header span[title]');
      s.setAttribute('title', 'Sari Dewi');
      s.textContent = 'Sari Dewi';
    });
    const info = await waitForState(page, (i) => i.tiles.some((t) => holds(t, MAIN_CENTRE)), 150);
    assert.equal(info.state.rule, 'hide');
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

test('a resized chat list is followed on the next frame, with no new scan', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await sleep(300);
    await page.evaluate(() => {
      const side = document.getElementById('side');
      side.style.flexBasis = '300px';
      side.style.width = '300px';
    });
    const info = await waitForState(page, (i) => i.tiles.length > 0 && near(i.tiles[0].w, 300), 120);
    assert.ok(near(area(info.tiles), 300 * 800, 300 * 800 * 0.01), 'area ' + area(info.tiles));
  });
});

test('a replaced chat pane is read again in the same frame, with its own rule', async () => {
  await withPage('whatsapp.html', { chats: { 'Sari Dewi': 'hide' } }, async (page) => {
    await sleep(300);
    await page.evaluate(() => document.body.append(document.createElement('i'))); // a scan just ran: the next one waits
    await page.evaluate(() => {
      const old = document.getElementById('main');
      const next = old.cloneNode(true);
      next.querySelector('header span[title]').setAttribute('title', 'Sari Dewi');
      next.querySelector('header span[title]').textContent = 'Sari Dewi';
      old.replaceWith(next);
    });
    const info = await waitForState(page, (i) => i.state.rule === 'hide' && i.tiles.some((t) => holds(t, MAIN_CENTRE)), 120);
    assert.equal(info.state.rule, 'hide');
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

test('status answers with the chat that is open now', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await sleep(300);
    await page.evaluate(() => new Promise((resolve) => {
      const s = document.querySelector('#main header span[title]');
      s.setAttribute('title', 'Sari Dewi'); // a scan runs for this one...
      s.textContent = 'Sari Dewi';
      setTimeout(() => {
        s.setAttribute('title', 'Rina Wulandari'); // ...and the next one waits for the throttle
        s.textContent = 'Rina Wulandari';
        resolve();
      }, 20);
    }));
    const res = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      return chrome.tabs.sendMessage(tab.id, { type: 'status' });
    });
    assert.equal(res.title, 'Rina Wulandari');
  });
});

test('sensitive numbers are masked in normal and the masks follow the settings', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    const info = await waitForState(page, (i) => i.state.masks >= 3, 2000);
    assert.ok(info.state.masks >= 3, JSON.stringify(info.state));
    assert.equal(await page.evaluate(() => CSS.highlights.has('tirai-mask')), true);
    await shot(page, 'wa-masks');
    await setSettings(worker, { mode: 'off' });
    const off = await waitForState(page, (i) => i.state.mode === 'off' && i.state.masks === 0, 2000);
    assert.equal(off.state.masks, 0);
    assert.equal(await page.evaluate(() => CSS.highlights.has('tirai-mask')), false);
    await setSettings(worker, { mode: 'normal' });
    await waitForState(page, (i) => i.state.masks >= 3, 2000);
    await setSettings(worker, { sensitive: { enabled: false, types: { nik: true, card: true, account: true, otp: true, phone: true, email: false } } });
    const none = await waitForState(page, (i) => i.state.masks === 0, 2000);
    assert.equal(none.state.mode, 'normal');
  });
});

test('masks are off when sensitive data is disabled from the start', async () => {
  await withPage('whatsapp.html', { sensitive: { enabled: false } }, async (page) => {
    await sleep(400);
    assert.equal((await curtainInfo(page)).state.masks, 0);
  });
});

test('a popup hidden by an attribute change closes its hole', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await page.evaluate(() => {
      const m = document.createElement('div');
      m.id = 'real-menu';
      m.setAttribute('role', 'menu');
      m.style.cssText = 'position:fixed;left:200px;top:300px;width:180px;height:160px;background:#233138';
      document.body.append(m);
    });
    const menu = { x: 200, y: 300, w: 180, h: 160 };
    await waitForState(page, (i) => i.tiles.length > 1 && i.tiles.every((t) => !meets(t, menu)), 2000);
    await page.evaluate(() => { document.getElementById('real-menu').style.display = 'none'; });
    const closed = await waitForState(page, (i) => i.tiles.length === 1, 300);
    assert.ok(near(area(closed.tiles), SIDE.w * SIDE.h, SIDE.w * SIDE.h * 0.01));
  });
});

test('a hidden tab renders the new state before it is shown again', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    const other = await browser.newPage();
    try {
      await sleep(300);
      assert.equal(await page.evaluate(() => document.hidden), true);
      await setSettings(worker, { mode: 'full' });
      await sleep(400);
      assert.equal((await curtainInfo(page)).state.mode, 'full');
      await page.bringToFront();
      await sleep(150);
      const shown = await curtainInfo(page);
      assert.equal(shown.state.mode, 'full');
      assert.ok(near(area(shown.tiles), VIEWPORT.w * VIEWPORT.h, VIEWPORT.w * VIEWPORT.h * 0.01), 'area ' + area(shown.tiles));
      assert.match(shown.pill, /Alt\+Shift\+Z/);
    } finally {
      await other.close();
    }
  });
});

test('hovering a mask reveals it in the extension too', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await waitForState(page, (i) => i.state.masks === 3, 2000);
    const p = await page.evaluate(() => {
      const w = document.createTreeWalker(document.getElementById('msgs'), NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const i = n.data.indexOf('482913');
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 6);
        const b = r.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    });
    const painted = () => page.evaluate(() => [...CSS.highlights.get('tirai-mask')].map(String));
    await page.mouse.move(p.x, p.y);
    for (let i = 0; i < 30 && (await painted()).includes('482913'); i++) await sleep(50);
    assert.deepEqual((await painted()).sort(), ['1234567890', '3578014512990003']);
    assert.equal((await curtainInfo(page)).state.masks, 3, 'a revealed range still counts');
    await page.mouse.move(900, 60);
    for (let i = 0; i < 10 && !(await painted()).includes('482913'); i++) await sleep(50);
    assert.equal((await painted()).length, 3);
  });
});

test('a chat pane swapped for a new one is masked in the same frame', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await waitForState(page, (i) => i.state.masks === 3, 2000);
    const r = await page.evaluate(async () => {
      const main = document.getElementById('main');
      const next = main.cloneNode(true);
      next.querySelector('.selectable-text').textContent = 'Kode OTP kamu 556677 ya';
      main.replaceWith(next);
      await Promise.resolve();
      const painted = () => [...CSS.highlights.get('tirai-mask')].map(String).sort();
      const afterMicrotask = painted();
      await new Promise((res) => requestAnimationFrame(() => res()));
      return { afterMicrotask, afterFrame: painted() };
    });
    const want = ['1234567890', '3578014512990003', '482913', '556677'];
    assert.deepEqual(r.afterMicrotask, want);
    assert.deepEqual(r.afterFrame, want);
  });
});

test('when the masker cannot start the state says so and the cover stays', async () => {
  await withPage('whatsapp.html', {}, async (page) => {
    await waitForState(page, (i) => i.state.masks === 3, 2000);
    const cdp = await page.createCDPSession();
    const worlds = [];
    cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
    await cdp.send('Runtime.enable');
    await sleep(200);
    let broken = 0;
    for (const w of worlds.filter((c) => !c.auxData || c.auxData.isDefault === false)) {
      try {
        const { result } = await cdp.send('Runtime.evaluate', {
          contextId: w.id, returnByValue: true,
          expression: "typeof Tirai !== 'undefined' && !!Tirai.masker && (delete window.Highlight, true)",
        });
        if (result.value) broken++;
      } catch { /* a world that is gone */ }
    }
    assert.ok(broken >= 1, 'found the content script world');
    await setSettings(worker, { mode: 'off' });
    await waitForState(page, (i) => i.state.mode === 'off' && i.state.masks === 0, 2000);
    await setSettings(worker, { mode: 'normal' });
    const info = await waitForState(page, (i) => i.state.mode === 'normal' && i.state.maskError === true, 2000);
    assert.equal(info.state.masks, 0);
    assert.ok(near(area(info.tiles), SIDE.w * SIDE.h, SIDE.w * SIDE.h * 0.01), 'the cover stays');
  });
});
