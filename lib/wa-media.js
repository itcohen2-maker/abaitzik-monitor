'use strict';
/*
  11.11.2026, Itzik: "אם אני יכול לצרף בשיחה בוואטסאפ קובץ וזה יעביר את זה למוניטור?"
  Until now wa-bridge.js turned a photo or a document into the line "[מסמך מוואטסאפ: name]" and the file itself
  never arrived. Now the file is downloaded from Meta and saved in the monitor's own data/inbox, the same folder a
  file from "📎 העלאת קובץ" lands in, and the chat record carries files:[name], exactly like a page upload.

  Types: image, document (PDF, Word, Excel...), video, sticker, and an audio FILE (audio.voice false). A voice note is
  still transcribed as before. Cap: 25 MB (Meta's own limit for most types is 16 to 100 MB).
  The file stays in that monitor's data dir and is not sent anywhere else.
  A PDF that reached a customer's monitor is also listed in data/inbox/.wa-lab.jsonl; for a monitor with
  labCheck:true, mail-sync.js (root, every 15 minutes) runs the lab duplicate check on it (lib/lab-mail.js dropSweep).
*/
const fs = require('fs');
const path = require('path');

const MAX = 25 * 1024 * 1024;
const TYPES = ['image', 'document', 'video', 'sticker'];
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'video/mp4': '.mp4',
  'video/3gpp': '.3gp', 'video/quicktime': '.mov', 'application/pdf': '.pdf', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/amr': '.amr', 'text/plain': '.txt',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx' };
const WORD = { image: 'תמונה', document: 'מסמך', video: 'סרטון', sticker: 'מדבקה', audio: 'קובץ שמע' };

// The media part of a message that is a file, or null (a voice note is not a file: it is transcribed).
function partOf(m) {
  if (!m) return null;
  if (TYPES.indexOf(m.type) >= 0 && m[m.type] && m[m.type].id) return m[m.type];
  if (m.type === 'audio' && m.audio && m.audio.id && m.audio.voice === false) return m.audio;
  return null;
}

function stamp(at) {
  const p = (n) => String(n).padStart(2, '0');
  return at.getFullYear() + p(at.getMonth() + 1) + p(at.getDate()) + '-' + p(at.getHours()) + p(at.getMinutes()) + p(at.getSeconds());
}
// A safe, unique file name: wa-<time>-<his name>, or wa-<time>-<תמונה>.jpg when the file has no name.
function nameFor(m, part, mime, at) {
  const ext = EXT[String(mime || part.mime_type || '').split(';')[0].trim()] || '';
  let base = String(part.filename || '').replace(/[\/\\0]/g, '_').replace(/[^\w.֐-׿() -]+/g, '_').replace(/\s+/g, ' ').trim().slice(-80);
  if (!base || base === '.' || base === '..') base = WORD[m.type] || 'קובץ';
  if (ext && !/\.[A-Za-z0-9]{1,5}$/.test(base)) base += ext;
  return 'wa-' + stamp(at || new Date()) + '-' + base;
}
function shown(m, part) { return part.filename ? String(part.filename).slice(0, 80) : (WORD[m.type] || 'קובץ'); }

// req(method, url, headers) -> {status, body}. Returns { buf, mime } or throws ('big' when over the cap).
async function download(req, c, mediaId) {
  const H = { Authorization: 'Bearer ' + c.token };
  const meta = await req('GET', 'https://graph.facebook.com/' + (c.graph || 'v21.0') + '/' + mediaId, H);
  if (meta.status !== 200) throw new Error('media meta ' + meta.status);
  const j = JSON.parse(meta.body.toString('utf8'));
  if (Number(j.file_size) > MAX) { const e = new Error('big'); e.big = true; throw e; }
  const bin = await req('GET', j.url, H);
  if (bin.status !== 200 || !bin.body.length) throw new Error('media get ' + bin.status);
  if (bin.body.length > MAX) { const e = new Error('big'); e.big = true; throw e; }
  return { buf: bin.body, mime: j.mime_type || '' };
}

// Saves into <dataDir>/inbox; a PDF is also noted for the lab check. Returns the file name.
function save(dataDir, name, buf, opts) {
  const dir = path.join(dataDir, 'inbox');
  fs.mkdirSync(dir, { recursive: true });
  let n = name;
  for (let i = 2; fs.existsSync(path.join(dir, n)); i++) n = name.replace(/(\.[^.]+)?$/, '-' + i + '$1');
  fs.writeFileSync(path.join(dir, n + '.part'), buf, { mode: 0o660 });
  fs.renameSync(path.join(dir, n + '.part'), path.join(dir, n));
  if (opts && opts.labNote && /\.pdf$/i.test(n)) {
    fs.appendFileSync(path.join(dir, '.wa-lab.jsonl'), JSON.stringify({ name: n, at: new Date().toISOString() }) + '\n', { mode: 0o660 });
  }
  return n;
}

module.exports = { partOf, nameFor, shown, download, save, MAX, WORD };
