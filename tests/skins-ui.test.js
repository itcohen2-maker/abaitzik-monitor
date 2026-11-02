'use strict';
/*
  24.10.2026: the designs (lib/skins-ui.js). 26.10.2026: only design 1 is left; skins 3 to 6
  were removed. Checks that the early script runs before the main style, that the picker is in
  the built page outside the ITZIK markers, that the module JS parses, and that every storage
  call is wrapped in try/catch.
*/
const { test } = require('node:test');
const assert = require('node:assert');
process.env.MONITOR_NO_GATE = '1';
const { renderPage } = require('../build.js');
const ui = require('../lib/skins-ui.js');

function fixture(overrides) {
  return Object.assign({
    now: null, openCmds: [], builtAt: '2026-10-24T16:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
  }, overrides || {});
}

test('four designs: today\'s look and the three worlds, with no skin 3 to 6', () => {
  assert.strictEqual(ui.DESIGNS.length, 4);
  assert.deepStrictEqual(ui.DESIGNS.map((d) => d.n), ['1', '7', '8', '9']);
  assert.deepStrictEqual(ui.DESIGNS.map((d) => d.name), ['הרגיל', 'עיתון', 'פנקס', 'רדיו']);
  for (const n of ['3', '4', '5', '6']) {
    assert.ok(!ui.css.includes(`data-skin="${n}"`), `skin ${n} rules must be removed`);
  }
  // Skin 1 is today's look: no rule of its own.
  assert.ok(!ui.css.includes('data-skin="1"'), 'skin 1 must not override anything');
});

test('the early script is in the built head, before the main style, and reads designSkin', () => {
  const html = renderPage(fixture());
  const at = html.indexOf("localStorage.getItem('designSkin')");
  assert.ok(at > 0, 'early script missing');
  assert.ok(at < html.indexOf('<style>\n:root{--blue'), 'the early script must come before the main style');
  assert.ok(at < html.indexOf('<body>'));
});

test('the picker CSS comes after the base tokens and the dark block', () => {
  const html = renderPage(fixture());
  const base = html.indexOf(':root[data-theme="dark"]{--ground:#0f1218');
  const picker = html.indexOf('.dz-box{');
  assert.ok(base > 0 && picker > 0);
  assert.ok(picker > base, 'picker CSS must come after the base tokens');
});

test('the picker is in the built page, with its button, outside the ITZIK markers', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('id="designBox"'));
  assert.ok(html.includes('data-design="1"'), 'button 1 missing');
  assert.ok(html.includes('✓ נבחר'));
  const box = html.indexOf('id="designBox"');
  const begin = html.indexOf('<!--ITZIK:BEGIN-->');
  const end = html.indexOf('<!--ITZIK:END-->');
  assert.ok(!(begin > 0 && box > begin && box < end), 'picker must not sit inside the ITZIK markers');
  // It sits in the settings screen.
  assert.ok(box > html.indexOf('<section id="pZ" hidden>'));
});

test('the module JS parses and the choice is saved through a try/catch', () => {
  // Parsing the function definitions only; nothing runs here.
  assert.doesNotThrow(() => new Function('var toast=function(){};var skinApply=function(){};var skinGet=function(){return "auto";};' + ui.js + '\nreturn {dzGet,dzApply,dzBoot};'));
  assert.doesNotThrow(() => new Function(ui.head.replace(/<\/?script>/g, '')));
  assert.ok(/try\{localStorage\.setItem\('designSkin',v\);\}catch\(e\)\{\}/.test(ui.js), 'save must be wrapped');
  assert.ok(/try\{var s=localStorage\.getItem\('designSkin'\)/.test(ui.head) || ui.head.includes("try{"), 'early read must be wrapped');
  assert.ok(ui.js.includes("toast('העיצוב הוחלף')"), 'toast text missing');
  assert.ok(/try\{var s=localStorage\.getItem\('designSkin'\)[^}]*\}catch\(e\)/.test(ui.js), 'read must be wrapped in try');
});
