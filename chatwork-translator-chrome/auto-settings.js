(() => {
  const keys = ['enabled', 'sourceLanguage', 'targetLanguage'];
  function normalize(value) {
    if (typeof value !== 'string') return '';
    const tag = value.replace(/_/g, '-').toLowerCase();
    if (tag === 'zh' || /^zh-(cn|sg|hans)(-|$)/.test(tag)) return 'zh';
    if (/^zh-(tw|hk|mo|hant)(-|$)/.test(tag)) return 'zh-Hant';
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag) ? tag.split('-')[0] : '';
  }
  function browserLanguage() {
    return normalize(globalThis.chrome?.i18n?.getUILanguage?.()) || 'en';
  }
  function defaults() {
    const targetLanguage = browserLanguage();
    return {enabled: targetLanguage !== 'ja', sourceLanguage: 'ja', targetLanguage};
  }
  function resolve(saved = {}) {
    const fallback = defaults();
    return {enabled: typeof saved.enabled === 'boolean' ? saved.enabled : fallback.enabled,
      sourceLanguage: saved.sourceLanguage === 'auto' ? 'auto' : normalize(saved.sourceLanguage) || fallback.sourceLanguage,
      targetLanguage: normalize(saved.targetLanguage) || fallback.targetLanguage};
  }
  async function read() { return resolve(await chrome.storage.local.get(keys)); }
  async function initialize(reason, legacySource = 'ja') {
    const saved = await chrome.storage.local.get([...keys, 'autoDefaultsVersion']);
    if (saved.autoDefaultsVersion) return;
    // Updates keep the old implicit defaults as well as all explicit choices.
    const initial = reason !== 'install' ? {enabled:true, sourceLanguage:legacySource, targetLanguage:'zh'} : defaults();
    const patch = {autoDefaultsVersion:1};
    for (const key of keys) if (saved[key] === undefined) patch[key] = initial[key];
    await chrome.storage.local.set(patch);
  }
  function languageName(language) {
    const key = {zh:'ui_109', 'zh-Hant':'language_traditional', ja:'ui_110', en:'ui_111', ko:'ui_112', auto:'language_auto'}[language];
    if (key) return CW_I18N.t(key);
    try { return new Intl.DisplayNames([CW_I18N.t('ui_language')], {type:'language'}).of(language); }
    catch { return language; }
  }
  function fill(select, selected, allowAuto = false) {
    const languages = [...new Set(['ja','zh','zh-Hant','en','ko',browserLanguage(),selected])].filter(Boolean);
    if (allowAuto) languages.push('auto');
    select.replaceChildren(...languages.map(value => {
      const option = document.createElement('option'); option.value = value; option.textContent = languageName(value); return option;
    }));
    select.value = selected;
  }
  globalThis.AutoSettings = {keys, normalize, browserLanguage, defaults, resolve, read, initialize, languageName, fill};
})();
