const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
for (const folder of ['chatwork-translator-chrome','chatwork-translator-edge']) {
  for (const saved of [{}, {enabled:false,manualEnabled:false,mentionEnabled:false}]) {
    test(`${folder}: ${Object.keys(saved).length ? '保留关闭设置' : '两个开关默认开启'}`, async () => {
      const root=path.resolve(__dirname,'../../',folder);
      const dom=new JSDOM(fs.readFileSync(path.join(root,'popup.html'),'utf8'),{runScripts:'outside-only'});
      const w=dom.window;
      w.chrome={storage:{local:{get:async()=>saved}},runtime:{openOptionsPage(){}}};
      require('./support/i18n.cjs').install(w); w.eval(fs.readFileSync(path.join(root,'popup.js'),'utf8'));
      w.eval(fs.readFileSync(path.join(root,'manual.js'),'utf8'));
      await new Promise(resolve=>setTimeout(resolve,10));
      const expected=!Object.keys(saved).length;
      assert.equal(w.document.getElementById('enabled').checked,expected);
      assert.equal(w.document.getElementById('mention-enabled').checked,expected);
      assert.equal(w.document.getElementById('manual-enabled').checked,expected);
      assert.equal(w.document.getElementById('manual-panel').hidden,!expected);
      dom.window.close();
    });
  }
}
