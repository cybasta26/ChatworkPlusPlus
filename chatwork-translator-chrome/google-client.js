(() => {
  globalThis.GoogleTranslation = {
    configure() {},
    translate(text) { return chrome.runtime.sendMessage({type: 'translate', text}); },
    manualSession(source, target) {
      return {destroy() {}, async translate(text, {signal} = {}) {
        if (signal?.aborted) throw new Error(CW_I18N.t("ui_028"));
        const result = await chrome.runtime.sendMessage({type: 'manualTranslate', text, source, target});
        if (signal?.aborted) throw new Error(CW_I18N.t("ui_028"));
        if (result?.error || !result?.text) throw new Error(result?.error || CW_I18N.t("ui_156"));
        return result.text;
      }};
    }
  };
})();
