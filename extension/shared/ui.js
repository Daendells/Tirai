(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['ui'] = api;
})(function () {
  function args(el) {
    try {
      const a = JSON.parse(el.dataset.i18nArgs);
      return Array.isArray(a) ? a.map(String) : [];
    } catch { return []; }
  }

  function localize(root = document) {
    const msg = (el, key) => chrome.i18n.getMessage(key, args(el)) || key;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = msg(el, el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', msg(el, el.dataset.i18nAria)));
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = msg(el, el.dataset.i18nTitle); });
    document.documentElement.lang = chrome.i18n.getUILanguage();
  }

  return { localize };
});
