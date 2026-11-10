const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch } = require('./harness');
const { DEFAULTS } = require('../../extension/shared/settings.js');

test('launch loads the extension and it stores default settings', async (t) => {
  const { browser, extensionId, worker } = await launch();
  t.after(() => browser.close());
  assert.match(extensionId, /^[a-p]{32}$/);
  const deadline = Date.now() + 3000;
  let settings;
  while (Date.now() < deadline) {
    settings = (await worker.evaluate(() => chrome.storage.local.get('settings'))).settings;
    if (settings) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.deepEqual(settings, DEFAULTS);
});
