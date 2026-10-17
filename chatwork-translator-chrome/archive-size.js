import {read} from './archive-store.js';
export async function directoryBytes(directory,active=()=>true){
 let total=0;
 for await(const entry of directory.values()){
  if(!active())throw new Error(chrome.i18n.getMessage('archive_error_27'));
  total+=entry.kind==='directory'?await directoryBytes(entry,active):(await entry.getFile()).size;
 }
 return total;
}
export async function archiveBytes(active){
 const root=await read('settings','directory');
 if(!root||await root.queryPermission({mode:'read'})!=='granted')throw Error(chrome.i18n.getMessage('archive_authorize'));
 return directoryBytes(root,active);
}
export function formatBytes(bytes){
 const units=['B','KB','MB','GB','TB'];let index=0;
 while(bytes>=1024&&index<units.length-1){bytes/=1024;index++;}
 return bytes.toLocaleString(undefined,{maximumFractionDigits:index?2:0})+' '+units[index];
}
