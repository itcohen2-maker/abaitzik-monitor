'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const group = require('../lib/group.js');
const { renderPage } = require('../build.js');
const { fixture } = require('./page.test.js');

/*
  Itzik, 17.9, by voice: "set it up so I can send a video and a voice and a
  photo and everything together". These are the two halves of that: the page
  has to stamp one token on every part of a send, and the listener has to read
  that token and keep the parts on one line.
*/

test('a group token survives the title the page can actually set', () => {
  assert.equal(group.groupOf('file gk3x9q2a 1/3'), 'gk3x9q2a');
  assert.equal(group.groupOf('monitor gk3x9q2a cap'), 'gk3x9q2a');
  assert.equal(group.groupOf('monitor'), null);
  assert.equal(group.groupOf(''), null);
  assert.equal(group.groupOf(undefined), null);
});

test('only the caption part is marked as the caption', () => {
  assert.equal(group.isCaption('monitor gk3x9q2a cap'), true);
  assert.equal(group.isCaption('file gk3x9q2a 2/3'), false);
});

test('one file on its own reads exactly as it always did', () => {
  assert.equal(group.groupText('', ['voice-20260917085651.webm']),
    'הודעה קולית: voice-20260917085651.webm');
});

test('his words lead, the files follow them', () => {
  const t = group.groupText('תראה את זה', ['voice-1.webm', 'clip.mp4', 'a.jpg']);
  assert.ok(t.startsWith('תראה את זה'), 'the sentence he sent has to come first');
  assert.ok(t.includes('clip.mp4') && t.includes('a.jpg') && t.includes('voice-1.webm'));
  assert.ok(t.includes('3 קבצים'));
});

test('a recording inside a mixed send is still found, so it is transcribed', () => {
  assert.equal(group.audioIn(['clip.mp4', 'voice-9.webm', 'a.jpg']), 'voice-9.webm');
  assert.equal(group.audioIn(['clip.mp4', 'a.jpg']), null);
});

// The page half. These read the built document, because a token that is only
// in build.js and not in what the phone downloads carries nothing.
const html = renderPage(fixture());

test('every part of one send leaves stamped with the same token', () => {
  assert.ok(html.includes("Title: 'file ' + gid + ' ' + (i + 1) + '/' + n"),
    'each uploaded file must carry the group token');
  assert.ok(html.includes("gid ? ' ' + gid + ' cap' : ''"),
    'the caption must carry the same token');
  assert.ok(html.includes("ntfyText('קובץ', note, gid)"),
    'the caption send must be handed the token of its own batch');
});

test('a recording joins the files already picked instead of wiping them', () => {
  assert.ok(html.includes('var batch=picked();'),
    'the recorder must start from whatever is already chosen');
  assert.ok(html.includes('batch.push(file);'),
    'the recording must be added to that batch, not sent instead of it');
  assert.ok(/if\(batch\.length>1&&qMode==='normal'\)shrinkAll\(batch,reallySend\)/.test(html),
    'photos in a mixed batch still get shrunk');
});

test('the everyday picker takes clips as well as stills', () => {
  assert.ok(html.includes("openPicker('normal','image/*,video/*')"),
    'he asked to send a video with a photo, so the first picker has to offer both');
});

test('the page says the send survives a spent quota', () => {
  assert.ok(html.includes('כשנגמרת המכסה'),
    'a channel at its wall must not read like the line went dead');
});

// The listener half, without opening a connection: the merge is what matters.
test('the listener folds later parts into the message already on the page', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'listen.js'), 'utf8');
  assert.ok(src.includes("require('./lib/group.js')"), 'the listener must read the token');
  assert.ok(src.includes('groupFiles'), 'it must remember which file a token opened');
  assert.ok(src.includes("if (rec.status === 'done')"),
    'a part that lands after the answer must not rewrite the answered message');
});

/*
  The whole trip, against real files: four ntfy messages, seconds apart,
  carrying a clip, a photo, a recording and the sentence he typed over them.
  He sent one thing, so one thing has to be waiting for an answer.
*/
test('four parts of one send become one message in the chat', () => {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abaitzik-chat-'));
  process.env.ABAITZIK_CHAT_DIR = dir;
  delete require.cache[require.resolve('../listen.js')];
  const L = require('../listen.js');
  const gid = 'gtest123';
  L.recordIncoming({ id: 'A1', title: 'file ' + gid + ' 1/3', attachment: { name: 'clip.mp4' } });
  L.recordIncoming({ id: 'A2', title: 'file ' + gid + ' 2/3', attachment: { name: 'photo.jpg' } });
  L.recordIncoming({ id: 'A3', title: 'file ' + gid + ' 3/3', attachment: { name: 'voice-1.webm' } });
  L.recordIncoming({ id: 'A4', title: 'monitor ' + gid + ' cap',
    message: 'קובץ' + String.fromCharCode(10) + 'תראה את השלושה האלה' });
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1, 'one send is one line, not four');
  const rec = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  assert.equal(rec.status, 'working');
  assert.equal(rec.id, 'ntfy-A1', 'the message keeps the id of the part that opened it');
  assert.deepEqual(rec.files, ['clip.mp4', 'photo.jpg', 'voice-1.webm']);
  assert.ok(rec.text.startsWith('תראה את השלושה האלה'), 'his own words lead the line');
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.ABAITZIK_CHAT_DIR;
  delete require.cache[require.resolve('../listen.js')];
});

test('a send with no token still lands on its own line, as it always did', () => {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abaitzik-chat-'));
  process.env.ABAITZIK_CHAT_DIR = dir;
  delete require.cache[require.resolve('../listen.js')];
  const L = require('../listen.js');
  L.recordIncoming({ id: 'B1', title: 'file', attachment: { name: 'voice-9.webm' } });
  L.recordIncoming({ id: 'B2', title: 'monitor', message: 'שורה נפרדת' });
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 2, 'two unrelated sends stay two messages');
  const texts = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).text);
  assert.ok(texts.some((t) => t === 'הודעה קולית: voice-9.webm'));
  assert.ok(texts.some((t) => t === 'שורה נפרדת'));
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.ABAITZIK_CHAT_DIR;
  delete require.cache[require.resolve('../listen.js')];
});

test('requiring the listener does not open a connection', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'listen.js'), 'utf8');
  assert.ok(src.includes('if (require.main === module)'),
    'a test must never become a second listener');
});

test('the caption survives a body that lost its newlines', () => {
  const nl = String.fromCharCode(10);
  assert.equal(group.captionFrom('קובץ' + nl + 'תראה את זה' + nl + nl + 'קוד 1808'),
    'תראה את זה');
  // A relay that strips newlines used to swallow the whole sentence.
  assert.equal(group.captionFrom('קובץבדיקה עצמיתקוד 1808'), 'בדיקה עצמית');
});
