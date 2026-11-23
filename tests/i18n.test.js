'use strict';
/*
  23.11.2026: the language layer (lib/i18n.js, lib/i18n/exclude.json, tools/i18n-build-exclude.js, lib/i18n-texts.js).
  A monitor without "lang": "ru" must come out exactly as before; one with it goes through a dictionary of Hebrew to Russian, and
  what the server parses in Hebrew is never translated.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
process.env.MONITOR_NO_GATE = '1';
const I = require('../lib/i18n.js');
const T = require('../lib/i18n-texts.js');

const ROOT = path.join(__dirname, '..');
const scripts = (html) => { const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; const out = []; let m; while ((m = re.exec(html))) out.push(m[1]); return out; };
const parses = (html) => scripts(html).forEach((s, i) => { try { new vm.Script(s); } catch (e) { assert.fail('inline script ' + i + ' does not parse: ' + e.message); } });

const PAGE = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>המוניטור</title>'
  + '<style>body{direction:rtl;font-family:Heebo,sans-serif;text-align:right;margin-right:8px}</style></head><body>'
  + '<h1>שלום עולם</h1><input placeholder="שם הלקוח" aria-label="חיפוש" value="שלום עולם"><p>טקסט  עם\n   רווחים</p><!-- הערה בעברית -->'
  + '<script>\n'
  + 'var a = "שלום עולם"; var b = \'שם הלקוח\'; // הערה שלום עולם\n'
  + 'var re = /שלום עולם/.test(x); var d = 6 / 2 / 3;\n'
  + 'toast("נשמר");\n'
  + 'var h = \'<div title="חיפוש">שלום עולם</div>\' + n + \'<b>נשמר</b>\';\n'
  + '</script></body></html>';
const MAP = { 'המוניטור': 'Монитор', 'שלום עולם': 'Привет, мир', 'שם הלקוח': 'Имя клиента', 'חיפוש': 'Поиск', 'טקסט עם רווחים': 'Текст с пробелами', 'נשמר': 'Сохранено' };

test('apply is the identity for Hebrew and for anything but ru', () => {
  assert.strictEqual(I.apply(PAGE, 'he', { map: MAP }), PAGE);
  assert.strictEqual(I.apply(PAGE, '', { map: MAP }), PAGE);
  assert.strictEqual(I.apply(PAGE, undefined, { map: MAP }), PAGE);
  assert.strictEqual(I.apply(PAGE, 'en', { map: MAP }), PAGE);
  assert.strictEqual(I.t('he', 'שלום עולם', { map: MAP }), 'שלום עולם');
  assert.deepStrictEqual(I.promptLines('he'), []);
  assert.deepStrictEqual(I.promptLines(''), []);
});

test('a small dictionary replaces text nodes, shown attributes and script literals', () => {
  const out = I.apply(PAGE, 'ru', { map: MAP });
  assert.ok(out.includes('<title>Монитор</title>'));
  assert.ok(out.includes('<h1>Привет, мир</h1>'));
  assert.ok(out.includes('placeholder="Имя клиента"'));
  assert.ok(out.includes('aria-label="Поиск"'));
  assert.ok(out.includes('<p>Текст с пробелами</p>'), 'a text node is matched with its white space collapsed');
  assert.ok(out.includes('value="שלום עולם"'), 'value is data, not shown text');
  assert.ok(out.includes('var a = "Привет, мир"'));
  assert.ok(out.includes("var b = 'Имя клиента'"));
  assert.ok(out.includes('toast("Сохранено")'));
  assert.ok(out.includes('<div title="Поиск">Привет, мир</div>'), 'Hebrew inside an HTML literal: attributes and text between tags');
  assert.ok(out.includes('<b>Сохранено</b>'));
  assert.ok(out.includes('<!-- הערה בעברית -->'), 'an HTML comment is left');
  assert.ok(out.includes('// הערה שלום עולם'), 'a script comment is left');
  parses(out);
});

test('regex literals, division and comments are not touched', () => {
  const out = I.apply(PAGE, 'ru', { map: MAP });
  assert.ok(out.includes('var re = /שלום עולם/.test(x); var d = 6 / 2 / 3;'));
  // the lexer round trip on awkward code: tokens joined are the source
  const code = 'var a = x / y / 2; var r = /a[/]b\\/c/g; if (a) /x/.test(b); var s = "q\\"uo\'te" + \'it\\\'s\'; var t = `a${"b"}c`; return /re/;\n// c\n/* d */ z = a / /e/.source.length;';
  assert.strictEqual(I.lex(code).map((t) => (t.k === 'str' ? t.q + t.v + t.q : t.v)).join(''), code);
});

test('lang and direction are switched, the font has Cyrillic, the LTR sheet and the mirror are there', () => {
  const out = I.apply(PAGE, 'ru', { map: MAP });
  assert.ok(out.startsWith('<!DOCTYPE html><html lang="ru" dir="ltr">'));
  assert.ok(!/dir="rtl"/.test(out) && !/lang="he"/.test(out) && !/direction\s*:\s*rtl/.test(out));
  assert.ok(!/Heebo/.test(out) && /Rubik/.test(out), 'Heebo has no Cyrillic: Rubik covers Cyrillic and Hebrew');
  assert.ok(/<style id="i18n-ltr">[^<]*direction:ltr!important/.test(out));
  assert.ok(out.includes('text-align:start') && out.includes('margin-left:8px'), 'right becomes start, margin-right becomes margin-left');
  const loc = I.apply('<html lang="he" dir="rtl"><body><script>var d = x.toLocaleDateString("he-IL"); a.localeCompare(b, "he");</script></body></html>', 'ru', { map: {} });
  assert.ok(loc.includes('"ru-RU"') && loc.includes(', "ru")') && !loc.includes('he-IL'));
});

test('what the server parses is never replaced: send calls, command prefixes, comparisons, keys', () => {
  const html = '<html><body><script>\n'
    + 'sendText("שלום עולם", "משימה להיום, " + t, "משימה");\n'
    + 'var line = "אישור תור לקוחה: " + id; var l2 = "שגרה " + cmd + ": " + body;\n'
    + 'if (s.status === "נשמר") {} if ("נשמר" == s.x) {} switch (k) { case "נשמר": break; }\n'
    + 'var i = list.indexOf("נשמר"); var k2 = o["נשמר"]; var ob = { "נשמר": 1, other: "שלום עולם" };\n'
    + 'var arr = ["נשמר", "x"]; if (arr.indexOf(z) >= 0) {}\n'
    + 'var label = "נשמר";\n'
    + 'show("שלום עולם");\n'
    + '</script></body></html>';
  const map = { 'שלום עולם': 'Привет', 'משימה להיום,': 'X', 'משימה': 'X', 'אישור תור לקוחה:': 'X', 'שגרה': 'X', 'נשמר': 'Сохранено' };
  const out = I.apply(html, 'ru', { map });
  assert.ok(out.includes('sendText("שלום עולם", "משימה להיום, " + t, "משימה");'), 'every literal inside a send call');
  assert.ok(out.includes('"אישור תור לקוחה: " + id') && out.includes('"שגרה " + cmd'), 'a command prefix from exclude.json');
  assert.ok(out.includes('s.status === "נשמר"') && out.includes('"נשמר" == s.x') && out.includes('case "נשמר"'));
  assert.ok(out.includes('indexOf("נשמר")') && out.includes('o["נשמר"]') && out.includes('{ "נשמר": 1'));
  assert.ok(out.includes('var arr = ["נשמר", "x"]'));
  assert.ok(out.includes('var label = "נשמר"'), 'the same text as a comparison stays in the whole page, so a label and its comparison never drift apart');
  assert.ok(out.includes('other: "Привет"') && out.includes('show("Привет")'), 'ordinary literals are translated');
  assert.ok(!out.includes('Сохранено'));
  parses(out);
  // the ones in the file: every command word of the booking lines and the kinds
  const ex = I.loadExclude();
  for (const w of ['אישור תור לקוחה', 'תור לקוחה חדש', 'ביטול תור לקוחה', 'שעות פעילות', 'שירות חדש', 'תנאי ביטול', 'אישור תורים', 'חסימת לקוחה', 'הצהרת בריאות לשירות', 'בקשה ממנהל'])
    assert.ok(ex.prefixes.indexOf(w) >= 0 || ex.exact.has(w), w + ' must be excluded');
  for (const w of ['משימה', 'בקשת שינוי']) assert.ok(ex.exact.has(w), w);
  assert.ok(ex.sendFns.has('sendText'));
});

test('/*keep*/ keeps one string, or every string of a group, as it is; the same text elsewhere is translated', () => {
  const html = '<html><body><script>var a = /*keep*/ "שלום עולם"; var b = [/*keep*/ "x", "שלום עולם"]; var c = /*keep*/ ["שלום עולם", "נשמר"]; var d = "שלום עולם"; f(/*keep*/ "נשמר", z);</script></body></html>';
  const out = I.apply(html, 'ru', { map: MAP });
  assert.ok(out.includes('var a = /*keep*/ "שלום עולם"'));
  assert.ok(out.includes('var b = [/*keep*/ "x", "Привет, мир"]'));
  assert.ok(out.includes('var c = /*keep*/ ["שלום עולם", "נשמר"]'));
  assert.ok(out.includes('var d = "Привет, мир"'));
  assert.ok(out.includes('f(/*keep*/ "נשמר", z)'));
  // the real use: the hours line that the diary page sends (the server reads the day names, "עד" and "סגור" in Hebrew)
  const ui = fs.readFileSync(path.join(ROOT, 'lib', 'bookings-ui.js'), 'utf8');
  assert.ok(/DAYS_SENT = \/\*keep\*\/ \['ראשון'/.test(ui) && /\/\*keep\*\/ ' עד '/.test(ui) && /\/\*keep\*\/ 'סגור'/.test(ui) && /line\.push\(DAYS_SENT\[d\]/.test(ui));
});

test('the LTR sheet leaves dir="auto" alone and no dictionary change touches the inlined payload', () => {
  assert.ok(I.apply(PAGE, 'ru', { map: {} }).includes('*:not([dir="auto"]){direction:ltr!important}'));
  const html = '<html lang="he" dir="rtl"><body><script>\nvar D = {"a":"direction:rtl Heebo he-IL \'he-IL\'"}, NET = {}, CAT = {}, tab = \'pending\';\nvar f = "Heebo";</script></body></html>';
  const out = I.apply(html, 'ru', { map: {} });
  assert.ok(out.includes('{"a":"direction:rtl Heebo he-IL \'he-IL\'"}'), 'the payload is byte for byte the same');
  assert.ok(out.includes('var f = "Rubik"'));
});

test('the inlined data payload of an ungated build is never touched', () => {
  const html = '<html><body><script>\nvar D = {"name":"שלום עולם","list":["נשמר"]}, NET = {"a":"שלום עולם"}, CAT = {}, tab = \'pending\';\nvar x = "שלום עולם";\n</script></body></html>';
  const out = I.apply(html, 'ru', { map: MAP });
  assert.ok(out.includes('var D = {"name":"שלום עולם","list":["נשמר"]}, NET = {"a":"שלום עולם"}, CAT = {}, tab = \'pending\';'));
  assert.ok(out.includes('var x = "Привет, мир"'));
});

test('a translation with quotes, backslashes and a closing script tag keeps the script valid', () => {
  const html = '<html><body><script>var a = "שלום עולם"; var b = \'נשמר\'; var h = \'<b>נשמר</b>\';</script></body></html>';
  const out = I.apply(html, 'ru', { map: { 'שלום עולם': 'He said "hi" and \\o/ </script><b>', 'נשמר': "it's saved\nnow" } });
  assert.strictEqual(scripts(out).length, 1, 'no second script appeared');
  parses(out);
  const ctx = vm.createContext({});
  vm.runInContext(scripts(out)[0] + ';this.r = [a, b, h];', ctx);
  assert.strictEqual(ctx.r[0], 'He said "hi" and \\o/ </script><b>');
  assert.strictEqual(ctx.r[1], "it's saved\nnow");
});

test('{admin} in a translation is filled with the administrator name', () => {
  const out = I.apply('<html><body><p>שלום עולם</p></body></html>', 'ru', { map: { 'שלום עולם': 'Спросите {admin}' }, admin: 'IT Solution' });
  assert.ok(out.includes('<p>Спросите IT Solution</p>'));
});

test('extract lists the distinct Hebrew strings, minus the excluded ones', () => {
  const html = '<html><body><h1>שלום עולם</h1><p title="חיפוש">שלום עולם</p><script>sendText("שולח", "x"); var a = "נשמר"; var b = "נשמר "; if (z === "נחסם") {}</script></body></html>';
  const list = I.extract(html);
  assert.deepStrictEqual(list, ['חיפוש', 'נשמר', 'שלום עולם']);
  const d = I.extractDetailed(html);
  assert.ok(d.skipped.some((s) => s.he === 'שולח' && s.reason === 'send'));
  assert.ok(d.skipped.some((s) => s.he === 'נחסם' && s.reason === 'compare'));
});

test('phrase level: known pieces of a longer text, longest first; off for the booking page', () => {
  const map = { 'שלום': 'Привет', 'שלום עולם': 'Привет, мир', 'לקוח חדש': 'новый клиент', 'חדש': 'новый' };
  const html = '<html><body><script>var a = "שלום עולם יפה לקוח חדש";</script></body></html>';
  // only phrases of two words are looked for inside a longer text (a lone word would also hit names of people and businesses)
  assert.ok(I.apply(html, 'ru', { map }).includes('var a = "Привет, мир יפה новый клиент"'));
  assert.ok(I.apply(html, 'ru', { map: { 'שלום': 'Привет' } }).includes('var a = "שלום עולם יפה לקוח חדש"'));
  assert.ok(I.apply(html, 'ru', { map, phrases: false }).includes('var a = "שלום עולם יפה לקוח חדש"'));
  assert.strictEqual(I.t('ru', 'שלום עולם יפה', { map }), 'Привет, мир יפה');
});

test('the exclusion list is the one the tool builds from the code', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'i18n-build-exclude.js'), '--check'], { encoding: 'utf8', timeout: 120000 });
  const built = JSON.parse(out), file = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'i18n', 'exclude.json'), 'utf8'));
  assert.deepStrictEqual(built, file, 'run: node tools/i18n-build-exclude.js (a command line the server parses was added or removed)');
});

test('the dictionary files are valid and the Russian one is a flat map', () => {
  const ru = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'i18n', 'ru.json'), 'utf8'));
  assert.ok(ru && typeof ru === 'object' && !Array.isArray(ru));
  for (const k of Object.keys(ru)) assert.strictEqual(typeof ru[k], 'string', k);
  assert.deepStrictEqual(I.load('xx'), {});
  assert.deepStrictEqual(I.load('../../etc'), {});
  const he = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'i18n', 'he-strings.json'), 'utf8'));
  assert.ok(Array.isArray(he) && he.every((o) => o && typeof o.he === 'string' && typeof o.where === 'string'));
});

test('the Russian texts of the diary: days, link, confirmation, cancellation, reminder', () => {
  assert.strictEqual(T.dayNom(1, '2026-11-23'), 'понедельник 23.11');
  assert.strictEqual(T.dayAcc(2, '2026-11-24'), 'во вторник 24.11');
  assert.strictEqual(T.dayAcc(5, '2026-11-27'), 'в пятницу 27.11');
  assert.deepStrictEqual(T.SHORT, ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']);
  assert.strictEqual(T.linkText({ name: 'Дана Леви', service: 'Маникюр', dayAcc: 'в среду 25.11', time: '10:00', url: 'https://x/b/t' }), 'Здравствуйте, Дана! Вот ссылка для записи на «Маникюр» в среду 25.11 в 10:00: https://x/b/t');
  assert.ok(/подтверждена/.test(T.confirmText({ name: 'Дана', service: 'Маникюр', dayAcc: 'в среду 25.11', time: '10:00', biz: 'Салон', hours: 24, link: 'https://x' })));
  assert.ok(/за 24 ч\./.test(T.confirmText({ name: 'Дана', service: 'Маникюр', dayAcc: 'в среду 25.11', time: '10:00', biz: 'Салон', hours: 24, link: 'https://x' })));
  assert.ok(/в любое время/.test(T.confirmText({ name: 'Дана', service: 'Маникюр', dayAcc: 'в среду 25.11', time: '10:00', biz: 'Салон', hours: 0, link: '' })));
  assert.ok(/отменена/.test(T.cancelledText({ name: 'Дана', service: 'Маникюр', dayAcc: 'в среду 25.11', time: '10:00', biz: 'Салон', url: '' })));
  assert.ok(/завтра в 10:00/.test(T.reminderText({ name: 'Дана', time: '10:00', service: 'Маникюр', biz: 'Салон', link: '' })));
});

test('the booking links, confirmations and reminders: Hebrew as before, Russian only for lang ru', () => {
  const L = require('../lib/book-links.js');
  const R = require('../lib/bookings-remind.js');
  const it = { name: 'דנה לוי', service: 'עיצוב גבות', start: '2026-11-25T10:00:00+02:00', phone: '972500000107', tok: 'a'.repeat(24) };
  const cfg = { cancelHours: 24, linkToken: 'tok123' };
  assert.ok(/^היי דנה, התור שלך ל/.test(L.confirmText(it, 'הקליניקה', cfg, 'https://x')));
  assert.ok(/^היי דנה, התור שלך ל/.test(L.confirmText(it, 'הקליניקה', cfg, 'https://x', 'he')));
  assert.ok(/^Здравствуйте, דנה! Ваша запись на «עיצוב גבות» в среду 25\.11 в 10:00/.test(L.confirmText(it, 'הקליניקה', cfg, 'https://x', 'ru')));
  assert.ok(/^היי דנה, מזכירה שיש לך מחר/.test(R.reminderText(it, 'הקליניקה', true, '')));
  assert.ok(/^Здравствуйте, דנה! Напоминаю: завтра в 10:00/.test(R.reminderText(it, 'הקליניקה', true, '', 'ru')));
  const P = require('../lib/book-page.js');
  assert.ok(P.create && P.clientJs);
});

test('the booking page: lang is accepted only as he or ru', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'book-page.js'), 'utf8');
  assert.ok(/lang: r\.lang === 'ru' \? 'ru' : 'he'/.test(src));
});

test('the diary agent of a ru business answers with Russian day names and says its language', () => {
  const { makeCore } = require('../lib/book-core.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-core-'));
  try {
    require('../lib/demo-trades/beauty.js').seed(dir, Date.now());
    const mk = (lang) => makeCore({ inst: Object.assign({ name: 'demo-beauty', trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'Салон' }, dataPath: dir }, lang ? { lang } : {}), dataPath: dir, tenantId: 'demo-beauty', readOnly: true });
    const ru = mk('ru').handle({ op: 'info', tenant: 'demo-beauty' }), he = mk('').handle({ op: 'info', tenant: 'demo-beauty' });
    return Promise.all([ru, he]).then(([a, b]) => {
      assert.strictEqual(a.lang, 'ru');
      assert.ok(a.days.every((d) => T.SHORT.indexOf(d.w) >= 0), 'short Russian day names: ' + a.days.map((d) => d.w).join());
      assert.strictEqual(b.lang, undefined, 'a Hebrew business answers exactly as before');
      assert.ok(b.days.every((d) => /^[א-ת]+$/.test(d.w)));
    });
  } finally { setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 500); }
});

test('the public booking page of a ru business goes through the dictionary and runs left to right; a Hebrew one does not', async () => {
  const BP = require('../lib/book-page.js'), demo = require('../lib/book-demo.js');
  const ruDemo = { request: async (r) => { const x = await demo.request(r); return r && r.op === 'info' ? Object.assign({}, x, { lang: 'ru' }) : x; } };
  const mkApi = (d) => BP.create({ DATA: os.tmpdir(), sockPath: () => '', log() {}, demo: d });
  const a = mkApi(ruDemo), b = mkApi(demo);
  try {
    const r = await a.handle({ method: 'GET', path: '/b/' + BP.DEMO_LINK, query: {}, ip: '9.9.9.1' });
    assert.strictEqual(r.status, 200);
    assert.ok(/<html lang="ru" dir="ltr">/.test(r.body) && /Rubik/.test(r.body) && !/Heebo/.test(r.body) && /i18n-ltr/.test(r.body));
    parses(r.body);
    const m = await a.handle({ method: 'GET', path: '/b/a/' + BP.DEMO_LINK + '.' + BP.DEMO_TOK, query: {}, ip: '9.9.9.2' });
    if (m.status === 200) { assert.ok(/<html lang="ru" dir="ltr">/.test(m.body)); parses(m.body); }
    const h = await b.handle({ method: 'GET', path: '/b/' + BP.DEMO_LINK, query: {}, ip: '9.9.9.3' });
    assert.ok(/<html lang="he" dir="rtl">/.test(h.body) && /Heebo/.test(h.body) && !/i18n-ltr/.test(h.body));
  } finally { a.stop(); b.stop(); try { fs.rmSync(demo.dir(), { recursive: true, force: true }); } catch (e) { /* none */ } }
});

// ---- the built page ----
function build(lang) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-build-'));
  // an allowlist: the code and what it reads, never data, docs, keys, backups or the other ignored folders
  const dirs = new Set(['lib', 'public', 'sounds', 'fonts', 'legal', 'plans', 'pc', 'setup', 'tools']), noFile = new Set(['instance.json', 'gate-key.txt', 'gate-params.json', 'gate-salt.txt', 'item.json']);
  fs.cpSync(ROOT, dir, { recursive: true, filter: (src) => { const rel = path.relative(ROOT, src); if (!rel) return true; const top = rel.split(path.sep)[0]; return rel.indexOf(path.sep) >= 0 ? dirs.has(top) : (dirs.has(top) || (fs.statSync(src).isFile() && !noFile.has(top))); } });
  fs.copyFileSync(path.join(ROOT, 'gate-salt.txt'), path.join(dir, 'gate-salt.txt'));
  const trade = require('../lib/trades.js').get('beauty'), B = require('../lib/demo-trades/beauty.js').BIZ;
  const inst = { name: 'demo-beauty', owner: B.owner, publicUrl: 'https://' + trade.host + '/', origin: 'https://' + trade.host, basePath: '/', dataDir: 'data', taskPrefix: 'demo',
    pageTitle: 'המוניטור של ' + B.name, screens: trade.screens.slice(), trade: 'beauty', bookings: true, gender: 'f', publicDemo: true,
    biz: { name: B.name, sub: B.sub, phone: '03-0000000', address: 'רחוב הדוגמה 1, ' + B.city } };
  if (lang) inst.lang = lang;
  fs.writeFileSync(path.join(dir, 'instance.json'), JSON.stringify(inst, null, 1));
  const env = Object.assign({}, process.env, { MONITOR_NO_GATE: '1', NODE_PATH: path.join(ROOT, 'node_modules') });
  execFileSync(process.execPath, ['lib/demo-data.js', 'data', '--trade', 'beauty'], { cwd: dir, env, timeout: 120000, stdio: 'pipe' });
  execFileSync(process.execPath, ['build.js'], { cwd: dir, env, timeout: 180000, stdio: 'pipe' });
  const html = fs.readFileSync(path.join(dir, 'docs', 'index.html'), 'utf8');
  const extra = { notFound: fs.readFileSync(path.join(dir, 'docs', '404.html'), 'utf8'), manifest: JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'manifest.webmanifest'), 'utf8')) };
  fs.rmSync(dir, { recursive: true, force: true });
  return { html, extra };
}

test('the built beauty page: without the flag it is Hebrew and right to left; with ru and an empty dictionary it still parses', { timeout: 400000 }, () => {
  const he = build('');
  assert.ok(/<html lang="he" dir="rtl">/.test(he.html) && !/Rubik/.test(he.html) && !/i18n-ltr/.test(he.html));
  assert.strictEqual(he.extra.manifest.dir, 'rtl');
  parses(he.html);
  const ru = build('ru');
  assert.ok(/<html lang="ru" dir="ltr">/.test(ru.html) && /i18n-ltr/.test(ru.html) && /Rubik/.test(ru.html) && !/Heebo/.test(ru.html));
  assert.ok(!/he-IL/.test(ru.html));
  assert.strictEqual(ru.extra.manifest.dir, 'ltr');
  assert.strictEqual(ru.extra.manifest.lang, 'ru');
  assert.ok(/lang="ru" dir="ltr"/.test(ru.extra.notFound));
  parses(ru.html);
  // the same page, every extracted string replaced by a marker: still parses, and every excluded literal is still there as many times
  const d = I.extractDetailed(he.html);
  assert.ok(d.strings.length > 1000, 'a trade page holds thousands of Hebrew strings, got ' + d.strings.length);
  const map = {}; d.strings.forEach((s, i) => { map[s.he] = 'Яя' + i + (/["'\\<>&]/.test(s.he) ? '\'"\\<&' : ''); });
  const rep = {};
  const pseudo = I.apply(he.html, 'ru', { map, report: rep });
  parses(pseudo);
  const lits = (html) => { const m = new Map(); for (const s of scripts(html)) for (const t of I.lex(s)) if (t.k === 'str') { const k = I.decodeJs(t.v).replace(/[\s\u00a0]+/g, ' ').trim(); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = lits(he.html), Z = lits(pseudo);
  assert.ok(rep.skipped.length > 100);
  // (a literal inside a send call or marked /*keep*/ is left alone where it is; the same text elsewhere is a label and is translated)
  for (const [s, why] of rep.skipped) if (why !== 'send' && why !== 'keep') assert.ok((Z.get(s) || 0) >= (A.get(s) || 0), 'an excluded literal was changed: ' + s);
  // the data payload is the same text
  const payload = (h) => h.slice(h.indexOf('var D = {"'), h.indexOf(", tab = 'pending'"));
  assert.strictEqual(payload(pseudo), payload(he.html));
  assert.ok(pseudo.includes("DAYS_SENT = /*keep*/ ['ראשון'") && pseudo.includes("/*keep*/ ' עד '") && pseudo.includes("/*keep*/ 'סגור'"), 'the hours line the page sends stays Hebrew');
});
