'use strict';
// 25.11.2026: Raindrop's private upload page (lib/rd-upload.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const U = require('../lib/rd-upload.js');

const TOK = 'a1b2c3d4e5f6a7b8c9d0';
function env() {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rdu-'));
  fs.mkdirSync(path.join(DATA, 'rd-upload')); fs.writeFileSync(path.join(DATA, 'rd-upload', 'token.txt'), TOK);
  const sent = []; return { DATA, sent, notify: (k, t) => sent.push(t) };
}
const up = (e, item, name, buf, tok) => U.handleUpload(e.DATA, { tok: tok || TOK, item: String(item), name: encodeURIComponent(name) }, buf);

test('an upload is kept on disk, listed and reported once with what is missing', () => {
  const e = env();
  assert.strictEqual(up(e, 2, 'הצעה משהב״ט.pdf', Buffer.from('%PDF')).status, 200);
  const st = U.state(e.DATA);
  assert.strictEqual(st.items[1].files[0].name, 'הצעה משהב״ט.pdf');
  const dir = path.join(e.DATA, 'rd-upload', 'files', '2');
  assert.strictEqual(fs.readdirSync(dir).length, 1);
  assert.strictEqual(U.sweep(e.DATA, e.notify), 1);
  assert.match(e.sent[0], /2\. הצעת מחיר אחת בפורמט משהב״ט: הצעה משהב״ט\.pdf/);
  assert.match(e.sent[0], /עוד חסרים: 1, 3, 4, 5, 6, 7/);
  assert.strictEqual(U.sweep(e.DATA, e.notify), 0);
});

test('wrong token, item, type, size are refused', () => {
  const e = env();
  assert.strictEqual(up(e, 1, 'a.xlsx', Buffer.from('x'), 'ffffffffffffffffffff').status, 403);
  assert.strictEqual(up(e, 9, 'a.xlsx', Buffer.from('x')).status, 400);
  assert.strictEqual(up(e, 0, 'a.xlsx', Buffer.from('x')).status, 400);
  assert.strictEqual(up(e, 1, 'run.exe', Buffer.from('x')).status, 415);
  assert.strictEqual(up(e, 1, 'a.xlsx', Buffer.alloc(0)).status, 400);
  assert.strictEqual(up(e, 1, 'a.xlsx', Buffer.alloc(U.MAX_FILE + 1)).status, 413);
});

test('a name cannot climb out of the folder', () => {
  const e = env();
  assert.strictEqual(up(e, 1, '../../evil.pdf', Buffer.from('x')).status, 200);
  const f = fs.readdirSync(path.join(e.DATA, 'rd-upload', 'files', '1'))[0];
  assert.ok(!f.includes('/') && !f.includes('..' + path.sep));
  assert.strictEqual(U.safeName('a/b\\c.pdf'), 'a_b_c.pdf');
});

test('without a token file nothing is accepted', () => {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rdu-'));
  assert.strictEqual(U.handleUpload(DATA, { tok: '', item: '1', name: 'a.pdf' }, Buffer.from('x')).status, 403);
});

test('the page escapes nothing it should not and lists all seven items', () => {
  const html = U.page(TOK);
  assert.strictEqual((html.match(/class="it"/g) || []).length, 7);
  assert.ok(html.includes('noindex'));
});

test('toDrive uploads every file into its item folder and deletes it only after the same size came back', async () => {
  const e = env();
  up(e, 2, 'הצעה.pdf', Buffer.from('%PDF-1'));
  up(e, 7, 'תעודה.jpg', Buffer.from('jpgdata'));
  const got = [];
  const ok = { ready: () => true, put: async (buf, name, parts) => { got.push(parts.join('/') + '/' + name); return { id: 'x', size: buf.length, link: 'https://drive/x' }; } };
  assert.strictEqual(await U.toDrive(e.DATA, ok), 2);
  assert.deepStrictEqual(got.sort(), ['ריינדרופ הפקות/דוגמאות מצליל/2. הצעת מחיר משהב״ט/הצעה.pdf', 'ריינדרופ הפקות/דוגמאות מצליל/7. תעודת משלוח/תעודה.jpg']);
  assert.strictEqual(fs.readdirSync(path.join(e.DATA, 'rd-upload', 'files', '2')).length, 0);
  assert.ok(U.state(e.DATA).items[1].files.length === 1, 'the page still shows it');
});

test('toDrive keeps the file when Drive fails or reports another size, and does nothing when not connected', async () => {
  const e = env();
  up(e, 1, 'a.xlsx', Buffer.from('12345'));
  const dir = path.join(e.DATA, 'rd-upload', 'files', '1');
  await assert.rejects(U.toDrive(e.DATA, { ready: () => true, put: async () => { throw new Error('drive 500'); } }));
  assert.strictEqual(fs.readdirSync(dir).length, 1);
  assert.strictEqual(await U.toDrive(e.DATA, { ready: () => true, put: async () => ({ size: 3 }) }), 0);
  assert.strictEqual(fs.readdirSync(dir).length, 1);
  assert.strictEqual(await U.toDrive(e.DATA, { ready: () => false, put: async () => ({}) }), 0);
  assert.strictEqual(fs.readdirSync(dir).length, 1);
});
