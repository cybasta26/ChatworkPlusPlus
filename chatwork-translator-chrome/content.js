(() => {
  let enabled = false;
  let settings = AutoSettings.resolve();
  let timer;
  let active = 0;
  const states = new Map();
  const visible = new Set();
  const exportVisible = new Set();
  // Main chat and Thread share pending/completed requests, but keep independent render states.
  const requests = new Map();
  function translateShared(text) {
    if (requests.has(text)) return requests.get(text);
    const promise = Promise.resolve().then(() => GoogleTranslation.translate(text));
    requests.set(text,promise);
    promise.then(result => {
      if ((!result || result.error || result.incomplete || (!result.skipped && !result.text)) && requests.get(text) === promise) requests.delete(text);
    },() => { if (requests.get(text) === promise) requests.delete(text); });
    if (requests.size > 300) requests.delete(requests.keys().next().value);
    return promise;
  }
  function forget(element,state) {
    observer.unobserve(element); visible.delete(element); exportVisible.delete(element); states.delete(element);
    state.version++; state.box?.remove();
  }
  function syncThread(entries) {
    const current = new Set(entries.map(entry => entry.element));
    for (const [element,state] of states) if (state.thread && !current.has(element)) forget(element,state);
    for (const {element,text,names=[]} of entries) {
      if (!element.isConnected || !text) continue;
      const protectedText = ChatworkNames.protect(text,names);
      let state = states.get(element);
      if (!state) { state = {version:0,thread:true}; states.set(element,state); observer.observe(element); }
      if (state.source !== text || state.requestText !== protectedText.text) {
        state.version++; state.source = text; state.requestText = protectedText.text;
        state.restoreNames = protectedText.restore; state.status = 'waiting'; state.box?.remove(); state.box = undefined;
      }
      element.dataset.cwTranslationState = enabled ? state.status : 'disabled';
      const body = element.querySelector('.cw-m-thread-source');
      if (state.box && body && state.box.previousElementSibling !== body) body.after(state.box);
    }
    pump();
  }
  async function prepareThreadExport(elements,{signal}={}) {
    if (!enabled) return;
    const versions = elements.map(element => [element,states.get(element)?.version]);
    elements.forEach(element => exportVisible.add(element));
    const deadline = Date.now()+90000;
    try {
      for (;;) {
        if (signal?.aborted) throw new DOMException('Export canceled','AbortError');
        if (!enabled || versions.some(([element,version]) => !element.isConnected || states.get(element)?.version !== version)) throw new Error(CW_I18N.t('thread_image_changed'));
        pump();
        if (elements.every(element => !['waiting','loading'].includes(states.get(element)?.status))) return;
        if (Date.now()>deadline) throw new Error(CW_I18N.t('thread_image_timeout'));
        await new Promise(resolve => setTimeout(resolve,100));
      }
    } finally { elements.forEach(element => exportVisible.delete(element)); }
  }
  globalThis.ChatworkAutoTranslation = {syncThread,isEnabled:() => enabled,prepareThreadExport};
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    pump();
  });

  function scan() {
    for (const [element, state] of states) {
      if (!element.isConnected) {
        forget(element,state);
      }
    }
    if (!enabled) return;
    const names = ChatworkNames.knownNames(document);
    for (const element of document.querySelectorAll('._message')) {
      if (element.dataset.deleted === '1') continue;
      const body = element.querySelector('pre');
      const text = ChatworkNames.messageText(body);
      if (!text) continue;
      const protectedText = ChatworkNames.protect(text, names);
      let state = states.get(element);
      if (!state) {
        state = {version: 0};
        states.set(element, state);
        observer.observe(element);
      }
      if (state.source !== text || state.requestText !== protectedText.text) {
        state.version++;
        state.source = text;
        state.requestText = protectedText.text;
        state.restoreNames = protectedText.restore;
        state.status = 'waiting';
        state.box?.remove();
        state.box = undefined;
      }
      // React can replace the message body without changing its text.
      if (state.box && state.box.previousElementSibling !== body) body.after(state.box);
    }
    pump();
  }

  function render(element, state, text, error = false) {
    if (!state.box) {
      state.box = document.createElement('section');
      state.box.className = state.thread ? 'cw-m-preview-translation cw-m-thread-translation' : 'cw-zh-translation';
      state.box.lang = settings.targetLanguage === 'zh' ? 'zh-CN' : settings.targetLanguage;
      element.querySelector(state.thread ? '.cw-m-thread-source' : 'pre')?.after(state.box);
    }
    if (state.thread) element.dataset.cwTranslationState = state.status;
    const label = document.createElement('div');
    label.className = 'cw-zh-label';
    label.textContent = CW_I18N.t("ui_155", [AutoSettings.languageName(settings.targetLanguage)]);
    const content = document.createElement('div');
    content.className = 'cw-zh-body';
    content.textContent = text;
    state.box.replaceChildren(label, content);
    if (error) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = CW_I18N.t("ui_001");
      retry.addEventListener('click', () => { requests.delete(state.requestText); state.status = 'waiting'; pump(); });
      state.box.append(retry);

    }
  }

  function pump() {
    if (!enabled || document.hidden || document.documentElement.dataset.cwHistoryLoading) return;
    for (const element of new Set([...exportVisible,...visible])) {
      if (active >= 2) break;
      const state = states.get(element);
      if (!element.isConnected || state?.status !== 'waiting') continue;
      state.status = 'loading';
      const version = state.version;
      active++;
      render(element, state, CW_I18N.t("ui_004"));
      translateShared(state.requestText)
        .then(result => {
          if (!enabled || version !== state.version || !element.isConnected) return;
          if (result?.skipped) {
            state.status = 'skipped';
            if (state.thread) element.dataset.cwTranslationState = 'skipped';
            state.box?.remove();
            state.box = undefined;
            return;
          }
          if (result?.error || !result?.text) throw new Error(result?.error || CW_I18N.t("ui_005"));
          state.status = 'done';
          render(element, state, state.restoreNames(result.text));
        })
        .catch(error => {
          if (!enabled || version !== state.version || !element.isConnected) return;
          requests.delete(state.requestText);
          state.status = 'error';
          render(element, state, error.message || CW_I18N.t("ui_006"), true);
        })
        .finally(() => { active--; pump(); });
    }
  }

  function setEnabled(value) {
    enabled = value;
    if (!enabled) {
      requests.clear();
      for (const state of states.values()) {
        state.version++;
        state.status = 'waiting';
        state.box?.remove();
        state.box = undefined;
      }
    } else scan();
    document.dispatchEvent(new Event('cw-auto-translation-state'));
  }
  new MutationObserver(records => {
    if (records.every(r => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('.cw-zh-translation, #cw-mentions, .cw-m-related, .cw-m-preview, .cw-m-thread'))) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 180);
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
  document.addEventListener('visibilitychange', pump);
  document.addEventListener('cw-history-finished', pump);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !AutoSettings.keys.some(key => changes[key])) return;
    const next = {...settings};
    for (const key of AutoSettings.keys) if (changes[key]) next[key] = changes[key].newValue;
    settings = AutoSettings.resolve(next);
    setEnabled(false);
    GoogleTranslation.configure(settings.sourceLanguage, settings.targetLanguage);
    setEnabled(settings.enabled);
  });
  AutoSettings.read().then(value => {
    settings = value;
    GoogleTranslation.configure(settings.sourceLanguage, settings.targetLanguage);
    setEnabled(settings.enabled);
  });
})();
