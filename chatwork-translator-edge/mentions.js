(() => {
  const core = ChatworkMentions;
  let days = 3, saved = {}, rid = '', identity = {}, aid = '', bar, timer, run;
  let enabled = true, target = '', targetName = '', accountKey = '';
  let items = [], groups = {to: [], re: [], send: []}, selected = {};
  let status = CW_I18N.t("ui_035"), coverage = false;
  let pendingJump;
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
    cancelPendingJump();
    closePreview();
    document.querySelectorAll('.cw-m-highlight').forEach(el => el.classList.remove('cw-m-highlight'));
    message.el.scrollIntoView({block:'center', behavior:'smooth'}); message.el.classList.add('cw-m-highlight');
    setTimeout(() => message.el.classList.remove('cw-m-highlight'), 2500);
  }
  const relatedBars = new Map();
  let relatedGroups = new Map();
  let preview;
  function closePreview(restoreFocus = false) {
    if (!preview) return;
    const current = preview; preview = undefined; current.box.remove();
    current.anchor.setAttribute('aria-expanded','false');
    if (restoreFocus && current.anchor.isConnected) current.anchor.focus({preventScroll:true});
  }
  function relatedDestination(id,direction) {
    const chain = relatedGroups.get(id);
    return chain?.[chain.findIndex(node => node.id === id)+direction];
  }
  function previewRelated(id,direction,anchor) {
    if (!enabled || run) return;
    const destination = relatedDestination(id,direction); if (!destination) return;
    closePreview();
    const box = document.createElement('section'); box.className = 'cw-m-preview';
    box.setAttribute('role','dialog'); box.setAttribute('aria-label',direction < 0 ? CW_I18N.t("ui_069") : CW_I18N.t("ui_070"));
    const head = document.createElement('header'); box.append(head);
    const title = document.createElement('strong'); title.textContent = direction < 0 ? CW_I18N.t("ui_071") : CW_I18N.t("ui_072"); head.append(title);
    const close = button('×',CW_I18N.t("ui_073"),() => closePreview(true),head);
    const content = document.createElement('div'); content.className = 'cw-m-preview-content'; content.tabIndex = 0; box.append(content);
    if (destination.missing || !destination.el?.isConnected) {
      const note = document.createElement('p'); note.textContent = CW_I18N.t("ui_074"); content.append(note);
    } else {
      const el = destination.el;
      const author = document.createElement('div'); author.className = 'cw-m-preview-author';
      const sourceImage = el.querySelector('._speaker img');
      if (sourceImage?.getAttribute('src')?.startsWith('https://')) {
        const image = document.createElement('img'); image.src = sourceImage.getAttribute('src'); image.alt = ''; author.append(image);
      }
      const name = document.createElement('strong'); name.textContent = el.querySelector('[data-testid="timeline_user-name"]')?.textContent || sourceImage?.alt || CW_I18N.t("ui_075"); author.append(name);
      const time = document.createElement('span'); time.textContent = el.querySelector('._timeStamp')?.textContent || ''; author.append(time); content.append(author);
      const body = document.createElement('div'); body.className = 'cw-m-preview-text';
      const source = el.querySelector('pre');
      body.textContent = globalThis.ChatworkNames?.messageText(source) ?? source?.textContent ?? ''; content.append(body);
      const translated = el.querySelector('.cw-zh-body');
      if (translated) {
        const translation = document.createElement('div'); translation.className = 'cw-m-preview-translation';
        const label = document.createElement('strong'); label.textContent = el.querySelector('.cw-zh-label')?.textContent || CW_I18N.t("ui_076");
        const text = document.createElement('div'); text.className = 'cw-m-preview-text'; text.textContent = translated.textContent;
        translation.append(label,text); content.append(translation);
      }
    }
    const foot = document.createElement('footer'); box.append(foot);
    const go = button(CW_I18N.t("ui_077"),CW_I18N.t("ui_078"),() => { closePreview(); jumpRelated(id,direction); },foot);
    go.disabled = !canOpenMessage(destination);
    preview = {box,anchor,room:rid,source:id,direction,destination:destination.id};
    anchor.setAttribute('aria-expanded','true'); document.body.append(box);
    const rect = anchor.getBoundingClientRect(), width = box.getBoundingClientRect().width, height = box.getBoundingClientRect().height;
    const right = rect.right + 8;
    const left = right + width <= innerWidth - 8 ? right : rect.left - width - 8 >= 8 ? rect.left - width - 8 : rect.left;
    box.style.left = `${Math.max(8,Math.min(left,innerWidth-width-8))}px`;
    box.style.top = `${Math.max(8,Math.min(rect.top,innerHeight-height-8))}px`;
    close.focus({preventScroll:true});
  }
  document.addEventListener('pointerdown',event => {
    if (preview && !preview.box.contains(event.target) && event.target !== preview.anchor) closePreview();
  });
  document.addEventListener('keydown',event => { if (event.key === 'Escape' && preview) { event.preventDefault(); closePreview(true); } });
  document.addEventListener('scroll',event => { if (preview && !preview.box.contains(event.target)) closePreview(); }, {capture:true,passive:true});
  window.addEventListener('resize',() => closePreview());
  function removeRelated() {
    closePreview();
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
        entry.label = document.createElement('span'); box.append(entry.label);
        entry.prev = button('↑',CW_I18N.t("ui_071"), () => jumpRelated(m.id,-1),box);
        entry.prevPreview = button(CW_I18N.t("ui_080"),CW_I18N.t("ui_081"), () => previewRelated(m.id,-1,entry.prevPreview),box);
        entry.next = button('↓',CW_I18N.t("ui_072"), () => jumpRelated(m.id,1),box);
        entry.nextPreview = button(CW_I18N.t("ui_080"),CW_I18N.t("ui_082"), () => previewRelated(m.id,1,entry.nextPreview),box);
        for (const btn of [entry.prevPreview,entry.nextPreview]) { btn.setAttribute('aria-haspopup','dialog'); btn.setAttribute('aria-expanded','false'); }
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
      entry.label.title = empty ? CW_I18N.t("ui_085") : CW_I18N.t("ui_086", [missing ? CW_I18N.t("ui_087") : CW_I18N.t("ui_088")]);
      const canJump = canOpenMessage;
      entry.prev.hidden = entry.next.hidden = empty;
      entry.prevPreview.hidden = entry.nextPreview.hidden = empty;
      entry.prev.disabled = !!run || !canJump(chain[index-1]);
      entry.next.disabled = !!run || !canJump(chain[index+1]);
      entry.prevPreview.disabled = !!run || !chain[index-1];
      entry.nextPreview.disabled = !!run || !chain[index+1];
    }
    if (preview && (preview.room !== rid || !preview.anchor.isConnected || relatedDestination(preview.source,preview.direction)?.id !== preview.destination)) closePreview();
  }
  function jumpRelated(id,direction) {
    if (!enabled || run) return;
    const destination = relatedDestination(id,direction);
    if (!destination) return;
    if (!canOpenMessage(destination)) return;
    closePreview();
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
    cancelPendingJump();
    closePreview();
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
  chrome.storage.local.get(['mentionDays','mentionAccounts','mentionEnabled']).then(data => {
    if (Number.isInteger(data.mentionDays) && data.mentionDays >= 1 && data.mentionDays <= 365) days = data.mentionDays;
    saved = data.mentionAccounts || {};
    enabled = data.mentionEnabled !== false;
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.mentionEnabled) { enabled = changes.mentionEnabled.newValue !== false; refresh(); }
    });
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; refresh(); }, 200);
    };
    new MutationObserver(records => {
      if (records.every(r => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('#cw-mentions, .cw-m-related, .cw-m-preview, .cw-zh-translation'))) return;
      scheduleRefresh();
    }).observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['data-rid','data-roomid','data-mid','data-index','data-tm','data-deleted','data-cwtag']});
    document.addEventListener('scroll', scheduleRefresh, {capture:true, passive:true});
    window.addEventListener('hashchange', refresh); setInterval(refresh, 30000); refresh();
  });
})();
