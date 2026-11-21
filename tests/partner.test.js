'use strict';
// 14.11.2026: Facebook through partner access (lib/partner.js): what the customer pasted, matched to a shared Page.
const test = require('node:test');
const assert = require('node:assert');
const PT = require('../lib/partner.js');

test('partner: a Page link, a user name or an id is understood', () => {
  assert.deepEqual(PT.pageRef('https://www.facebook.com/PilatesStudioTLV'), { name: 'pilatesstudiotlv' });
  assert.deepEqual(PT.pageRef('facebook.com/PilatesStudioTLV/?ref=x'), { name: 'pilatesstudiotlv' });
  assert.deepEqual(PT.pageRef('https://www.facebook.com/profile.php?id=61550000000001'), { id: '61550000000001' });
  assert.deepEqual(PT.pageRef('https://www.facebook.com/people/Studio/61550000000002/'), { id: '61550000000002' });
  assert.deepEqual(PT.pageRef('1341874565686928'), { id: '1341874565686928' });
  assert.equal(PT.pageRef('https://evil.example.com/x'), null);
  assert.equal(PT.pageRef(''), null);
});

test('partner: the claimed Page is found among the shared ones, and its owner\'s ad accounts with it', () => {
  const pages = [{ id: '111', name: 'סטודיו', username: 'PilatesStudioTLV', link: 'https://www.facebook.com/PilatesStudioTLV', business: { id: 'B1' } },
    { id: '2220000000', name: 'אחר', link: 'https://www.facebook.com/other', business: { id: 'B2' } }];
  const accounts = [{ id: 'act_1', business: { id: 'B1' } }, { id: 'act_2', business: { id: 'B2' } }, { id: 'act_3', business: { id: 'B1' } }];
  const p = PT.match(PT.pageRef('https://facebook.com/pilatesstudiotlv'), pages);
  assert.equal(p.id, '111');
  assert.deepEqual(PT.adsOf(p, accounts), ['act_1', 'act_3']);
  assert.equal(PT.match(PT.pageRef('2220000000'), pages).id, '2220000000');
  assert.equal(PT.match(PT.pageRef('https://facebook.com/nobody'), pages), null);
});

test('partner: the page escapes what was pasted and shows our business id', () => {
  const h = PT.page('t1', 'c'.repeat(32), { input: '"><script>x</script>' }, null);
  assert.ok(!h.includes('<script>x'));
  assert.ok(h.includes(PT.BIZ));
});
