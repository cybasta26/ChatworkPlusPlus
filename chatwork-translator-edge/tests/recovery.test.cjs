const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function setup(factory) {
  const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window,saved={enabled:true};
  w.chrome={storage:{local:{get:async()=>saved}}};
  require('./support/i18n.cjs').install(w);
  w.Translator={availability:async()=> 'available',create:factory};
  w.eval(read('protected-text.js'));w.eval(read('local-translator.js'));
  return {dom,w,saved,api:w.EdgeTranslation};
}
function generic(){const error=new Error('Other generic failures occurred.');error.name='UnknownError';return error;}
test('generic failure recreates session once and recovers with identical model input',async()=>{
  let created=0,destroyed=0;const inputs=[];
  const h=setup(async()=>{const id=++created;return {destroy(){destroyed++;},translate:async text=>{inputs.push(text);if(id===1)throw generic();return '译文';}};});
  try{
    const result=await h.api.translate('ご連絡ありがとうございます。');
    assert.equal(result.text,'译文');assert.equal(result.incomplete,undefined);
    assert.equal(created,2);assert.equal(destroyed,1);assert.equal(inputs[0],inputs[1]);
  }finally{h.dom.window.close();}
});
test('persistent failure preserves successes, marks original line, and is not cached',async()=>{
  let failure=true,attempts=0;
  const h=setup(async()=>({destroy(){},translate:async text=>{if(text==='問題の文章です。'&&failure){attempts++;throw generic();}return '译:'+text;}}));
  try{
    const source='RE: CWNAME0ENDさん\r\nご連絡ありがとうございます。\r\n\r\n問題の文章です。\r\n確認いたします。';
    const result=await h.api.translate(source);
    assert.equal(result.incomplete,true);assert.equal(result.failures.length,1);assert.equal(result.failures[0].line,4);
    assert.equal(attempts,2);assert.ok(result.text.startsWith('RE: CWNAME0ENDさん\r\n译:'));
    assert.ok(result.text.includes('〔第4行翻译失败，原文〕問題の文章です。'));
    assert.ok(result.text.endsWith('译:確認いたします。'));
    assert.equal(result.text.split('\r\n').length,source.split('\r\n').length);
    failure=false;const retry=await h.api.translate(source);
    assert.equal(retry.incomplete,undefined);assert.ok(retry.text.includes('译:問題の文章です。'));
  }finally{h.dom.window.close();}
});
test('screenshot bilingual shape preserves Chinese line and translates full Japanese lines',async()=>{
  const calls=[];
  const h=setup(async()=>({destroy(){},translate:async text=>{calls.push(text);return '译:'+text;}}));
  try{
    const chinese='感谢您的来信。因为刘今天和明天休假，所以由我代为回复。关于您提到的“仅有 Logic2 成功，其余均失败”一事，我们是否可以理解为您会进行修改并重新测试呢？';
    const japanese=['ご連絡ありがとうございます。','劉が今日と明日お休みなので代理で返答いたします。','Logic2のみ成功して他では失敗したとのことですが、こちらは修正して再度テストしていただける認識でよろしいでしょうか？'];
    const source='RE: CWNAME0ENDさん\n'+chinese+'\n---------\n\n'+japanese.join('\n\n');
    const result=await h.api.translate(source);
    assert.ok(result.text.includes(chinese));assert.equal(result.incomplete,undefined);
    assert.deepEqual(calls,japanese);
    assert.equal(result.text.split('\n').length,source.split('\n').length);
  }finally{h.dom.window.close();}
});
test('pause during failure stops recovery rather than returning partial success',async()=>{
  let created=0,h;
  h=setup(async()=>{created++;return {destroy(){},translate:async()=>{h.saved.enabled=false;throw generic();}};});
  try{await assert.rejects(h.api.translate('ご連絡ありがとうございます。'),/暂停/);assert.equal(created,1);}
  finally{h.dom.window.close();}
});
test('partial results are visibly labelled and expose retry in the message',async()=>{
  const dom=new JSDOM('<div class="_message"><pre>ご連絡ありがとうございます。</pre></div>',{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  try{
    w.chrome={storage:{local:{get:async()=>({enabled:true})},onChanged:{addListener(){}}}};
    require('./support/i18n.cjs').install(w);
    w.IntersectionObserver=class{constructor(fn){this.fn=fn;}observe(el){this.fn([{target:el,isIntersecting:true}]);}unobserve(){}};
    w.EdgeTranslation={configure(){},translate:async()=>({text:'〔第1行翻译失败，原文〕ご連絡ありがとうございます。',incomplete:true,failures:[{line:1,name:'UnknownError',message:'Other generic failures occurred.'}]})};
    w.eval(read('names.js'));w.eval(read('content.js'));await new Promise(r=>setTimeout(r,30));
    assert.match(w.document.querySelector('.cw-zh-warning').textContent,/有 1 处/);
    assert.match(w.document.querySelector('.cw-zh-body').textContent,/原文/);
    assert.equal(w.document.querySelector('.cw-zh-translation button').textContent,'重试');
  }finally{w.close();}
});
