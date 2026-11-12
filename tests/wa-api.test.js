'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const WA = require('../lib/wa-api.js');

const raw = Buffer.from('{"entry":[]}');
const hex = (s) => crypto.createHmac('sha256', s).update(raw).digest('hex');
const meta = { appSecret: 'app', token: 'T', phoneId: '123' };
const kapso = { kapsoKey: 'K', kapsoSecret: 'ks', phoneId: '123', token: 'T', appSecret: 'app' };

test('sigOk: Meta header against appSecret', () => {
  assert.ok(WA.sigOk(meta, raw, { 'x-hub-signature-256': 'sha256=' + hex('app') }));
  assert.ok(!WA.sigOk(meta, raw, { 'x-hub-signature-256': 'sha256=' + hex('other') }));
  assert.ok(!WA.sigOk(meta, raw, { 'x-hub-signature-256': hex('app') }), 'prefix is required for Meta');
});

test('sigOk: Kapso header against kapsoSecret, no prefix', () => {
  assert.ok(WA.sigOk(kapso, raw, { 'x-webhook-signature': hex('ks') }));
  assert.ok(WA.sigOk(kapso, raw, { 'X-Webhook-Signature': hex('ks') }));
  assert.ok(!WA.sigOk(kapso, raw, { 'x-webhook-signature': 'sha256=' + hex('ks') }));
});

test('sigOk: wrong, missing and secretless never pass and never throw', () => {
  assert.ok(!WA.sigOk(kapso, raw, { 'x-webhook-signature': 'abc' }));
  assert.ok(!WA.sigOk(kapso, raw, {}));
  assert.ok(!WA.sigOk(kapso, raw, undefined));
  assert.ok(!WA.sigOk({}, raw, { 'x-hub-signature-256': 'sha256=' + hex(''), 'x-webhook-signature': hex('') }));
  assert.ok(!WA.sigOk(meta, raw, { 'x-webhook-signature': hex('app') }), 'kapso header ignored without kapsoSecret');
  assert.ok(!WA.sigOk(undefined, raw, {}));
  assert.ok(!WA.sigOk(meta, null, { 'x-hub-signature-256': 'x' }));
});

test('base and auth, Meta direct and Kapso', () => {
  assert.strictEqual(WA.base(meta), 'https://graph.facebook.com/v21.0');
  assert.strictEqual(WA.base({ graph: 'v22.0' }), 'https://graph.facebook.com/v22.0');
  assert.deepStrictEqual(WA.auth(meta), { Authorization: 'Bearer T' });
  assert.strictEqual(WA.base(kapso), 'https://api.kapso.ai/meta/whatsapp/v24.0');
  assert.strictEqual(WA.base({ kapsoKey: 'K', kapsoGraph: 'v25.0' }), 'https://api.kapso.ai/meta/whatsapp/v25.0');
  assert.deepStrictEqual(WA.auth(kapso), { 'X-API-Key': 'K' });
});

test('media: meta url and download', () => {
  assert.strictEqual(WA.mediaMetaUrl(meta, 'M1'), 'https://graph.facebook.com/v21.0/M1');
  assert.strictEqual(WA.mediaMetaUrl(kapso, 'M1'), 'https://api.kapso.ai/meta/whatsapp/v24.0/M1?phone_number_id=123');
  assert.deepStrictEqual(WA.mediaDownload(meta, { url: 'https://x/u' }), { url: 'https://x/u', headers: { Authorization: 'Bearer T' } });
  assert.deepStrictEqual(WA.mediaDownload(kapso, { url: 'https://x/u', download_url: 'https://k/d' }), { url: 'https://k/d', headers: {} });
  assert.deepStrictEqual(WA.mediaDownload(kapso, { url: 'https://x/u' }), { url: 'https://x/u', headers: { 'X-API-Key': 'K' } });
});
