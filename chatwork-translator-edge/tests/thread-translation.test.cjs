const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const message = (id,text) => `<div class="_message" data-rid="7" data-mid="${id}" data-index="${id}"><div class="_speaker"><div data-aid="12"><img alt="山田"></div></div><pre>${id>1?'<div data-cwtag="[rp aid=12 to=7-1]"></div>':''}${text}</pre><div class="_timeStamp" data-tm="${Math.floor(Date.now()/1000)}"></div></div>`;
function setup({translate,enabled=true,mainVisible=false,sideVisible=true,preferences={}}={}) {
  const dom=new JSDOM(`<div id="_roomHeader"><div id="_roomTitle"><i data-roomid="7"></i></div><div class="chatRoomHeader__infoContainer"></div></div><main id="_timeLine">${message(1,'山田さん、確認をお願いします。\n次の行です。')}${message(2,'ありがとうございます。')}</main><textarea>draft</textarea>`,{url:'https://www.chatwork.com/#!rid7',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[],observers=[],listeners=[];
  const saved=Object.assign(preferences,{enabled,sourceLanguage:'ja',targetLanguage:'zh'});
  w.chrome={storage:{local:{get:async()=>saved,set:async obj=>Object.assign(saved,obj)},onChanged:{addListener:fn=>listeners.push(fn)}}};
  w.IntersectionObserver=class {constructor(fn){this.fn=fn;observers.push(this);}observe(element){this.fn([{target:element,isIntersecting:element.matches('.cw-m-thread-message')?sideVisible:mainVisible}]);}unobserve(){}};
  w.HTMLElement.prototype.scrollIntoView=function(){w.jumped=this.dataset.mid;};
  const provider={configure(){},initialize:async()=>{},translate:async text=>{calls.push(text);return translate?translate(text):{text:'译文：'+text};}};
  w.EdgeTranslation=provider;w.GoogleTranslation=provider;
  require('./support/i18n.cjs').install(w);
  for(const file of ['names.js','content.js','mentions-core.js','mentions.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  return {dom,w,calls,observers,change:changes=>{for(const [key,item] of Object.entries(changes))saved[key]=item.newValue;listeners.forEach(fn=>fn(changes,'local'));}};
}
async function open(w){await wait(30);w.document.querySelector('.cw-m-thread-open').click();await wait(40);}

function installStyles(w) { const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'mentions.css'),'utf8');w.document.head.append(style); }
function toggleOnly(w,value) {const input=w.document.querySelector('.cw-m-thread-view-toggle input');input.checked=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));}

test('仅显示译文默认关闭，只隐藏 Thread 已成功翻译的原文，关闭自动翻译立即恢复',async()=>{
  const {dom,w,change,calls}=setup();
  try {installStyles(w);await open(w);const doc=w.document,source=doc.querySelector('.cw-m-thread-source'),input=doc.querySelector('.cw-m-thread-view-toggle input');
    assert.equal(input.checked,false);assert.equal(input.closest('label').hidden,false);assert.notEqual(w.getComputedStyle(source).display,'none');
    toggleOnly(w,true);assert.equal(w.getComputedStyle(source).display,'none');assert.notEqual(w.getComputedStyle(doc.querySelector('._message pre')).display,'none');assert.equal(calls.length,2);
    toggleOnly(w,false);assert.notEqual(w.getComputedStyle(source).display,'none');toggleOnly(w,true);
    change({enabled:{newValue:false}});assert.equal(input.closest('label').hidden,true);assert.notEqual(w.getComputedStyle(source).display,'none');
    change({enabled:{newValue:true}});await wait(30);assert.equal(input.closest('label').hidden,false);assert.equal(w.getComputedStyle(source).display,'none');
    doc.querySelector('.cw-m-thread header > button').click();await open(w);assert.equal(doc.querySelector('.cw-m-thread-view-toggle input').checked,true);
  } finally {dom.window.close();}
});

test('未开启自动翻译时不显示仅译文开关；等待、失败和目标语言跳过时不隐藏唯一正文',async()=>{
  const off=setup({enabled:false});
  try {await open(off.w);assert.ok(off.w.document.querySelector('.cw-m-thread-view-toggle').hidden);assert.equal(off.calls.length,0);}finally{off.dom.window.close();}
  let finish;const {dom,w}=setup({translate:text=>text.startsWith('RE:')?{skipped:true}:new Promise(resolve=>finish=resolve)});
  try {installStyles(w);await open(w);toggleOnly(w,true);const doc=w.document;
    const first=doc.querySelector('[data-thread-mid="1"] .cw-m-thread-source'),second=doc.querySelector('[data-thread-mid="2"] .cw-m-thread-source');
    assert.notEqual(w.getComputedStyle(first).display,'none');assert.notEqual(w.getComputedStyle(second).display,'none');
    finish({error:'temporary failure'});await wait(30);assert.notEqual(w.getComputedStyle(first).display,'none');assert.match(doc.querySelector('[data-thread-mid="1"] .cw-m-thread-translation').textContent,/temporary failure/);
  } finally {dom.window.close();}
});

test('Thread 可见即可翻译，主聊天无需可见或跳转，随后前往复用译文',async()=>{
  const {dom,w,calls,observers}=setup();
  try {await open(w);const doc=w.document;
    assert.equal(calls.length,2);assert.equal(w.jumped,undefined);assert.equal(w.location.hash,'#!rid7');
    assert.equal(doc.querySelectorAll('.cw-m-thread-translation').length,2);assert.equal(doc.querySelectorAll('._message .cw-zh-body').length,0);
    assert.match(doc.querySelector('.cw-m-thread-translation').textContent,/山田さん/);assert.ok(doc.querySelector('.cw-m-thread-translation .cw-zh-body').textContent.includes('\n'));
    for(const el of doc.querySelectorAll('._message'))observers[0].fn([{target:el,isIntersecting:true}]);await wait(30);
    assert.equal(calls.length,2);assert.equal(doc.querySelectorAll('._message .cw-zh-body').length,2);
    await wait(250);assert.equal(calls.length,2);assert.equal(doc.querySelectorAll('.cw-m-thread-translation').length,2);
    assert.equal(doc.querySelector('textarea').value,'draft');
  } finally {dom.window.close();}
});

test('主聊天已有译文时 Thread 复用；缓存的离屏原文在侧栏滚入可见区后也能翻译',async()=>{
  const {dom,w,calls,observers}=setup({sideVisible:false});
  try {await open(w);const doc=w.document;assert.equal(calls.length,0);
    doc.querySelector('[data-mid="1"]').remove();await wait(250);
    const card=doc.querySelector('[data-thread-mid="1"]');observers[0].fn([{target:card,isIntersecting:true}]);await wait(30);
    assert.equal(calls.length,1);assert.match(card.querySelector('.cw-zh-body').textContent,/山田さん/);
    assert.equal(w.jumped,undefined);
  } finally {dom.window.close();}
  const other=setup({mainVisible:true});
  try {await wait(50);assert.equal(other.calls.length,2);await open(other.w);assert.equal(other.calls.length,2);assert.equal(other.w.document.querySelectorAll('.cw-m-thread-translation').length,2);} finally {other.dom.window.close();}
});

test('Thread 遵守自动翻译开关、目标语言、目标语言跳过，旧语言异步结果不可回填',async()=>{
  let resolveOld;const {dom,w,calls,change}=setup({enabled:false,translate:text=>text.startsWith('RE:')?{skipped:true}:calls.length===1?new Promise(resolve=>resolveOld=resolve):{text:'new:'+text}});
  try {await open(w);const doc=w.document;assert.equal(calls.length,0);
    change({enabled:{newValue:true}});await wait(30);assert.equal(calls.length,2);
    change({targetLanguage:{newValue:'en'}});resolveOld({text:'OLD WRONG TARGET'});await wait(50);
    assert.ok(!doc.querySelector('.cw-m-thread').textContent.includes('OLD WRONG TARGET'));
    assert.match(doc.querySelector('.cw-m-thread-translation .cw-zh-label').textContent,/英语/);
    assert.equal(doc.querySelector('[data-thread-mid="2"] .cw-m-thread-translation'),null);
    change({enabled:{newValue:false}});await wait(30);assert.equal(doc.querySelectorAll('.cw-m-thread-translation').length,0);
  } finally {dom.window.close();}
});

test('Thread 与主聊天共享在途请求，关闭后不继续翻译或回填侧栏',async()=>{
  const pending=[];const {dom,w,calls}=setup({mainVisible:true,translate:text=>new Promise(resolve=>pending.push(()=>resolve({text:'done:'+text})))});
  try {await open(w);const doc=w.document;assert.equal(calls.length,2);
    doc.querySelector('.cw-m-thread header > button').click();pending.forEach(resolve=>resolve());await wait(80);
    assert.equal(doc.querySelector('.cw-m-thread'),null);assert.equal(calls.length,2);assert.equal(doc.querySelectorAll('._message .cw-zh-body').length,2);
  } finally {dom.window.close();}
});

test('Thread 翻译失败可在侧栏重试，不需要打开原消息',async()=>{
  let failed=false;const {dom,w,calls}=setup({translate:text=>{if(!failed){failed=true;throw new Error('temporary failure');}return {text:'ok:'+text};}});
  try {await open(w);const box=w.document.querySelector('[data-thread-mid="1"] .cw-m-thread-translation');
    assert.match(box.textContent,/temporary failure/);box.querySelector('button').click();await wait(40);
    assert.match(box.querySelector('.cw-zh-body').textContent,/ok:/);assert.equal(calls.length,3);assert.equal(w.jumped,undefined);
  } finally {dom.window.close();}
});

test('Thread 关闭后取消尚未开始的翻译，正在执行的结果不会重建侧栏',async()=>{
  const pending=[];const {dom,w,calls}=setup({translate:text=>new Promise(resolve=>pending.push(()=>resolve({text:'done:'+text})))});
  try {w.document.querySelector('#_timeLine').insertAdjacentHTML('beforeend',message(3,'追加の確認です。')+message(4,'別の確認をお願いします。'));
    await open(w);assert.equal(calls.length,2);w.document.querySelector('.cw-m-thread header > button').click();
    pending.forEach(resolve=>resolve());await wait(300);assert.equal(calls.length,2);assert.equal(w.document.querySelector('.cw-m-thread'),null);
  } finally {dom.window.close();}
});

test('模型破坏姓名标记后，Thread 重试不会反复取回失败的缓存',async()=>{
  let broken=false;const {dom,w,calls}=setup({translate:text=>{if(!broken){broken=true;return {text:'broken marker'};}return {text:'ok:'+text};}});
  try {await open(w);const box=w.document.querySelector('[data-thread-mid="1"] .cw-m-thread-translation');
    assert.match(box.textContent,/姓名标记/);box.querySelector('button').click();await wait(40);
    assert.match(box.querySelector('.cw-zh-body').textContent,/山田さん/);assert.equal(calls.length,3);
  } finally {dom.window.close();}
});

test('Thread 的部分失败译文仍显示标记和重试按钮',async()=>{
  if(!root.endsWith('-edge'))return;
  const {dom,w}=setup({translate:text=>({text:'partial:'+text,incomplete:true,failures:[{line:2,name:'UnknownError',message:'failed'}]})});
  try {await open(w);const box=w.document.querySelector('.cw-m-thread-translation');assert.ok(box.querySelector('.cw-zh-warning'));assert.equal(box.querySelectorAll('button').length,2);}finally{dom.window.close();}
});


test('长图准备会翻译所有离屏卡片，不跳转主聊天；关闭时取消等待',async()=>{
  const {dom,w,calls}=setup({sideVisible:false});
  try {await open(w);assert.equal(calls.length,0);
    await w.ChatworkAutoTranslation.prepareThreadExport([...w.document.querySelectorAll('.cw-m-thread-message')]);
    assert.equal(calls.length,2);assert.equal(w.document.querySelectorAll('.cw-m-thread-translation').length,2);assert.equal(w.jumped,undefined);
  }finally{dom.window.close();}
  const other=setup({sideVisible:false,translate:()=>new Promise(()=>{})});
  try {await open(other.w);const controller=new other.w.AbortController();const pending=other.w.ChatworkAutoTranslation.prepareThreadExport([...other.w.document.querySelectorAll('.cw-m-thread-message')],{signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});
  }finally{other.dom.window.close();}
});

test('保存长图等待离屏翻译完成再生成，导出中禁止重复操作，完成后恢复',async()=>{
  const {dom,w,calls}=setup({sideVisible:false});let captured=false,saved=false;
  try {await open(w);w.ThreadImageExport={capture:async box=>{assert.equal(box.querySelectorAll('.cw-m-thread-translation').length,2);captured=true;return new w.Blob(['PNG']);},save:(blob,name)=>{assert.match(name,/Chatwork-Thread-7-1-.*\.png$/);saved=true;}};
    const save=w.document.querySelectorAll('.cw-m-thread-export button')[1];save.click();assert.equal(save.disabled,true);await wait(160);
    assert.ok(captured&&saved);assert.equal(calls.length,2);assert.equal(save.disabled,false);assert.equal(w.jumped,undefined);
  }finally{dom.window.close();}
});


test('仅译文选择持久保存，重新载入页面恢复，关闭自动翻译不清除选择',async()=>{
  const preferences={};const first=setup({preferences});
  try {await open(first.w);toggleOnly(first.w,true);await wait(0);assert.equal(preferences.threadTranslationOnly,true);}finally{first.dom.window.close();}
  const restored=setup({preferences,enabled:false});
  try {installStyles(restored.w);await open(restored.w);const doc=restored.w.document,input=doc.querySelector('.cw-m-thread-view-toggle input');
    assert.equal(input.checked,true);assert.equal(input.closest('label').hidden,true);assert.notEqual(restored.w.getComputedStyle(doc.querySelector('.cw-m-thread-source')).display,'none');
    restored.change({enabled:{newValue:true}});await wait(30);assert.equal(input.checked,true);assert.equal(restored.w.getComputedStyle(doc.querySelector('.cw-m-thread-source')).display,'none');
    toggleOnly(restored.w,false);await wait(0);assert.equal(preferences.threadTranslationOnly,false);
  }finally{restored.dom.window.close();}
  const off=setup({preferences});try {await open(off.w);assert.equal(off.w.document.querySelector('.cw-m-thread-view-toggle input').checked,false);}finally{off.dom.window.close();}
});

test('其他标签页修改仅译文偏好时同步当前 Thread，并用于后续打开',async()=>{
  const {dom,w,change}=setup();try {installStyles(w);await open(w);const doc=w.document;
    change({threadTranslationOnly:{newValue:true}});assert.equal(doc.querySelector('.cw-m-thread-view-toggle input').checked,true);assert.equal(w.getComputedStyle(doc.querySelector('.cw-m-thread-source')).display,'none');
    doc.querySelector('.cw-m-thread header > button').click();change({threadTranslationOnly:{newValue:false}});await open(w);assert.equal(doc.querySelector('.cw-m-thread-view-toggle input').checked,false);
  }finally{dom.window.close();}
});
