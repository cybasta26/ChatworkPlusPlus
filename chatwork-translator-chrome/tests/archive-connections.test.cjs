const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../archive-connections.js'),'utf8')).toString('base64'));
test('stale tab cannot overwrite healthy source status; refreshed source can register again',async()=>{
 const {visitArchiveSources}=await load(),sources=new Set([1,2]),errors=[],visited=[];
 await visitArchiveSources(sources,async id=>{visited.push(id);if(id===1)throw Error('Could not establish connection. Receiving end does not exist.');},e=>errors.push(e));
 assert.deepEqual([...sources],[2]);assert.deepEqual(visited,[1,2]);assert.equal(errors.length,0);
 sources.add(1);await visitArchiveSources(sources,async()=>{},e=>errors.push(e));assert.equal(sources.size,2);
});
test('real archive failures remain visible and stop cancels iteration',async()=>{
 const {visitArchiveSources}=await load(),sources=new Set([1,2]),errors=[];
 await visitArchiveSources(sources,async()=>{throw Error('disk full');},e=>errors.push(e));assert.equal(errors.length,2);assert.equal(sources.size,2);
 await visitArchiveSources(sources,()=>assert.fail(),()=>assert.fail(),()=>true);
});
