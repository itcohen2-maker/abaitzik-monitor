'use strict';
/*
  13.11.2026, Itzik: "מסיים להעלות את הסטורי, אתה יכול לשים כפתור, להשמיד את הלשונית, וזה הכל. ככה לא יהיה בלגן."
  Every item in 🎬 the videos tile (a REEL_ITEMS file) has a 🗑 button. After the in page confirm the page sends
  "🗑 הסרת ריל: <file>". The listener applies it here with no model and silently: the file moves out of
  data/files-private to data/_deleted/<YYYYMMDD>/reels/, and the tile drops an item whose file is not in the monitor.
  Nothing is erased; one line goes to data/_deleted/log.txt.
*/
const fs = require('fs');
const path = require('path');

const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/;
const TZ = 'Asia/Jerusalem';

function parse(text) {
  const m = /^\s*(?:משימה)?\s*🗑️?\s*הסרת ריל\s*[:：]\s*(\S+)\s*$/.exec(String(text || '').replace(/\n\s*קוד[^\n]*$/, ''));
  return m && FILE_RE.test(m[1]) && m[1].indexOf('..') < 0 ? { file: m[1] } : null;
}

function dayStamp(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return o.year + o.month + o.day;
}

function apply(dataPath, file, now) {
  if (!FILE_RE.test(String(file || '')) || String(file).indexOf('..') >= 0) return { ok: false, reply: 'שם קובץ לא תקין' };
  const src = path.join(dataPath, 'files-private', file);
  if (!fs.existsSync(src)) return { ok: true, gone: true, reply: 'כבר הוסר' };
  const ms = now || Date.now();
  const destDir = path.join(dataPath, '_deleted', dayStamp(ms), 'reels');
  fs.mkdirSync(destDir, { recursive: true });
  const ext = path.extname(file), base = file.slice(0, file.length - ext.length);
  let dest = path.join(destDir, file), n = 1;
  while (fs.existsSync(dest)) dest = path.join(destDir, base + '-' + (++n) + ext);
  try { fs.renameSync(src, dest); } catch (e) { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
  try { fs.appendFileSync(path.join(dataPath, '_deleted', 'log.txt'), new Date(ms).toISOString() + ' reel ' + file + ' -> ' + path.relative(dataPath, dest) + '\n'); } catch (e) { /* the move is what counts */ }
  return { ok: true, dest };
}

module.exports = { parse, apply };
