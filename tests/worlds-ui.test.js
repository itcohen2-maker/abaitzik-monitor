'use strict';
/*
  26.10.2026: the world layout (lib/worlds-ui.js, plans/2026-10-26-three-worlds.md step 3).
  jsdom is not installed in this repo, so these checks are static: the groups, the folded money
  group, the js parsing in ES5 with stubs, the css slots, and the build wiring. The move and
  restore behaviour (1 to 7 to 1 gives back the exact order) needs a DOM and is not covered here.
*/
const { test } = require('node:test');
const assert = require('node:assert');
process.env.MONITOR_NO_GATE = '1';
const { renderPage } = require('../build.js');
const ui = require('../lib/worlds-ui.js');
const skins = require('../lib/skins-ui.js');

function fixture(overrides) {
  return Object.assign({
    now: null, openCmds: [], builtAt: '2026-10-26T16:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [],
  }, overrides || {});
}

test('eight groups in order, the money group last', () => {
  assert.deepStrictEqual(ui.GROUPS.map((g) => g[0]),
    ['upd', 'net', 'work', 'day', 'proj', 'home', 'more', 'money']);
  assert.strictEqual(ui.GROUPS[0][1], 'התעדכן');
  assert.strictEqual(ui.GROUPS[7][1], '💰 הכסף שלי');
});

test('the money group is a details element that is never opened by the script', () => {
  // The script creates it as <details> and closes it on every worldOn.
  assert.ok(/createElement\(money\?'details':'section'\)/.test(ui.js), 'money must be a details element');
  assert.ok(ui.js.includes('if(md)md.open=false;'), 'money must be closed on every open');
  assert.ok(!/\.open\s*=\s*true/.test(ui.js), 'nothing may open a group by script');
  assert.ok(!/setAttribute\('open'/.test(ui.js), 'no open attribute may be set');
});

test('the js is ES5 (no arrows, let, const or template literals) and parses', () => {
  assert.ok(!/=>/.test(ui.js), 'no arrow functions in the page script');
  assert.ok(!/(^|[^\w])(let|const)\s/.test(ui.js), 'no let or const in the page script');
  assert.doesNotThrow(() => new Function(ui.js));
});

test('the js exports the three entry points and guards the two shared functions', () => {
  for (const name of ['function worldOn(', 'function worldOff(', 'function worldSync(']) {
    assert.ok(ui.js.includes(name), `${name} missing`);
  }
  assert.ok(ui.js.includes("saveOrder=function(box,key){if(document.body.classList.contains('world'))return;"));
  assert.ok(ui.js.includes("floatTile=function(id,up){if(document.body.classList.contains('world'))return;"));
  assert.ok(ui.js.includes("stopPropagation()"), 'the home long press must not start from a world');
});

test('worldSync maps skins 7, 8 and 9 to worlds and anything else to skin 1', () => {
  assert.ok(/s==='7'\|\|s==='8'\|\|s==='9'\)worldOn\(\);else worldOff\(\)/.test(ui.js));
});

test('the css is structure only and has the three world slots', () => {
  assert.ok(ui.css.includes('.wh-empty{display:none!important}'));
  assert.ok(ui.css.includes('.wg-none{display:none}'));
  assert.ok(ui.css.includes('#worldHome{display:block}'));
  assert.ok(ui.css.includes(':root:not([data-skin="7"]):not([data-skin="8"]):not([data-skin="9"]) #worldHome{display:none}'));
  for (const f of ['world-paper', 'world-pad', 'world-radio']) {
    const w = require(`../lib/${f}.js`);
    assert.strictEqual(typeof w.css, 'string', `${f} must export css`);
    assert.ok(ui.css.includes(w.css) || w.css === '', `${f} css must be in worlds css`);
  }
});

test('the three world files exist and each has a comment naming its world', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const names = { 'world-paper.js': '7 עיתון', 'world-pad.js': '8 פנקס', 'world-radio.js': '9 רדיו' };
  for (const [file, label] of Object.entries(names)) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', file), 'utf8');
    assert.ok(src.split('\n')[0].includes(label), `${file} must name its world`);
  }
});

test('the built page has the picker with all four designs and the worlds css and js', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('id="designBox"'));
  for (const n of ['1', '7', '8', '9']) {
    assert.ok(html.includes(`data-design="${n}"`), `button ${n} missing`);
  }
  assert.ok(html.includes('<span>עיתון</span>'), 'the picker shows only the name');
  assert.ok(!html.includes('7 עיתון'), 'the picker must not print the number');
  assert.ok(html.includes('.wh-empty{display:none!important}'));
  assert.ok(html.includes('function worldSync('));
  assert.ok(html.includes("boot('worlds',worldSync);"));
});

test('the worlds boot runs after the tiles and icons are ordered, and before the picker boot', () => {
  const html = renderPage(fixture());
  const ordered = html.indexOf("applyOrder(icons,'iconOrder')");
  const worlds = html.indexOf("boot('worlds',worldSync);");
  const design = html.indexOf("boot('design',dzBoot);");
  assert.ok(ordered > 0 && worlds > ordered, 'worlds boot must come after the ordering');
  assert.ok(design > worlds, 'worlds boot must come before the picker boot');
});

test('dzApply calls worldSync and the label uses the name only', () => {
  assert.ok(skins.js.includes("if(typeof worldSync==='function')worldSync();"));
  assert.ok(skins.js.includes(".replace('✓ נבחר','').trim()"));
  assert.ok(!skins.js.includes('\\\\d'), 'the old number regex must be gone');
});
