(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (globalThis.Tirai = globalThis.Tirai || {})['files'] = api;
})(function () {
  return { CONTENT_JS: [], CONTENT_CSS: [], PAGE_JS: [] };
});
