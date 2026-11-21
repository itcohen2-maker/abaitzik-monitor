#!/usr/bin/env node
'use strict';
/*
  10.11.2026: pulls everything a returned setup form holds into the customer's monitor (lib/setup-intake.js).
    node setup-intake.js --sweep [--dry]        every form (timer monitor-intake.timer, trigger file, the manager)
    node setup-intake.js <token> [--dry]        one form
    node setup-intake.js map <token> <name>     tell which tenant a token belongs to (data/setup-intake/map.json)
  Runs as root (writes into the customers' homes). Prints counts only, never file contents.
*/
const fs = require('fs');
const path = require('path');
const SI = require('./lib/setup-intake.js');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const rest = args.filter((a) => !a.startsWith('--'));

if (rest[0] === 'map') {
  const ctx = SI.ctxOf({});
  if (!/^[a-f0-9]{16,40}$/.test(rest[1] || '') || !/^[a-z0-9-]+$/.test(rest[2] || '')) { console.error('שימוש: node setup-intake.js map <טוקן> <שם לקוח>'); process.exit(2); }
  const f = path.join(ctx.dir, 'map.json');
  let m = {}; try { m = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  m[rest[1]] = rest[2];
  fs.mkdirSync(ctx.dir, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(m, null, 1));
  console.log('נרשם: ' + rest[1].slice(0, 6) + ' אל ' + rest[2]);
  process.exit(0);
}
if (!args.includes('--sweep') && !rest[0]) { console.error('שימוש: --sweep | <טוקן> | map <טוקן> <שם>'); process.exit(2); }
// the trigger is consumed before the run, so a form finished during the run starts another one
try { fs.unlinkSync(path.join(SI.ctxOf({}).dir, 'trigger')); } catch (e) { /* none */ }
const sum = SI.sweep({ dry, only: rest[0] });
if (sum.busy) { console.log('ריצה אחרת עוד פועלת'); process.exit(0); }
for (const r of Object.values(sum.tokens)) {
  console.log((r.client || r.tok.slice(0, 6)) + ': ' + (r.unmapped ? 'אין מוניטור ממופה' : (r.finished ? 'סיים' : 'לא סיים'))
    + (r.did ? ' ' + JSON.stringify(r.did) : '') + (r.missing && r.missing.length ? ' חסר ' + r.missing.length : ''));
}
