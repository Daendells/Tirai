(() => {
  const { normalize, chatRule, withChatRule } = Tirai.settings;
  const $ = (id) => document.getElementById(id);
  const queryTab = new URLSearchParams(location.search).get('tabId');
  let settings = normalize(null);
  let tab = null;
  let info = null;

  const i18n = (key, ...a) => chrome.i18n.getMessage(key, a.map(String)) || key;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const set = (el, key, args) => {
    el.dataset.i18n = key;
    if (args) el.dataset.i18nArgs = JSON.stringify(args);
    Tirai.ui.localize(el.parentNode);
  };

  async function findTab() {
    if (queryTab) return chrome.tabs.get(Number(queryTab)).catch(() => null);
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null;
  }

  // null: not a WhatsApp tab. false: no answer (page needs a reload).
  async function fetchInfo() {
    if (!tab || !tab.url || !tab.url.startsWith('https://web.whatsapp.com/')) return null;
    try { return (await chrome.tabs.sendMessage(tab.id, { type: 'status' })) || false; } catch { return false; }
  }

  function statusKey() {
    if (info === null) return 'statusOtherTab';
    if (!info) return 'statusReload';
    if (info.health === 'fallback') return 'statusFallback';
    if (info.health === 'idle') return 'statusLoggedOut';
    const s = info.state || {};
    if (s.reason === 'share') return 'statusShare';
    if (s.reason === 'unfocus') return 'statusUnfocus';
    if (s.reason === 'idle') return 'statusIdle';
    if (s.mode === 'off') return 'statusOff';
    return s.mode === 'full' ? 'statusFull' : 'statusActive';
  }

  function render() {
    const key = statusKey();
    const status = $('status');
    if (status.dataset.i18n !== key) set(status, key);

    $('mode-' + settings.mode).checked = true;
    set($('modeHelp'), 'modeHelp' + cap(settings.mode));

    const title = info && info.title;
    $('chat').hidden = !title;
    if (title) {
      $('chatTitle').textContent = title;
      const rule = chatRule(settings, title);
      $('rule-' + rule).checked = true;
      set($('ruleHelp'), 'ruleHelp' + cap(rule));
    }

    $('sensitive').checked = settings.sensitive.enabled;
    $('share').checked = settings.auto.share;
    $('unfocus').checked = settings.auto.unfocus;
    $('idle').checked = settings.auto.idle;
    set($('idleHelp'), 'switchIdleHelp', [settings.auto.idleSeconds]);
  }

  // Refresh the shared shortcut keys so the in-page pill follows a rebinding.
  async function renderShortcuts() {
    const keys = {};
    try {
      for (const c of await chrome.commands.getAll()) keys[c.name] = c.shortcut || '';
      await chrome.storage.session.set({ shortcuts: { toggleFull: keys['toggle-full'] || '', toggleOff: keys['toggle-off'] || '' } });
    } catch { /* show what we have */ }
    $('keyFull').textContent = keys['toggle-full'] || i18n('shortcutUnset');
    $('keyOff').textContent = keys['toggle-off'] || i18n('shortcutUnset');
  }

  // Edits read storage fresh and run one after another, so quick clicks never overwrite each other.
  let queue = Promise.resolve();
  const edit = (fn) => {
    queue = queue.then(async () => {
      const current = normalize((await chrome.storage.local.get('settings')).settings);
      await chrome.storage.local.set({ settings: normalize(fn(current)) });
    });
    return queue;
  };

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'mode') edit((s) => ({ ...s, mode: t.value, lastOnMode: t.value === 'off' ? s.lastOnMode : t.value }));
    else if (t.name === 'rule') edit((s) => withChatRule(s, info.title, t.value));
    else if (t.id === 'sensitive') edit((s) => ({ ...s, sensitive: { ...s.sensitive, enabled: t.checked } }));
    else if (t.id === 'unfocus') edit((s) => ({ ...s, auto: { ...s.auto, unfocus: t.checked } }));
    else if (t.id === 'idle') edit((s) => ({ ...s, auto: { ...s.auto, idle: t.checked } }));
  });
  // The permission prompt needs the click's user gesture, so enable() is called right here, before any await.
  $('share').addEventListener('click', async (e) => {
    const box = e.currentTarget;
    const want = box.checked;
    box.disabled = true;
    let ok = false;
    try {
      if (want) ok = await Tirai.share.enable();
      else { await Tirai.share.disable(); ok = true; }
    } catch { /* treated like a refusal below */ }
    box.disabled = false;
    if (!ok) box.checked = !want;
    $('shareDenied').hidden = ok;
    box.setAttribute('aria-describedby', ok ? 'shareHelp' : 'shareHelp shareDenied');
  });
  $('editShortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

  let refresh;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = normalize(changes.settings.newValue);
    render();
    // The page re-renders on its own schedule, so ask again shortly after.
    clearTimeout(refresh);
    refresh = setTimeout(async () => { info = await fetchInfo(); render(); }, 250);
  });

  (async () => {
    Tirai.ui.localize();
    $('openOptions').hidden = !chrome.runtime.getManifest().options_page;
    settings = normalize((await chrome.storage.local.get('settings')).settings);
    tab = await findTab();
    info = await fetchInfo();
    render();
    await renderShortcuts();
  })();
})();
