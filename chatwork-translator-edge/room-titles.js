(() => {
  const api = globalThis.ChatworkAutoTranslation;
  let generation = 0, timer, busy = false;
  const cache = new Map();
  const decorated = new Map();
  let titleEnabled = false;
  const isEnabled = () => titleEnabled && api?.isEnabled();
  const groupIcon = root => /\/icon\//.test(root?.querySelector('img')?.getAttribute('src') || '');
  function clear() {
    for (const [node, item] of decorated) {
      item.label.remove();
      node.classList.remove('cw-room-original');
      item.host.classList.remove('cw-room-two-lines');
    }
    decorated.clear();
  }
  function candidates() {
    const items = [];
    const header = document.querySelector('.chatRoomHeader__titleContainer');
    const title = header?.querySelector('.chatRoomHeader__roomTitle');
    if (title && groupIcon(header)) items.push({node:title, host:header, header:true});
    for (const tab of document.querySelectorAll('[role="tab"][data-rid]')) {
      if (!groupIcon(tab)) continue;
      const node = Array.from(tab.querySelectorAll('p')).find(p => p.textContent.trim() === tab.getAttribute('aria-label'));
      if (node) items.push({node, host:node.parentElement, header:false});
    }
    return items.map(item => {const clone=item.node.cloneNode(true);clone.querySelectorAll('.cw-room-translation').forEach(e=>e.remove());return {...item,text:clone.textContent.trim()};}).filter(item=>item.text);
  }
  function render(item, text) {
    if (!text || text.trim() === item.text) return;
    const old = decorated.get(item.node);
    if (old?.label.isConnected && old.text === item.text) return;
    old?.label.remove();
    const label = document.createElement('span');
    label.className = item.header ? 'cw-room-translation cw-room-header-translation' : 'cw-room-translation';
    label.textContent = text;
    label.title = text;
    if (item.header) item.node.append(label);
    else {
      item.host.classList.add('cw-room-two-lines');
      item.node.classList.add('cw-room-original');
      item.host.append(label);
    }
    decorated.set(item.node, {...item, label});
  }
  async function scan() {
    if (!isEnabled() || document.hidden || busy) return;
    busy = true;
    const version = generation;
    try {
      const items = candidates();
      for (const [node, old] of decorated) {
        if (!items.some(item => item.node === node && item.text === old.text)) {
          old.label.remove(); node.classList.remove('cw-room-original');
          old.host.classList.remove('cw-room-two-lines'); decorated.delete(node);
        }
      }
      for (const item of items) {
        if (version !== generation || !isEnabled()) break;
        const rect = item.node.getBoundingClientRect();
        if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) continue;
        let entry = cache.get(item.text);
        if (!entry || entry.retryAt && entry.retryAt <= Date.now()) {
          try {
            const result = await api.translate(item.text);
            if (version !== generation) break;
            if (result?.error || (!result?.skipped && !result?.text)) throw new Error('translation unavailable');
            entry = {text:result.skipped ? '' : result.text.trim()};
          } catch {
            if (version !== generation) break;
            entry = {text:'', retryAt:Date.now() + 60000};
          }
          cache.set(item.text, entry);
          if (cache.size > 300) cache.delete(cache.keys().next().value);
        }
        if (version === generation && item.node.isConnected && item.node.textContent.replace(decorated.get(item.node)?.label.textContent||'','').trim() === item.text) render(item, entry.text);
      }
    } finally {
      busy = false;
      if (version !== generation) schedule();
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 200); }
  document.addEventListener('cw-auto-translation-state', () => {
    generation++; cache.clear(); clear(); schedule();
  });
  new MutationObserver(schedule).observe(document.body, {subtree:true, childList:true, characterData:true});
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('visibilitychange', schedule);
  let settingsRevision = 0;
  function applyTitleSetting(value) {
    titleEnabled = value !== false;
    generation++; clear(); schedule();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.roomTitleTranslationEnabled) return;
    settingsRevision++;
    applyTitleSetting(changes.roomTitleTranslationEnabled.newValue);
  });
  const revision = settingsRevision;
  chrome.storage.local.get('roomTitleTranslationEnabled').then(data => {
    if (revision === settingsRevision) applyTitleSetting(data.roomTitleTranslationEnabled);
  }).catch(() => {});
})();
