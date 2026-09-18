(() => {
  const core = ChatworkMentions;
  let days = 3, saved = {}, rid = '', identity = {}, aid = '', bar, timer, run;
  let enabled = true, target = '', targetName = '', accountKey = '';
  let items = [], groups = {to: [], re: [], send: []}, selected = {};
  let status = CW_I18N.t("ui_035"), coverage = false;
  let pendingJump;
  let threadWidth;
  let threadTranslationOnly = false;
  const controls = {}, detected = new Map();
  let resizeObserver;
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
    bar = document.createElement('div'); bar.id = 'cw-mentions';
    bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', CW_I18N.t("ui_036"));
    controls.person = document.createElement('select'); controls.person.setAttribute('aria-label', CW_I18N.t("ui_037")); bar.append(controls.person);
    controls.person.addEventListener('change', () => {
      const value = controls.person.value;
      if (value === 'custom' || value === 'self-settings') { openSettings(value === 'self-settings'); updatePeople(); return; }
      stop(); target = value; targetName = members().get(value) || ''; selected = {}; refresh();
    });
    const label = document.createElement('label'); label.textContent = CW_I18N.t("ui_038");
    const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = '365'; input.value = days;
    input.setAttribute('aria-label', CW_I18N.t("ui_039")); label.append(input, CW_I18N.t("ui_040")); bar.append(label); controls.days = input;
    input.addEventListener('change', () => {
      if (!input.checkValidity() || !input.value) { input.value = days; return; }
      stop(); days = Number(input.value); coverage = false; status = CW_I18N.t("ui_035"); selected = {};
      chrome.storage.local.set({mentionDays: days}); refresh();
    });
    controls.load = button('⟳', CW_I18N.t("ui_041"), () => run ? stop() : load()); controls.load.className = 'cw-m-refresh';
    controls.count = document.createElement('input'); controls.count.type = 'text'; controls.count.readOnly = true;
    controls.count.className = 'cw-m-counts'; controls.count.setAttribute('aria-label',CW_I18N.t("ui_042")); bar.append(controls.count);
    controls.position = document.createElement('span'); controls.position.className = 'cw-m-position'; bar.append(controls.position);
    controls.prev = button('↑', CW_I18N.t("ui_043"), () => jump('all', -1));
    controls.next = button('↓', CW_I18N.t("ui_044"), () => jump('all', 1));
    controls.prev.className = controls.next.className = 'cw-m-step';
    controls.status = document.createElement('span'); controls.status.className = 'cw-m-status'; controls.status.setAttribute('role','status'); bar.append(controls.status);
    const settings = document.createElement('div'); settings.className = 'cw-m-settings'; settings.hidden = true; bar.append(settings); controls.settings = settings;
    header.insertBefore(bar, header.querySelector('.chatRoomHeader__infoContainer'));
    resizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(entries => header.classList.toggle('cw-m-narrow', entries[0].contentRect.width < 1000));
      resizeObserver.observe(header);
    }
  }
  function updatePeople() {
    const users = members();
    if (target && !users.has(target)) users.set(target, targetName || CW_I18N.t("ui_045", [target]));
    const options = [['', CW_I18N.t("ui_046", [identity.name || CW_I18N.t("ui_047")])], ...users.entries(), ['custom', CW_I18N.t("ui_048")], ['self-settings', CW_I18N.t("ui_049")]];
    const signature = JSON.stringify(options);
    if (controls.person.dataset.options !== signature) {
      controls.person.replaceChildren(...options.map(([value, label]) => { const opt = document.createElement('option'); opt.value = value; opt.textContent = label; return opt; }));
      controls.person.dataset.options = signature;
    }
    controls.person.value = target;
    controls.person.title = target ? CW_I18N.t("ui_050", [users.get(target)]) : CW_I18N.t("ui_051", [identity.name || CW_I18N.t("ui_052")]);
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
      if (self) { saved[identity.key] = input.value.trim(); chrome.storage.local.set({mentionAccounts: saved}); target = ''; }
      else { target = input.value.trim(); targetName = members().get(target) || CW_I18N.t("ui_045", [target]); }
      panel.hidden = true; refresh();
    }, panel);
    button(CW_I18N.t("ui_061"), CW_I18N.t("ui_062"), () => panel.hidden = true, panel);
  }
  function refresh() {
    const next = core.roomId(document); const header = document.querySelector('#_roomHeader');
    if (pendingJump && (!enabled || (next && next !== pendingJump.room))) cancelPendingJump();
    if (!enabled || !next || !header) { stop(); bar?.remove(); removeRelated(); resizeObserver?.disconnect(); document.querySelectorAll('.cw-m-highlight').forEach(el => el.classList.remove('cw-m-highlight')); return; }
    if (next !== rid) { stop(); rid = next; coverage = false; status = CW_I18N.t("ui_035"); selected = {}; target = ''; controls.settings?.setAttribute('hidden',''); }
    if (!bar?.isConnected) mount(header);
    identity = core.account(document);
    if (identity.key !== accountKey) { accountKey = identity.key; target = ''; selected = {}; }
    if (identity.id) detected.set(identity.key, identity.id);
    aid = target || saved[identity.key] || identity.id || detected.get(identity.key) || '';
    updatePeople(); if (document.activeElement !== controls.days) controls.days.value = days;
    items = core.messages(document, rid); groups = core.matches(items, aid, days);
    if (pendingJump) {
      const found = items.find(m => m.id === pendingJump.id && !m.deleted);
      if (found) { cancelPendingJump(); highlight(found); }
    }
    if (coverage && !core.covered(items, Date.now() - days * 86400000)) { coverage = false; status = CW_I18N.t("ui_035"); }
    groups.all = core.union(groups);
    controls.count.value = CW_I18N.t("ui_063", [aid ? groups.all.length : '?']);
    controls.count.title = CW_I18N.t("ui_064");
    const group = groups.all, index = group.findIndex(m => m.id === selected.all);
    text(controls.position, index < 0 ? '' : `${index + 1}/${group.length}`);
    controls.prev.disabled = controls.next.disabled = !group.length || !!run;
    text(controls.load, run ? '■' : '⟳'); controls.load.disabled = !aid;
    const detail = !aid ? CW_I18N.t("ui_065") : status;
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
      chrome.storage.local.set({threadTranslationOnly}).catch(() => {});
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
  function threadWidthLimits() {
    const max = Math.min(800,Math.max(160,innerWidth-80));
    // Never expose a strip of the covered native sidebar when dragging narrower.
    const nativeWidth = thread?.host?.getBoundingClientRect().width || 260;
    return {min:Math.min(nativeWidth,max),max};
  }
  function saveThreadWidth() {
    chrome.storage.local.set({threadWidth}).catch(() => {});
  }
  function installThreadResize(state) {
    const handle = document.createElement('div'); handle.className = 'cw-m-thread-resize'; handle.tabIndex = 0;
    handle.setAttribute('role','separator'); handle.setAttribute('aria-orientation','vertical');
    handle.setAttribute('aria-label',CW_I18N.t('thread_resize')); handle.title = CW_I18N.t('thread_resize');
    state.box.append(handle); state.resizeHandle = handle;
    const resize = width => { const limits = threadWidthLimits(); threadWidth = Math.round(Math.max(limits.min,Math.min(limits.max,width))); positionThread(); };
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
  chrome.storage.local.get(['mentionDays','mentionAccounts','mentionEnabled','threadWidth','threadTranslationOnly']).then(data => {
    threadTranslationOnly = data.threadTranslationOnly === true;
    if (Number.isFinite(data.threadWidth) && data.threadWidth > 0) threadWidth = data.threadWidth;
    if (Number.isInteger(data.mentionDays) && data.mentionDays >= 1 && data.mentionDays <= 365) days = data.mentionDays;
    saved = data.mentionAccounts || {};
    enabled = data.mentionEnabled !== false;
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.threadTranslationOnly) { threadTranslationOnly = changes.threadTranslationOnly.newValue === true; syncThreadView(); }
      if (changes.mentionEnabled) { enabled = changes.mentionEnabled.newValue !== false; refresh(); }
    });
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
  });
})();
