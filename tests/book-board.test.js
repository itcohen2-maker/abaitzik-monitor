'use strict';
// 23.11.2026, Itzik: "a board on the whole screen that shows her who booked what" and "also a small weekly one, on the phone".
// A waiting appointment blinks only when she approves every booking herself (not on automatic approval).
const test = require('node:test');
const assert = require('node:assert');
const UI = require('../lib/bookings-ui.js');
const src = UI.page.toString();
test('the screen has the small week and the full board', () => {
  assert.ok(/function weekMini\(/.test(src) && /pendTop\(\) \+ weekMini\(\)/.test(src));
  assert.ok(/function boardOpen\(/.test(src) && /data-a="board"/.test(src));
  assert.ok(/a === 'wkday'\) boardOpen\(/.test(src));
});
test('waiting blinks only on manual approval', () => {
  assert.ok(/function manual\(\) \{ return String\(cfgView\(\)\.approval \|\| 'approve'\) !== 'auto'; \}/.test(src));
  assert.ok(/var wait = manual\(\) && its\.some/.test(src));
  assert.ok(/var wait = manual\(\) && i\.src === 'link'/.test(src));
});
test('the card says who booked it', () => {
  assert.ok(/קבעה בעצמה מהקישור/.test(src) && /נקבע ממך/.test(src));
});
test('the board takes the trade colours', () => {
  assert.ok(/#bkBoard\{--bkA:/.test(UI.css('beauty')));
});
