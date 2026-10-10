'use strict';
/*
  10.10. Itzik, by voice, on the sticker theatre: "now I want to send Alon this
  so he answers too, and then cross between us. How do I send Alon the
  questionnaire, online and animated?"

  Alon gets his own page, docs/alon/. It shows the same 78 characters one at a
  time, with how often each was sent, and asks him who it is. It never shows
  what Itzik said, so the two answers stay independent until they are crossed
  in the theatre. The pictures are sealed with a key of their own that lives
  only in the link (after the #, which a browser never sends anywhere), so the
  page is closed to anyone without the link. The link itself sits sealed in
  Itzik's monitor, under the theatre, with a WhatsApp button he presses.

  Each answer goes out on an ntfy topic that is also only inside the sealed
  bundle. The watchdog runs `pull` every two minutes; new answers land in
  stk/alon.json (sealed like the rest), which the theatre shows next to his.

  Usage: node alon.js build      seal the page and the link
         node alon.js pull       take new answers, push if any
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const inst = require('./lib/instance.js');

const STK = path.join(inst.dataPath, 'files-private', 'stk');
const KEYF = path.join(inst.dataPath, 'alon-key.json');
const STATE = path.join(inst.dataPath, 'status', 'alon-pull.json');
const OUT = path.join(__dirname, 'docs', 'alon');
const SITE = 'https://itcohen2-maker.github.io/abaitzik-monitor/alon/';

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function keys() {
  let k = readJson(KEYF, null);
  if (!k) {
    k = { key: crypto.randomBytes(32).toString('base64url'), topic: 'stk-' + crypto.randomBytes(12).toString('hex'), sig: crypto.randomBytes(9).toString('hex') };
    fs.writeFileSync(KEYF, JSON.stringify(k), { mode: 0o600 });
  }
  return k;
}
function seal(key, buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
}

function unseal(key, msg) {
  if (!msg.startsWith('a1:')) throw new Error('plain');
  const a = Buffer.from(msg.slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, a.subarray(0, 12));
  d.setAuthTag(a.subarray(a.length - 16));
  return Buffer.concat([d.update(a.subarray(12, a.length - 16)), d.final()]).toString('utf8');
}

function build() {
  const k = keys();
  const key = Buffer.from(k.key, 'base64url');
  const list = JSON.parse(fs.readFileSync(path.join(STK, 'index.json'), 'utf8'));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'i'), { recursive: true });
  const meta = { topic: k.topic, sig: k.sig, list: list.map((x) => ({ n: x.n, c: x.c, i: x.i, a: x.a, first: x.first, last: x.last, f: crypto.createHash('sha256').update(k.key + x.f).digest('hex').slice(0, 16) })) };
  list.forEach((x, j) => fs.writeFileSync(path.join(OUT, 'i', meta.list[j].f + '.bin'), seal(key, fs.readFileSync(path.join(STK, x.f)))));
  fs.writeFileSync(path.join(OUT, 'm.bin'), seal(key, Buffer.from(JSON.stringify(meta))));
  fs.copyFileSync(path.join(__dirname, 'alon-page.html'), path.join(OUT, 'index.html'));
  const link = SITE + '#' + k.key;
  fs.writeFileSync(path.join(STK, 'alon-link.json'), JSON.stringify({ link }));
  console.log('built ' + list.length + ' characters');
}

function pull() {
  const k = readJson(KEYF, null);
  if (!k) return;
  const st = readJson(STATE, { since: 'all' });
  let raw = '';
  try { raw = execFileSync('curl', ['-s', '-m', '20', 'https://ntfy.sh/' + k.topic + '/json?poll=1&since=' + st.since], { encoding: 'utf8' }); }
  catch (e) { console.log('!! ntfy: ' + e.message); return; }
  const file = path.join(STK, 'alon.json');
  const ans = readJson(file, {});
  let fresh = [], last = st.since;
  raw.split('\n').filter(Boolean).forEach((line) => {
    let m; try { m = JSON.parse(line); } catch (e) { return; }
    if (m.event !== 'message') return;
    last = m.id;
    let b; try { b = JSON.parse(unseal(Buffer.from(k.key, 'base64url'), String(m.message))); } catch (e) { return; }
    if (!b || b.s !== k.sig || !/^\d+$/.test(String(b.n))) return;
    const t = String(b.t || '').trim().slice(0, 2000);
    if (!t || ans[b.n] && ans[b.n].t === t) return;
    ans[b.n] = { t, at: new Date(m.time * 1000).toISOString() };
    fresh.push(b.n);
  });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ since: last, at: new Date().toISOString() }));
  if (!fresh.length) return;
  fs.writeFileSync(file, JSON.stringify(ans));
  console.log('alon answered ' + fresh.join(','));
  try { require('./lib/notify-channels.js').notify('אלון ענה בתיאטרון', 'מדבקות ' + fresh.map((n) => '#' + n).join(', ')); } catch (e) { console.log('!! notify: ' + e.message); }
  spawn(process.execPath, [path.join(__dirname, 'push.js'), 'stickers: Alon answered ' + fresh.join(',')], { cwd: __dirname, detached: true, stdio: 'ignore' }).unref();
}

if (require.main === module) {
  if (inst.name !== 'abaitzik') process.exit(0);
  const cmd = process.argv[2];
  if (cmd === 'build') build();
  else if (cmd === 'pull') pull();
  else console.log('usage: node alon.js build|pull');
}
