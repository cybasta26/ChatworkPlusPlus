(() => {
  'use strict';
  if (globalThis.__cwScreenshotAttachment) return;
  globalThis.__cwScreenshotAttachment = true;
  const language = CW_I18N.t('ui_language');
  const strings = {
    en: ['Screenshot attachment','Paste a clipboard image here with Ctrl+V. Upload opens the native attachment window in this chat. Confirm sending there.','Upload image','Close','Copy an image first, then press Ctrl+V.','The chat changed. Reopen this window in the intended chat.','The attachment control is unavailable. Refresh Chatwork and retry.'],
    zh_CN: ['截图附件','在此窗口按 Ctrl+V 粘贴图片。上传后将打开当前聊天的原生附件窗口，请在那里确认发送。','上传图片','关闭','请先复制图片，再按 Ctrl+V。','聊天已切换，请在目标聊天中重新打开此窗口。','附件控件不可用，请刷新 Chatwork 后重试。'],
    zh_TW: ['截圖附件','在此視窗按 Ctrl+V 貼上圖片。上傳後將開啟目前聊天的原生附件視窗，請在那裡確認傳送。','上傳圖片','關閉','請先複製圖片，再按 Ctrl+V。','聊天已切換，請在目標聊天中重新開啟此視窗。','附件控制項無法使用，請重新整理 Chatwork 後重試。'],
    ja: ['スクリーンショット添付','この画面で Ctrl+V を押して画像を貼り付けてください。アップロード後、現在のチャットの添付画面で送信を確認してください。','画像をアップロード','閉じる','画像をコピーして Ctrl+V を押してください。','チャットが変わりました。送信先でこの画面を開き直してください。','添付機能を利用できません。Chatwork を再読み込みしてください。'],
    ko: ['스크린샷 첨부','이 창에서 Ctrl+V로 이미지를 붙여넣으세요. 업로드 후 현재 채팅의 첨부 창에서 전송을 확인하세요.','이미지 업로드','닫기','이미지를 복사한 후 Ctrl+V를 누르세요.','채팅이 변경되었습니다. 전송할 채팅에서 창을 다시 여세요.','첨부 기능을 사용할 수 없습니다. Chatwork를 새로 고치세요.']
  };
  const normalized = language.replace('-', '_');
  const s = strings[normalized] || strings[normalized.split('_')[0]] || strings.en;
  const room = () => location.hash.match(/#!?rid(\d+)/)?.[1] || '';
  let panel, preview, status, submit, file, url, openedRoom = '', opener;
  function clear() {
    if(url) URL.revokeObjectURL(url);
    url = ''; file = null;
    if(preview) { preview.removeAttribute('src'); preview.style.display='none'; }
    if(submit) submit.disabled=true;
  }
  function close() { panel.hidden=true; clear(); opener?.focus(); }
  function button(label, handler) {
    const el=document.createElement('button'); el.type='button'; el.textContent=label;
    el.addEventListener('click',handler); return el;
  }
  function createPanel() {
    panel=document.createElement('section'); panel.className='cw-attachment-panel'; panel.hidden=true; panel.tabIndex=-1;
    panel.setAttribute('role','dialog'); panel.setAttribute('aria-label',s[0]);
    const header=document.createElement('header'), title=document.createElement('strong');
    title.textContent=s[0]; header.append(title,button(s[3],close));
    const hint=document.createElement('p'); hint.textContent=s[1];
    preview=document.createElement('img'); preview.alt=s[0];
    preview.style.cssText='max-width:100%;max-height:220px;object-fit:contain;margin:8px auto';
    status=document.createElement('div'); status.setAttribute('role','status');
    const actions=document.createElement('div'); actions.className='cw-attachment-actions';
    submit=button(s[2],()=>{
      if(!file)return;
      if(!openedRoom || room()!==openedRoom){clear();status.textContent=s[5];return;}
      const input=document.querySelector('#_fileInput[type="file"]');
      if(!input){status.textContent=s[6];return;}
      try {
        const transfer=new DataTransfer(); transfer.items.add(file);
        input.value='';input.files=transfer.files;
        if(input.files.length!==1)throw new Error('File transfer failed');
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        panel.hidden=true;clear();
      } catch {status.textContent=s[6];}
    });
    actions.append(submit,button(s[3],close));panel.append(header,hint,preview,status,actions);
    panel.addEventListener('paste',event=>{
      if(panel.hidden)return;
      event.preventDefault();event.stopPropagation();
      if(room()!==openedRoom){clear();status.textContent=s[5];return;}
      const blob=[...(event.clipboardData?.items||[])].find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
      if(!blob){status.textContent=s[4];return;}
      clear();
      const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[blob.type]||'png';
      file=new File([blob],'screenshot-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext,{type:blob.type});
      url=URL.createObjectURL(file);preview.src=url;preview.style.display='block';submit.disabled=false;status.textContent=file.name;
    });
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
    document.body.append(panel);clear();
  }
  function install() {
    if(panel&&!panel.hidden&&room()!==openedRoom){panel.hidden=true;clear();}
    const native=document.querySelector('[data-testid="message-input-area_send-tool_send-file"], button#_file');
    const parent=native?.closest('ul, [role="toolbar"]');
    // The file input lives in a display:none form and may precede the toolbar.
    // Wait for the real toolbar, and relocate an existing entry after remounts.
    if(!parent)return;
    const existing=document.querySelector('.cw-screenshot-open');
    if(existing){if(existing.parentElement!==parent)parent.append(existing);return;}
    const launch=button('',()=>{
      if(!panel)createPanel();
      clear();openedRoom=room();status.textContent='';panel.hidden=false;opener=launch;panel.focus();
    });
    launch.className='cw-attachment-open cw-screenshot-open';launch.title=s[0];launch.setAttribute('aria-label',s[0]);
    launch.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" style="display:block;margin:auto"><rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="9.5" cy="9.5" r="2.5" fill="currentColor"/><path d="M7.5 21 15.7 12l5.3 4.8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    parent.append(launch);
  }
  install();new MutationObserver(install).observe(document.body,{childList:true,subtree:true});
})();
