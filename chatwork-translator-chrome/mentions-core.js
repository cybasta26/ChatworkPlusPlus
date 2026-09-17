(() => {
  function roomId(doc) {
    return doc.querySelector('#_roomTitle [data-roomid]')?.dataset.roomid || '';
  }
  function account(doc) {
    const menu = doc.querySelector('[data-testid="global-header_account-menu_menu-button"]');
    if (!menu) return {key: '', name: '', id: ''};
    const name = menu.textContent.trim();
    const avatar = menu.querySelector('img')?.getAttribute('src') || '';
    const ids = new Set();
    for (const img of doc.querySelectorAll('[data-aid] img[alt]')) {
      if (img.alt === name && img.getAttribute('src') === avatar) ids.add(img.closest('[data-aid]').dataset.aid);
    }
    return {key: `${name}|${avatar}`, name, id: ids.size === 1 ? [...ids][0] : ''};
  }
  function messages(doc, rid) {
    const seen = new Set();
    const result = [];
    for (const el of doc.querySelectorAll('#_timeLine ._message')) {
      if (el.dataset.rid !== rid || seen.has(el.dataset.mid)) continue;
      seen.add(el.dataset.mid);
      const time = Number(el.querySelector('._timeStamp[data-tm]')?.dataset.tm) * 1000;
      const recipients = {to: new Set(), re: new Set()};
      const replies = [];
      for (const badge of el.querySelectorAll('pre [data-cwtag]')) {
        // Tags inside quoted messages belong to the quotation, not this sender.
        if (badge.parentElement.closest('blockquote, .chatQuote, ._quote, [data-cwtag="[qt]"]')) continue;
        const tag = badge.dataset.cwtag;
        const to = /^\[To:(\d+)\]$/i.exec(tag);
        const re = /^\[rp\s+aid=(\d+)(?:\s|\])/i.exec(tag);
        if (to) recipients.to.add(to[1]);
        if (re) recipients.re.add(re[1]);
        const link = re && /\bto=(\d+)-(\d+)/.exec(tag);
        if (link && link[1] === rid) replies.push({id: link[2], trigger: badge.querySelector('._replyMessage')});
      }
      const sender = el.querySelector('._speaker [data-aid], [data-source="timeline_message_avatar_profile"][data-aid]')?.dataset.aid || '';
      result.push({el, id: el.dataset.mid, index: Number(el.dataset.index), time, sender, replies,
        deleted: el.dataset.deleted === '1', ...recipients});
    }
    return result.sort((a, b) => a.index - b.index);
  }
  function matches(items, id, days, now = Date.now()) {
    const eligible = items.filter(m => !m.deleted && m.time >= now - days * 86400000 && m.time <= now);
    return {to: eligible.filter(m => m.to.has(id)), re: eligible.filter(m => m.re.has(id)), send: eligible.filter(m => id && m.sender === id)};
  }
  function covered(items, cutoff) {
    const dated = items.filter(m => Number.isFinite(m.time) && m.time > 0);
    if (!dated.length || Math.min(...dated.map(m => m.time)) > cutoff) return false;
    // Search/jump views can have gaps. A crossed date alone is not complete history.
    const start = items.findLastIndex(m => m.time > 0 && m.time <= cutoff);
    return items.slice(Math.max(0, start)).every((m, i, arr) => Number.isFinite(m.index) && (!i || m.index === arr[i - 1].index + 1));
  }
  function union(groups) {
    return [...new Map([...groups.to, ...groups.re, ...groups.send].map(m => [m.id, m])).values()].sort((a,b) => a.index - b.index);
  }
  function related(items) {
    const nodes = new Map(), edges = new Map();
    const connect = (a,b) => { if (!edges.has(a)) edges.set(a,new Set()); edges.get(a).add(b); };
    for (const m of items) { nodes.set(m.id,m); if (!edges.has(m.id)) edges.set(m.id,new Set()); }
    for (const m of items.filter(m => !m.deleted)) for (const ref of m.replies) {
      if (ref.id === m.id) continue;
      if (!nodes.has(ref.id)) nodes.set(ref.id,{id:ref.id,missing:true,trigger:ref.trigger});
      else if (nodes.get(ref.id).missing && ref.trigger) nodes.get(ref.id).trigger = ref.trigger;
      connect(m.id,ref.id); connect(ref.id,m.id);
    }
    const result = new Map(), visited = new Set();
    for (const id of nodes.keys()) {
      if (visited.has(id)) continue;
      const queue = [id], component = []; visited.add(id);
      for (let i=0; i<queue.length; i++) {
        const current = queue[i]; const node = nodes.get(current);
        if (!node.deleted) component.push(node);
        for (const neighbor of edges.get(current) || []) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
      // Keep snowflake message identifiers as strings: Number loses precision.
      component.sort((a,b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
      for (const node of component) if (!node.missing) result.set(node.id,component);
    }
    return result;
  }
  function scroller(doc) {
    let el = doc.querySelector('#_timeLine ._message')?.parentElement;
    while (el && el !== doc.body) {
      if (/(auto|scroll)/.test(doc.defaultView.getComputedStyle(el).overflowY) && el.clientHeight > 0) return el;
      el = el.parentElement;
    }
    return null;
  }
  globalThis.ChatworkMentions = {roomId, account, messages, matches, union, related, covered, scroller};
})();
