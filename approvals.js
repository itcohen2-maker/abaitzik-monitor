'use strict';
/*
  External approvals the manager follows until they close (Itzik, 11.11.2026: "מי אחראי לבדוק?
  אם לא הייתי מזכיר לך, עדיין הייתי יושב ומחכה"). Meta rejected the business verification on 10.11
  and no email came; the answer sat in the Security Center until he asked.

  data/manager/approvals.json: [{id, title, since, expectBy, status, note, checkedAt, check}]
    status: pending | needsInfo | rejected | approved | notSubmitted
    check:  what the PC does to read the real status (browser page + mail search)
  Every round (manager.js) an open item not checked for 20 hours goes to the PC queue as a quiet
  task; the PC answers here with `set`. A status change pushes once (notify.js), nothing else does.

  Usage (server, as monitor):
    node approvals.js list
    node approvals.js set <id> <status> "<note>"
    node approvals.js add '<json>'
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');
const FILE = path.join(inst.dataPath, 'manager', 'approvals.json');
const LABEL = { pending: 'ממתין לתשובה', needsInfo: 'נדרש מידע נוסף', rejected: 'נדחה', approved: 'אושר', notSubmitted: 'לא הוגש' };

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return []; } }
function save(l) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(l, null, 1)); }
const OPEN = s => s === 'pending' || s === 'needsInfo' || s === 'rejected' || s === 'notSubmitted';

function taskText(a) {
  return 'בדיקת אישור חיצוני עבור המנהל: ' + a.title + '. ' + a.check +
    ' בסוף, בלי לשנות כלום ובלי ללחוץ על שום כפתור שליחה, להריץ בשרת: ssh -i C:\Users\User\.ssh\monitor_server root@178.105.63.97 ' +
    '"su monitor -c \'cd /home/monitor/abaitzik-monitor && node approvals.js set ' + a.id + ' <pending|needsInfo|rejected|approved|notSubmitted> \\"<משפט אחד בעברית: מה כתוב שם>\\"\'" ' +
    'ולסגור את הלשונית.';
}

module.exports = { load, save, OPEN, LABEL, taskText, FILE };

if (require.main === module) {
  const [cmd, id, status, ...rest] = process.argv.slice(2);
  const l = load();
  if (cmd === 'list') { for (const a of l) console.log(a.id.padEnd(22) + (LABEL[a.status] || a.status).padEnd(16) + (a.checkedAt || '').slice(0, 16) + '  ' + (a.note || '')); }
  else if (cmd === 'add') { const a = JSON.parse(id); if (l.some(x => x.id === a.id)) throw new Error('exists'); l.push(a); save(l); console.log('added ' + a.id); }
  else if (cmd === 'set') {
    const a = l.find(x => x.id === id); if (!a) throw new Error('no ' + id); if (!LABEL[status]) throw new Error('bad status');
    const changed = a.status !== status;
    a.status = status; a.note = rest.join(' ').trim() || a.note; a.checkedAt = new Date().toISOString();
    save(l);
    if (changed) { try { execFileSync('node', ['notify.js', 'המנהל: ' + a.title + ', ' + LABEL[status], a.note || ''], { cwd: __dirname, stdio: 'ignore', timeout: 60000 }); } catch (e) {} }
    console.log((changed ? 'changed ' : 'same ') + id + ' ' + status);
  } else console.log('usage: list | set <id> <status> "<note>" | add <json>');
}
