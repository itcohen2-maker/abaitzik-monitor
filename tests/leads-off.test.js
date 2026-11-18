'use strict';
process.env.MONITOR_NO_GATE = '1';
/*
  18.11.2026, Itzik: "יש לקוחות למשל כמו רינת שלא מעניין אותה לידים, היא לא צריכה את זה."
  leadsOff (lib/features.js): a customer with it has no 🔔 tile, no leads tab in העסק שלי, and no lead lines in
  the brief or the manager. Without it nothing changes, and Itzik's own monitor never takes it.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const F = require('../lib/features.js');
const { renderPage } = require('../build.js');

const SRC = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
const cut = new Function(SRC.slice(SRC.indexOf('function jsStandIns('), SRC.indexOf('// 22.10, Itzik: the lecture tile')) + '; return cutFor;')();

const LEAD = { id: 'biz-1', kind: 'lead', name: 'דנה', phone: '0501111111', status: 'חדש', at: '2026-11-18T08:00:00.000Z', source: 'site' };
function dp(flags) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-'));
  fs.mkdirSync(path.join(d, 'status'), { recursive: true });
  if (flags) fs.writeFileSync(path.join(d, 'status', 'features.json'), JSON.stringify(flags));
  fs.mkdirSync(path.join(d, 'biz', 'biz'), { recursive: true });
  fs.writeFileSync(path.join(d, 'biz', 'biz', 'biz-1.json'), JSON.stringify(LEAD));
  return d;
}
const ON = dp({ wa: true, leadsOff: true }), OFF = dp({ wa: true });
const req = (m) => require(path.join(ROOT, m));

test('features: leadsOff is known, off by default, on from the file, never for abaitzik', () => {
  assert.ok(F.KNOWN.includes('leadsOff'));
  assert.equal(F.read(OFF, 't1').leadsOff, false);
  assert.equal(F.read(ON, 't1').leadsOff, true);
  assert.equal(F.read(ON, 't1').wa, true, 'the other flags stay');
  assert.equal(F.read(ON, 'abaitzik').leadsOff, false);
  assert.equal(F.leadsOff(ON, 't1'), true);
  assert.equal(F.leadsOff(OFF, 't1'), false);
  assert.equal(F.leadsOff(ON, 'abaitzik'), false);
  const d = dp(null);
  assert.equal(F.enable(d, 'leadsOff'), true);
  assert.equal(F.leadsOff(d, 't2'), true);
});

test('the 🔔 tile: none with leadsOff, as before without it and in his own monitor', () => {
  const lift = new Function('inst', 'require', SRC.slice(SRC.indexOf('function leadsHiddenHere('), SRC.indexOf('function newestLead(')) + '; return leadsTile;');
  assert.equal(lift({ name: 't1', dataPath: ON }, req)(), '');
  assert.ok(lift({ name: 't1', dataPath: OFF }, req)().includes('id="gLeads"'));
  assert.ok(lift({ name: 'abaitzik', dataPath: ON }, req)().includes('id="gLeads"'));
});

test('tenantTiles: leadsOff takes gLeads off a customer home', () => {
  const s = SRC.indexOf('const TENANT_TILES = {'), e = SRC.indexOf('function cutFor(');
  const { tenantTiles } = new Function('require', SRC.slice(s, e) + '; return { tenantTiles };')(req);
  assert.ok(tenantTiles({ name: 't1', dataPath: OFF, screens: ['gFiles'] }).includes('id="gLeads"'));
  assert.ok(!tenantTiles({ name: 't1', dataPath: ON, screens: ['gFiles'] }).includes('id="gLeads"'));
});

const page = renderPage({ now: null, openCmds: [], builtAt: '2026-11-18T10:00:00.000Z', counts: { pending: 0, replied: 0, today: 0, leads: 0 }, choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [], biz: [LEAD] });
function tabsOf(who, D, tab) {
  const h = cut({ name: who }, page);
  const i = h.indexOf("  var tabs=[['its'"), j = h.indexOf('  if(INSTANCE&&INSTANCE.clalit)', i);
  assert.ok(i > 0 && j > i, 'the tabs part is in the page: ' + who);
  return new Function('bzOwner', 'D', 'tab', 'dueN', 'liN', h.slice(i, j) + '; return {ids:tabs.map(function(t){return t[0];}),tab:tab};')(who === 'abaitzik', D, tab, 0, 0);
}

test('העסק שלי: a leadsOff customer has no leads tab and opens on the next one; nothing changes without it', () => {
  let r = tabsOf('ily', { features: { leadsOff: true } }, 'leads');
  assert.deepEqual(r.ids, ['money', 'due']);
  assert.equal(r.tab, 'money');
  assert.equal(tabsOf('ily', { features: { leadsOff: true } }, 'due').tab, 'due');
  r = tabsOf('ily', { features: {} }, 'leads');
  assert.deepEqual(r.ids, ['leads', 'money', 'due']);
  assert.equal(r.tab, 'leads');
  r = tabsOf('abaitzik', { features: { leadsOff: true } }, 'leads');
  assert.ok(r.ids.includes('leads'), 'his own copy keeps the leads tab');
  assert.equal(r.tab, 'leads');
});

test('the page: the leads button stays hidden in a customer copy, applyFeatures hides gLeads, every script parses', () => {
  const h = cut({ name: 'ily' }, page);
  // the bottom bar 🔔 is drawn hidden in every monitor but his (the test page is built as his, so the source is checked)
  assert.ok(SRC.includes('<button type="button" id="nL" aria-pressed="false"$' + "{inst.name === 'abaitzik' ? '' : ' hidden'}>"), 'nL is hidden for a customer');
  const fn = new Function('D', 'document', F.js + '; applyFeatures();');
  const el = { gLeads: { hidden: false } };
  const doc = { getElementById: (id) => el[id] || null };
  fn({ features: { leadsOff: true } }, doc);
  assert.equal(el.gLeads.hidden, true);
  el.gLeads.hidden = false; fn({ features: {} }, doc);
  assert.equal(el.gLeads.hidden, false, 'without the flag the tile stays');
  const S = [];
  h.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g, (m, a, b) => { if (!/\bsrc=|type="(?!text\/javascript)/.test(a || '')) S.push(b); return m; });
  assert.ok(S.length > 3);
  S.forEach((code, i) => { try { new Function(code); } catch (e) { assert.fail('script ' + i + ' does not parse: ' + e.message); } });
});

test('brief and manager: no lead lines with leadsOff, as before without it', () => {
  const B = require('../lib/brief.js');
  const now = Date.parse('2026-11-18T10:00:00.000Z');
  const inp = { now, bizLeads: [{ r: { name: 'דנה' }, line: 'דנה (האתר, הגיע 18.11)' }], contacts: [], features: {} };
  const has = (d) => d.items.some((x) => /דנה/.test(JSON.stringify(x)));
  assert.ok(has(B.buildBrief(inp)), 'without the flag the lead is in the brief');
  assert.ok(!has(B.buildBrief(Object.assign({}, inp, { leadsOff: true }))));
  const M = require('../lib/manager.js');
  const minp = { now, biz: [Object.assign({}, LEAD, { at: new Date(now - 3 * 3600e3).toISOString() })], chat: [], contacts: [], isTest: () => false };
  const ks = (m) => m.items.map((x) => x.k);
  assert.ok(ks(M.build(minp)).includes('bizleads'), 'without the flag the manager counts leads');
  const k2 = ks(M.build(Object.assign({}, minp, { leadsOff: true })));
  assert.ok(!k2.includes('bizleads') && !k2.includes('leads'));
});

test('leads-open: nothing for a leadsOff customer, his own monitor as before', () => {
  const I = require('../lib/instance.js'), LO = require('../lib/leads-open.js'), was = I.name;
  try {
    I.name = 't1';
    assert.equal(LO.open(ON).length, 0);
    assert.equal(LO.open(OFF).length, 1);
    I.name = 'abaitzik';
    assert.equal(LO.open(ON).length, 1);
  } finally { I.name = was; }
});
