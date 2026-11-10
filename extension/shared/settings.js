(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['settings'] = api;
})(function () {
  const MODES = ['off', 'normal', 'full'];
  const TYPES = ['nik', 'card', 'account', 'otp', 'phone', 'email'];
  const MEETING_ORIGINS = ['https://meet.google.com/*', 'https://*.zoom.us/*', 'https://teams.microsoft.com/*', 'https://teams.cloud.microsoft/*',
    'https://teams.live.com/*', 'https://discord.com/*', 'https://app.slack.com/*', 'https://*.whereby.com/*',
    'https://meet.jit.si/*'];
  const MAX_CHATS = 500;
  const MAX_KEY = 200;

  const deepFreeze = (o) => {
    Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
    return Object.freeze(o);
  };

  const DEFAULTS = deepFreeze({
    version: 1, mode: 'normal', lastOnMode: 'normal', blurPx: 14, lampPx: 72,
    sensitive: { enabled: true, types: { nik: true, card: true, account: true, otp: true, phone: true, email: false } },
    auto: { share: false, unfocus: false, idle: false, idleSeconds: 60 },
    chats: {},
  });

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const num = (v, lo, hi, d) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return d;
    return Math.min(hi, Math.max(lo, Math.round(v)));
  };

  function normalize(raw) {
    const r = isObj(raw) ? raw : {};
    const sens = isObj(r.sensitive) ? r.sensitive : {};
    const types = isObj(sens.types) ? sens.types : {};
    const auto = isObj(r.auto) ? r.auto : {};
    const D = DEFAULTS;

    const out = {
      version: 1,
      mode: MODES.includes(r.mode) ? r.mode : D.mode,
      lastOnMode: r.lastOnMode === 'full' ? 'full' : 'normal',
      blurPx: num(r.blurPx, 6, 30, D.blurPx),
      lampPx: num(r.lampPx, 40, 160, D.lampPx),
      sensitive: { enabled: bool(sens.enabled, D.sensitive.enabled), types: {} },
      auto: {
        share: bool(auto.share, D.auto.share),
        unfocus: bool(auto.unfocus, D.auto.unfocus),
        idle: bool(auto.idle, D.auto.idle),
        idleSeconds: num(auto.idleSeconds, 15, 600, D.auto.idleSeconds),
      },
      chats: {},
    };
    for (const t of TYPES) out.sensitive.types[t] = bool(types[t], D.sensitive.types[t]);

    if (isObj(r.chats)) {
      let n = 0;
      for (const [k, v] of Object.entries(r.chats)) {
        const key = k.trim();
        if (!key || key.length > MAX_KEY || (v !== 'hide' && v !== 'show')) continue;
        out.chats[key] = v;
        if (++n >= MAX_CHATS) break;
      }
    }
    return out;
  }

  const trimmed = (title) => (typeof title === 'string' ? title.trim() : '');

  function chatRule(settings, title) {
    const key = trimmed(title);
    const v = key && settings && settings.chats && Object.hasOwn(settings.chats, key) ? settings.chats[key] : null;
    return v === 'hide' || v === 'show' ? v : 'auto';
  }

  function withChatRule(settings, title, rule) {
    const key = trimmed(title);
    const chats = { ...settings.chats };
    if (!key) return { ...settings, chats };
    if (rule === 'hide' || rule === 'show') chats[key] = rule;
    else delete chats[key];
    return { ...settings, chats };
  }

  function nextMode(settings, command) {
    const { mode } = settings;
    const last = settings.lastOnMode === 'full' ? 'full' : 'normal';
    if (command === 'toggle-full') {
      const m = mode === 'full' ? 'normal' : 'full';
      return { mode: m, lastOnMode: m };
    }
    if (command === 'toggle-off') {
      if (mode === 'off') return { mode: last, lastOnMode: last };
      return { mode: 'off', lastOnMode: mode };
    }
    return { mode, lastOnMode: last };
  }

  // Every read-modify-write of the stored settings runs inside this lock, in the popup and the background alike,
  // so two writers never overwrite each other. Without Web Locks (old runtimes, tests) it just runs the function.
  function withLock(fn) {
    const locks = globalThis.navigator && globalThis.navigator.locks;
    return locks ? locks.request('tirai-settings', fn) : fn();
  }

  return { MODES, TYPES, MEETING_ORIGINS, DEFAULTS, normalize, chatRule, withChatRule, nextMode, withLock };
});
