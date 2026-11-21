'use strict';
/*
  22.11.2026: the DEMO booking link (lib/book-page.js DEMO_LINK). The demo has no agent: the beauty demo's invented clinic is
  seeded into a temporary folder of the bridge's own process, once a day, and answered by the same logic as a real agent
  (lib/book-core.js) in read only mode: hours, services and free times are real, a booking or a cancel is acknowledged and
  saved nowhere, nobody is told. Nothing of any customer is involved.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeCore } = require('./book-core.js');

let cur = { day: '', dir: '', core: null };
function dir() {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  if (cur.dir && cur.day === day && fs.existsSync(cur.dir)) return cur.dir;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'book-demo-'));
  require('./demo-trades/beauty.js').seed(d, Date.now());
  if (cur.dir) { try { fs.rmSync(cur.dir, { recursive: true, force: true }); } catch (e) { /* none */ } }
  const inst = { name: 'demo-beauty', trade: 'beauty', gender: 'f', bookings: true, biz: { name: 'הקליניקה של מור' }, dataPath: d };
  cur = { day, dir: d, core: makeCore({ inst, dataPath: d, tenantId: 'demo-beauty', readOnly: true }) };
  return d;
}
// the same shape as a socket request: a promise of the answer
function request(req) { dir(); return cur.core.handle(req); }
module.exports = { dir, request };
