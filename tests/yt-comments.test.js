'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Y = require('../lib/yt-comments.js');

test('parseInput knows channel ids, handles, videos, users', () => {
  assert.deepStrictEqual(Y.parseInput('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'), { kind: 'id', v: 'UCabcdefghijklmnopqrstuv' });
  assert.deepStrictEqual(Y.parseInput('https://www.youtube.com/@abaitzik'), { kind: 'handle', v: '@abaitzik' });
  assert.deepStrictEqual(Y.parseInput('@abaitzik'), { kind: 'handle', v: '@abaitzik' });
  assert.deepStrictEqual(Y.parseInput('https://youtu.be/dQw4w9WgXcQ?si=x'), { kind: 'video', v: 'dQw4w9WgXcQ' });
  assert.deepStrictEqual(Y.parseInput('https://www.youtube.com/shorts/dQw4w9WgXcQ'), { kind: 'video', v: 'dQw4w9WgXcQ' });
  assert.strictEqual(Y.parseInput('hello'), null);
});

test('questions and leads are marked', () => {
  assert.ok(Y.isQuestion('נקניק כתף בקר בעייתי?'));
  assert.ok(Y.isQuestion('איך מתחילים'));
  assert.ok(!Y.isQuestion('תודה רבה'));
  assert.ok(Y.isLead('כמה עולה אצלך טיפול'));
  assert.ok(!Y.isLead('סרטון מעולה'));
});

test('merge drops items older than 30 days and dedupes', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const r = Y.merge([{ id: 'a', at: '2026-10-01T00:00:00Z' }, { id: 'b', at: '2026-11-10T00:00:00Z', text: 'x' }],
    [{ id: 'b', at: '2026-11-10T00:00:00Z', text: 'y' }, { id: 'c', at: '2026-11-11T00:00:00Z' }], now);
  assert.deepStrictEqual(r.map((x) => x.id), ['c', 'b']);
  assert.strictEqual(r[1].text, 'y');
});

test('run resolves a handle, reads comments, writes files, never posts', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'));
  assert.deepStrictEqual(Y.setChannel(d, '@shop'), { ok: true });
  const calls = [], when = new Date(Date.now() - 3600e3).toISOString();
  const fake = async (u) => {
    calls.push(u);
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (u.includes('/channels?')) return ok({ items: [{ id: 'UC1234567890123456789012', snippet: { title: 'החנות' } }] });
    if (u.includes('/commentThreads?')) return ok({ items: [{ id: 'th1', snippet: { videoId: 'vid00000001', totalReplyCount: 0, topLevelComment: { snippet: { textOriginal: 'כמה עולה?', authorDisplayName: 'דנה', publishedAt: when } } } }] });
    if (u.includes('/videos?')) return ok({ items: [{ id: 'vid00000001', snippet: { title: 'סרטון' } }] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const r = await Y.run(d, 'AIzaTEST', { fetch: fake });
  assert.strictEqual(r.changed, true);
  const p = Y.forPage(d);
  assert.strictEqual(p.ch.title, 'החנות');
  assert.strictEqual(p.items[0].q, true);
  assert.strictEqual(p.items[0].lead, true);
  assert.strictEqual(p.items[0].vtitle, 'סרטון');
  assert.ok(calls.every((u) => u.startsWith('https://www.googleapis.com/youtube/v3/')));
  const again = await Y.run(d, 'AIzaTEST', { fetch: fake });
  assert.strictEqual(again.changed, false);
  assert.deepStrictEqual(Y.setChannel(d, 'הסרה'), { ok: true, removed: true });
  assert.strictEqual(Y.forPage(d), null);
});

test('parseMsg reads the 🔌 message', () => {
  assert.strictEqual(Y.parseMsg('משימה\n▶️ ערוץ יוטיוב: https://youtube.com/@x'), 'https://youtube.com/@x');
  assert.strictEqual(Y.parseMsg('▶️ ערוץ יוטיוב: https://youtube.com/@x'), 'https://youtube.com/@x');
  assert.strictEqual(Y.parseMsg('משימה ▶️ ערוץ יוטיוב: הסרה'), 'הסרה');
});
