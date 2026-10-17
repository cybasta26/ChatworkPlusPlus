export function fileKind(f){
 const name=(f.path||f.name||'').replace(/\s*\([\d.,]+\s*[KMGT]?B\)\s*$/i,'').toLowerCase(),mime=(f.mime||'').split(';')[0].trim().toLowerCase();
 if(/^image\/(png|jpeg|gif|webp|bmp)$/.test(mime)||/\.(png|jpe?g|gif|webp|bmp)$/.test(name))return 'image';
 if(mime==='application/pdf'||/\.pdf$/.test(name))return 'pdf';
 if(mime.startsWith('text/')||/\.(txt|log|csv|json|xml|md|ya?ml|ini|html?|svg)$/.test(name))return 'text';
 return 'download';
}
function shell(title,t){
 const dialog=document.createElement('dialog');dialog.className='archive-file-dialog';
 const heading=document.createElement('strong');heading.textContent=title;
 const close=document.createElement('button');close.textContent=t('closePreview');close.onclick=()=>dialog.close();
 const header=document.createElement('div');header.className='preview-header';header.append(heading,close);dialog.append(header);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);return dialog;
}
export function confirmSave(name,t){return new Promise(resolve=>{
 const dialog=shell(t('saveAs'),t),message=document.createElement('p');message.textContent=t('confirmSave').replace('{name}',name);
 const cancel=document.createElement('button');cancel.textContent=t('cancelSave');cancel.onclick=()=>dialog.close();
 const confirm=document.createElement('button');confirm.textContent=t('confirmButton');let accepted=false;confirm.onclick=()=>{accepted=true;dialog.close();};
 dialog.append(message,cancel,confirm);dialog.addEventListener('close',()=>resolve(accepted),{once:true});dialog.showModal();cancel.focus();
});}
export async function previewFile(file,f,kind,t){
 const dialog=shell(f.name,t);let url;
 if(kind==='text'){
  const pre=document.createElement('pre');pre.className='file-text';pre.textContent=await file.slice(0,5*1024*1024).text();dialog.append(pre);
  if(file.size>5*1024*1024){const note=document.createElement('p');note.textContent=t('previewTruncated');dialog.append(note);}
 }else{
  const content=kind==='image'?document.createElement('img'):document.createElement('iframe');
  url=URL.createObjectURL(kind==='pdf'?new Blob([file],{type:'application/pdf'}):file);content.src=url;
  if(kind==='image')content.alt=f.name;else content.title=f.name;content.className='file-'+kind;dialog.append(content);
 }
 dialog.addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);},{once:true});dialog.showModal();
}
