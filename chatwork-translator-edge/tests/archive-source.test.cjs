const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),test=require('node:test');
function fixture(){
 const d=new JSDOM('<div class="chatRoomHeader__roomTitle">Test</div><div id="scroll"><article><pre>hello<a href="gateway/download_file.php?file_id=10">a.txt</a><span class="cw-zh-translation">TRANSLATION</span></pre></article></div>',{url:'https://www.chatwork.com/',runScripts:'outside-only'});const w=d.window;let handler;let account={key:'a',name:'A'};
 w.TextDecoder=TextDecoder;w.AbortController=AbortController;w.fetch=async()=>new Response('hello',{headers:{'content-type':'text/plain'}});
 w.chrome={i18n:{getMessage:key=>require('../_locales/en/messages.json')[key]?.message||key},runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>handler=fn}}};
 w.ChatworkMentions={roomId:()=> '1',account:()=>account,scroller:()=>w.document.getElementById('scroll'),messages:()=>[{el:w.document.querySelector('article'),id:'2',time:Date.now(),index:1,sender:'3',to:new Set(),re:new Set()}]};
 w.eval(fs.readFileSync(path.join(__dirname,'../archive-source.js'),'utf8'));
 const call=m=>new Promise(resolve=>handler({type:'cw-archive',...m},{id:'test',url:'chrome-extension://test/archive.html'},resolve));
 return {w,call,setAccount:a=>account=a,close:()=>d.window.close()};
}
test('archive extracts original only and stops',async()=>{const f=fixture();await f.call({action:'start',from:Date.now()-10000,to:Date.now()+10000});const r=await f.call({action:'poll'});assert.equal(r.value.records[0].text,'helloa.txt');assert.equal(r.value.records[0].files[0].id,'10');await f.call({action:'stop'});f.close();});
test('rejects permission error body with HTTP 200',async()=>{const f=fixture();f.w.fetch=async()=>new Response('ファイルをダウンロードする権限がありません',{headers:{'content-type':'text/plain'}});const r=await f.call({action:'file-open',id:'10',roomId:'1',accountKey:'a'});const c=await f.call({action:'file-read',token:r.value.token});assert.match(c.error,/Permission denied/);f.close();});
test('streams original bytes and rejects account changes',async()=>{const f=fixture();let r=await f.call({action:'file-open',id:'10',roomId:'1',accountKey:'a'});let c=await f.call({action:'file-read',token:r.value.token});assert.equal(Buffer.from(c.value.data,'base64').toString(),'hello');await f.call({action:'file-close',token:r.value.token});r=await f.call({action:'file-open',id:'10',roomId:'1',accountKey:'a'});f.setAccount({key:'b'});c=await f.call({action:'file-read',token:r.value.token});assert.match(c.error,/Account or room changed/);f.close();});

test('automatic queue drains beyond 200 and requeues edited messages only',async()=>{
 const f=fixture(),time=Date.now()-1000;
 const rows=Array.from({length:450},(_,i)=>({el:f.w.document.querySelector('article'),id:String(i),time,index:i,sender:'3',to:new Set(),re:new Set()}));
 f.w.ChatworkMentions.messages=()=>rows;
 const ids=new Set();
 for(let n=0;n<3;n++){
  const response=await f.call({action:'visible'});assert(!response.error,response.error);const records=response.value.records;
  assert.equal(records.length,n===2?50:200);records.forEach(m=>ids.add(m.id));
  await f.call({action:'ack-visible',roomKey:'https://www.chatwork.com|a|1',records:records.map(m=>({id:m.id,capturedAt:m.capturedAt}))});
 }
 assert.equal(ids.size,450);assert.equal((await f.call({action:'visible'})).value.records.length,0);
 rows[449]={...rows[449],sender:'edited'};const changed=(await f.call({action:'visible'})).value.records;assert.equal(changed.length,1);assert.equal(changed[0].id,'449');f.close();
});

test('archive room names exclude injected translations and preserve real parentheses',async()=>{
 const f=fixture();
 const title=f.w.document.querySelector('.chatRoomHeader__roomTitle');
 title.innerHTML='Original (Team)<span class="cw-room-translation">Translated</span>';
 const tab=f.w.document.createElement('div');tab.setAttribute('role','tab');tab.dataset.rid='2';tab.setAttribute('aria-label','Other (Room)');f.w.document.body.append(tab);
 const result=await f.call({action:'context'});
 assert.equal(result.value.roomName,'Original (Team)');
 assert.equal(result.value.roomNames['1'],'Original (Team)');
 assert.equal(result.value.roomNames['2'],'Other (Room)');
 assert.equal(title.textContent,'Original (Team)Translated');
 f.close();
});
