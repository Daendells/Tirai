(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['mode'] = api;
})(function () {
  function effectiveState(settings, live = { sharing: false, idle: 'active' }, local = { focused: true }) {
    if (settings.mode === 'off') return { mode: 'off', reason: 'user', lamp: false };
    const a = settings.auto;
    let reason = null;
    if (a.share && live.sharing) reason = 'share';
    else if (a.idle && live.idle !== 'active') reason = 'idle';
    else if (a.unfocus && !local.focused) reason = 'unfocus';
    if (reason) return { mode: 'full', reason, lamp: false };
    return { mode: settings.mode, reason: 'user', lamp: true };
  }
  return { effectiveState };
});
