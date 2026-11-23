'use strict';
// 23.11.2026: the manager tile and its explanation card are on every trade home (not only inside עוד כלים), the customer's
// copy says what the workers are for, and every new Hebrew line has its Russian in lib/i18n/ru.json.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const TC = require('../lib/trade-cards.js');
const trades = require('../lib/trades.js');
const AG = require('../lib/agents-ui.js');
const ROOT = path.join(__dirname, '..');
const ru = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/i18n/ru.json'), 'utf8'));

test('a trade home marks its day column, so the manager tile goes to the top of the home', () => {
  const beauty = TC.html({ trade: 'beauty', dataPath: '/tmp/none', gender: 'f' }, Date.now());
  assert.match(beauty, /<section id="tradeCards" data-trade-home="1"/);
  // the owner's own layout keeps its merge script (his tile sits in the day column by the owner's rules)
  const owner = trades.OWNER ? TC.html({ ownerLook: true, trade: null, dataPath: '/tmp/none' }, Date.now()) : '';
  assert.doesNotMatch(owner, /data-trade-home/);
});

test('the bare home keeps the manager tile visible (it is a direct child of #pH)', () => {
  const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  assert.ok(build.includes('#pH.bare > *:not(#talkCard):not(#bareBtn):not(#approvalsBox):not(#leadAlert):not(#tradeCards):not(#mgrTop){display:none!important}'));
});

test('agents-ui anchors the tile to the trade home and keeps the old anchor elsewhere', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/agents-ui.js'), 'utf8');
  assert.ok(src.includes("#tradeCards[data-trade-home]"), 'trade home anchor');
  assert.ok(src.includes("document.getElementById('blkIcons')"), 'old anchor kept');
});

test('customer copy: the tile names the workers, the card explains them in feminine and masculine', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/agents-ui.js'), 'utf8');
  ['המנהלת שלי והעובדים', 'המנהל שלי והעובדים', 'תני להם עבודות שחוזרות על עצמן, הם יעשו לבד', 'כאן יושבת המנהלת שלך, ולידה העובדים.',
    'כאן יושב המנהל שלך, ולידו העובדים.', 'שאתה קובע', 'שאת קובעת', 'מה זה?', 'הסתר', '➕ עובד חדש', 'אומרים לו פעם אחת מה לעשות ומתי, בכתב או בקול, והוא עושה את זה לבד: כל יום, כל שבוע או בשעה שבחרת.',
    'מה ששולח הודעות לאנשים או עולה כסף, מחכה קודם לאישור שלך.'].forEach((t) => assert.ok(src.includes(t), t));
});

test('no dash in the new visible copy and every new Hebrew line has a Russian line', () => {
  const lines = ['המנהלת שלי והעובדים', 'המנהל שלי והעובדים', 'תני להם עבודות שחוזרות על עצמן, הם יעשו לבד', 'תן להם עבודות שחוזרות על עצמן, הם יעשו לבד',
    'מה זה?', 'הסתר', '➕ עובד חדש', 'כאן יושבת המנהלת שלך, ולידה העובדים.', 'כאן יושב המנהל שלך, ולידו העובדים.', 'עובדים',
    'אומרים לו פעם אחת מה לעשות ומתי, בכתב או בקול, והוא עושה את זה לבד: כל יום, כל שבוע או בשעה שבחרת.', 'דוגמאות:',
    'כל ערב לשלוח לי מי מגיעה מחר', 'כל ערב לשלוח לי מי מגיע מחר', 'כל יום ראשון להכין פוסט לאינסטגרם',
    'כל חודש למצוא לקוחות שלא חזרו ולהכין להן הודעה', 'כל חודש למצוא לקוחות שלא חזרו ולהכין להם הודעה',
    'מה ששולח הודעות לאנשים או עולה כסף, מחכה קודם לאישור שלך.'];
  lines.forEach((l) => {
    assert.ok(!/[-–]/.test(l), 'no dash: ' + l);
    assert.ok(ru[l], 'russian for: ' + l);
  });
});
