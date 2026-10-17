import {database,read,list} from './archive-store.js';
import {ensureArchiveOwner} from './archive-owner.js';
export async function cleanBefore(cutoff,roomKey=null){
 if(!Number.isFinite(cutoff))throw Error(chrome.i18n.getMessage('archive_error_0'));
 return navigator.locks.request('chatwork-archive-writer',{ifAvailable:true},async lock=>{
  if(!lock||await read('settings','activeArchiveJob'))throw Error(chrome.i18n.getMessage('archive_error_1'));
  const root=await read('settings','directory');
  if(!root||await root.queryPermission({mode:'readwrite'})!=='granted')throw Error(chrome.i18n.getMessage('archive_authorize'));
  await ensureArchiveOwner(root);
  let count=0;
  for(const room of await list('rooms')){
   if(roomKey!==null&&room.key!==roomKey)continue;
   const records=await list('messages','room',room.key);
   const removed=records.filter(m=>Number.isFinite(m.time)&&m.time<cutoff);
   if(!removed.length)continue;
   const kept=records.filter(m=>!Number.isFinite(m.time)||m.time>=cutoff);
   const updated={...room,complete:false};
   const dir=await(await root.getDirectoryHandle('rooms',{create:true})).getDirectoryHandle(room.key,{create:true});
   const handle=await dir.getFileHandle('messages.json',{create:true}),writer=await handle.createWritable();
   try{await writer.write(JSON.stringify({format:'ChatworkPlusPlus',version:1,room:updated,records:kept},null,2));await writer.close();}
   catch(e){await writer.abort().catch(()=>{});throw e;}
   const db=await database;
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(['messages','rooms'],'readwrite');
    for(const m of removed)tx.objectStore('messages').delete(m.key);
    tx.objectStore('rooms').put(updated);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error(chrome.i18n.getMessage('archive_error_3')));
   });
   count+=removed.length;
   const summaries=(await chrome.storage.local.get('archiveRooms')).archiveRooms||[];
   const times=kept.map(m=>m.time).filter(Number.isFinite);
   const next=summaries.filter(r=>r.key!==room.key);
   if(times.length)next.push({key:room.key,roomId:room.roomId,origin:room.origin,account:room.account.key,min:times.reduce((a,b)=>Math.min(a,b)),max:times.reduce((a,b)=>Math.max(a,b)),count:kept.length});
   await chrome.storage.local.set({archiveRooms:next});
  }
  return count;
 });
}


export async function deleteEmptyRoom(key){
 return navigator.locks.request('chatwork-archive-writer',{ifAvailable:true},async lock=>{
  if(!lock||await read('settings','activeArchiveJob'))throw Error(chrome.i18n.getMessage('archive_error_1'));
  if((await list('messages','room',key)).length)throw Error(chrome.i18n.getMessage('archive_delete_not_empty'));
  if(!await read('rooms',key))return;
  const root=await read('settings','directory');
  if(!root||await root.queryPermission({mode:'readwrite'})!=='granted')throw Error(chrome.i18n.getMessage('archive_authorize'));
  await ensureArchiveOwner(root);
  // Delete only the selected room directory, including its archived attachments.
  try{
   const rooms=await root.getDirectoryHandle('rooms');
   await rooms.removeEntry(key,{recursive:true});
  }catch(e){if(e.name!=='NotFoundError')throw e;}
  const db=await database;
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('rooms','readwrite');tx.objectStore('rooms').delete(key);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error(chrome.i18n.getMessage('archive_error_3')));
  });
  const summaries=(await chrome.storage.local.get('archiveRooms')).archiveRooms||[];
  await chrome.storage.local.set({archiveRooms:summaries.filter(room=>room.key!==key)});
 });
}
