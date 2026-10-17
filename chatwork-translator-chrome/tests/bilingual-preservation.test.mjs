import test from 'node:test';
import assert from 'node:assert/strict';
import {install} from './support/i18n.cjs';
globalThis.chrome = {runtime:{onMessage:{addListener(){}}}};
install(globalThis, 'zh_CN');
const {processMessage} = await import('../background.js');

test('bilingual Japanese/Chinese message preserves Chinese verbatim, including names and whitespace', async () => {
  const chinese = '十分感谢贵方在 10006 环境下协助进行的测试与确认。\n诚如贵方所言，周五提供给我方的 ipa 安装包与贵司目前最新构建版本的 ipa 之间，可能存在些许代码与资源文件的差异，但只要当前能够正常连接至 10006 环境，则表明整体逻辑与功能运行正常。\n后续我方将在日本假期结束后，对万代(Bandai)侧重新通过 TestFlight 分发的包体进行测试验证。\n\n再次感谢您在百忙之中抽空配合我司进行相关验证工作。';
  const source = 'インストール用ビルドを改めて作成しました。\n\n' + chinese + '\n---------------------------------------\n10006でのご確認、ありがとうございます。';
  const sent=[];
  const result=await processMessage(source,async text=>{sent.push(text);return '日文的译文';},'zh');
  assert.ok(result.text.includes(chinese));
  assert.equal(sent.length,2);
  assert.ok(sent.every(text=>!text.includes('十分感谢')&&!text.includes('再次感谢')));
  assert.ok(result.text.includes('\n---------------------------------------\n'));
});

test('preserves target English segments while translating Japanese',async()=>{
  const english='Please check the current version and let us know when you are ready.';
  const sent=[];
  const result=await processMessage('現在のバージョンをご確認ください。\n\n'+english,async text=>{sent.push(text);return 'Translation';},'en');
  assert.ok(result.text.endsWith(english));assert.equal(sent.length,1);
});

test('mixed Japanese sentence still translates intact and Chinese variant conversion stays available',async()=>{
  const mixed='Android側は現在対応中ですがJP版のTestFlightを配信しました。';
  const sent=[];
  await processMessage(mixed,async text=>{sent.push(text);return text;},'zh');
  assert.deepEqual(sent,[mixed]);
  const chinese='请确认目前的版本是否已经准备完成，谢谢您的协助。';
  sent.length=0;
  await processMessage(chinese,async text=>{sent.push(text);return text;},'zh-Hant');
  assert.deepEqual(sent,[chinese]);
});
