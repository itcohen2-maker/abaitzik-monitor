'use strict';
/*
  The command line for lib/change-requests.js.

    node change-request.js add --re <message id> "<what he asked to change>"
      on a customer's monitor: files the request for Itzik.
    node change-request.js decide <customer> <request id> approved|rejected|deleted "<one line for the customer>"
      on Itzik's: records his decision. The customer hears it within a minute.
*/
const cr = require('./lib/change-requests.js');

const a = process.argv.slice(2);
try {
  if (a[0] === 'add') {
    const i = a.indexOf('--re');
    const re = i > -1 ? a[i + 1] : '';
    const text = a.filter((x, k) => k > 0 && k !== i && k !== i + 1).join(' ');
    if (!text.trim()) throw new Error('חסר תיאור הבקשה');
    console.log('נשלח למנהל: ' + cr.add(text, re));
  } else if (a[0] === 'decide') {
    cr.decide(a[1], a[2], a[3], a.slice(4).join(' '));
    console.log('נרשם: ' + a[1] + '/' + a[2] + ' ' + a[3]);
  } else {
    console.error('add --re <id> "<text>" | decide <customer> <id> approved|rejected "<note>"');
    process.exit(2);
  }
} catch (e) { console.error(e.message); process.exit(1); }
