// Extension-origin database. No chat text is stored in the website's origin.
export const database = new Promise((resolve,reject)=>{
  const request=indexedDB.open('chatwork-local-archive',1);
  request.onupgradeneeded=()=>{
    const db=request.result;
    db.createObjectStore('rooms',{keyPath:'key'});
    const messages=db.createObjectStore('messages',{keyPath:'key'});messages.createIndex('room','roomKey');
    db.createObjectStore('settings');
  };
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
export async function write(store,values) {
  const db=await database;return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite');for(const value of values)tx.objectStore(store).put(value);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error(chrome.i18n.getMessage('archive_error_3')));
  });
}
export async function read(store,key) {
  const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function list(store,index,key) {
  const db=await database;return new Promise((resolve,reject)=>{let s=db.transaction(store).objectStore(store);if(index)s=s.index(index);const r=s.getAll(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function setting(key,value) {
  const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
export function safeName(text) {return String(text).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,100)||'attachment';}
export async function roomKey(c) {
  const bytes=new TextEncoder().encode(`${c.origin}|${c.account.key}|${c.roomId}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
