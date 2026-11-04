#!/usr/bin/env node
/*
  4.11, איציק: "תעדכן כמובן". עדכון שקלוד עושה בטופס הגבייה של יואל עובר דרך השרת,
  כדי שייצא push ומייל "לולוס · עדכוני גבייה מיואל" כמו סימון מהדף. לא לערוך את marks.json ישירות.
  Usage: node tools/gviya-mark.js <marks.json>   // מערך של {name, status?, paidWhen?, addComment:{w,t}}
*/
const fs = require('fs'), path = require('path'), http = require('http');
const key = fs.readFileSync(path.join(__dirname, '..', 'data', 'gviya', 'internal.key'), 'utf8').trim();
const body = fs.readFileSync(process.argv[2], 'utf8');
const req = http.request({ host: '127.0.0.1', port: 8795, path: '/internal/mark', method: 'POST',
  headers: { 'content-type': 'application/json', 'x-gviya-key': key, 'content-length': Buffer.byteLength(body) } },
  r => { let s = ''; r.on('data', c => s += c); r.on('end', () => { console.log(r.statusCode, s); process.exit(r.statusCode === 200 ? 0 : 1); }); });
req.on('error', e => { console.error(e.message); process.exit(1); });
req.end(body);
