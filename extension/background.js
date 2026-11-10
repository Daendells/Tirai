importScripts('shared/settings.js', 'shared/mode.js', 'shared/files.js');

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

async function initSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: Tirai.settings.normalize(settings) });
}

async function initLive() {
  const { live } = await chrome.storage.session.get('live');
  if (!live) await chrome.storage.session.set({ live: { sharing: false, idle: 'active', sharingTabs: {} } });
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return Tirai.settings.normalize(settings);
}

async function handleCommand(command, tab) {
  if (command === 'toggle-full' && !(tab && tab.url && tab.url.startsWith('https://web.whatsapp.com/'))) {
    if (tab && typeof togglePageCurtain === 'function') await togglePageCurtain(tab.id);
    return;
  }
  const settings = await getSettings();
  await chrome.storage.local.set({ settings: { ...settings, ...Tirai.settings.nextMode(settings, command) } });
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

async function onIdleState(state) {
  const { live } = await chrome.storage.session.get('live');
  await chrome.storage.session.set({ live: { sharing: false, sharingTabs: {}, ...live, idle: state } });
}

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

async function start() {
  await initSettings();
  await publishShortcuts();
  await applySettings(await getSettings());
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await start();
  if (reason === 'install' || reason === 'update') await injectIntoOpenWhatsAppTabs();
});
chrome.runtime.onStartup.addListener(start);
chrome.commands.onCommand.addListener(handleCommand);
chrome.idle.onStateChanged.addListener(onIdleState);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applySettings(changes.settings.newValue);
});
initLive();
