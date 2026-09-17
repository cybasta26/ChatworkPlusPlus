import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.chrome = {runtime: {onMessage: {addListener() {}}}};
const {install} = await import('./support/i18n.cjs'); install(globalThis);
const {processMessage} = await import('../background.js');
test('Google 处理链保留所有实际换行、TO/RE、链接、分隔线', async () => {
  const calls=[];
  const source='RE: CWNAME0END\nCC : TO: CWNAME1END\n起票済 :536件\n差戻し :21件\n\nMF (修正必須):10\r\nーーーーーー\nhttps://example.com\n';
  const result=await processMessage(source,async text=>{calls.push(text);return '\n'+text+'\n';});
  assert.equal(result.text,source);
  assert.deepEqual(calls,['起票済 :536件','差戻し :21件','MF (修正必須):10']);
});
test('中文跳过，英文与中日混合正文完整进入翻译服务', async () => {
  const calls=[]; const translate=async text=>{calls.push(text);return text;};
  assert.equal((await processMessage('请确认目前的版本。',translate)).skipped,true);
  const mixed='Android側は現在対応中ですがJP版のTestFlightを配信しました。';
  await processMessage(mixed,translate);
  await processMessage('Please check the build.',translate);
  assert.deepEqual(calls,[mixed,'Please check the build.']);
});
test('Google 改写姓名标记时自动回退且不暴露占位符', async () => {
  const result=await processMessage('CWNAME0ENDさん、昨日の23:43ごろから12時間ほど実行しています。',async text=>text.includes('CWKEEP')?'lost':text);
  assert.equal(result.text,'CWNAME0ENDさん、昨日の23:43ごろから12時間ほど実行しています。');
});
