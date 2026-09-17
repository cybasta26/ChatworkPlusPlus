(() => {
  function messageText(body) {
    if (!body) return '';
    const parts = [];
    const boundary = () => {
      if (parts.length && !parts.at(-1).text.endsWith('\n')) parts.push({text: '\n', layout: true});
    };
    function walk(node) {
      if (node.nodeType === 3) {
        const text = node.textContent;
        // An explicit message newline takes precedence over a layout boundary.
        if (/^[\r\n]/.test(text) && parts.at(-1)?.layout) parts.pop();
        if (text) parts.push({text});
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.getAttribute('data-cwtag') || '';
      if (/^\[(?:To:|rp\b)/.test(tag)) {
        parts.push({text: tag.startsWith('[To:') ? 'TO: ' : 'RE: '});
        return;
      }
      if (node.matches('script, style, [hidden], [aria-hidden="true"]')) return;
      if (node.tagName === 'BR') {
        if (parts.at(-1)?.layout) parts.pop();
        parts.push({text: '\n'});
        return;
      }
      const block = /^(DIV|P|BLOCKQUOTE|LI|UL|OL)$/.test(node.tagName);
      if (block) boundary();
      for (const child of node.childNodes) walk(child);
      if (block) boundary();
    }
    for (const child of body.childNodes) walk(child);
    return parts.map(part => part.text).join('').trim();
  }
  // Only protect names supported by Chatwork's visible user/mention markup.
  function knownNames(root) {
    const names = new Set();
    for (const node of root.querySelectorAll('[data-testid="timeline_user-name"], ._speaker img[alt]')) {
      const name = (node.getAttribute('alt') || node.textContent || '').trim();
      if (name) names.add(name);
    }
    for (const badge of root.querySelectorAll('pre [data-cwtag]')) {
      const tag = badge.getAttribute('data-cwtag') || '';
      if (!/^\[(?:To:|rp\b|qtmeta\b)/.test(tag)) continue;
      // Chatwork places the displayed recipient beside the badge, outside it.
      const next = badge.nextSibling;
      const line = (next?.textContent || '').split(/[\r\n]/)[0].trim();
      if (line && line.length <= 80) names.add(line);
    }
    return [...names].sort((a, b) => b.length - a.length);
  }

  function protect(text, names) {
    let prefix = 'CWNAME';
    while (text.includes(prefix)) prefix += 'X';
    const entries = [];
    const escaped = names.filter(Boolean).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!escaped.length) return {text, restore: value => value};
    const masked = text.replace(new RegExp(escaped.join('|'), 'gu'), name => {
      const token = `${prefix}${entries.length}END`;
      entries.push({token, name});
      return token;
    });
    return {
      text: masked,
      restore(value) {
        // Fail visibly if the service changes a token instead of guessing a name.
        for (const {token, name} of entries) {
          if (!value.includes(token)) throw new Error(CW_I18N.t("ui_099"));
          value = value.replaceAll(token, name);
        }
        return value;
      }
    };
  }
  globalThis.ChatworkNames = {knownNames, protect, messageText};
})();
