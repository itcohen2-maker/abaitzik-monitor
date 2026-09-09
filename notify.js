'use strict';
// Sends a push notification to Itzik's phone through ntfy.sh.
// Usage: node notify.js "title" "message"
// The topic lives in data/ntfy-topic.txt (gitignored): anyone who knows it can
// read and post, so it never reaches docs/ or the public repo.
const fs = require('fs');
const path = require('path');
const https = require('https');

const topicFile = path.join(__dirname, 'data', 'ntfy-topic.txt');
const topic = fs.existsSync(topicFile) ? fs.readFileSync(topicFile, 'utf8').trim() : '';
if (!topic) { console.error('no topic in data/ntfy-topic.txt'); process.exit(1); }

const [title, ...rest] = process.argv.slice(2);
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
    'Tags': 'speech_balloon',
    'Priority': '4',
  },
}, res => {
  let out = '';
  res.on('data', d => out += d);
  res.on('end', () => { console.log(res.statusCode, out.slice(0, 120)); });
});
req.on('error', e => { console.error(e.message); process.exit(1); });
req.end(payload);
