'use strict';
/*
  Writes a script into one of Itzik's notes.

  Itzik, 18.10: "אני כותב בפתקים רעיונות לסרטונים הבאים, אשמח שבכל פתק יהיה
  לינק להתייעץ עם המוניטור, ואז הוא יכתוב איתי את התסריט בתוך הפתק עצמו."
  The note's button sends a chat line "✍️ פתק לתסריט [note:<id>]" with his
  request and the whole note. The session that answers writes the script
  here, and the phone puts it into the open note on the next refresh.

  Then, the same day: not only scripts. "אני המוניטור כאן כדי לעזור לך",
  tidy the note, finish an idea, write with him.

  His own lines stay as they are. What the monitor writes goes under one
  heading, "🤖 מהמוניטור", and a second request replaces what is under it, so
  the note holds his words and the newest answer, never a pile of drafts.
  With --whole the text replaces the whole note: for "תסדר לי את הפתק",
  where the answer is his own note, put in order.

  Usage: node note-write.js [--whole] <note id> <text.txt> [<note text.txt>]
  The third file is the note as it came in the message, used only when the
  note has not reached the server yet. Then: node push.js "note: script".
*/
const fs = require('fs');
const path = require('path');
const ns = require('./lib/notes-sync.js');

const HEAD = '🤖 מהמוניטור';
// The heading of the first version, 18.10 afternoon. A note written then is still found.
const OLD = ['✍️ התסריט'];
const NL = '\n';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlFromText(t) {
  const ls = String(t || '').split(NL);
  return ls.map((x, i) => (i === 0 ? '<h1>' : '<div>') + (esc(x) || '<br>') + (i === 0 ? '</h1>' : '</div>')).join('');
}

// The note with the script under HEAD, replacing an earlier one.
function cut(s, marks) {
  let at = -1;
  marks.forEach(m => { const i = s.indexOf(m); if (i >= 0 && (at < 0 || i < at)) at = i; });
  return at >= 0 ? s.slice(0, at) : s;
}

function withScript(note, script, whole) {
  const body = String(script || '').trim();
  const stamp = { upd: new Date().toISOString(), by: 'monitor' };
  if (whole) return Object.assign({}, note, { text: body, html: htmlFromText(body) }, stamp);
  const ls = body.split(NL);
  const heads = [HEAD].concat(OLD);
  const text = cut(String(note.text || ''), heads).replace(/\s+$/, '') + NL + NL + HEAD + NL + body;
  const html = cut(note.html || htmlFromText(note.text), heads.map(h => '<h2>' + h))
    + '<div><br></div><h2>' + HEAD + '</h2>' + ls.map(x => '<div>' + (esc(x) || '<br>') + '</div>').join('');
  return Object.assign({}, note, { text, html }, stamp);
}

function write(dir, id, script, fallbackText, whole) {
  const have = ns.read(dir) || { notes: [] };
  if ((have.gone || {})[id]) throw new Error('the note ' + id + ' was deleted');
  let note = (have.notes || []).find(n => n && n.id === id);
  if (!note) {
    if (!fallbackText) throw new Error('no note ' + id + ' on the server and no note text to start from');
    const at = new Date().toISOString();
    note = { id, text: String(fallbackText).trim(), at, upd: at };
  }
  const out = withScript(note, script, whole);
  ns.record(dir, { at: out.upd, notes: [out] });
  return out;
}

module.exports = { withScript, write, HEAD };

if (require.main === module) {
  const args = process.argv.slice(2);
  const whole = args[0] === '--whole';
  const [id, scriptFile, noteFile] = whole ? args.slice(1) : args;
  if (!id || !scriptFile) {
    console.error('usage: node note-write.js [--whole] <note id> <text.txt> [<note text.txt>]');
    process.exit(2);
  }
  const dir = path.join(require('./lib/instance.js').dataPath, 'notes', 'notes');
  const n = write(dir, id, fs.readFileSync(scriptFile, 'utf8'), noteFile ? fs.readFileSync(noteFile, 'utf8') : '', whole);
  console.log('written into the note ' + n.id + ' (' + n.text.split(NL)[0] + ')');
}
