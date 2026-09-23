(() => {
  const core = ChatworkMentions;
  let days = 3, saved = {}, rid = '', identity = {}, aid = '', bar, timer, run;
  let enabled = true, target = '', targetName = '', accountKey = '';
  let items = [], groups = {to: [], re: [], send: []}, selected = {};
  let recipient = '', requireBoth = false, saveMode = 'all', saveImage = true, saveText = true, perDay = true;
  let keyword = '', keywordDraft = '';
  let caseSensitive = false, wholeWord = false;
  let historyOpen = false, historyWidth = 0, sharedPanelWidth = 0;
  let status = CW_I18N.t("ui_035"), coverage = false;
  let pendingJump;
  let threadWidth;
  let threadTranslationOnly = false;
  const controls = {}, detected = new Map();
  function extensionContextAlive() {
    try { return !!chrome?.runtime?.id && !!chrome?.storage?.local; }
    catch { return false; }
  }
  function saveSettings(values) {
    try {
      if (!extensionContextAlive()) return Promise.resolve();
      return Promise.resolve(chrome.storage.local.set(values)).catch(() => {});
    } catch { return Promise.resolve(); }
  }
  const historyLocale = (chrome.i18n?.getUILanguage?.() || navigator.language || 'zh-CN').toLowerCase();
  const historyStrings = historyLocale.startsWith('ja')
    ? ['チャット履歴','送信者','宛先','送信者と宛先の両方を含む','チャット履歴を保存','すべて','指定','画像','テキスト','日ごと','保存','閉じる','無','保存完了','保存に失敗しました','メッセージ：{count}','条件に一致するメッセージ数','ドラッグして幅を調整','キーワードを入力','検索','大文字と小文字を区別','単語全体に一致']
    : historyLocale.startsWith('ko')
      ? ['채팅 기록','보낸 사람','받는 사람','보낸 사람과 받는 사람 모두 포함','채팅 기록 저장','전체','지정','이미지','텍스트','날짜별','저장','닫기','없음','저장 완료','저장 실패','메시지: {count}','현재 필터와 일치하는 메시지 수','드래그하여 너비 조절','키워드 입력','검색','대소문자 구분','전체 단어 일치']
      : historyLocale.startsWith('en')
        ? ['Chat history','Sender','Recipient','Require both sender and recipient','Save chat history','All','Filtered','Image','Text','Split by day','Save','Close','None','Saved','Save failed','Messages: {count}','Number of messages matching the current filters','Drag to resize','Search keyword','Search','Match case','Whole word']
        : (['zh-tw','zh-hk'].some(prefix=>historyLocale.startsWith(prefix))
          ? ['聊天記錄','發信人','收信人','同時包含發信人和收信人','儲存聊天記錄','全部記錄','指定記錄','圖片','文字','按天','儲存','關閉','無','儲存完成','儲存失敗','訊息：{count}','符合目前篩選條件的訊息數','拖曳以調整寬度','輸入關鍵字','搜尋','區分大小寫','全詞符合']
          : ['聊天记录','发信人','收信人','同时包含发信人和收信人','保存聊天记录','全部记录','指定记录','图片','文本','按天','保存','关闭','无','保存完成','保存失败','消息：{count}','符合当前筛选条件的消息数','拖动调整宽度','输入关键字','搜索','区分大小写','全词匹配']);
  const ht = index => historyStrings[index];
  let resizeObserver, nativeSidebarObserver, nativeSidebarHost;
  const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  function button(label, title, fn, parent = bar) {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.title = title; el.setAttribute('aria-label', title);
    el.addEventListener('click', fn); parent.append(el); return el;
  }
  function members() {
    const users = new Map();
    for (const img of document.querySelectorAll('[data-aid] img[alt]')) {
      if (img.alt) users.set(img.closest('[data-aid]').dataset.aid, img.alt);
    }
    for (const badge of document.querySelectorAll('#_timeLine pre [data-cwtag]')) {
      const match = /^\[(?:To:|rp\s+aid=)(\d+)/i.exec(badge.dataset.cwtag);
      const sibling = badge.nextSibling;
      const name = sibling?.textContent?.split(/[\r\n]/)[0].trim();
      if (match && name && name.length <= 60 && !users.has(match[1])) users.set(match[1], name);
    }
    return users;
  }
  function mount(header) {
    const launch = button('', ht(0), () => { historyOpen = !historyOpen; bar.hidden = !historyOpen; launch.setAttribute('aria-expanded',String(historyOpen)); if(historyOpen) updatePeople(); },header);
    launch.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="currentColor"><rect x="5" y="12" width="21" height="5" rx="2.5"/><rect x="5" y="25" width="16" height="5" rx="2.5"/><rect x="5" y="38" width="21" height="5" rx="2.5"/></g><circle cx="40" cy="28" r="17" fill="none" stroke="currentColor" stroke-width="5"/><path d="M52.5 40.5 62 50" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
    controls.launch=launch;
    launch.id = 'cw-history-launch'; launch.title = ht(0); launch.setAttribute('aria-label',ht(0));
    header.insertBefore(launch, header.querySelector('.chatRoomHeader__infoContainer'));
    bar = document.createElement('aside'); bar.id = 'cw-mentions'; bar.className = 'cw-history-panel';
    bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', ht(0)); bar.hidden = true;
    const resize = document.createElement('div'); resize.className = 'cw-history-resize'; resize.title = ht(17); bar.append(resize);
    const panelHead = document.createElement('header'); panelHead.className='cw-history-head'; bar.append(panelHead);
    const heading = document.createElement('strong'); heading.textContent=ht(0); panelHead.append(heading);
    button('×',ht(11),()=>{historyOpen=false;bar.hidden=true;launch.setAttribute('aria-expanded','false');},panelHead);
    const filters = document.createElement('div'); filters.className='cw-history-filters'; bar.append(filters);
    const senderLabel=document.createElement('label');senderLabel.className='cw-history-person';senderLabel.append(document.createTextNode(ht(1)));
    controls.person=document.createElement('select');controls.person.setAttribute('aria-label',ht(1));senderLabel.append(controls.person);filters.append(senderLabel);
    controls.person.addEventListener('change',()=>{target=controls.person.value;targetName=members().get(target)||'';selected={};refresh();});
    const recipientLabel=document.createElement('label');recipientLabel.className='cw-history-person cw-history-recipient';recipientLabel.append(document.createTextNode(ht(2)));
    controls.recipient=document.createElement('select');controls.recipient.setAttribute('aria-label',ht(2));recipientLabel.append(controls.recipient);filters.append(recipientLabel);
    controls.recipient.addEventListener('change',()=>{recipient=controls.recipient.value;selected={};refresh();});
    const bothLabel=document.createElement('label');bothLabel.className='cw-history-both';
    controls.both=document.createElement('input');controls.both.type='checkbox';controls.both.checked=false;bothLabel.append(controls.both,document.createTextNode(ht(3)));filters.append(bothLabel);
    controls.both.addEventListener('change',()=>{requireBoth=controls.both.checked;selected={};refresh();});
    const searchRow=document.createElement('div');searchRow.className='cw-history-search';filters.append(searchRow);
    controls.keyword=document.createElement('input');controls.keyword.type='search';controls.keyword.value=keywordDraft;controls.keyword.placeholder=ht(18);controls.keyword.setAttribute('aria-label',ht(18));searchRow.append(controls.keyword);
    const searchOptions=document.createElement('div');searchOptions.className='cw-history-search-options';searchRow.append(searchOptions);
    const caseLabel=document.createElement('label');caseLabel.className='cw-history-search-option';controls.caseSensitive=document.createElement('input');controls.caseSensitive.type='checkbox';controls.caseSensitive.checked=false;caseLabel.append(controls.caseSensitive,document.createTextNode(ht(20)));searchOptions.append(caseLabel);
    const wordLabel=document.createElement('label');wordLabel.className='cw-history-search-option';controls.wholeWord=document.createElement('input');controls.wholeWord.type='checkbox';controls.wholeWord.checked=false;wordLabel.append(controls.wholeWord,document.createTextNode(ht(21)));searchOptions.append(wordLabel);
    controls.search=button(ht(19),ht(19),()=>applyKeywordSearch(),searchOptions);controls.search.className='cw-history-search-button';
    controls.keyword.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyKeywordSearch();}});
    const label = document.createElement('label'); label.textContent = CW_I18N.t("ui_038");
    const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = '365'; input.value = days;
    input.setAttribute('aria-label', CW_I18N.t("ui_039")); label.append(input, CW_I18N.t("ui_040")); bar.append(label); controls.days = input;
    input.addEventListener('change', () => {
      if (!input.checkValidity() || !input.value) { input.value = days; return; }
      stop(); days = Number(input.value); coverage = false; status = CW_I18N.t("ui_035"); selected = {};
      saveSettings({mentionDays: days}); refresh();
    });
    controls.load = button('⟳', CW_I18N.t("ui_041"), () => run ? stop() : load()); controls.load.className = 'cw-m-refresh';
    controls.count = document.createElement('input'); controls.count.type = 'text'; controls.count.readOnly = true;
    controls.count.className = 'cw-m-counts'; controls.count.setAttribute('aria-label',CW_I18N.t("ui_042")); bar.append(controls.count);
    controls.position = document.createElement('span'); controls.position.className = 'cw-m-position'; bar.append(controls.position);
    controls.prev = button('↑', CW_I18N.t("ui_043"), () => jump('all', -1));
    controls.next = button('↓', CW_I18N.t("ui_044"), () => jump('all', 1));
    controls.prev.className = controls.next.className = 'cw-m-step';
    controls.status = document.createElement('span'); controls.status.className = 'cw-m-status'; controls.status.setAttribute('role','status'); bar.append(controls.status);
    const nav = document.createElement('div');nav.className='cw-history-nav';bar.append(nav);
    for (const el of [label,controls.load,controls.count,controls.position,controls.prev,controls.next,controls.status]) nav.append(el);
    const saveBox=document.createElement('section');saveBox.className='cw-history-save';bar.append(saveBox);
    const saveTitle=document.createElement('strong');saveTitle.textContent=ht(4);saveBox.append(saveTitle);
    const modeLabel=document.createElement('label');modeLabel.textContent='';controls.saveMode=document.createElement('select');controls.saveMode.setAttribute('aria-label',ht(4));
    for(const [value,name] of [['all',ht(5)],['filtered',ht(6)]]){const option=document.createElement('option');option.value=value;option.textContent=name;controls.saveMode.append(option);}modeLabel.append(controls.saveMode);saveBox.append(modeLabel);
    controls.saveMode.addEventListener('change',()=>saveMode=controls.saveMode.value);
    const formats=document.createElement('div');formats.className='cw-history-formats';saveBox.append(formats);
    const imgLabel=document.createElement('label');controls.saveImage=document.createElement('input');controls.saveImage.type='checkbox';controls.saveImage.checked=true;imgLabel.append(controls.saveImage,document.createTextNode(ht(7)));formats.append(imgLabel);controls.saveImage.addEventListener('change',()=>saveImage=controls.saveImage.checked);
    const txtLabel=document.createElement('label');controls.saveText=document.createElement('input');controls.saveText.type='checkbox';controls.saveText.checked=true;txtLabel.append(controls.saveText,document.createTextNode(ht(8)));formats.append(txtLabel);controls.saveText.addEventListener('change',()=>saveText=controls.saveText.checked);
    const dayLabel=document.createElement('label');controls.perDay=document.createElement('input');controls.perDay.type='checkbox';controls.perDay.checked=true;dayLabel.append(controls.perDay,document.createTextNode(ht(9)));saveBox.append(dayLabel);controls.perDay.addEventListener('change',()=>perDay=controls.perDay.checked);
    controls.saveStatus=document.createElement('span');controls.saveStatus.className='cw-history-save-status';saveBox.append(controls.saveStatus);
    controls.saveButton=button(ht(10),ht(10),saveHistory,saveBox);
    document.body.append(bar);
    const nativeWidth=document.querySelector('#_subContent')?.getBoundingClientRect().width;
    bar.style.width=`${sharedPanelWidth||historyWidth||threadWidth||nativeWidth||340}px`;
    observeNativeSidebar();
    resize.addEventListener('pointerdown',event=>{const startX=event.clientX,startWidth=bar.getBoundingClientRect().width;const move=e=>setSharedPanelWidth(startWidth+startX-e.clientX);const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});});
    resizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(entries => header.classList.toggle('cw-m-narrow', entries[0].contentRect.width < 1000));
      resizeObserver.observe(header);
    }
  }
  function applyKeywordSearch() { keywordDraft=controls.keyword.value.trim(); keyword=keywordDraft; caseSensitive=controls.caseSensitive.checked; wholeWord=controls.wholeWord.checked; selected={}; refresh(); }
  function updatePeople() {
    const users = members();
    if (target && !users.has(target)) users.set(target, targetName || target);
    if (recipient && !users.has(recipient)) users.set(recipient, recipient);
    const options = [['', ht(12)], ...users.entries()];
    for(const select of [controls.person,controls.recipient]) {
      if(!select)continue;
      const signature=JSON.stringify(options);
      if(select.dataset.options!==signature){select.replaceChildren(...options.map(([value,name])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=name;return opt;}));select.dataset.options=signature;}
    }
    controls.person.value=target; controls.recipient.value=recipient;
  }
  function openSettings(self) {
    const panel = controls.settings; panel.replaceChildren(); panel.hidden = false;
    const info = document.createElement('div'); info.textContent = self ? CW_I18N.t("ui_053") : CW_I18N.t("ui_054"); panel.append(info);
    const label = document.createElement('label'); label.textContent = CW_I18N.t("ui_055");
    const select = document.createElement('select');
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = CW_I18N.t("ui_056"); select.append(empty);
    for (const [id, name] of members()) { const option = document.createElement('option'); option.value = id; option.textContent = `${name} (${id})`; select.append(option); }
    select.value = aid; label.append(select); panel.append(label);
    const idLabel = document.createElement('label'); idLabel.textContent = CW_I18N.t("ui_057");
    const input = document.createElement('input'); input.value = self ? (saved[identity.key] || identity.id || '') : target; input.inputMode = 'numeric'; idLabel.append(input); panel.append(idLabel);
    select.addEventListener('change', () => input.value = select.value);
    button(CW_I18N.t("ui_058"), CW_I18N.t("ui_059"), () => {
      if (!/^\d+$/.test(input.value.trim()) || (self && !identity.key)) { info.textContent = CW_I18N.t("ui_060"); return; }
      stop(); selected = {};
      if (self) { saved[identity.key] = input.value.trim(); saveSettings({mentionAccounts: saved}); target = ''; }
      else { target = input.value.trim(); targetName = members().get(target) || CW_I18N.t("ui_045", [target]); }
      panel.hidden = true; refresh();
    }, panel);
    button(CW_I18N.t("ui_061"), CW_I18N.t("ui_062"), () => panel.hidden = true, panel);
  }
  function refresh() {
    const next = core.roomId(document); const header = document.querySelector('#_roomHeader');
    if (pendingJump && (!enabled || (next && next !== pendingJump.room))) cancelPendingJump();
    if (!enabled || !next || !header) { stop(); bar?.remove(); controls.launch?.remove(); removeRelated(); resizeObserver?.disconnect(); document.querySelectorAll('.cw-m-highlight').forEach(el => el.classList.remove('cw-m-highlight')); clearKeywordHighlights(); return; }
    if (next !== rid) { stop(); rid = next; coverage = false; status = CW_I18N.t("ui_035"); selected = {}; target = ''; recipient=''; accountKey=''; keyword=''; keywordDraft=''; clearKeywordHighlights(); }
    if (!bar?.isConnected) mount(header);
    observeNativeSidebar();
    identity = core.account(document);
    if (identity.key !== accountKey) { accountKey = identity.key; target = identity.id || ''; recipient=identity.id || ''; selected = {}; }
    if (identity.id) detected.set(identity.key, identity.id);
    aid = target || saved[identity.key] || identity.id || detected.get(identity.key) || '';
    updatePeople(); if (document.activeElement !== controls.days) controls.days.value = days;
    items = core.messages(document, rid);
    const cutoff=Date.now()-days*86400000;
    const eligible=items.filter(m=>!m.deleted&&m.time>=cutoff&&m.time<=Date.now());
    const hasSender=!!target, hasRecipient=!!recipient;
    const senderMatches=m=>m.sender===target;
    const recipientMatches=m=>m.to.has(recipient)||m.re.has(recipient);
    groups={to:[],re:[],send:[]};
    const personFiltered=eligible.filter(m=>{
      if (hasSender && hasRecipient) return requireBoth
        ? senderMatches(m) && recipientMatches(m)
        : senderMatches(m) || recipientMatches(m);
      if (hasSender) return senderMatches(m);
      if (hasRecipient) return recipientMatches(m);
      return true;
    });
    groups.all=keyword?personFiltered.filter(m=>keywordRanges(originalMessageText(m)).length>0):personFiltered;
    updateKeywordHighlights(groups.all);
    groups.send=groups.all.filter(m=>target&&m.sender===target);
    groups.to=groups.all.filter(m=>recipient&&m.to.has(recipient));
    groups.re=groups.all.filter(m=>recipient&&m.re.has(recipient));
    if (pendingJump) {
      const found = items.find(m => m.id === pendingJump.id && !m.deleted);
      if (found) { cancelPendingJump(); highlight(found); }
    }
    if (coverage && !core.covered(items, Date.now() - days * 86400000)) { coverage = false; status = CW_I18N.t("ui_035"); }
    controls.count.value = ht(15).replace('{count}',groups.all.length);
    controls.count.title = ht(16);
    const group = groups.all, index = group.findIndex(m => m.id === selected.all);
    text(controls.position, index < 0 ? '' : `${index + 1}/${group.length}`);
    controls.prev.disabled = controls.next.disabled = !group.length || !!run;
    text(controls.load, run ? '■' : '⟳'); controls.load.disabled = false;
    const detail = status;
    text(controls.status, coverage ? '✓' : '•'); controls.status.dataset.complete = String(coverage);
    controls.status.title = CW_I18N.t("ui_066", [detail, days]);
    controls.status.setAttribute('aria-label', detail);
    updateRelated();
    controls.load.title = CW_I18N.t("ui_067", [run ? CW_I18N.t("ui_068") : CW_I18N.t("ui_041"), detail]);
  }
  function jump(key, direction) {
    const list = groups[key]; if (!list.length || run) return;
    let index = list.findIndex(m => m.id === selected[key]);
    if (index < 0) {
      const scroll = core.scroller(document); const middle = scroll ? scroll.getBoundingClientRect().top + scroll.clientHeight / 2 : innerHeight / 2;
      index = direction > 0 ? list.findIndex(m => m.el.getBoundingClientRect().top > middle) : list.findLastIndex(m => m.el.getBoundingClientRect().top < middle);
      if (index < 0) index = direction > 0 ? 0 : list.length - 1;
    } else index = (index + direction + list.length) % list.length;
    const message = list[index]; selected[key] = message.id;
    highlight(message); refresh();
  }
  function highlight(message) {
    cancelThreadLoad(false);
    cancelPendingJump();
    document.querySelectorAll('.cw-m-highlight').forEach(el => el.classList.remove('cw-m-highlight'));
    message.el.scrollIntoView({block:'center', behavior:'smooth'}); message.el.classList.add('cw-m-highlight');
    setTimeout(() => message.el.classList.remove('cw-m-highlight'), 2500);
  }
  function clearKeywordHighlights() {
    for(const mark of document.querySelectorAll('.cw-keyword-highlight')) { mark.replaceWith(document.createTextNode(mark.textContent||'')); mark.parentNode?.normalize(); }
  }
  function updateKeywordHighlights(messages) {
    clearKeywordHighlights();
    if(!keyword)return;
    for(const message of messages) {
      const walker=document.createTreeWalker(message.el,NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement?.closest('script,style,textarea,input,button,.cw-zh-translation,.cw-m-preview-translation,.cw-m-thread-translation')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
      const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      for(const node of nodes){const value=node.nodeValue||'',ranges=keywordRanges(value);if(!ranges.length)continue;const fragment=document.createDocumentFragment();let cursor=0;for(const range of ranges){if(range.start>cursor)fragment.append(document.createTextNode(value.slice(cursor,range.start)));const mark=document.createElement('mark');mark.className='cw-keyword-highlight';mark.textContent=value.slice(range.start,range.end);fragment.append(mark);cursor=range.end;}if(cursor<value.length)fragment.append(document.createTextNode(value.slice(cursor)));node.replaceWith(fragment);}
    }
  }
  function keywordRanges(value) {
    if(!keyword)return [];
    const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const matcher=new RegExp(escaped,`g${caseSensitive?'':'i'}u`),ranges=[];
    const isWord=char=>!!char&&/[\p{L}\p{N}_]/u.test(char);
    for(const match of value.matchAll(matcher)) {
      const start=match.index,end=start+match[0].length;
      const before=start>0?Array.from(value.slice(0,start)).at(-1):'';
      const after=end<value.length?String.fromCodePoint(value.codePointAt(end)):'';
      if(wholeWord&&(isWord(before)||isWord(after)))continue;
      ranges.push({start,end});
    }
    return ranges;
  }
  const relatedBars = new Map();
  let relatedGroups = new Map();
  let thread;
  function cancelThreadLoad(restore = true) {
    if (thread?.loading) { thread.loading.cancelled = true; thread.loading.restore = restore; }
  }
  function closeThread(restoreFocus = false) {
    if (!thread) return;
    cancelThreadLoad();
    const current = thread; thread = undefined;
    current.exportAbort?.abort();
    globalThis.ChatworkAutoTranslation?.syncThread([]);
    current.box.remove();
    current.layoutObserver?.disconnect();
    current.endResize?.();
    releaseThreadHost(current);
    for (const entry of relatedBars.values()) entry.threadButton.setAttribute('aria-expanded','false');
    if (restoreFocus && current.anchor.isConnected) current.anchor.focus({preventScroll:true});
  }
  function openThread(id, anchor) {
    if (!enabled || run) return;
    cancelPendingJump();
    closeThread();
    const box = document.createElement('aside'); box.className = 'cw-m-thread'; box.id = 'cw-m-thread';
    box.setAttribute('aria-label',CW_I18N.t('thread_title'));
    const head = document.createElement('header'); box.append(head);
    const title = document.createElement('strong'); head.append(title);
    const viewToggle = document.createElement('label'); viewToggle.className = 'cw-m-thread-view-toggle'; viewToggle.hidden = true;
    const viewText = document.createElement('span'); viewText.textContent = CW_I18N.t('thread_translation_only');
    const viewInput = document.createElement('input'); viewInput.type = 'checkbox'; viewInput.setAttribute('role','switch');
    viewInput.setAttribute('aria-label',CW_I18N.t('thread_translation_only'));
    const viewTrack = document.createElement('span'); viewTrack.className = 'cw-m-thread-switch-track'; viewTrack.setAttribute('aria-hidden','true');
    viewToggle.append(viewText,viewInput,viewTrack); head.append(viewToggle);
    viewInput.addEventListener('change',() => {
      threadTranslationOnly = viewInput.checked;
      syncThreadView();
      saveSettings({threadTranslationOnly});
    });
    const close = button('×',CW_I18N.t('thread_close'),() => closeThread(true),head);
    const exportBar = document.createElement('div'); exportBar.className = 'cw-m-thread-export'; head.insertBefore(exportBar,viewToggle);
    const copyImage = button(CW_I18N.t('thread_image_copy'),CW_I18N.t('thread_image_copy'),() => exportThreadImage('copy'),exportBar);
    const saveImage = button(CW_I18N.t('thread_image_save'),CW_I18N.t('thread_image_save'),() => exportThreadImage('save'),exportBar);
    const exportStatus = document.createElement('div'); exportStatus.className = 'cw-m-thread-export-status'; exportStatus.setAttribute('role','status'); box.append(exportStatus);
    const tools = document.createElement('div'); tools.className = 'cw-m-thread-tools'; box.append(tools);
    const status = document.createElement('span'); status.setAttribute('role','status'); tools.append(status);
    const reload = button(CW_I18N.t('thread_refresh'),CW_I18N.t('thread_refresh'),() => thread?.loading ? cancelThreadLoad() : loadThread(false),tools);
    const list = document.createElement('div'); list.className = 'cw-m-thread-list'; list.tabIndex = 0;
    list.setAttribute('aria-label',CW_I18N.t('thread_title')); box.append(list);
    document.body.append(box);
    thread = {box,title,list,anchor,room:rid,id,records:new Map(),cards:new Map(),tools,status,reload,autoAttempted:false,viewToggle,viewInput,copyImage,saveImage,exportStatus};
    syncThreadView();
    installThreadResize(thread);
    if (typeof ResizeObserver !== 'undefined') thread.layoutObserver = new ResizeObserver(positionThread);
    updateThread(); anchor.setAttribute('aria-expanded','true');
    const card = thread?.cards.get(id)?.el;
    if (card) list.scrollTop = Math.max(0,card.offsetTop-list.offsetTop-12);
    close.focus({preventScroll:true});
  }
  function syncThreadView() {
    if (!thread) return;
    const automatic = globalThis.ChatworkAutoTranslation?.isEnabled?.() === true;
    thread.viewToggle.hidden = !automatic;
    thread.viewInput.checked = threadTranslationOnly;
    thread.box.classList.toggle('cw-m-thread-only-translations',automatic && threadTranslationOnly);
  }
  document.addEventListener('cw-auto-translation-state',syncThreadView);
  async function exportThreadImage(mode) {
    const state = thread;
    if (!state || state.exporting || state.loading || run) return;
    state.exporting = true; state.exportAbort = new AbortController();
    const signal = state.exportAbort.signal;
    text(state.exportStatus,CW_I18N.t('thread_image_preparing')); updateThread();
    const png = (async () => {
      await globalThis.ChatworkAutoTranslation?.prepareThreadExport([...state.cards.values()].filter(card => state.records.get(card.el.dataset.threadMid)?.snapshot).map(card => card.el),{signal});
      if (thread !== state || core.roomId(document) !== state.room || signal.aborted) throw new DOMException('Export canceled','AbortError');
      return ThreadImageExport.capture(state.box,{signal});
    })();
    // Catch independently as clipboard permission errors may reject before the image is ready.
    png.catch(() => {});
    try {
      if (mode === 'copy') await ThreadImageExport.copy(png);
      else {
        const blob = await png;
        if (signal.aborted || thread !== state) return;
        ThreadImageExport.save(blob,`Chatwork-Thread-${state.room}-${state.id}-${new Date().toISOString().replace(/[:.]/g,'-')}.png`);
      }
      if (thread === state) text(state.exportStatus,CW_I18N.t(mode === 'copy' ? 'thread_image_copied' : 'thread_image_saved'));
    } catch (error) {
      state.exportAbort.abort();
      if (thread === state) text(state.exportStatus,error.name === 'NotAllowedError' ? CW_I18N.t('thread_image_clipboard_failed') : error.message || CW_I18N.t('thread_image_failed'));
    } finally {
      state.exporting = false;
      if (thread === state) updateThread();
    }
  }
  function releaseThreadHost(state) {
    if (!state.host) return;
    if (state.hostInert === null) state.host.removeAttribute('inert');
    else state.host.setAttribute('inert',state.hostInert);
    state.host = undefined;
  }
  function setSharedPanelWidth(width) {
    const max=Math.min(800,Math.max(300,innerWidth-80));
    sharedPanelWidth=Math.round(Math.max(300,Math.min(max,width)));
    historyWidth=threadWidth=sharedPanelWidth;
    if(bar?.isConnected)bar.style.width=`${sharedPanelWidth}px`;
    positionThread();
    saveSettings({sharedPanelWidth,historyWidth,threadWidth:sharedPanelWidth});
  }
  function threadWidthLimits() {
    const max = Math.min(800,Math.max(160,innerWidth-80));
    // Never expose a strip of the covered native sidebar when dragging narrower.
    const nativeWidth = thread?.host?.getBoundingClientRect().width || 260;
    return {min:Math.min(nativeWidth,max),max};
  }
  function saveThreadWidth() {
    saveSettings({threadWidth,historyWidth:threadWidth,sharedPanelWidth:threadWidth});
  }
  function installThreadResize(state) {
    const handle = document.createElement('div'); handle.className = 'cw-m-thread-resize'; handle.tabIndex = 0;
    handle.setAttribute('role','separator'); handle.setAttribute('aria-orientation','vertical');
    handle.setAttribute('aria-label',CW_I18N.t('thread_resize')); handle.title = CW_I18N.t('thread_resize');
    state.box.append(handle); state.resizeHandle = handle;
    const resize = width => setSharedPanelWidth(width);
    handle.addEventListener('pointerdown',event => {
      if (event.button !== 0 || thread !== state) return;
      event.preventDefault(); state.endResize?.();
      const startX = event.clientX, width = state.box.getBoundingClientRect().width;
      state.box.classList.add('cw-m-thread-resizing');
      handle.setPointerCapture?.(event.pointerId);
      const move = next => { if (next.pointerId === event.pointerId && thread === state) resize(width+startX-next.clientX); };
      const finish = next => { if (next.pointerId !== event.pointerId) return; state.endResize(); if (Number.isFinite(threadWidth)) saveThreadWidth(); };
      state.endResize = () => {
        window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',finish); window.removeEventListener('pointercancel',finish);
        if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        state.box.classList.remove('cw-m-thread-resizing'); state.endResize = undefined;
      };
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',finish); window.addEventListener('pointercancel',finish);
    });
    handle.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const limits = threadWidthLimits();
      resize(event.key === 'Home' ? limits.min : event.key === 'End' ? limits.max : state.box.getBoundingClientRect().width+(event.key === 'ArrowLeft' ? 20 : -20));
      saveThreadWidth();
    });
  }
  function threadHost() {
    const timeline = document.querySelector('#_timeLine');
    const header = document.querySelector('#_roomHeader');
    if (!timeline || !header) return;
    const chat = timeline.getBoundingClientRect(), head = header.getBoundingClientRect();
    if (chat.width <= 0 || chat.height <= 0) return;
    // Find the native right-hand column among the chat's layout siblings. This does
    // not depend on translated AI/description/task headings or generated CSS names.
    const candidates = new Set();
    for (let node = timeline; node?.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && !sibling.contains(header) && !sibling.matches('.cw-m-thread, .cw-m-preview')) candidates.add(sibling);
      }
    }
    const columns = [...candidates].map(el => ({el,rect:el.getBoundingClientRect()})).filter(({rect:r}) =>
      r.width >= 160 && r.width <= Math.min(640,innerWidth*.5) &&
      r.left >= chat.right-24 && r.left < innerWidth-100 &&
      r.top <= Math.max(head.bottom,chat.top)+64 &&
      r.bottom >= Math.min(chat.bottom,innerHeight)-80 && r.height >= 240);
    columns.sort((a,b) => Math.abs(a.rect.left-chat.right)-Math.abs(b.rect.left-chat.right) || b.rect.height-a.rect.height);
    return columns[0]?.el;
  }
  function observeNativeSidebar() {
    if(typeof ResizeObserver==='undefined')return;
    const host=document.querySelector('#_subContent')||threadHost();
    if(!host)return;
    if(nativeSidebarHost===host && host.isConnected)return;
    nativeSidebarObserver?.disconnect();nativeSidebarHost=host;
    nativeSidebarObserver=new ResizeObserver(()=>{
      const width=host.getBoundingClientRect().width;
      if(width<160)return;
      if(Math.abs(width-(bar?.getBoundingClientRect().width||0))>2 || Math.abs(width-(thread?.box.getBoundingClientRect().width||0))>2){
        sharedPanelWidth=historyWidth=threadWidth=width;
        if(bar?.isConnected)bar.style.width=`${width}px`;
        positionThread();
      }
    });
    nativeSidebarObserver.observe(host);
    const width=host.getBoundingClientRect().width;
    if(width>=160){sharedPanelWidth=historyWidth=threadWidth=width;if(bar?.isConnected)bar.style.width=`${width}px`;}
  }
  function positionThread() {
    if (!thread) return;
    const host = threadHost();
    if (thread.host !== host || !thread.layoutObserved) {
      thread.layoutObserved = true;
      releaseThreadHost(thread);
      thread.layoutObserver?.disconnect();
      thread.host = host;
      if (host) {
        thread.hostInert = host.getAttribute('inert'); host.setAttribute('inert','');
        thread.layoutObserver?.observe(host);
      }
      const header = document.querySelector('#_roomHeader'), timeline = document.querySelector('#_timeLine');
      if (header) thread.layoutObserver?.observe(header);
      if (timeline) thread.layoutObserver?.observe(timeline);
    }
    const rect = host?.getBoundingClientRect();
    const top = Math.max(0,Math.min(rect?.top ?? document.querySelector('#_roomHeader')?.getBoundingClientRect().bottom ?? 0,innerHeight-80));
    const right = Math.min(innerWidth,rect?.right ?? innerWidth), bottom = Math.min(innerHeight,rect?.bottom ?? innerHeight);
    const limits = threadWidthLimits();
    const width = Number.isFinite(threadWidth) ? Math.max(limits.min,Math.min(limits.max,threadWidth)) : rect?.width ?? Math.min(440,innerWidth);
    const left = Math.max(0,right-width);
    const style = thread.box.style;
    style.top = `${top}px`; style.left = `${left}px`; style.right = 'auto'; style.bottom = 'auto';
    style.width = `${Math.max(0,right-left)}px`; style.height = `${Math.max(80,bottom-top)}px`;
    thread.resizeHandle.setAttribute('aria-valuemin',String(limits.min)); thread.resizeHandle.setAttribute('aria-valuemax',String(limits.max));
    thread.resizeHandle.setAttribute('aria-valuenow',String(Math.round(right-left)));
  }
  async function loadThread(automatic) {
    const state = thread;
    if (!state || state.loading || run || !enabled) return;
    state.autoAttempted = true; state.loadResult = '';
    const scroll = core.scroller(document);
    const visible = items.find(m => m.el.getBoundingClientRect().bottom > (scroll?.getBoundingClientRect().top || 0));
    const reading = {hash:location.hash,id:visible?.id,offset:visible?.el.getBoundingClientRect().top,top:scroll?.scrollTop};
    const token = {cancelled:false,restore:true}; state.loading = token;
    const valid = () => !token.cancelled && thread === state && enabled && !run && core.roomId(document) === state.room;
    const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
    const interrupt = () => { token.cancelled = true; token.restore = false; };
    scroll?.addEventListener('wheel',interrupt,{passive:true}); scroll?.addEventListener('touchstart',interrupt,{passive:true});
    const onKey = event => { if (!state.box.contains(event.target) && ['PageUp','PageDown','ArrowUp','ArrowDown','Home','End',' '].includes(event.key)) interrupt(); };
    document.addEventListener('keydown',onKey);
    let moved = false;
    try {
      // Use Chatwork's existing message route; no private API, credentials, or extra permissions.
      // Counts describe discovered links, not an asserted complete server-side thread.
      for (let loaded = 0; valid() && loaded < 100; loaded++) {
        refresh();
        if (automatic && state.records.size >= 10) { state.loadResult = CW_I18N.t('thread_manual'); break; }
        const missing = [...state.records.values()].find(m => !m.snapshot);
        if (!missing) break;
        if (!canOpenMessage(missing)) break;
        moved = true;
        const hash = `#!rid${state.room}-${missing.id}`;
        if (location.hash === hash) { location.hash = `#!rid${state.room}`; await pause(50); }
        if (!valid()) break;
        location.hash = hash;
        const deadline = Date.now()+10000;
        while (valid() && Date.now() < deadline && !core.messages(document,state.room).some(m => m.id === missing.id && !m.deleted)) await pause(200);
        if (!valid()) break;
        await pause(250); refresh();
        if (!state.records.get(missing.id)?.snapshot) { state.loadResult = CW_I18N.t('thread_failed'); break; }
      }
    } finally {
      scroll?.removeEventListener('wheel',interrupt); scroll?.removeEventListener('touchstart',interrupt); document.removeEventListener('keydown',onKey);
      if (moved && token.restore && core.roomId(document) === state.room && !pendingJump && !run && (!thread || thread === state)) {
        location.hash = reading.id ? `#!rid${state.room}-${reading.id}` : reading.hash;
        // Restore the original reading position once Chatwork has put that message back.
        const deadline = Date.now()+3000;
        while (reading.id && core.roomId(document) === state.room && Date.now()<deadline && !core.messages(document,state.room).some(m => m.id === reading.id)) await pause(100);
        if (core.roomId(document) === state.room && !pendingJump && (!thread || thread === state)) {
          const current = core.scroller(document), anchor = core.messages(document,state.room).find(m => m.id === reading.id);
          if (current && anchor) current.scrollTop += anchor.el.getBoundingClientRect().top-reading.offset;
          else if (current && Number.isFinite(reading.top)) current.scrollTop = reading.top;
        }
      }
      state.loading = undefined;
      if (thread === state) updateThread();
    }
  }
  function threadSnapshot(m) {
    const el = m.el;
    let image = el.querySelector('._speaker img, [data-source="timeline_message_avatar_profile"] img');
    let name = el.querySelector('[data-testid="timeline_user-name"]')?.textContent?.trim() || image?.alt;
    // Consecutive messages can omit the sender header; use another message from the same account.
    if (!name && m.sender) {
      for (const other of items.filter(other => other.sender === m.sender && !other.deleted)) {
        const avatar = other.el.querySelector('._speaker img, [data-source="timeline_message_avatar_profile"] img');
        const candidate = other.el.querySelector('[data-testid="timeline_user-name"]')?.textContent?.trim() || avatar?.alt;
        if (candidate) { name = candidate; image = avatar; break; }
      }
    }
    let avatar = '';
    try { const url = new URL(image?.getAttribute('src') || '',location.href); if (image?.getAttribute('src') && /^https?:$/.test(url.protocol)) avatar = url.href; } catch {}
    const source = el.querySelector('pre');
    return {name:name || CW_I18N.t('ui_075'),avatar,
      time:el.querySelector('._timeStamp')?.textContent?.trim() || (Number.isFinite(m.time) && m.time > 0 ? new Date(m.time).toLocaleString() : ''),
      body:globalThis.ChatworkNames?.messageText(source) ?? source?.textContent ?? '',
      translation:el.querySelector('.cw-zh-body')?.textContent ?? null,
      label:el.querySelector('.cw-zh-label')?.textContent || CW_I18N.t('ui_076'),
      warning:el.querySelector('.cw-zh-warning')?.textContent || ''};
  }
  function updateThread() {
    if (!thread) return;
    if (!enabled || thread.room !== rid || !thread.box.isConnected) { closeThread(); return; }
    // Cache only this open chain, in memory. Virtualized messages must not disappear when the main chat scrolls.
    const candidates = new Map(thread.records);
    for (const m of items) candidates.set(m.id,{...m});
    const chain = core.related([...candidates.values()]).get(thread.id);
    if (!chain) { closeThread(); return; }
    const known = new Set(chain.map(m => m.id));
    const live = new Map(items.map(m => [m.id,m]));
    const names = globalThis.ChatworkNames?.knownNames(document) || [];
    for (const id of thread.records.keys()) if (!known.has(id)) thread.records.delete(id);
    for (const [id,card] of thread.cards) if (!known.has(id)) { card.el.remove(); thread.cards.delete(id); }
    text(thread.title,CW_I18N.t('thread_count',[chain.length]));
    for (const m of chain) {
      const source = live.get(m.id);
      const snapshot = source && !source.deleted ? threadSnapshot(source) : thread.records.get(m.id)?.snapshot;
      if (source && snapshot) snapshot.names = names;
      // Do not retain detached Chatwork elements or native reply handlers in snapshots.
      thread.records.set(m.id,{id:m.id,index:m.index,time:m.time,sender:m.sender,replies:(m.replies || []).map(ref => ({id:ref.id})),snapshot});
      const signature = JSON.stringify([snapshot,m.id === thread.id,!!run,!!thread.loading]);
      let card = thread.cards.get(m.id);
      if (!card) {
        const el = document.createElement('article'); el.className = 'cw-m-thread-message'; el.dataset.threadMid = m.id;
        card = {el}; thread.cards.set(m.id,card);
      }
      if (card.signature !== signature) {
        card.signature = signature; card.el.replaceChildren();
        card.el.classList.toggle('cw-m-thread-selected',m.id === thread.id);
        if (m.id === thread.id) card.el.setAttribute('aria-current','true'); else card.el.removeAttribute('aria-current');
        const author = document.createElement('div'); author.className = 'cw-m-preview-author';
        if (snapshot?.avatar) { const img = document.createElement('img'); img.src = snapshot.avatar; img.alt = ''; author.append(img); }
        const name = document.createElement('strong'); name.textContent = snapshot?.name || CW_I18N.t('ui_075'); author.append(name);
        const time = document.createElement('span'); time.textContent = snapshot?.time || ''; author.append(time); card.el.append(author);
        const body = document.createElement('div'); body.className = 'cw-m-preview-text cw-m-thread-source';
        body.textContent = snapshot?.body ?? CW_I18N.t('ui_074'); card.el.append(body);
        if (!globalThis.ChatworkAutoTranslation && snapshot?.translation !== null && snapshot?.translation !== undefined) {
          const translation = document.createElement('div'); translation.className = 'cw-m-preview-translation';
          const label = document.createElement('strong'); label.textContent = snapshot.label;
          const content = document.createElement('div'); content.className = 'cw-m-preview-text'; content.textContent = snapshot.translation;
          translation.append(label,content);
          if (snapshot.warning) { const warning = document.createElement('p'); warning.className = 'cw-m-thread-warning'; warning.textContent = snapshot.warning; translation.append(warning); }
          card.el.append(translation);
        }
        const go = button(CW_I18N.t('ui_077'),CW_I18N.t('thread_goto'),() => {
          if (!enabled || run || !thread || thread.loading || thread.room !== rid) return;
          const destination = core.messages(document,rid).find(item => item.id === m.id && !item.deleted);
          if (destination) highlight(destination); else openMessageLink(m.id);
        },card.el);
        go.disabled = !!run || !!thread.loading || !canOpenMessage(m);
      }
    }
    // Reconcile in place so translation updates do not reset scrolling or button focus.
    chain.forEach((m,index) => { const el = thread.cards.get(m.id).el; if (thread.list.children[index] !== el) thread.list.insertBefore(el,thread.list.children[index] || null); });
    globalThis.ChatworkAutoTranslation?.syncThread(chain.flatMap(m => {
      const snapshot = thread.records.get(m.id)?.snapshot;
      return snapshot ? [{element:thread.cards.get(m.id).el,text:snapshot.body,names:snapshot.names || names}] : [];
    }));
    positionThread();
    const missing = [...thread.records.values()].filter(m => !m.snapshot).length;
    thread.tools.hidden = missing === 0;
    if (!missing) thread.loadResult = '';
    text(thread.status,!missing ? '' : thread.loading ? CW_I18N.t('thread_loading',[missing]) : thread.loadResult || (chain.length >= 10 ? CW_I18N.t('thread_manual') : CW_I18N.t('thread_missing',[missing])));
    text(thread.reload,CW_I18N.t(thread.loading ? 'thread_stop' : 'thread_refresh'));
    thread.reload.setAttribute('aria-label',thread.reload.textContent);
    thread.reload.disabled = !!run;
    thread.copyImage.disabled = thread.saveImage.disabled = !!run || !!thread.loading || !!thread.exporting;
    if (thread.exporting) thread.reload.disabled = true;
    if (!thread.autoAttempted && !thread.loading && !run) {
      thread.autoAttempted = true;
      if (missing && chain.length < 10) { const state = thread; queueMicrotask(() => { if (thread === state) loadThread(true); }); }
    }
  }
  function relatedDestination(id,direction) {
    const chain = relatedGroups.get(id);
    return chain?.[chain.findIndex(node => node.id === id)+direction];
  }
  document.addEventListener('keydown',event => { if (event.key === 'Escape' && thread) { event.preventDefault(); closeThread(true); } });
  window.addEventListener('resize',positionThread);
  function removeRelated() {
    closeThread();
    for (const entry of relatedBars.values()) entry.bar.remove();
    relatedBars.clear(); relatedGroups.clear();
  }
  function updateRelated() {
    relatedGroups = core.related(items);
    const live = new Set(items.filter(m => !m.deleted).map(m => m.el));
    for (const [el,entry] of relatedBars) if (!el.isConnected || !live.has(el) || el.dataset.mid !== entry.id) {
      entry.bar.remove(); relatedBars.delete(el);
    }
    for (const m of items) {
      const chain = relatedGroups.get(m.id), body = m.el.querySelector('pre');
      if (m.deleted || !body || !chain) continue;
      let entry = relatedBars.get(m.el);
      if (!entry) {
        const box = document.createElement('div'); box.className = 'cw-m-related'; box.setAttribute('role','group'); box.setAttribute('aria-label',CW_I18N.t("ui_079"));
        entry = {bar:box,id:m.id};
        entry.label = document.createElement('span'); entry.label.className = 'cw-m-related-label'; box.append(entry.label);
        entry.prev = button('↑',CW_I18N.t("ui_071"), () => jumpRelated(m.id,-1),box);
        entry.threadButton = button('Thread',CW_I18N.t('thread_open'),() => openThread(m.id,entry.threadButton),box);
        entry.threadButton.className = 'cw-m-thread-open'; entry.threadButton.setAttribute('aria-controls','cw-m-thread'); entry.threadButton.setAttribute('aria-expanded','false');
        entry.next = button('↓',CW_I18N.t("ui_072"), () => jumpRelated(m.id,1),box);
        relatedBars.set(m.el,entry);
      }
      const authorRow = m.el.querySelector('[data-testid="timeline_user-name"]')?.parentElement?.parentElement;
      if (authorRow && authorRow !== body.parentElement && body.parentElement.contains(authorRow) && !authorRow.closest('pre')) {
        if (entry.bar.parentElement !== authorRow) authorRow.append(entry.bar);
        entry.bar.classList.add('cw-m-related-inline');
      } else {
        entry.bar.classList.remove('cw-m-related-inline');
        if (entry.bar.nextElementSibling !== body) body.before(entry.bar);
      }
      const index = chain.findIndex(node => node.id === m.id);
      const missing = chain.some(node => node.missing);
      const empty = chain.length < 2;
      text(entry.label, empty ? CW_I18N.t("ui_083") : CW_I18N.t("ui_084", [index+1, chain.length]));
      entry.threadButton.disabled = empty || !!run;
      entry.threadButton.setAttribute('aria-expanded',String(thread?.id === m.id && thread.room === rid));
      entry.label.title = empty ? CW_I18N.t("ui_085") : CW_I18N.t("ui_086", [missing ? CW_I18N.t("ui_087") : CW_I18N.t("ui_088")]);
      const canJump = canOpenMessage;
      entry.prev.hidden = entry.next.hidden = entry.threadButton.hidden = empty;
      entry.prev.disabled = !!run || !canJump(chain[index-1]);
      entry.next.disabled = !!run || !canJump(chain[index+1]);
    }
    updateThread();
  }
  function jumpRelated(id,direction) {
    if (!enabled || run) return;
    const destination = relatedDestination(id,direction);
    if (!destination) return;
    if (!canOpenMessage(destination)) return;
    if (destination.el?.isConnected && !destination.deleted) highlight(destination);
    else openMessageLink(destination.id);
  }
  function canOpenMessage(node) {
    return !!node && /^\d+$/.test(node.id) && /^\d+$/.test(rid);
  }
  function cancelPendingJump() {
    if (!pendingJump) return;
    clearTimeout(pendingJump.timeout); clearTimeout(pendingJump.retry); pendingJump = undefined;
  }
  function openMessageLink(id) {
    cancelThreadLoad(false);
    cancelPendingJump();
    const request = {room:rid,id}; pendingJump = request;
    const hash = `#!rid${request.room}-${id}`;
    request.timeout = setTimeout(() => {
      if (pendingJump !== request) return;
      cancelPendingJump(); status = CW_I18N.t("ui_089"); refresh();
    },15000);
    // Re-enter the message route when scrolling has unloaded a previously visited target.
    if (location.hash === hash) {
      location.hash = `#!rid${request.room}`;
      request.retry = setTimeout(() => {
        if (pendingJump === request && enabled && core.roomId(document) === request.room) location.hash = hash;
      },50);
    } else location.hash = hash;
  }
  function stop() { if (run) { run.cancelled = true; status = CW_I18N.t("ui_090"); } }
  const dateKey = time => { const d=new Date(time); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; };
  function safeFile(value) { return String(value||'Chatwork').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,120)||'Chatwork'; }
  function originalMessageText(message) {
    const source=message.el.querySelector('pre');
    if(!source)return '';
    const copy=source.cloneNode(true);
    copy.querySelectorAll('.cw-zh-translation,.cw-m-preview-translation,.cw-m-thread-translation').forEach(node=>node.remove());
    return globalThis.ChatworkNames?.messageText(copy)??copy.textContent??'';
  }
  async function saveHistory() {
    if (controls.saveButton?.disabled) return;
    if (!saveImage&&!saveText) { text(controls.saveStatus,historyLocale.startsWith('en')?'Choose at least one format':historyLocale.startsWith('ja')?'画像またはテキストを選択してください':historyLocale.startsWith('ko')?'이미지 또는 텍스트 형식을 선택하세요':'请至少选择图片或文本格式'); return; }
    if (!window.showDirectoryPicker) { text(controls.saveStatus,historyLocale.startsWith('en')?'This browser cannot choose a save folder':historyLocale.startsWith('ja')?'保存先フォルダーを選択できません':historyLocale.startsWith('ko')?'저장 폴더를 선택할 수 없습니다':'当前浏览器不支持选择保存目录'); return; }
    let directory;
    try { directory=await window.showDirectoryPicker({mode:'readwrite'}); }
    catch(error) { if(error.name!=='AbortError')text(controls.saveStatus,error.message||'无法打开保存目录'); return; }
    const previousLabel=controls.saveButton?.textContent;
    if(controls.saveButton)controls.saveButton.disabled=true;
    const progress=message=>{controls.saveStatus.textContent=message;};
    const loading=historyLocale.startsWith('en')?'Checking and loading chat history…':historyLocale.startsWith('ja')?'チャット履歴を確認して読み込んでいます…':historyLocale.startsWith('ko')?'채팅 기록을 확인하고 불러오는 중…':'正在检查并加载聊天记录…';
    try {
    progress(loading);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if (!coverage || !core.covered(items,Date.now()-days*86400000)) {
      await load();
      refresh();
      if (!coverage) { progress(historyLocale.startsWith('en')?'Chat history is not fully loaded. Check loading status and try again':historyLocale.startsWith('ja')?'履歴がすべて読み込まれていません。読み込み状況を確認して再試行してください':historyLocale.startsWith('ko')?'채팅 기록이 모두 로드되지 않았습니다. 로드 상태를 확인한 후 다시 시도하세요':'聊天记录尚未完整加载；请查看上方加载状态后重试'); return; }
    }
    const cutoff=Date.now()-days*86400000;
    const records=items.filter(m=>!m.deleted&&m.time>=cutoff&&m.time<=Date.now()).filter(m=>saveMode==='all'||groups.all.some(match=>match.id===m.id));
    if (!records.length) { controls.saveStatus.textContent=historyLocale.startsWith('en')?'No messages match the filters':historyLocale.startsWith('ja')?'条件に一致するメッセージがありません':historyLocale.startsWith('ko')?'필터에 일치하는 메시지가 없습니다':'筛选范围内没有消息'; return; }
    const room=safeFile(document.querySelector('#_roomTitle')?.textContent?.trim()||`Chatwork-${rid}`);
    const from=dateKey(cutoff),to=dateKey(Date.now());
    const batches=perDay?new Map([...new Set(records.map(m=>dateKey(m.time)))].sort().map(day=>[day,records.filter(m=>dateKey(m.time)===day)])) : new Map([[`${from}-${to}`,records]]);
    const write=async(name,blob)=>{const handle=await directory.getFileHandle(name,{create:true});const writable=await handle.createWritable();await writable.write(blob);await writable.close();};
    try {
      let completed=0;
      for(const [period,batch] of batches) {
        progress(historyLocale.startsWith('en')?`Saving ${period}…`:historyLocale.startsWith('ja')?`${period} を保存中…`:historyLocale.startsWith('ko')?`${period} 저장 중…`:`正在保存 ${period}…`);
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const base=safeFile(saveMode==='all'?`${room} (${period})`:`${room} 指定记录 (${period})`);
        if(saveText) {
          const output=batch.map(m=>{const body=originalMessageText(m);const avatar=m.el.querySelector('._speaker img,[data-source="timeline_message_avatar_profile"] img');const sender=m.el.querySelector('[data-testid="timeline_user-name"]')?.textContent?.trim()||avatar?.alt||'未知发信人';const recipients=[...m.to].map(id=>`TO:${members().get(id)||id}`).concat([...m.re].map(id=>`RE:${members().get(id)||id}`)).join(' ');return `${sender}  ${new Date(m.time).toLocaleString()}\n${recipients}\n${body}`;}).join('\n\n---------------------------------------\n\n');
          await write(`${base}.txt`,new Blob([output],{type:'text/plain;charset=utf-8'}));completed++;
        }
        if(saveImage) {
          const capture=document.createElement('div');capture.className='cw-history-capture';
          const title=document.createElement('h2');title.textContent=`${room} (${period})`;capture.append(title);
          const cards=document.createDocumentFragment();
          for(const m of batch){const card=document.createElement('article');const avatar=m.el.querySelector('._speaker img,[data-source="timeline_message_avatar_profile"] img');const author=m.el.querySelector('[data-testid="timeline_user-name"]')?.textContent?.trim()||avatar?.alt||'未知发信人';const head=document.createElement('header');head.textContent=`${author}　${new Date(m.time).toLocaleString()}`;card.append(head);const body=document.createElement('pre');body.textContent=originalMessageText(m);card.append(body);cards.append(card);}
          capture.append(cards);
          document.body.append(capture);
          try {
            await new Promise(resolve=>requestAnimationFrame(resolve));
            const width=Math.ceil(capture.getBoundingClientRect().width);
            const height=Math.ceil(capture.scrollHeight);
            capture.style.cssText=`position:fixed!important;left:-100000px!important;top:0!important;display:block!important;box-sizing:border-box!important;width:${width}px!important;height:${height}px!important;min-height:0!important;max-height:none!important;overflow:hidden!important;padding:12px!important;background:#f5f9fa!important;color:#31556f!important;font:14px/1.6 system-ui,sans-serif!important;`;
            const canvas=await html2canvas(capture,{width,height,windowWidth:width,windowHeight:height,backgroundColor:'#f5f9fa',scale:1,useCORS:true,allowTaint:false,logging:false,scrollX:0,scrollY:0,onclone:doc=>{
              const root=doc.querySelector('.cw-history-capture');
              if(!root)return;
              root.style.cssText=`position:absolute!important;left:0!important;top:0!important;display:block!important;box-sizing:border-box!important;width:${width}px!important;height:${height}px!important;min-height:0!important;max-height:none!important;overflow:hidden!important;padding:12px!important;background:#f5f9fa!important;color:#31556f!important;font:14px/1.6 system-ui,sans-serif!important;`;
              root.querySelectorAll('h2').forEach(el=>el.style.cssText='display:block!important;box-sizing:border-box!important;width:100%!important;margin:0 0 12px!important;padding:4px 2px 10px!important;border-bottom:1px solid #dbe6e9!important;font-size:17px!important;');
              root.querySelectorAll('article').forEach(el=>el.style.cssText='display:block!important;box-sizing:border-box!important;width:100%!important;min-height:0!important;padding:12px 14px!important;margin:0 0 10px!important;background:#fff!important;border:1px solid #dbe6e9!important;border-radius:7px!important;overflow-wrap:anywhere!important;');
              root.querySelectorAll('article header').forEach(el=>el.style.cssText='display:block!important;margin:0 0 8px!important;font-weight:700!important;color:#467398!important;');
              root.querySelectorAll('article pre').forEach(el=>el.style.cssText='display:block!important;box-sizing:border-box!important;width:100%!important;min-height:0!important;margin:0!important;padding:10px!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;background:#eef7f4!important;border-left:3px solid #24a797!important;font:inherit!important;');
            }});
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;if(!blob)throw new Error('图片生成失败');await write(`${base}.png`,blob);completed++;
          }
          finally {capture.remove();}
        }
      }
      progress(`${ht(13)} (${completed})`);
    } catch(error) { progress(`${ht(14)}: ${error.message||error}`); }
    } finally {
      if(controls.saveButton){controls.saveButton.disabled=false;controls.saveButton.textContent=previousLabel||ht(10);}
    }
  }
  async function load() {
    cancelThreadLoad(false);
    cancelPendingJump();
    const scroll = core.scroller(document); if (!scroll) { status = CW_I18N.t("ui_091"); refresh(); return; }
    const token = {cancelled:false, rid}; run = token; coverage = false;
    const cutoff = Date.now() - days * 86400000;
    const anchor = items.find(m => m.el.getBoundingClientRect().bottom > scroll.getBoundingClientRect().top);
    const offset = anchor?.el.getBoundingClientRect().top; const originalTop = scroll.scrollTop;
    const interrupted = () => stop();
    scroll.addEventListener('wheel', interrupted, {passive:true}); scroll.addEventListener('touchstart', interrupted, {passive:true});
    const onKey = e => { if (['Escape','PageUp','PageDown','ArrowUp','ArrowDown','Home','End',' '].includes(e.key)) stop(); };
    document.addEventListener('keydown', onKey);
    document.documentElement.dataset.cwHistoryLoading = '1';
    const valid = () => !token.cancelled && core.roomId(document) === token.rid;
    const pause = () => new Promise(resolve => setTimeout(resolve, 1000));
    try {
      status = CW_I18N.t("ui_092"); refresh();
      // First establish the newest end; a message-link view may start in the middle.
      let stable = 0, last = '';
      for (let i = 0; i < 12 && valid() && stable < 2; i++) {
        scroll.scrollTop = scroll.scrollHeight; await pause();
        const snapshot = core.messages(document, rid).map(m => m.id).join(',');
        stable = snapshot === last ? stable + 1 : 0; last = snapshot;
      }
      if (!valid()) return;
      if (stable < 2 || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 2) { status = CW_I18N.t("ui_093"); return; }
      let stalls = 0;
      for (let page = 0; page < 120 && valid(); page++) {
        items = core.messages(document, rid);
        if (core.covered(items, cutoff)) { coverage = true; status = CW_I18N.t("ui_094"); break; }
        status = CW_I18N.t("ui_095", [items.length]); refresh();
        const before = items.map(m => m.id).join(',');
        scroll.scrollTop = 1; scroll.dispatchEvent(new Event('scroll')); scroll.scrollTop = 0;
        scroll.dispatchEvent(new Event('scroll')); await pause();
        if (!valid()) break;
        const after = core.messages(document, rid).map(m => m.id).join(',');
        stalls = before === after ? stalls + 1 : 0;
        if (stalls >= 5) { status = CW_I18N.t("ui_096"); break; }
        if (page === 119) status = CW_I18N.t("ui_097");
      }
    } catch { status = CW_I18N.t("ui_098"); }
    finally {
      scroll.removeEventListener('wheel', interrupted); scroll.removeEventListener('touchstart', interrupted); document.removeEventListener('keydown', onKey);
      if (core.roomId(document) === token.rid && !token.cancelled) {
        if (anchor?.el.isConnected) scroll.scrollTop += anchor.el.getBoundingClientRect().top - offset;
        else scroll.scrollTop = originalTop;
      }
      run = undefined; delete document.documentElement.dataset.cwHistoryLoading;
      document.dispatchEvent(new Event('cw-history-finished')); refresh();
    }
  }
  try { if (!extensionContextAlive()) return; } catch { return; }
  Promise.resolve().then(() => chrome.storage.local.get(['mentionDays','mentionAccounts','mentionEnabled','threadWidth','threadTranslationOnly','historyWidth','sharedPanelWidth'])).then(data => {
    threadTranslationOnly = data.threadTranslationOnly === true;
    if (Number.isFinite(data.threadWidth) && data.threadWidth > 0) threadWidth = data.threadWidth;
    if (Number.isFinite(data.historyWidth) && data.historyWidth >= 300) historyWidth = data.historyWidth;
    sharedPanelWidth=Number.isFinite(data.sharedPanelWidth)&&data.sharedPanelWidth>=300?data.sharedPanelWidth:(historyWidth||threadWidth||0);
    if(sharedPanelWidth){historyWidth=threadWidth=sharedPanelWidth;}
    if (Number.isInteger(data.mentionDays) && data.mentionDays >= 1 && data.mentionDays <= 365) days = data.mentionDays;
    saved = data.mentionAccounts || {};
    enabled = data.mentionEnabled !== false;
    try { chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.threadTranslationOnly) { threadTranslationOnly = changes.threadTranslationOnly.newValue === true; syncThreadView(); }
      if (changes.mentionEnabled) { enabled = changes.mentionEnabled.newValue !== false; refresh(); }
    }); } catch { /* Extension may have been reloaded while this page was open. */ }
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; refresh(); }, 200);
    };
    new MutationObserver(records => {
      if (records.every(r => {
        const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        return el?.closest('#cw-mentions, .cw-m-related, .cw-m-preview, .cw-m-thread') || (!thread && el?.closest('.cw-zh-translation'));
      })) return;
      scheduleRefresh();
    }).observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['data-rid','data-roomid','data-mid','data-index','data-tm','data-deleted','data-cwtag']});
    document.addEventListener('scroll', scheduleRefresh, {capture:true, passive:true});
    window.addEventListener('hashchange', refresh); setInterval(refresh, 30000); refresh();
  }).catch(() => {});
})();
