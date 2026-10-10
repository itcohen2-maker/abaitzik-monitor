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

  10.10, later, Itzik by voice: "I want this file we work on, with Rachel, in
  the puppet theatre, to be shared by me and Alon. Everything I update he
  sees, and everything he updates I see too. And you can always ask him: do
  you have anything to add?" So the blind round is over. The sealed bundle now
  carries what Itzik told about each character (read from his chat lines the
  same way the theatre reads them) and everything Alon wrote, and his page
  asks him under Itzik's words whether he has something to add. What he sends
  is added under what he wrote before, never in its place. `pull` rebuilds
  the bundle whenever either side changed, so each sees the other within two
  minutes.

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

// Itzik's words per character, as the theatre's stkDone() reads them from the chat.
function itzikSaid() {
  const dir = path.join(inst.dataPath, 'chat', 'chat');
  const msgs = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const m = readJson(path.join(dir, f), null);
    if (m && m.from === 'itzik' && /מדבקה #\d/.test(String(m.text || ''))) msgs.push(m);
  }
  msgs.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const seen = {};
  for (const m of msgs) {
    const t = String(m.text), re = /מדבקה #([0-9]+):?/g, all = [];
    let hit;
    while ((hit = re.exec(t))) all.push({ n: hit[1], s: hit.index, at: hit.index + hit[0].length });
    all.forEach((h, j) => {
      let said = t.slice(h.at, j + 1 < all.length ? all[j + 1].s : t.length).trim();
      if (said.endsWith('🎭')) said = said.slice(0, -2).trim();
      if (said) seen[h.n] = seen[h.n] ? seen[h.n] + '\n' + said : said;
    });
  }
  return seen;
}

function shared() {
  const alon = readJson(path.join(STK, 'alon.json'), {});
  const al = {};
  Object.keys(alon).forEach((n) => { al[n] = alon[n].t; });
  return { it: itzikSaid(), al };
}

function build() {
  const k = keys();
  const key = Buffer.from(k.key, 'base64url');
  const list = JSON.parse(fs.readFileSync(path.join(STK, 'index.json'), 'utf8'));
  fs.mkdirSync(path.join(OUT, 'i'), { recursive: true });
  // A picture's name follows its content, so a rebuild for new words leaves the pictures as they are.
  const name = (x) => crypto.createHash('sha256').update(k.key + x.f + crypto.createHash('sha256').update(fs.readFileSync(path.join(STK, x.f))).digest('hex')).digest('hex').slice(0, 16);
  const sh = shared();
  const meta = { topic: k.topic, sig: k.sig, it: sh.it, al: sh.al, list: list.map((x) => ({ n: x.n, c: x.c, i: x.i, a: x.a, first: x.first, last: x.last, f: name(x) })) };
  const keep = new Set(meta.list.map((x) => x.f + '.bin'));
  for (const f of fs.readdirSync(path.join(OUT, 'i'))) if (!keep.has(f)) fs.rmSync(path.join(OUT, 'i', f));
  list.forEach((x, j) => {
    const out = path.join(OUT, 'i', meta.list[j].f + '.bin');
    if (!fs.existsSync(out)) fs.writeFileSync(out, seal(key, fs.readFileSync(path.join(STK, x.f))));
  });
  fs.writeFileSync(path.join(OUT, 'm.bin'), seal(key, Buffer.from(JSON.stringify(meta))));
  const st = readJson(STATE, {});
  st.built = digest(sh);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st));
  fs.copyFileSync(path.join(__dirname, 'alon-page.html'), path.join(OUT, 'index.html'));
  const link = SITE + '#' + k.key;
  fs.writeFileSync(path.join(STK, 'alon-link.json'), JSON.stringify({ link }));
  console.log('built ' + list.length + ' characters');
}

function digest(sh) { return crypto.createHash('sha256').update(JSON.stringify(sh)).digest('hex').slice(0, 16); }

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
    const had = ans[b.n] ? ans[b.n].t : '';
    if (!t || had === t || had.split('\n').includes(t)) return;
    // Before the shared page an answer came whole, edits included; now each is an addition.
    ans[b.n] = { t: had && !t.startsWith(had) ? had + '\n' + t : t, at: new Date(m.time * 1000).toISOString() };
    fresh.push(b.n);
  });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(Object.assign(st, { since: last, at: new Date().toISOString() })));
  if (fresh.length) {
    fs.writeFileSync(file, JSON.stringify(ans));
    console.log('alon answered ' + fresh.join(','));
    try { require('./lib/notify-channels.js').notify('אלון ענה בתיאטרון', 'מדבקות ' + fresh.map((n) => '#' + n).join(', ')); } catch (e) { console.log('!! notify: ' + e.message); }
  }
  // Either side changed: reseal his page so he sees Itzik's new words and his own.
  const again = digest(shared()) !== st.built;
  if (again) { try { build(); } catch (e) { console.log('!! alon build: ' + e.message); return; } }
  if (!fresh.length && !again) return;
  spawn(process.execPath, [path.join(__dirname, 'push.js'), fresh.length ? 'stickers: Alon answered ' + fresh.join(',') : 'stickers: Alon page sees Itzik\'s new words'], { cwd: __dirname, detached: true, stdio: 'ignore' }).unref();
}

if (require.main === module) {
  if (inst.name !== 'abaitzik') process.exit(0);
  const cmd = process.argv[2];
  if (cmd === 'build') build();
  else if (cmd === 'pull') pull();
  else console.log('usage: node alon.js build|pull');
}
