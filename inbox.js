'use strict';
// Reads the monitor's backup channel.
//
// FormSubmit caps the free tier, and Itzik hits it on a busy day. When that
// happens the page sends here instead, so this has to be checked in the same
// round as the mailbox. Voice memos arrive as attachments and are downloaded
// next to the script, ready for transcribe.js.
//
// Usage: node inbox.js            what arrived since the last run
//        node inbox.js --all      everything ntfy still holds (12 hours)
const fs = require('fs');
const path = require('path');

// Which monitor this is. Defaults are Itzik's topic and folders.
const inst = require('./lib/instance.js');
const gate = require('./gate.js');
// Both inbound topics while a rotation window is open, see lib/instance.js.
const TOPICS = inst.inTopics();
const SEEN = path.join(inst.dataPath, 'ntfy-seen.json');
const DROP = path.join(inst.dataPath, 'inbox');

// ntfy's `since` is a second-resolution timestamp, and a voice memo lands in
// the same second as the line that describes it. Asking for time+1 dropped one
// of the pair, so the mark keeps the ids seen at that second and the query
// starts on the second itself.
function mark() {
  try { return JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch (e) { return { time: 0, ids: [] }; }
}

(async () => {
  const all = process.argv.includes('--all');
  const seen = mark();
  const since = all || !seen.time ? 'all' : seen.time;
  if (!TOPICS.length) { console.error('אין ערוץ נכנס: חסר ntfyIn ב-data/keys.json'); process.exit(1); }
  const res = await fetch(`https://ntfy.sh/${TOPICS.join(',')}/json?poll=1&since=${since}`);
  if (!res.ok) { console.error('ntfy ' + res.status); process.exit(1); }
  const body = (await res.text()).trim();
  if (!body) { console.log('(אין הודעות חדשות בערוץ הגיבוי)'); return; }

  const msgs = body.split(String.fromCharCode(10)).map(JSON.parse)
    .filter(m => m.event === 'message')
    .filter(m => all || !seen.ids.includes(m.id));
  if (!msgs.length) { console.log('(אין הודעות חדשות בערוץ הגיבוי)'); return; }

  fs.mkdirSync(DROP, { recursive: true });
  for (const m of msgs) {
    const when = new Date(m.time * 1000).toISOString().slice(0, 19).replace('T', ' ');
    console.log('--- ' + when + ' ---');
    if (m.attachment) {
      // ntfy keeps attachments only about three hours. If the poll is late the
      // audio is already gone, and the fetch returns a small JSON error that
      // looks like a file on disk. That happened once and fourteen recordings
      // were written as 51 byte stubs, so the download is now checked and a
      // loss is reported loudly instead of being handed to the transcriber.
      const res = await fetch(m.attachment.url);
      const bin = Buffer.from(await res.arrayBuffer());
      const expected = Number(m.attachment.size) || 0;
      const looksReal = res.ok && bin.length > 1024 && (!expected || bin.length >= expected * 0.9);
      // 10.11.2026: a file the page sealed (ENC1 / ENC2, see sealBlob in build.js) is opened with the gate key,
      // under its real name for ENC2; a plain one is written as it always was.
      const opened = looksReal ? gate.openFile(bin) : null;
      if (looksReal && opened) {
        const out = path.join(DROP, opened.name || m.attachment.name);
        fs.writeFileSync(out, opened.data);
        console.log('קובץ: ' + out + '  (' + opened.data.length + ' bytes)');
      } else if (looksReal) {
        console.log('!! קובץ מוצפן שלא נפתח: ' + m.attachment.name);
      } else {
        console.log('!! ההקלטה אבדה: ' + m.attachment.name +
          '  (' + res.status + ', ' + bin.length + ' bytes, ציפינו ל-' + expected + ')');
        console.log('!! ntfy מוחק צרופות אחרי כשלוש שעות. צריך לבקש מאיציק לשלוח שוב.');
      }
    }
    // 10.11.2026: a sealed text message ("enc1:") is opened with the gate key; one that does not verify is said so.
    if (m.message) {
      const plain = gate.openMessage(m.message);
      console.log(plain === null ? '!! הודעה מוצפנת שלא נפתחה' : plain);
    }
  }
  const top = msgs[msgs.length - 1].time;
  const ids = msgs.filter(m => m.time === top).map(m => m.id)
    .concat(seen.time === top ? seen.ids : []);
  fs.writeFileSync(SEEN, JSON.stringify({ time: top, ids: ids }), 'utf8');
})();
