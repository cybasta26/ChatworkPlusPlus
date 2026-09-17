import './auto-settings.js';
import './i18n.js';
import {translateText} from './translation.mjs';
import './protected-text.js';

chrome.runtime.onInstalled?.addListener(details => { AutoSettings.initialize(details.reason, 'auto').catch(console.error); });
const cache = new Map();
let queue = Promise.resolve();
let cooldownUntil = 0;
async function allowed(manual) {
  const settings = await chrome.storage.local.get(manual ? 'manualEnabled' : 'enabled');
  if (manual ? settings.manualEnabled === false : !AutoSettings.resolve(settings).enabled) throw new Error(CW_I18N.t("ui_011"));
}
function request(text, source, target, manual) {
  const work = queue.then(async () => {
    await allowed(manual);
    const key = JSON.stringify([source, target, text]);
    if (cache.has(key)) return cache.get(key);
    if (Date.now() < cooldownUntil) throw new Error(CW_I18N.t("ui_151"));
    try {
      const result = await translateText(text, fetch, {source, target});
      cache.set(key, result);
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      return result;
    } catch (error) {
      cooldownUntil = Date.now() + 60000;
      throw error;
    } finally { await new Promise(resolve => setTimeout(resolve, 350)); }
  });
  queue = work.catch(() => {});
  return work;
}
export async function processMessage(text, translate, target = 'zh') {
  if (await ProtectedText.isTargetLanguage(text, target)) return {skipped:true, reason:'already-target-language'};
  const output = [];
  for (const part of ProtectedText.split(text)) {
    output.push(part.translate ? await ProtectedText.translatePart(part, translate) : part.text);
  }
  return {text: output.join('')};
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['translate', 'manualTranslate'].includes(message?.type)) return;
  const manual = message.type === 'manualTranslate';
  if (sender.id !== chrome.runtime.id) return;
  if (manual) {
    if (sender.url !== chrome.runtime.getURL('popup.html')) return;
    if (!['zh','ja','en','ko'].includes(message.source) || !['zh','ja','en','ko'].includes(message.target)) {
      respond({error: CW_I18N.t("ui_152")}); return;
    }
  } else {
    let url;
    try {url = new URL(sender.url);} catch {return;}
    if (!sender.tab || url.protocol !== 'https:' || !['www.chatwork.com','kcw.kddi.ne.jp'].includes(url.hostname)) return;
  }
  if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > (manual ? 1800 : 30000)) {
    respond({error: CW_I18N.t("ui_153")}); return;
  }
  (async () => {
    await allowed(manual);
    if (manual) return {text: await request(message.text, message.source, message.target, true)};
    const settings = await AutoSettings.read();
    if (settings.sourceLanguage === settings.targetLanguage) return {skipped:true, reason:'same-language'};
    return processMessage(message.text, text => request(text, settings.sourceLanguage, settings.targetLanguage === 'zh-Hant' ? 'zh-TW' : settings.targetLanguage, false), settings.targetLanguage);
  })().then(respond, error => respond({error: error.message || CW_I18N.t("ui_154")}));
  return true;
});
