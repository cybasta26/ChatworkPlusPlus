import {read,roomKey} from './archive-store.js';
import {control} from './archive-engine.js';
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(m?.type!=='cw-archive-launch'||sender.id!==chrome.runtime.id||!sender.tab)return;
 if(!['setup','manual','view','auto','stop'].includes(m.action))return;
 (async()=>{
  if(m.action==='setup'){await control('stop',sender.tab.id);await chrome.tabs.update(sender.tab.id,{url:chrome.runtime.getURL('archive.html')+'?setup=1&tab='+sender.tab.id+'&returnTo='+encodeURIComponent(sender.tab.url||'https://www.chatwork.com/')});return;}
  if(m.action==='view'){await chrome.tabs.create({url:chrome.runtime.getURL('archive.html')});return;}
  await control(m.action,sender.tab.id);
 })().then(()=>reply({ok:true}),async e=>{await chrome.storage.local.set({archiveStatus:e.message});reply({error:e.message});});return true;
});

chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message?.type!=='cw-open-thread-settings'||sender.id!==chrome.runtime.id||!sender.tab)return;
 let url;try{url=new URL(sender.url||sender.tab.url);}catch{return;}
 if(url.protocol!=='https:'||!['www.chatwork.com','chatwork.com'].includes(url.hostname))return;
 chrome.tabs.create({url:chrome.runtime.getURL('popup.html')}).then(()=>reply({ok:true}),e=>reply({error:e.message}));
 return true;
});

chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message?.type!=='cw-thread-archive-lookup'||sender.id!==chrome.runtime.id||!sender.tab)return;
 (async()=>{
  const url=new URL(sender.url||sender.tab.url);
  if(url.protocol!=='https:'||!['chatwork.com','www.chatwork.com'].includes(url.hostname))throw Error(chrome.i18n.getMessage('archive_error_26'));
  if(!(await chrome.storage.local.get('archiveAuto')).archiveAuto)return [];
  if(!/^\d+$/.test(message.roomId)||typeof message.accountKey!=='string'||!Array.isArray(message.ids))return [];
  const key=await roomKey({origin:url.origin,roomId:message.roomId,account:{key:message.accountKey}});
  const records=await Promise.all(message.ids.slice(0,200).filter(id=>/^\d+$/.test(id)).map(id=>read('messages',key+':'+id)));
  return records.filter(Boolean).filter(m=>!m.deleted);
 })().then(records=>reply({records}),e=>reply({error:e.message}));return true;
});


// Embedded viewers have no tab query parameter. Resolve their actual host tab
// from Chrome's sender metadata rather than accepting a page-supplied tab ID.
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message?.type!=='cw-archive-view-context'||sender.id!==chrome.runtime.id||!sender.tab)return;
 if((sender.url||'').split('?')[0]!==chrome.runtime.getURL('archive.html'))return;
 chrome.tabs.sendMessage(sender.tab.id,{type:'cw-archive',action:'context'})
  .then(result=>reply(result||{error:chrome.i18n.getMessage('archive_error_26')}),e=>reply({error:e.message}));
 return true;
});
