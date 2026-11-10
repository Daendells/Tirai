(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['share'] = api;
})(function () {
  const settingsApi = () => (typeof module === 'object' && module.exports ? require('./settings.js') : globalThis.Tirai.settings);

  // Built on each call so a caller can never change the shared lists.
  function scripts() {
    const matches = settingsApi().MEETING_ORIGINS;
    return [
      { id: 'tirai-share-hook', js: ['content/share-hook.js'], matches: [...matches], runAt: 'document_start', world: 'MAIN', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true },
      { id: 'tirai-share-relay', js: ['content/share-relay.js'], matches: [...matches], runAt: 'document_start', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true },
    ];
  }

  const registered = async (ids) => (await chrome.scripting.getRegisteredContentScripts({ ids })).map((s) => s.id);

  async function register() {
    const all = scripts();
    const ids = all.map((s) => s.id);
    const have = await registered(ids);
    const missing = all.filter((s) => !have.includes(s.id));
    if (!missing.length) return;
    try {
      await chrome.scripting.registerContentScripts(missing);
    } catch (err) {
      // Another caller registered the same ids between the check and the call: that is fine.
      if ((await registered(ids)).length !== ids.length) throw err;
    }
  }

  async function unregister() {
    const have = await registered(scripts().map((s) => s.id));
    if (have.length) await chrome.scripting.unregisterContentScripts({ ids: have });
  }

  const save = (value) => settingsApi().withLock(async () => {
    const cur = settingsApi().normalize((await chrome.storage.local.get('settings')).settings);
    await chrome.storage.local.set({ settings: { ...cur, auto: { ...cur.auto, share: value } } });
  });

  // Call this straight from a click: the permission prompt needs the user gesture.
  const request = () => chrome.permissions.request({ origins: settingsApi().MEETING_ORIGINS });

  // Safe to run any number of times, and from the popup and the background at once.
  async function activate() {
    await register();
    await save(true);
  }

  async function enable() {
    if (!(await request())) return false;
    await activate();
    return true;
  }

  async function disable() {
    await unregister();
    await save(false);
    await chrome.permissions.remove({ origins: settingsApi().MEETING_ORIGINS });
  }

  // refresh: replace the registered scripts, so changed matches or files take effect after an update.
  async function reconcile(settings, { refresh = false } = {}) {
    const on = settingsApi().normalize(settings).auto.share;
    if (!on) return unregister();
    if (await chrome.permissions.contains({ origins: settingsApi().MEETING_ORIGINS })) {
      if (refresh) await unregister();
      return register();
    }
    await unregister();
    return save(false);
  }

  return { request, activate, enable, disable, reconcile };
});
