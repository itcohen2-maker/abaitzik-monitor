// build.js writes the page inside a template string, so a lone \d turns into a plain d
// and every time check fails silently (the alarm tile, 13.10). Escapes must be doubled.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('build.js has no single backslash regex escapes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  const a = src.indexOf('const PAGE = `'), b = src.indexOf('</html>`;', a);
  assert.ok(a > 0 && b > a);
  const first = src.slice(0, a).split('\n').length;
  const bad = src.slice(a, b).split('\n').map((l, i) => [first + i, l]).filter(([, l]) => /(^|[^\\])\\[dDwWsSb](?![a-z])/.test(l) && /\/\^|\.test\(|\.match\(|\.exec\(/.test(l));
  assert.deepStrictEqual(bad.map(([n]) => n), []);
});
