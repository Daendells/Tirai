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
      { id: 'tirai-share-hook', js: ['content/share-hook.js'], matches: [...matches], runAt: 'document_start', world: 'MAIN', allFrames: true, persistAcrossSessions: true },
      { id: 'tirai-share-relay', js: ['content/share-relay.js'], matches: [...matches], runAt: 'document_start', allFrames: true, persistAcrossSessions: true },
    ];
  }

  const registered = async (ids) => (await chrome.scripting.getRegisteredContentScripts({ ids })).map((s) => s.id);

  async function register() {
    const all = scripts();
    const have = await registered(all.map((s) => s.id));
    const missing = all.filter((s) => !have.includes(s.id));
    if (missing.length) await chrome.scripting.registerContentScripts(missing);
  }

  async function unregister() {
    const have = await registered(scripts().map((s) => s.id));
    if (have.length) await chrome.scripting.unregisterContentScripts({ ids: have });
  }

  async function save(value) {
    const S = settingsApi();
    const cur = S.normalize((await chrome.storage.local.get('settings')).settings);
    await chrome.storage.local.set({ settings: { ...cur, auto: { ...cur.auto, share: value } } });
  }

  // Call this straight from a click: the permission prompt needs the user gesture.
  async function enable() {
    const granted = await chrome.permissions.request({ origins: settingsApi().MEETING_ORIGINS });
    if (!granted) return false;
    await register();
    await save(true);
    return true;
  }

  async function disable() {
    await unregister();
    await save(false);
    await chrome.permissions.remove({ origins: settingsApi().MEETING_ORIGINS });
  }

  async function reconcile(settings) {
    const on = settingsApi().normalize(settings).auto.share;
    if (!on) return unregister();
    if (await chrome.permissions.contains({ origins: settingsApi().MEETING_ORIGINS })) return register();
    return save(false);
  }

  return { enable, disable, reconcile };
});
