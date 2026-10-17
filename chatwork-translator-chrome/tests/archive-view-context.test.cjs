const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('embedded archive resolves context using its actual host tab; rejects website callers',async()=>{
 const listeners=[],calls=[];
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listeners.push(f)}},tabs:{sendMessage:async(id,m)=>{calls.push([id,m]);return {value:{roomNames:{1:'Original'}}};}},i18n:{getMessage:k=>k}};
 const code=fs.readFileSync(path.join(__dirname,'../archive-background.js'),'utf8').replace(/^import .*;$/gm,'');
 vm.runInNewContext(code,{chrome});
 const handler=listeners.at(-1);
 const result=await new Promise(resolve=>assert.equal(handler({type:'cw-archive-view-context'},{id:'test',tab:{id:42},url:'chrome-extension://test/archive.html?embed=1'},resolve),true));
 assert.equal(result.value.roomNames[1],'Original');assert.equal(calls[0][0],42);assert.equal(calls[0][1].action,'context');
 assert.equal(handler({type:'cw-archive-view-context'},{id:'test',tab:{id:42},url:'https://www.chatwork.com/'},()=>assert.fail()),undefined);
 assert.equal(calls.length,1);
});
