'use strict';
/*
  The morning brief for Home Style. 6.10.2026.

  Runs once a day (monitor-ship-daily.timer, 07:30 Jerusalem) as the user that
  owns the shipments table. It evaluates the rules, compares them with
  yesterday's snapshot, and writes three small files next to the table:
    brief.json     what the morning report screen shows
    snapshot.json  today's alerts, so tomorrow can say what is new or settled
    alerts.json    order line id to alert codes, for the Excel export
  Both monitors (the one that writes, and the one that only reads) show the
  same brief. No model is called: the text comes from the rules, so it is the
  same every day and costs nothing. The page itself is rebuilt by ship-daily.sh.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');
const rules = require('./lib/ship-rules.js');

const SD = inst.shipmentsDir;
if (!SD) { console.error('ship-brief: this instance has no shipmentsDir'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(path.join(SD, 'rows.json'), 'utf8'));
let sup = {};
try { sup = JSON.parse(fs.readFileSync(path.join(SD, '..', 'suppliers.json'), 'utf8')); } catch (e) { /* defaults */ }
const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Jerusalem' });
let handled = {};
try { handled = JSON.parse(fs.readFileSync(path.join(SD, 'handled.json'), 'utf8')); } catch (e) { /* nothing marked yet */ }
// What was marked "טיפלתי" in the last week is neither counted nor reported.
const alerts = rules.applyHandled(rules.evaluate(rows, today, sup), handled, today);

const now = {};
for (const a of alerts) now[a.id + '|' + a.code] = { t: a.po + ' ' + a.supplier + ': ' + a.text, l: a.level };
let prev = null;
try { prev = JSON.parse(fs.readFileSync(path.join(SD, 'snapshot.json'), 'utf8')); } catch (e) { /* first run */ }

const changes = [];
if (prev) {
  for (const k of Object.keys(now)) if (!(k in prev.alerts) && now[k].l !== 'track') changes.push('חדש: ' + now[k].t);
  for (const k of Object.keys(prev.alerts)) if (!(k in now) && prev.alerts[k].l !== 'track') changes.push('טופל או השתנה: ' + prev.alerts[k].t);
}
const summary = rules.summary(rows, alerts, today);
const brief = { today, at: new Date().toISOString(), summary, changes: changes.slice(0, 20), more: Math.max(0, changes.length - 20), first: !prev };

function put(name, obj) {
  const f = path.join(SD, name), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o640 });
  fs.renameSync(tmp, f);
}
put('brief.json', brief);
put('snapshot.json', { today, alerts: now });
const byId = {};
for (const a of alerts) (byId[a.id] = byId[a.id] || []).push(a.code + (a.level === 'track' ? ' (שופרסל)' : ''));
put('alerts.json', byId);

const msg = summary.red + ' דחופים, ' + summary.amber + ' לבדוק, ' + summary.arrivingThisWeek + ' מגיעים השבוע'
  + (changes.length ? '. ' + changes.length + ' שינויים מאתמול' : '');
try { execFileSync('node', ['notify.js', 'מעקב משלוחים', msg], { cwd: __dirname, stdio: 'ignore', timeout: 30000 }); } catch (e) { /* no phone yet */ }
console.log(today + ' ' + msg);
