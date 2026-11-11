'use strict';
/*
  11.11.2026, Itzik: "תבנה את הכרטיס". Private messages (Messenger and Instagram) for customers too.

  Every 5 minutes (root, monitor-social-dm.timer, like ads-sync.js) for each customer in
  data/social-dm/tenants.json that turned it on, read their page READ ONLY and put every new incoming
  message as one line in 📋 לטיפול of THAT customer's monitor, then build their page and push to them.
  Itzik's data never goes to a customer and a customer's never to Itzik: each entry reads only its own
  page token and writes only into its own dir, as its own linux user.

  tenants.json: [{ "name": "ilay", "dir": "/home/ilay/ilay-monitor", "setup": "<setup page token>",
                   "step": "meta", "dmStep": "dm", "enabled": false, "enabledAt": "" }]
  On when: enabled is not false (Itzik's veto, e.g. until the customer agreed), and either enabled === true
  or the customer pressed "להפעיל" on the 📸 card of their setup page (state steps[dmStep].choice).
  Page token: from the meta connection saved on their setup page (secrets[step].value.pages[]), or for the
  partner route { "pageId", "tokenFile" } (a system user token that was given the page).
  First round per customer only records what is there (no flood). Seen ids: <dir>/data/status/social-dm.json (600).
  node social-dm-tenants.js [--dry]     Log /var/log/monitor-social-dm.log
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dm = require('./lib/social-dm.js');

const HERE = __dirname;
const SETUP = path.join(HERE, 'data', 'setup');
const LIST = path.join(HERE, 'data', 'social-dm', 'tenants.json');
const DRY = process.argv.includes('--dry');
const ON = 'להפעיל';

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function say(s) { console.log(new Date().toISOString().slice(0, 16) + ' ' + s); }

function isOn(t) {
  if (t.enabled === false) return false;
  if (t.enabled === true) return true;
  const st = readJson(path.join(SETUP, t.setup + '.json'), {});
  return ((st.steps || {})[t.dmStep || 'dm'] || {}).choice === ON;
}

async function pages(t) {
  if (t.pageId && t.tokenFile) {
    let ut = ''; try { ut = fs.readFileSync(t.tokenFile, 'utf8').replace(/[^A-Za-z0-9]/g, ''); } catch (e) {}
    if (!ut) return [];
    const pj = await dm.get(dm.G + t.pageId + '?fields=access_token,instagram_business_account{id,username}&access_token=' + ut);
    if (!pj.access_token) return [];
    const ig = pj.instagram_business_account || {};
    return [{ id: t.pageId, token: pj.access_token, igId: ig.id, igUser: ig.username }];
  }
  const sec = readJson(path.join(SETUP, t.setup + '.secrets.json'), {});
  let v = null; try { v = JSON.parse(sec[t.step || 'meta'].value); } catch (e) {}
  if (!v || v.provider !== 'meta') return [];
  return (v.pages || []).filter((p) => p && p.id && p.token).map((p) => ({ id: p.id, token: p.token, igId: p.ig && p.ig.id, igUser: p.ig && p.ig.username }));
}

function asUser(dir, args) {
  const uid = fs.statSync(dir).uid;
  return execFileSync('sudo', ['-u', '#' + uid, '-H', process.execPath].concat(args), { cwd: dir, encoding: 'utf8', timeout: 300000 });
}

const ADD = 'const h=require("./lib/handle.js"),i=require("./lib/instance.js"),fs=require("fs");let n=0;'
  + 'for(const o of JSON.parse(fs.readFileSync(process.argv[1],"utf8"))){try{if(h.add(i.dataPath,o).created)n++}catch(e){}}'
  + 'fs.unlinkSync(process.argv[1]);console.log(n)';

async function one(t) {
  if (!t.dir || !fs.existsSync(t.dir)) { say(t.name + ': אין תיקייה'); return; }
  if (!isOn(t)) return;
  const list = await pages(t);
  if (!list.length) { say(t.name + ': אין חיבור פייסבוק עם דף'); return; }
  const STATE = path.join(t.dir, 'data', 'status', 'social-dm.json');
  const st = readJson(STATE, null);
  const first = !st;
  const seen = new Set((st && st.seen) || []);
  let fresh = []; const errs = []; let convs = 0, waiting = 0;
  for (const p of list) { const r = await dm.scan(p, seen); fresh = fresh.concat(r.fresh); errs.push(...r.errs); convs += r.convs; waiting += r.waiting; }
  say(t.name + ': convs ' + convs + ', waiting ' + waiting + ', new ' + fresh.length + (first ? ' (first run, recorded only)' : '') + (errs.length ? ' | !! ' + errs.join(' | ') : ''));
  const lines = dm.group(fresh);
  if (DRY) { lines.forEach((f) => say('would add to ' + t.name + ': ' + f.line)); return; }

  const own = fs.statSync(t.dir);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ at: new Date().toISOString(), convs, waiting, errs, seen: [...seen].slice(-3000) }, null, 1), { mode: 0o600 });
  try { fs.chownSync(STATE, own.uid, own.gid); } catch (e) {}
  if (first || !lines.length) return;

  // written by the customer's own user, with the customer's own copy of the code, into the customer's own data
  const items = lines.map((f) => ({ key: 'dm:' + f.id, kind: 'other', who: f.who, title: f.line, link: 'answers', at: f.at }));
  const tmp = path.join(t.dir, 'data', 'status', 'social-dm-new.json');
  fs.writeFileSync(tmp, JSON.stringify(items), { mode: 0o600 }); try { fs.chownSync(tmp, own.uid, own.gid); } catch (e) {}
  let made = 0;
  try { made = Number(asUser(t.dir, ['-e', ADD, tmp]).trim()) || 0; } catch (e) { say(t.name + ': !! handle ' + e.message.slice(0, 100)); }
  if (!made) return;
  const last = lines[lines.length - 1];
  const head = made === 1 ? dm.NAME[last.plat] + ': הודעה חדשה מ' + last.who : made + ' הודעות פרטיות חדשות';
  try { if (fs.existsSync(path.join(t.dir, 'notify.js'))) asUser(t.dir, ['notify.js', head, last.text.slice(0, 120) + '. מחכה לך ב 📋 לטיפול.']); } catch (e) { say(t.name + ': !! notify ' + e.message.slice(0, 80)); }
  try { asUser(t.dir, ['build.js']); execFileSync('chmod', ['-R', 'o+rX', path.join(t.dir, 'docs')]); } catch (e) { say(t.name + ': !! build ' + e.message.slice(0, 80)); }
  say(t.name + ': ' + made + ' שורות נוספו ל 📋');
}

// Self signups (signup-personalize.js) add { name, setup, tenant: true } to data/cal/sources.json with the 📸 card
// from the template. They join here by themselves, and are read only after they press "להפעיל" on that card.
function all() {
  const list = readJson(LIST, []);
  const known = new Set(list.map((t) => t && t.name));
  readJson(path.join(HERE, 'data', 'cal', 'sources.json'), []).forEach((c) => {
    if (!c || !c.tenant || !c.setup || known.has(c.name)) return;
    list.push({ name: c.name, dir: c.dir || '/home/' + c.name + '/' + c.name + '-monitor', setup: c.setup, step: 'meta', dmStep: 'dm' });
  });
  return list;
}

(async () => {
  for (const t of all()) {
    try { await one(t); } catch (e) { say((t && t.name) + ': ' + e.message.slice(0, 120)); }
  }
})();
