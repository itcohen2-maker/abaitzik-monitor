'use strict';
/*
  Home tiles carry data-grp (net, work, day, proj, home, money) by their visible label.
  Checks that every data-grp value is one of the six groups, and that the labels the
  groups list names carry the right one. Tiles not in the list have no attribute.
*/
const { test } = require('node:test');
const assert = require('node:assert');
process.env.MONITOR_NO_GATE = '1';
const { renderPage } = require('../build.js');

const GROUPS = ['net', 'work', 'day', 'proj', 'home', 'money'];

function fixture(overrides) {
  return Object.assign({
    now: null, openCmds: [], builtAt: '2026-10-24T16:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
  }, overrides || {});
}

// The opening tag of the element that contains the given text or id, with its data-grp (or null).
function groupOf(html, needle) {
  const at = html.indexOf(needle);
  assert.ok(at >= 0, `"${needle}" not in the page`);
  const open = Math.max(html.lastIndexOf('<button', at), html.lastIndexOf('<a ', at));
  const tag = html.slice(open, html.indexOf('>', open) + 1);
  const m = tag.match(/\sdata-grp="([^"]*)"/);
  return m ? m[1] : null;
}

test('every data-grp value on the page is one of the six groups', () => {
  const html = renderPage(fixture());
  const values = [...html.matchAll(/\sdata-grp="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(values.length > 0, 'no tile carries data-grp');
  for (const v of values) assert.ok(GROUPS.includes(v), `unknown group "${v}"`);
});

test('the labelled tiles carry the right group', () => {
  const html = renderPage(fixture());
  assert.strictEqual(groupOf(html, 'id="gLolos"'), 'money', 'הנהלת חשבונות');
  assert.strictEqual(groupOf(html, 'id="icNet"'), 'net', 'ניטור רשתות');
  assert.strictEqual(groupOf(html, 'id="gShopList"'), 'home', 'קניות');
  assert.strictEqual(groupOf(html, 'id="gMyDay"'), 'day', 'מה יש לי היום');
  assert.strictEqual(groupOf(html, 'id="gHomestyle"'), 'work', 'הום סטייל');
  assert.strictEqual(groupOf(html, 'id="gHealth"'), null, 'תקלות is not in the list');
});
