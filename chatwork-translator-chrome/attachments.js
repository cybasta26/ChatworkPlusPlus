(function () {
  'use strict';
  if (window.__cwAttachmentUploader) return;

  const I = (key, fallback) => { const value = globalThis.CW_I18N?.t?.(key); return value && value !== key ? value : fallback; };
  const state = { panel: null, input: null, anchor: null, files: [], busy: false, error: '' };
  const ROOM_RE = /(?:^|#)!?rid(\d+)/;
  async function request(url, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (error) { if (error?.name === 'AbortError') throw new Error('请求超时，请重试'); throw error; }
    finally { clearTimeout(timer); }
  }

  function roomId() { return location.hash.match(ROOM_RE)?.[1] || document.querySelector('[data-roomid]')?.dataset.roomid || ''; }
  function myRoomId() {
    const elements = [...document.querySelectorAll('[role="tab"], a[href*="#!rid"], [data-roomid]')];
    const link = elements.find(el => /我的交谈|我的交談|my chat|自分|내 대화|我的對話/i.test((el.textContent || el.getAttribute('aria-label') || el.getAttribute('aria-description') || '').trim()));
    return link?.href?.match(ROOM_RE)?.[1] || link?.id?.match(/^\d+$/)?.[0] || link?.dataset?.roomid || '';
  }
  async function openMyChatFromAccountCard() {
    const text = /我的交谈|我的交談|my chat|自分|내 대화|我的對話/i;
    const beforeRoom = roomId();
    let action = [...document.querySelectorAll('button, a, [role="button"]')].find(el => text.test((el.textContent || el.getAttribute('aria-label') || '').trim()));
    if (!action) {
      action = document.querySelector('[data-testid="global-header_account-menu_menu-button"], #_globalHeader [data-aid], #_roomHeader [data-aid]');
      if (action) { action.click(); await new Promise(resolve => setTimeout(resolve, 300)); }
      action = [...document.querySelectorAll('button, a, [role="button"]')].find(el => text.test((el.textContent || el.getAttribute('aria-label') || '').trim()));
    }
    if (!action) return false;
    action.click();
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const id = myRoomId() || (roomId() && roomId() !== beforeRoom ? roomId() : '');
      if (id) return id;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  }
  async function waitForRoom(id, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const selected = document.querySelector('[role="tab"][aria-selected="true"], [role="tab"][aria-current="page"]');
      const selectedId = selected?.id || selected?.dataset?.roomid || '';
      if (roomId() === String(id) && (selectedId === String(id) || !selected) && document.querySelector('#_fileInput[type="file"]')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`聊天窗口加载超时（${id}）`);
  }
  function clickRoomTab(id) {
    const tab = document.querySelector(`[role="tab"][id="${id}"], [role="tab"][data-roomid="${id}"], a[href*="#!rid${id}"]`);
    if (tab) { tab.click(); return true; }
    location.hash = `#!rid${id}`;
    return false;
  }
  function ownId() {
    const selectors = [
      '[data-testid="global-header_account-menu_menu-button"] [data-aid]',
      '[data-testid="global-header_account-menu_menu-button"] [data-user-id]',
      '#_roomHeader [data-aid]'
    ];
    for (const selector of selectors) { const el = document.querySelector(selector); const id = el?.dataset.aid || el?.dataset.userId; if (/^\d+$/.test(id || '')) return id; }
    const speaker = document.querySelector('._message._message_my [data-aid], ._message [data-aid]');
    if (/^\d+$/.test(speaker?.dataset.aid || '')) return speaker.dataset.aid;
    return '';
  }
  function token() {
    const names = ['ACCESS_TOKEN','accessToken','csrfToken','csrf_token','csrf','token','_t'];
    for (const name of names) {
      const value = globalThis[name] || globalThis.ChatWork?.[name] || globalThis.CHATWORK?.[name];
      if (typeof value === 'string' && value.length > 5) return value;
    }
    for (const meta of document.querySelectorAll('meta[name],meta[property]')) {
      if (/csrf|token/i.test(meta.name || meta.getAttribute('property') || '') && meta.content) return meta.content;
    }
    const html = document.documentElement?.innerHTML || '';
    const patterns = [/(?:csrfToken|csrf_token|csrf|token|_t)["']?\s*[:=]\s*["']([^"']{8,})/i, /[?&]_t=([^&"']+)/i];
    for (const pattern of patterns) { const m = html.match(pattern); if (m) return m[1]; }
    return '';
  }
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  async function imagePreviewHeight(file) {
    if (!/^image\//i.test(file.type || '') && !/\.(?:png|jpe?g|gif|webp|bmp)$/i.test(file.name)) return 0;
    try {
      if (globalThis.createImageBitmap) {
        const bitmap = await createImageBitmap(file);
        const height = Math.min(bitmap.height || 83, 100);
        bitmap.close?.();
        return Math.min(height, 100);
      }
      const url = URL.createObjectURL(file);
      try {
        const height = await new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalHeight || 83); image.onerror = () => resolve(83); image.src = url; });
        return height;
      } finally { URL.revokeObjectURL(url); }
    } catch { return 83; }
  }
  function setComposerText(text) {
    const el = document.querySelector('[contenteditable="true"].chatInput__textarea, [contenteditable="true"], textarea[id*="chat"], textarea[name*="message"], textarea');
    if (!el) throw new Error('message input not found');
    el.focus();
    if (el.isContentEditable) {
      const setter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')?.set;
      setter ? setter.call(el, text) : (el.innerText = text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } else {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter ? setter.call(el, text) : (el.value = text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function currentComposerText() {
    const el = document.querySelector('[contenteditable="true"].chatInput__textarea, [contenteditable="true"], textarea[id*="chat"], textarea[name*="message"], textarea');
    return el ? (el.isContentEditable ? el.innerText : el.value) : '';
  }
  function normalizeInfo(payload, files) {
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { /* keep original */ }
    }
    const found = [];
    const walk = value => {
      if (typeof value === 'string') {
        try { walk(JSON.parse(value)); } catch { /* ignore non-JSON strings */ }
        return;
      }
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) return value.forEach(walk);
      const hasUploadField = Object.keys(value).some(key => /upload|presign|signed|post_url|endpoint|action|policy|signature|file_id|fileId/i.test(key));
      if (hasUploadField) found.push(value);
      Object.values(value).forEach(v => { if (v && typeof v === 'object') walk(v); });
    };
    walk(payload);
    const byName = new Map(found.map(item => [String(item.name || item.filename || item.file_name || ''), item]));
    const source = payload?.result || payload?.data || payload;
    const rawTop = source?.files || source?.upload_files || source?.upload_info || source?.uploadInfo || [];
    const top = Array.isArray(rawTop) ? rawTop : (rawTop && typeof rawTop === 'object' ? (rawTop.files || rawTop.items || rawTop.list || [rawTop]) : []);
    const globalUrl = source?.upload_url || source?.uploadUrl || source?.url || '';
    return files.map((file, index) => ({ ...(byName.get(file.name) || top[index] || found[index] || {}), ...(globalUrl ? { upload_url: globalUrl } : {}) }));
  }
  async function uploadOne(file, descriptor, index) {
    const info = descriptor || {};
    const uploadUrl = info.upload_url || info.uploadUrl || info.file_upload_url || info.signed_url || info.presigned_url || info.post_url || info.endpoint || info.url || info.upload?.url || info.upload?.action || info.post?.url || info.post?.action || info.upload_data?.url || info.upload_data?.action || 'https://tky-chat-work-appdata.s3.amazonaws.com/';
    let fields = info.fields || info.form || info.form_data || info.params || info.upload_fields || info.uploadParams || info.upload?.fields || info.post?.fields || {};
    if (!Object.keys(fields).length) {
      // The preparation endpoint returns a SigV4 POST policy. Submit only
      // the fields covered by that policy; mixing legacy S3 fields changes
      // the canonical form and causes SignatureDoesNotMatch.
      const mapping = [
        ['key', info.uri || info.key],
        ['acl', info.acl],
        ['policy', info.policy],
        ['x-amz-algorithm', info['x-amz-algorithm'] || info.algorithm],
        ['x-amz-credential', info['x-amz-credential'] || info.credential],
        ['x-amz-date', info['x-amz-date'] || info.date],
        ['x-amz-signature', info['x-amz-signature'] || info.signature],
        ['x-amz-security-token', info['x-amz-security-token'] || info.security_token || info.session_token || info.auth_token],
        ['Content-Disposition', info['Content-Disposition'] || info.disposition]
      ];
      fields = Object.fromEntries(mapping.filter(([, value]) => value != null));
      fields['x-amz-server-side-encryption'] = info['x-amz-server-side-encryption'] || info.server_side_encryption || 'AES256';
      fields['Content-Type'] = info['Content-Type'] || info.content_type || info.contentType || 'application/octet-stream';
    }
    if (info.uri) fields.key = info.uri;
    else if (!fields.key && info.key) fields.key = info.key;
    if (!uploadUrl) throw new Error(`upload URL missing (${file.name}); descriptor keys: ${Object.keys(info).join(',') || '(none)'}`);
    const form = new FormData();
    Object.entries(fields || {}).forEach(([key, value]) => form.append(key, value));
    if (!form.has('file')) form.append('file', file, file.name);
    else form.set('file', file, file.name);
    const uploadResponse = await request(uploadUrl, { method: 'POST', body: form, credentials: 'omit', mode: 'cors' });
    if (!uploadResponse.ok) {
      let detail = '';
      try {
        const xml = await uploadResponse.text();
        const code = xml.match(/<Code>\s*([^<]+)\s*<\/Code>/i)?.[1];
        const message = xml.match(/<Message>\s*([^<]+)\s*<\/Message>/i)?.[1];
        detail = [code, message].filter(Boolean).join(': ');
      } catch { /* keep status only */ }
      throw new Error(`upload failed (${uploadResponse.status})${detail ? `: ${detail}` : ''}`);
    }
    let uploaded = {};
    try { uploaded = await uploadResponse.json(); } catch { /* S3 normally returns XML/empty */ }
    const fileId = info.file_id || info.fileId || info.upload_id || info.attachment_id || info.id || info.file_key || info.fileKey || info.file?.file_id || info.file?.id || uploaded.file_id || uploaded.fileId || uploaded.upload_id || uploaded.attachment_id || uploaded.id || uploaded.file?.file_id || uploaded.file?.id;
    const rid = roomId();
    const name = encodeURIComponent(file.name);
    const ext = encodeURIComponent((file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase());
    let finalId = fileId;
    if (rid && (finalId || info.key || info.uri || info.auth_token)) {
      const gateway = new URL('https://www.chatwork.com/gateway.php');
      const gatewayParams = { cmd: 'upload_file_finish', room_id: rid, myid: ownId(), file_id: finalId || info.key || info.uri || '', chatwork_room_id: rid, filename: file.name, extension: ext.replace(/^\./, ''), with_message: '0', _t: token() };
      if (info.uri) gatewayParams.key = info.uri;
      if (info.auth_token) gatewayParams.auth_token = info.auth_token;
      const gatewayBody = new URLSearchParams(gatewayParams);
      const gatewayResponse = await request(gateway, { method: 'POST', credentials: 'include', body: gatewayBody });
      if (gatewayResponse.ok) {
        const headerId = ['x-file-id', 'x-upload-id', 'x-attachment-id'].map(name => gatewayResponse.headers.get(name)).find(value => /^\d{6,}$/.test(value || ''));
        if (headerId) finalId = headerId;
        try { const raw = await gatewayResponse.text(); const result = JSON.parse(raw); const scan = value => { if (!value) return; if (typeof value === 'string') { const m = value.match(/(?:file[_-]?id|upload[_-]?id|attachment[_-]?id|"id")\D{0,8}(\d{6,})/i) || value.match(/\b\d{9,10}\b/); if (m) finalId = m[1] || m[0]; return; } if (Array.isArray(value)) return value.forEach(scan); if (typeof value === 'object') for (const [k,v] of Object.entries(value)) { if (/^(file_?id|fileId|upload_?id|attachment_?id|id|preview_?id)$/i.test(k) && (typeof v === 'number' || /^\d+$/.test(String(v)))) finalId = v; scan(v); } }; scan(result); if (!finalId) { const m = raw.match(/\b\d{9,10}\b/); if (m) finalId = m[0]; } } catch { /* continue to legacy endpoint */ }
      } else {
        throw new Error(`file registration failed (${gatewayResponse.status})`);
      }
      const finish = new URL('https://www.chatwork.com/gateway/upload_file_finish.php');
      const finishParams = { cmd: 'upload_file_finish', myid: ownId(), _v: '1.80a', _av: '5', ln: document.documentElement.lang || 'en', room_id: rid, chatwork_room_id: rid, file_id: finalId || info.uri || info.key || '', filename: file.name, extension: ext.replace(/^\./, ''), with_message: '0', message: '', _t: token() };
      if (info.uri) { finishParams.key = info.uri; finishParams.file_key = info.uri; }
      if (info.auth_token) finishParams.auth_token = info.auth_token;
      const finishBody = new URLSearchParams(finishParams);
      const finishResponse = await request(finish, { method: 'POST', credentials: 'include', body: finishBody });
      if (finishResponse.ok) {
        try {
          const text = await finishResponse.text();
          let result; try { result = JSON.parse(text); } catch { result = text; }
          const ids = [];
          const scan = value => { if (!value) return; if (typeof value === 'string') { if (/^\d{6,}$/.test(value)) ids.push(value); const matches = value.match(/(?:file[_-]?id|upload[_-]?id|attachment[_-]?id|"id")\D{0,8}(\d{6,})/ig) || []; matches.forEach(item => { const m = item.match(/(\d{6,})/); if (m) ids.push(m[1]); }); return; } if (Array.isArray(value)) return value.forEach(scan); if (typeof value === 'object') { for (const [k,v] of Object.entries(value)) { if (/^(file_?id|fileId|upload_?id|attachment_?id|id)$/i.test(k) && (typeof v === 'number' || /^\d+$/.test(String(v)))) ids.push(v); scan(v); } } };
          scan(result); if (ids.length) finalId = ids[0];
          if (!finalId) { const m = text.match(/\b\d{9,10}\b/); if (m) finalId = m[0]; }
          if (!finalId && /^\d{6,}$/.test(text.trim())) finalId = text.trim();
        } catch { /* keep descriptor id */ }
      } else if (!finalId) {
        throw new Error(`file registration failed (${finishResponse.status})`);
      }
      if (!finalId) {
        finish.search = finishBody.toString();
        const retry = await request(finish, { method: 'POST', credentials: 'include' });
        if (retry.ok) {
          const raw = await retry.text();
          if (/^\d{6,}$/.test(raw.trim())) finalId = raw.trim();
          else { const match = raw.match(/(?:file[_-]?id|upload[_-]?id|attachment[_-]?id|"id")\D{0,8}(\d{6,})/i); if (match) finalId = match[1]; }
        }
      }
    }
    if (!finalId) throw new Error(`file ID missing (${file.name})`);
    return { file, fileId: finalId };
  }
  function findNativeUploadDialog() {
    const uploadWords = /传送档案|傳送檔案|发送文件|傳送文件|传送文件|send files|upload files|ファイルを送信|파일 전송/i;
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"]')].find(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden' && uploadWords.test(el.textContent || '');
    }) || null;
  }
  function nativeUploadDialogOpen() { return Boolean(findNativeUploadDialog()); }
  async function uploadNative(files, onProgress) {
    const input = document.querySelector('#_fileInput[type="file"]');
    if (!input) throw new Error('Chatwork 原生附件控件不可用');
    const before = new Set([...document.querySelectorAll('a[href*="file_id="]')].map(a => new URL(a.href, location.origin).searchParams.get('file_id')).filter(Boolean));
    const transfer = new DataTransfer();
    files.forEach(file => transfer.items.add(file));
    input.value = '';
    input.files = transfer.files;
    if (input.files.length !== files.length) throw new Error(`原生附件控件只接收了 ${input.files.length}/${files.length} 个文件`);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    let cancelRequested = false;
    const onNativeDialogClick = event => {
      const dialog = findNativeUploadDialog();
      if (!dialog || !dialog.contains(event.target)) return;
      const control = event.target.closest('button, [role="button"], a');
      if (control && /取消|关闭|關閉|cancel|close|^×$|^x$/i.test((control.textContent || control.getAttribute('aria-label') || control.title || '').trim())) cancelRequested = true;
    };
    const onNativeDialogKey = event => { if (event.key === 'Escape' && nativeUploadDialogOpen()) cancelRequested = true; };
    document.addEventListener('click', onNativeDialogClick, true);
    document.addEventListener('keydown', onNativeDialogKey, true);

    const normalize = value => {
      try { return decodeURIComponent(value).replace(/\\_/g, '_').replace(/[\s\u00a0]+/g, ' ').toLocaleLowerCase(); }
      catch { return String(value).replace(/[\s\u00a0]+/g, ' ').toLocaleLowerCase(); }
    };
    const deadline = Date.now() + 90000;
    let result = [];
    let nativeDialogSeen = false;
    let nativeDialogClosedAt = 0;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (nativeUploadDialogOpen()) { nativeDialogSeen = true; nativeDialogClosedAt = 0; }
      else if (nativeDialogSeen && !nativeDialogClosedAt) nativeDialogClosedAt = Date.now();
      const links = [...document.querySelectorAll('a[href], [data-href]')];
      const candidatesById = new Map();
      for (const link of links) {
        const href = link.href || link.getAttribute('data-href') || '';
        let id = '';
        try { id = new URL(href, location.origin).searchParams.get('file_id') || ''; } catch { /* skip malformed href */ }
        if (!id) id = href.match(/[?&]file_id=(\d+)/i)?.[1] || '';
        if (!id || before.has(id)) continue;
        const scope = link.closest('li, [data-mid], [data-message-id], ._message, .chatMessageView') || link;
        const text = `${link.textContent || ''} ${scope.textContent || ''} ${link.getAttribute('download') || ''} ${link.getAttribute('aria-label') || ''}`;
        candidatesById.set(id, `${candidatesById.get(id) || ''} ${text}`);
      }
      const candidates = [...candidatesById].map(([id, text]) => ({ id, text }));
      const available = new Set(candidates.map(item => item.id));
      const mapped = new Map();
      for (const file of files) {
        const match = candidates.find(item => available.has(item.id) && normalize(item.text).includes(normalize(file.name)));
        if (match) { mapped.set(file, match.id); available.delete(match.id); }
      }
      const remainingFiles = files.filter(file => !mapped.has(file));
      const remainingCandidates = candidates.filter(item => available.has(item.id));
      if (remainingFiles.length && remainingFiles.length === remainingCandidates.length) {
        remainingFiles.forEach((file, index) => mapped.set(file, remainingCandidates[index].id));
      }
      result = files.filter(file => mapped.has(file)).map(file => ({ file, fileId: mapped.get(file) }));
      onProgress?.(result.length, files.length);
      if (result.length === files.length) return result;
      // A successful send also closes Chatwork's native dialog. Allow the new
      // message/file link time to render before interpreting closure as cancel.
      if (cancelRequested) {
        document.removeEventListener('click', onNativeDialogClick, true);
        document.removeEventListener('keydown', onNativeDialogKey, true);
        throw new Error('已取消原生附件上传；文件仍保留，可以重新点击“上传并插入”重试');
      }
      if (nativeDialogClosedAt && Date.now() - nativeDialogClosedAt > 10000) {
        document.removeEventListener('click', onNativeDialogClick, true);
        document.removeEventListener('keydown', onNativeDialogKey, true);
        throw new Error('已取消原生附件上传；文件仍保留，可以重新点击“上传并插入”重试');
      }
    }
    document.removeEventListener('click', onNativeDialogClick, true);
    document.removeEventListener('keydown', onNativeDialogKey, true);
    throw new Error(`原生上传后未找到全部文件 ID（${result.length}/${files.length}）`);
  }
  async function uploadToMyChat(files, onProgress) {
    const originalHash = location.hash || '';
    const originalRoom = roomId();
    const targetRoom = myRoomId();
    let resolvedTargetRoom = targetRoom;
    if (!resolvedTargetRoom) resolvedTargetRoom = await openMyChatFromAccountCard();
    if (!resolvedTargetRoom) throw new Error('未找到当前账号的“我的交谈”房间，请从右上角账号资料卡打开一次');
    if (!targetRoom || targetRoom === originalRoom) return uploadNative(files, onProgress);
    try {
      clickRoomTab(resolvedTargetRoom);
      await waitForRoom(resolvedTargetRoom);
      return await uploadNative(files, onProgress);
    } finally {
      if (originalHash && location.hash !== originalHash) {
        clickRoomTab(originalRoom);
        if (location.hash !== originalHash) location.hash = originalHash;
        if (originalRoom) {
          try { await waitForRoom(originalRoom); } catch { /* restore best effort */ }
        }
      }
    }
  }
  async function upload(files, onProgress) {
    return uploadToMyChat(files, onProgress);
    /* Legacy direct S3 flow retained below for reference. */
    /*
    const rid = roomId();
    if (!rid) throw new Error('Chatwork room not found');
    const list = files.map((file, key) => ({ key, name: file.name, size: file.size, message: '' }));
    const endpoint = new URL('/gateway/get_upload_file_info_sig_v4.php', location.origin);
    endpoint.search = new URLSearchParams({ myid: ownId(), _v: '1.80a', _av: '5', ln: document.documentElement.lang || 'en', room_id: rid }).toString();
    const body = new URLSearchParams({ pdata: JSON.stringify({ list, noredirect: true, region: 'tokyo', _t: token() }) });
    const response = await request(endpoint, { method: 'POST', body, credentials: 'include' });
    if (!response.ok) throw new Error(`upload preparation failed (${response.status})`);
    const payload = await response.json();
    const descriptors = normalizeInfo(payload, files);
    const result = [];
    for (let i = 0; i < files.length; i++) { result.push(await uploadOne(files[i], descriptors[i], i)); onProgress?.(i + 1, files.length); }
    return result; */
  }
  function render() {
    if (!state.panel) return;
    const list = state.panel.querySelector('.cw-attachment-list');
    list.replaceChildren();
    state.files.forEach((entry, index) => {
      const row = document.createElement('div'); row.className = 'cw-attachment-row';
      const label = document.createElement('span'); label.textContent = `${entry.file.name} (${formatSize(entry.file.size)})`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = I('attachment_remove', 'Remove'); remove.onclick = () => { state.files.splice(index, 1); render(); };
      row.append(label, remove); list.append(row);
    });
    state.panel.querySelector('.cw-attachment-upload').disabled = state.busy || !state.files.length;
    state.panel.querySelector('.cw-attachment-status').textContent = state.busy ? I('attachment_uploading', 'Uploading…') : state.error;
  }
  function addFiles(fileList) {
    for (const file of fileList || []) if (!state.files.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) state.files.push({ file });
    render();
  }
  function openPanel() {
    if (!state.files.length) state.error = '';
    state.panel.hidden = false;
    render();
    state.input?.focus();
  }
  function closePanel() {
    state.panel.hidden = true;
    state.files = [];
    state.error = '';
    render();
  }
  function createPanel() {
    const panel = document.createElement('section'); panel.className = 'cw-attachment-panel'; panel.hidden = true;
    panel.innerHTML = `<header><strong>${I('attachment_title', 'Add attachments')}</strong><button type="button" class="cw-attachment-close" aria-label="${I('attachment_close', 'Close')}">×</button></header><div class="cw-attachment-destination">${I('attachment_destination', 'Attachments are first sent to “My Chat”, then you are returned to the current conversation.')}</div><input class="cw-attachment-file" type="file" multiple><div class="cw-attachment-hint">${I('attachment_hint', 'Choose multiple files, or paste an image here with Ctrl+V.')}</div><div class="cw-attachment-list"></div><div class="cw-attachment-actions"><button type="button" class="cw-attachment-upload">${I('attachment_upload', 'Upload and insert')}</button><button type="button" class="cw-attachment-cancel">${I('attachment_cancel', 'Cancel')}</button></div><div class="cw-attachment-status" role="status"></div>`;
    document.body.append(panel); state.panel = panel; state.input = panel.querySelector('.cw-attachment-file');
    state.input.onchange = () => { addFiles(state.input.files); state.input.value = ''; };
    panel.querySelector('.cw-attachment-close').onclick = closePanel;
    panel.querySelector('.cw-attachment-cancel').onclick = closePanel;
    panel.addEventListener('paste', event => { const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/')); if (!image) return; event.preventDefault(); const blob = image.getAsFile(); if (blob) addFiles([new File([blob], `chatwork-paste-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: blob.type || 'image/png' })]); });
    const uploadButton = panel.querySelector('.cw-attachment-upload');
    uploadButton.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      const status = panel.querySelector('.cw-attachment-status');
      if (state.busy || !state.files.length) { if (status) status.textContent = I('attachment_no_files', 'Select at least one file.'); return; }
      state.busy = true;
      state.error = '';
      if (status) status.textContent = I('attachment_uploading', 'Uploading…');
      uploadButton.disabled = true;
      try {
        const before = currentComposerText().trim();
        const uploaded = await upload(state.files.map(item => item.file), (done, total) => { if (status) status.textContent = `${I('attachment_uploading', 'Uploading…')} ${done}/${total}`; });
        const tags = (await Promise.all(uploaded.map(async ({file, fileId}) => {
          const size = formatSize(file.size);
          const previewHeight = await imagePreviewHeight(file);
          return previewHeight ? `[info][preview id=${fileId} ht=${previewHeight}][download:${fileId}]${file.name} (${size})[/download][/info]` : `[info][download:${fileId}]${file.name} (${size})[/download][/info]`;
        }))).join('\n');
        setComposerText(before ? `${before}\n${tags}` : tags); state.files = []; closePanel();
      } catch (error) {
        state.error = `${I('attachment_failed', 'Upload failed')}: ${error?.message || error}`;
        if (status) status.textContent = state.error;
      }
      finally { state.busy = false; uploadButton.disabled = false; render(); }
    }, true);
  }
  function findComposer() { return document.querySelector('[contenteditable="true"], textarea[id*="chat"], textarea[name*="message"], textarea'); }
  function installButton() {
    if (!state.panel) createPanel();
    if (document.querySelector('.cw-attachment-open')) return;
    const native = [...document.querySelectorAll('button')].find(button => /傳送檔案|送信|ファイル|file|attachment/i.test(`${button.textContent} ${button.getAttribute('aria-label') || ''}`));
    const anchor = native || findComposer(); if (!anchor) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'cw-attachment-open'; button.textContent = '＋'; button.title = I('attachment_add', 'Add attachments'); button.setAttribute('aria-label', button.title); button.onclick = openPanel;
    state.anchor = button;
    if (native?.parentElement) native.parentElement.appendChild(button);
    else anchor.parentElement?.appendChild(button);
  }
  createPanel(); installButton(); new MutationObserver(installButton).observe(document.body, { childList: true, subtree: true });
  window.__cwAttachmentUploader = { open: openPanel, upload };
})();


