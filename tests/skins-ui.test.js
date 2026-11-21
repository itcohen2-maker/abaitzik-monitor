'use strict';
/*
  4.11.2026: the design picker and the three worlds were removed (lib/skins-ui.js). Itzik keeps
  the look the monitor has. These checks keep them from coming back by accident.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
process.env.MONITOR_NO_GATE = '1';
const { renderPage } = require('../build.js');
const ui = require('../lib/skins-ui.js');

function fixture(overrides) {
  return Object.assign({
    now: null, openCmds: [], builtAt: '2026-11-04T12:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
  }, overrides || {});
}

test('one design only, no picker in settings, no worlds in the page', () => {
  assert.deepStrictEqual(ui.DESIGNS.map((d) => d.n), ['1']);
  const html = renderPage(fixture());
  assert.ok(!html.includes('id="designBox"'), 'no design picker');
  assert.ok(!html.includes('function worldSync('), 'no worlds script');
  assert.ok(!html.includes('#worldHome'), 'no worlds css');
  for (const f of ['worlds-ui.js', 'world-paper.js', 'world-pad.js', 'world-radio.js']) {
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'lib', f)), f + ' removed');
  }
});

test('an old saved world is cleared before the first paint, and the day and night setting stays', () => {
  const html = renderPage(fixture());
  const at = html.indexOf("localStorage.removeItem('designSkin')");
  assert.ok(at > 0 && at < html.indexOf('<body>'), 'the clearing runs in the head');
  assert.ok(html.includes('window.DZ_META={};'));
  assert.ok(html.includes('data-skin="dark"'), 'the day and night buttons stay');
  assert.doesNotThrow(() => new Function(ui.head.replace(/<\/?script>/g, '')));
  assert.doesNotThrow(() => new Function(ui.js + "; return dzBoot;"));
});
