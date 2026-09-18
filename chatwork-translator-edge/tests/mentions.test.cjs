const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const now = Date.now();
const message = (index, age, body, room='7', deleted=false, sender='12') => `<div class="_message" data-rid="${room}" data-mid="${index}" data-index="${index}" data-deleted="${deleted?1:0}"><div class="_speaker"><div data-aid="${sender}"><img alt="Member ${sender}" src="member.png"></div></div><pre>${body}</pre><div class="_timeStamp" data-tm="${Math.floor((now-age*86400000)/1000)}"></div></div>`;
const to = id => `<div data-cwtag="[To:${id}]"></div>`;
const re = id => `<div data-cwtag="[rp aid=${id} to=7-1]"></div>`;
function setup(body='', storage={}) {
  const dom = new JSDOM(`<div data-testid="global-header_account-menu_menu-button"><img src="me.png">Myself</div><div id="_roomHeader"><div class="chatRoomHeader__titleContainer"><div id="_roomTitle"><i data-roomid="7"></i></div></div><div class="chatRoomHeader__infoContainer"><div data-aid="12"><img src="me.png" alt="Myself"></div></div></div><div id="_timeLine"><div id="scroll" style="overflow-y:auto">${body}</div></div>`, {runScripts:'outside-only',url:'https://www.chatwork.com/#!rid7'});
  const w = dom.window;
  w.chrome = {storage:{onChanged:{addListener:fn=>w.storageChanged=fn},local:{get:async()=>storage,set:async value=>Object.assign(storage,value)}}};
  w.HTMLElement.prototype.scrollIntoView = function() { w.jumped=this.dataset.mid; };
  Object.defineProperty(w.document.querySelector('#scroll'),'clientHeight',{value:600});
  require('./support/i18n.cjs').install(w); w.eval(fs.readFileSync(path.join(__dirname,'../mentions-core.js'),'utf8'));
  return {dom,w,core:w.ChatworkMentions,start:()=>w.eval(fs.readFileSync(path.join(__dirname,'../mentions.js'),'utf8'))};
}
const wait = ms=>new Promise(r=>setTimeout(r,ms));

test('相关信息为不可点击文字，按钮仅按 ↑ Thread ↓ 排列，箭头直接跳转，Thread 独立打开',async()=>{
  const {dom,w,start}=setup(message(1,1,'正文')+message(2,1,re(12)+'回复')+message(3,1,re(12)+'继续回复'));
  try {start();await wait(25);const doc=w.document,bar=doc.querySelector('[data-mid="2"] .cw-m-related');
    const label=bar.querySelector('.cw-m-related-label');assert.equal(label.tagName,'SPAN');assert.equal(label.tabIndex,-1);assert.equal(label.textContent,'相关信息 2/3');
    assert.deepEqual(Array.from(bar.children,el=>el.tagName),['SPAN','BUTTON','BUTTON','BUTTON']);
    assert.deepEqual(Array.from(bar.querySelectorAll('button'),el=>el.textContent),['↑','Thread','↓']);
    label.click();assert.equal(w.jumped,undefined);assert.equal(doc.querySelector('.cw-m-thread'),null);
    bar.querySelectorAll('button')[0].click();assert.equal(w.jumped,'1');assert.equal(doc.querySelector('.cw-m-thread'),null);
    bar.querySelectorAll('button')[2].click();assert.equal(w.jumped,'3');assert.equal(doc.querySelector('.cw-m-preview'),null);
    const entry=bar.querySelector('.cw-m-thread-open');entry.click();assert.ok(doc.querySelector('.cw-m-thread'));assert.equal(entry.getAttribute('aria-expanded'),'true');
    doc.querySelector('.cw-m-thread header > button').click();assert.equal(entry.getAttribute('aria-expanded'),'false');assert.equal(doc.activeElement,entry);
  }finally{dom.window.close();}
});

test('Thread 覆盖原有右侧信息栏，不缩小聊天；重排后跟随原栏，关闭完整恢复',async()=>{
  const {dom,w,start}=setup(message(1,1,'正文')+message(2,1,re(12)+'回复'));
  try {const doc=w.document;
    Object.defineProperty(w,'innerWidth',{value:1280,writable:true}); Object.defineProperty(w,'innerHeight',{value:800,writable:true});
    const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
    const native=doc.createElement('aside'); native.id='native-details';native.innerHTML='<button>Chatwork AI</button><p>描述与工作</p>'; native.style.cssText='color:red'; doc.body.append(native);
    const header=doc.querySelector('#_roomHeader'),timeline=doc.querySelector('#_timeLine');
    header.getBoundingClientRect=()=>rect(200,40,1080,60); timeline.getBoundingClientRect=()=>rect(200,100,760,700);
    let bounds=rect(960,100,320,700); native.getBoundingClientRect=()=>bounds;
    const html=native.innerHTML,style=native.getAttribute('style'),chatStyle=timeline.getAttribute('style');
    start(); await wait(25); doc.querySelector('.cw-m-thread-open').click();
    const panel=doc.querySelector('.cw-m-thread');
    assert.equal(panel.style.left,'960px');assert.equal(panel.style.top,'100px');assert.equal(panel.style.width,'320px');assert.equal(panel.style.height,'700px');
    assert.equal(native.hasAttribute('inert'),true);assert.equal(native.innerHTML,html);assert.equal(native.getAttribute('style'),style);
    assert.equal(timeline.getAttribute('style'),chatStyle);assert.equal(doc.querySelectorAll('.cw-m-thread-workspace').length,0);
    bounds=rect(920,120,360,680);timeline.getBoundingClientRect=()=>rect(200,120,720,680);w.dispatchEvent(new w.Event('resize'));
    assert.equal(panel.style.left,'920px');assert.equal(panel.style.width,'360px');assert.equal(panel.style.top,'120px');
    panel.querySelector('.cw-m-thread-resize').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    assert.equal(panel.style.width,'360px');assert.equal(panel.querySelector('.cw-m-thread-resize').getAttribute('aria-valuemin'),'360');
    panel.querySelector('header > button').click(); assert.equal(native.hasAttribute('inert'),false);assert.equal(native.innerHTML,html);assert.equal(native.getAttribute('style'),style);
    native.setAttribute('inert','saved');doc.querySelector('.cw-m-thread-open').click();w.storageChanged({mentionEnabled:{newValue:false}},'local');assert.equal(native.getAttribute('inert'),'saved');
  } finally {dom.window.close();}
});

test('原生信息栏重建后覆盖新节点，解除旧节点的 inert；隐藏时仅浮层显示而不压缩页面',async()=>{
  const {dom,w,start}=setup(message(1,1,'正文')+message(2,1,re(12)+'回复'));
  try {const doc=w.document;Object.defineProperty(w,'innerWidth',{value:1280});Object.defineProperty(w,'innerHeight',{value:800});
    const rect={left:960,top:100,width:320,height:700,right:1280,bottom:800};
    doc.querySelector('#_roomHeader').getBoundingClientRect=()=>({...rect,left:200,width:1080,top:40,height:60,bottom:100});
    doc.querySelector('#_timeLine').getBoundingClientRect=()=>({...rect,left:200,width:760,right:960});
    const old=doc.createElement('aside');old.getBoundingClientRect=()=>rect;doc.body.append(old);
    start();await wait(25);doc.querySelector('.cw-m-thread-open').click();assert.ok(old.hasAttribute('inert'));
    const next=doc.createElement('aside');next.getBoundingClientRect=()=>rect;old.replaceWith(next);await wait(250);
    assert.equal(old.hasAttribute('inert'),false);assert.ok(next.hasAttribute('inert'));
    next.getBoundingClientRect=()=>({left:0,top:0,width:0,height:0,right:0,bottom:0});w.dispatchEvent(new w.Event('resize'));
    assert.equal(next.hasAttribute('inert'),false);assert.equal(doc.querySelector('.cw-m-thread').style.top,'100px');
    assert.equal(doc.querySelectorAll('.cw-m-thread-workspace').length,0);
  } finally {dom.window.close();}
});

test('Thread 左边缘拖动与键盘调整宽度，保存后重新打开恢复，关闭清理拖动监听',async()=>{
  const store={threadWidth:360};const {dom,w,start}=setup(message(1,1,'正文')+message(2,1,re(12)+'回复'),store);
  try {Object.defineProperty(w,'innerWidth',{value:1280});Object.defineProperty(w,'innerHeight',{value:800});
    start();await wait(25);const doc=w.document;doc.querySelector('.cw-m-thread-open').click();
    const panel=doc.querySelector('.cw-m-thread'),handle=doc.querySelector('.cw-m-thread-resize');
    panel.getBoundingClientRect=()=>({width:parseFloat(panel.style.width)});
    assert.equal(panel.style.width,'360px');
    handle.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,clientX:920,bubbles:true}));
    w.dispatchEvent(new w.MouseEvent('pointermove',{clientX:820}));w.dispatchEvent(new w.MouseEvent('pointerup',{clientX:820}));
    assert.equal(panel.style.width,'460px');assert.equal(store.threadWidth,460);assert.equal(panel.style.left,'820px');
    handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(store.threadWidth,440);
    handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(store.threadWidth,260);
    handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(store.threadWidth,800);
    handle.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,clientX:480,bubbles:true}));
    panel.querySelector('header > button').click();w.dispatchEvent(new w.MouseEvent('pointermove',{clientX:1000}));
    doc.querySelector('.cw-m-thread-open').click();assert.equal(doc.querySelector('.cw-m-thread').style.width,'800px');
    assert.equal(doc.querySelector('.cw-m-thread-resize').getAttribute('aria-valuenow'),'800');
  } finally {dom.window.close();}
});

test('Thread 按关联链显示原文、译文、警告和作者，点击不会跳转或复制活跃聊天节点',async()=>{
  const {dom,w,start}=setup(message(1,1,'原文第一行\n&lt;img src=x onerror=alert(1)&gt;')+message(2,1,re(12)+'返信')+message(3,1,to(12)+'无关消息'));
  try { const doc=w.document;
    doc.querySelector('[data-mid="1"]').insertAdjacentHTML('beforeend','<div class="cw-zh-translation"><strong class="cw-zh-label">中文</strong><div class="cw-zh-body">译文\n第二行</div><p class="cw-zh-warning">部分失败</p></div>');
    start(); await wait(25); const original=doc.querySelector('pre').innerHTML;
    doc.querySelector('[data-mid="2"] .cw-m-thread-open').click();
    assert.equal(w.jumped,undefined); const panel=doc.querySelector('.cw-m-thread');
    assert.equal(panel.querySelectorAll('article').length,2);
    assert.ok(panel.textContent.includes('Member 12')); assert.ok(panel.textContent.includes('部分失败'));
    assert.equal(panel.querySelector('.cw-m-preview-text').textContent,'原文第一行\n<img src=x onerror=alert(1)>');
    assert.equal(panel.querySelectorAll('._message, pre, [data-aid], .cw-zh-body, [onerror]').length,0);
    assert.equal(doc.querySelector('pre').innerHTML,original);
    panel.querySelector('[data-thread-mid="1"] > button').click(); assert.equal(w.jumped,'1');
    assert.ok(doc.querySelector('.cw-m-thread')); assert.equal(doc.querySelectorAll('.cw-m-preview').length,0);
    panel.querySelector('header > button').click(); assert.equal(doc.querySelector('.cw-m-thread'),null);
    assert.equal(doc.querySelectorAll('.cw-m-thread-workspace').length,0);
  } finally {dom.window.close();}
});

test('Thread 更新译文与回复，保留滚动和已卸载原文，删除消息不会留下旧卡片',async()=>{
  const {dom,w,start}=setup(message(1,1,'原始正文')+message(2,1,re(12)+'回复'));
  try {start(); await wait(25); const doc=w.document;
    doc.querySelector('[data-mid="2"] .cw-m-thread-open').click();
    const list=doc.querySelector('.cw-m-thread-list'); list.scrollTop=85;
    doc.querySelector('[data-mid="1"]').insertAdjacentHTML('beforeend','<div class="cw-zh-translation"><div class="cw-zh-body">新译文</div></div>');
    await wait(250); assert.ok(list.textContent.includes('新译文')); assert.equal(list.scrollTop,85);
    doc.querySelector('.cw-zh-body').textContent='更新的译文'; await wait(250); assert.ok(list.textContent.includes('更新的译文'));
    doc.querySelector('[data-mid="1"]').remove(); doc.querySelector('#scroll').insertAdjacentHTML('beforeend',message(3,1,re(12)+'新回复'));
    await wait(250); assert.equal(list.querySelectorAll('article').length,3); assert.ok(list.textContent.includes('原始正文'));
    doc.querySelector('[data-mid="3"]').dataset.deleted='1'; await wait(250); assert.equal(list.querySelectorAll('article').length,2);
    doc.querySelector('[data-roomid]').dataset.roomid='8'; await wait(250); assert.equal(doc.querySelector('.cw-m-thread'),null);
  } finally {dom.window.close();}
});

test('Thread 关闭成员导航或 Escape 时清理侧栏并恢复入口焦点',async()=>{
  const {dom,w,start}=setup(message(1,1,'正文')+message(2,1,re(12)+'回复'));
  try {start(); await wait(25); const doc=w.document,entry=doc.querySelector('.cw-m-thread-open'); entry.click();
    doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'})); assert.equal(doc.querySelector('.cw-m-thread'),null); assert.equal(doc.activeElement,entry);
    entry.click(); w.storageChanged({mentionEnabled:{newValue:false}},'local');
    assert.equal(doc.querySelector('.cw-m-thread'),null); assert.equal(doc.querySelectorAll('.cw-m-thread-workspace').length,0);
  } finally {dom.window.close();}
});

test('Thread 少于 10 条时自动补载缺失原文，10 条及以上只在手动刷新后加载',async()=>{
  for (const total of [2,9,10,11]) {
    const {dom,w,start}=setup(Array.from({length:total-1},(_,i)=>message(i+2,1,re(12)+'回复')).join(''));
    try { const doc=w.document; const routes=[];
      w.addEventListener('hashchange',()=>{ routes.push(w.location.hash); if(w.location.hash==='#!rid7-1' && !doc.querySelector('[data-mid="1"]')) doc.querySelector('#scroll').insertAdjacentHTML('afterbegin',message(1,1,'补载的原文')); });
      start(); await wait(25); doc.querySelector('.cw-m-thread-open').click(); await wait(100);
      if (total>=10) { assert.equal(routes.length,0); assert.match(doc.querySelector('.cw-m-thread-tools').textContent,/10 条/); doc.querySelector('.cw-m-thread-tools button').click(); }
      await wait(650); assert.ok(routes.includes('#!rid7-1')); assert.ok(doc.querySelector('.cw-m-thread-list').textContent.includes('补载的原文'));
      assert.equal(doc.querySelectorAll('.cw-m-thread-message').length,total); assert.equal(w.jumped,undefined);
    } finally {dom.window.close();}
  }
});

test('Thread 自动补载发现总数达到 10 条时暂停，不继续打开下一条缺失消息',async()=>{
  const {dom,w,start}=setup(message(2,1,re(12)+'回复'));
  try {const doc=w.document,routes=[];
    w.addEventListener('hashchange',()=>{routes.push(w.location.hash); if(w.location.hash==='#!rid7-1'&&!doc.querySelector('[data-mid="1"]')) {
      doc.querySelector('#scroll').insertAdjacentHTML('afterbegin',message(1,1,'<div data-cwtag="[rp aid=12 to=7-0]"></div>根消息')+Array.from({length:7},(_,i)=>message(i+3,1,re(12)+'新发现的回复')).join(''));
    }});
    start(); await wait(25); doc.querySelector('.cw-m-thread-open').click(); await wait(750);
    assert.equal(doc.querySelectorAll('.cw-m-thread-message').length,10); assert.ok(!routes.includes('#!rid7-0'));
    assert.match(doc.querySelector('.cw-m-thread-tools').textContent,/10 条/);
  } finally {dom.window.close();}
});

test('Thread 自动补载中切换房间会取消后续请求，不恢复到旧房间',async()=>{
  const {dom,w,start}=setup(message(2,1,re(12)+'回复'));
  try {start(); await wait(25); const doc=w.document; doc.querySelector('.cw-m-thread-open').click(); await wait(30);
    doc.querySelector('[data-roomid]').dataset.roomid='8'; w.location.hash='#!rid8'; await wait(450);
    assert.equal(w.location.hash,'#!rid8'); assert.equal(doc.querySelector('.cw-m-thread'),null);
  } finally {dom.window.close();}
});

test('Thread 补载超时提示失败，不自动反复重试；可手动重试恢复',async()=>{
  const {dom,w,start}=setup(message(2,1,re(12)+'回复'));
  try {const doc=w.document; const routes=[];
    w.Date.now=()=>Date.now()*100;
    w.addEventListener('hashchange',()=>routes.push(w.location.hash));
    start(); await wait(25); doc.querySelector('.cw-m-thread-open').click(); await wait(750);
    assert.match(doc.querySelector('.cw-m-thread-tools').textContent,/未能加载/);
    const before=routes.filter(route=>route==='#!rid7-1').length; await wait(300);
    assert.equal(routes.filter(route=>route==='#!rid7-1').length,before);
    w.addEventListener('hashchange',()=>{if(w.location.hash==='#!rid7-1'&&!doc.querySelector('[data-mid="1"]')) doc.querySelector('#scroll').insertAdjacentHTML('afterbegin',message(1,1,'重试成功'));});
    doc.querySelector('.cw-m-thread-tools button').click(); await wait(750);
    assert.ok(doc.querySelector('.cw-m-thread-list').textContent.includes('重试成功'));
    assert.ok(!doc.querySelector('.cw-m-thread-tools').textContent.includes('未能加载'));assert.equal(doc.querySelector('.cw-m-thread-tools').hidden,true);
  } finally {dom.window.close();}
});
test('按账号、时间及消息去重，排除引用、删除、别的房间和未知时间',()=>{
  const {dom,w,core}=setup(message(1,4,to(12))+message(2,2,to(12)+to(12)+re(12))+message(3,1,`<blockquote>${to(12)}</blockquote>`)+message(4,1,to(12),'8')+message(5,1,to(12),'7',true)+message(6,1,to(123))+message(2,2,to(12)));
  try {
    assert.equal(core.account(w.document).id,'12');
    const groups=core.matches(core.messages(w.document,'7'),'12',3,now);
    assert.deepEqual(Array.from(groups.to,m=>m.id),['2']); assert.deepEqual(Array.from(groups.re,m=>m.id),['2']);
  } finally {dom.window.close();}
});
test('跨过截止时间但消息索引有缺口时不能声明完整',()=>{
  const {dom,w,core}=setup(message(1,4,to(12))+message(3,1,to(12)));
  try {assert.equal(core.covered(core.messages(w.document,'7'),now-3*86400000),false);
    w.document.querySelector('#scroll').insertAdjacentHTML('beforeend',message(2,2,to(12)));
    assert.equal(core.covered(core.messages(w.document,'7'),now-3*86400000),true);
  } finally {dom.window.close();}
});
test('默认三天、上下循环跳转、天数保存及切换房间不串数据',async()=>{
  const store={}; const {dom,w,start}=setup(message(1,2,to(12))+message(2,1,to(12)+re(12)),store);
  try {start(); await wait(20);
    const doc=w.document; assert.equal(doc.querySelector('input[type=number]').value,'3');
    const next=doc.querySelector('[aria-label="下一条匹配消息"]');
    next.click(); assert.equal(w.jumped,'1'); next.click(); assert.equal(w.jumped,'2'); next.click(); assert.equal(w.jumped,'1');
    doc.querySelector('[aria-label="上一条匹配消息"]').click(); assert.equal(w.jumped,'2');
    const input=doc.querySelector('input[type=number]'); input.value='1'; input.dispatchEvent(new w.Event('change')); assert.equal(store.mentionDays,1);
    doc.querySelector('[data-roomid]').dataset.roomid='8'; await wait(250);
    assert.match(doc.querySelector('.cw-m-counts').value,/相关信息：0/); assert.equal(next.disabled,true);
  } finally {dom.window.close();}
});
test('找不到自己时提示确认账号，手动选择后按编号匹配',async()=>{
  const {dom,w,start}=setup(message(1,1,to(12)));
  try {w.document.querySelector('[data-testid]').textContent='Unknown'; start(); await wait(20);
    assert.match(w.document.querySelector('.cw-m-status').getAttribute('aria-label'),/设置自己的账号/);
    const person=w.document.querySelector('[aria-label="选择统计成员"]'); person.value='self-settings'; person.dispatchEvent(new w.Event('change'));
    w.document.querySelector('.cw-m-settings input').value='12'; w.document.querySelector('[aria-label="确定成员账号"]').click();
    assert.match(w.document.querySelector('.cw-m-counts').value,/相关信息：1/);
  } finally {dom.window.close();}
});
test('历史分批加载至截止时间后恢复阅读位置并解除翻译暂停',async()=>{
  const {dom,w,start}=setup(message(4,1,to(12)));
  try {
    const native=w.setTimeout.bind(w); w.setTimeout=(fn,ms)=>native(fn,ms===1000?5:ms);
    const scroll=w.document.querySelector('#scroll'); let top=300; let page=4;
    Object.defineProperty(scroll,'scrollHeight',{get:()=>1000});
    Object.defineProperty(scroll,'scrollTop',{get:()=>top,set:v=>{top=v; if(v===0&&page>1){page--;scroll.insertAdjacentHTML('afterbegin',message(page,5-page,to(12)));}}});
    start(); await wait(20); w.document.querySelector('[aria-label="刷新并加载指定天数的聊天记录"]').click();
    assert.equal(w.document.documentElement.dataset.cwHistoryLoading,'1'); await wait(150);
    assert.match(w.document.querySelector('.cw-m-status').getAttribute('aria-label'),/已覆盖/);
    assert.equal(w.document.documentElement.dataset.cwHistoryLoading,undefined);
    assert.match(w.document.querySelector('.cw-m-counts').value,/相关信息：2/);
  } finally {dom.window.close();}
});
test('历史加载停滞不伪报完整，停止后不再翻页',async()=>{
  const {dom,w,start}=setup(message(4,1,to(12)));
  try {const native=w.setTimeout.bind(w); w.setTimeout=(fn,ms)=>native(fn,ms===1000?5:ms);
    start(); await wait(20); const load=w.document.querySelector('[aria-label="刷新并加载指定天数的聊天记录"]');
    load.click(); await wait(120); assert.match(w.document.querySelector('.cw-m-status').getAttribute('aria-label'),/无法继续/);
    load.click(); load.click(); await wait(30); assert.match(w.document.querySelector('.cw-m-status').getAttribute('aria-label'),/已停止/);
    assert.equal(w.document.documentElement.dataset.cwHistoryLoading,undefined);
  } finally {dom.window.close();}
});

test('相关信息只读显示去重总数，统一箭头去重跳转全部类型',async()=>{
  const {dom,w,start}=setup(message(1,1,to(20),'7',false,'12')+message(2,1,re(20),'7',false,'20')+message(3,1,to(12),'7',false,'20'));
  try {start(); await wait(20); const doc=w.document;
    const person=doc.querySelector('[aria-label="选择统计成员"]'); person.value='20'; person.dispatchEvent(new w.Event('change'));
    assert.equal(doc.querySelector('.cw-m-counts').value,'相关信息：3');
    assert.equal(doc.querySelector('.cw-m-counts').readOnly,true);
    assert.equal(doc.querySelector('[aria-pressed]'),null);
    const next=doc.querySelector('[aria-label="下一条匹配消息"]');
    next.click(); assert.equal(w.jumped,'1'); next.click(); assert.equal(w.jumped,'2'); next.click(); assert.equal(w.jumped,'3');
    next.click(); assert.equal(w.jumped,'1');
    doc.querySelector('[aria-label="上一条匹配消息"]').click(); assert.equal(w.jumped,'3');
    assert.equal(doc.querySelector('.cw-m-position').textContent,'3/3');
  } finally {dom.window.close();}
});
test('导航关闭设置被保留，实时开启和关闭且取消加载',async()=>{
  const {dom,w,start}=setup(message(1,1,to(12)),{mentionEnabled:false});
  try {const native=w.setTimeout.bind(w); w.setTimeout=(fn,ms)=>native(fn,ms===1000?5:ms);
    start(); await wait(20); assert.equal(w.document.querySelector('#cw-mentions'),null);
    w.storageChanged({mentionEnabled:{newValue:true}},'local'); assert.ok(w.document.querySelector('#cw-mentions'));
    w.document.querySelector('[aria-label="刷新并加载指定天数的聊天记录"]').click();
    w.storageChanged({mentionEnabled:{newValue:false}},'local'); assert.equal(w.document.querySelector('#cw-mentions'),null);
    await wait(40); assert.equal(w.document.documentElement.dataset.cwHistoryLoading,undefined);
    assert.equal(w.document.querySelector('#cw-mentions'),null);
  } finally {dom.window.close();}
});

test('相关回复链包含分支，不混入同人无关消息，前后有界跳转',async()=>{
  const reply=id=>`<div data-cwtag="[rp aid=12 to=7-${id}]"><span class="_replyMessage">RE</span></div>`;
  const {dom,w,start}=setup(message(1,5,to(12))+message(2,2,reply(1))+message(3,1,reply(2))+message(4,1,reply(1))+message(5,1,to(12)));
  try {start(); await wait(20); const doc=w.document;
    assert.equal(doc.querySelectorAll('.cw-m-related').length,5);
    const first=doc.querySelector('[data-mid="1"] .cw-m-related');
    assert.equal(first.querySelector('[aria-label="上一条相关信息"]').disabled,true);
    first.querySelector('[aria-label="下一条相关信息"]').click(); assert.equal(w.jumped,'2');
    doc.querySelector('[data-mid="2"] [aria-label="下一条相关信息"]').click(); assert.equal(w.jumped,'3');
    doc.querySelector('[data-mid="3"] [aria-label="下一条相关信息"]').click(); assert.equal(w.jumped,'4');
    assert.equal(doc.querySelector('[data-mid="4"] [aria-label="下一条相关信息"]').disabled,true);
    doc.querySelector('[data-mid="4"] [aria-label="上一条相关信息"]').click(); assert.equal(w.jumped,'3');
    assert.equal(doc.querySelector('pre .cw-m-related'),null);
    w.storageChanged({mentionEnabled:{newValue:false}},'local'); assert.equal(doc.querySelector('.cw-m-related'),null);
  } finally {dom.window.close();}
});
test('未加载原消息通过消息直达链接定位，不点击原生回复预览',async()=>{
  const {dom,w,start}=setup(message(3,1,'<div data-cwtag="[rp aid=12 to=7-1]"><span class="_replyMessage">RE</span></div>'));
  try {let clicked=0;w.document.querySelector('._replyMessage').addEventListener('click',()=>clicked++);start();await wait(20);
    w.document.querySelector('[aria-label="上一条相关信息"]').click(); assert.equal(clicked,0); assert.equal(w.location.hash,'#!rid7-1'); assert.equal(w.document.querySelector('.cw-m-preview'),null);
    w.document.querySelector('#scroll').insertAdjacentHTML('afterbegin',message(1,4,to(12)));
    await wait(250); w.document.querySelector('[data-mid="3"] [aria-label="上一条相关信息"]').click();assert.equal(w.jumped,'1');assert.equal(clicked,0);
    assert.equal(w.document.querySelectorAll('.cw-m-related').length,2);
  } finally {dom.window.close();}
});
test('相关关系保持大整数编号，排除引用、别的聊天室和已删除节点',()=>{
  const {dom,w,core}=setup(message('2151551620205645824',2,to(12))+message('2151551620205645825',1,'<div data-cwtag="[rp aid=12 to=7-2151551620205645824]"></div>')+message('2151551620205645826',1,'<blockquote><div data-cwtag="[rp aid=12 to=7-2151551620205645824]"></div></blockquote>')+message('2151551620205645827',1,'<div data-cwtag="[rp aid=12 to=8-2151551620205645824]"></div>'));
  try {const groups=core.related(core.messages(w.document,'7'));
    assert.deepEqual(Array.from(groups.get('2151551620205645825'),m=>m.id),['2151551620205645824','2151551620205645825']);
    assert.equal(groups.get('2151551620205645826').length,1);assert.equal(groups.get('2151551620205645827').length,1);
  } finally {dom.window.close();}
});

test('无已加载关联显示无人回复并隐藏箭头，加载回复后显示箭头',async()=>{
  const {dom,w,start}=setup(message(1,1,to(12)+to(20)));
  try {start();await wait(20);const doc=w.document;const box=doc.querySelector('.cw-m-related');
    assert.match(box.textContent,/无人回复/);
    assert.equal(box.querySelector('[aria-label="上一条相关信息"]').hidden,true);
    assert.equal(box.querySelector('[aria-label="下一条相关信息"]').hidden,true);
    assert.equal(box.querySelector('[aria-label="上一条相关信息"]').disabled,true);
    assert.equal(box.querySelector('[aria-label="下一条相关信息"]').disabled,true);
    doc.querySelector('#scroll').insertAdjacentHTML('beforeend',message(2,1,re(12)));
    await wait(250);assert.equal(box.querySelector('[aria-label="下一条相关信息"]').disabled,false);
    assert.equal(box.querySelector('[aria-label="下一条相关信息"]').hidden,false);
    assert.doesNotMatch(box.textContent,/无人回复/);
    box.querySelector('[aria-label="下一条相关信息"]').click();assert.equal(w.jumped,'2');
  } finally {dom.window.close();}
});
test('滚动复用消息节点时，关联按钮使用新消息编号而不是旧编号',async()=>{
  const {dom,w,start}=setup(message(1,2,to(12))+message(2,1,re(12))+message(3,1,to(12)));
  try {start();await wait(20);const doc=w.document;const recycled=doc.querySelector('[data-mid="2"]');
    recycled.dataset.mid='4';recycled.dataset.index='4';
    recycled.querySelector('[data-cwtag]').dataset.cwtag='[rp aid=12 to=7-3]';
    doc.querySelector('#scroll').dispatchEvent(new w.Event('scroll'));
    await wait(250);const btn=recycled.querySelector('[aria-label="上一条相关信息"]');
    assert.equal(btn.disabled,false);btn.click();assert.equal(w.jumped,'3');
    assert.equal(recycled.querySelectorAll('.cw-m-related').length,1);
  } finally {dom.window.close();}
});
test('消息标题重建会补回按钮，持续页面变动不会让刷新一直延后',async()=>{
  const {dom,w,start}=setup(message(1,1,to(12)));
  try {const doc=w.document, m=doc.querySelector('._message');
    const author=doc.createElement('div');author.innerHTML='<button><p data-testid="timeline_user-name">Member</p></button>';m.querySelector('pre').before(author);
    start();await wait(20);assert.ok(author.querySelector('.cw-m-related'));
    author.replaceChildren(author.firstElementChild);doc.querySelector('#scroll').dispatchEvent(new w.Event('scroll'));
    const noise=doc.createElement('div');doc.body.append(noise);const interval=w.setInterval(()=>noise.textContent=String(Date.now()),40);
    await wait(330);w.clearInterval(interval);assert.ok(author.querySelector('.cw-m-related'));
    assert.equal(m.querySelectorAll('.cw-m-related').length,1);
  } finally {dom.window.close();}
});

test('序号恢复为当前位置/总数，已加载目标箭头只滚动，不改变网址或打开预览',async()=>{
  const {dom,w,start}=setup(message(1,2,to(12))+message(2,1,re(12))+message(3,1,re(12)));
  try {start();await wait(20);const doc=w.document;const original=w.location.href;
    assert.match(doc.querySelector('[data-mid="2"] .cw-m-related > .cw-m-related-label').textContent,/相关信息 2\/3/);
    doc.querySelector('[data-mid="2"] [aria-label="上一条相关信息"]').click();assert.equal(w.jumped,'1');assert.equal(w.location.href,original);assert.equal(doc.querySelector('.cw-m-preview'),null);
  } finally {dom.window.close();}
});
test('重复定位已卸载目标能重新进入直达链接；关闭导航取消尚未执行的定位',async()=>{
  const {dom,w,start}=setup(message(3,1,re(12)));
  try {w.history.replaceState(null,'','#!rid7-1');start();await wait(20);const doc=w.document;
    doc.querySelector('[aria-label="上一条相关信息"]').click();assert.equal(w.location.hash,'#!rid7');await wait(90);assert.equal(w.location.hash,'#!rid7-1');
    doc.querySelector('[aria-label="上一条相关信息"]').click();w.storageChanged({mentionEnabled:{newValue:false}},'local');await wait(90);assert.equal(w.location.hash,'#!rid7');
  } finally {dom.window.close();}
});


test('Thread 导出按钮在标题栏，移除范围说明；无缺失时隐藏整行加载提示',async()=>{
  const {dom,w,start}=setup(message(1,1,'正文')+message(2,1,re(12)+'回复'));
  try {start();await wait(25);const doc=w.document;doc.querySelector('.cw-m-thread-open').click();const panel=doc.querySelector('.cw-m-thread');
    assert.equal(panel.querySelectorAll('header .cw-m-thread-export button').length,2);
    assert.equal(panel.querySelector('.cw-m-thread-note'),null);assert.ok(!panel.textContent.includes('仅包含当前聊天室'));
    assert.equal(panel.querySelector('.cw-m-thread-tools').hidden,true);assert.equal(panel.querySelector('.cw-m-thread-tools span').textContent,'');
  }finally{dom.window.close();}
});

test('补载失败后消息稍晚到达时，自动清除过期失败提示并隐藏提示行',async()=>{
  const {dom,w,start}=setup(message(2,1,re(12)+'回复'));
  try {w.Date.now=()=>Date.now()*100;start();await wait(25);const doc=w.document;doc.querySelector('.cw-m-thread-open').click();await wait(750);
    const row=doc.querySelector('.cw-m-thread-tools');assert.equal(row.hidden,false);assert.match(row.textContent,/未能加载/);
    doc.querySelector('#scroll').insertAdjacentHTML('afterbegin',message(1,1,'稍晚加载完成'));await wait(300);
    assert.equal(row.hidden,true);assert.equal(row.querySelector('span').textContent,'');assert.ok(doc.querySelector('.cw-m-thread-list').textContent.includes('稍晚加载完成'));
  }finally{dom.window.close();}
});
