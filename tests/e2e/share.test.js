const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EXT_DIR, copyExtension, launch, openFixture, loadModules, setSettings, waitForState, shot } = require('./harness');

const MEETING = 'https://meet.google.com/tirai-test';
const WHATSAPP = 'https://web.whatsapp.com/';
const MEETING_ORIGINS = require('../../extension/shared/settings.js').MEETING_ORIGINS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeout = 3000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= deadline) throw new Error('until timed out');
    await sleep(50);
  }
}

// The hook and the relay, each loaded the way the extension loads them, in a page with no extension installed.
test.describe('share hook and relay in a page', () => {
  let browser, page;

  before(async () => { ({ browser } = await launch({ install: false })); });
  after(async () => { if (browser) await browser.close(); });

  // The meeting page gets a fake getDisplayMedia first, then the hook is added, as it would be at document_start.
  async function meetingWithFake() {
    page = await openFixture(browser, MEETING, 'meeting.html');
    await page.evaluate(() => {
      window.messages = [];
      window.addEventListener('message', (e) => { if (e.data && e.data.__tirai === 'share') window.messages.push(e.data); });
      const canvasTrack = () => document.createElement('canvas').captureStream().getVideoTracks()[0];
      window.tracksPerShare = 1;
      window.rejectNext = false;
      MediaDevices.prototype.getDisplayMedia = async function getDisplayMedia() {
        if (window.rejectNext) throw new DOMException('no', 'NotAllowedError');
        return new MediaStream(Array.from({ length: window.tracksPerShare }, canvasTrack));
      };
    });
    await loadModules(page, ['content/share-hook.js']);
    return page;
  }
  const messages = () => page.evaluate(() => window.messages);
  const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

  test('getDisplayMedia posts active true and track.stop() posts active false', async () => {
    await meetingWithFake();
    const sameStream = await page.evaluate(async () => {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      window.s = s;
      return s instanceof MediaStream && s.getVideoTracks()[0].readyState === 'live';
    });
    assert.equal(sameStream, true);
    await settle();
    const started = await messages();
    assert.equal(started.length, 1);
    assert.equal(started[0].active, true);
    assert.equal(typeof started[0].id, 'string');
    await page.evaluate(() => window.s.getVideoTracks()[0].stop());
    await settle();
    const all = await messages();
    assert.equal(all.length, 2);
    assert.deepEqual({ ...all[1] }, { __tirai: 'share', active: false, id: started[0].id });
    await page.close();
  });

  test('it only reports the end once every video track has ended', async () => {
    await meetingWithFake();
    await page.evaluate(async () => {
      window.tracksPerShare = 2;
      window.s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      window.s.getVideoTracks()[0].stop();
    });
    await settle();
    assert.deepEqual((await messages()).map((m) => m.active), [true]);
    await page.evaluate(() => window.s.getVideoTracks()[1].stop());
    await settle();
    assert.deepEqual((await messages()).map((m) => m.active), [true, false]);
    await page.close();
  });

  test('loading it twice wraps once, and a refused request passes through untouched', async () => {
    await meetingWithFake();
    await loadModules(page, ['content/share-hook.js']);
    const name = await page.evaluate(async () => {
      window.rejectNext = true;
      try { await navigator.mediaDevices.getDisplayMedia({ video: true }); return 'resolved'; } catch (e) { return e.name; }
    });
    assert.equal(name, 'NotAllowedError');
    await page.evaluate(async () => {
      window.rejectNext = false;
      window.s = await navigator.mediaDevices.getDisplayMedia({ video: true });
    });
    await settle();
    assert.deepEqual((await messages()).map((m) => m.active), [true]);
    await page.close();
  });

  test('a clone of a shared track keeps the share going until the clone ends too', async () => {
    await meetingWithFake();
    await page.evaluate(async () => {
      window.s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      window.copy = window.s.getVideoTracks()[0].clone();
      window.s.getVideoTracks()[0].stop();
    });
    await settle();
    assert.deepEqual((await messages()).map((m) => m.active), [true]);
    assert.equal(await page.evaluate(() => window.copy.readyState), 'live');
    await page.evaluate(() => window.copy.stop());
    await settle();
    assert.deepEqual((await messages()).map((m) => m.active), [true, false]);
    await page.close();
  });

  test('every two seconds a live share is announced again, and an ended one is not', async () => {
    await meetingWithFake();
    await page.evaluate(async () => { window.s = await navigator.mediaDevices.getDisplayMedia({ video: true }); });
    await sleep(2400);
    const again = await messages();
    assert.deepEqual(again.map((m) => m.active), [true, true]);
    assert.equal(again[1].id, again[0].id);
    await page.evaluate(() => window.s.getVideoTracks()[0].stop());
    await sleep(2400);
    assert.deepEqual((await messages()).map((m) => m.active), [true, true, false]);
    await page.close();
  });

  test('it keeps working when the page replaces the globals it uses', async () => {
    await meetingWithFake();
    await page.evaluate(async () => {
      window.s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      window.setInterval = () => 0;
      window.clearInterval = () => {};
      window.postMessage = () => {};
      window.s.getVideoTracks()[0].stop();
    });
    await settle();
    assert.deepEqual((await messages()).map((m) => m.active), [true, false]);
    await page.close();
  });

  test('a page that navigates away reports the end', async () => {
    await meetingWithFake();
    await page.evaluate(async () => {
      window.s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    });
    await settle();
    assert.deepEqual((await messages()).map((m) => m.active), [true, false]);
    await page.close();
  });

  test('the relay says every live share ended when the page goes away', async () => {
    page = await openFixture(browser, MEETING, 'meeting.html');
    await page.evaluate(() => {
      window.sent = [];
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        value: { runtime: { sendMessage: (m) => { window.sent.push(m); return Promise.resolve(); } } },
      });
    });
    await loadModules(page, ['content/share-relay.js']);
    await page.evaluate(async () => {
      window.postMessage({ __tirai: 'share', active: true, id: 'a' }, '*');
      window.postMessage({ __tirai: 'share', active: true, id: 'b' }, '*');
      window.postMessage({ __tirai: 'share', active: false, id: 'a' }, '*');
      await new Promise((r) => setTimeout(r, 50));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    });
    assert.deepEqual(await page.evaluate(() => window.sent.map((m) => m.active + ':' + m.id)), ['true:a', 'true:b', 'false:a', 'false:b']);
    await page.close();
  });

  test('the relay forwards only messages the page posted to itself', async () => {
    page = await openFixture(browser, MEETING, 'meeting.html');
    await page.evaluate(() => {
      window.sent = [];
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        value: { runtime: { sendMessage: (m) => { window.sent.push(m); return Promise.resolve(); } } },
      });
    });
    await loadModules(page, ['content/share-relay.js']);
    await page.evaluate(async () => {
      window.postMessage({ __tirai: 'share', active: true, id: 'a' }, '*');
      window.postMessage({ __tirai: 'other', active: true, id: 'b' }, '*');
      window.postMessage('share', '*');
      window.postMessage(null, '*');
      window.postMessage({ __tirai: 'share', active: 'yes', id: 'c' }, '*');
      const frame = document.createElement('iframe');
      document.body.append(frame);
      frame.contentWindow.eval('parent.postMessage({ __tirai: "share", active: true, id: "d" }, "*")');
      await new Promise((r) => setTimeout(r, 100));
    });
    assert.deepEqual(await page.evaluate(() => window.sent), [{ type: 'share', active: true, id: 'a' }]);
    await page.close();
  });
});

// Real extension, patched copy that already holds the meeting permissions, because automation cannot accept the
// permission prompt. A real tab capture works headless with the two flags below, so nothing here is simulated.
test.describe('sharing in a meeting covers WhatsApp', () => {
  let dir, browser, worker, wa, pillText;

  before(async () => {
    dir = copyExtension({ hostPermissions: MEETING_ORIGINS });
    ({ browser, worker } = await launch({
      extensionDir: dir, args: ['--auto-accept-this-tab-capture', '--use-fake-ui-for-media-stream'],
    }));
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    await setSettings(worker, { auto: { share: true } });
    await worker.evaluate(async () => Tirai.share.reconcile((await chrome.storage.local.get('settings')).settings));
    pillText = await worker.evaluate(() => chrome.i18n.getMessage('pillShare'));
    wa = await openFixture(browser, WHATSAPP, 'whatsapp.html');
    await waitForState(wa, (i) => i.state && i.state.mode === 'normal');
  });
  after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function startShare() {
    const meeting = await openFixture(browser, MEETING, 'meeting.html');
    await meeting.click('#share');
    await meeting.waitForFunction(() => document.getElementById('result').textContent === 'sharing', { timeout: 10000 });
    return meeting;
  }
  const liveOf = () => worker.evaluate(async () => (await chrome.storage.session.get('live')).live);

  test('reconcile registered the hook and the relay', async () => {
    const ids = await worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
    assert.deepEqual(ids.sort(), ['tirai-share-hook', 'tirai-share-relay']);
  });

  test('starting a share covers everything within 1.5 s, stopping returns to normal within 3 s', async () => {
    const meeting = await startShare();
    try {
      const covered = await waitForState(wa, (i) => i.state.reason === 'share', 1500);
      const { mode, reason, lamp } = covered.state;
      assert.deepEqual({ mode, reason, lamp }, { mode: 'full', reason: 'share', lamp: false });
      assert.equal(covered.pill, pillText);
      assert.equal((await liveOf()).sharing, true);
      await shot(wa, 'share-covered');

      await meeting.click('#stop');
      const normal = await waitForState(wa, (i) => i.state.reason === 'user', 3000);
      assert.equal(normal.state.mode, 'normal');
      assert.equal((await liveOf()).sharing, false);
    } finally {
      await meeting.close();
    }
  });

  test('closing the meeting tab while sharing returns WhatsApp to normal', async () => {
    const meeting = await startShare();
    await waitForState(wa, (i) => i.state.reason === 'share', 1500);
    await meeting.close();
    await waitForState(wa, (i) => i.state.reason === 'user', 3000);
    const live = await liveOf();
    assert.equal(live.sharing, false);
    assert.deepEqual(live.sharingTabs, {});
  });

  test('reloading the meeting tab while sharing returns WhatsApp to normal', async () => {
    const meeting = await startShare();
    try {
      await waitForState(wa, (i) => i.state.reason === 'share', 1500);
      await meeting.reload({ waitUntil: 'load' });
      await waitForState(wa, (i) => i.state.reason === 'user', 3000);
      assert.equal((await liveOf()).sharing, false);
    } finally {
      await meeting.close();
    }
  });

  // Moving around inside the meeting page says nothing about the share, so the cover must stay.
  test('an iframe, an iframe navigation and a URL change inside the page do not end the share', async () => {
    const meeting = await startShare();
    try {
      await waitForState(wa, (i) => i.state.reason === 'share', 1500);
      const stayCovered = async (ms) => {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          assert.equal((await waitForState(wa, (i) => i.state, 500)).state.reason, 'share');
          await sleep(100);
        }
      };
      await meeting.evaluate(() => new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.id = 'side';
        frame.onload = resolve;
        frame.srcdoc = '<p>first</p>';
        document.body.append(frame);
      }));
      await stayCovered(800);
      await meeting.evaluate(() => new Promise((resolve) => {
        const frame = document.getElementById('side');
        frame.onload = resolve;
        frame.srcdoc = '<p>second</p>';
      }));
      await stayCovered(800);
      await meeting.evaluate(() => history.pushState({}, '', '/tirai-test?room=2'));
      await stayCovered(800);
      assert.equal((await liveOf()).sharing, true);

      await meeting.click('#stop');
      const normal = await waitForState(wa, (i) => i.state.reason === 'user', 3000);
      assert.equal(normal.state.mode, 'normal');
    } finally {
      await meeting.close();
    }
  });

  test('a share the background lost track of is announced again and covers again', async () => {
    const meeting = await startShare();
    try {
      await waitForState(wa, (i) => i.state.reason === 'share', 1500);
      const [tabId] = Object.keys((await liveOf()).sharingTabs).map(Number);
      await worker.evaluate((id) => clearShareTab(id), tabId);
      await waitForState(wa, (i) => i.state.reason === 'user', 1000);
      await waitForState(wa, (i) => i.state.reason === 'share', 3500);
      await meeting.click('#stop');
      await waitForState(wa, (i) => i.state.reason === 'user', 3000);
    } finally {
      await meeting.close();
    }
  });

  test('with the setting off, a share changes nothing and the scripts are gone', async () => {
    await setSettings(worker, { auto: { share: false } });
    await worker.evaluate(async () => Tirai.share.reconcile((await chrome.storage.local.get('settings')).settings));
    assert.deepEqual(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
    const meeting = await startShare();
    await sleep(500);
    assert.equal((await liveOf()).sharing, false);
    assert.equal((await waitForState(wa, (i) => i.state)).state.reason, 'user');
    await meeting.close();
  });

  test('when the meeting sites are granted, the background finishes turning the switch on', async () => {
    await worker.evaluate(() => onPermissionsAdded({ origins: ['https://example.com/*'] }));
    assert.deepEqual(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
    await worker.evaluate((origins) => onPermissionsAdded({ origins }), MEETING_ORIGINS);
    const ids = await worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
    assert.deepEqual(ids.sort(), ['tirai-share-hook', 'tirai-share-relay']);
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).auto.share, true);
  });
});

test('the unpatched extension has no meeting permission, so reconciling switches the feature off', async () => {
  const { browser, worker } = await launch({ extensionDir: EXT_DIR });
  try {
    await until(() => worker.evaluate(async () => !!(await chrome.storage.local.get('settings')).settings), 5000);
    const getSettings = () => worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    const ids = () => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
    // Enabled and registered, then the permission goes away (this is what chrome.permissions.onRemoved triggers).
    await worker.evaluate(() => Tirai.share.activate());
    assert.equal((await getSettings()).auto.share, true);
    assert.equal((await ids()).length, 2);
    await worker.evaluate(() => reconcileShare());
    assert.equal((await getSettings()).auto.share, false);
    assert.deepEqual(await ids(), []);
    // A grant event while the permission is still missing changes nothing.
    await worker.evaluate((origins) => onPermissionsAdded({ origins }), MEETING_ORIGINS);
    assert.equal((await getSettings()).auto.share, false);
    assert.deepEqual(await ids(), []);
  } finally {
    await browser.close();
  }
});
