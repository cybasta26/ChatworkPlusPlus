(() => {
  const el = id => document.getElementById(`manual-${id}`);
  const toggle = el('enabled'), panel = el('panel'), input = el('input'), output = el('output');
  const source = el('source'), target = el('target'), button = el('translate'), copy = el('copy'), status = el('status');
  let generation = 0, controller, busy = false;
  const languages = ['zh', 'ja', 'en', 'ko'];
  function reset() {
    generation++;
    controller?.abort();
    controller = undefined;
    busy = false;
    output.value = '';
    copy.disabled = true;
    button.textContent = CW_I18N.t("ui_015");
    button.disabled = !toggle.checked || !input.value.trim();
  }
  chrome.storage.local.get(['manualEnabled', 'manualSource', 'manualTarget']).then(settings => {
    toggle.checked = settings.manualEnabled !== false;
    panel.hidden = !toggle.checked;
    if (languages.includes(settings.manualSource)) source.value = settings.manualSource;
    if (languages.includes(settings.manualTarget)) target.value = settings.manualTarget;
    toggle.disabled = false;
  }).catch(() => { toggle.disabled = false; status.textContent = CW_I18N.t("ui_016"); });
  toggle.addEventListener('change', async () => {
    reset();
    panel.hidden = !toggle.checked;
    toggle.disabled = true;
    try { await chrome.storage.local.set({manualEnabled: toggle.checked}); }
    catch { status.textContent = CW_I18N.t("ui_017"); }
    finally { toggle.disabled = false; }
  });
  input.addEventListener('input', () => {
    reset();
    el('count').textContent = `${input.value.length} / 10000`;
    status.textContent = CW_I18N.t("ui_018");
  });
  for (const select of [source, target]) select.addEventListener('change', async () => {
    reset();
    status.textContent = CW_I18N.t("ui_019");
    try { await chrome.storage.local.set({manualSource: source.value, manualTarget: target.value}); }
    catch { status.textContent = CW_I18N.t("ui_020"); }
  });
  input.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (!button.disabled) button.click(); }
  });
  button.addEventListener('click', async () => {
    if (!toggle.checked || busy || !input.value.trim()) return;
    reset();
    const version = generation, text = input.value;
    if (text.length > 10000) { status.textContent = CW_I18N.t("ui_021"); return; }
    if (source.value === target.value) {
      output.value = text;
      copy.disabled = false;
      status.textContent = CW_I18N.t("ui_022");
      return;
    }
    const segments = ProtectedText.split(text);
    if (!segments.some(part => part.translate)) {
      output.value = text;
      copy.disabled = false;
      status.textContent = CW_I18N.t("ui_023");
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = CW_I18N.t("ui_024");
    controller = new AbortController();
    const signal = controller.signal;
    let session;
    try {
      session = GoogleTranslation.manualSession(source.value, target.value);
      if (version !== generation) return;
      status.textContent = CW_I18N.t("ui_157");
      const parts = [];
      for (const segment of segments) {
        if (!segment.translate) { parts.push(segment.text); continue; }
        parts.push(await ProtectedText.translatePart(segment, async source => {
          if (version !== generation || signal.aborted) throw new Error(CW_I18N.t("ui_028"));
          const translated = await session.translate(source, {signal});
          if (version !== generation || signal.aborted) throw new Error(CW_I18N.t("ui_028"));
          if (typeof translated !== 'string' || !translated.trim()) throw new Error(CW_I18N.t("ui_158"));
          return translated;
        }));
      }
      output.value = parts.join('');
      copy.disabled = false;
      status.textContent = CW_I18N.t("ui_159");
    } catch (error) {
      if (version === generation) status.textContent = CW_I18N.t("ui_031", [error.message || CW_I18N.t("ui_160")]);
    } finally {
      session?.destroy();
      if (version === generation) { busy = false; button.textContent = CW_I18N.t("ui_015"); button.disabled = !input.value.trim() || !toggle.checked; }
    }
  });
  copy.addEventListener('click', async () => {
    const version = generation;
    try { await navigator.clipboard.writeText(output.value); if (version === generation) status.textContent = CW_I18N.t("ui_033"); }
    catch { if (version === generation) status.textContent = CW_I18N.t("ui_034"); }
  });
  window.addEventListener('pagehide', reset);
})();
