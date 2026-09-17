(() => {
  function isChineseMessage(text) {
    // Conservative, local-only detection. Shared Han-only labels such as
    // 確認/了解 are ambiguous and must not be classified as Chinese.
    const body = text.replace(/CWNAME(?:X)*\d+END(?:さん|様)?/g, '')
      .replace(/https?:\/\/[^\s<>]+/g, '').replace(/\b(?:TO|RE):/g, '');
    if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(body.replace(/[ーｰ]+/g, ''))) return false;
    if (!/\p{Script=Han}/u.test(body)) return false;
    // Product names such as Logic2 are not a separate sentence language.
    // Require Chinese dominance and Chinese-specific evidence below; do not
    // mask or rewrite foreign words in the text sent to translation.
    const total = (body.match(/\p{L}/gu) || []).length;
    const han = (body.match(/\p{Script=Han}/gu) || []).length;
    if (!total || han / total < .8) return false;
    if (/[这说请谢吗没让给为从发过还对该较测软钟够备]/u.test(body)) return true;
    const phrases = body.match(/(?:您好|你好|我們|你們|谢谢|謝謝|請問|請您|請確認|目前|已经|已經|可以|需要|如果|这个|這個|无法|無法|完成了|正在|的话|的話)/g) || [];
    return phrases.length >= 2;
  }

  // Inspect the whole message locally. Metadata must not outweigh the prose.
  function languageBody(text) {
    return text.replace(/CWNAME(?:X)*\d+END(?:さん|様)?/g, ' ')
      .replace(/https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ')
      .replace(/\[(?:To:[^\]]*|rp\s[^\]]*)\]/gi, ' ')
      .replace(/\b(?:TO|RE|CC)\s*:/gi, ' ')
      .replace(/\b(?:Android|iOS|TestFlight|CPU|GPU|ROM|JP|WW|UI|API|SDK|BUG|No)\b/g, ' ')
      .replace(/[ーｰ\d\p{P}\p{S}]+/gu, ' ').trim();
  }
  function scriptStats(body) {
    const count = re => (body.match(re) || []).length;
    return {total:count(/\p{L}/gu),han:count(/\p{Script=Han}/gu),
      kana:count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu),
      hangul:count(/\p{Script=Hangul}/gu),latin:count(/\p{Script=Latin}/gu)};
  }
  const simplified = /[这说请谢吗没让给为从发过还对该较测软钟够备会语译现认问时经欢处实报开关数]/u;
  const traditional = /[這說請謝嗎沒讓給為從發過還對該較測軟鐘夠備會語譯現認問時經歡處實報開關數]/u;
  function chineseVariantMatches(body, target) {
    // Keep simplified/traditional conversion available when the scripts differ.
    if (target === 'zh-Hant') return !simplified.test(body);
    return !traditional.test(body);
  }
  function dominantScript(stats, target) {
    if (!stats.total) return false;
    if (target === 'ja') return stats.kana >= 2 && (stats.kana+stats.han)/stats.total >= .8;
    if (target === 'ko') return stats.hangul >= 3 && (stats.hangul+stats.han)/stats.total >= .8;
    if (target === 'zh' || target === 'zh-Hant') return stats.han >= 2 && stats.han/stats.total >= .8;
    // Don't let Latin product names hide a Japanese/Chinese/Korean message.
    if (['en','fr','de','es','pt','it','nl','id','vi'].includes(target)) return stats.latin/stats.total >= .8;
    return true;
  }
  function fallbackLanguage(body, stats, target) {
    if (!dominantScript(stats,target)) return false;
    if (target === 'ja') return stats.kana / (stats.kana + stats.han) >= .15;
    if (target === 'ko') return stats.hangul / (stats.hangul + stats.han) >= .5;
    if (target === 'zh' || target === 'zh-Hant') {
      return chineseVariantMatches(body,target) && isChineseMessage(body);
    }
    if (target === 'en') {
      const words = body.toLowerCase().match(/[a-z]+/g) || [];
      const clues = new Set(words.filter(word => /^(the|this|that|these|those|please|thanks|thank|you|your|we|our|have|has|been|will|would|could|should|with|from|are|is|it|for|and)$/.test(word)));
      return stats.latin >= 12 && words.length >= 3 && clues.size >= 2;
    }
    return false;
  }
  function detectLocal(body) {
    const api = globalThis.chrome?.i18n;
    if (typeof api?.detectLanguage !== 'function') return Promise.resolve(null);
    return new Promise(resolve => {
      let done = false;
      const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => finish(null), 1000);
      try {
        const pending = api.detectLanguage(body, result => {
          const error = globalThis.chrome?.runtime?.lastError;
          finish(error ? null : result);
        });
        if (pending?.then) pending.then(finish, () => finish(null));
      } catch { finish(null); }
    });
  }
  async function isTargetLanguage(text, target) {
    target = AutoSettings.normalize(target);
    if (!target) return false;
    const body = languageBody(text), stats = scriptStats(body);
    if (!dominantScript(stats,target)) return false;
    if ((target === 'zh' || target === 'zh-Hant') && !chineseVariantMatches(body,target)) return false;
    // Strong Chinese evidence remains valid when CLD is absent, uncertain,
    // or distracted by a small number of Latin product names. The script and
    // variant checks above still reject Japanese and simplified/traditional mismatches.
    if (['zh','zh-Hant'].includes(target) && isChineseMessage(body)) return true;
    if (stats.total < 4) return fallbackLanguage(body,stats,target);
    const result = await detectLocal(body);
    if (result?.isReliable && Array.isArray(result.languages)) {
      const candidates = [...result.languages].sort((a,b)=>b.percentage-a.percentage);
      const best = candidates[0];
      const language = AutoSettings.normalize(best?.language);
      const matches = language === target || (['zh','zh-Hant'].includes(language) && ['zh','zh-Hant'].includes(target));
      return !!(matches && best.percentage >= 80 && best.percentage - (candidates[1]?.percentage || 0) >= 20);
    }
    // A missing/uncertain detector must never block translation.
    return fallbackLanguage(body,stats,target);
  }

  function markerPattern(token) {
    return new RegExp([...token].map(char => {
      const wide = String.fromCharCode(char.charCodeAt(0) + 0xFEE0);
      return `[${char}${wide}]`;
    }).join('[\\s\\u200B_-]*'), 'giu');
  }
  function markerError() {
    const error = new Error(CW_I18N.t("ui_123"));
    error.code = 'PROTECTED_MARKER_CHANGED';
    return error;
  }
  async function translatePart(part, translate) {
    const result = (await translate(part.text)).replace(/[\r\n]+/g, ' ');
    try { return part.restore(result); }
    catch (error) {
      if (error.code !== 'PROTECTED_MARKER_CHANGED') throw error;
    }
    // Retry only this paragraph without placeholders. Never translate the
    // protected values themselves, and keep time/number context in each span.
    const output = [];
    for (const span of part.fallback) {
      if (!span.translate) { output.push(span.text); continue; }
      const leading = span.text.match(/^\s*/)[0], trailing = span.text.match(/\s*$/)[0];
      output.push(leading + (await translate(span.text.trim())).replace(/[\r\n]+/g, ' ').trim() + trailing);
    }
    return output.join('');
  }
  function split(text) {
    const parts = [];
    for (const line of text.split(/(\r\n|\r|\n)/)) {
      if (!line) continue;
      if (/^[\r\n]+$/.test(line)) parts.push({text: line, translate: false});
      else parts.push(...splitLine(line));
    }
    return parts;
  }
  function splitLine(text) {
    const result = [];
    let paragraph = '';
    // Recipient rows are message metadata, not prose. Keep their line endings
    // outside the model so even a model that flattens whitespace cannot join
    // them to the following recipient or body.
    const recipientLine = /^[ \t]*(?:CC[ \t]*:[ \t]*)?(?:(?:TO|RE):[ \t]*CWNAME(?:X)*\d+END(?:さん|様)?[ \t]*)+(?:\r?\n|$)$/i;
    for (const line of text.match(/[^\n]*\n|[^\n]+$/g) || []) {
      if (recipientLine.test(line)) {
        if (paragraph) result.push(...splitParagraph(paragraph));
        paragraph = '';
        result.push({text: line, translate: false});
      } else {
        // Lists and section headings carry structure in every newline. Keep
        // markers outside the model, and translate each item's full text.
        const list = line.match(/^([ \t]*(?:[■□▪▫●○◆◇▶►・·•]|[-*][ \t]+|\d+[.)、][ \t]*|[①-⑳])[ \t]*)([^\r\n]+)(\r?\n)?$/u);
        if (list && /\p{L}/u.test(list[2])) {
          if (paragraph) result.push(...splitParagraph(paragraph));
          paragraph = '';
          result.push({text: list[1], translate: false});
          result.push(...splitParagraph(list[2]));
          if (list[3]) result.push({text: list[3], translate: false});
        } else paragraph += line;
      }
    }
    if (paragraph) result.push(...splitParagraph(paragraph));
    return result;
  }
  function splitParagraph(text) {
    let prefix = 'CWKEEP';
    while (text.includes(prefix)) prefix += 'X';
    const parts = [];
    const blocks = text.split(/(\r?\n(?:[ \t]*\r?\n)+|[ーｰ_─━—=\-]{3,})/g);
    for (const block of blocks) {
      if (!block) continue;
      if (/^(?:\s+|[ーｰ_─━—=\-]+)$/.test(block)) {
        parts.push({text: block, translate: false});
        continue;
      }
      const entries = [];
      const pattern = /CWNAME(?:X)*\d+END|https?:\/\/[^\s<>\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|\b(?:TO|RE):|\p{Extended_Pictographic}(?:[\uFE0F\u200D\p{Emoji_Modifier}]|\p{Extended_Pictographic})*|[\p{S}\p{No}]+/gu;
      const masked = block.replace(pattern, value => {
        const token = `${prefix}${entries.length}END`;
        entries.push({token, value});
        return token;
      });
      const plain = entries.reduce((value, entry) => value.replaceAll(entry.token, ''), masked);
      if (!/\p{L}/u.test(plain)) {
        parts.push({text: block, translate: false});
        continue;
      }
      for (let start = 0; start < masked.length;) {
        let end = Math.min(start + 1800, masked.length);
        if (end < masked.length) {
          const candidate = masked.slice(start, end);
          const boundaries = [...candidate.matchAll(/[。！？\n]/g)];
          const boundary = boundaries.at(-1)?.index;
          if (boundary > 900) end = start + boundary + 1;
          if (/[\uD800-\uDBFF]/.test(masked[end - 1])) end--;
          for (const entry of entries) {
            const index = masked.indexOf(entry.token, start);
            if (index >= start && index < end && index + entry.token.length > end) end = index;
          }
        }
        const chunk = masked.slice(start, end);
        const used = entries.filter(entry => chunk.includes(entry.token));
        const fallback = [];
        let offset = 0;
        for (const entry of used) {
          const index = chunk.indexOf(entry.token, offset);
          const text = chunk.slice(offset, index);
          if (text) fallback.push({text, translate: /\p{L}/u.test(text)});
          fallback.push({text: entry.value, translate: false});
          offset = index + entry.token.length;
        }
        const rest = chunk.slice(offset);
        if (rest) fallback.push({text: rest, translate: /\p{L}/u.test(rest)});
        const leading = chunk.match(/^\s*/)[0], trailing = chunk.match(/\s*$/)[0];
        parts.push({text: chunk.trim(), translate: true, fallback, restore(value) {
          const replacements = used.map(({token, value: original}) => {
            const matches = [...value.matchAll(markerPattern(token))];
            if (matches.length !== 1) throw markerError();
            return {start: matches[0].index, end: matches[0].index + matches[0][0].length, original};
          });
          // Work right-to-left so restored originals cannot match later tokens.
          for (const item of replacements.sort((a, b) => b.start - a.start)) {
            value = value.slice(0, item.start) + item.original + value.slice(item.end);
          }
          return leading + value.trim() + trailing;
        }});
        start = end;
      }
    }
    return parts;
  }
  globalThis.ProtectedText = {split, translatePart, isChineseMessage, isTargetLanguage};
})();
