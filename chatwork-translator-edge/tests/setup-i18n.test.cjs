const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {install} = require('./support/i18n.cjs');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
for (const locale of ['zh_CN','zh_TW','en','ja','ko']) {
  test(`${locale}: setup status localizes while model direction and sample remain Japanese to Chinese`, async () => {
    const dom = new JSDOM(read('setup.html'), {runScripts:'outside-only'});
    try {
      const w = dom.window, calls = [];
      w.chrome = {storage:{local:{get:async()=>({enabled:true,sourceLanguage:'ja',targetLanguage:'zh'}),set:async()=>{}}}};
      w.Translator = {
        availability:async params => { calls.push(params); return 'available'; },
        create:async params => { calls.push(params); return {translate:async text => { assert.equal(text,'こんにちは。今日の会議は午後三時です。'); return '你好，今天的会议在下午三点。'; }}; }
      };
      const t = install(w,locale).t;
      w.eval(read('local-translator.js')); w.eval(read('setup.js'));
      await new Promise(r=>setTimeout(r,10));
      assert.equal(w.document.querySelector('#status').textContent, t('ui_139'));
      w.document.querySelector('#prepare').click();
      await new Promise(r=>setTimeout(r,10));
      assert.equal(w.document.querySelector('#status').textContent, t('ui_148'));
      assert.ok(w.document.querySelector('#sample').textContent.includes('你好，今天的会议在下午三点。'));
      assert.equal(calls.length,2);
      for (const params of calls) { assert.equal(params.sourceLanguage,'ja'); assert.equal(params.targetLanguage,'zh'); }
    } finally { dom.window.close(); }
  });
}
