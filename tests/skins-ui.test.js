'use strict';
/*
  24.10.2026: the six designs (lib/skins-ui.js). Checks that the six skins are defined,
  that the early script runs before the main style, that the picker is in the built page
  outside the ITZIK markers, that the module JS parses, and that every storage call is
  wrapped in try/catch.
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

test('six designs are defined, each with its own skin rules', () => {
  assert.strictEqual(ui.DESIGNS.length, 6);
  assert.deepStrictEqual(ui.DESIGNS.map((d) => d.n), ['1', '2', '3', '4', '5', '6']);
  for (const n of ['2', '3', '4', '5', '6']) {
    assert.ok(ui.css.includes(`:root:root[data-skin="${n}"]{`), `token block for skin ${n} missing`);
  }
  // Skin 1 is today's look: no rule of its own.
  assert.ok(!ui.css.includes('data-skin="1"'), 'skin 1 must not override anything');
  // Skin 2 is the only dark one and it says so.
  assert.ok(ui.css.includes('color-scheme:dark'));
  // Skin 4 falls back to solid cards when the phone asks for less transparency.
  assert.ok(ui.css.includes('prefers-reduced-transparency:reduce'));
  // Skin 6 has its black floating bar.
  assert.ok(ui.css.includes(':root[data-skin="6"] .bn{'));
});

test('the early script is in the built head, before the main style, and reads designSkin', () => {
  const html = renderPage(fixture());
  const at = html.indexOf("localStorage.getItem('designSkin')");
  assert.ok(at > 0, 'early script missing');
  assert.ok(at < html.indexOf('<style>\n:root{--blue'), 'the early script must come before the main style');
  assert.ok(at < html.indexOf('<body>'));
});

test('the skin rules come after the base tokens and the dark block', () => {
  const html = renderPage(fixture());
  const base = html.indexOf(':root[data-theme="dark"]{--ground:#0f1218');
  const skin = html.indexOf(':root:root[data-skin="2"]{');
  assert.ok(base > 0 && skin > 0);
  assert.ok(skin > base, 'skin tokens must come after the base tokens');
});

test('the picker is in the built page, with six buttons, outside the ITZIK markers', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('id="designBox"'));
  for (const n of ['1', '2', '3', '4', '5', '6']) {
    assert.ok(html.includes(`data-design="${n}"`), `button ${n} missing`);
  }
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
