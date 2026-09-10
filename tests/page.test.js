'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPage } = require('../build.js');

// The smallest payload build() could hand the page. Later tests spread
// overrides on top of it.
function fixture(overrides) {
  return Object.assign({
    now: null,
    openCmds: [],
    builtAt: '2026-09-10T16:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [],
    food: [],
    pending: [],
    replied: [],
    contacts: [],
    reports: [],
    chat: [],
  }, overrides || {});
}
module.exports = { fixture };

test('renderPage returns a full document with the shared logic inlined', () => {
  const html = renderPage(fixture());
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('window.ML='), 'lib/monitor-logic.js must be inlined as window.ML');
  assert.ok(!html.includes('__LIB__'), 'the __LIB__ marker must be replaced');
  assert.ok(!html.includes('__DATA__'), 'the __DATA__ marker must be replaced');
});

test('requiring build.js does not build', () => {
  const fs = require('fs');
  const path = require('path');
  const out = path.join(__dirname, '..', 'docs', 'index.html');
  const before = fs.existsSync(out) ? fs.statSync(out).mtimeMs : null;
  require('../build.js');
  const after = fs.existsSync(out) ? fs.statSync(out).mtimeMs : null;
  assert.equal(before, after, 'require must not write docs/index.html');
});

test('the pill screen asks whether the pill was taken earlier', () => {
  const html = renderPage(fixture());
  for (const id of ['pillSheet', 'pillQ', 'pillNow', 'pillEarlier', 'pillTime', 'pillOk', 'pillCancel']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  }
  assert.ok(html.includes('type="time" id="pillTime"'));
  assert.ok(html.includes('לקחת את הכדור מוקדם יותר?'));
  // The count starts from the hour he confirms, never from the tap itself.
  assert.ok(html.includes('ML.resolveTaken('));
  assert.ok(html.includes('ML.parsePillTime('));
  assert.ok(html.includes('ML.pillState('));
  assert.ok(html.includes("'לקחתי כדור בשעה '"));
});

test('home order: unread count under the title, alerts and code at the bottom', () => {
  const html = renderPage(fixture());
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > -1, 'missing ' + s); return i; };
  const header = at('</header>');
  const ph = at('<section id="pH">');
  const newBtn = at('id="newBtn"');
  assert.ok(header < ph && ph < newBtn);
  // Nothing sits between the section opening and the unread button.
  assert.equal(html.slice(ph, newBtn).replace(/\s/g, ''), '<sectionid="pH"><buttontype="button"');
  const order = ['id="newBtn"', 'id="micBtn"', 'id="sentCard"', 'class="whatsnew"', 'class="tiles"',
    'id="askBox"', 'id="blkTiles"', 'id="blkIcons"', 'id="alerts"', 'id="codeBox"'];
  const idx = order.map(at);
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i - 1] < idx[i], order[i] + ' must come after ' + order[i - 1]);
  // codeBox is the last block of the home section.
  const codeEnd = html.indexOf('</section>', at('id="codeBox"'));
  const between = html.slice(at('id="codeBox"'), codeEnd);
  assert.ok(!/<div class="(alerts|tiles|grid|row|voice)"/.test(between));
  assert.ok(html.includes('function pinHome('));
  assert.ok(html.includes('--r:18px'));
});

test('chat messages reach the page with id and re', () => {
  const html = renderPage(fixture({ chat: [
    { id: 'a1', at: '2026-09-10T10:00:00', from: 'claude', text: 'x', status: '', re: '' },
    { id: 'a2', at: '2026-09-10T10:05:00', from: 'itzik', text: 'y', status: 'done', re: 'a1' },
  ] }));
  assert.ok(html.includes('"id":"a2"'));
  assert.ok(html.includes('"re":"a1"'));
});

test('the chat screen renders thread cards with copy, paste and send on each', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('ML.splitThreads('));
  assert.ok(html.includes('ML.orderThreads('));
  assert.ok(html.includes("'<details class=\"th th-'"));
  assert.ok(html.includes('class="rb rpaste"'));
  assert.ok(html.includes('class="cp rcopyall"'));
  assert.ok(html.includes("localStorage.getItem('chatStandby')"));
  assert.ok(html.includes('ממתין לתשובה'));
  // Copy sits inside every bubble, as before.
  assert.ok(html.includes('class="cp" data-i='));
  // CSS for the three states.
  for (const s of ['.th-fresh', '.th-standby', '.th-done']) assert.ok(html.includes(s), 'missing css ' + s);
  assert.ok(html.includes("var unreadKeys=unreadList().map(claudeKey);"));
  assert.ok(html.includes("unreadKeys.indexOf(claudeKey(m))>-1"));
  assert.ok(!html.includes("unread.indexOf(m)>-1"), 'freshness must be by key, not identity');
  assert.ok(html.includes("var ri2=flat.indexOf(t.root);"));
  assert.ok(html.includes("b.closest('.bub')||b.closest('.th')"));
});
