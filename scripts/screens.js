// Writes the 1280x800 store screenshots from the test fixtures (made-up chats only). Run with: node scripts/screens.js
const fs = require('node:fs');
const path = require('node:path');
const { launch, openFixture, copyExtension, waitForState } = require('../tests/e2e/harness');

const manifest = require('../extension/manifest.json');
const OUT = path.resolve(__dirname, '..', 'store', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (page, name) => page.screenshot({ path: path.join(OUT, name) });
const rectOf = (page, sel, n) => page.evaluate((sel, n) => {
  const r = document.querySelectorAll(sel)[n].getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}, sel, n);

async function whatsapp(browser, worker, patch, fn) {
  await worker.evaluate(async (patch) => {
    await chrome.storage.local.set({ settings: Tirai.settings.normalize(patch) });
  }, patch);
  const page = await openFixture(browser, 'https://web.whatsapp.com/', 'whatsapp.html');
  try {
    await waitForState(page, (i) => i.state && i.state.mode === (patch.mode || 'normal'));
    await fn(page);
  } finally { await page.close(); }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, worker } = await launch({ args: ['--lang=id'] });
  try {
    for (let i = 0; i < 50 && !(await worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings)); i++) await sleep(100);

    await whatsapp(browser, worker, {}, async (page) => {
      const row = await rectOf(page, 'div[role="row"]', 2);
      await page.mouse.move(200, row.y + 30);
      await sleep(500);
      await save(page, '1-normal.png');
    });

    await whatsapp(browser, worker, { mode: 'full' }, async (page) => {
      const m = await rectOf(page, '[data-testid="msg-container"]', 2);
      await page.mouse.move(m.x + 10, m.y + 10);
      await sleep(500);
      await save(page, '2-full.png');
    });

    await whatsapp(browser, worker, {}, async (page) => {
      await waitForState(page, (i) => i.state.masks >= 3);
      await page.mouse.move(900, 60);
      await sleep(400);
      await save(page, '3-masks.png');

      // The popup page is shot at its own width, then placed on a quiet 1280x800 page.
      const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }))[0].id);
      const popup = await browser.newPage();
      await popup.setViewport({ width: 360, height: 800, deviceScaleFactor: 2 });
      const extensionId = new URL(worker.url()).hostname;
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html?tabId=${tabId}`);
      await popup.waitForSelector('#status:not(:empty)');
      await sleep(400);
      // Headless Chrome leaves the shortcuts unset, so show the keys the manifest suggests. Only the screenshot is touched.
      const keys = Object.values(manifest.commands).map((c) => c.suggested_key.default);
      await popup.$$eval('kbd', (els, keys) => els.forEach((e, i) => { e.textContent = keys[i]; }), keys);
      const shot = await popup.screenshot({ fullPage: true, encoding: 'base64' });
      await popup.close();
      const stage = await browser.newPage();
      await stage.setViewport({ width: 1280, height: 800 });
      await stage.setContent(`<style>html,body{margin:0;height:100%;background:#f6f4ef}body{display:grid;place-items:center}
        img{max-height:740px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,.08),0 18px 48px rgba(0,0,0,.14)}</style>
        <img src="data:image/png;base64,${shot}">`);
      await save(stage, '4-popup-id.png');
      await stage.close();
    });
  } finally { await browser.close(); }

  // Any-tab curtain: the page needs a host grant, which automation cannot accept, so use a temp copy of the extension.
  const dir = copyExtension({ hostPermissions: ['https://example.com/*'] });
  const { browser: b2, worker: w2 } = await launch({ extensionDir: dir, args: ['--lang=id'] });
  try {
    const page = await openFixture(b2, 'https://example.com/', 'blank.html');
    // The blank fixture has little on it, so give it made-up page text that looks like an account page.
    await page.evaluate(() => {
      document.body.innerHTML = '<h2 style="margin:8px 0 24px">Ringkasan rekening</h2>' + [
        'Nomor rekening BCA 4620981357 a/n Davin Contoh', 'Saldo tersedia Rp 12.480.000', 'Transfer masuk dari Budi Santoso Rp 1.250.000',
        'Pembayaran listrik Rp 482.500', 'Kode OTP Anda 731904, jangan berikan ke siapa pun', 'Transfer keluar ke Sari Dewi Rp 300.000',
        'Pembelian pulsa Rp 100.000', 'Biaya administrasi Rp 15.000'].map((t) => '<p style="margin:0;padding:18px 0;border-bottom:1px solid #ddd">' + t + '</p>').join('');
    });
    const tabId = await w2.evaluate(async () => (await chrome.tabs.query({ url: 'https://example.com/*' }))[0].id);
    await w2.evaluate((id) => togglePageCurtain(id), tabId);
    await waitForState(page, (i) => i.present && i.tiles.length > 0);
    await page.mouse.move(200, 150);
    await sleep(600);
    await save(page, '5-any-tab.png');
  } finally { await b2.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

main().catch((err) => { console.error(err); process.exit(1); });
