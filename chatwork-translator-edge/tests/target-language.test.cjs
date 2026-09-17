const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function harness(detector) {
  const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
  require('./support/i18n.cjs').install(w);
  if(detector)w.chrome.i18n.detectLanguage=detector;
  w.eval(fs.readFileSync(path.join(root,'protected-text.js'),'utf8'));
  return {dom,w,match:w.ProtectedText.isTargetLanguage};
}
const examples={zh:'请确认目前的版本是否已经准备完成，谢谢您的协助。',traditional:'請確認目前的版本是否已經準備完成，謝謝您的協助。',ja:'お世話になっております。現在のバージョンをご確認ください。',en:'Please check the current version and let us know when you are ready.',ko:'현재 버전을 확인해 주세요. 준비가 완료되면 알려 주세요.'};
test('screenshot Chinese with unknown English names is recognized without trusting native detection',async()=>{
  const source='感谢您的来信。因为刘今天和明天休假，所以由我代为回复。关于您提到的“仅有 Logic2 成功，其余均失败”一事，我们是否可以理解为您会进行修改并重新测试呢？';
  for(const detector of [undefined,()=>{throw Error('unavailable');},async()=>({isReliable:false,languages:[{language:'en',percentage:100}]}),async()=>({isReliable:true,languages:[{language:'en',percentage:100}]})]) {
    const h=harness(detector);
    try {
      assert.equal(await h.match(source,'zh'),true);
      assert.equal(await h.match(source.replace('Logic2','CustomEngine99'),'zh'),true);
      assert.equal(await h.match(source,'zh-Hant'),false);
      assert.equal(await h.match('Logic2のみ成功して他では失敗したとのことですが、こちらは修正して再度テストしていただける認識でよろしいでしょうか？','zh'),false);
      assert.equal(await h.match('请确认 The current version is ready and we will send the next update tomorrow.','zh'),false);
      assert.equal(await h.match('確認','zh'),false);
    }finally{h.dom.window.close();}
  }
});
test('clear target-language prose skips locally without a detector, other targets do not',async()=>{
  const h=harness();try{
    for(const [key,target] of [['zh','zh'],['traditional','zh-Hant'],['ja','ja'],['en','en'],['ko','ko']])assert.equal(await h.match(examples[key],target),true,key);
    assert.equal(await h.match(examples.ja,'en'),false);
    assert.equal(await h.match(examples.en,'ja'),false);
    assert.equal(await h.match(examples.zh,'ko'),false);
    assert.equal(await h.match(examples.ko,'zh'),false);
    assert.equal(await h.match(examples.zh,'zh-Hant'),false);
    assert.equal(await h.match(examples.traditional,'zh'),false);
  }finally{h.dom.window.close();}
});
test('names, URLs and metadata are omitted from detection but input stays unchanged',async()=>{
  let inspected;
  const h=harness((body,cb)=>{inspected=body;cb({isReliable:true,languages:[{language:'en',percentage:95},{language:'ja',percentage:5}]});});
  try{
    const source='TO: CWNAME0ENDさん\nRE: CWNAME1END\nhttps://example.com/日本語\n'+examples.en;
    assert.equal(await h.match(source,'en'),true);
    assert.doesNotMatch(inspected,/CWNAME|example|https|TO:|RE:|さん/);
    assert.ok(source.includes('CWNAME0ENDさん\n'));
  }finally{h.dom.window.close();}
});
test('native detection uses reliability, dominant share and actual configured target',async()=>{
  let result;
  const h=harness(async()=>result);
  try{
    result={isReliable:true,languages:[{language:'fr',percentage:92},{language:'en',percentage:8}]};
    const body='Bonjour, veuillez vérifier cette nouvelle version et confirmer le résultat.';
    assert.equal(await h.match(body,'fr-FR'),true);
    assert.equal(await h.match(body,'en'),false);
    result={isReliable:true,languages:[{language:'fr',percentage:60},{language:'en',percentage:40}]};
    assert.equal(await h.match(body,'fr'),false);
    result={isReliable:false,languages:[{language:'fr',percentage:99}]};
    assert.equal(await h.match(body,'fr'),false);
    result={isReliable:true,languages:[{language:'zh-CN',percentage:99}]};
    assert.equal(await h.match(examples.traditional,'zh-Hant'),true);
    assert.equal(await h.match(examples.zh,'zh-Hant'),false);
  }finally{h.dom.window.close();}
});
test('ambiguous short text, balanced languages and isolated Latin product names are not skipped',async()=>{
  const h=harness();try{
    for(const target of ['zh','zh-Hant','ja','en','ko'])assert.equal(await h.match('確認 CPU 123',target),false);
    const mixed=examples.ja+'\n'+examples.en;
    assert.equal(await h.match(mixed,'ja'),false);assert.equal(await h.match(mixed,'en'),false);
    assert.equal(await h.match(examples.zh.repeat(4)+'です','ja'),false);
  }finally{h.dom.window.close();}
});
test('detector failure falls back without rejecting or hanging translation',async()=>{
  const h=harness(()=>{throw Error('not available');});try{
    assert.equal(await h.match(examples.en,'en'),true);
    assert.equal(await h.match('Bonjour tout le monde','fr'),false);
    h.w.chrome.i18n.detectLanguage=()=>new Promise(()=>{});
    const nativeTimer=h.w.setTimeout;h.w.setTimeout=(fn)=>nativeTimer(fn,5);
    assert.equal(await h.match('Bonjour tout le monde','fr'),false);
  }finally{h.dom.window.close();}
});
if(fs.existsSync(path.join(root,'local-translator.js'))){
  test('Edge target-language messages skip before model lookup; unrelated messages translate',async()=>{
    const h=harness();let calls=0;
    try{
      h.w.chrome.storage={local:{get:async()=>({enabled:true})}};
      h.w.Translator={availability:async()=>{calls++;return 'available';},create:async()=>({translate:async()=> 'translated',destroy(){}})};
      h.w.eval(fs.readFileSync(path.join(root,'local-translator.js'),'utf8'));
      h.w.EdgeTranslation.configure('ja','en');
      assert.equal((await h.w.EdgeTranslation.translate(examples.en)).reason,'already-target-language');
      assert.equal(calls,0);
      assert.equal((await h.w.EdgeTranslation.translate(examples.ja)).text,'translated');
      assert.equal(calls,1);
    }finally{h.dom.window.close();}
  });
  test('changing target during detection discards old result',async()=>{
    let answer;
    const h=harness((text,callback)=>{answer=callback;});
    try{
      h.w.chrome.storage={local:{get:async()=>({enabled:true})}};
      h.w.eval(fs.readFileSync(path.join(root,'local-translator.js'),'utf8'));
      h.w.EdgeTranslation.configure('ja','en');
      const pending=h.w.EdgeTranslation.translate(examples.en);
      await new Promise(resolve=>setTimeout(resolve,5));
      h.w.EdgeTranslation.configure('ja','ko');
      answer({isReliable:true,languages:[{language:'en',percentage:100}]});
      await assert.rejects(pending);
    }finally{h.dom.window.close();}
  });
}
