'use strict';
// Schedules a push for a future time. ntfy holds the message and delivers it
// itself, so this does not depend on my session still being alive at 1am.
//
// Usage: node alarm.js "HH:MM" "message"
const fs = require('fs');
const path = require('path');
const https = require('https');

const topic = fs.readFileSync(path.join(__dirname, 'data', 'ntfy-topic.txt'), 'utf8').trim();
const [when, ...rest] = process.argv.slice(2);
const body = rest.join(' ') || 'תזכורת';

const [h, m] = String(when).split(':').map(Number);
const at = new Date();
at.setHours(h, m || 0, 0, 0);
// A time that has already passed today means the next one, tomorrow.
if (at <= new Date()) at.setDate(at.getDate() + 1);

const payload = Buffer.from(body, 'utf8');
const req = https.request({
  host: 'ntfy.sh', path: '/' + topic, method: 'POST',
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': payload.length,
    'Title': '=?UTF-8?B?' + Buffer.from('שעון מעורר', 'utf8').toString('base64') + '?=',
    'At': String(Math.floor(at.getTime() / 1000)),
    'Priority': '5',
    'Tags': 'alarm_clock',
    'Click': 'https://itcohen2-maker.github.io/abaitzik-monitor/',
  },
}, res => {
  let out = '';
  res.on('data', d => (out += d));
  res.on('end', () => console.log(res.statusCode, at.toLocaleString('he-IL'), out.slice(0, 160)));
});
req.on('error', e => { console.error(e.message); process.exit(1); });
req.end(payload);
