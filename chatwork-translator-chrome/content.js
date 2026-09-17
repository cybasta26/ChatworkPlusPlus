(() => {
  let enabled = false;
  let settings = AutoSettings.resolve();
  let timer;
  let active = 0;
  const states = new Map();
  const visible = new Set();
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
        observer.unobserve(element);
        visible.delete(element);
        states.delete(element);
        state.version++;
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
      state.box.className = 'cw-zh-translation';
      state.box.lang = settings.targetLanguage === 'zh' ? 'zh-CN' : settings.targetLanguage;
      element.querySelector('pre')?.after(state.box);
    }
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
      retry.addEventListener('click', () => { state.status = 'waiting'; pump(); });
      state.box.append(retry);

    }
  }

  function pump() {
    if (!enabled || document.hidden || document.documentElement.dataset.cwHistoryLoading) return;
    for (const element of visible) {
      if (active >= 2) break;
      const state = states.get(element);
      if (!element.isConnected || state?.status !== 'waiting') continue;
      state.status = 'loading';
      const version = state.version;
      active++;
      render(element, state, CW_I18N.t("ui_004"));
      GoogleTranslation.translate(state.requestText)
        .then(result => {
          if (!enabled || version !== state.version || !element.isConnected) return;
          if (result?.skipped) {
            state.status = 'done';
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
          state.status = 'error';
          render(element, state, error.message || CW_I18N.t("ui_006"), true);
        })
        .finally(() => { active--; pump(); });
    }
  }

  function setEnabled(value) {
    enabled = value;
    if (!enabled) {
      for (const state of states.values()) {
        state.version++;
        state.status = 'waiting';
        state.box?.remove();
        state.box = undefined;
      }
    } else scan();
  }
  new MutationObserver(records => {
    if (records.every(r => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('.cw-zh-translation, #cw-mentions, .cw-m-related, .cw-m-preview'))) return;
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
