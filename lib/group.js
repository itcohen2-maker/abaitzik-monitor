'use strict';
/*
  One send, one message.

  Itzik, 17.9, by voice: "set it up so that I can send a video and a voice note
  and a photo and everything together". The page could already pick several
  files at once, but every file left as its own ntfy message and the caption as
  a fourth. Here they arrived as four unrelated lines in the chat, each one
  waiting for its own answer, and nothing said they were one thing he sent.

  ntfy drops custom headers, so the only field the page can stamp on every part
  of a single send is the title. The page writes a token there. This file is
  what reads it back, and how the parts are described once they are joined.
*/
const AUDIO = /\.(webm|m4a|mp3|ogg|wav)$/i;

// The token the page puts in the title of every part of one send.
function groupOf(title) {
  const m = /\bg([0-9a-z]{4,})\b/.exec(String(title || ''));
  return m ? 'g' + m[1] : null;
}

// The part of a send that carries the typed words rather than bytes.
function isCaption(title) {
  return /(^|\s)cap(\s|$)/.test(String(title || ''));
}

function isAudio(name) { return AUDIO.test(String(name || '')); }

/*
  What the chat line says for a send of several parts. The caption is his own
  words, so it leads. The files follow it on one line, because a line that only
  lists filenames is the thing he said reads like a message that fell over.
*/
function groupText(caption, files) {
  const list = (files || []).filter(Boolean);
  const cap = String(caption || '').trim();
  if (!list.length) return cap;
  const head = list.length === 1
    ? (isAudio(list[0]) ? 'הודעה קולית: ' : 'קובץ: ') + list[0]
    : list.length + ' קבצים יחד: ' + list.join(', ');
  return cap ? cap + String.fromCharCode(10) + '(' + head + ')' : head;
}

// The recording inside a send, so a group with a voice note still gets
// transcribed the moment it lands and not only when a session opens it.
function audioIn(files) {
  return (files || []).filter(isAudio)[0] || null;
}

module.exports = { groupOf, isCaption, groupText, isAudio, audioIn };
