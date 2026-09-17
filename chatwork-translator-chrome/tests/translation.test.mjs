import test from 'node:test';
import assert from 'node:assert/strict';
import {splitText, parseTranslation, translateText} from '../translation.mjs';
import {install} from './support/i18n.cjs';
install(globalThis);

test('手动翻译语言参数与长占位符块不会被中途切开', async () => {
  const calls=[];
  await translateText('日'.repeat(1199)+'CWKEEP0END'+'本'.repeat(100),async url=>{
    calls.push(new URL(url));return {ok:true,json:async()=>[[['译文']]]};
  },{source:'zh',target:'ja'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].searchParams.get('sl'),'zh');
  assert.equal(calls[0].searchParams.get('tl'),'ja');
  assert.ok(calls[0].searchParams.get('q').includes('CWKEEP0END'));
});

test('长文本分块不会丢失字符或拆开代理对', () => {
  const text = 'あ'.repeat(1199) + '😀\nこんにちは'.repeat(400);
  const chunks = splitText(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(c => c.length <= 1200 && !/[\uD800-\uDBFF]$/.test(c)));
});
test('拼接 Google 多段译文并拒绝异常响应', () => {
  assert.equal(parseTranslation([[['你好\n', 'hello'], ['世界', 'world']], null, 'en']), '你好\n世界');
  assert.throws(() => parseTranslation({error: 'denied'}));
  assert.throws(() => parseTranslation([[]]));
});
test('请求目标中文且不携带 cookie，分块全部返回', async () => {
  const requests = [];
  const result = await translateText('日'.repeat(2401), async (url, options) => {
    requests.push({url: new URL(url), options});
    return {ok: true, json: async () => [[['中']]]};
  });
  assert.equal(result, '中中中');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url.searchParams.get('tl'), 'zh-CN');
  assert.equal(requests[0].options.credentials, 'omit');
});
test('限流明确失败，不返回伪译文', async () => {
  await assert.rejects(translateText('hello', async () => ({ok: false, status: 429})), /限流/);
});
