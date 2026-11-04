'use strict';
// 4.11.2026, Itzik: "כל דבר שעולה לרשת צריך לעבור בדיקה של שומר עם איות". The guard, and every Shachar letter through it.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const G = require('../lib/spell-guard.js');
const S = require('../lib/shachar.js');

let have = true;
try { execFileSync('hunspell', ['-d', 'he_IL', '-l'], { input: 'שלום' }); } catch (e) { have = false; }

test('a mail preview glues two lines with no space, and the guard sees it', { skip: !have }, () => {
  assert.deepStrictEqual(G.check('<div>שחר</div><div>כאן בשבילך</div>', { html: true }), ['שחרכאן']);
  assert.deepStrictEqual(G.check('<div>שחר</div> <div>כאן בשבילך</div>', { html: true }), []);
});

test('every Shachar letter, as Gmail shows it, passes the spell guard', { skip: !have }, async () => {
  const tok = path.join(os.tmpdir(), 'sg-token-' + process.pid);
  fs.writeFileSync(tok, 'x');
  for (const k of ['AUTO_LETTER', 'READY_LETTER', 'NUDGE_LETTER']) {
    let body = null;
    const fetch = async (u, o) => { body = JSON.parse(o.body); return { ok: true }; };
    const r = await S.sendLetter({ fetch, mailTokenFile: tok, dir: os.tmpdir() }, 'a@b.co', S[k]);
    assert.strictEqual(r, 'sent', k);
    assert.deepStrictEqual(G.check(body.subject + ' ' + body.html, { html: true }), [], k);
    assert.ok(!/שחרכאן/.test(G.previewText(body.html)), k);
    assert.ok(!('headers' in body) || !body.headers['List-Unsubscribe'], k + ': no newsletter header');
  }
  fs.unlinkSync(tok);
});
