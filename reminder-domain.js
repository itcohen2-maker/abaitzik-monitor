'use strict';
/*
  One off reminder, 22.9.2026 20:13: Itzik asked to be reminded in two hours
  to buy abaitzik.com. Vercel will not let an agent buy a domain; he has to
  confirm the price and fill in the registrant details himself.
  Run by the scheduled task "AbaItzik Reminder Domain", which deletes itself.
*/
const { execFileSync } = require('child_process');
const path = require('path');
execFileSync(process.execPath, [path.join(__dirname, 'notify.js'),
  'תזכורת: הדומיין abaitzik.com',
  'לקנות ב vercel.com/domains ולחפש abaitzik.com, $11.25 לשנה. כשקנית תגיד לי ואני מחבר לאתר.'],
  { stdio: 'inherit' });
