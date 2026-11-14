'use strict';
// 14.11.2026: reminders at an exact time, on WhatsApp (lib/alarms.js). Run by the monitor's own session.
//   node wa-alarm.js add "YYYY-MM-DD HH:MM" "<text>"     node wa-alarm.js list     node wa-alarm.js declined
const A = require('./lib/alarms.js');
const inst = require('./lib/instance.js');
const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'add') {
  const r = A.add(inst.dataPath, a1, a2);
  if (!r.ok) { console.error({ time: 'זמן לא תקין, צריך "YYYY-MM-DD HH:MM"', past: 'הזמן כבר עבר', far: 'רחוק מדי, עד שנה', text: 'חסר טקסט', many: 'יותר מדי תזכורות פתוחות' }[r.why] || r.why); process.exit(2); }
  console.log('נקבעה תזכורת ל' + r.when + ': ' + r.alarm.text);
} else if (cmd === 'list') {
  A.list(inst.dataPath).filter((a) => !a.sentAt && !a.missed).forEach((a) => console.log(A.when(Date.parse(a.due)) + '  ' + a.text));
} else if (cmd === 'declined') {
  console.log('סירובים: ' + A.declined(inst.dataPath));
} else { console.error('usage: node wa-alarm.js add "YYYY-MM-DD HH:MM" "<text>" | list | declined'); process.exit(2); }
