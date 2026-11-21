'use strict';
/*
  19.11.2026, Itzik (iron rule): "לפני שסרטון נשלח אליי, לבדוק מה הסרטון חייב להכיל. לצרף את כל השאלות והתשובות ולבדוק שהסרטון
  מתאים. ההנחיה אולי הייתה טובה אבל התוצאה לא." So before any campaign video is delivered:

    node tools/campaign-frames.js <video.mp4> --msg <chat message .json or .txt>
      Extracts one frame per clip (after its caption has faded in) and one of the end card, into <video>-frames/,
      and writes <video base>.check.json: every question and answer from the message, the frames and what each must
      show (from <video>.clips.json, written by tools/campaign-join.js), all marked "pending".
      The session then LOOKS at every frame and fills the file: for each answer "show" (what text, which clip) or
      "not on video" with "why"; and "status": "pass" or "fail" with "note", for every item, every check (the list
      below, including the crops the draft named and an inviting end card), every frame, and the overall "status".

    node tools/campaign-frames.js --verify <video base>.check.json
      Exits 0 and prints "ok" only when every item and every frame is "pass" and the overall status is "pass".
      Anything else prints what is missing and exits 1. No delivery before this prints ok.
*/
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHECKS = [
  'כל טקסט שתוכנן מופיע ומאוית בדיוק',
  'עברית מימין לשמאל, כולל סימני פיסוק ומספרים',
  'קריא, לא חתוך, בתוך האזור הבטוח (לא ב 250 העליונים ולא ב 350 התחתונים)',
  'התמונה או הסרטון של הלקוח, בסדר שהוא נתן',
  'אין מחיר, מבצע, שם או עובדה שהלקוח לא כתב',
  'הסחות דעת שהטיוטה המליצה לחתוך הוסרו מהסרטון (crops ו hide בקובץ הטקסטים, כמו בטיוטה)',
  'כרטיס הסיום קריא ומזמין: תמונות המוצר, קריאה לפעולה גדולה, דרך הפנייה בולטת',
];

// "קמפיין: <kind> | <description>\n<question>? <answer>\n... | סדר הקבצים: ... | <note>\n(קובץ: ...)"
function parseMessage(text) {
  const out = { kind: '', description: '', qa: [], order: '', notes: [] };
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, li) => {
    if (/^\(/.test(line) && /\)$/.test(line)) return; // "(קובץ: x)" / "(3 קבצים יחד: ...)"
    line.split(/\s+\|\s+/).forEach((seg, si) => {
      seg = seg.trim();
      if (!seg) return;
      if (li === 0 && si === 0) {
        const m = seg.match(/^(?:\[הדגמה\]\s*)?קמפיין:\s*(.*)$/);
        if (m) { out.kind = m[1].trim(); return; }
      }
      if (/^סדר הקבצים:/.test(seg)) { out.order = seg.replace(/^סדר הקבצים:\s*/, ''); return; }
      const q = seg.indexOf('?');
      if (q > 0 && q < seg.length - 1) { out.qa.push({ q: seg.slice(0, q + 1).trim(), a: seg.slice(q + 1).trim() }); return; }
      if (li === 0 && si === 1 && !out.description) { out.description = seg; return; }
      out.notes.push(seg);
    });
  });
  return out;
}

function frameTimes(clips) {
  const list = (clips.clips || []).map((c) => {
    const d = c.end - c.start;
    return { clip: c.n, kind: c.kind, file: c.file, at: +(c.start + Math.min(d - 0.3, Math.max(1.4, d * 0.7))).toFixed(2), texts: [c.title, c.caption].filter(Boolean),
      crop: c.crop || null, hide: c.hide || null };
  });
  if (clips.end) list.push({ clip: 'end', kind: 'end card', file: '', at: +(clips.end.start + Math.min(2, (clips.end.end - clips.end.start) - 0.3)).toFixed(2),
    texts: [clips.end.offer, clips.end.cta, clips.end.contact, clips.end.brand].filter(Boolean), thumbs: clips.end.thumbs || 0 });
  return list;
}

function skeleton(videoName, msg, clips, frameDir) {
  const items = [];
  if (msg.description) items.push({ q: 'התיאור', a: msg.description, show: '', why: '', status: 'pending', note: '' });
  msg.qa.forEach((x) => items.push({ q: x.q, a: x.a, show: '', why: '', status: 'pending', note: '' }));
  if (msg.order) items.push({ q: 'סדר הקבצים', a: msg.order, show: '', why: '', status: 'pending', note: '' });
  msg.notes.forEach((n) => items.push({ q: 'הערה', a: n, show: '', why: '', status: 'pending', note: '' }));
  return {
    video: videoName,
    kind: msg.kind,
    checks: CHECKS.map((c) => ({ check: c, status: 'pending', note: '' })),
    items,
    frames: frameTimes(clips).map((f) => Object.assign(f, { png: path.join(frameDir, 'f-' + f.clip + '.png'), status: 'pending', note: '' })),
    status: 'pending',
  };
}

function verify(check) {
  const bad = [];
  (check.items || []).forEach((x, i) => {
    if (x.status !== 'pass') bad.push('item ' + (i + 1) + ' (' + x.q + '): ' + (x.status || 'no status'));
    if (!x.show && !x.why) bad.push('item ' + (i + 1) + ' (' + x.q + '): neither show nor why');
  });
  (check.checks || []).forEach((c, i) => { if (!c || c.status !== 'pass') bad.push('check ' + (i + 1) + ' (' + ((c && c.check) || c) + '): ' + ((c && c.status) || 'no status')); });
  if ((check.checks || []).length < CHECKS.length) bad.push('checks missing');
  if (!(check.frames || []).length) bad.push('no frames');
  (check.frames || []).forEach((f) => { if (f.status !== 'pass') bad.push('frame ' + f.clip + ': ' + (f.status || 'no status')); });
  if (check.status !== 'pass') bad.push('overall status: ' + (check.status || 'none'));
  return bad;
}

function readMsg(f) {
  const raw = fs.readFileSync(f, 'utf8');
  try { const j = JSON.parse(raw); return String(j.text || ''); } catch (e) { return raw; }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--verify') {
    let check;
    try { check = JSON.parse(fs.readFileSync(args[1], 'utf8')); } catch (e) { console.error('cannot read ' + args[1]); process.exit(1); }
    const bad = verify(check);
    if (bad.length) { console.error('NOT ready, do not deliver:\n' + bad.join('\n')); process.exit(1); }
    console.log('ok'); return;
  }
  const video = args[0];
  const mi = args.indexOf('--msg');
  if (!video || !/\.mp4$/i.test(video) || mi < 0 || !args[mi + 1]) { console.error('usage: node tools/campaign-frames.js <video.mp4> --msg <message.json|txt>  |  --verify <check.json>'); process.exit(1); }
  const clipsFile = video.replace(/\.mp4$/i, '.clips.json');
  if (!fs.existsSync(video) || !fs.existsSync(clipsFile)) { console.error('missing ' + (fs.existsSync(video) ? clipsFile : video) + ' (render with tools/campaign-join.js first)'); process.exit(1); }
  const clips = JSON.parse(fs.readFileSync(clipsFile, 'utf8'));
  const frameDir = video.replace(/\.mp4$/i, '-frames');
  fs.mkdirSync(frameDir, { recursive: true });
  const check = skeleton(path.basename(video), parseMessage(readMsg(args[mi + 1])), clips, frameDir);
  for (const f of check.frames) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(f.at), '-i', video, '-frames:v', '1', f.png], { encoding: 'utf8' });
    if (r.status !== 0) { console.error('ffmpeg failed on frame ' + f.clip + ': ' + String(r.stderr).slice(-300)); process.exit(1); }
  }
  const out = video.replace(/\.mp4$/i, '.check.json');
  fs.writeFileSync(out, JSON.stringify(check, null, 1));
  console.log(out);
  check.frames.forEach((f) => console.log(f.png + '  (' + f.clip + ': ' + (f.texts.join(' / ') || 'no text') + ')'));
}

module.exports = { parseMessage, frameTimes, skeleton, verify, CHECKS };
if (require.main === module) main();
