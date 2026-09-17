const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
function install(realm, locale = 'zh_CN') {
  const supported = ['zh_CN','zh_TW','en','ja','ko'];
  const normalized = locale.replace('-','_');
  const chosen = supported.includes(normalized) ? normalized : supported.includes(normalized.split('_')[0]) ? normalized.split('_')[0] : 'en';
  const catalog = JSON.parse(fs.readFileSync(path.join(root,'_locales',chosen,'messages.json'),'utf8'));
  realm.chrome ||= {};
  realm.chrome.i18n = {getUILanguage:()=>locale, getMessage:(key, substitutions=[]) => {
    const entry = catalog[key]; if (!entry) return '';
    return entry.message.replace(/\$([a-z0-9_]+)\$/gi, (_,name) => (entry.placeholders?.[name.toLowerCase()]?.content || '').replace(/\$(\d)/g,(_,n)=>String(substitutions[Number(n)-1] ?? '')));
  }};
  const source=fs.readFileSync(path.join(root,'i18n.js'),'utf8') + '\n' + fs.readFileSync(path.join(root,'auto-settings.js'),'utf8');
  if (realm.eval) realm.eval(source);
  else if (vm.isContext(realm)) vm.runInContext(source,realm);
  else vm.runInThisContext(source);
  if (realm.document) realm.CW_I18N.localize(realm.document);
  return realm.CW_I18N;
}
module.exports = {install};
