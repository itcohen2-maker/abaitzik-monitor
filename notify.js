'use strict';
// Sends a push notification to Itzik's phone through ntfy.sh.
// Usage: node notify.js "title" "message" [--p1..--p5]
//
// The priority decides how the phone announces it, which is the only part of
// the sound I control from here: the ringtone itself is chosen inside the ntfy
// app, not in the message. 5 is reserved for the pill and anything that must
// not wait, 3 for routine updates that can arrive quietly.
// The topic lives in data/ntfy-topic.txt (gitignored): anyone who knows it can
// read and post, so it never reaches docs/ or the public repo.
const fs = require('fs');
const path = require('path');
const https = require('https');

const topicFile = path.join(__dirname, 'data', 'ntfy-topic.txt');
const topic = fs.existsSync(topicFile) ? fs.readFileSync(topicFile, 'utf8').trim() : '';
if (!topic) { console.error('no topic in data/ntfy-topic.txt'); process.exit(1); }

const args = process.argv.slice(2);
const prio = (args.find(a => /^--p[1-5]$/.test(a)) || '--p4').slice(3);
const [title, ...rest] = args.filter(a => !/^--p[1-5]$/.test(a));
const body = rest.join(' ') || title || 'יש תשובה חדשה במוניטור';
const payload = Buffer.from(body, 'utf8');

const req = https.request({
  host: 'ntfy.sh', path: '/' + topic, method: 'POST',
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': payload.length,
    // ntfy headers only take latin1, so the Hebrew title is RFC 2047 encoded.
    'Title': '=?UTF-8?B?' + Buffer.from(title || 'המוניטור', 'utf8').toString('base64') + '?=',
    'Click': 'https://itcohen2-maker.github.io/abaitzik-monitor/#chat',
    'Tags': prio === '5' ? 'rotating_light' : 'speech_balloon',
    'Priority': prio,
  },
}, res => {
  let out = '';
  res.on('data', d => out += d);
  res.on('end', () => { console.log(res.statusCode, out.slice(0, 120)); });
});
req.on('error', e => { console.error(e.message); process.exit(1); });
req.end(payload);
