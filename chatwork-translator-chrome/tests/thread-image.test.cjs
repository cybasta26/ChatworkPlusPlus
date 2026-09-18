const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
function setup() {
  const dom = new JSDOM(`<style>.hidden{display:none}.cw-m-thread-message{background:rgb(240, 249, 250);padding:14px}.cw-m-thread-source{white-space:pre-wrap}</style><aside class="cw-m-thread"><header>Thread · 2<button>Close</button></header><div class="cw-m-thread-export"><button>Copy</button></div><div class="cw-m-thread-list" style="height:100px;overflow:auto"><article class="cw-m-thread-message"><div class="cw-m-thread-source hidden">hidden original</div><div>translated first</div></article><article class="cw-m-thread-message"><div class="cw-m-thread-source">last original</div><div>translated last</div><button>Go</button></article></div></aside>`,{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.CW_I18N={t:key=>key};
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:440,height:this.matches('.cw-m-export-capture')?3000:600};};
  w.eval(fs.readFileSync(path.join(__dirname,'../thread-image.js'),'utf8'));
  return {dom,w,api:w.ThreadImageExport,box:w.document.querySelector('aside')};
}
test('长图展开完整列表，保留仅译文显示，移除按钮且不改变当前滚动位置',()=>{
  const {dom,w,api,box}=setup();try {
    const list=box.querySelector('.cw-m-thread-list');list.scrollTop=580;
    const copy=api.snapshot(box);
    assert.equal(copy.querySelectorAll('article').length,2);assert.match(copy.textContent,/translated last/);
    assert.equal(copy.querySelectorAll('button').length,0);assert.equal(copy.querySelector('.cw-m-thread-export'),null);
    assert.equal(w.getComputedStyle(copy.querySelector('.cw-m-thread-source')).display,'none');
    assert.equal(copy.querySelector('.cw-m-thread-list').style.height,'auto');assert.equal(copy.querySelector('.cw-m-thread-list').style.overflow,'visible');
    w.document.querySelector('style').remove();assert.equal(w.getComputedStyle(copy.querySelector('article')).padding,'14px');assert.equal(w.getComputedStyle(copy.querySelector('article')).backgroundColor,'rgb(240, 249, 250)');assert.equal(w.getComputedStyle(copy.querySelector('.cw-m-thread-source')).whiteSpace,'pre-wrap');
    assert.equal(list.scrollTop,580);assert.equal(list.style.height,'100px');assert.equal(box.querySelectorAll('button').length,3);
  }finally{dom.window.close();}
});
test('长图尺寸超限按比例缩小，无法保持可读性时明确报错而非裁掉底部',()=>{
  const {dom,api}=setup();try {
    const normal=api.dimensions(440,3000);assert.equal(normal.height,3000);assert.equal(normal.scale,2);
    const large=api.dimensions(800,40000);assert.equal(large.height,40000);assert.ok(large.height*large.scale<=30000);assert.ok(large.width*large.height*large.scale**2<=48000000);
    assert.throws(()=>api.dimensions(800,100000),/thread_image_large/);
  }finally{dom.window.close();}
});
test('生成完整 PNG 并清理临时 DOM 和画布，失败也清理',async()=>{
  const {dom,w,api,box}=setup();let canvas;
  try {
    w.html2canvas=async(el,opts)=>{assert.equal(opts.height,3000);assert.equal(opts.allowTaint,false);assert.equal(opts.useCORS,true);assert.equal(opts.ignoreElements(el),false);assert.equal(opts.ignoreElements(box),true);canvas={width:880,height:6000,toBlob:fn=>fn(new w.Blob(['PNG'],{type:'image/png'}))};return canvas;};
    const blob=await api.capture(box);assert.equal(blob.type,'image/png');assert.equal(canvas.height,0);assert.equal(w.document.querySelector('.cw-m-export-capture'),null);
    w.html2canvas=async()=>{throw new Error('render failed');};await assert.rejects(api.capture(box),/render failed/);assert.equal(w.document.querySelector('.cw-m-export-capture'),null);
    const controller=new w.AbortController();controller.abort();await assert.rejects(api.capture(box,{signal:controller.signal}),{name:'AbortError'});
  }finally{dom.window.close();}
});
test('剪贴板在用户点击期间提交 PNG promise，下载链接带文件名且自动清理',async()=>{
  const {dom,w,api}=setup();try {
    const png=Promise.resolve(new w.Blob(['PNG'],{type:'image/png'}));let captured;
    w.ClipboardItem=class {constructor(value){this.value=value;}};
    Object.defineProperty(w.navigator,'clipboard',{value:{write:items=>{captured=items;return Promise.resolve();}}});
    const done=api.copy(png);assert.equal(captured[0].value['image/png'],png);await done;
    w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){assert.equal(this.download,'thread.png');assert.equal(this.href,'blob:test');assert.ok(this.isConnected);};
    api.save(await png,'thread.png');assert.equal(w.document.querySelector('a'),null);
  }finally{dom.window.close();}
});
