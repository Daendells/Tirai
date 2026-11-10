// Runs in the extension's own world. Passes the hook's page messages on to the background.
window.addEventListener('message', (e) => {
  const d = e.data;
  if (e.source !== window || !d || d.__tirai !== 'share' || typeof d.active !== 'boolean' || typeof d.id !== 'string') return;
  try {
    chrome.runtime.sendMessage({ type: 'share', active: d.active, id: d.id }).catch(() => {});
  } catch { /* the extension was reloaded or removed: nothing to tell */ }
});
