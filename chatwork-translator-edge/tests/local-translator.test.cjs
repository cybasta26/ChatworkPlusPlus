const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../local-translator.js'), 'utf8');
function harness(availability = 'available') {
  const input = [], options = [];
  const settings = {enabled: true};
  const session = {translate: async text => {input.push(text);return '中'+text;},destroy(){}};
  const context = vm.createContext({chrome: {storage: {local: {get: async () => settings}}}, Translator: {
    availability: async () => availability,
    create: async params => {options.push(params); return session;}
  }});
  require('./support/i18n.cjs').install(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../protected-text.js'), 'utf8'), context);
  vm.runInContext(code, context);
  return {api:context.EdgeTranslation, context, settings, input, options};
}
test('姓名以占位符参与整行翻译，恢复换行并缓存', async () => {
  const h = harness();
  const text='CWNAME0ENDこんにちは\nCWNAME1ENDありがとう';
  const first=await h.api.translate(text);
  assert.equal(first.text,'中CWNAME0ENDこんにちは\n中CWNAME1ENDありがとう');
  assert.equal(h.input.length,2);
  assert.match(h.input[0], /CWKEEP0ENDこんにちは/);
  assert.match(h.input[1], /CWKEEP0ENDありがとう/);
  await h.api.translate(text);
  assert.equal(h.input.length,2);
  assert.equal(h.options[0].sourceLanguage,'ja');
  assert.equal(h.options[0].targetLanguage,'zh');
});
test('缺少 API 明确报错', async () => {
  const h=harness();delete h.context.Translator;
  await assert.rejects(h.api.translate('こんにちは'), /未开放/);
});
test('未下载模型不自动启动下载，初始化后可用', async () => {
  const h=harness('downloadable');
  await assert.rejects(h.api.translate('こんにちは'), /下载语言模型/);
  assert.equal(h.options.length,0);
  await h.api.initialize();
  assert.equal((await h.api.translate('こんにちは')).text,'中こんにちは');
});
test('暂停时连缓存也不返回，切换语言重新创建模型', async () => {
  const h=harness();await h.api.translate('こんにちは');
  h.settings.enabled=false;
  await assert.rejects(h.api.translate('こんにちは'), /暂停/);
  h.settings.enabled=true;h.api.configure('ko');
  await h.api.translate('안녕하세요');
  assert.equal(h.options.length,2);
  assert.equal(h.options[1].sourceLanguage,'ko');
});
test('长正文保留所有 Unicode 字符且限制每块大小', async () => {
  const h=harness();const text='日'.repeat(1799)+'😀'+'本'.repeat(1900);
  const result = await h.api.translate(text);
  assert.equal(result.text.replaceAll('中',''),text);
  assert.ok(h.input.every(part=>part.length<=1800 && !/[\uD800-\uDBFF]$/.test(part)));
});
test('不支持语言对和空模型结果均报错', async () => {
  const h=harness('unavailable');await assert.rejects(h.api.translate('こんにちは'), /不支持/);
  const empty=harness();empty.context.Translator.create=async()=>({translate:async()=>'',destroy(){}});
  await assert.rejects(empty.api.translate('こんにちは'),/未返回译文/);
});
test('分隔线链接符号继续保护，英文与编号随正文翻译', async () => {
  const h=harness();
  const line='ー'.repeat(82);
  const text=`Please review TestFlight / iOS ver.0.0.2\nhttps://shared.ent.box.com/folder/39705969342\n${line}\n①No.2084、No.1592：「未開放」関連 ✅\nサーバーを確認してください。`;
  const result=await h.api.translate(text);
  assert.equal(result.text.replaceAll('中',''), text);
  assert.equal(h.input.length,3);
  assert.ok(h.input[1].includes('「未開放」関連'));
  assert.ok(h.input[1].includes('No.2084'));
  assert.ok(!h.input.join('').includes(line));
  assert.equal(result.text.split(line).length,2);
});
test('用户的时间和时长例句完整送入模型，不切碎数字标点', async () => {
  const h=harness();
  const text='昨日の23:43ごろから12時間ほど同じループで回していて、現在も実行中ですが、';
  await h.api.translate(text);
  assert.deepEqual(h.input,[text]);
});
test('句中的英文与链接恢复，缺失标记自动回退', async () => {
  const h=harness();
  const text='CWNAME0ENDさん、TestFlight は https://example.com/a?x=1 を確認してください。';
  assert.equal((await h.api.translate(text)).text,'中'+text);
  assert.equal(h.input.length,1);
  const broken=harness();const inputs=[];
  broken.context.Translator.create=async()=>({translate:async value=>{inputs.push(value);return value.includes('CWKEEP') ? '遗漏标记' : '译:'+value;},destroy(){}});
  const recovered=(await broken.api.translate(text)).text;
  assert.ok(recovered.includes('CWNAME0END'));
  assert.ok(recovered.includes('TestFlight'));
  assert.ok(recovered.includes('https://example.com/a?x=1'));
  assert.ok(!recovered.includes('遗漏标记'));
  assert.ok(inputs.slice(1).every(value=>!value.includes('CWKEEP')));
  assert.ok(inputs.slice(1).some(value=>value.includes('TestFlight')));
});
test('纯符号链接在模型不可用时也原样返回', async () => {
  const h=harness('unavailable');
  const text='①②③ --- ーーーー ｰｰｰ 📌 👩‍💻 https://example.com/a?q=1#b';
  assert.equal((await h.api.translate(text)).text,text);
  assert.equal(h.options.length,0);
});
test('用户的 Android JP TestFlight 例句完整送入模型，无英文占位符', async () => {
  const h=harness();
  const text='お世話になっております。 すみません、Android側は現在対応中でございますが 先行してJP版のTestFlight配信を実施いたしましたので こちらご確認頂けますと幸いでございます。';
  await h.api.translate(text);
  assert.deepEqual(h.input,[text]);
});
test('纯英文及中英日混合正文不替换也不跳过', async () => {
  const h=harness();
  const samples=['Please check the Android build.', '请确认Android版，JP版のTestFlightを配信しました。'];
  for (const text of samples) await h.api.translate(text);
  assert.deepEqual(h.input,samples);
});
test('明确中文整条跳过；含日语或英文句子的消息继续翻译', async () => {
  const h=harness('unavailable');
  for (const text of ['请确认当前版本。', 'CWNAME0END\n刘先生，这条消息我发给他了。', 'Android版目前还在处理中，请确认。']) {
    assert.equal((await h.api.translate(text)).skipped,true);
  }
  assert.equal(h.options.length,0);
  const ready=harness();
  for (const text of ['请确认。ありがとうございます。', '确认一下。Please check the build.', '確認', '了解']) {
    assert.notEqual((await ready.api.translate(text)).skipped,true);
  }
  assert.equal(ready.input.length,4);
});
test('标记大小写、空格、全角变化可恢复，无需回退', async () => {
  const h=harness();let count=0;
  h.context.Translator.create=async()=>({destroy(){},translate:async text=>{
    count++;
    return text.replace(/CWKEEP\d+END/g, token=>[...token.toLowerCase()].map(char=>String.fromCharCode(char.charCodeAt(0)+0xFEE0)).join(' '));
  }});
  const text='CWNAME0ENDさん、TestFlight を確認してください。';
  assert.equal((await h.api.translate(text)).text,text);
  assert.equal(count,1);
});
test('重复标记会回退，保留数字时间上下文且不重复人名', async () => {
  const h=harness();const inputs=[];
  h.context.Translator.create=async()=>({destroy(){},translate:async text=>{
    inputs.push(text);
    return text.includes('CWKEEP') ? text+' CWKEEP0END' : text;
  }});
  const sentence='昨日の23:43ごろから12時間ほど同じループで回していて、現在も実行中ですが、';
  const text='CWNAME0END'+sentence;
  assert.equal((await h.api.translate(text)).text,text);
  assert.deepEqual(inputs.slice(1),[sentence]);
});
test('回退过程中暂停会停止后续推理', async () => {
  const h=harness();let count=0;
  h.context.Translator.create=async()=>({destroy(){},translate:async()=>{
    count++;h.settings.enabled=false;return '保护标记丢失';
  }});
  await assert.rejects(h.api.translate('CWNAME0ENDさん、確認してください。'), /暂停/);
  assert.equal(count,1);
});
test('模型合并换行时 RE 和 CC TO 仍各占一行且不夹空行', async () => {
  const h=harness();const calls=[];
  h.context.Translator.create=async()=>({destroy(){},translate:async text=>{
    calls.push(text);return text.replace(/\s+/g,' ');
  }});
  const header='RE: CWNAME0ENDさん\nCC : TO: CWNAME1END\nTO: CWNAME2END\n';
  const body='ご連絡ありがとうございます。\nWW版のTestFlightをご確認ください。';
  assert.equal((await h.api.translate(header+body)).text,header+body);
  assert.deepEqual(calls,body.split('\n'));
});
test('正文中间的提及行保留 CRLF 和原有段落空行', async () => {
  const h=harness();
  const text='前段です。\r\n\r\nTO: CWNAME0END\r\n後段です。';
  assert.equal((await h.api.translate(text)).text.replaceAll('中',''),text);
  assert.equal(h.input.length,2);
  assert.ok(h.input.every(value=>!value.includes('CWNAME')));
});
test('截图中的标题和列表在模型合并空白时仍逐条换行', async () => {
  const h=harness();const calls=[];
  h.context.Translator.create=async()=>({destroy(){},translate:async text=>{
    calls.push(text);return text.replace(/\s+/g,' ');
  }});
  const text='■上海\n・窓口対応\n・開発FB\n・不具合対応\n・機能チェック\n\n■秋葉原第二\n・窓口対応\n・検証管理対応\n・レギュレーション対応\n・正式向け調整項目対応\n';
  assert.equal((await h.api.translate(text)).text,text);
  assert.deepEqual(calls,['上海','窓口対応','開発FB','不具合対応','機能チェック','秋葉原第二','窓口対応','検証管理対応','レギュレーション対応','正式向け調整項目対応']);
});
test('编号列表和普通正文都保留缩进与 CRLF', async () => {
  const h=harness();const calls=[];
  h.context.Translator.create=async()=>({destroy(){},translate:async text=>{calls.push(text);return text;}});
  const text='  1. Android側を確認\r\n  2. TestFlight配信を確認\r\n\r\n昨日の23:43ごろから12時間ほど\n同じループで回しています。';
  assert.equal((await h.api.translate(text)).text,text);
  assert.deepEqual(calls,['Android側を確認','TestFlight配信を確認','昨日の23:43ごろから12時間ほど','同じループで回しています。']);
});
test('无项目符号统计行通用保留换行和空行，模型新增换行不带回', async () => {
  const h=harness();const calls=[];
  h.context.Translator.create=async()=>({destroy(){},translate:async text=>{
    calls.push(text);return '\n译文\n'+text+'\n';
  }});
  const rows=['起票済 :536件','バンダイ様確認待ち:2件','差戻し :21件','対応待ち :28件','確認中 :2件','クローズ :480件','','MF (修正必須):10','A (要修正):13','B (原則修正):56','合計 :111'];
  const result=(await h.api.translate(rows.join('\n'))).text;
  assert.equal(result.split('\n').length,rows.length);
  assert.equal(result.split('\n')[6],'');
  assert.deepEqual(calls,rows.filter(Boolean));
  assert.ok(result.split('\n').every((line,i)=>!rows[i] || line.endsWith(rows[i])));
});
test('任意换行类型与连续空行逐字保留', async () => {
  const h=harness();
  h.context.Translator.create=async()=>({destroy(){},translate:async text=>text});
  const text='対応中\r\n確認中\n\n\n完了\r実行中\n';
  assert.equal((await h.api.translate(text)).text,text);
});
