const toggle = document.getElementById('enabled');
const status = document.getElementById('status');
function show(value) { document.getElementById('auto-direction').hidden = !value; status.textContent = value ? CW_I18N.t("ui_118") : CW_I18N.t("ui_119"); }
const autoSource = document.getElementById('auto-source'), autoTarget = document.getElementById('auto-target');
let autoSettings;
AutoSettings.read().then(settings => {
  autoSettings = settings;
  toggle.checked = settings.enabled;
  toggle.disabled = false;
  AutoSettings.fill(autoSource, settings.sourceLanguage, true);
  AutoSettings.fill(autoTarget, settings.targetLanguage);
  autoSource.disabled = autoTarget.disabled = false;
  show(settings.enabled);
}).catch(() => { status.textContent = CW_I18N.t("ui_120"); });
for (const select of [autoSource, autoTarget]) select.addEventListener('change', async () => {
  autoSource.disabled = autoTarget.disabled = true;
  const next = {sourceLanguage:autoSource.value, targetLanguage:autoTarget.value};
  try { await chrome.storage.local.set(next); Object.assign(autoSettings,next); }
  catch { autoSource.value = autoSettings.sourceLanguage; autoTarget.value = autoSettings.targetLanguage; status.textContent = CW_I18N.t("ui_121"); }
  finally { autoSource.disabled = autoTarget.disabled = false; }
});

toggle.addEventListener('change', async () => {
  toggle.disabled = true;
  try { await chrome.storage.local.set({enabled: toggle.checked}); show(toggle.checked); }
  catch { toggle.checked = !toggle.checked; status.textContent = CW_I18N.t("ui_121"); }
  finally { toggle.disabled = false; }
});


(() => {
  const input = document.getElementById('mention-enabled');
  const feedback = document.getElementById('mention-setting-status');
  chrome.storage.local.get('mentionEnabled').then(data => {
    input.checked = data.mentionEnabled !== false; input.disabled = false;
  }).catch(() => { feedback.textContent = CW_I18N.t("ui_122"); });
  input.addEventListener('change', async () => {
    input.disabled = true;
    try { await chrome.storage.local.set({mentionEnabled: input.checked}); feedback.textContent = ''; }
    catch { input.checked = !input.checked; feedback.textContent = CW_I18N.t("ui_121"); }
    finally { input.disabled = false; }
  });
})();
