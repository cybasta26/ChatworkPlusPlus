(() => {
  const core = ChatworkMentions;
  let job;
  const streams = new Map();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function originalRoomName(node) {
    const copy = node?.cloneNode(true);
    copy?.querySelectorAll('.cw-room-translation').forEach(label => label.remove());
    return copy?.textContent.trim() || '';
  }
  function roomNames() {
    const names = {};
    for (const tab of document.querySelectorAll('[role="tab"][data-rid]')) {
      const name = tab.getAttribute('aria-label')?.trim();
      if (name) names[tab.dataset.rid] = name;
    }
    const current = originalRoomName(document.querySelector('.chatRoomHeader__roomTitle'));
    if (current) names[core.roomId(document)] = current;
    return names;
  }
  const context = () => ({origin:location.origin, roomId:core.roomId(document),
    roomName:originalRoomName(document.querySelector('.chatRoomHeader__roomTitle')),
    roomNames:roomNames(),
    account:core.account(document)});
  function valid(j) {
    const c = context();
    return !j.cancelled && Date.now()-j.lastPoll<30000 && c.roomId === j.context.roomId && c.account.key === j.context.account.key;
  }
  function collect(j) {
    if (!valid(j)) return;
    let previous;
    for (const m of core.messages(document,j.context.roomId)) {
      if(Number.isInteger(m.index))j.indices.add(m.index);
      const ownName=m.el.querySelector('[data-testid="timeline_user-name"]')?.textContent.trim() || m.el.querySelector('._speaker img')?.alt || '';
      const author=m.sender ? {id:m.sender,name:ownName||m.sender,index:m.index} : previous && previous.index===m.index-1 ? {...previous,index:m.index} : {id:'',name:'',index:m.index};
      previous=author;
      if (!Number.isFinite(m.time) || m.time < j.from || m.time > j.to) continue;
      j.seen.add(m.id);
      const pre = m.el.querySelector('pre');
      if (!pre && !m.deleted) continue;
      const copy = pre?.cloneNode(true);
      copy?.querySelectorAll('.cw-zh-translation,.cw-m-preview-translation,.cw-m-thread-translation').forEach(e=>e.remove());
      const text = copy ? (globalThis.ChatworkNames?.messageText(copy) ?? copy.textContent) : '';
      const files = new Map();
      for (const a of copy?.querySelectorAll('a[href]') || []) {
        const u = new URL(a.getAttribute('href'), location.href);
        const id = u.searchParams.get('file_id');
        if (u.origin !== location.origin || !u.pathname.endsWith('/download_file.php') || !/^\d+$/.test(id || '')) continue;
        files.set(id,{id,name:a.textContent.trim() || `file-${id}`});
      }
      if (!m.deleted && !text.trim() && !files.size) continue;
      const record = {id:m.id,time:m.time,sender:author.id,
        senderName:author.name,
        text,to:[...m.to],re:[...m.re],replies:(m.replies||[]).map(r=>({id:String(r.id)})),deleted:m.deleted,files:[...files.values()],capturedAt:Date.now()};
      j.records.set(m.id,record);
    }
  }
  async function scan(j) {
    const scroll = core.scroller(document);
    if (!scroll) {j.error=chrome.i18n.getMessage('archive_error_25');j.done=true;return;}
    const captureObserver=new MutationObserver(()=>{if(valid(j))collect(j);});
    captureObserver.observe(scroll,{childList:true,subtree:true,characterData:true});
    const interrupt = () => {j.cancelled=true;};
    const key = e => {if(e.key==='Escape')interrupt();};
    scroll.addEventListener('wheel',interrupt,{passive:true});
    document.addEventListener('keydown',key);
    document.documentElement.dataset.cwHistoryLoading='1';
    try {
      // Capture lazy-rendered bodies as they appear, without jumping to individual rows.
      const settle=async(maxWait=600)=>{
        let previous='',stable=0;
        for(let elapsed=0;elapsed<maxWait&&valid(j);elapsed+=100){
          await sleep(100);collect(j);
          const signature=core.messages(document,j.context.roomId).map(m=>m.id).join(',')+'|'+j.records.size+'|'+scroll.scrollHeight;
          stable=signature===previous?stable+1:0;previous=signature;
          if(stable>=3)break;
        }
      };
      scroll.scrollTop=scroll.scrollHeight;scroll.dispatchEvent(new Event('scroll'));
      await settle(1200);
      const newest=scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<=4;
      let stalls=0,lastProgress=Date.now(),lowestPosition=scroll.scrollTop;
      const discovered=new Set();
      let oldestTime=Infinity;
      for(let n=0;n<2000&&valid(j);n++) {
        collect(j);
        const messages=core.messages(document,j.context.roomId);
        // Virtualized lists may keep resetting scrollTop at a blocked history edge.
        // Track newly observed messages as well as actual upward movement.
        let advanced=false;
        for(const m of messages){
          if(!discovered.has(m.id)){discovered.add(m.id);advanced=true;}
          if(Number.isFinite(m.time)&&m.time<oldestTime){oldestTime=m.time;advanced=true;}
        }
        if(advanced){lastProgress=Date.now();lowestPosition=scroll.scrollTop;}
        else if(scroll.scrollTop<lowestPosition-1){lastProgress=Date.now();lowestPosition=scroll.scrollTop;}
        if(Date.now()-lastProgress>=10000)break;
        const viewport=scroll.getBoundingClientRect();
        const visible=messages.filter(m=>{const rect=m.el.getBoundingClientRect();return rect.bottom>=viewport.top&&rect.top<=viewport.bottom;});
        for(const m of visible)if(Number.isFinite(m.time))j.progressTime=Math.min(j.progressTime??j.to,m.time);
        if(visible.some(m=>Number.isFinite(m.time)&&m.time<j.from)) {j.boundary=newest;break;}
        const before=messages.map(m=>m.id).join(',');
        const oldTop=scroll.scrollTop;
        // Overlap adjacent viewports so partially visible and tall messages can hydrate.
        scroll.scrollTop=Math.max(0,oldTop-Math.max(80,scroll.clientHeight*0.75));
        scroll.dispatchEvent(new Event('scroll'));
        await settle(oldTop<=1?1200:600);
        const after=core.messages(document,j.context.roomId).map(m=>m.id).join(',');
        if(oldTop<=1&&scroll.scrollTop<=1&&before===after){
          // Give the history loader a bounded grace period at the oldest loaded edge.
          await sleep(500);collect(j);stalls++;
        }else stalls=0;
        if(stalls>=4)break;
      }
      const indices=[...j.indices].sort((a,b)=>a-b);
      const continuous=indices.length>0 && indices.every((n,i)=>!i||n===indices[i-1]+1);
      j.complete=valid(j)&&j.boundary&&continuous&&[...j.seen].every(id=>j.records.has(id));
    } catch(e){j.error=e.message;} finally {
      scroll.removeEventListener('wheel',interrupt);document.removeEventListener('keydown',key);
      captureObserver.disconnect();
      delete document.documentElement.dataset.cwHistoryLoading;
      document.dispatchEvent(new Event('cw-history-finished'));j.done=true;
    }
  }
  // Retain observations between polls, including messages from a room just left.
  const pending=new Map(),acknowledged=new Map();let automatic=false;
  const fingerprint=m=>JSON.stringify([m.time,m.sender,m.senderName,m.text,m.to,m.re,m.deleted,m.files,m.replies]);
  function remember(){
    const c=context();if(!c.roomId||!c.account.key)return;
    const key=c.origin+'|'+c.account.key+'|'+c.roomId;
    const j={context:c,from:0,to:Date.now(),records:new Map(),seen:new Set(),indices:new Set(),lastPoll:Date.now()};collect(j);
    let entry=pending.get(key);if(!entry){entry={context:c,records:new Map()};pending.set(key,entry);}
    for(const [id,m]of j.records){if(acknowledged.get(key+'|'+id)===fingerprint(m))continue;const old=entry.records.get(id);if(old&&fingerprint(old)===fingerprint(m))continue;entry.records.set(id,m);}
  }
  chrome.storage?.local.get('archiveAuto').then(v=>{automatic=!!v.archiveAuto;if(automatic)remember();});
  chrome.storage?.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.archiveAuto){automatic=!!changes.archiveAuto.newValue;if(!automatic)pending.clear();else remember();}});
  new MutationObserver(()=>{if(automatic)remember();}).observe(document.body,{childList:true,subtree:true,characterData:true});
  function stopStream(id) {const s=streams.get(id);if(s){clearTimeout(s.timer);s.controller.abort();s.reader?.cancel().catch(()=>{});streams.delete(id);}}
  function touch(id,s) {clearTimeout(s.timer);s.timer=setTimeout(()=>stopStream(id),60000);}
  async function handle(m) {
    if(m.action==='context')return context();
    if(m.action==='visible') {
      remember();for(const [key,entry]of pending)if(!entry.records.size)pending.delete(key);const entry=pending.values().next().value;
      if(!entry)return {context:context(),records:[]};
      return {context:entry.context,records:[...entry.records.values()].slice(0,200)};
    }
    if(m.action==='ack-visible'){
      const entry=pending.get(m.roomKey);
      if(entry){for(const v of m.records||[]){const record=entry.records.get(v.id);if(record?.capturedAt===v.capturedAt){acknowledged.set(m.roomKey+'|'+v.id,fingerprint(record));entry.records.delete(v.id);}}if(!entry.records.size)pending.delete(m.roomKey);}
      return true;
    }
    if(m.action==='start') {
      if(job&&!job.done)throw Error(chrome.i18n.getMessage('archive_error_17'));
      const c=context();if(!c.roomId||!c.account.key)throw Error(chrome.i18n.getMessage('archive_error_18'));
      if(!Number.isFinite(m.from)||!Number.isFinite(m.to)||m.from>m.to)throw Error(chrome.i18n.getMessage('archive_error_19'));
      job={context:c,from:m.from,to:m.to,records:new Map(),seen:new Set(),indices:new Set(),lastPoll:Date.now(),done:false,complete:false};scan(job);return c;
    }
    if(m.action==='poll') {
      if(!job)throw Error('No scan');
      job.lastPoll=Date.now();collect(job);
      return {context:job.context,done:job.done,complete:job.complete,error:job.error,cancelled:job.cancelled,
        progressTime:job.progressTime??job.to,total:job.records.size,missing:job.seen.size-job.records.size,records:[...job.records.values()].slice(m.offset||0,(m.offset||0)+100)};
    }
    if(m.action==='stop'){if(job)job.cancelled=true;for(const id of streams.keys())stopStream(id);return true;}
    if(m.action==='file-open') {
      const c=context();
      if(c.roomId!==m.roomId||c.account.key!==m.accountKey||!/^\d+$/.test(m.id))throw Error(chrome.i18n.getMessage('archive_error_20'));
      if(streams.size>=2)throw Error(chrome.i18n.getMessage('archive_error_21'));
      const controller=new AbortController(), token=crypto.randomUUID();
      const s={controller,accountKey:c.account.key,roomId:c.roomId};streams.set(token,s);touch(token,s);
      try {
        const u=new URL('/gateway/download_file.php',location.origin);u.search=new URLSearchParams({bin:'1',file_id:m.id,preview:'0'});
        const response=await fetch(u,{credentials:'include',signal:controller.signal});
        const type=response.headers.get('content-type')||'';
        const disposition=response.headers.get('content-disposition')||'';
        if(!response.ok||(/text\/html/i.test(type)&&!/^attachment/i.test(disposition))||/filename[^;]*error\.txt/i.test(disposition))throw Error(chrome.i18n.getMessage('archive_download_rejected',[String(response.status)]));
        s.reader=response.body.getReader();s.first=true;s.type=type;s.attachment=/^attachment/i.test(disposition);touch(token,s);
        return {token,type,length:Number(response.headers.get('content-length'))||0};
      }catch(e){stopStream(token);throw e;}
    }
    if(m.action==='file-read') {
      const s=streams.get(m.token);if(!s)throw Error(chrome.i18n.getMessage('archive_error_22'));const c=context();if(c.account.key!==s.accountKey||c.roomId!==s.roomId){stopStream(m.token);throw Error(chrome.i18n.getMessage('archive_error_20'));}touch(m.token,s);
      let {done,value}=await s.reader.read();
      if(done){stopStream(m.token);return {done:true};}
      if(s.first){
        while(value.length<4096){const next=await s.reader.read();if(next.done)break;const joined=new Uint8Array(value.length+next.value.length);joined.set(value);joined.set(next.value,value.length);value=joined;}
        s.first=false;const text=new TextDecoder().decode(value.slice(0,4096));
        if(/ファイルをダウンロードする権限がありません|You do not have permission to download/i.test(text)||(!s.attachment&&/^\s*(?:<!doctype html|<html)/i.test(text))){stopStream(m.token);throw Error(chrome.i18n.getMessage('archive_error_23'));}}
      // Chunk string conversion avoids argument-count limits for large network chunks.
      let binary='';for(let i=0;i<value.length;i+=8192)binary+=String.fromCharCode(...value.subarray(i,i+8192));
      return {done:false,data:btoa(binary)};
    }
    if(m.action==='file-close'){stopStream(m.token);return true;}
    throw Error(chrome.i18n.getMessage('archive_error_24'));
  }
  chrome.runtime.onMessage.addListener((m,sender,respond)=>{
    if(m?.type!=='cw-archive'||sender.id!==chrome.runtime.id||!(sender.url?.startsWith(chrome.runtime.getURL('archive.html'))||sender.url===chrome.runtime.getURL('background.js')||!sender.url&&!sender.tab))return;
    handle(m).then(value=>respond({value}),error=>respond({error:error.message}));return true;
  });
})();
