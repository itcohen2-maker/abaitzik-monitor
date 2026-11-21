'use strict';
// 21.11.2026: a private video gets a direct /p/ link, every other private file stays behind the password.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const VL = require('../lib/video-link.js');
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-'));
  const DATA = path.join(root, 'data'), out = path.join(root, 'p');
  fs.mkdirSync(path.join(DATA, 'files-private'), { recursive: true }); fs.mkdirSync(out);
  fs.writeFileSync(path.join(DATA, 'files-private', 'a.mp4'), 'video');
  fs.writeFileSync(path.join(DATA, 'files-private', 'invoice.pdf'), 'pdf');
  return { root, DATA, out };
}
test('a private video gets a stable direct link, copied readable', () => {
  const s = setup();
  const a = VL.linkFor(s.DATA, 'a.mp4', s.out), b = VL.linkFor(s.DATA, 'a.mp4', s.out);
  assert.match(a, /^https:\/\/form\.it-solution\.co\.il\/p\/[a-f0-9]{20}\.mp4$/);
  assert.equal(a, b);
  const f = path.join(s.out, a.split('/').pop());
  assert.equal(fs.readFileSync(f, 'utf8'), 'video');
  assert.equal((fs.statSync(path.join(s.DATA, 'status', 'video-link.key')).mode & 0o777), 0o600);
  fs.rmSync(s.root, { recursive: true, force: true });
});
test('negative: a document, a missing file or a path stays without a direct link', () => {
  const s = setup();
  assert.equal(VL.linkFor(s.DATA, 'invoice.pdf', s.out), null);
  assert.equal(VL.linkFor(s.DATA, 'nope.mp4', s.out), null);
  assert.equal(VL.linkFor(s.DATA, '../x.mp4', s.out), null);
  assert.equal(fs.readdirSync(s.out).length, 0);
  fs.rmSync(s.root, { recursive: true, force: true });
});
test('negative: a folder that can not be written gives no link (the #file= link stays)', () => {
  const s = setup();
  assert.equal(VL.linkFor(s.DATA, 'a.mp4', path.join(s.root, 'missing-dir')), null);
  fs.rmSync(s.root, { recursive: true, force: true });
});
