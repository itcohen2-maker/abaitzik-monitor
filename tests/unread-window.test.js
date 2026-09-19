/*
  The red button counts a window, and the window is wider than the page's memory.

  From Itzik's diagnostic, 19.9 06:35: 150 messages in memory out of 376, red
  button 13. Both numbers were true and the second one was only true by luck.
  The count was taken over the slice in memory; the window it is supposed to
  cover runs back to the last reset, 228 answers deep. An unread answer older
  than the slice was not counted at all until some screen pulled the file.

  These run the page's own functions, out of the page that was actually built.
*/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const main = blocks.map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
function slice(from, to) {
  const a = main.indexOf(from), b = main.indexOf(to);
  assert.ok(a > -1 && b > a, 'missing ' + from + ' .. ' + to);
  return main.slice(a, b);
}
const SRC = slice('function seenIds(){', 'function renderNew(){');

const key = (m) => (m.at || '') + '|' + String(m.text || '').slice(0, 40);

// Twenty answers, of which the page is only holding the newest five.
const ALL = [];
for (let i = 0; i < 20; i++) {
  ALL.push({ at: '2026-09-1' + (i < 10 ? '7T0' : '8T0') + (i % 10) + ':00:00+03:00',
             from: 'claude', text: 'תשובה ' + i });
}
const HEAD = ALL.slice(-5);

function ctxWith(seen, over) {
  const ctx = Object.assign({
    D: { chat: HEAD, codex: [], resetSeenAt: '2026-09-16T20:05:00',
         ansKeys: ALL.map(key) },
    LAZY: { chat: { n: ALL.length } },
    lazyDone: {},
    idList: (k) => (k === 'chatSeenIds' ? seen.slice() : []),
    chatSeen: () => '',
    isMail: () => false,
    allAnswers: () => HEAD.slice(),
    isFresh: (m) => seen.indexOf(key(m)) === -1,
    codexFresh: () => [],
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

test('an unread answer older than the slice in memory is still counted', () => {
  // Everything read except the very first answer, which is outside the head.
  const seen = ALL.slice(1).map(key);
  const ctx = ctxWith(seen);
  assert.equal(vm.runInContext('unreadList().length', ctx), 0,
    'the list can only see the slice, and that is fine');
  assert.equal(vm.runInContext('unreadTally()', ctx), 1,
    'the count must see the whole window');
  assert.equal(vm.runInContext('unreadCount()', ctx), 1,
    'and the number on the button with it');
});

test('all read means zero, with nothing invented by the wider window', () => {
  const ctx = ctxWith(ALL.map(key));
  assert.equal(vm.runInContext('unreadTally()', ctx), 0);
  assert.equal(vm.runInContext('unreadCount()', ctx), 0);
});

test('the count is never smaller than the list already on screen', () => {
  // No keys shipped at all: the old behaviour, and it must still hold.
  const ctx = ctxWith([], { D: { chat: HEAD, codex: [],
    resetSeenAt: '2026-09-16T20:05:00', ansKeys: [] } });
  assert.equal(vm.runInContext('unreadTally()', ctx), HEAD.length);
});
