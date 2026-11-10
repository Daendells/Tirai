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

chrome.runtime.onInstalled.addListener(initSettings);
chrome.runtime.onStartup.addListener(initSettings);
initLive();
