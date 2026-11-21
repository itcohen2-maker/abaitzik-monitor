'use strict';
// 14.10: circles in instance.json draw round icons that open a site, candle or theatre, https only.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const inst = require('../lib/instance.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
const start = src.indexOf('function tenantCircleLinks(');
const end = src.indexOf('function tenantTiles(');
const { tenantCircleLinks } = new Function(src.slice(start, end) + '; return { tenantCircleLinks };')();

test('circles is a known instance field, so the merge keeps it', () => {
  assert.deepStrictEqual(inst.DEFAULTS.circles, []);
});

test('draws nothing without circles', () => {
  assert.strictEqual(tenantCircleLinks({}), '');
  assert.strictEqual(tenantCircleLinks({ circles: [] }), '');
});

test('candle and theatre circles are new, open in a new tab, and drop non https links', () => {
  const html = tenantCircleLinks({ circles: [
    { key: 'ner-c', kind: 'ner', title: 'נרות', url: 'https://candletimes.com/' },
    { key: 'th-c', kind: 'theatre', title: 'תיאטרון', url: 'https://bubot-theatre.vercel.app/' },
    { key: 'bad', kind: 'ner', title: 'x', url: 'http://example.com/' },
  ] });
  assert.strictEqual((html.match(/class="ic icNew"/g) || []).length, 2);
  assert.strictEqual((html.match(/data-new="1"/g) || []).length, 2);
  assert.ok(html.includes('class="c c-th"'));
  assert.ok(html.includes('class="c c-nr"'));
  assert.ok(!html.includes('example.com'));
});
