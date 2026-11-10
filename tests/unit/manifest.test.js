const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MEETING_ORIGINS } = require('../../extension/shared/settings.js');
const files = require('../../extension/shared/files.js');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const loc = (l) => JSON.parse(fs.readFileSync(path.join(root, '_locales', l, 'messages.json'), 'utf8'));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

test('referenced files exist', () => {
  const refs = [manifest.background?.service_worker, ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}), manifest.action?.default_popup,
    manifest.options_page, manifest.options_ui?.page,
    ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
    ...(manifest.web_accessible_resources || []).flatMap((w) => w.resources.filter((r) => !r.includes('*')))]
    .filter(Boolean);
  for (const r of refs) assert.ok(fs.existsSync(path.join(root, r)), r);
});

test('manifest basics and permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '120');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(manifest.permissions, ['storage', 'idle', 'scripting', 'activeTab']);
  assert.deepEqual(manifest.host_permissions, ['https://web.whatsapp.com/*']);
  assert.deepEqual(manifest.optional_host_permissions, MEETING_ORIGINS);
});

test('locales', () => {
  const en = loc('en'), id = loc('id');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(id).sort());
  for (const m of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) assert.ok(en[m[1]], m[1]);
  assert.ok(en.extDescription.message.length <= 132);
  assert.ok(id.extDescription.message.length <= 132);
});

test('content scripts match files list', () => {
  const cs = manifest.content_scripts;
  if (!cs) return;
  assert.deepEqual(cs[0].js, files.CONTENT_JS);
  assert.deepEqual(cs[0].css || [], files.CONTENT_CSS);
});

test('no network APIs or remote URLs', () => {
  for (const f of walk(root)) {
    const text = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/, f);
    if (/\.(html|css)$/.test(f)) assert.doesNotMatch(text, /https?:\/\//, f);
  }
});
