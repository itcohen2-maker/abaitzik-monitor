'use strict';
/*
  24.10: the "מחכה לך" strip is in the built page when an approve doc exists, and the
  plain choices code skips approve docs. Uses renderPage with a payload like build() makes.
*/
const { test } = require('node:test');
const assert = require('node:assert');
process.env.MONITOR_NO_GATE = '1';
const { renderPage } = require('../build.js');
const { normalize } = require('../lib/approvals.js');
const ui = require('../lib/approvals-ui.js');
// Same minimal payload as tests/page.test.js (not required from there: that would rerun its tests).
function fixture(overrides) {
  return Object.assign({
    now: null, openCmds: [], builtAt: '2026-09-10T16:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
  }, overrides || {});
}

const approve = normalize({
  id: '20261024-1000-mail', type: 'approve', at: '2026-10-24T10:00:00+03:00',
  question: 'לשלוח מייל לספק', preview: 'שלום, מצרף את החשבונית', why: 'הוא ביקש',
  kind: 'send', expires: '2099-01-01T10:00:00+03:00',
}, Date.now());

test('the built page carries the approval strip when an approve doc exists', () => {
  const html = renderPage(fixture({ choices: [approve] }));
  assert.ok(html.includes('id="approvalsBox"'), 'strip markup missing');
  assert.ok(html.includes('function renderApprovals'), 'renderApprovals missing');
  assert.ok(html.includes("boot('approvals',renderApprovals)"), 'boot wiring missing');
  assert.ok(html.includes('approvalsSnooze'), 'snooze key missing');
  assert.ok(html.includes('לשלוח מייל לספק'), 'the question is not in the page data');
  assert.ok(html.includes('"type":"approve"'), 'the approve doc is not in the page data');
});

test('the strip is in the page even with no approvals, hidden by default', () => {
  const html = renderPage(fixture({ choices: [] }));
  assert.ok(html.includes('id="approvalsBox" class="apv" aria-live="polite" hidden'));
});

test('renderAsk skips approve docs, plain choices keep their card', () => {
  const html = renderPage(fixture({ choices: [approve] }));
  assert.ok(html.includes("c.type!=='approve'"), 'renderAsk must filter approve docs');
});

test('the approval UI script is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(ui.js));
});
