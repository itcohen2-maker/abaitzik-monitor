/*
  The lecture text follows the Google Doc by itself.

  Itzik, 22.10.2026: "אם אני משנה את קובץ המלל של ההרצאה, אתה משנה את זה
  אוטומטית גם ל PDF אימון?" It did not: the practice PDF changed only when a
  session was asked to change the lecture, so his own edits in the Doc for
  editing stayed out of it until the next request.

  Every ten minutes (scheduled task AbaItzikLecWatch, hidden), on this PC only:
  the Doc's .gdoc pointer in the synced Drive folder gets a new time whenever
  the Doc is edited. Same time as last run: nothing happens, no Claude, no
  network. A new time, and quiet for three minutes (he may still be typing):
  Chrome (Profile 4, itcohen2) downloads the Doc as text, work/lec14/lecsync.py
  carries the changed paragraphs into text.html and practice.html, and
  publish.sh builds both PDFs, puts them in the monitor and in Drive. Plain
  code all the way; Claude never runs here.
    node lec-watch.js          one check
    node lec-watch.js --force  download and sync even if the time did not change
*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const HERE = __dirname;
const LEC = 'C:\\Users\\User\\work\\lec14';
const GDOC = 'G:\\My Drive\\הרצאה להמונים\\כנגד כל הסיכויים, המלל המלא לעריכה.gdoc';
const DOC_ID = '1gyj8Wt-3g8QhmOecP2MmmbZW69RepTzDNZKOsjf-3Vk';
const DL = path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'Downloads');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const STATE = path.join(HERE, 'data', 'status', 'lec-watch.json');
const LOG = path.join(HERE, 'data', 'status', 'lec-watch.log');
const LOCK = path.join(HERE, 'data', 'status', 'lec-watch.lock');
const SETTLE_MS = 3 * 60 * 1000;
const FORCE = process.argv.includes('--force');

function log(s) { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + s + '\n', 'utf8'); } catch (e) {} }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function tell(t, b) { try { execFileSync('node', ['notify.js', t, b], { cwd: HERE, timeout: 60000 }); } catch (e) { log('notify failed: ' + e.message); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download() {
  const start = Date.now();
  // A new tab whose page turns out to be a download closes itself in Chrome.
  spawn(CHROME, ['--profile-directory=Profile 4', 'https://docs.google.com/document/d/' + DOC_ID + '/export?format=txt'],
    { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    const got = fs.readdirSync(DL)
      .filter((f) => f.startsWith('כנגד כל הסיכויים, המלל המלא לעריכה') && f.endsWith('.txt'))
      .map((f) => ({ f: path.join(DL, f), t: fs.statSync(path.join(DL, f)).mtimeMs }))
      .filter((x) => x.t >= start - 2000).sort((a, b) => b.t - a.t)[0];
    if (got && fs.statSync(got.f).size > 1000) {
      await sleep(1000);
      const to = path.join(LEC, 'doc-latest.txt');
      fs.copyFileSync(got.f, to);
      fs.unlinkSync(got.f);
      return to;
    }
  }
  return null;
}

async function main() {
  let t;
  try { t = fs.statSync(GDOC).mtimeMs; } catch (e) { log('no gdoc: ' + e.message); return; }
  const st = readJson(STATE, {});
  if (!FORCE && st.seen && t <= st.seen) return;
  if (!FORCE && Date.now() - t < SETTLE_MS) { log('changed, waiting for him to finish typing'); return; }
  try {
    const l = readJson(LOCK, null);
    if (l && Date.now() - l.at < 20 * 60000) return;
  } catch (e) {}
  fs.writeFileSync(LOCK, JSON.stringify({ at: Date.now(), pid: process.pid }));
  try {
    const doc = await download();
    if (!doc) {
      // Three tries, then wait for the next edit, so Chrome does not open every ten minutes.
      st.fails = (st.fails || 0) + 1;
      log('download failed ' + st.fails);
      if (st.fails >= 3) { st.seen = t; st.fails = 0; tell('הרצאה: לא הצלחתי להוריד את המלל', 'המסמך לעריכה השתנה, ושלוש הורדות מכרום נכשלו. קובץ האימון לא עודכן.'); }
      fs.writeFileSync(STATE, JSON.stringify(st));
      return;
    }
    const hash = crypto.createHash('sha1').update(fs.readFileSync(doc)).digest('hex');
    if (!FORCE && hash === st.hash) { st.seen = t; fs.writeFileSync(STATE, JSON.stringify(st)); log('same text, nothing to do'); return; }
    const out = execFileSync('python3', ['lecsync.py', doc, '--apply'], { cwd: LEC, encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }), timeout: 60000 });
    log(out.trim().split('\n').slice(-1)[0]);
    const n = Number((/changes: (\d+)/.exec(out) || [])[1] || 0);
    if (n) {
      const pub = execFileSync(BASH, ['publish.sh', 'הרצאה: המלל עודכן לפי המסמך לעריכה'], { cwd: LEC, encoding: 'utf8', timeout: 480000 });
      log(pub.trim().split('\n').slice(-1)[0]);
      const again = execFileSync('python3', ['lecsync.py', doc], { cwd: LEC, encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }), timeout: 60000 });
      if (!/changes: 0/.test(again)) throw new Error('after the sync the files still differ from the Doc');
      tell('הרצאה עודכנה', 'המלל לעריכה השתנה ב ' + n + ' מקומות. קובץ האימון והמלל המלא עודכנו לפיו, באריח 🎤 הרצאה ובדרייב.');
    }
    fs.writeFileSync(STATE, JSON.stringify({ seen: t, hash, at: new Date().toISOString(), changes: n }));
  } catch (e) {
    log('!! ' + e.message);
    tell('הרצאה: העדכון האוטומטי נכשל', String(e.message).slice(0, 200));
    fs.writeFileSync(STATE, JSON.stringify(Object.assign(st, { seen: t })));
  } finally {
    try { fs.unlinkSync(LOCK); } catch (e) {}
  }
}

main();
