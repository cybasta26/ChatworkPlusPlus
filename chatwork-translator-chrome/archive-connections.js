// These errors mean the source page no longer has a receiving content script.
export function isArchiveDisconnected(error){
 return /Receiving end does not exist|No tab with id|tab (?:was )?closed|message port closed|message channel closed/i.test(error?.message||'');
}
export async function visitArchiveSources(sources,visit,onError,stopped=()=>false){
 for(const id of [...sources]){
  if(stopped())break;
  try{await visit(id);}catch(error){
   if(isArchiveDisconnected(error))sources.delete(id);
   else await onError(error);
  }
 }
}
