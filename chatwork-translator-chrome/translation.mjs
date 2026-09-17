import './i18n.js';
export function splitText(text, limit = 1200) {
  const chunks = [];
  let current = '';
  for (const char of text) {
    if (current.length + char.length > limit) {
      chunks.push(current);
      current = '';
    }
    current += char;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function parseTranslation(data) {
  if (!Array.isArray(data?.[0])) throw new Error(CW_I18N.t("ui_165"));
  const result = data[0].map(segment => typeof segment?.[0] === 'string' ? segment[0] : '').join('');
  if (!result.trim()) throw new Error(CW_I18N.t("ui_156"));
  return result;
}

export async function translateText(text, fetcher = fetch, {source = 'auto', target = 'zh-CN'} = {}) {
  const output = [];
  for (const chunk of text.length <= 1800 ? [text] : splitText(text)) {
    const params = new URLSearchParams({client: 'gtx', sl: source, tl: target === 'zh' ? 'zh-CN' : target, dt: 't', q: chunk});
    const response = await fetcher(`https://translate.googleapis.com/translate_a/single?${params}`, {
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(response.status === 429 ? CW_I18N.t("ui_166") : CW_I18N.t("ui_167", [response.status]));
    output.push(parseTranslation(await response.json()));
  }
  return output.join('');
}
