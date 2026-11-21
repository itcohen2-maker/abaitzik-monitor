'use strict';
/*
  11.11.2026, Itzik: "גם אצלי לא מגיעות לי הודעות מהאינסטגרם, אני לא מחובר... ומה לגבי המסנג'ר?"
  Private messages to his own page "אבא איציק" and to Instagram abaitzik never reached the monitor.
  lead-scan.js covers the ITsolution page only.

  Every 5 minutes (cron, user monitor) this asks Meta, READ ONLY, for the latest Messenger and Instagram
  conversations of the page, and every NEW incoming message (not written by the page or the IG account)
  becomes one item in 📋 לטיפול plus one push. Nothing is ever sent, liked or marked as read: Itzik answers himself.
  First run only records what is there (no flood) and prints how many conversations wait for an answer.
  Seen message ids live in data/status/social-dm.json (data/ is not in git; the repo is public).
  Token: /home/monitor/.ig-token-abaitzik (system user) -> page token.  --dry prints, writes nothing.
*/
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const inst = require('./lib/instance.js');
const handle = require('./lib/handle.js');

const PAGE = '1225985557254712';
const IG = '17841439995081131';
const G = 'https://graph.facebook.com/v23.0/';
const HOME = process.env.HOME || '/home/monitor';
const DRY = process.argv.includes('--dry');
const STATE = path.join(inst.dataPath, 'status', 'social-dm.json');
const NAME = { instagram: '📸 אינסטגרם', messenger: '💬 מסנג׳ר' };

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 60000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ error: { message: 'bad json' } }); } });
    }).on('error', (e) => resolve({ error: { message: e.message, net: true } }))
      .on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
function clean(s) { return String(s || '').replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim(); }

(async () => {
  const at = new Date().toISOString();
  let ut = ''; try { ut = fs.readFileSync(path.join(HOME, '.ig-token-abaitzik'), 'utf8').replace(/[^A-Za-z0-9]/g, ''); } catch (e) { /* none */ }
  if (!ut) { console.log(at + ' !! no token'); return; }
  const pj = await get(G + PAGE + '?fields=access_token&access_token=' + ut);
  if (!pj.access_token) { console.log(at + ' !! page token: ' + ((pj.error && pj.error.message) || '?')); return; }
  const pt = pj.access_token;

  let st = null; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* first run */ }
  const first = !st;
  const seen = new Set((st && st.seen) || []);
  const fresh = []; const errs = []; let waiting = 0; let convs = 0;

  for (const plat of ['messenger', 'instagram']) {
    const j = await get(G + PAGE + '/conversations?platform=' + plat + '&fields=participants,updated_time,messages.limit(5){id,message,from,created_time}&limit=15&access_token=' + pt);
    if (j.error) { errs.push(plat + ': ' + j.error.message); continue; }
    (j.data || []).forEach((cv) => {
      convs++;
      const msgs = (cv.messages && cv.messages.data) || [];
      const mine = (m) => !m.from || m.from.id === PAGE || m.from.id === IG || m.from.username === 'abaitzik';
      if (msgs[0] && !mine(msgs[0])) waiting++;
      msgs.forEach((m) => {
        if (!m.id || seen.has(m.id)) return;
        seen.add(m.id);
        if (mine(m)) return;
        fresh.push({ plat, id: m.id, who: clean(m.from.name || m.from.username || 'מישהו'), text: clean(m.message) || 'שלח תמונה, סרטון או קישור', at: m.created_time });
      });
    });
  }
  console.log(at + ' convs ' + convs + ', waiting ' + waiting + ', new ' + fresh.length + (first ? ' (first run, recorded only)' : '') + (errs.length ? ' | !! ' + errs.join(' | ') : ''));
  if (DRY) { fresh.forEach((f) => console.log('would add: ' + NAME[f.plat] + ' · ' + f.who + ': ' + f.text.slice(0, 80))); return; }

  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ at, convs, waiting, errs, seen: [...seen].slice(-3000) }, null, 1), { encoding: 'utf8', mode: 0o600 });
  if (first || !fresh.length) return;

  fresh.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  // One item per person per round: a burst of shared reels is one line, with the count and the last text.
  const by = new Map();
  fresh.forEach((f) => { const k = f.plat + '|' + f.who; const o = by.get(k) || { ...f, n: 0 }; o.n++; o.id = f.id; o.at = f.at; o.text = f.text; by.set(k, o); });
  let made = 0;
  [...by.values()].forEach((f) => {
    const line = NAME[f.plat] + ' · ' + f.who + ': ' + f.text.slice(0, 80) + (f.n > 1 ? ' (' + f.n + ' הודעות)' : '');
    try { if (handle.add(inst.dataPath, { key: 'dm:' + f.id, kind: 'other', who: f.who, title: line, link: 'answers', at: f.at }).created) made++; }
    catch (e) { console.log('!! handle: ' + e.message); }
  });
  if (!made) return;
  const one = fresh[fresh.length - 1];
  const head = made === 1 ? NAME[one.plat] + ': הודעה חדשה מ' + one.who : made + ' הודעות פרטיות חדשות';
  try { console.log(execFileSync(process.execPath, ['notify.js', head, one.text.slice(0, 120) + '. מחכה לך ב 📋 לטיפול, עונים מהטלפון.'], { cwd: __dirname, encoding: 'utf8', timeout: 60000 }).trim()); }
  catch (e) { console.log('!! notify: ' + e.message); }
  try { execFileSync(process.execPath, ['push.js', 'לטיפול: הודעות פרטיות ' + made], { cwd: __dirname, stdio: 'inherit', timeout: 300000 }); }
  catch (e) { console.log('!! push: ' + e.message); }
})();
