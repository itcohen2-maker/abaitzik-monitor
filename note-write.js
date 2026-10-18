'use strict';
/*
  Writes a script into one of Itzik's notes.

  Itzik, 18.10: "אני כותב בפתקים רעיונות לסרטונים הבאים, אשמח שבכל פתק יהיה
  לינק להתייעץ עם המוניטור, ואז הוא יכתוב איתי את התסריט בתוך הפתק עצמו."
  The note's button sends a chat line "✍️ פתק לתסריט [note:<id>]" with his
  request and the whole note. The session that answers writes the script
  here, and the phone puts it into the open note on the next refresh.

  His own lines stay as they are. The script goes under one heading,
  "✍️ התסריט", and a second request replaces what is under it, so the note
  holds his idea and the newest script, never a pile of drafts.

  Usage: node note-write.js <note id> <script.txt> [<note text.txt>]
  The third file is the note as it came in the message, used only when the
  note has not reached the server yet. Then: node push.js "note: script".
*/
const fs = require('fs');
const path = require('path');
const ns = require('./lib/notes-sync.js');

const HEAD = '✍️ התסריט';
const NL = '\n';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlFromText(t) {
  const ls = String(t || '').split(NL);
  return ls.map((x, i) => (i === 0 ? '<h1>' : '<div>') + (esc(x) || '<br>') + (i === 0 ? '</h1>' : '</div>')).join('');
}

// The note with the script under HEAD, replacing an earlier one.
function withScript(note, script) {
  const body = String(script || '').trim().split(NL);
  let text = String(note.text || '');
  const ti = text.indexOf(HEAD);
  if (ti >= 0) text = text.slice(0, ti);
  text = text.replace(/\s+$/, '') + NL + NL + HEAD + NL + body.join(NL);
  let html = note.html || htmlFromText(note.text);
  const hi = html.indexOf('<h2>' + HEAD);
  if (hi >= 0) html = html.slice(0, hi);
  html += '<div><br></div><h2>' + HEAD + '</h2>' + body.map(x => '<div>' + (esc(x) || '<br>') + '</div>').join('');
  return Object.assign({}, note, { text, html, upd: new Date().toISOString(), by: 'monitor' });
}

function write(dir, id, script, fallbackText) {
  const have = ns.read(dir) || { notes: [] };
  if ((have.gone || {})[id]) throw new Error('the note ' + id + ' was deleted');
  let note = (have.notes || []).find(n => n && n.id === id);
  if (!note) {
    if (!fallbackText) throw new Error('no note ' + id + ' on the server and no note text to start from');
    const at = new Date().toISOString();
    note = { id, text: String(fallbackText).trim(), at, upd: at };
  }
  const out = withScript(note, script);
  ns.record(dir, { at: out.upd, notes: [out] });
  return out;
}

module.exports = { withScript, write, HEAD };

if (require.main === module) {
  const [id, scriptFile, noteFile] = process.argv.slice(2);
  if (!id || !scriptFile) {
    console.error('usage: node note-write.js <note id> <script.txt> [<note text.txt>]');
    process.exit(2);
  }
  const dir = path.join(require('./lib/instance.js').dataPath, 'notes', 'notes');
  const n = write(dir, id, fs.readFileSync(scriptFile, 'utf8'), noteFile ? fs.readFileSync(noteFile, 'utf8') : '');
  console.log('written into the note ' + n.id + ' (' + n.text.split(NL)[0] + ')');
}
