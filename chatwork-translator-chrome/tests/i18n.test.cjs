const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {install} = require('./support/i18n.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const locales = ['zh_CN', 'zh_TW', 'en', 'ja', 'ko'];
const catalog = locale => JSON.parse(read(`_locales/${locale}/messages.json`));
const wait = () => new Promise(resolve => setTimeout(resolve, 25));

test('all locale catalogs cover production keys and preserve substitution slots', () => {
  const base = catalog('en');
  const sources = fs.readdirSync(root).filter(n => /\.(js|mjs|html)$/.test(n)).map(read).join('\n');
  const used = [...sources.matchAll(/(?:CW_I18N\.t\(["']|data-i18n(?:-[\w-]+)?=["'])([\w]+)/g)].map(m => m[1]);
  const manifest = JSON.parse(read('manifest.json'));
  used.push(...[...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map(m => m[1]));
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.content_scripts[0].js[0], 'i18n.js');
  for (const locale of locales) {
    const entries = catalog(locale);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(base).sort());
    for (const key of used) assert.ok(entries[key]?.message, `${locale}: ${key}`);
    for (const [key, entry] of Object.entries(entries)) {
      assert.deepEqual(entry.placeholders || {}, base[key].placeholders || {}, `${locale}: ${key}`);
      const slots = [...entry.message.matchAll(/\$([\w]+)\$/g)].map(m => m[1]).sort();
      const originalSlots = [...base[key].message.matchAll(/\$([\w]+)\$/g)].map(m => m[1]).sort();
      assert.deepEqual(slots, originalSlots, `${locale}: ${key}`);
    }
  }
});

for (const locale of [...locales, 'en-US', 'fr']) {
  test(`${locale}: static/dynamic UI follows locale; saved switches and translation languages remain unchanged`, async () => {
    for (const saved of [{}, {enabled:false, manualEnabled:false, mentionEnabled:false, manualSource:'ko', manualTarget:'en'}]) {
      const dom = new JSDOM(read('popup.html'), {runScripts:'outside-only'});
      try {
        const w = dom.window;
        w.chrome = {storage:{local:{get:async()=>saved}}, runtime:{openOptionsPage(){}}};
        const t = install(w, locale).t;
        w.eval(read('popup.js')); w.eval(read('manual.js'));
        await wait();
        const doc = w.document;
        assert.equal(doc.documentElement.lang, t('ui_language'));
        assert.equal(doc.querySelector('h1').textContent, t('ui_101'));
        assert.equal(doc.querySelector('#manual-input').placeholder, t('ui_113'));
        assert.equal(doc.querySelector('#status').textContent, t(w.AutoSettings.resolve(saved).enabled ? 'ui_118' : 'ui_119'));
        assert.equal(doc.getElementById('enabled').checked, w.AutoSettings.resolve(saved).enabled);
        for (const id of ['mention-enabled', 'manual-enabled']) assert.equal(doc.getElementById(id).checked, saved.enabled !== false);
        assert.equal(doc.querySelector('#manual-source').value, saved.manualSource || 'zh');
        assert.equal(doc.querySelector('#manual-target').value, saved.manualTarget || 'ja');
        const raw = '日本語 中文 English $1 <b>원문</b>';
        assert.ok(t('ui_149', [raw]).includes(raw));
        if (locale === 'fr' || locale === 'en-US') assert.equal(t('ui_015'), 'Translate');
      } finally { dom.window.close(); }
    }
  });
}

for (const locale of locales) {
  test(`${locale}: member navigation and Thread localize without changing message text or names`, async () => {
    const body = 'こんにちは。中文 English 한국어 $1';
    const name = '山田 Alice 张三';
    const message = (id, reply) => `<div class="_message" data-rid="7" data-mid="${id}" data-index="${id}"><div class="_speaker"><div data-aid="12"><img src="me.png" alt="${name}"></div></div><pre>${reply ? '<div data-cwtag="[rp aid=12 to=7-1]"></div>' : ''}${body}</pre><div class="_timeStamp" data-tm="${Math.floor(Date.now()/1000)}"></div></div>`;
    const dom = new JSDOM(`<div data-testid="global-header_account-menu_menu-button"><img src="me.png">${name}</div><div id="_roomHeader"><div id="_roomTitle"><i data-roomid="7"></i></div><div class="chatRoomHeader__infoContainer"><div data-aid="12"><img src="me.png" alt="${name}"></div></div></div><div id="_timeLine">${message(1,false)}${message(2,true)}</div>`, {runScripts:'outside-only', url:'https://www.chatwork.com/#!rid7'});
    try {
      const w = dom.window;
      w.chrome = {storage:{onChanged:{addListener(){}},local:{get:async()=>({}),set:async()=>{}}}};
      const t = install(w, locale).t;
      w.HTMLElement.prototype.scrollIntoView = function(){ w.jumped=this.dataset.mid; };
      w.eval(read('mentions-core.js')); w.eval(read('mentions.js')); await wait();
      const doc = w.document;
      assert.equal(doc.querySelector('.cw-m-counts').value, t('ui_063', [2]));
      assert.ok(doc.querySelector('#cw-mentions select').textContent.includes(name));
      const related = doc.querySelector('[data-mid="1"] .cw-m-related');
      assert.ok(related.textContent.includes(t('ui_084', [1,2])));
      related.querySelector('.cw-m-thread-open').click();
      assert.equal(doc.querySelector('.cw-m-preview-author strong').textContent, name);
      assert.ok(doc.querySelector('.cw-m-preview-text').textContent.includes(body));
      assert.ok(doc.querySelector('.cw-m-thread-message > button').textContent.includes(t('ui_077')));
      assert.equal(w.jumped, undefined);
      for (const pre of doc.querySelectorAll('#_timeLine pre')) assert.equal(pre.textContent, body);
    } finally { dom.window.close(); }
  });
}

test('missing browser i18n gracefully falls back to English', () => {
  const dom = new JSDOM('', {runScripts:'outside-only'});
  try { dom.window.eval(read('i18n.js')); assert.equal(dom.window.CW_I18N.t('ui_015'), 'Translate'); }
  finally { dom.window.close(); }
});
