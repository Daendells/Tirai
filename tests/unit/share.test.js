const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../../extension/shared/settings.js');

const { MEETING_ORIGINS } = settings;
const HOOK = {
  id: 'tirai-share-hook', js: ['content/share-hook.js'], matches: MEETING_ORIGINS, runAt: 'document_start',
  world: 'MAIN', allFrames: true, persistAcrossSessions: true,
};
const RELAY = {
  id: 'tirai-share-relay', js: ['content/share-relay.js'], matches: MEETING_ORIGINS, runAt: 'document_start',
  allFrames: true, persistAcrossSessions: true,
};

// A small stand-in for the chrome.* calls that share.js makes. Like the real API, registering a known id and
// unregistering an unknown id both throw.
// slow makes every storage call take a tick, so two unguarded read-modify-writes would interleave.
function fakeChrome({ grant = true, held = true, registered = [], stored = undefined, raceOnRegister = false, slow = false } = {}) {
  const state = { requests: [], removals: [], scripts: new Map(registered.map((id) => [id, { id }])), sets: 0, stored };
  const tick = () => (slow ? new Promise((r) => setTimeout(r, 2)) : Promise.resolve());
  globalThis.chrome = {
    permissions: {
      request: async (p) => { state.requests.push(p); return grant; },
      contains: async () => held,
      remove: async (p) => { state.removals.push(p); return true; },
    },
    scripting: {
      registerContentScripts: async (list) => {
        if (raceOnRegister) {
          // Someone else registers the same scripts first, so this call fails with a duplicate id.
          raceOnRegister = false;
          for (const s of list) state.scripts.set(s.id, s);
        }
        for (const s of list) {
          if (state.scripts.has(s.id)) throw new Error('Duplicate script ID ' + s.id);
          state.scripts.set(s.id, s);
        }
      },
      getRegisteredContentScripts: async ({ ids } = {}) => [...state.scripts.values()].filter((s) => !ids || ids.includes(s.id)),
      unregisterContentScripts: async ({ ids }) => {
        for (const id of ids) if (!state.scripts.has(id)) throw new Error('Nonexistent script ID ' + id);
        for (const id of ids) state.scripts.delete(id);
      },
    },
    storage: {
      local: {
        get: async () => { const v = state.stored; await tick(); return v === undefined ? {} : { settings: v }; },
        set: async (o) => { await tick(); state.sets++; state.stored = o.settings; },
      },
    },
  };
  return state;
}

const share = require('../../extension/shared/share.js');
const on = () => settings.normalize({ blurPx: 20, auto: { share: true } });

test.afterEach(() => { delete globalThis.chrome; });

test('enable() returns false and changes nothing when the permission is refused', async () => {
  const s = fakeChrome({ grant: false, stored: settings.normalize({ blurPx: 20 }) });
  assert.equal(await share.enable(), false);
  assert.deepEqual(s.requests, [{ origins: MEETING_ORIGINS }]);
  assert.equal(s.scripts.size, 0);
  assert.equal(s.sets, 0);
  assert.equal(s.stored.auto.share, false);
});

test('enable() registers the two scripts and saves auto.share', async () => {
  const s = fakeChrome({ stored: settings.normalize({ blurPx: 20 }) });
  assert.equal(await share.enable(), true);
  assert.deepEqual(s.requests, [{ origins: MEETING_ORIGINS }]);
  assert.deepEqual(s.scripts.get('tirai-share-hook'), HOOK);
  assert.deepEqual(s.scripts.get('tirai-share-relay'), RELAY);
  assert.equal(s.scripts.size, 2);
  assert.equal(s.stored.auto.share, true);
  assert.equal(s.stored.blurPx, 20);
});

test('enable() starts from the defaults when nothing is stored, and skips ids already registered', async () => {
  const s = fakeChrome({ registered: ['tirai-share-hook'] });
  assert.equal(await share.enable(), true);
  assert.deepEqual(s.scripts.get('tirai-share-relay'), RELAY);
  assert.deepEqual(s.scripts.get('tirai-share-hook'), { id: 'tirai-share-hook' });
  assert.equal(s.stored.auto.share, true);
  assert.equal(s.stored.mode, 'normal');
});

test('disable() unregisters both ids, removes the permission and saves auto.share false', async () => {
  const s = fakeChrome({ registered: ['tirai-share-hook', 'tirai-share-relay'], stored: on() });
  await share.disable();
  assert.equal(s.scripts.size, 0);
  assert.deepEqual(s.removals, [{ origins: MEETING_ORIGINS }]);
  assert.equal(s.stored.auto.share, false);
  assert.equal(s.stored.blurPx, 20);
});

test('disable() ignores ids that are not registered', async () => {
  const s = fakeChrome({ registered: ['tirai-share-relay'], stored: on() });
  await share.disable();
  assert.equal(s.scripts.size, 0);
  const none = fakeChrome({ stored: on() });
  await share.disable();
  assert.equal(none.stored.auto.share, false);
});

test('reconcile: on with the permission registers the missing scripts', async () => {
  const s = fakeChrome({ held: true, registered: ['tirai-share-relay'] });
  await share.reconcile(on());
  assert.deepEqual(s.scripts.get('tirai-share-hook'), HOOK);
  assert.equal(s.scripts.size, 2);
  assert.equal(s.sets, 0);
});

test('reconcile: on without the permission unregisters the scripts and turns the setting off', async () => {
  const s = fakeChrome({ held: false, stored: on(), registered: ['tirai-share-hook', 'tirai-share-relay'] });
  await share.reconcile(on());
  assert.equal(s.scripts.size, 0);
  assert.equal(s.stored.auto.share, false);
  assert.equal(s.stored.blurPx, 20);
});

test('reconcile: off unregisters whatever is registered and leaves the permission alone', async () => {
  const s = fakeChrome({ registered: ['tirai-share-hook', 'tirai-share-relay'], stored: settings.normalize({}) });
  await share.reconcile(settings.normalize({}));
  assert.equal(s.scripts.size, 0);
  assert.deepEqual(s.removals, []);
  assert.equal(s.sets, 0);
  await share.reconcile(undefined);
  assert.equal(s.scripts.size, 0);
});

test('reconcile with refresh replaces scripts that are already registered', async () => {
  const s = fakeChrome({ held: true, registered: ['tirai-share-hook', 'tirai-share-relay'] });
  await share.reconcile(on(), { refresh: true });
  assert.deepEqual(s.scripts.get('tirai-share-hook'), HOOK);
  assert.deepEqual(s.scripts.get('tirai-share-relay'), RELAY);
  await share.reconcile(settings.normalize({}), { refresh: true });
  assert.equal(s.scripts.size, 0);
});

test('activate() can run again and again, and does not need a permission request', async () => {
  const s = fakeChrome({ stored: settings.normalize({ blurPx: 20 }) });
  await share.activate();
  await share.activate();
  assert.deepEqual(s.requests, []);
  assert.equal(s.scripts.size, 2);
  assert.deepEqual(s.scripts.get('tirai-share-relay'), RELAY);
  assert.equal(s.stored.auto.share, true);
  assert.equal(s.stored.blurPx, 20);
});

test('a duplicate-id race while registering is tolerated, a real failure is not', async () => {
  const raced = fakeChrome({ raceOnRegister: true });
  assert.equal(await share.enable(), true);
  assert.equal(raced.scripts.size, 2);
  assert.equal(raced.stored.auto.share, true);

  const broken = fakeChrome();
  globalThis.chrome.scripting.registerContentScripts = async () => { throw new Error('Invalid match pattern'); };
  await assert.rejects(share.activate(), /Invalid match pattern/);
  assert.equal(broken.stored, undefined);
});

test('a share save and another settings edit at the same time both survive (Web Locks)', async () => {
  let tail = Promise.resolve(); // a minimal lock manager: one holder at a time
  const locks = { request: (name, fn) => { const run = tail.then(fn); tail = run.catch(() => {}); return run; } };
  Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true, writable: true });
  try {
    const s = fakeChrome({ stored: settings.normalize({}), slow: true });
    const edit = () => settings.withLock(async () => {
      const cur = settings.normalize((await chrome.storage.local.get('settings')).settings);
      await chrome.storage.local.set({ settings: { ...cur, blurPx: 22 } });
    });
    await Promise.all([share.activate(), edit(), edit()]);
    assert.equal(s.stored.auto.share, true);
    assert.equal(s.stored.blurPx, 22);
  } finally {
    delete globalThis.navigator;
  }
});

test('without Web Locks the lock helper just runs the function', async () => {
  assert.equal(await settings.withLock(async () => 7), 7);
});
