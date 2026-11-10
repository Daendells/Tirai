(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['files'] = api;
})(function () {
  const CONTENT_JS = ['shared/settings.js', 'shared/mode.js', 'shared/geometry.js', 'shared/detect.js',
    'content/regions.js', 'content/holes.js', 'content/lamp.js', 'content/curtain.js', 'content/masker.js',
    'content/whatsapp.js'];
  const PAGE_JS = ['shared/settings.js', 'shared/geometry.js', 'shared/detect.js', 'content/holes.js', 'content/lamp.js',
    'content/curtain.js', 'content/masker.js', 'content/page.js'];
  const CONTENT_CSS = ['content/mask.css'];
  return { CONTENT_JS, CONTENT_CSS, PAGE_JS };
});
