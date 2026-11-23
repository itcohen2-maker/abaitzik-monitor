'use strict';
// 21.11.2026: the QA findings of the trade demos (branch qa-fix). Source level pins for what a browser run showed (the runs are in the
// report): Back closes the trade sheets, the nav label, the demo toast for notifications, one סיום in the desktop arrange mode, the
// "מה עשיתי" actions mapped to real screens, contrast tokens, the platform texts of the microphone help, the demo chrome,
// and "כלול במחיר" (lib/trade-free.js) with the trainings open to every instance.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const BUILD = read('build.js');
const trades = require('../lib/trades.js');
const TC = require('../lib/trade-cards.js');
const TD = require('../lib/trade-desk.js');
const TF = require('../lib/trade-free.js');
const DASH = /[‐‑‒–—―]|(^|\s)-(\s|$)/;

// ---- contrast helpers
const rgb = (h) => { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('4: the Back mechanism knows the trade sheets, the + menu and the open tools, and not the docked desktop chat', () => {
  assert.match(BUILD, /window\.trBackClose&&!navStack\.length&&!overlayOpen\(null\)/);
  assert.match(BUILD, /hasAttribute\('data-desk-auto'\)\)continue/);
  const src = TC.page.toString();
  assert.match(src, /window\.trBackClose = function/);
  for (const part of ['.trSheet', "'gMenu'", "'bareBtn'", 'moreTap']) assert.ok(src.includes(part), part);
  // the three sheets are .trSheet: the two of the microphone help and the "כלול במחיר" one
  assert.match(src, /s\.className = 'trSheet'/);
  assert.ok(src.includes("'trFb'") && src.includes("'trGuide'"));
  assert.match(TF.page.toString(), /s\.id = 'trFree'; s\.className = 'trSheet'/);
  // Esc closes a sheet
  assert.match(src, /e\.key !== 'Escape'/);
});

test('5: the pressed tab with something new is readable, in both schemes', () => {
  assert.doesNotMatch(BUILD, /\.bn button\[aria-pressed="true"\]\.hasnew\{color:#fff\}/);
  assert.strictEqual((BUILD.match(/\.bn button\[aria-pressed="true"\]\.hasnew\{color:var\(--ink\)\}/g) || []).length, 2);
});

test('6: "הפעלת התראות" in a demo is a toast and opens nothing', () => {
  const src = require('../lib/demo-acts.js').client.toString();
  assert.match(src, /closest\('#ntfyBtn'\)/);
  assert.match(src, /e\.preventDefault\(\); e\.stopImmediatePropagation\(\); window\.demoToast\(\{ got: 'להפעיל התראות'/);
  // the real monitor's link is untouched
  assert.match(BUILD, /<a class="abtn" id="ntfyBtn" href="#" target="_blank"/);
  assert.match(BUILD, /if\(b&&out\)b\.href='https:\/\/ntfy\.sh\/'\+out;/);
});

test('7: arranging on the trade desktop: one סיום, Esc leaves, the bar stands in the work area', () => {
  const r = TD.rules();
  assert.match(r, /body\.tjig #talkCard,body\.tjig #fcSheet\{display:none!important\}/);
  assert.match(r, /body\.tjig #tileArr,body\.tjig #tileArrTop\{display:none!important\}/);
  assert.match(r, /#tileBar\{inset-inline-end:0;inset-inline-start:calc\(88px \+ var\(--dkDay,460px\)\);bottom:var\(--dkBot,0px\)\}/);
  const src = TD.page.toString();
  assert.match(src, /classList\.contains\('tjig'\)\) \{ var td = \$\('tileDone'\)/);
  assert.match(src, /wasBare/); // the folded home is opened while arranging from the settings
  // the phone's arrange mode (rows with 44px controls) is untouched: its rules are outside the desktop query
  assert.match(BUILD, /@media not all and \(min-width:1000px\) and \(pointer:fine\)\{\nbody\.editing\{padding-bottom/);
});

test('8: the demo chrome: a compact bar with a dismiss, a round button in a short window, the padding and the toast follow', () => {
  const t = require('../lib/public-demo.js').tail({ publicDemo: true });
  assert.match(t, /@media \(max-height:520px\)\{#demoWa\{[^}]*border-radius:50%/);
  assert.match(t, /#demoWa small\{display:none\}/);
  assert.match(t, /#demoWaX/);
  assert.match(t, /demoWaOff/);
  assert.match(t, /\.toast\{bottom:calc\(76px \+ var\(--demoBar,0px\)/);
  assert.match(t, /#demoToast\{position:fixed;inset-inline:16px;top:calc\(var\(--demoRib,56px\) \+ 8px\)/);
  new Function(t.match(/<script>([\s\S]*)<\/script>/)[1]); // the page script parses
  assert.strictEqual(require('../lib/public-demo.js').tail({}), '');
  assert.ok(ratio('#0f7a41', '#ffffff') >= 4.5);
});

test('9: every action of "מה עשיתי" opens a screen that exists in that trade; "בוצע" is a status', () => {
  // ALWAYS mirrors TENANT_ALWAYS of build.js, plus the answers and reports tabs
  const m = /const TENANT_ALWAYS = \[([^\]]+)\]/.exec(BUILD);
  const always = m[1].split(',').map((x) => x.replace(/['\s]/g, ''));
  assert.deepStrictEqual(TC.ALWAYS.filter((x) => !/^n[AR]$/.test(x)).sort(), always.sort());
  const ids = new Set([...BUILD.matchAll(/^ {2}(g[A-Za-z0-9]+): \[/gm)].map((x) => x[1]));
  for (const t of Object.values(trades.TRADES)) {
    for (const r of t.did) {
      if (r[3] === 'בוצע') { assert.strictEqual(r[4], undefined, t.id + ' status row has no action'); continue; }
      assert.ok(['לראות', 'לשלוח'].includes(r[3]), r[3]);
      assert.ok(TC.targetOk(t, r[4]), t.id + ': ' + r[1] + ' -> ' + r[4]);
      assert.ok(r[4] === 'nA' || ids.has(r[4]), r[4] + ' is a tile of build.js');
    }
    const h = TC.html({ trade: t.id, dataPath: fs.mkdtempSync(path.join(os.tmpdir(), 'qf-')), publicDemo: true });
    const acts = t.did.filter((r) => r[3] !== 'בוצע').length;
    assert.strictEqual((h.match(/class="trAct" data-open="/g) || []).length, acts, t.id);
    assert.ok(!/class="trAct"[^>]*>בוצע/.test(h));
  }
  // a calendar tap only where the trade has the calendar
  const g = TC.html({ trade: 'gypsum', dataPath: fs.mkdtempSync(path.join(os.tmpdir(), 'qf-')), publicDemo: true });
  const b = TC.html({ trade: 'beauty', dataPath: fs.mkdtempSync(path.join(os.tmpdir(), 'qf-')), publicDemo: true });
  assert.ok(trades.get('gypsum').screens.includes('gBhCal') && !trades.get('beauty').screens.includes('gBhCal'));
  assert.doesNotMatch(b, /class="trRow trTap"/);
  void g;
});

test('10: the reply box microphone says something in a demo and when it fails', () => {
  const rp = read('lib/reply-pill.js');
  assert.match(rp, /window\.PUBLIC_DEMO&&window\.demoToast/);
  assert.match(rp, /לא שמעתי כלום/);
  assert.match(rp, /ההקלטה לא עבדה/);
  assert.match(rp, /הדפדפן הזה לא מקליט כאן/);
  // no recorder in a demo: the main fix of today stays
  const acts = require('../lib/demo-acts.js').client.toString();
  assert.match(acts, /window\.MediaRecorder = function \(\) \{ throw/);
  // every microphone entry of the page goes through recStart, which a demo replaces with the demo line
  assert.match(require('../lib/public-demo.js').tail({ publicDemo: true }), /window\.recStart=function\(\)\{demoToast\(/);
  assert.match(TC.page.toString(), /if \(DEMO\) \{ listening = true; paint\(\); return; \}/);
});

test('11: text colours are tokens that pass 4.5:1 in both schemes', () => {
  const css = TC.html({ trade: 'gypsum', dataPath: fs.mkdtempSync(path.join(os.tmpdir(), 'qf-')), publicDemo: true });
  const light = { red: '#c5221f', grn: '#0b7a3e', blu: '#1558b0', org: '#b34f00', pur: '#8e24aa' };
  const dark = { redt: '#ff8a80', grn: '#5ee09a', blu: '#8ab4f8', org: '#ffa94d', pur: '#d19cff' };
  for (const k of Object.keys(light)) assert.ok(css.includes('--tx-' + k + ':' + light[k]), k);
  for (const k of Object.keys(dark)) assert.ok(css.includes('--tx-' + k + ':' + dark[k]), k);
  const lightBg = ['#ffffff', '#f6f8fc', '#eef2fa', '#e6f6ec', '#fdeceb'], darkBg = ['#181d27', '#0f1218', '#141922', '#12301f', '#331615'];
  assert.ok(ratio(light.red, '#ffffff') >= 4.5, 'white on the red badge');
  for (const k of ['grn', 'blu', 'org', 'pur']) for (const b of lightBg) assert.ok(ratio(light[k], b) >= 4.5, k + ' on ' + b);
  for (const k of Object.keys(dark)) for (const b of darkBg) assert.ok(ratio(dark[k], b) >= 4.5, 'dark ' + k + ' on ' + b);
  assert.ok(ratio(light.red, '#fff') >= 4.5);
  // the accent of each trade on its own soft background and on the page, and white on the accent (buttons, the active chip)
  for (const [id, L] of Object.entries(TC.LOOK)) {
    const [la, ls, lo] = L[0], [da, ds, dO] = L[1];
    for (const bg of [ls, '#f6f8fc', '#ffffff']) assert.ok(ratio(la, bg) >= 4.5, id + ' light accent on ' + bg);
    assert.ok(ratio(la, lo) >= 4.5, id + ' light on-accent');
    for (const bg of [ds, '#0f1218', '#181d27']) assert.ok(ratio(da, bg) >= 4.5, id + ' dark accent on ' + bg);
    assert.ok(ratio(da, dO) >= 4.5, id + ' dark on-accent');
  }
  assert.match(css, /\.achip\.on\{color:var\(--on-accent\)\}/);
  assert.match(css, /\.bn\{background:color-mix\(in srgb,var\(--ground\) 96%,transparent\)\}/);
});

test('12, 13: 44px hit areas and two line tool subtitles are in the trade styles only', () => {
  const css = TC.html({ trade: 'gypsum', dataPath: fs.mkdtempSync(path.join(os.tmpdir(), 'qf-')), publicDemo: true });
  for (const part of ['.trX{width:44px;height:44px}', '.trLinkS{min-height:44px', '#reloadBtn.reloadbig{height:44px', '#tradeCards .trQuiet u::after{content:"";position:absolute;inset:-14px -10px}',
    'label:has(>input[data-kind])', '-webkit-line-clamp:2!important;white-space:normal!important']) assert.ok(css.includes(part), part);
  assert.strictEqual(TC.html({}), ''); // any other monitor: nothing
});

test('14: the notes list label has no dash, and the wipe dialog of a demo says nothing is sent', () => {
  assert.doesNotMatch(BUILD, /– רשימה/);
  assert.match(BUILD, /data-list="dash">רשימת קווים</);
  assert.match(BUILD, /confirm\(window\.PUBLIC_DEMO\?'בהדגמה לא נשלחת בקשה ולא נמחק כלום/);
  assert.match(BUILD, /toast\(window\.PUBLIC_DEMO\?'בהדגמה לא נשלחה בקשה ולא נמחק כלום\.'/);
});

test('15: the microphone help has a text for iPhone, Android and a computer', () => {
  assert.deepStrictEqual(Object.keys(TC.MIC).sort(), ['and', 'desk', 'ios']);
  for (const [k, v] of Object.entries(TC.MIC)) {
    for (const f of ['dev', 'q', 'ttl']) assert.ok(v[f] && v[f].length > 5, k + ' ' + f);
    assert.doesNotMatch(JSON.stringify(v), DASH);
    if (k !== 'ios') { assert.ok(v.steps.includes('מיקרופון') && v.steps.includes('אפשר'), k); assert.doesNotMatch(JSON.stringify(v), /אייפון|Safari/); }
  }
  assert.match(TC.MIC.and.steps, /הגדרות אתר/);
  assert.match(TC.MIC.desk.steps, /מנעול/);
  assert.match(TC.MIC.ios.q, /האייפון/);
  assert.match(TC.html({ trade: 'gypsum', dataPath: fs.mkdtempSync(path.join(os.tmpdir(), 'qf-')), publicDemo: true }), /"mic":{"ios":/);
});

test('no dash between words in anything visible that this change adds', () => {
  const strings = [];
  for (const t of Object.values(trades.TRADES)) for (const r of t.did) strings.push(r[1], r[2], r[3]);
  for (const it of TF.FREE) strings.push(it.name, it.line);
  strings.push(TF.TITLE, TF.INTRO, JSON.stringify(TC.MIC));
  for (const s of strings) assert.doesNotMatch(s, DASH, s);
  for (const f of ['lib/trade-free.js']) { const src = read(f).replace(/\/\*[\s\S]*?\*\//, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); for (const m of src.matchAll(/'([^'\n]*[א-ת][^'\n]*)'/g)) assert.doesNotMatch(m[1], DASH, m[1]); }
});

test('כלול במחיר: nothing for a monitor without a trade, the owner wording, the data is honest', () => {
  for (const i of [null, {}, { trade: 'nope', dataPath: '/tmp' }, { trade: 'gypsum' }]) assert.strictEqual(TF.html(i), '');
  assert.strictEqual(TF.TITLE, 'כלול במחיר');
  assert.strictEqual(TF.INTRO, 'הכול כבר בפנים, בלי תוספת תשלום.');
  assert.doesNotMatch(read('lib/trade-free.js').replace(/\/\*[\s\S]*?\*\//g, ''), /בחינם/);
  const ids = new Set([...BUILD.matchAll(/^ {2}(g[A-Za-z0-9]+): \[/gm)].map((x) => x[1]));
  for (const it of TF.FREE) {
    assert.ok(it.id && it.icon && it.name && it.line && it.open, it.id);
    if (it.open.startsWith('chat:')) assert.ok(TF.CHAT[it.open.slice(5)], it.open);
    else assert.ok(ids.has(it.open), it.open + ' is a tile of build.js');
    if (it.alt) assert.ok(BUILD.includes('id="' + it.alt + '"'), it.alt + ' is an icon of build.js');
  }
  for (const [cmd, icon] of Object.entries(TF.CHAT)) assert.ok(BUILD.includes("on('" + icon + "',function(){fcSheet();fcSend('" + cmd + "');});"), cmd);
  // what each trade gets: every screen row is one of its own tiles, the trainings are always there
  for (const t of Object.values(trades.TRADES)) {
    const got = TF.items(t);
    for (const c of ['coach', 'personal', 'sales']) assert.ok(got.some((x) => x.id === c), t.id + ' ' + c);
    for (const it of got) if (!it.open.startsWith('chat:') && !it.alt) assert.ok(TC.targetOk(t, it.open), t.id + ' ' + it.id);
  }
  const names = (id) => TF.items(trades.get(id)).map((x) => x.id).join(',');
  assert.strictEqual(names('beauty'), 'coach,personal,sales,remind,ideas,cal');
  assert.strictEqual(names('consult'), 'coach,personal,sales,quote,sign,meet,cal');
  const h = TF.html({ trade: 'gypsum', dataPath: '/tmp/x', plan: 'trial' });
  assert.match(h, /כלול במחיר/);
  assert.ok(h.includes('"אימון עסקי":"icFcCoach"'));
  new Function(h.match(/<script>([\s\S]*)<\/script>/)[1]);
  assert.match(BUILD, /try \{ return require\('\.\/lib\/trade-free\.js'\)\.html\(inst\); \} catch \(e\) \{ return ''; \}/);
});

test('the three trainings are not tied to a package, an add-on or the trial', () => {
  const F = require('../lib/features.js');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-feat-'));
  assert.strictEqual(F.read(d, 'some-new-customer').fastChat, true); // no plan file, no features file: the lowest case
  fs.mkdirSync(path.join(d, 'status'), { recursive: true });
  fs.writeFileSync(path.join(d, 'status', 'features.json'), JSON.stringify({ bank: false, money: false }));
  assert.strictEqual(F.read(d, 'some-new-customer').fastChat, true);
  // the icons are in every page but the owner's (his own home hides them on purpose), and appear when the chat row is allowed
  assert.match(BUILD, /inst\.name === 'abaitzik' \? '<style>[^']*#icFcSales,#icFcCoach,#icFcPersonal/);
  assert.match(BUILD, /function fcBoot\(\)\{\n var r=document\.getElementById\('fcRow'\);if\(!r\|\|r\.hidden\)return;\n \['icFcSales','icFcCoach','icFcPersonal'\]/);
  const chatApi = read('lib/fast-chat.js');
  assert.doesNotMatch(chatApi.replace(/\/\/.*$/gm, ''), /plan-io|stateOf|plan\.status/);
});
