// Runs in the extension's own world. Passes the hook's page messages on to the background. It also remembers which
// shares are live, because a page that is going away cannot be relied on to deliver its own "stopped" message.
(() => {
  const liveShares = new Set();
  const tell = (active, id) => {
    try {
      chrome.runtime.sendMessage({ type: 'share', active, id }).catch(() => {});
    } catch { /* the extension was reloaded or removed: nothing to tell */ }
  };

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__tirai !== 'share' || typeof d.active !== 'boolean' || typeof d.id !== 'string') return;
    if (d.active) liveShares.add(d.id); else liveShares.delete(d.id);
    tell(d.active, d.id);
  });

  window.addEventListener('pagehide', () => {
    for (const id of liveShares) tell(false, id);
    liveShares.clear();
  });
})();
