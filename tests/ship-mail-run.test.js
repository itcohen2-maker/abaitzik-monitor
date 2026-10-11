'use strict';
// One pass of the mail runner on a temporary folder, with the dir provider.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, dirProvider } = require('../ship-mail.js');

test('a pass applies what it can, queues the rest, and a second pass changes nothing', async () => {
  const sd = fs.mkdtempSync(path.join(os.tmpdir(), 'shipmail-'));
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), 'shipin-'));
  fs.writeFileSync(path.join(sd, 'rows.json'), JSON.stringify([{ id: 'a', po: '6411', status: '', etd: '', eta: '', customs: '', container: '', history: [] }]));
  fs.writeFileSync(path.join(inbox, '1.json'), JSON.stringify({ id: 'm1', from: 'x@example.com', subject: 'booking confirm 6411', received: '2026-10-06T08:00:00Z', body: '' }));
  fs.writeFileSync(path.join(inbox, '2.json'), JSON.stringify({ id: 'm2', from: 'x@example.com', subject: 'vessel departed', received: '2026-10-06T09:00:00Z', body: '' }));
  const first = await run({ sd, provider: dirProvider(inbox), now: new Date('2026-10-06T10:00:00Z') });
  assert.deepStrictEqual(first, { fetched: 2, applied: 1, queued: 1 });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(sd, 'rows.json'), 'utf8'))[0].status, 'BOOKING CONFIRM');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(sd, 'mail-queue.json'), 'utf8')).length, 1);
  const second = await run({ sd, provider: dirProvider(inbox), now: new Date('2026-10-06T10:10:00Z') });
  assert.strictEqual(second.applied, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(sd, 'mail-queue.json'), 'utf8')).length, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(sd, 'mail-state.json'), 'utf8')).lastReceived, '2026-10-06T09:00:00Z');
});
