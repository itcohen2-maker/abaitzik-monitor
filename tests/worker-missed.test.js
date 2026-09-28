const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/*
  28.9, 16:36: "הודעה נשארה בלי תשובה" arrived about two messages that had been
  answered at 16:22, because the session holding them was stopped at ten
  minutes and any exit other than 0 counted every message as missed. The worker
  runs main() on load, so the function is taken from the source and run alone.
*/
const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const body = src.match(/function missedOf\(list, code, got\) \{[\s\S]*?\n\}/)[0];
const missedOf = new Function(body + '; return missedOf;')();

const answered = new Set(['a']);
const list = [{ id: 'a', file: 'a.json' }, { id: 'b', file: 'b.json' }];

test('a stopped session does not report a message that already has an answer', () => {
  assert.deepStrictEqual(missedOf(list, null, answered).map((m) => m.id), ['b']);
});

test('a stopped session with every message answered reports nothing', () => {
  assert.deepStrictEqual(missedOf([list[0]], null, answered), []);
});

test('a clean exit still reports a message nobody answered', () => {
  assert.deepStrictEqual(missedOf(list, 0, answered).map((m) => m.id), ['b']);
});

test('the close handler uses it, not the exit code alone', () => {
  assert.ok(src.includes('const missed = missedOf(list, code);'));
  assert.ok(!src.includes("code === 0 ? unanswered(list) : list"));
});

// 28.9: a reply stamped 17:57 was written at 17:46. The worker pulls such a
// stamp back to the moment the file was written.
test('a reply stamped later than its file is pulled back to the write time', () => {
  assert.ok(/Date\.parse\(m\.at\) > mt \+ 60 \* 1000/.test(src));
  assert.ok(src.includes('d.at = new Date(mt).toISOString();'));
});
