// Renders extension/icons/icon.svg to the PNG sizes the manifest uses. Run with: node scripts/icons.js
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { chromePath } = require('../tests/e2e/harness');

const DIR = path.resolve(__dirname, '..', 'extension', 'icons');
const SIZES = [16, 32, 48, 128];

(async () => {
  const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, pipe: true });
  try {
    const page = await browser.newPage();
    for (const size of SIZES) {
      await page.setViewport({ width: size, height: size });
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      await page.screenshot({ path: path.join(DIR, `icon-${size}.png`), omitBackground: true });
      console.log(`icon-${size}.png`);
    }
  } finally { await browser.close(); }
})();
