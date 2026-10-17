const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const dir=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!/^archive[\w.-]*\.(js|html|css)$/.test(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(dir,name)));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const context=await browser.newContext();const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
  const source={origin:'https://www.chatwork.com',roomId:'123',roomName:'归档测试群',account:{key:'tester|avatar',id:'1',name:'测试用户'}};
  let read=false;window.mockDownloads=0;
  window.chrome={storage:{local:{get:async()=>({}),set:async()=>{}}},i18n:{getUILanguage:()=> 'zh-CN',getMessage:k=>k},tabs:{sendMessage:async(id,m)=>{
   if(m.action==='context'||m.action==='start')return {value:source};
   if(m.action==='poll')return {value:{context:source,done:true,complete:true,total:2,missing:0,records:m.offset?[]:[{id:'1',time:Date.now()-10000,sender:'1',senderName:'测试用户',text:'Crashlytics 原文\n第二行',to:['2'],re:[],files:[{id:'10',name:'test.txt (5 B)'}]},{id:'2',time:Date.now()-10000,sender:'2',senderName:'另一个人',text:'第二条',to:[],re:[],files:[]}]}};
   if(m.action==='file-open'){read=false;window.mockDownloads++;return {value:{token:'t',type:'text/plain',length:5}};}
   if(m.action==='file-read'){if(read)return {value:{done:true}};read=true;return {value:{done:false,data:btoa('hello')}};}
   return {value:true};
  }}};
  FileSystemHandle.prototype.queryPermission=async()=> 'granted';FileSystemHandle.prototype.requestPermission=async()=> 'granted';
  window.showDirectoryPicker=()=>navigator.storage.getDirectory();
 });
 const url=`http://127.0.0.1:${server.address().port}/archive.html?tab=1`;await p.goto(url);await p.locator('#source').filter({hasText:'归档测试群'}).waitFor({state:'attached'});
 await p.evaluate(async()=>{await document.querySelector('#directory').onclick();await document.querySelector('#start').onclick();});await p.waitForTimeout(500);console.log('progress',await p.locator('#progress').textContent(),errors);await p.waitForFunction(()=>document.querySelector('#progress').textContent.includes('已保存: 1/1'));
 assert.equal(await p.locator('article').count(),2);assert.equal(await p.evaluate(()=>window.mockDownloads),1);
 await p.evaluate(async()=>{await document.querySelector('#directory').onclick();await document.querySelector('#start').onclick();});await p.waitForFunction(()=>document.querySelector('#progress').textContent.includes('已保存: 1/1'));
 assert.equal(await p.evaluate(()=>window.mockDownloads),1,'deduplicates saved files');
 await p.fill('#search','crashlytics');await p.click('#search-button');await p.waitForFunction(()=>document.querySelectorAll('article').length===1);
 assert.match(await p.locator('article pre').innerText(),/原文\n第二行/);
 await p.reload();await p.waitForFunction(()=>document.querySelectorAll('article').length===2);
 await p.click('#restore');await p.waitForFunction(()=>document.querySelector('#progress').textContent==='已保存: 2');
 assert.equal(await p.locator('article').count(),2);
 const backup=await p.evaluate(async()=>{const d=await navigator.storage.getDirectory();const rooms=await d.getDirectoryHandle('rooms');for await(const room of rooms.values()){const j=JSON.parse(await(await(await room.getFileHandle('messages.json')).getFile()).text());const files=await room.getDirectoryHandle('files');return {text:await(await(await files.getFileHandle('10_test.txt')).getFile()).text(),records:j.records.length};}});
 assert.deepEqual(backup,{text:'hello',records:2});
 await p.screenshot({path:path.join(dir,'tests/archive-preview.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: archive, attachment bytes, deduplication, keyword search, reload persistence, restore, backup, page errors');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
