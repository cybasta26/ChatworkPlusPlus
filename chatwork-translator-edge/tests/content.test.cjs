const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const dom = new JSDOM('<body><div class="_message"><pre>こんにちは</pre></div><textarea id="input">draft</textarea></body>', {runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window; Object.defineProperty(w.HTMLElement.prototype,"innerText",{get(){return this.textContent;}});
 let change, calls=[];
 w.IntersectionObserver=class {constructor(fn){this.fn=fn;}observe(e){this.fn([{target:e,isIntersecting:true}]);}unobserve(){}};
 w.chrome={storage:{local:{get:async()=>({enabled:true})},onChanged:{addListener:fn=>change=fn}},runtime:{sendMessage:async msg=>{calls.push(msg.text);return {text:'中文：'+msg.text};}}};
 w.EdgeTranslation={configure(){}, translate:async text=>{calls.push(text);return {text:'中文：'+text};},initialize:async()=>({})};
 require('./support/i18n.cjs').install(w); w.eval(fs.readFileSync(require('node:path').join(__dirname, '../names.js'),'utf8'));
 w.eval(fs.readFileSync(require('node:path').join(__dirname, '../content.js'),'utf8'));
 const settle=()=>new Promise(r=>setTimeout(r,450));
 await settle();
 assert.equal(w.document.querySelectorAll('.cw-zh-translation').length,1);
 assert.equal(calls.length,1);
 const added=w.document.createElement('div');added.className='_message';added.innerHTML='<pre>ありがとうございます</pre>';w.document.body.append(added);
 await settle();assert.equal(calls.length,2);assert.equal(w.document.querySelectorAll('.cw-zh-translation').length,2);
 added.querySelector('pre').textContent='更新されました';await settle();assert.equal(calls.length,3);assert.match(added.querySelector('.cw-zh-body').textContent,/更新されました/);
 assert.equal(w.document.querySelector('#input').value,'draft');
 change({enabled:{newValue:false}},'local');await settle();assert.equal(w.document.querySelectorAll('.cw-zh-translation').length,0);assert.equal(calls.length,3);
 change({enabled:{newValue:true}},'local');await settle();assert.equal(w.document.querySelectorAll('.cw-zh-translation').length,2);
 await settle();assert.equal(calls.length,5);
 const named=w.document.createElement('div');named.className='_message';
 named.innerHTML='<span data-testid="timeline_user-name">御室 知晃</span><pre><div data-cwtag="[To:123]"></div><span>李季娉(ぴん）さん\n御室 知晃へお願いします</span></pre>';
 w.document.body.append(named);await settle();
 assert.ok(calls.at(-1).includes('CWNAME'));
 assert.ok(!calls.at(-1).includes('李季娉'));
 assert.ok(!calls.at(-1).includes('御室'));
 assert.match(named.querySelector('.cw-zh-body').textContent,/李季娉\(ぴん）さん/);
 assert.match(named.querySelector('.cw-zh-body').textContent,/御室 知晃/);
 assert.throws(()=>w.ChatworkNames.protect('御室 知晃', ['御室 知晃']).restore('broken'), /姓名标记/);
 const previousCalls=calls.length;
 change({targetLanguage:{newValue:'en'}},'local');await settle();
 assert.equal(calls.length,previousCalls+3);
 for(const box of w.document.querySelectorAll('.cw-zh-translation')) {
   assert.equal(box.lang,'en');assert.match(box.querySelector('.cw-zh-label').textContent,/英语/);
 }
 console.log('PASS: insertion, dynamic message, edits, pause/resume, no translation loop, composer preserved');
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});


