const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// 16.10.2026, Itzik: every monitor, Rinat's and every customer's, gets the savings skill.
const saving = require('../lib/saving.js');
const worker = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const pcTask = fs.readFileSync(path.join(__dirname, '..', 'pc-task.js'), 'utf8');
const pw = require('../lib/pegasus-work.js');

test('the saving skill exists and has rules', () => {
  assert.ok(fs.existsSync(saving.FILE));
  const r = saving.rules();
  assert.ok(/1\. תכנון במודל גבוה/.test(r));
  assert.ok(/סבב בלי עבודה לא מפעיל מודל/.test(r));
  assert.ok(saving.promptLines().length > 5);
});

test('every worker session and every PC task carry the rules', () => {
  assert.ok(worker.includes("require('./lib/saving.js').promptLines()"));
  assert.ok(pcTask.includes("require('./lib/saving.js').promptLines()"));
});

test('a decision tap is parsed and written on its card', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pegdec-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ ask: 'שאלה אחת?', opts: ['כן', 'לא'] }));
  assert.deepStrictEqual(pw.parseAnswer('פגסוס: שאלה אחת? ← כן'), { ask: 'שאלה אחת?', pick: 'כן' });
  assert.strictEqual(pw.parseAnswer('שאלה רגילה'), null);
  assert.strictEqual(pw.waiting(pw.readDir(dir)).length, 1);
  const c = pw.answer(dir, 'שאלה אחת?', 'כן', '2026-10-16T05:00:00Z');
  assert.ok(c && c.answer === 'כן');
  assert.strictEqual(pw.waiting(pw.readDir(dir)).length, 0);
  assert.strictEqual(pw.todo(pw.readDir(dir)).length, 1);
  pw.take(dir, 'a.json');
  assert.strictEqual(pw.todo(pw.readDir(dir)).length, 0);
  assert.ok(pw.task(c).includes('התשובה שלו: כן'));
});
