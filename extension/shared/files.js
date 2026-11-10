(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['files'] = api;
})(function () {
  const CONTENT_JS = ['shared/settings.js', 'shared/mode.js', 'shared/geometry.js', 'content/regions.js',
    'content/holes.js', 'content/lamp.js', 'content/curtain.js', 'content/whatsapp.js'];
  return { CONTENT_JS, CONTENT_CSS: [], PAGE_JS: [] };
});
