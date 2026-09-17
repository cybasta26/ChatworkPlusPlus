const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('手动翻译开关、语言、独立运行和过期结果保护', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'popup.html'),'utf8'), {runScripts:'outside-only'});
  const w = dom.window, get = id => w.document.getElementById('manual-'+id);
  const settings={enabled:false,manualEnabled:false}, calls=[];
  let delayed, slow=false;
  w.chrome={storage:{local:{get:async()=>({...settings}),set:async value=>Object.assign(settings,value)}}};
  w.GoogleTranslation={manualSession:(sourceLanguage,targetLanguage)=>{calls.push({sourceLanguage,targetLanguage});return {translate:async text=>slow ? new Promise(resolve=>delayed=resolve) : '日本語:'+text,destroy(){}}}};
  require('./support/i18n.cjs').install(w); w.eval(fs.readFileSync(path.join(root,'protected-text.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'manual.js'),'utf8'));
  const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
  const change=id=>get(id).dispatchEvent(new w.Event('change'));
  try {
    await settle();assert.equal(get('panel').hidden,true);
    get('enabled').checked=true;change('enabled');await settle();
    assert.equal(get('panel').hidden,false);assert.equal(settings.manualEnabled,true);
    get('input').value='请确认今天的会议';get('input').dispatchEvent(new w.Event('input'));
    get('translate').click();await settle();
    assert.equal(calls[0].sourceLanguage,'zh');assert.equal(calls[0].targetLanguage,'ja');
    assert.equal(get('output').value,'日本語:请确认今天的会议');assert.equal(settings.enabled,false);
    assert.ok(!Object.values(settings).includes('请确认今天的会议'));
    get('target').value='zh';change('target');await settle();get('translate').click();await settle();
    assert.equal(get('output').value,get('input').value);assert.equal(calls.length,1);
    get('target').value='ja';change('target');await settle();slow=true;get('translate').click();await settle();
    get('enabled').checked=false;change('enabled');await settle();delayed('过期译文');await settle();
    assert.equal(get('panel').hidden,true);assert.equal(get('output').value,'');
    get('enabled').checked=true;change('enabled');await settle();w.GoogleTranslation.manualSession=()=>{throw new Error('Google 网络不可用');};get('translate').click();await settle();
    assert.match(get('status').textContent,/Google 网络不可用/);assert.equal(get('translate').disabled,false);
  } finally {dom.window.close();}
});
