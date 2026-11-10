importScripts('shared/settings.js', 'shared/mode.js', 'shared/files.js', 'shared/share.js');

const MAX_SHARE_IDS = 20;
const DEFAULT_LIVE = { sharing: false, idle: 'active', sharingTabs: {} };

// Every read-modify-write of storage runs through this one queue, so two quick events never overwrite each other.
let writeQueue = Promise.resolve();
function serialized(fn) {
  const run = writeQueue.then(fn);
  writeQueue = run.catch(() => {});
  return run;
}

// For listeners nobody awaits: a failure is logged instead of surfacing as an unhandled rejection.
const guard = (fn) => (...args) => { Promise.resolve().then(() => fn(...args)).catch((err) => console.error('Tirai:', err)); };

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch((err) => console.error('Tirai:', err));

const initSettings = () => serialized(() => Tirai.settings.withLock(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: Tirai.settings.normalize(settings) });
}));

const initLive = () => serialized(async () => {
  const { live } = await chrome.storage.session.get('live');
  if (!live) await chrome.storage.session.set({ live: DEFAULT_LIVE });
});

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return Tirai.settings.normalize(settings);
}

async function handleCommand(command, tab) {
  if (command === 'toggle-full' && !(tab && tab.url && tab.url.startsWith('https://web.whatsapp.com/'))) {
    if (tab && typeof togglePageCurtain === 'function') await togglePageCurtain(tab.id);
    return;
  }
  await serialized(() => Tirai.settings.withLock(async () => {
    const settings = await getSettings();
    await chrome.storage.local.set({ settings: { ...settings, ...Tirai.settings.nextMode(settings, command) } });
  }));
}

async function publishShortcuts() {
  const keys = {};
  for (const c of await chrome.commands.getAll()) keys[c.name] = c.shortcut || '';
  await chrome.storage.session.set({ shortcuts: { toggleFull: keys['toggle-full'] || '', toggleOff: keys['toggle-off'] || '' } });
}

const BADGES = { full: { text: '●', color: '#b8461b' }, off: { text: 'off', color: '#6b665e' } };

async function updateBadge(settings) {
  const mode = Tirai.settings.normalize(settings).mode;
  const badge = BADGES[mode] || { text: '' };
  await chrome.action.setBadgeText({ text: badge.text });
  if (badge.color) await chrome.action.setBadgeBackgroundColor({ color: badge.color });
  await chrome.action.setTitle({ title: chrome.i18n.getMessage('titleMode_' + mode) });
}

const onIdleState = (state) => serialized(async () => {
  const { live } = await chrome.storage.session.get('live');
  await chrome.storage.session.set({ live: { ...DEFAULT_LIVE, ...live, idle: state } });
});

// Changes the list of share ids for one tab and recomputes live.sharing from all tabs.
function updateShareTab(tabId, change) {
  return serialized(async () => {
    const { live } = await chrome.storage.session.get('live');
    const base = { ...DEFAULT_LIVE, ...live };
    const ids = change(base.sharingTabs[tabId] || []);
    if (!ids.length && !(tabId in base.sharingTabs)) return;
    const sharingTabs = { ...base.sharingTabs, [tabId]: ids };
    if (!ids.length) delete sharingTabs[tabId];
    const sharing = Object.values(sharingTabs).some((list) => list.length > 0);
    await chrome.storage.session.set({ live: { ...base, sharingTabs, sharing } });
  });
}

function onShareMessage(msg, sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  const ok = msg && msg.type === 'share' && typeof msg.active === 'boolean' && typeof msg.id === 'string'
    && msg.id.length > 0 && msg.id.length <= 100 && Number.isInteger(tabId);
  if (!ok) return Promise.resolve();
  return updateShareTab(tabId, (ids) => {
    if (!msg.active) return ids.filter((id) => id !== msg.id);
    return ids.includes(msg.id) || ids.length >= MAX_SHARE_IDS ? ids : [...ids, msg.id];
  });
}

const clearShareTab = (tabId) => updateShareTab(tabId, () => []);

async function applySettings(settings) {
  const s = Tirai.settings.normalize(settings);
  chrome.idle.setDetectionInterval(s.auto.idleSeconds);
  await updateBadge(s);
}

async function injectIntoOpenWhatsAppTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const { id: tabId } of tabs) {
    try {
      if (Tirai.files.CONTENT_CSS.length) await chrome.scripting.insertCSS({ target: { tabId }, files: Tirai.files.CONTENT_CSS });
      await chrome.scripting.executeScript({ target: { tabId }, files: Tirai.files.CONTENT_JS });
    } catch { /* tab closed, discarded or not scriptable: skip it */ }
  }
}

// Makes the registered share scripts and the setting match the permission the browser actually holds.
const reconcileShare = (options) => serialized(async () => Tirai.share.reconcile(await getSettings(), options));

async function start(options) {
  await initSettings();
  await publishShortcuts();
  await applySettings(await getSettings());
  await reconcileShare(options);
}

// Granting the meeting sites from the popup can be cut short if the popup closes, so finish the job here. Only when
// every meeting site is held: one site granted by hand in the browser's site settings is not the switch being turned on.
const onPermissionsAdded = ({ origins = [] } = {}) => serialized(async () => {
  const { MEETING_ORIGINS } = Tirai.settings;
  if (origins.some((o) => MEETING_ORIGINS.includes(o)) && await chrome.permissions.contains({ origins: MEETING_ORIGINS })) {
    await Tirai.share.activate();
  }
});

async function onInstalled({ reason }) {
  try {
    await start({ refresh: reason === 'update' });
  } finally {
    if (reason === 'install' || reason === 'update') await injectIntoOpenWhatsAppTabs();
  }
}

chrome.runtime.onInstalled.addListener(guard(onInstalled));
chrome.runtime.onStartup.addListener(guard(start));
chrome.commands.onCommand.addListener(guard(handleCommand));
chrome.idle.onStateChanged.addListener(guard(onIdleState));
chrome.storage.onChanged.addListener(guard(async (changes, area) => {
  if (area === 'local' && changes.settings) await applySettings(changes.settings.newValue);
}));
chrome.runtime.onMessage.addListener((msg, sender) => { if (msg && msg.type === 'share') guard(onShareMessage)(msg, sender); });
chrome.permissions.onAdded.addListener(guard(onPermissionsAdded));
chrome.permissions.onRemoved.addListener(guard(() => reconcileShare()));
// A share ends when the page says so or the tab goes away. Navigation inside the tab proves nothing.
chrome.tabs.onRemoved.addListener(guard(clearShareTab));
guard(initLive)();
