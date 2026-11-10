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
  function coverPlan({ mode, regions, rule, viewport }) {
    const { side, main, loggedIn } = regions;
    const none = (health) => ({ cover: [], holes: [], splits: [], health });
    if (mode === 'off') return none('ok');
    const page = { x: 0, y: 0, w: viewport.w, h: viewport.h };
    const xs = [side && side.x + side.w, main && main.x].filter((x) => x !== null && x !== undefined).map(Math.round);
    const splits = [...new Set(xs)];

    if (mode === 'normal') {
      if (!side) return loggedIn ? { cover: [page], holes: [], splits, health: 'fallback' } : none('idle');
      const cover = rule === 'hide' && main ? [side, main] : [side];
      return { cover, holes: [], splits, health: 'ok' };
    }

    if (!loggedIn && !side && !main) return none('idle');
    return { cover: [page], holes: rule === 'show' && main ? [main] : [], splits, health: side || main ? 'ok' : 'fallback' };
  }

  return { effectiveState, coverPlan };
});
