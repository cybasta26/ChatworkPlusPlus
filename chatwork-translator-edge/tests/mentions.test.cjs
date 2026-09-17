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

test('上下预览不跳转，不复制活跃 HTML；前往按钮才定位消息',async()=>{
  const {dom,w,start}=setup(message(1,2,'第一行\n第二行&lt;img src=x onerror=alert(1)&gt;')+message(2,1,re(12)));
  try {start();await wait(20);const doc=w.document;
    const translation=doc.createElement('section');translation.className='cw-zh-translation';translation.innerHTML='<b class="cw-zh-label">中文</b><div class="cw-zh-body">已有译文</div>';doc.querySelector('[data-mid="1"]').append(translation);
    const btn=doc.querySelector('[data-mid="2"] [aria-label="预览上一条相关信息"]');btn.click();
    const dialog=doc.querySelector('.cw-m-preview');assert.ok(dialog);assert.equal(w.jumped,undefined);
    assert.match(dialog.textContent,/第一行/);assert.match(dialog.textContent,/已有译文/);
    assert.equal(dialog.querySelector('script, [onerror], ._message, .cw-m-related'),null);
    assert.equal(doc.querySelectorAll('#_timeLine ._message').length,2);
    assert.equal(btn.getAttribute('aria-expanded'),'true');
    dialog.querySelector('[aria-label="前往预览的消息"]').click();assert.equal(w.jumped,'1');assert.equal(doc.querySelector('.cw-m-preview'),null);
    doc.querySelector('[data-mid="1"] [aria-label="预览下一条相关信息"]').click();assert.ok(doc.querySelector('.cw-m-preview'));
    doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(doc.querySelector('.cw-m-preview'),null);
  } finally {dom.window.close();}
});
test('缺失原消息预览保持原位置，前往直接定位而不触发原生预览',async()=>{
  const {dom,w,start}=setup(message(2,1,'<div data-cwtag="[rp aid=12 to=7-1]"><span class="_replyMessage">RE</span></div>'));
  try {let clicked=0;const doc=w.document;doc.querySelector('._replyMessage').addEventListener('click',()=>clicked++);start();await wait(20);
    doc.querySelector('[aria-label="预览上一条相关信息"]').click();assert.equal(clicked,0);assert.match(doc.querySelector('.cw-m-preview').textContent,/尚未加载/);
    doc.querySelector('[aria-label="前往预览的消息"]').click();assert.equal(clicked,0);assert.equal(w.location.hash,'#!rid7-1');assert.equal(doc.querySelector('.cw-m-preview'),null);
  } finally {dom.window.close();}
});
test('点击外部、滚动聊天室、关闭导航会关闭预览；小窗内滚动不关闭',async()=>{
  const {dom,w,start}=setup(message(1,2,to(12))+message(2,1,re(12)));
  try {start();await wait(20);const doc=w.document;const open=()=>doc.querySelector('[data-mid="2"] [aria-label="预览上一条相关信息"]').click();
    open();doc.querySelector('.cw-m-preview-content').dispatchEvent(new w.Event('scroll'));assert.ok(doc.querySelector('.cw-m-preview'));
    doc.body.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal(doc.querySelector('.cw-m-preview'),null);
    open();doc.querySelector('#scroll').dispatchEvent(new w.Event('scroll'));assert.equal(doc.querySelector('.cw-m-preview'),null);
    open();w.storageChanged({mentionEnabled:{newValue:false}},'local');assert.equal(doc.querySelector('.cw-m-preview'),null);
  } finally {dom.window.close();}
});

test('序号恢复为当前位置/总数，已加载目标箭头只滚动，不改变网址或打开预览',async()=>{
  const {dom,w,start}=setup(message(1,2,to(12))+message(2,1,re(12))+message(3,1,re(12)));
  try {start();await wait(20);const doc=w.document;const original=w.location.href;
    assert.match(doc.querySelector('[data-mid="2"] .cw-m-related > span').textContent,/相关信息 2\/3/);
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
