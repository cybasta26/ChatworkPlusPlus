const language = document.getElementById('language');
const targetLanguage = document.getElementById('target-language');
const check = document.getElementById('check');
const prepare = document.getElementById('prepare');
const enable = document.getElementById('enable');
const status = document.getElementById('status');
const sample = document.getElementById('sample');
async function inspect() {
  try {
    const state = await EdgeTranslation.availability();
    status.textContent = {available: CW_I18N.t("ui_139"), downloadable: CW_I18N.t("ui_140"), downloading: CW_I18N.t("ui_141"), unavailable: CW_I18N.t("ui_142")}[state] || CW_I18N.t("ui_143", [state]);
    prepare.disabled = state === 'unavailable';
  } catch (error) { status.textContent = error.message; prepare.disabled = true; }
}
AutoSettings.read().then(settings => {
  AutoSettings.fill(language, settings.sourceLanguage);
  AutoSettings.fill(targetLanguage, settings.targetLanguage);
  EdgeTranslation.configure(language.value, targetLanguage.value);
  language.disabled = targetLanguage.disabled = false;
  check.disabled = false;
  inspect();
});
for (const select of [language, targetLanguage]) select.addEventListener('change', async () => {
  enable.disabled = true;
  sample.textContent = '';
  EdgeTranslation.configure(language.value, targetLanguage.value);
  try { await chrome.storage.local.set({sourceLanguage: language.value, targetLanguage: targetLanguage.value}); inspect(); }
  catch { status.textContent = CW_I18N.t("ui_121"); }
});
check.addEventListener('click', inspect);
prepare.addEventListener('click', async () => {
  language.disabled = targetLanguage.disabled = check.disabled = prepare.disabled = true;
  status.textContent = CW_I18N.t("ui_144");
  try {
    const session = await EdgeTranslation.initialize(progress => { status.textContent = CW_I18N.t("ui_145", [Math.round(progress * 100)]); });
    const text = {ja: 'こんにちは。今日の会議は午後三時です。', en: 'Hello. The meeting is at three this afternoon.', ko: '안녕하세요. 오늘 회의는 오후 세 시입니다.'}[language.value] || {zh:'你好，今天的会议在下午三点。', 'zh-Hant':'您好，今天的會議在下午三點。'}[language.value] || 'Hello.';
    const translated = await session.translate(text);
    if (!translated?.trim()) throw new Error(CW_I18N.t("ui_146"));
    sample.textContent = CW_I18N.t("ui_147", [text, translated]);
    status.textContent = CW_I18N.t("ui_148");
    enable.disabled = false;
  } catch (error) { status.textContent = CW_I18N.t("ui_149", [error.message]); }
  finally { language.disabled = targetLanguage.disabled = check.disabled = prepare.disabled = false; }
});
enable.addEventListener('click', async () => {
  await chrome.storage.local.set({enabled: true});
  status.textContent = CW_I18N.t("ui_150");
});
