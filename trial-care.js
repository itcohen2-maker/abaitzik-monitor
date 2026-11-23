'use strict';
/*
  23.11.2026, Itzik: every trial request, what was done about it, to him; and a daily push to use more of the monitor
  (Gmail and WhatsApp first). Rules and texts in lib/trial-care.js. Root, cron every 5 minutes, so it reads each
  trial's home; Itzik's own files are written as monitor. State: data/signup/care.json.
  node trial-care.js [--dry] [--now <ISO>]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./lib/trial-care.js');
const P = require('./lib/plan.js');

const HERE = __dirname, DATA = path.join(HERE, 'data');
const DRY = process.argv.includes('--dry');
const NOW = (() => { const i = process.argv.indexOf('--now'); return i > 0 ? Date.parse(process.argv[i + 1]) : Date.now(); })();
const STATE = path.join(DATA, 'signup', 'care.json');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const home = (id) => '/home/' + id + '/' + id + '-monitor';
const say = (s) => console.log(new Date(NOW).toISOString().slice(0, 16) + 'Z care ' + s);
const pad = (x) => String(x).padStart(2, '0');
const stamp = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + '-' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
const ls = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const any = (d, re) => ls(d).some((f) => !re || re.test(f));

function chat(id) {
  const dir = path.join(home(id), 'data', 'chat', 'chat');
  return ls(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const d = rd(path.join(dir, f), null);
    return d && d.at ? { at: Date.parse(d.at), from: d.from, text: String(d.text || ''), kind: d.kind || '', name: f } : null;
  }).filter((m) => m && m.at);
}
function used(id, msgs) {
  const d = path.join(home(id), 'data');
  return {
    sign: any(path.join(d, 'csign'), /\.json$/),
    quote: msgs.some((m) => /quote/.test(m.name)) || any(path.join(d, 'biz-home'), /^draft-|quotes/),
    remind: any(path.join(d, 'reminders')) || any(path.join(d, 'alarms')),
    voice: msgs.some((m) => m.from !== 'claude' && /^🎙️/.test(m.text)),
    routine: any(path.join(d, 'routines', 'routines'), /\.json$/),
    book: any(path.join(d, 'bookings')),
  };
}
function israelHour(now) { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date(now))) % 24; }

// to Itzik, as monitor: his WhatsApp (lib/wa-out.js sendOwner) and a line in his answers screen
function toItzik(text) {
  const js = "const fs=require('fs'),p=require('path'),i=require('./lib/instance.js');let t='';process.stdin.on('data',c=>t+=c).on('end',async()=>{"
    + "const d=new Date(),f=p.join(i.dataPath,'chat','chat',d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'-claude-trial-digest.json');"
    + "fs.writeFileSync(f,JSON.stringify({at:d.toISOString(),from:'claude',text:t,kind:'trial-digest'},null,1));"
    + "try{const r=await require('./lib/wa-out.js').sendOwner(i.dataPath,t,{kind:'alert'});console.log('wa '+r.via)}catch(e){console.log('wa failed '+e.message.slice(0,120))}})";
  return execFileSync('sudo', ['-u', 'monitor', 'bash', '-c', 'set -a; . /etc/monitor.env; set +a; cd ' + HERE + ' && HOME=/home/monitor node -e "$0"', js],
    { input: text, encoding: 'utf8', timeout: 90000 }).trim();
}

(async () => {
  const Q = path.join(DATA, 'signup', 'queue');
  const st = rd(STATE, {});
  st.t = st.t || {};
  const nudges = rd(path.join(DATA, 'signup', 'nudges.json'), {});
  const sources = rd(path.join(DATA, 'cal', 'sources.json'), []);
  const rows = [];
  let changed = false;
  for (const n of ls(Q).filter((x) => /^t[a-f0-9]{6}\.json$/.test(x))) {
    const q = rd(path.join(Q, n), null);
    if (!q || q.state !== 'ready' || !q.host) continue;
    const id = q.id || n.slice(0, -5);
    if (!fs.existsSync(path.join(home(id), 'data'))) continue;
    const plan = rd('/srv/monitor-changes/' + id + '.plan.json', null);
    if (!plan || plan.plan !== 'trial' || !plan.start) continue;
    const start = Date.parse(plan.start);
    if (NOW > start + 8 * 864e5) continue;
    const my = st.t[id] = st.t[id] || { sent: {}, cursor: start };
    const female = ((q.profile || {}).gender) === 'f';
    const url = 'https://' + q.host + '/';
    const msgs = chat(id);
    const src = sources.find((x) => x && x.name === id) || {};
    const google = !!(src.step && src.mail);
    const nz = nudges[id] || {};
    const lastWa = Math.max(0, ...['wa1', 'wa2', 'wa3'].map((k) => (nz[k] ? Date.parse(nz[k]) : 0)));
    const tips = [];

    // 1. one feature push
    const k = C.tip({ start, google, used: used(id, msgs), sent: my.sent, lastWa }, NOW);
    if (k) {
      const text = C.tipText(k, url, female);
      if (DRY) say(id + ' tip ' + k + ': ' + text);
      else {
        const dir = path.join(home(id), 'data', 'chat', 'chat'), f = path.join(dir, stamp(new Date(NOW)) + '-claude-push-tip.json');
        fs.writeFileSync(f + '.tmp', JSON.stringify({ at: new Date(NOW).toISOString(), from: 'claude', text, kind: 'tip', waPush: true }, null, 1));
        fs.renameSync(f + '.tmp', f);
        try { const o = fs.statSync(dir); fs.chownSync(f, o.uid, o.gid); } catch (e) {}
        my.sent[k] = my.sent.last = new Date(NOW).toISOString();
        my.told = (my.told || []).concat(C.TIP_NAME[k]);
        changed = true;
        say(id + ' tip ' + k);
      }
    }

    // 2. what he asked, for Itzik
    const p = C.pair(msgs, my.cursor || start, NOW);
    if (p.items.length || (my.told || []).length) {
      let use = 0; try { use = P.usage(fs.readFileSync(path.join(home(id), 'data', 'status', 'usage.jsonl'), 'utf8'), { from: start, to: start + 7 * 864e5 }).actions; } catch (e) { use = 0; }
      rows.push({ id, name: (q.name || q.email || id) + ' (' + id + ')', day: Math.min(7, Math.floor((NOW - start) / 864e5) + 1), used: use,
        total: P.PACKAGES.trial.actions, items: p.items, tips: my.told || [], url, cursor: p.cursor });
    }
  }

  // the digest: every 30 minutes at most, 08:00 to 22:00 Israel time
  const h = israelHour(NOW);
  const due = rows.length && h >= 8 && h < 22 && !(st.lastDigest && NOW - Date.parse(st.lastDigest) < 30 * 60e3);
  if (due) {
    const text = C.digestText(rows);
    if (DRY) say('digest:\n' + text);
    else {
      let r = ''; try { r = toItzik(text); } catch (e) { r = 'failed ' + String(e.message).slice(0, 120); }
      say('digest ' + rows.map((x) => x.id + ':' + x.items.length).join(' ') + ' ' + r);
      if (!/failed/.test(r)) {
        rows.forEach((x) => { st.t[x.id].cursor = x.cursor; st.t[x.id].told = []; });
        st.lastDigest = new Date(NOW).toISOString();
        changed = true;
      }
    }
  }
  if (changed && !DRY) {
    fs.writeFileSync(STATE + '.tmp', JSON.stringify(st, null, 1));
    fs.renameSync(STATE + '.tmp', STATE);
    try { const o = fs.statSync(path.dirname(STATE)); fs.chownSync(STATE, o.uid, o.gid); } catch (e) {}
  }
})();
