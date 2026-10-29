(() => {
 let stopped=false,pending,interval,observer;
 function stop(){stopped=true;clearTimeout(pending);clearInterval(interval);observer?.disconnect();}
 function alive(){try{if(!chrome.runtime?.id){stop();return false;}return !stopped;}catch{stop();return false;}}
 function report(error){if(!alive()||/Extension context invalidated/i.test(error?.message||'')){stop();return;}state.archiveStatus=error?.message||String(error);render();}
 const t=k=>{if(!alive())return '';try{return chrome.i18n.getMessage(k);}catch(e){stop();return '';}};
 function closeDays(){document.querySelectorAll('.cw-archive-days').forEach(e=>e.hidden=true);document.querySelectorAll('[data-archive-days-toggle]').forEach(e=>e.setAttribute('aria-expanded','false'));}
 async function send(action){if(!alive())return;if(action==='manual')closeDays();try{if(action==='manual')await chrome.storage.local.set({archiveDays:daysValue()});const result=await chrome.runtime.sendMessage({type:'cw-archive-launch',action});if(result?.error)throw Error(result.error);}catch(e){report(e);}}
 let state={};
 const daysValue=()=>Math.max(1,Math.min(90,Math.round(Number(state.archiveDays)||3)));
 const dayText=k=>t(k).replace('{days}',String(daysValue()));
 function openViewer(find=false){
  if(!alive())return;
  document.getElementById('cw-archive-overlay')?.remove();
  const overlay=document.createElement('div');overlay.id='cw-archive-overlay';
  const panel=document.createElement('div');panel.className='cw-archive-modal';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',t('archive_view'));
  const close=document.createElement('button');close.className='cw-archive-close';close.textContent='×';close.setAttribute('aria-label',t('archive_close'));
  const previous=document.activeElement;const dismiss=()=>{overlay.remove();document.removeEventListener('keydown',escape);window.removeEventListener('message',frameClose);previous?.focus();};
  const escape=e=>{if(e.key==='Escape')dismiss();};close.onclick=dismiss;document.addEventListener('keydown',escape);
  overlay.onclick=e=>{if(e.target===overlay)dismiss();};
  const core=globalThis.ChatworkMentions,room=(state.archiveRooms||[]).find(r=>r.roomId===core.roomId(document)&&r.account===core.account(document)?.key&&r.origin===location.origin);
  const frame=document.createElement('iframe');frame.title=t('archive_view');frame.setAttribute('allow','translator *; language-detector *');frame.src=chrome.runtime.getURL('archive.html')+'?embed=1&room='+encodeURIComponent(room?.key||'')+(find===true?'&find=1':'');
  const frameClose=e=>{if(e.source===frame.contentWindow&&e.data?.type==='cw-archive-close')dismiss();};window.addEventListener('message',frameClose);
  panel.append(close,frame);overlay.append(panel);document.body.append(overlay);close.focus();
 }
 function mount(){if(!alive())return;for(const box of document.querySelectorAll('.cw-history-save:not([data-archive])')){
  box.dataset.archive='1';
  const row=document.createElement('div'),directory=document.createElement('button'),name=document.createElement('span');
  directory.textContent=t('archive_folder');directory.onclick=()=>send('setup');name.dataset.archiveName='';name.title=t('archive_path_note');row.append(directory,name);
  const label=document.createElement('label'),auto=document.createElement('input');auto.type='checkbox';auto.dataset.archiveAuto='';auto.onchange=async()=>{if(!alive())return;try{await chrome.storage.local.set({archiveAuto:auto.checked});if(auto.checked)await send('auto');}catch(e){auto.checked=!!state.archiveAuto;report(e);}};label.append(auto,t('archive_auto'));
  const range=document.createElement('div');range.dataset.archiveRange='';
  const update=document.createElement('button');update.textContent=t('archive_update');update.dataset.archiveUpdate='';update.onclick=()=>send('manual');
  const updateRow=document.createElement('div');updateRow.className='cw-archive-update-row';updateRow.dataset.archiveUpdateRow='';
  const chooser=document.createElement('div');chooser.className='cw-archive-days';chooser.hidden=true;
  const slider=document.createElement('input');slider.type='range';slider.min='1';slider.max='90';slider.step='1';slider.value=String(daysValue());slider.setAttribute('aria-label',t('archive_choose_days'));slider.dataset.archiveDays='';
  const caption=document.createElement('span');caption.dataset.archiveDaysLabel='';caption.textContent=dayText('archive_days_label');
  slider.oninput=()=>{state.archiveDays=Number(slider.value);render();};
  slider.onchange=()=>{if(alive())chrome.storage.local.set({archiveDays:daysValue()}).catch(report);};
  chooser.append(slider,caption);
  const toggle=document.createElement('button');toggle.dataset.archiveDaysToggle='';toggle.textContent='▾';toggle.title=t('archive_choose_days');toggle.setAttribute('aria-label',t('archive_choose_days'));toggle.setAttribute('aria-expanded','false');
  toggle.onclick=()=>{chooser.hidden=!chooser.hidden;toggle.setAttribute('aria-expanded',String(!chooser.hidden));};
  updateRow.append(chooser,update,toggle);
  const stopButton=document.createElement('button');stopButton.textContent=t('archive_stop');stopButton.dataset.archiveStop='';stopButton.hidden=true;stopButton.onclick=()=>send('stop');
  const progress=document.createElement('progress');progress.dataset.archiveProgress='';progress.hidden=true;progress.style.width='100%';progress.max=100;progress.value=0;
  const view=document.createElement('button');view.textContent=t('archive_view');view.onclick=()=>openViewer();const find=document.createElement('button');find.textContent=t('archive_link_find');find.onclick=()=>openViewer(true);
  const status=document.createElement('div');status.dataset.archiveStatus='';status.setAttribute('role','status');
  const viewRow=document.createElement('div');viewRow.className='cw-archive-view-row';viewRow.append(view,find);
  box.append(row,label,range,updateRow,stopButton,progress,viewRow,status);
 }render();}
 function render(){if(!alive())return;const set=(q,value)=>document.querySelectorAll(q).forEach(e=>{if(e.textContent!==value)e.textContent=value;});set('[data-archive-name]',state.archiveDirectory||t('archive_no_folder'));document.querySelectorAll('[data-archive-auto]').forEach(e=>e.checked=!!state.archiveAuto);
 const running=state.archiveManualRunning===true;
 if(running)closeDays();
 document.querySelectorAll('[data-archive-update-row]').forEach(e=>e.hidden=running);
 document.querySelectorAll('[data-archive-update]').forEach(e=>{const text=dayText('archive_update_days');if(e.textContent!==text)e.textContent=text;});
 document.querySelectorAll('[data-archive-days]').forEach(e=>e.value=String(daysValue()));
 document.querySelectorAll('[data-archive-days-label]').forEach(e=>{const text=dayText('archive_days_label');if(e.textContent!==text)e.textContent=text;});
 document.querySelectorAll('[data-archive-stop]').forEach(e=>e.hidden=!running);
 document.querySelectorAll('[data-archive-progress]').forEach(e=>{e.hidden=!running;const p=state.archiveProgress;if(p&&p.total>0){e.max=p.total;e.value=p.done;}else{e.max=100;e.value=0;}});
 const core=globalThis.ChatworkMentions;if(!core)return;const rid=core.roomId(document),account=core.account(document)?.key;
 const room=(Array.isArray(state.archiveRooms)?state.archiveRooms:[]).find(r=>r&&r.roomId===rid&&r.account===account&&r.origin===location.origin);
 set('[data-archive-range]',room?`${t('archive_range')}: ${new Date(room.min).toLocaleDateString()} – ${new Date(room.max).toLocaleDateString()} (${room.count})`:t('archive_empty'));
 set('[data-archive-status]',state.archiveStatus||'');}
 if(!alive())return;
 try{chrome.storage.local.get(['archiveAuto','archiveDirectory','archiveRooms','archiveStatus','archiveManualRunning','archiveProgress','archiveDays']).then(v=>{state=v;mount();if(state.archiveAuto)send('auto');}).catch(report);}catch(e){report(e);}
 chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;for(const [k,v]of Object.entries(changes))if(k.startsWith('archive'))state[k]=v.newValue;render();});
 observer=new MutationObserver(()=>{clearTimeout(pending);pending=setTimeout(mount,300);});observer.observe(document.body,{childList:true,subtree:true});
 interval=setInterval(()=>{if(state.archiveAuto)send('auto');render();},10000);
 window.addEventListener('pagehide',stop,{once:true});
})();
