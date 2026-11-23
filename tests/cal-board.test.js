"use strict";
// 23.11.2026, Itzik: "לוח שנה כזה גם למוניטור שלי". lib/cal-board.js: the small week and the full board over his Google calendar.
// Only an instance that says calBoard: true gets it (the dummy copy first, setup/owner-dummy.sh).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const CB = require("../lib/cal-board.js");
test("off unless calBoard: true", () => {
  assert.strictEqual(CB.html({}), "");
  assert.strictEqual(CB.html({ ownerLook: true }), "");
  assert.strictEqual(CB.html(null), "");
  assert.ok(CB.html({ calBoard: true }).length > 5000);
  assert.strictEqual(require("../lib/instance.js").DEFAULTS.calBoard, false);
});
test("the page has the week and the board, and calSheet shows the week only where the module is", () => {
  const src = CB.page.toString();
  assert.ok(/W\.calWeekMini = function/.test(src) && /W\.calBoardOpen = function/.test(src));
  assert.ok(/data-cb="board"/.test(src) && /🎥 כניסה לפגישה/.test(src));
  const b = fs.readFileSync(path.join(__dirname, "../build.js"), "utf8");
  assert.ok(/if\(D\.cal&&typeof calWeekMini==='function'\)h\+=calWeekMini\(\);/.test(b));
  assert.ok(/require\('\.\/lib\/cal-board\.js'\)\.html\(inst\)/.test(b));
  assert.ok(/j\.calBoard=true;/.test(fs.readFileSync(path.join(__dirname, "../setup/owner-dummy.sh"), "utf8")));
});
test("the page script runs on its own (no syntax error)", () => {
  assert.doesNotThrow(() => new Function("(" + CB.page.toString() + ")"));
});

test("a week is Sunday to Saturday, and now is always inside the hours", () => {
  const src = CB.page.toString();
  assert.ok(/function weekStart\(d\) \{ return addDays\(d, -dow\(d\)\); \}/.test(src));
  assert.ok(/w0 = weekStart\(t\)/.test(src) && /if \(bd\.mode === 'week'\) bd\.day = weekStart\(bd\.day\)/.test(src));
  assert.ok(/ds\.indexOf\(t\) >= 0/.test(src));
});
