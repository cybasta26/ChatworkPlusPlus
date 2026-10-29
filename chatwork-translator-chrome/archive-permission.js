import {read} from './archive-store.js';
import {ensureArchiveOwner} from './archive-owner.js';
export async function checkedArchiveDirectory(){
 let stage='read-directory',state='unknown',directory;
 try{
  directory=await read('settings','directory');
  if(!directory)throw Object.assign(new Error(),{diagnosticCode:'NO_DIRECTORY'});
  stage='query-readwrite';state=await directory.queryPermission({mode:'readwrite'});
  if(state!=='granted')throw Object.assign(new Error(),{diagnosticCode:state==='prompt'?'AUTH_REQUIRED':'AUTH_DENIED'});
  stage='check-owner';await ensureArchiveOwner(directory);
  await chrome.storage.local.set({archiveDiagnostic:{time:new Date().toISOString(),ok:true,stage,permission:state,version:chrome.runtime.getManifest().version}});
  return directory;
 }catch(error){
  const code=error.diagnosticCode||'CHECK_FAILED';
  const diagnostic={time:new Date().toISOString(),ok:false,code,stage,permission:state,errorName:error.name||'Error',errorMessage:error.message||'',version:chrome.runtime.getManifest().version,browser:navigator.userAgent};
  await chrome.storage.local.set({archiveDiagnostic:diagnostic}).catch(()=>{});
  const key=code==='NO_DIRECTORY'?'archive_diag_missing':code==='AUTH_REQUIRED'?'archive_diag_prompt':code==='AUTH_DENIED'?'archive_diag_denied':'archive_diag_failed';
  const detail=chrome.i18n.getMessage(key);
  throw new Error(detail+' ['+code+'; '+stage+'; readwrite='+state+'; v'+diagnostic.version+']'+(error.message?' '+error.name+': '+error.message:''));
 }
}
