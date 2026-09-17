(() => {
  let {sourceLanguage, targetLanguage} = AutoSettings.resolve();
  let session;
  let creating;
  let generation = 0;
  let queue = Promise.resolve();
  const cache = new Map();
  const params = () => ({sourceLanguage, targetLanguage});
  const api = () => {
    if (typeof globalThis.Translator === 'undefined') {
      throw new Error(CW_I18N.t("ui_007"));
    }
    return globalThis.Translator;
  };
  function configure(language, target) {
    const next = AutoSettings.normalize(language) || 'ja';
    const nextTarget = AutoSettings.normalize(target) || targetLanguage;
    if (next === sourceLanguage && nextTarget === targetLanguage) return;
    sourceLanguage = next;
    targetLanguage = nextTarget;
    generation++;
    session?.destroy();
    session = undefined;
    creating = undefined;
    cache.clear();
  }
  async function availability() { return sourceLanguage === targetLanguage ? 'available' : api().availability(params()); }
  function initialize(progress = () => {}) {
    if (sourceLanguage === targetLanguage) return Promise.resolve({translate:async text => text, destroy(){}});
    if (session) return Promise.resolve(session);
    if (creating) return creating;
    const current = generation;
    // Called directly by a click for the first download/user activation.
    const task = api().create({...params(), monitor(monitor) {
      monitor.addEventListener('downloadprogress', event => {
        progress(event.total ? event.loaded / event.total : event.loaded);
      });
    }}).then(value => {
      if (current !== generation) { value.destroy(); throw new Error(CW_I18N.t("ui_008")); }
      session = value;
      return value;
    }).finally(() => { if (creating === task) creating = undefined; });
    creating = task;
    return task;
  }
  async function getSession() {
    if (session) return session;
    const state = await availability();
    if (state === 'unavailable') throw new Error(CW_I18N.t("ui_009"));
    if (state !== 'available') throw new Error(CW_I18N.t("ui_010"));
    return initialize();
  }
  function genericFailure(error) {
    return /Other generic failures occurred/i.test(error?.message || '') || ['UnknownError','OperationError'].includes(error?.name);
  }
  function discardSession(value) {
    if (session === value) {
      session = undefined;
      try { value?.destroy(); } catch {}
    }
  }
  function translate(text) {
    const current = generation;
    const work = queue.then(async () => {
      async function checkActive() {
        const {enabled} = AutoSettings.resolve(await chrome.storage.local.get('enabled'));
        if (!enabled || current !== generation) throw new Error(CW_I18N.t("ui_013"));
      }
      if (current !== generation) throw new Error(CW_I18N.t("ui_008"));
      const {enabled} = AutoSettings.resolve(await chrome.storage.local.get('enabled'));
      if (!enabled) throw new Error(CW_I18N.t("ui_011"));
      if (typeof text !== 'string' || !text.trim() || text.length > 30000) throw new Error(CW_I18N.t("ui_012"));
      if (sourceLanguage === targetLanguage) return {skipped:true, reason:'same-language'};
      const alreadyTarget = await ProtectedText.isTargetLanguage(text, targetLanguage);
      await checkActive();
      if (alreadyTarget) return {skipped:true, reason:'already-target-language'};
      if (cache.has(text)) return {text: cache.get(text)};
      const parts = ProtectedText.split(text);
      const output = [], failures = [];
      let line = 1, recoveryUsed = false;
      async function infer(source) {
        await checkActive();
        let translator = await getSession();
        await checkActive();
        let result;
        try { result = await translator.translate(source); }
        catch (error) {
          await checkActive();
          if (!genericFailure(error)) throw error;
          discardSession(translator);
          if (recoveryUsed) throw error;
          // One retry for the message, using a fresh session and identical text.
          recoveryUsed = true;
          translator = await getSession();
          await checkActive();
          try { result = await translator.translate(source); }
          catch (retryError) {
            await checkActive();
            if (genericFailure(retryError)) discardSession(translator);
            throw retryError;
          }
        }
        await checkActive();
        if (typeof result !== 'string' || !result.trim()) throw new Error(CW_I18N.t("ui_014"));
        return result;
      }
      for (const item of parts) {
        const original = item.translate ? item.fallback.map(span => span.text).join('') : item.text;
        if (!item.translate) output.push(original);
        else {
          // In bilingual messages, preserve whole target-language lines. Do not
          // split English names or Chinese words out of a Japanese sentence.
          const keep = await ProtectedText.isTargetLanguage(original, targetLanguage);
          await checkActive();
          if (keep) output.push(original);
          else try { output.push(await ProtectedText.translatePart(item, infer)); }
          catch (error) {
            await checkActive();
            if (!genericFailure(error)) throw error;
            failures.push({line, name:error.name || 'Error', message:error.message || ''});
            output.push(CW_I18N.t('translation_line_failed',[line]) + original);
          }
        }
        line += (original.match(/\r\n|\r|\n/g) || []).length;
      }
      await checkActive();
      const result = output.join('');
      if (failures.length) return {text:result, incomplete:true, failures};
      cache.set(text, result);
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      return {text: result};
    });
    queue = work.catch(() => {});
    return work;
  }
  globalThis.EdgeTranslation = {configure, availability, initialize, translate};
})();
