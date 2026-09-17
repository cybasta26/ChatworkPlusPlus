import test from 'node:test';
import assert from 'node:assert/strict';
import {install} from './support/i18n.cjs';
let saved={}, handler, requests=[];
globalThis.chrome={runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,onMessage:{addListener:fn=>handler=fn}},storage:{local:{get:async()=>saved}}};
install(globalThis,'zh_CN');
globalThis.fetch=async url=>{requests.push(new URL(url));return {ok:true,json:async()=>[[['translated']]]};};
await import('../background.js');
function translate(text) {
  return new Promise(resolve=>handler({type:'translate',text},{id:chrome.runtime.id,url:'https://www.chatwork.com/#!rid7',tab:{id:1}},resolve));
}
test('Google backend uses Japanese source and browser target, including Traditional Chinese',async()=>{
  for (const [locale,target] of [['zh-CN','zh-CN'],['zh-TW','zh-TW'],['en-US','en'],['ko-KR','ko'],['fr-FR','fr']]) {
    chrome.i18n.getUILanguage=()=>locale;saved={};requests=[];
    assert.equal((await translate('こんにちは。'+locale)).text,'translated');
    assert.equal(requests.length,1);
    assert.equal(requests[0].searchParams.get('sl'),'ja');
    assert.equal(requests[0].searchParams.get('tl'),target);
  }
});
test('Japanese install does not translate by default, while explicit preferences override locale',async()=>{
  chrome.i18n.getUILanguage=()=> 'ja';saved={};requests=[];
  assert.ok((await translate('こんにちは。')).error);assert.equal(requests.length,0);
  saved={enabled:true};assert.equal((await translate('こんにちは。')).reason,'same-language');
  saved={enabled:true,sourceLanguage:'ko',targetLanguage:'en'};
  assert.equal((await translate('안녕하세요.')).text,'translated');
  assert.equal(requests[0].searchParams.get('sl'),'ko');
  assert.equal(requests[0].searchParams.get('tl'),'en');
});
test('Chinese messages are skipped only for Chinese target, not for English target',async()=>{
  saved={enabled:true,sourceLanguage:'ja',targetLanguage:'en'};requests=[];
  assert.equal((await translate('请确认目前的版本。')).text,'translated');
  assert.equal(requests.length,1);
  saved.targetLanguage='zh';requests=[];
  assert.equal((await translate('请确认目前的版本。')).skipped,true);
  assert.equal(requests.length,0);
});
test('already-target messages never reach Google even when the configured source differs',async()=>{
  for (const [source,target,text] of [
    ['ja','en','Please check the current version and let us know when you are ready.'],
    ['en','ja','お世話になっております。現在のバージョンをご確認ください。'],
    ['ja','ko','현재 버전을 확인해 주세요. 준비가 완료되면 알려 주세요.'],
    ['ja','zh-Hant','請確認目前的版本是否已經準備完成，謝謝您的協助。']
  ]) {
    saved={enabled:true,sourceLanguage:source,targetLanguage:target};requests=[];
    assert.equal((await translate(text)).reason,'already-target-language');
    assert.equal(requests.length,0);
  }
});
