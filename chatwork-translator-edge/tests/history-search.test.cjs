const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
for(const browser of ['chrome','edge']) test(browser+': search hydrates offscreen bodies and retains matches after unmount',async()=>{
 const root=path.resolve(__dirname,'../../chatwork-translator-'+browser);
 const now=Math.floor(Date.now()/1000);
 const messages=Array.from({length:32},(_,i)=>'<div class="_message" data-rid="7" data-mid="'+(i+1)+'" data-index="'+i+'"><div class="_speaker"><span data-aid="12"></span></div><pre>'+(i===0?'':'ordinary text')+'</pre><span class="_timeStamp" data-tm="'+now+'"></span></div>').join('');
 const dom=new JSDOM('<div id="_roomHeader"><div id="_roomTitle"><i data-roomid="7"></i></div><div class="chatRoomHeader__infoContainer"></div></div><div id="_timeLine">'+messages+'</div>',{url:'https://www.chatwork.com/#!rid7',runScripts:'outside-only'});
 const w=dom.window;
 try {
   w.chrome={storage:{local:{set:async()=>{}}}};
   w.CW_I18N={t:(key,args=[])=>key+args.join('/')};
   w.CSS={highlights:new Map()};w.Highlight=class extends Set {constructor(...r){super(r);}};
   w.eval(fs.readFileSync(path.join(root,'mentions-core.js'),'utf8'));
   const scroll=w.document.querySelector('#_timeLine');
   w.ChatworkMentions.account=()=>({id:'12',key:'self'});
   w.ChatworkMentions.scroller=()=>scroll;
   w.ChatworkMentions.covered=()=>true;
   let visits=0;
   w.HTMLElement.prototype.scrollIntoView=function(){visits++;if(this.dataset.mid==='1')this.querySelector('pre').innerHTML='Firebase <b>Crash</b>lytics crashlyticsExtra CRASHLYTICS';};
   let src=fs.readFileSync(path.join(root,'mentions.js'),'utf8');
   src=src.replace('  try { if (!extensionContextAlive()) return; }',`  globalThis.searchTest={
     init(){refresh();recipient='';coverage=true;refresh();},
     refresh,
     search:applyKeywordSearch,
     state(){return {count:groups.all.length,status,keyword,busy:searchBusy};},
     options(value,matchCase=false,word=false){controls.keyword.value=value;controls.caseSensitive.checked=matchCase;controls.wholeWord.checked=word;},
     cacheSize(){return bodyCache.size;}
   };
   try { if (!extensionContextAlive()) return; }`);
   w.eval(src);const api=w.searchTest;api.init();
   assert.equal(api.state().count,32);
   api.options('Crashlytics');await api.search();
   assert.equal(api.state().count,1);assert.ok(visits>0);
   assert.equal(api.state().status,'history_search_complete');
   const body=w.document.querySelector('[data-mid="1"] pre');
   assert.equal(body.querySelectorAll('mark').length,0,'highlight must not mutate message text');
   assert.equal(w.CSS.highlights.get('cw-history-keyword').size,3);
   body.replaceChildren();api.refresh();
   assert.equal(api.state().count,1,'offscreen body retained');
   api.options('Crashlytics',true,true);await api.search();assert.equal(api.state().count,1);
   api.options('crashlytics',true,true);await api.search();assert.equal(api.state().count,0);
   api.options('');await api.search();assert.equal(api.state().count,32);
   w.document.querySelector('#_roomTitle i').dataset.roomid='8';api.refresh();
   assert.equal(api.cacheSize(),0,'cache isolated by room');
 } finally{w.close();}
});

