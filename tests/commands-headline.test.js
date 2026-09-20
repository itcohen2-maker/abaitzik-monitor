const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/*
  20.9, he sent a photo of the open tasks list with four rows circled: a date,
  a tag, and nothing between them. "סימנתי בדף. מה זה?". Four task files were
  written with a `title` and a `note` and no `text`, and the row read `text`
  alone. The row now falls back to the title, and this keeps a task that has no
  headline at all from ever reaching the screen blank again.
*/
test('every open task has something to show on its row', () => {
  const dir = path.join(__dirname, '..', 'data', 'commands', 'commands');
  const open = fs.readdirSync(dir)
    .filter(n => n.endsWith('.json') && /^[0-9]/.test(n))
    .map(n => ({ n, c: JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) }))
    .filter(x => !x.c.done);
  assert.ok(open.length > 0, 'there must be open tasks to check');
  for (const { n, c } of open) {
    const line = String(c.text || c.title || c.note || '').trim();
    assert.ok(line, n + ' is open but has no text, title or note to show');
  }
});

// The page must carry the fallback, not just the files.
test('the built page falls back to the title of a task', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  assert.ok(src.includes('c.text || c.title || c.note'),
    'openCmds must fall back past text');
});
