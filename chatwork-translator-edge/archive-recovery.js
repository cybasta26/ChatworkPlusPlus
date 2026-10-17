import {database,roomKey,read} from './archive-store.js';
import {takeArchiveOwnership} from './archive-owner.js';
export async function recoverArchive(root){
 return navigator.locks.request('chatwork-archive-writer',{ifAvailable:true},async lock=>{
  if(!lock||await read('settings','activeArchiveJob'))throw Error(chrome.i18n.getMessage('archive_error_2'));
  const batches=[],summaries=[];
  const rooms=await root.getDirectoryHandle('rooms');
  for await(const entry of rooms.values()){
   if(entry.kind!=='directory')continue;
   const file=await(await entry.getFileHandle('messages.json')).getFile();
   if(file.size>100*1024*1024)throw Error(chrome.i18n.getMessage('archive_error_16')+entry.name);
   const data=JSON.parse(await file.text());
   if(data.format!=='ChatworkPlusPlus'||data.version!==1||!data.room||data.room.key!==entry.name||data.room.key!==await roomKey(data.room)||!Array.isArray(data.records))throw Error(chrome.i18n.getMessage('archive_error_14')+entry.name);
   const ids=new Set();
   for(const m of data.records){
    if(!/^\d+$/.test(m.id)||ids.has(m.id)||m.roomKey!==data.room.key||m.key!==m.roomKey+':'+m.id||typeof m.text!=='string'||!Number.isFinite(m.time)||!Array.isArray(m.files)||!Array.isArray(m.to)||!Array.isArray(m.re))throw Error(chrome.i18n.getMessage('archive_error_15')+entry.name);
    ids.add(m.id);
    for(const f of m.files)if(f.path&&(typeof f.path!=='string'||f.path.length>160||/[<>:"\\/|?*\x00-\x1f]/.test(f.path)||f.path==='.'||f.path==='..'))throw Error(chrome.i18n.getMessage('archive_error_4'));
   }
   batches.push(data);
   if(data.records.length){const times=data.records.map(m=>m.time);summaries.push({key:data.room.key,roomId:data.room.roomId,origin:data.room.origin,account:data.room.account.key,min:times.reduce((a,b)=>Math.min(a,b)),max:times.reduce((a,b)=>Math.max(a,b)),count:data.records.length});}
  }
  if(!batches.length)throw Error(chrome.i18n.getMessage('archive_error_5'));
  await takeArchiveOwnership(root);
  const db=await database;
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(['rooms','messages','settings'],'readwrite');
   for(const data of batches){
    tx.objectStore('rooms').put(data.room);
    for(const record of data.records)tx.objectStore('messages').put(record);
   }
   tx.objectStore('settings').put(root,'directory');
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error(chrome.i18n.getMessage('archive_error_6')));
  });
  const previous=(await chrome.storage.local.get('archiveRooms')).archiveRooms||[];
  const keys=new Set(batches.map(d=>d.room.key));
  await chrome.storage.local.set({archiveDirectory:root.name,archiveAuto:true,archiveRooms:[...previous.filter(r=>!keys.has(r.key)),...summaries]});
  return batches.reduce((sum,data)=>sum+data.records.length,0);
 });
}
