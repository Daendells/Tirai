(() => {
  const { normalize, withLock } = Tirai.settings;
  const { lampBand, lampMask } = Tirai.geometry;
  const $ = (id) => document.getElementById(id);
  const TYPES = ['nik', 'card', 'account', 'otp', 'phone', 'email'];
  const PREVIEW = { x: 0, y: 0, w: 320, h: 140 };

  const i18n = (key, ...a) => chrome.i18n.getMessage(key, a.map(String)) || key;
  const set = (el, key, args) => {
    el.dataset.i18n = key;
    if (args) el.dataset.i18nArgs = JSON.stringify(args);
    Tirai.ui.localize(el.parentNode);
  };

  let settings = normalize(null);
  let pointer = null;
  let fullKey = '';

  const paintLamp = (lampPx) => { $('frost').style.maskImage = lampMask(lampBand(PREVIEW, pointer, lampPx), 10); };
  const paintBlur = (px) => $('preview').style.setProperty('--blur', px + 'px');

  function renderRules() {
    const list = $('rules');
    list.replaceChildren();
    const entries = Object.entries(settings.chats);
    $('rulesEmpty').hidden = entries.length > 0;
    for (const [name, rule] of entries) {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = `${name} · ${i18n(rule === 'hide' ? 'ruleHide' : 'ruleShow')}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'link';
      del.dataset.chat = name;
      del.textContent = i18n('ruleDelete');
      del.setAttribute('aria-label', `${i18n('ruleDelete')} ${name}`);
      li.append(who, del);
      list.append(li);
    }
  }

  function renderWelcome() {
    const show = location.hash === '#welcome';
    $('welcome').hidden = !show;
    if (show) set($('welcomeBody2'), 'welcomeBody2', [fullKey || i18n('shortcutUnset')]);
  }

  function render() {
    $('blur').value = settings.blurPx;
    $('blurValue').textContent = settings.blurPx + ' px';
    $('lamp').value = settings.lampPx;
    $('lampValue').textContent = settings.lampPx + ' px';
    paintBlur(settings.blurPx);
    paintLamp(settings.lampPx);
    $('sensitive').checked = settings.sensitive.enabled;
    for (const t of TYPES) $('type-' + t).checked = settings.sensitive.types[t];
    $('share').checked = settings.auto.share;
    $('unfocus').checked = settings.auto.unfocus;
    $('idle').checked = settings.auto.idle;
    set($('idleHelp'), 'switchIdleHelp', [settings.auto.idleSeconds]);
    if (document.activeElement !== $('idleSeconds')) $('idleSeconds').value = settings.auto.idleSeconds;
    renderRules();
  }

  // Edits read storage fresh under the shared lock and run one after another, so they never overwrite the popup.
  let queue = Promise.resolve();
  const edit = (fn) => {
    queue = queue.then(() => withLock(async () => {
      const current = normalize((await chrome.storage.local.get('settings')).settings);
      settings = normalize(fn(current));
      await chrome.storage.local.set({ settings });
    })).catch((err) => console.error('Tirai:', err)).then(render);
    return queue;
  };

  $('blur').addEventListener('input', (e) => {
    $('blurValue').textContent = e.target.value + ' px';
    paintBlur(e.target.value);
  });
  $('lamp').addEventListener('input', (e) => {
    $('lampValue').textContent = e.target.value + ' px';
    paintLamp(Number(e.target.value));
  });
  $('preview').addEventListener('pointermove', (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    pointer = { x: Math.round(e.clientX - box.left), y: Math.round(e.clientY - box.top) };
    paintLamp(settings.lampPx);
  });
  $('preview').addEventListener('pointerleave', () => { pointer = null; paintLamp(settings.lampPx); });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'blur') edit((s) => ({ ...s, blurPx: Number(t.value) }));
    else if (t.id === 'lamp') edit((s) => ({ ...s, lampPx: Number(t.value) }));
    else if (t.id === 'sensitive') edit((s) => ({ ...s, sensitive: { ...s.sensitive, enabled: t.checked } }));
    else if (t.dataset.type) edit((s) => ({ ...s, sensitive: { ...s.sensitive, types: { ...s.sensitive.types, [t.dataset.type]: t.checked } } }));
    else if (t.id === 'unfocus') edit((s) => ({ ...s, auto: { ...s.auto, unfocus: t.checked } }));
    else if (t.id === 'idle') edit((s) => ({ ...s, auto: { ...s.auto, idle: t.checked } }));
    else if (t.id === 'idleSeconds') {
      const n = t.valueAsNumber;
      edit((s) => (Number.isFinite(n) ? { ...s, auto: { ...s.auto, idleSeconds: n } } : s)).then(() => { t.value = settings.auto.idleSeconds; });
    }
  });

  $('rules').addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const name = button.dataset.chat;
    edit((s) => { const chats = { ...s.chats }; delete chats[name]; return { ...s, chats }; });
  });

  // Same flow as the popup: the permission prompt needs this click's user gesture, so enable() runs before any await.
  let sharing = false;
  $('share').addEventListener('click', async (e) => {
    const box = e.currentTarget;
    if (sharing) { e.preventDefault(); return; }
    sharing = true;
    box.setAttribute('aria-busy', 'true');
    let denied = false;
    try {
      if (box.checked) denied = !(await Tirai.share.enable());
      else await Tirai.share.disable();
    } catch { /* the stored setting below says where things ended up */ }
    const stored = await chrome.storage.local.get('settings').catch(() => ({}));
    box.checked = normalize(stored.settings).auto.share;
    box.removeAttribute('aria-busy');
    sharing = false;
    $('shareDenied').hidden = !denied;
    box.setAttribute('aria-describedby', denied ? 'shareHelp shareDenied' : 'shareHelp');
  });

  $('editShortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  $('openWhatsApp').addEventListener('click', () => chrome.tabs.create({ url: 'https://web.whatsapp.com/' }));
  window.addEventListener('hashchange', renderWelcome);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = normalize(changes.settings.newValue);
    render();
  });

  async function renderShortcuts() {
    const keys = {};
    try { for (const c of await chrome.commands.getAll()) keys[c.name] = c.shortcut || ''; } catch { /* show what we have */ }
    fullKey = keys['toggle-full'] || '';
    $('keyFull').textContent = fullKey || i18n('shortcutUnset');
    $('keyOff').textContent = keys['toggle-off'] || i18n('shortcutUnset');
    renderWelcome();
  }

  (async () => {
    Tirai.ui.localize();
    document.title = i18n('optTitle');
    settings = normalize((await chrome.storage.local.get('settings')).settings);
    render();
    await renderShortcuts();
  })();
})();
