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

const TOPIC = 'abaitzik-in-95e62e86c34f4853';
const SEEN = path.join(__dirname, 'data', 'ntfy-seen.json');
const DROP = path.join(__dirname, 'data', 'inbox');

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
  const res = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=${since}`);
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
      // ntfy drops attachments after a few hours, so they are pulled now and
      // kept on disk rather than fetched again at transcribe time.
      const out = path.join(DROP, m.attachment.name);
      const bin = Buffer.from(await (await fetch(m.attachment.url)).arrayBuffer());
      fs.writeFileSync(out, bin);
      console.log('קובץ: ' + out + '  (' + m.attachment.size + ' bytes)');
    }
    if (m.message) console.log(m.message);
  }
  const top = msgs[msgs.length - 1].time;
  const ids = msgs.filter(m => m.time === top).map(m => m.id)
    .concat(seen.time === top ? seen.ids : []);
  fs.writeFileSync(SEEN, JSON.stringify({ time: top, ids: ids }), 'utf8');
})();
