const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('archive reuses translated room name; failed translation offers retry',async()=>{
 const d=new JSDOM('<select id="room"><option data-room-name="Original" data-translation="Translated">Original</option></select><button id="error"></button>',{runScripts:'outside-only'}),w=d.window;
 w.$=id=>w.document.getElementById(id);w.AutoSettings={keys:[],resolve:()=>({enabled:true,sourceLanguage:'ja',targetLanguage:'zh'})};w.chrome={storage:{local:{get:async()=>({})}},runtime:{sendMessage:async()=>{throw Error('model unavailable');}},i18n:{getMessage:()=> 'Retry'}};w.EdgeTranslation={configure(){},translate:async()=>{throw Error('model unavailable');}};
 const s=fs.readFileSync(path.join(__dirname,'../archive.js'),'utf8'),start=s.indexOf('async function translateRoomNames(){'),end=s.indexOf('chrome.storage.onChanged.addListener',start);
 w.eval("let roomNameRevision=0;const roomNameCache=new Map();const titleError=document.getElementById('error');"+s.slice(start,end));
 await w.translateRoomNames();assert.equal(w.$('room').options[0].textContent,'Original（Translated）');
 delete w.$('room').options[0].dataset.translation;w.$('room').options[0].dataset.roomName='Other';await w.translateRoomNames();assert.equal(w.$('error').hidden,false);assert.match(w.$('error').textContent,/model unavailable/);d.window.close();
});
