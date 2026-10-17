const folder='.chatworkplusplus-owners';
async function identity(){return navigator.locks.request('cw-archive-owner-id',async()=>{
 const saved=await chrome.storage.local.get('archiveOwnerId');if(saved.archiveOwnerId)return saved.archiveOwnerId;
 const id=crypto.randomUUID();await chrome.storage.local.set({archiveOwnerId:id});return id;
});}
export async function ensureArchiveOwner(root){
 const id=await identity(),name=id+'.json';
 return navigator.locks.request('cw-archive-directory-owner',async()=>{
  const dir=await root.getDirectoryHandle(folder,{create:true});
  const conflict=async()=>{for await(const entry of dir.values())if(entry.name!==name)return true;return false;};
  const denied=()=>Object.assign(Error(chrome.i18n.getMessage('archive_other_owner')),{code:'ARCHIVE_OTHER_OWNER'});
  if(await conflict())throw denied();
  let exists=false;try{await dir.getFileHandle(name);exists=true;}catch(e){if(e.name!=='NotFoundError')throw e;}
  if(!exists){
   const file=await dir.getFileHandle(name,{create:true});let stream;
   try{stream=await file.createWritable();await stream.write(JSON.stringify({format:'ChatworkPlusPlus-owner',owner:id,extension:chrome.runtime.id,createdAt:new Date().toISOString()}));await stream.close();}
   catch(e){if(stream)await stream.abort().catch(()=>{});await dir.removeEntry(name).catch(()=>{});throw e;}
  }
  if(await conflict()){if(!exists)await dir.removeEntry(name).catch(()=>{});throw denied();}
 });
}

export async function takeArchiveOwnership(root){
 const id=await identity();
 return navigator.locks.request('cw-archive-directory-owner',async()=>{
  const dir=await root.getDirectoryHandle(folder,{create:true}),old=[];
  for await(const entry of dir.values()){
   if(entry.kind!=='file'||! /^[a-zA-Z0-9-]+\.json$/.test(entry.name))throw Error(chrome.i18n.getMessage('archive_error_7'));
   old.push({name:entry.name,text:await(await entry.getFile()).text()});
  }
  // Preserve ownership markers outside the marker folder before replacing them.
  const backup=await root.getFileHandle('ownership-backup-'+Date.now()+'.json',{create:true});
  const out=await backup.createWritable();await out.write(JSON.stringify(old));await out.close();
  const file=await dir.getFileHandle(id+'.json',{create:true}),writer=await file.createWritable();
  await writer.write(JSON.stringify({format:'ChatworkPlusPlus-owner',owner:id,extension:chrome.runtime.id,createdAt:new Date().toISOString()}));await writer.close();
  for(const entry of old)if(entry.name!==id+'.json')await dir.removeEntry(entry.name);
 });
}
