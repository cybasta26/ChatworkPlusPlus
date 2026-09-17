const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {install} = require('./support/i18n.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const wait = () => new Promise(r=>setTimeout(r,15));
function harness(locale, saved = {}, html = '') {
  const dom = new JSDOM(html,{runScripts:'outside-only'}), w = dom.window;
  w.chrome = {storage:{local:{get:async()=>({...saved}),set:async patch=>Object.assign(saved,patch)}},runtime:{openOptionsPage(){}}};
  install(w,locale);
  return {dom,w,saved,api:w.AutoSettings};
}
for (const [locale,target,enabled] of [['zh-CN','zh',true],['zh-TW','zh-Hant',true],['zh-HK','zh-Hant',true],['en-US','en',true],['ja-JP','ja',false],['ko-KR','ko',true],['fr-FR','fr',true]]) {
  test(`${locale}: first install persists browser defaults, later UI changes do not reset them`, async()=>{
    const h=harness(locale,{},read('popup.html'));
    try {
      await h.api.initialize('install');
      assert.deepEqual(h.saved,{autoDefaultsVersion:1,enabled,sourceLanguage:'ja',targetLanguage:target});
      h.w.eval(read('popup.js')); await wait();
      assert.equal(h.w.document.getElementById('enabled').checked,enabled);
      assert.equal(h.w.document.getElementById('auto-source').value,'ja');
      assert.equal(h.w.document.getElementById('auto-target').value,target);
      assert.equal(h.w.document.getElementById('auto-direction').hidden,!enabled);
      h.w.chrome.i18n.getUILanguage=()=> 'de';
      await h.api.initialize('update');
      assert.equal((await h.api.read()).targetLanguage,target);
      const toggle=h.w.document.getElementById('enabled'); toggle.click(); await wait();
      assert.equal(h.saved.enabled,!enabled);
      await h.api.initialize('install');
      assert.equal(h.saved.enabled,!enabled);
    } finally {h.dom.window.close();}
  });
}
test('upgrade retains explicit settings, and freezes legacy implicit Chinese defaults', async()=>{
  for (const saved of [{},{enabled:false,sourceLanguage:'ko',targetLanguage:'en',manualTarget:'ja',mentionEnabled:false}]) {
    const h=harness('ja',saved);
    try {
      const explicit=Object.keys(saved).length>0;
      const legacy=path.basename(root).endsWith('chrome')?'auto':'ja';
      await h.api.initialize('update',legacy);
      assert.equal(saved.enabled,explicit?false:true);
      assert.equal(saved.sourceLanguage,explicit?'ko':legacy);
      assert.equal(saved.targetLanguage,explicit?'en':'zh');
      if(explicit){assert.equal(saved.manualTarget,'ja');assert.equal(saved.mentionEnabled,false);}
    } finally {h.dom.window.close();}
  }
});
test('popup persists language pair and restores controls when saving fails',async()=>{
  const h=harness('en',{enabled:true,sourceLanguage:'ja',targetLanguage:'en'},read('popup.html'));
  try {
    h.w.eval(read('popup.js'));await wait();
    const target=h.w.document.getElementById('auto-target');
    target.value='ko';target.dispatchEvent(new h.w.Event('change'));await wait();
    assert.equal(h.saved.targetLanguage,'ko');
    h.w.chrome.storage.local.set=async()=>{throw Error('fail');};
    target.value='zh';target.dispatchEvent(new h.w.Event('change'));await wait();
    assert.equal(target.value,'ko');assert.equal(target.disabled,false);
  } finally {h.dom.window.close();}
});

if (fs.existsSync(path.join(root,'local-translator.js'))) {
  for (const [locale,target] of [['zh-CN','zh'],['zh-TW','zh-Hant'],['en-US','en'],['ko-KR','ko']]) {
    test(`${locale}: Edge sends actual default language pair to model`,async()=>{
      const h=harness(locale), calls=[];
      try {
        h.w.Translator={availability:async p=>{calls.push(p);return 'available';},create:async p=>{calls.push(p);return {translate:async text=>'result',destroy(){}};}};
        h.w.eval(read('protected-text.js'));h.w.eval(read('local-translator.js'));
        await h.w.EdgeTranslation.translate('こんにちは。');
        assert.equal(calls.length,2);
        for (const p of calls) {assert.equal(p.sourceLanguage,'ja');assert.equal(p.targetLanguage,target);}
        if(target!=='zh') assert.equal((await h.w.EdgeTranslation.translate('请确认目前的版本。')).text,'result');
      } finally {h.dom.window.close();}
    });
  }
  test('Japanese default is blocked at engine; enabling same-language pair skips model',async()=>{
    const h=harness('ja');
    try {
      h.w.eval(read('protected-text.js'));h.w.eval(read('local-translator.js'));
      await assert.rejects(h.w.EdgeTranslation.translate('こんにちは。'));
      h.saved.enabled=true;
      assert.equal((await h.w.EdgeTranslation.translate('こんにちは。')).reason,'same-language');
    } finally {h.dom.window.close();}
  });
}
