'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { when } = require('../watchdog.js');

test('the watchdog reads systemd timestamps as UTC', () => {
  assert.equal(when('Sun 2026-09-27 19:02:22 UTC'), Date.parse('2026-09-27T19:02:22Z'));
  assert.ok(isNaN(when('')));
});
