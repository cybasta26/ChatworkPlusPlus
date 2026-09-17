const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
function extract(html) {
  const dom = new JSDOM(`<pre>${html}</pre>`, {runScripts:'outside-only'});
  try {
    require('./support/i18n.cjs').install(dom.window); dom.window.eval(fs.readFileSync(path.join(__dirname,'../names.js'),'utf8'));
    return dom.window.ChatworkNames.messageText(dom.window.document.querySelector('pre'));
  } finally { dom.window.close(); }
}
test('连续 TO 姓名只保留原文换行，不引入图标块空行', () => {
  const badge='<div data-cwtag="[To:123]"><div>TO</div><button><img alt="头像"></button></div>';
  assert.equal(extract(badge+'<span>山川慶さん\n</span>'+badge+'<span>寺崎 蒼生さん\n</span>'+badge+'<span>岡田陸さん\n本文です。\n\n第二段。</span>'), 'TO: 山川慶さん\nTO: 寺崎 蒼生さん\nTO: 岡田陸さん\n本文です。\n\n第二段。');
});
test('行内提及、显式空行、链接和分隔线不丢失', () => {
  assert.equal(extract('<span>CC: </span><div data-cwtag="[To:1]">TO</div><span>山川さん\n\n</span><a href="https://example.com">https://example.com</a><br><br><span>ーーーー</span>'), 'CC: TO: 山川さん\n\nhttps://example.com\n\nーーーー');
});
test('回复显示 RE 前缀且不带图标说明或额外空行', () => {
  assert.equal(extract('<div data-cwtag="[rp aid=123 to=456-789]"><div>RE 回覆對象</div><button><img alt="头像"></button></div><span>Iret_刘祐廷\n刘先生，</span>'), 'RE: Iret_刘祐廷\n刘先生，');
});
test('普通块和显式换行不会重复，段落不会粘连', () => {
  assert.equal(extract('<div>第一行</div>\n<div>第二行</div><div>第三行</div>'), '第一行\n第二行\n第三行');
});
