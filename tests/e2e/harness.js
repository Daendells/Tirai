const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const EXT_DIR = path.join(ROOT, 'extension');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const ARTIFACTS = path.join(__dirname, 'artifacts');
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/usr/bin/google-chrome';
}

async function launch({ extensionDir = EXT_DIR, install = true, args = [] } = {}) {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: !process.env.HEADFUL,
    pipe: true,
    enableExtensions: install ? [extensionDir] : true,
    defaultViewport: { width: 1280, height: 800 },
    args,
  });
  if (!install) return { browser, extensionId: null, worker: null };
  try {
    const target = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 10000 });
    return { browser, extensionId: new URL(target.url()).hostname, worker: await target.worker() };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function openFixture(browser, url, fixtureFile) {
  const page = await browser.newPage();
  const html = fs.readFileSync(path.join(FIXTURES, fixtureFile));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (req.isInterceptResolutionHandled()) return;
    if (u === url) req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    else if (u.startsWith('https://pps.whatsapp.net/')) req.respond({ status: 200, contentType: 'image/png', body: PNG_1X1 });
    else if (u.startsWith('chrome-extension://') || u.startsWith('data:')) req.continue();
    else req.abort();
  });
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

async function loadModules(page, relPaths) {
  for (const rel of relPaths) await page.addScriptTag({ path: path.join(EXT_DIR, rel) });
}

const patchStorage = (area) => (worker, key, patch) => worker.evaluate(
  async (area, key, patch) => {
    const cur = (await chrome.storage[area].get(key))[key] || {};
    await chrome.storage[area].set({ [key]: { ...cur, ...patch } });
  }, area, key, patch);

const setSettings = (worker, patch) => patchStorage('local')(worker, 'settings', patch);
const setLive = (worker, patch) => patchStorage('session')(worker, 'live', patch);

function curtainInfo(page) {
  return page.evaluate(() => {
    const host = document.documentElement.querySelector('tirai-curtain');
    if (!host) return { present: false, state: null, tiles: [], pill: null };
    let state = null;
    try { state = JSON.parse(host.dataset.state); } catch { /* missing or invalid */ }
    const root = host.shadowRoot;
    const n = (v) => Math.round(parseFloat(v) || 0);
    const tiles = root ? [...root.querySelectorAll('.tile')].map((t) => (
      { x: n(t.style.left), y: n(t.style.top), w: n(t.style.width), h: n(t.style.height) })) : [];
    const p = root && root.querySelector('.pill');
    const shown = p && !p.hidden && getComputedStyle(p).display !== 'none';
    return { present: true, state, tiles, pill: shown ? p.textContent : null };
  });
}

async function waitForState(page, predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  let info;
  for (;;) {
    info = await curtainInfo(page);
    if (predicate(info)) return info;
    if (Date.now() >= deadline) throw new Error('waitForState timed out, last: ' + JSON.stringify(info));
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function shot(page, name) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACTS, name + '.png') });
}

module.exports = { EXT_DIR, launch, openFixture, loadModules, setSettings, setLive, curtainInfo, waitForState, shot };
