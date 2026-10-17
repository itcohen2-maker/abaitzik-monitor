const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// 17.10.2026, Itzik: every lesson that may cause trouble again reaches every monitor.
const lessons = require('../lib/lessons.js');
const worker = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const pcTask = fs.readFileSync(path.join(__dirname, '..', 'pc-task.js'), 'utf8');

test('the lessons skill exists and has rules', () => {
  assert.ok(fs.existsSync(lessons.FILE));
  assert.ok(/1\. לא עונים "לא מצאתי"/.test(lessons.rules()));
  assert.ok(lessons.promptLines().length > 5);
});

test('every worker session and every PC task carry the lessons', () => {
  assert.ok(worker.includes("require('./lib/lessons.js').promptLines()"));
  assert.ok(pcTask.includes("require('./lib/lessons.js').promptLines()"));
});
