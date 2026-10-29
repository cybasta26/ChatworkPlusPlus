import {visitArchiveSources} from './archive-connections.js';
import {checkedArchiveDirectory} from './archive-permission.js';
import {ensureArchiveOwner} from './archive-owner.js';
import {write,read,list,setting,safeName,roomKey} from './archive-store.js';
import {t} from './archive-locale.js';
let root,tabId,cancelled=false,running=false;const workerMode=true;
const say=archiveStatus=>chrome.storage.local.set({archiveStatus});
async function rpc(action,args={}){const result=await chrome.tabs.sendMessage(tabId,{type:'cw-archive',action,...args});if(result?.error)throw Error(result.error);if(!result)throw Error(t('noSource'));return result.value;}
async function permission(){root=await checkedArchiveDirectory();}
async function subdir(...parts) {let dir=root;for(const part of parts)dir=await dir.getDirectoryHandle(part,{create:true});return dir;}
async function saveFile(dir,name,data) {const h=await dir.getFileHandle(name,{create:true}),w=await h.createWritable();try{await w.write(data);await w.close();}catch(e){await w.abort().catch(()=>{});throw e;}}
async function snapshot(room) {
  const dir=await subdir('rooms',room.key);
  const records=await list('messages','room',room.key);
  await saveFile(dir,'messages.json',JSON.stringify({format:'ChatworkPlusPlus',version:1,room,records},null,2));
  const status=(await chrome.storage.local.get('archiveRooms')).archiveRooms||[];
  const times=records.map(m=>m.time).filter(Number.isFinite);
  if(times.length){const item={key:room.key,roomId:room.roomId,origin:room.origin,account:room.account.key,min:Math.min(...times),max:Math.max(...times),count:records.length};await chrome.storage.local.set({archiveRooms:[...status.filter(r=>r.key!==room.key),item]});}
}
async function mergeRecords(room,records){
 const batch=[];
 const fingerprint=m=>JSON.stringify([m.time,m.sender,m.senderName,m.text,m.to,m.re,!!m.deleted,m.files.map(f=>[f.id,f.name]),m.replies]);
 for(let m of records){const key=room.key+':'+m.id,old=await read('messages',key);
  if(old&&!m.sender){m={...m,sender:old.sender,senderName:old.senderName};}
  if(old&&fingerprint(old)===fingerprint(m))continue;
  batch.push({...m,key,roomKey:room.key,files:m.files.map(f=>({...old?.files.find(x=>x.id===f.id),...f}))});
 }
 if(batch.length)await write('messages',batch);return batch;
}
async function download(room,records) {
  const files=new Map();for(const m of records)for(const f of m.files)if(!files.has(f.id))files.set(f.id,f);
  const dir=await subdir('rooms',room.key,'files');let done=0,failed=0;
  for(const f of files.values()) {
    if(cancelled)break;
    let token,w;
    try {
      if(f.saved){try{const saved=await(await dir.getFileHandle(f.path)).getFile();if(saved.size===f.bytes){done++;continue;}}catch{}f.saved=false;}
      if(workerMode)await chrome.storage.local.set({archiveProgress:{done:done+failed,total:files.size}});
      say(`${t('downloading')} ${done+failed+1}/${files.size}\n${f.name}`);
      const response=await rpc('file-open',{id:f.id,roomId:room.roomId,accountKey:room.account.key});token=response.token;
      const filename=`${f.id}_${safeName(f.name.replace(/\s*\([\d.,]+\s*[KMGT]?B\)\s*$/i,''))}`;
      const handle=await dir.getFileHandle(filename,{create:true});w=await handle.createWritable();let bytes=0;
      while(!cancelled){const chunk=await rpc('file-read',{token});if(chunk.done)break;const data=Uint8Array.from(atob(chunk.data),c=>c.charCodeAt(0));await w.write(data);bytes+=data.length;}
      if(cancelled)throw Error(t('paused'));
      if(response.length&&bytes!==response.length)throw Error(chrome.i18n.getMessage('archive_error_8'));
      await w.close();w=null;
      if((await handle.getFile()).size!==bytes)throw Error(chrome.i18n.getMessage('archive_error_9'));
      Object.assign(f,{saved:true,path:filename,bytes,mime:response.type,error:''});done++;
    }catch(e){f.saved=false;f.error=e.message;f.retryAfter=Date.now()+60000;failed++;if(w)await w.abort().catch(()=>{});}
    finally{if(token)await rpc('file-close',{token}).catch(()=>{});}
    for(const m of records){m.files=m.files.map(file=>file.id===f.id?{...f}:file);}
    await write('messages',records.filter(m=>m.files.some(file=>file.id===f.id)));
  }
  await snapshot(room);return {done,failed,total:files.size};
}

const sources=new Set();let timer;
chrome.tabs.onRemoved.addListener(id=>sources.delete(id));
async function flush(room,records){
 const old=await read('rooms',room.key);await write('rooms',[{...old,...room,pendingBackup:true}]);
 const changed=await mergeRecords(room,records);
 if(changed.length||old?.pendingBackup||!old)await snapshot(room);
 await write('rooms',[{...old,...room,pendingBackup:false}]);return changed;
}
async function autoStep(id){
 tabId=id;const data=await rpc('visible');if(!data.context.roomId)return;
 const key=await roomKey(data.context),room={...data.context,key,updatedAt:Date.now()};
 if(!data.records.length&&!await read('rooms',key))return;
 const changed=await flush(room,data.records);
 await rpc('ack-visible',{roomKey:data.context.origin+'|'+data.context.account.key+'|'+data.context.roomId,records:data.records.map(m=>({id:m.id,capturedAt:m.capturedAt}))});
 const current=await rpc('context');let failed=0;
 if(current.roomId===room.roomId&&current.account.key===room.account.key){
  const records=(await list('messages','room',key)).filter(m=>m.files.some(f=>!f.saved&&(!f.retryAfter||f.retryAfter<=Date.now())));
  if(records.length)failed=(await download(room,records)).failed;
 }
 await say(chrome.i18n.getMessage('archive_auto_active')+' · '+new Date().toLocaleTimeString()+' · '+t('saved')+': '+changed.length+(failed?' · '+t('failed')+': '+failed:''));
}
async function manualStep(job){
 tabId=job.tab;let last;
 try{last=await rpc('poll',{offset:job.count});}catch(e){
  // A refreshed page loses its in-memory scan. Restart the same range safely.
  if(/No scan/.test(e.message)){const c=await rpc('context');if(c.roomId!==job.room.roomId||c.account.key!==job.room.account.key)throw Error(t('sameRoom'));await rpc('start',{from:job.from,to:job.to});job.count=0;await setting('activeArchiveJob',job);return;}
  throw e;
 }
 if(last.context.roomId!==job.room.roomId||last.context.account.key!==job.room.account.key)throw Error(t('sameRoom'));
 await flush(job.room,last.records);job.count+=last.records.length;
 const reached=Math.max(job.from,Math.min(job.to,last.progressTime??job.to));
 const percent=last.complete&&job.count>=last.total?100:Math.min(99,Math.floor(100*(job.to-reached)/Math.max(1,job.to-job.from)));
 await chrome.storage.local.set({archiveProgress:{done:percent,total:100}});
 await say(`${t('scanning')}: ${new Date(reached).toLocaleDateString()} · ${t('messages')}: ${job.count}`);
 if(cancelled)return;
 if(last.done&&job.count>=last.total){
  await rpc('stop');job.room.complete=!!last.complete;await write('rooms',[job.room]);await snapshot(job.room);
  const records=(await list('messages','room',job.room.key)).filter(m=>m.time>=job.from&&m.time<=job.to);
  const result=await download(job.room,records);
  await setting('activeArchiveJob',null);await chrome.storage.local.set({archiveManualRunning:false,archiveProgress:null});
  await say(`${t(cancelled?'paused':job.room.complete?'complete':'partial')} · ${t('messages')}: ${records.length} · ${t('failed')}: ${result.failed}`);
 }else await setting('activeArchiveJob',job);
}
export async function tick(){
 if(running)return;running=true;cancelled=false;
 try{await navigator.locks.request('chatwork-archive-writer',{ifAvailable:true},async lock=>{
  if(!lock)return;const job=await read('settings','activeArchiveJob');const enabled=(await chrome.storage.local.get('archiveAuto')).archiveAuto;
  if(!job){await chrome.storage.local.set({archiveManualRunning:false});if(!enabled)return;}await permission();
  if(job)await manualStep(job);
  else await visitArchiveSources(sources,autoStep,e=>say(t('failed')+': '+e.message),()=>cancelled);
 });}catch(e){
 const job=await read('settings','activeArchiveJob');
 if(job){await chrome.tabs.sendMessage(job.tab,{type:'cw-archive',action:'stop'}).catch(()=>{});await setting('activeArchiveJob',null);}
 await chrome.storage.local.set({archiveManualRunning:false,archiveProgress:null});
 await say(t('failed')+': '+e.message);}finally{
 running=false;clearTimeout(timer);if(await read('settings','activeArchiveJob'))timer=setTimeout(tick,650);
 }
}
export async function control(action,id){
 if(id)sources.add(id);
 if(action==='stop'){
  cancelled=true;clearTimeout(timer);const job=await read('settings','activeArchiveJob');await setting('activeArchiveJob',null);
  const source=job?.tab||tabId;if(source)await chrome.tabs.sendMessage(source,{type:'cw-archive',action:'stop'}).catch(()=>{});
  await chrome.storage.local.set({archiveManualRunning:false,archiveProgress:null});await say(t('paused'));return;
 }
 if(action==='manual'){
  if(running||await read('settings','activeArchiveJob'))throw Error(t('busy'));
  running=true;cancelled=false;
  try{await permission();tabId=id;const days=Math.max(1,Math.min(90,Number((await chrome.storage.local.get('archiveDays')).archiveDays)||3));
   const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-(days-1));const from=date.getTime(),to=Date.now();
   await chrome.storage.local.set({archiveManualRunning:true,archiveProgress:{done:0,total:100}});
   const context=await rpc('start',{from,to});const room={...context,key:await roomKey(context),from,to,complete:false};
   await setting('activeArchiveJob',{tab:id,room,from,to,count:0});await chrome.storage.local.set({archiveManualRunning:true,archiveProgress:{done:0,total:100}});
  }catch(e){
   await rpc('stop').catch(()=>{});
   await setting('activeArchiveJob',null);
   await chrome.storage.local.set({archiveManualRunning:false,archiveProgress:null});
   throw e;
  }finally{running=false;}
 }
 void tick();
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='cw-archive-recover')void tick();});
chrome.alarms.create('cw-archive-recover',{periodInMinutes:0.5});
