import {parseMessageLink} from './archive-link.mjs';
import {recoverArchive} from './archive-recovery.js';
import {archiveBytes,formatBytes} from './archive-size.js';
import {cleanBefore,deleteEmptyRoom} from './archive-cleanup.js';
import {ensureArchiveOwner} from './archive-owner.js';
import './i18n.js';
import './auto-settings.js';
import './protected-text.js';
import './local-translator.js';
import './mentions-core.js';
import {fileKind,confirmSave,previewFile} from './archive-preview.js';
import {matches,ranges} from './archive-filter.mjs';
import {write,read,list,setting,safeName,roomKey} from './archive-store.js';
import {t} from './archive-locale.js';
// Load settings before rendering buttons so model creation stays in the click gesture.
let archiveTranslationSettings = await AutoSettings.read();
chrome.storage.onChanged.addListener((changes, area) => {
 if(area !== 'local')return;
 const next = {...archiveTranslationSettings};
 for(const key of AutoSettings.keys)if(changes[key])next[key]=changes[key].newValue;
 archiveTranslationSettings=AutoSettings.resolve(next);
});
const $=id=>document.getElementById(id);
document.querySelectorAll('[data-t-aria]').forEach(e=>e.setAttribute('aria-label',t(e.dataset.tAria)));
document.querySelectorAll('[data-t]').forEach(e=>e.textContent=t(e.dataset.t));
document.querySelectorAll('[data-placeholder]').forEach(e=>e.placeholder=t(e.dataset.placeholder));
let tabId=Number(new URLSearchParams(location.search).get('tab')),source,root,busy=false,cancelled=false,offset=0,shown=[],urls=[];
const embedded=new URLSearchParams(location.search).has('embed');
if(embedded)document.body.classList.add('embedded');
const workerMode=new URLSearchParams(location.search).has('worker');
const say=text=>{$('progress').textContent=text;$('archive-status').textContent=text;const directoryStatus=$('archive-directory-status');if(directoryStatus){directoryStatus.textContent=text;directoryStatus.hidden=!text;}if(workerMode)chrome.storage.local.set({archiveStatus:text});};
const dateInput=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const now=new Date();$('until').value=dateInput(now);now.setDate(now.getDate()-2);$('from').value=dateInput(now);
async function rpc(action,args={}) {
  if(!tabId && embedded && action==='context'){
    const result=await chrome.runtime.sendMessage({type:'cw-archive-view-context'});
    if(result?.error)throw Error(result.error);
    if(!result?.value)throw Error(t('noSource'));
    return result.value;
  }
  if(!tabId)throw Error(t('noSource'));
  const result=await chrome.tabs.sendMessage(tabId,{type:'cw-archive',action,...args});
  if(result?.error)throw Error(result.error);if(!result)throw Error(t('noSource'));return result.value;
}
let recoveryDirectory;
async function directory() {
  const status=$('archive-directory-status');if(status){status.textContent='';status.hidden=true;}
  const selected=await showDirectoryPicker({mode:'readwrite',id:'chatwork-archive'});
  recoveryDirectory=selected;
  try{await ensureArchiveOwner(selected);}catch(e){if(e.code==='ARCHIVE_OTHER_OWNER')$('archive-recover-directory').hidden=false;throw e;}root=selected;
  await setting('directory',root);$('directory-name').textContent=root.name;await chrome.storage.local.set({archiveDirectory:root.name,archiveAuto:true});
}
async function permission() {
  root=await read('settings','directory')||root;if(!root)throw Error(chrome.i18n.getMessage('archive_authorize'));
  if(await root.queryPermission({mode:'readwrite'})!=='granted'&&await root.requestPermission({mode:'readwrite'})!=='granted')throw Error(t('permission'));
  await ensureArchiveOwner(root);
}
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
let roomNameRevision=0;
const roomNameCache=new Map();
const titleError=document.createElement('button');titleError.hidden=true;titleError.style.fontSize='12px';$('room').after(titleError);
titleError.onclick=async()=>{
 titleError.disabled=true;
 try{EdgeTranslation.configure(archiveTranslationSettings.sourceLanguage,archiveTranslationSettings.targetLanguage);await EdgeTranslation.initialize();await translateRoomNames();}
 catch(e){titleError.hidden=false;titleError.textContent=chrome.i18n.getMessage('ui_001')+': '+e.message;}
 finally{titleError.disabled=false;}
};

async function translateRoomNames(){
 const revision=++roomNameRevision;titleError.hidden=true;
 const options=[...$('room').options];
 for(const option of options)option.textContent=option.dataset.roomName;
 const saved=await chrome.storage.local.get([...AutoSettings.keys,'roomTitleTranslationEnabled']);
 const settings=AutoSettings.resolve(saved);
 if(revision!==roomNameRevision||!settings.enabled||saved.roomTitleTranslationEnabled===false)return;
 const translate=async text=>{EdgeTranslation.configure(settings.sourceLanguage,settings.targetLanguage);return EdgeTranslation.translate(text);};
 // Prioritize the selected room, then label the other available rooms.
 options.sort((a,b)=>Number(b.selected)-Number(a.selected));
 for(const option of options){
  if(revision!==roomNameRevision)return;
  const original=option.dataset.roomName;
  const key=JSON.stringify([settings.sourceLanguage,settings.targetLanguage,original]);
  try{
   let text=roomNameCache.get(key)||option.dataset.translation;
   if(text===undefined){
    const result=await translate(original);
    if(result?.error)throw Error(result.error);
    text=result?.skipped?'':(result?.text||'').trim();
    if(text)roomNameCache.set(key,text);
   }
   if(revision!==roomNameRevision)return;
   if(option.isConnected&&text&&text!==original)option.textContent=original+'（'+text+'）';
  }catch(e){if(revision===roomNameRevision){titleError.hidden=false;titleError.textContent=chrome.i18n.getMessage('ui_001')+': '+e.message;}}
 }
}
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==='local'&&[...AutoSettings.keys,'roomTitleTranslationEnabled'].some(key=>changes[key])){for(const option of $('room').options)delete option.dataset.translation;void translateRoomNames();}
});

async function openManagement(){
 const dialog=document.createElement('dialog');dialog.className='archive-file-dialog archive-management';
 const heading=document.createElement('h2');heading.textContent=t('manage');
 const close=document.createElement('button');close.className='archive-management-close';close.textContent='×';close.setAttribute('aria-label',t('closePreview'));close.onclick=()=>dialog.close();
 const status=document.createElement('p');status.setAttribute('role','status');
 const rows=document.createElement('div');
 const size=document.createElement('span');size.className='archive-management-size';size.setAttribute('role','status');
 heading.append(size);
 let sizeRevision=0;
 async function refreshSize(){
  const current=++sizeRevision;
  size.textContent=t('archiveSize')+': '+t('sizeCalculating');size.removeAttribute('title');
  try{
   const bytes=await archiveBytes(()=>dialog.isConnected&&current===sizeRevision);
   if(dialog.isConnected&&current===sizeRevision)size.textContent=t('archiveSize')+': '+formatBytes(bytes);
  }catch(e){
   if(dialog.isConnected&&current===sizeRevision){size.textContent=t('archiveSize')+': '+t('sizeUnavailable');size.title=e.message;}
  }
 }
 let cleaning=false,revision=0;
 const roomLabel=key=>[...$('room').options].find(o=>o.value===key)?.textContent;
 function addRow(room,range,empty=false){
  const row=document.createElement('div');row.className='archive-management-row';if(room)row.dataset.roomKey=room.key;
  const label=document.createElement('span');label.className='archive-management-name';label.textContent=room?(roomLabel(room.key)||room.roomName):t('allRooms');
  const dates=document.createElement('span');dates.className='archive-management-range';dates.textContent=range||'';
  const date=document.createElement('input');date.type='date';date.required=true;date.setAttribute('aria-label',label.textContent+' · '+t('until'));
  const clean=document.createElement('button');clean.textContent=empty?chrome.i18n.getMessage('archive_delete_room'):t('clean');
  if(empty){date.disabled=true;date.style.visibility='hidden';}
  clean.onclick=()=>{
   if(cleaning||(!empty&&!date.reportValidity()))return;
   const selected=date.value,cutoff=new Date(selected+'T00:00:00').getTime();
   const confirm=document.createElement('dialog');confirm.className='archive-file-dialog';
   const prompt=document.createElement('p');prompt.textContent=(empty?chrome.i18n.getMessage('archive_delete_confirm'):t(room?'cleanRoomConfirm':'cleanConfirm')).replace('{date}',selected).replace('{room}',room?(roomLabel(room.key)||room.roomName):'');
   const cancel=document.createElement('button');cancel.textContent=t('cancelClean');cancel.onclick=()=>confirm.close();
   const yes=document.createElement('button');yes.textContent=empty?chrome.i18n.getMessage('archive_delete_room'):t('confirmClean');
   yes.onclick=async()=>{
    confirm.close();cleaning=true;dialog.querySelectorAll('button,input').forEach(e=>e.disabled=true);
    try{if(empty){await deleteEmptyRoom(room.key);status.textContent=chrome.i18n.getMessage('archive_delete_done');}else status.textContent=t('cleanDone')+await cleanBefore(cutoff,room?.key??null);}
    catch(e){status.textContent=t('failed')+': '+e.message;}
    finally{await loadRooms().catch(()=>{});cleaning=false;close.disabled=false;void refreshSize();await refresh();}
   };
   confirm.append(prompt,cancel,yes);confirm.addEventListener('close',()=>confirm.remove(),{once:true});document.body.append(confirm);confirm.showModal();cancel.focus();
  };
  if(!room){row.classList.add('archive-management-all');label.textContent=t('cleanAllRooms');}
  row.append(label,dates,date,clean);rows.append(row);
 }
 async function refresh(){
  const current=++revision,rooms=await list('rooms');
  const entries=await Promise.all(rooms.map(async room=>{
   const records=await list('messages','room',room.key),times=records.map(m=>m.time).filter(Number.isFinite);
   const range=times.length?new Date(times.reduce((a,b)=>Math.min(a,b))).toLocaleDateString()+' – '+new Date(times.reduce((a,b)=>Math.max(a,b))).toLocaleDateString()+' ('+t('messages')+': '+records.length+')':chrome.i18n.getMessage('archive_empty');
   return {room,range,empty:records.length===0};
  }));
  if(!dialog.isConnected||current!==revision)return;
  rows.replaceChildren();addRow(null,'');for(const {room,range,empty}of entries)addRow(room,range,empty);
 }
 // Keep translated names synchronized with the main room selector.
 const observer=new MutationObserver(()=>{
  if(cleaning)return;
  for(const row of rows.children){
   const key=row.dataset.roomKey;
   if(key)row.querySelector('.archive-management-name').textContent=roomLabel(key)||row.querySelector('.archive-management-name').textContent;
  }
 });
 observer.observe($('room'),{subtree:true,childList:true,characterData:true});
 dialog.addEventListener('cancel',e=>{if(cleaning)e.preventDefault();});
 dialog.addEventListener('close',()=>{revision++;observer.disconnect();dialog.remove();},{once:true});
 dialog.append(heading,close,rows,status);document.body.append(dialog);dialog.showModal();
 void refreshSize();
 try{await refresh();}catch(e){status.textContent=t('failed')+': '+e.message;}
}
const manage=document.createElement('button');manage.id='archive-manage';manage.textContent=t('manage');manage.onclick=openManagement;$('room').after(manage);
async function loadRooms(selected) {
  const rooms=await list('rooms');const old=selected||$('room').value||new URLSearchParams(location.search).get('room');$('room').replaceChildren();
  for(const room of rooms){const option=document.createElement('option');option.value=room.key;const name=source&&source.origin===room.origin&&source.account?.key===room.account?.key ? source.roomNames?.[room.roomId]||room.roomName : room.roomName;option.dataset.roomName=name;if(source&&source.origin===room.origin&&source.account?.key===room.account?.key)option.dataset.translation=source.roomTranslations?.[room.roomId]||'';option.textContent=name;$('room').append(option);}
  if(rooms.some(r=>r.key===old))$('room').value=old;
  void translateRoomNames();
  await search();
}
let relatedGroups=new Map(),roomRecords=[],archiveThread;
let memberRoom='',searchGeneration=0,activeFilter={keyword:''};
async function search() {
 const generation=++searchGeneration;
 const room=$('room').value||'',records=await list('messages','room',room);
 if(generation!==searchGeneration)return;
 roomRecords=records;relatedGroups=ChatworkMentions.related(records.map(m=>({...m,replies:m.replies||[]})));
 if(memberRoom!==room||!$('sender').options.length){
  memberRoom=room;
  const names=new Map(),senders=new Set(),recipients=new Set();
  for(const m of records){
   if(m.sender){
    const id=String(m.sender),name=(m.senderName||'').trim();
    senders.add(id);
    if(name&&name!==id)names.set(id,name);
   }
   for(const id of [...m.to,...m.re])recipients.add(String(id));
  }
  for(const key of ['sender','recipient']){
   const select=$(key),ids=key==='sender'?senders:recipients;
   const entries=[...ids].map(id=>[id,names.get(id)||id]);
   entries.sort((a,b)=>Number(!names.has(a[0]))-Number(!names.has(b[0]))||a[1].localeCompare(b[1],undefined,{numeric:true}));
   select.replaceChildren(new Option(t('none'),''));
   for(const [id,name]of entries)select.add(new Option(name,id));
  }
 }
 urls.forEach(URL.revokeObjectURL);urls=[];
 activeFilter={sender:$('sender').value,recipient:$('recipient').value,both:$('both').checked,keyword:$('search').value.trim(),matchCase:$('match-case').checked,whole:$('whole-word').checked};
 shown=records.filter(m=>matches(m,activeFilter)).sort((a,b)=>a.time-b.time);
  offset=0;$('messages').replaceChildren();const times=records.map(m=>m.time).filter(Number.isFinite);
 const archived=document.createElement('span'),matched=document.createElement('span');
 let earliest=Infinity,latest=-Infinity;for(const time of times){earliest=Math.min(earliest,time);latest=Math.max(latest,time);}
 archived.textContent=times.length
  ? chrome.i18n.getMessage('archive_range')+': '+new Date(earliest).toLocaleDateString()+' – '+new Date(latest).toLocaleDateString()+' ('+t('messages')+': '+records.length+')'
  : chrome.i18n.getMessage('archive_empty');
 matched.textContent=t('messages')+': '+shown.length;
 $('summary').replaceChildren(archived);renderMore();if(embedded)$('messages').scrollTop=$('messages').scrollHeight;
}
function renderMore() {
  const container=$('messages'),height=container.scrollHeight,top=container.scrollTop;
  const fragment=document.createDocumentFragment();
  const batch=embedded?shown.slice(Math.max(0,shown.length-offset-50),shown.length-offset):shown.slice(offset,offset+50);
  for(const m of batch){
    fragment.append(createArticle(m));
  }
  if(embedded){container.prepend(fragment);container.scrollTop=top+container.scrollHeight-height;}else container.append(fragment);
  offset+=50;$('more').hidden=embedded||offset>=shown.length;
}
function createArticle(m){
    const article=document.createElement('article'),header=document.createElement('header'),pre=document.createElement('pre');
    article.dataset.messageId=m.id;
    const author=document.createElement('span');author.textContent=`${m.senderName||m.sender} · ${new Date(m.time).toLocaleString()}`;header.append(author);
    const translate=document.createElement('button');translate.className='archive-translate';translate.textContent=t('translateMessage');header.append(translate);
    const translation=document.createElement('pre');translation.className='archive-translation';translation.hidden=true;
    translate.onclick=async()=>{
     translate.disabled=true;translate.textContent=t('translatingMessage');translation.hidden=false;translation.textContent=t('translatingMessage');
     try{
      const result=await translateArchived(m.text);
      if(result?.error)throw Error(result.error);
      translation.textContent=result?.skipped?m.text:result?.text||'';
      if(!translation.textContent)throw Error(t('failed'));
     }catch(e){translation.textContent=t('failed')+': '+e.message;}
     finally{translate.disabled=false;translate.textContent=t('translateMessage');}
    };

    const text=m.deleted?t('deleted'):m.text;let end=0;for(const [a,b]of ranges(text,activeFilter.keyword,activeFilter.matchCase,activeFilter.whole)){pre.append(document.createTextNode(text.slice(end,a)));const mark=document.createElement('mark');mark.textContent=text.slice(a,b);pre.append(mark);end=b;}pre.append(document.createTextNode(text.slice(end)));article.append(header,relationTools(m),pre,translation);
    if(m.to.length||m.re.length){const small=document.createElement('small');small.textContent=`TO: ${m.to.join(', ')} · RE: ${m.re.join(', ')}`;article.append(small);}
    for(const f of m.files){const row=document.createElement('div');row.className='attachment';const text=document.createElement('span');text.textContent=`${f.name} · ${t(f.saved?'saved':f.error?'failed':'pending')}${f.error?' — '+f.error:''}`;row.append(text);
      if(f.saved){const button=document.createElement('button'),kind=fileKind(f);button.textContent=t(kind==='download'?'saveAs':'preview');button.onclick=async()=>{try{
        if(kind==='download'&&!await confirmSave(f.name,t))return;
        await permission();const dir=await root.getDirectoryHandle('rooms');const rd=await dir.getDirectoryHandle(m.roomKey);const fd=await rd.getDirectoryHandle('files');const file=await(await fd.getFileHandle(f.path)).getFile();
        if(kind!=='download')await previewFile(file,f,kind,t);
        else{const url=URL.createObjectURL(file);urls.push(url);const a=document.createElement('a');a.href=url;a.download=f.path;a.click();}
      }catch(e){say(e.message);}};row.append(button);}article.append(row);}
 return article;
}
function relationTools(m){
 const bar=document.createElement('div');bar.className='archive-related';
 const group=relatedGroups.get(m.id)||[],index=group.findIndex(x=>x.id===m.id),label=document.createElement('span');
 label.textContent=group.length>1?`${t('related')} ${index+1}/${group.length}`:t(m.replies?'noReplies':'unknownReplies');bar.append(label);
 if(group.length<=1)return bar;
 const button=(text,title,fn)=>{const b=document.createElement('button');b.textContent=text;b.title=title;b.onclick=fn;bar.append(b);return b;};
 button('↑',t('previousRelated'),()=>jumpRelated(group[index-1])).disabled=index<=0;
 button('Thread','Thread',()=>openArchiveThread(m.id));
 button('↓',t('nextRelated'),()=>jumpRelated(group[index+1])).disabled=index>=group.length-1;
 return bar;
}
async function jumpRelated(target){
 if(!target)return;if(target.missing){say(t('missingRelated'));return;}
 archiveThread?.close();
 if(!shown.some(m=>m.id===target.id)){
  $('sender').value='';$('recipient').value='';$('both').checked=false;$('search').value='';await search();
 }
 while(![...$('messages').children].some(e=>e.dataset.messageId===target.id)&&offset<shown.length)renderMore();
 const card=[...$('messages').children].find(e=>e.dataset.messageId===target.id);
 card?.scrollIntoView({block:'center',behavior:'smooth'});if(card){card.classList.add('archive-target');setTimeout(()=>card.classList.remove('archive-target'),1800);}
}
function openArchiveThread(id){
 archiveThread?.close();const dialog=document.createElement('dialog');archiveThread=dialog;dialog.className='archive-file-dialog archive-thread-dialog';
 const group=relatedGroups.get(id)||[],header=document.createElement('div');header.className='preview-header';
 const title=document.createElement('strong');title.textContent=`Thread · ${group.length} ${t('messages')}`;
 const close=document.createElement('button');close.textContent=t('closePreview');close.onclick=()=>dialog.close();header.append(title,close);dialog.append(header);
 const list=document.createElement('div');list.className='archive-thread-list';
 for(const m of group){if(m.missing){const missing=document.createElement('p');missing.textContent=t('missingRelated')+' · '+m.id;list.append(missing);}else list.append(createArticle(m));}
 dialog.append(list);dialog.addEventListener('close',()=>{dialog.remove();if(archiveThread===dialog)archiveThread=null;},{once:true});document.body.append(dialog);dialog.showModal();
 const anchor=[...list.children].find(e=>e.dataset.messageId===id);anchor?.scrollIntoView({block:'center'});
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
async function exclusive(work) {
  if(busy)return;
  // Directory permission must be requested directly from this click gesture.
  try{await permission();}catch(e){if(e.name!=='AbortError')say(e.message);return;}
  await navigator.locks.request('chatwork-archive-writer',{ifAvailable:true},async lock=>{
    if(!lock){say(t('busy'));return;}
    busy=true;cancelled=false;for(const id of ['start','retry','directory','restore','backup'])$(id).disabled=true;$('stop').disabled=false;
    try{await work();}catch(e){say(`${t('failed')}: ${e.message}`);}finally{busy=false;for(const id of ['start','retry','directory','restore','backup'])$(id).disabled=false;$('stop').disabled=true;await loadRooms().catch(()=>{});}
  });
}
const manualUpdate=()=>exclusive(async()=>{
  const from=new Date($('from').value+'T00:00:00').getTime(),end=new Date($('until').value+'T00:00:00');end.setDate(end.getDate()+1);const to=Math.min(Date.now(),end.getTime()-1);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)throw Error(t('dates'));
  source=await rpc('start',{from,to});const key=await roomKey(source);
  const room={...source,key,from,to,complete:false,updatedAt:Date.now()};await write('rooms',[room]);
  let count=0,finished=false,last;
  try{
    while(!finished){
      last=await rpc('poll',{offset:count});
      if(last.context.roomId!==room.roomId||last.context.account.key!==room.account.key)throw Error(chrome.i18n.getMessage('archive_error_10'));
      await mergeRecords(room,last.records);count+=last.records.length;
      const reached=Math.max(from,Math.min(to,Number.isFinite(last.progressTime)?last.progressTime:to));
      const percent=last.complete&&count>=last.total?100:Math.min(99,Math.floor(100*(to-reached)/Math.max(1,to-from)));
      if(workerMode)await chrome.storage.local.set({archiveProgress:{done:percent,total:100}});
      say(`${t('scanning')}: ${new Date(reached).toLocaleDateString()} · ${t('messages')}: ${count} · ${t('missing')}: ${last.missing}`);
      finished=last.done&&count>=last.total;
      if(cancelled){await rpc('stop');break;}
      if(!finished)await new Promise(r=>setTimeout(r,600));
    }
  }finally{await rpc('stop').catch(()=>{});room.complete=Boolean(last?.complete)&&!cancelled;room.error=last?.error||'';await write('rooms',[room]);await snapshot(room);}
  const records=(await list('messages','room',key)).filter(m=>m.time>=from&&m.time<=to);
  let result;if($('files').checked&&!cancelled)result=await download(room,records);
  await loadRooms(key);
  say(`${t(cancelled?'paused':room.complete?'complete':'partial')} · ${t('messages')}: ${records.length}${result?`\n${t('saved')}: ${result.done}/${result.total} · ${t('failed')}: ${result.failed}`:''}`);
});
$('retry').onclick=()=>exclusive(async()=>{
  const room=await read('rooms',$('room').value);if(!room)throw Error(t('empty'));
  const c=await rpc('context');if(await roomKey(c)!==room.key)throw Error(t('sameRoom'));
  const result=await download(room,await list('messages','room',room.key));say(`${t('saved')}: ${result.done}/${result.total} · ${t('failed')}: ${result.failed}`);
});
$('stop').onclick=()=>command('stop').catch(e=>say(e.message));
$('directory').onclick=()=>directory().catch(e=>{if(e.name!=='AbortError')say(e.message);});
$('backup').onclick=()=>exclusive(async()=>{const room=await read('rooms',$('room').value);if(!room)throw Error(t('empty'));await snapshot(room);say(t('saved'));});
$('restore').onclick=()=>exclusive(async()=>{
  const rooms=await root.getDirectoryHandle('rooms');let count=0;
  for await(const entry of rooms.values()){
    if(entry.kind!=='directory')continue;
    const file=await(await entry.getFileHandle('messages.json')).getFile();if(file.size>100*1024*1024)throw Error(chrome.i18n.getMessage('archive_error_11'));
    const data=JSON.parse(await file.text());
    if(data.format!=='ChatworkPlusPlus'||data.version!==1||!Array.isArray(data.records)||data.room.key!==await roomKey(data.room))throw Error(chrome.i18n.getMessage('archive_error_12'));
    for(const m of data.records){if(m.roomKey!==data.room.key||m.key!==m.roomKey+':'+m.id||typeof m.text!=='string'||!Number.isFinite(m.time)||!Array.isArray(m.files)||!Array.isArray(m.to)||!Array.isArray(m.re))throw Error(chrome.i18n.getMessage('archive_error_13'));for(const f of m.files)if(f.path&&(typeof f.path!=='string'||f.path.length>160||/[<>:\"\\/|?*\x00-\x1f]/.test(f.path)||f.path==='.'||f.path==='..'))throw Error(chrome.i18n.getMessage('archive_error_4'));}
    await write('rooms',[data.room]);await write('messages',data.records);count+=data.records.length;
  }
  say(`${t('saved')}: ${count}`);
});
for(const id of ['sender','recipient','both'])$(id).onchange=search;
$('room').onchange=search;$('search-button').onclick=search;$('search').onkeydown=e=>{if(e.key==='Enter')search();};$('more').onclick=renderMore;
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
root=await read('settings','directory');if(root)$('directory-name').textContent=root.name;
try{source=await rpc('context');$('source').textContent=`${source.roomName} · ${source.account.name}`;}catch{$('source').textContent=t('noSource');}
await loadRooms();

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
$('start').onclick=manualUpdate;
const sources=new Set(tabId?[tabId]:[]);
let pendingManual;let wakeAuto=()=>{};
function returnToChat(){
 let url='https://www.chatwork.com/';
 try{const candidate=new URL(new URLSearchParams(location.search).get('returnTo'));if(candidate.protocol==='https:'&&(candidate.hostname==='chatwork.com'||candidate.hostname==='www.chatwork.com'))url=candidate.href;}catch{}
 location.replace(url);
}
function showDirectoryDialog(){
 let dialog=document.getElementById('archive-directory-dialog');
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='archive-directory-dialog';dialog.addEventListener('cancel',e=>{if(new URLSearchParams(location.search).has('setup')){e.preventDefault();returnToChat();}});
  const title=document.createElement('h2');title.textContent=chrome.i18n.getMessage('archive_folder');
  const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label',t('closePreview'));close.onclick=()=>{if(new URLSearchParams(location.search).has('setup'))returnToChat();else dialog.close();};
  const status=document.createElement('p');status.id='archive-directory-status';status.setAttribute('role','alert');status.setAttribute('aria-live','assertive');status.hidden=true;
  const recover=document.createElement('button');recover.id='archive-recover-directory';recover.textContent=t('recoverDirectory');
  recover.onclick=async()=>{
   try{
    if(!recoveryDirectory)recoveryDirectory=await showDirectoryPicker({mode:'readwrite',id:'chatwork-archive'});
    if(!confirm(t('recoverConfirm')))return;
    recover.disabled=true;$('directory').disabled=true;close.disabled=true;busy=true;
    await chrome.storage.local.set({archiveAuto:false});
    const count=await recoverArchive(recoveryDirectory);root=recoveryDirectory;
    say(t('recovered')+count);
    returnToChat();
   }catch(e){if(e.name!=='AbortError')say(e.message);}
   finally{busy=false;recover.disabled=false;$('directory').disabled=false;close.disabled=false;}
  };
  dialog.append(title,$('directory'),$('directory-name'),recover,close,status);document.body.append(dialog);
 }
 if(!dialog.open)dialog.showModal();
}
async function command(action,id){
 if(action==='stop'){cancelled=true;pendingManual=null;await rpc('stop').catch(()=>{});say(t('paused'));return;}
 if(id)sources.add(id);
 if(action==='auto'){wakeAuto();return;}
 if(action==='setup'){tabId=id||tabId;showDirectoryDialog();return;}
 if(action==='manual'){
  if(busy){say(t('busy'));return;}tabId=id||tabId;
  const selectedDays=Math.max(1,Math.min(90,Math.round(Number((await chrome.storage.local.get('archiveDays')).archiveDays)||3)));
  const end=new Date(),start=new Date();start.setDate(start.getDate()-(selectedDays-1));$('from').value=dateInput(start);$('until').value=dateInput(end);
  root=await read('settings','directory');
  if(!root||await root.queryPermission({mode:'readwrite'})!=='granted'){pendingManual=tabId;showDirectoryDialog();say(chrome.i18n.getMessage('archive_authorize'));return;}
  await chrome.storage.local.set({archiveManualRunning:true,archiveProgress:{done:0,total:100}});
  try{await manualUpdate();}finally{await chrome.storage.local.set({archiveManualRunning:false,archiveProgress:null});}
 }
}
if(new URLSearchParams(location.search).has('setup')){
 showDirectoryDialog();$('directory').textContent=chrome.i18n.getMessage('archive_authorize');
 $('directory').onclick=async()=>{try{await directory();document.getElementById('archive-directory-dialog').close();returnToChat();}catch(e){if(e.name!=='AbortError')say(e.message);}};
}

if(embedded){$('messages').before($('more'));$('messages').addEventListener('scroll',()=>{if($('messages').scrollTop<60&&offset<shown.length)renderMore();});}

if(embedded)document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))parent.postMessage({type:'cw-archive-close'},'*');});

async function translateArchived(text){
 const settings=archiveTranslationSettings;
 EdgeTranslation.configure(settings.sourceLanguage,settings.targetLanguage);
 // Create synchronously from the user's click, before detection/queue awaits can
 // consume transient activation. Existing sessions are reused by initialize().
 await EdgeTranslation.initialize();
 return EdgeTranslation.translate(text,{manual:true});
}

if(new URLSearchParams(location.search).has('find'))openLinkSearch();
function openLinkSearch(){
 const text=k=>chrome.i18n.getMessage(k),dialog=document.createElement('dialog');dialog.className='archive-file-dialog';
 const close=document.createElement('button');close.textContent='×';close.style.cssText='float:right';close.setAttribute('aria-label',t('closePreview'));close.onclick=()=>dialog.close();
 const status=document.createElement('p');status.setAttribute('role','status');status.style.minHeight='3em';
 const label=document.createElement('label');label.textContent=text('archive_link_label');
 const input=document.createElement('input');input.type='url';input.style.cssText='width:100%;box-sizing:border-box;margin:10px 0';label.append(input);
 const open=document.createElement('button');open.textContent=text('archive_link_open');open.disabled=true;
 const find=document.createElement('button');find.textContent=t('search');find.disabled=true;
 let revision=0,timer,result;
 function reset(){revision++;clearInterval(timer);result=null;open.disabled=true;find.disabled=!input.value.trim();status.textContent='';}
 input.oninput=reset;
 find.onclick=async()=>{
  reset();const current=revision,link=parseMessageLink(input.value);
  if(!link){status.textContent=text('archive_link_invalid');return;}
  find.disabled=true;let dots=0;const progress=()=>status.textContent=text('archive_link_searching')+'.'.repeat(dots++%3+1);progress();timer=setInterval(progress,350);
  try{
   const rooms=(await list('rooms')).filter(room=>room.roomId===link.roomId&&room.origin===link.origin);
   let hit;
   for(const room of rooms){const message=await read('messages',room.key+':'+link.id);if(message&&!message.deleted){hit={room,message};break;}}
   if(current!==revision||!dialog.open)return;
   if(!hit){status.textContent=text('archive_link_missing');return;}
   await translateRoomNames();if(current!==revision||!dialog.open)return;
   const name=[...$('room').options].find(o=>o.value===hit.room.key)?.textContent||hit.room.roomName;
   status.textContent=text('archive_link_found').replace('{room}',name);result=hit;open.disabled=false;
  }catch(e){if(current===revision)status.textContent=t('failed')+': '+e.message;}
  finally{if(current===revision){clearInterval(timer);find.disabled=!input.value.trim();}}
 };
 input.onkeydown=e=>{if(e.key==='Enter'&&!find.disabled)find.click();};
 open.onclick=async()=>{if(!result)return;open.disabled=true;const hit=result;try{$('room').value=hit.room.key;await search();await jumpRelated(hit.message);dialog.close();}catch(e){status.textContent=t('failed')+': '+e.message;open.disabled=false;}};
 dialog.addEventListener('close',()=>{revision++;clearInterval(timer);dialog.remove();},{once:true});
 dialog.append(close,status,label,open,find);document.body.append(dialog);dialog.showModal();input.focus();
}
