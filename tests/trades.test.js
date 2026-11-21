'use strict';
// 21.11.2026: the trade registry (lib/trades.js), one entry per service trade demo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../lib/trades.js');
const BUILD = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
const BAD = /[‐–—]|שולמן|פבלו|איליי|אלון|רינת|אמינוב|יהודה|שחר|יניב|נחמן|יואל|גיתית|לולוס|פגסוס|סלינדה|הום סטייל|איציק|יצחק/;

test('every trade is complete', () => {
  const ids = Object.keys(T.TRADES);
  assert.ok(ids.includes('gypsum'));
  for (const id of ids) {
    const t = T.TRADES[id];
    assert.strictEqual(t.id, id);
    assert.match(t.host, /^demo-[a-z]+\.m\.it-solution\.co\.il$/);
    assert.match(t.accent, /^#[0-9a-f]{6}$/);
    assert.strictEqual(t.cards.length, 3);
    assert.ok(t.screens.length > 0);
    for (const s of t.screens.concat(t.cards.map((c) => c.open))) assert.ok(BUILD.includes('  ' + s + ': ['), 'no screen ' + s);
    assert.doesNotMatch(JSON.stringify(t), BAD);
  }
});

test('an unknown trade is null', () => {
  assert.strictEqual(T.get('nope'), null);
  assert.strictEqual(T.get(undefined), null);
  assert.strictEqual(T.get('gypsum').id, 'gypsum');
});
