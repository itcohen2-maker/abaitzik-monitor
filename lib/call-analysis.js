'use strict';
/*
  Call analysis: a recorded call in, a fixed analysis out.

  6.11.2026, from Revora's code (Noam's "my calls"): a sales call gets a 0 to 100
  score, quotes only from the transcript, objections and tasks. Itzik: "תמשיך".

  The way in is WhatsApp (wa-bridge.js): an audio file that is not a voice note
  (voice:false), or a document with an audio type or extension. A voice note
  stays a request, as before. The audio is transcribed with the monitor's own
  transcribe.js, the transcript is kept in the private files, and the analysis
  is written by the session, in the format below.

  Also from the shell, for a file uploaded on the monitor page:
    node lib/call-analysis.js <audio file>   transcribe, keep, print the request
*/
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const AUDIO_EXT = /\.(m4a|mp3|wav|amr|aac|ogg|oga|opus|3gp|3gpp|webm|flac|wma|caf)$/i;

function isCall(m) {
  if (!m) return false;
  if (m.type === 'audio' && m.audio && m.audio.id && m.audio.voice === false) return true;
  if (m.type === 'document' && m.document && m.document.id) {
    return /^audio\//.test(String(m.document.mime_type || '')) || AUDIO_EXT.test(String(m.document.filename || ''));
  }
  return false;
}

function extOf(m) {
  const o = m[m.type] || {};
  const byName = String(o.filename || '').match(AUDIO_EXT);
  if (byName) return byName[0].toLowerCase();
  const mime = String(o.mime_type || '').split(';')[0];
  return ({ 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/amr': '.amr', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.webm', 'audio/3gpp': '.3gp' })[mime] || '.m4a';
}

// Transcribe with transcribe.js; long calls get a long budget. -> {text, seconds}
function transcribe(root, file) {
  const size = fs.statSync(file).size;
  const budget = Math.max(600000, Math.round(size / 16000 * 2500));
  return new Promise((ok) => {
    execFile('node', ['transcribe.js', file], { cwd: root, timeout: budget, maxBuffer: 32 * 1024 * 1024 }, (err, out) => {
      // transcribe.js prints the text itself (the time goes to stderr); older runs printed JSON.
      const body = String(out || '').trim();
      let text = body; try { const j = JSON.parse(body.split('\n').pop()); if (j && j.text != null) text = String(j.text); } catch (e) {}
      if (err || /^\(/.test(text)) text = '';
      let seconds = 0;
      try { seconds = Number(require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 30000 }).trim()) || 0; } catch (e) {}
      ok({ text: text.trim(), seconds: seconds });
    });
  });
}

// The transcript goes to the private files, so the answer can link it.
function keep(dataPath, name, transcript) {
  const dir = path.join(dataPath, 'files-private');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12);
  const f = 'call-' + stamp + '.txt';
  fs.writeFileSync(path.join(dir, f), (name ? 'קובץ: ' + name + '\n\n' : '') + transcript + '\n', 'utf8');
  return f;
}

function request(o) {
  const mins = o.seconds ? Math.max(1, Math.round(o.seconds / 60)) : null;
  return [
    '📞 ניתוח שיחה' + (o.name ? ' (' + o.name + ')' : '') + (mins ? ', כ ' + mins + ' דקות' : '') + '. התמליל המלא: files/' + o.txt,
    '',
    'כתוב ניתוח קצר בעברית, רק מתוך התמליל. ציטוט הוא רק מילה במילה מהתמליל, במירכאות. בלי מקפים בטקסט. הפורמט:',
    '1. סוג השיחה (מכירה, שירות, גבייה, אחר) ועם מי, אם נאמר.',
    '2. בשיחת מכירה: ציון 0 עד 100 ומשפט אחד למה.',
    '3. מה עבד: עד 3 נקודות, כל אחת עם ציטוט.',
    '4. מה לשפר: עד 3 נקודות, כל אחת עם ציטוט ומה היה עדיף להגיד.',
    '5. התנגדויות שעלו ואיך נענו.',
    '6. משימות: מה הובטח ללקוח, מה הלקוח הבטיח, עם תאריך אם נאמר.',
    '7. הצעד הבא, אחד.',
    'אם הלקוח מופיע ב "העסק שלי" (data/biz/biz) עדכן בו note, next ו nextAt; אם הוא לא שם ובשיחת מכירה, הוסף אותו כליד. לא לשלוח שום דבר ללקוח ולא לקבוע פגישה בלי אישור. אם התמליל ריק או לא ברור, כתוב את זה ואל תנחש.',
    '',
    'התמליל:',
    o.transcript.length > 30000 ? o.transcript.slice(0, 30000) + ' [המשך בקובץ]' : o.transcript,
  ].join('\n');
}

module.exports = { isCall, extOf, transcribe, keep, request, AUDIO_EXT };

if (require.main === module) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('usage: node lib/call-analysis.js <audio file>'); process.exit(1); }
  const inst = require('./instance.js');
  const root = path.join(__dirname, '..');
  transcribe(root, path.resolve(file)).then((r) => {
    if (!r.text) { console.log('התמלול נכשל או שההקלטה ריקה.'); process.exit(2); }
    const txt = keep(inst.dataPath, path.basename(file), r.text);
    console.log(request({ name: path.basename(file), seconds: r.seconds, txt, transcript: r.text }));
  });
}
