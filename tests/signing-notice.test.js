const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

/*
  18.11.2026: a signing page notice ("X פתח את ... לחתימה.") is information, not a request. The session
  got it, had nothing to do, exited 0 without a reply, and the session-end check sent "הודעה נשארה בלי
  תשובה" to Itzik about it. It is never handed to a session and never counted as missed.
*/
const src = fs.readFileSync(path.join(__dirname, "..", "worker.js"), "utf8");
const body = src.match(/function missedOf\(list, code, got\) \{[\s\S]*?\n\}/)[0];
const missedOf = new Function(body + "; return missedOf;")();
const NL = String.fromCharCode(10);
const notice = { id: "n1", auto: true, text: "חתימה על מסמך" + NL + "נועה ברק פתח את \"טופס קליטה למטופלת\" לחתימה." };
const done = { id: "d1", auto: true, text: "חתימה על מסמך" + NL + "כל החתימות התקבלו על \"טופס קליטה למטופלת\"." };
const mine = { id: "m1", text: "שלום, תשלח לי את הדוח" };

test("a signing notice is not reported as missed, with or without a reply", () => {
  assert.deepStrictEqual(missedOf([notice], 0, new Set()), []);
  assert.deepStrictEqual(missedOf([notice], null, new Set()), []);
});

test("the setup page open notice is not reported as missed", () => {
  const setupNotice = { id: "s1", auto: true, text: "דף הקמה" + NL + "בדיקה פתח את דף ההקמה עכשיו." };
  assert.deepStrictEqual(missedOf([setupNotice], 0, new Set()), []);
  assert.deepStrictEqual(missedOf([setupNotice], null, new Set()), []);
});

test("a real request and a completion notice are still reported when unanswered", () => {
  assert.deepStrictEqual(missedOf([mine, done], 0, new Set()).map((m) => m.id), ["m1", "d1"]);
});

test("the queue, the missed check and the retry check all skip the signing notice", () => {
  assert.strictEqual((src.split("פתח את (?:.*לחתימה|דף ההקמה עכשיו)").length - 1), 3);
});
