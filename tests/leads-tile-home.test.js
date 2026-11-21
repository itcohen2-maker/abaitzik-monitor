'use strict';
process.env.MONITOR_NO_GATE = '1';
/*
  19.11.2026, Itzik: "ברגע שזה נכנס ללידים, האריח היה צריך להבהב והוא לא הבהב", then "יש ללידים ערך גם בנפרד,
  לא רק בלוק בתוך העסק שלי", then "איך אנחנו משאירים את זה בצורה כזאת שאנחנו נוסיף דברים, שום דבר לא יישבר לנו".
  These tests hold the 🔔 לידים tile as he asked for it, in every monitor:
   1. it stands alone on the home screen (#leadAlert inside #pH), out of the business grid;
   2. it stays seen when the home is folded (#pH.bare);
   3. a new lead from ANY source (WhatsApp, Messenger, signup, site) makes it blink, also after its status moved
      off חדש (a note turns it to בשיחה before he looked);
   4. the small line names the lead and where it came from; a tap opens the leads and stops the blink.
  A change that breaks one of these fails npm test, and push.js does not publish.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
const req = (m) => require(path.join(ROOT, m));
const lift = new Function('inst', 'require', SRC.slice(SRC.indexOf('function leadsHiddenHere('), SRC.indexOf('function newestLead(')) + '; return leadsTile;');

function dp(leads) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lth-'));
  fs.mkdirSync(path.join(d, 'status'), { recursive: true });
  fs.mkdirSync(path.join(d, 'biz', 'biz'), { recursive: true });
  leads.forEach((r) => fs.writeFileSync(path.join(d, 'biz', 'biz', r.id + '.json'), JSON.stringify(r)));
  return d;
}
const OLD = { id: 'biz-20261101080000-site', kind: 'lead', name: 'ישן', status: 'בשיחה', at: '2026-11-01T08:00:00.000Z', source: 'site' };
const WA = { id: 'biz-20261119121742-wa8751', kind: 'lead', name: 'דנה', phone: '+972501111111', status: 'בשיחה', at: '2026-11-19T12:17:42.393Z', source: 'whatsapp' };
const MS = { id: 'biz-20261119130000-mess', kind: 'lead', name: 'רון', status: 'חדש', at: '2026-11-19T13:00:00+0000', source: 'messenger' };
const SHUT = { id: 'biz-20261119140000-sign', kind: 'lead', name: 'סגור', status: 'נסגר', at: '2026-11-19T14:00:00.000Z', source: 'signup' };
const attr = (html, a) => (new RegExp(a + '="([^"]*)"').exec(html) || [])[1];

test('the key is the newest open lead by arrival, whatever its status and source', () => {
  const h = lift({ name: 'abaitzik', dataPath: dp([OLD, WA]) }, req)();
  assert.equal(attr(h, 'data-lnew'), WA.at, 'a WhatsApp lead already in בשיחה still blinks');
  assert.match(attr(h, 'data-lwho'), /דנה מוואטסאפ/);
  const m = lift({ name: 'abaitzik', dataPath: dp([OLD, WA, MS]) }, req)();
  assert.equal(attr(m, 'data-lnew'), '2026-11-19T13:00:00.000Z', 'Messenger +0000 time is read as a date');
  assert.match(attr(m, 'data-lwho'), /רון ממסנג׳ר/);
  const c = lift({ name: 'abaitzik', dataPath: dp([WA, SHUT]) }, req)();
  assert.equal(attr(c, 'data-lnew'), WA.at, 'a closed lead does not take the blink');
  assert.equal(attr(lift({ name: 'abaitzik', dataPath: dp([SHUT]) }, req)(), 'data-lnew'), '', 'only closed: no blink');
});

test('the folded home keeps the tile, and the tile has its own place', () => {
  assert.ok(SRC.includes('#pH.bare > *:not(#talkCard):not(#bareBtn):not(#approvalsBox):not(#leadAlert):not(#tradeCards){display:none!important}'));
  assert.ok(SRC.includes('#leadAlert>#gLeads{display:block!important'));
});

// A small stand in for the page, enough for the tile's own script.
function el(id) {
  return { id, children: [], parentNode: null, attrs: {}, cls: new Set(), textContent: '', on: {},
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
    querySelector(s) { return s === 'small' ? this.small : null; },
    addEventListener(t, f) { this.on[t] = f; },
    get classList() { const s = this.cls; return { add: (x) => s.add(x), remove: (x) => s.delete(x), contains: (x) => s.has(x) }; } };
}
function run(html, seen) {
  const tile = el('gLeads');
  tile.attrs['data-lnew'] = attr(html, 'data-lnew'); tile.attrs['data-lwho'] = attr(html, 'data-lwho');
  tile.small = { textContent: (/<small>([^<]*)<\/small>/.exec(html) || [])[1] };
  const biz = el('blkBiz'), home = el('pH'); biz.appendChild(tile); home.appendChild(el('talkCard')); home.appendChild(biz);
  const byId = { gLeads: tile, pH: home, blkBiz: biz };
  const store = { leadsTileSeen: seen || '' }; let opened = '';
  const document = { getElementById: (i) => byId[i] || null, createElement: () => el(''), addEventListener() {} };
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  new Function('document', 'localStorage', 'setTimeout', 'bizSheet', 'bzOpenDrawer', script)(
    document, { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } }, () => {}, (x) => { opened = x; }, () => {});
  return { tile, home, biz, store, opened: () => opened };
}

test('the tile script: out of העסק שלי onto the home, blinks with the name, a tap opens the leads and stops it', () => {
  const html = lift({ name: 'abaitzik', dataPath: dp([OLD, WA]) }, req)();
  const p = run(html);
  assert.equal(p.tile.parentNode.id, 'leadAlert');
  assert.equal(p.tile.parentNode.parentNode, p.home);
  assert.equal(p.biz.children.length, 0, 'no longer inside the business grid');
  assert.ok(p.tile.cls.has('leadNew'), 'blinks');
  assert.match(p.tile.small.textContent, /^ליד חדש: דנה מוואטסאפ · /);
  p.tile.on.click();
  assert.ok(!p.tile.cls.has('leadNew'), 'a tap stops the blink');
  assert.equal(p.store.leadsTileSeen, WA.at);
  assert.equal(p.opened(), 'leads');
  assert.doesNotMatch(p.tile.small.textContent, /ליד חדש/);
  const again = run(html, WA.at);
  assert.ok(!again.tile.cls.has('leadNew'), 'seen on this phone: no blink after a reload');
  assert.equal(again.tile.parentNode.id, 'leadAlert', 'but the tile is still on the home');
});

test('a customer with leads on gets the same tile; leadsOff still takes it off', () => {
  const d = dp([WA]);
  assert.equal(attr(lift({ name: 't1', dataPath: d }, req)(), 'data-lnew'), WA.at);
  fs.writeFileSync(path.join(d, 'status', 'features.json'), JSON.stringify({ leadsOff: true }));
  assert.equal(lift({ name: 't1', dataPath: d }, req)(), '');
});
