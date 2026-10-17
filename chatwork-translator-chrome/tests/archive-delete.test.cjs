const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
async function fixture(records){
 const removed=[],deleted=[];let summary;
 const dir={removeEntry:async (name,options)=>removed.push([name,options.recursive])};
 const root={queryPermission:async()=> 'granted',getDirectoryHandle:async name=>{assert.equal(name,'rooms');return dir;}};
 const database=Promise.resolve({transaction:()=>{const tx={objectStore:()=>({delete:key=>deleted.push(key)})};queueMicrotask(()=>tx.oncomplete());return tx;}});
 const ctx={database,read:async(store,key)=>store==='rooms'?{key}:key==='directory'?root:null,list:async()=>records,ensureArchiveOwner:async()=>{},navigator:{locks:{request:async(n,o,cb)=>cb({})}},chrome:{i18n:{getMessage:k=>k},storage:{local:{get:async()=>({archiveRooms:[{key:'a'},{key:'b'}]}),set:async value=>summary=value.archiveRooms}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../archive-cleanup.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,''),ctx);
 return {ctx,removed,deleted,summary:()=>summary};
}
test('delete selected room directory including attachments and refresh summary',async()=>{
 const f=await fixture([]);await f.ctx.deleteEmptyRoom('a');
 assert.deepEqual(f.removed,[['a',true]]);assert.deepEqual(f.deleted,['a']);assert.equal(f.summary().length,1);assert.equal(f.summary()[0].key,'b');
});
test('reject deletion if messages appeared since opening manager',async()=>{
 const f=await fixture([{id:'1'}]);await assert.rejects(f.ctx.deleteEmptyRoom('a'),/archive_delete_not_empty/);assert.equal(f.removed.length,0);assert.equal(f.deleted.length,0);
});
