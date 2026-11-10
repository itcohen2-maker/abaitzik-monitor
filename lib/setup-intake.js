'use strict';
/*
  10.11.2026, Itzik: "הוא שלח את הטופס, קיבלנו התראה שמולא, אז אפשר למשוך הכל. אתה חייב לבדוק את זה אוטומטית.
  מעכשיו זה התפקיד של המנהל." A customer's setup form came back, so everything it holds is pulled into his own monitor.

  Per setup token (data/setup/<token>.*) and its tenant:
    a. connections: a connected Google card puts the tenant in data/cal/sources.json (mail:true when the token has the
       Gmail read scope), a connected Microsoft card is recorded as msStep (cal-sync.js reads the Outlook calendar);
    b. files: every uploaded file is copied into <tenant>/data/files-private/setup/<card>/ (owned by the tenant user,
       sealed into his page like any private file, never in git);
    c. lab delivery notes (card "lab", or a PDF that looks like one): lab-check.js, once per file;
    d. answers: a marked block "מטופס ההקמה" in <tenant>/data/profile.md, replaced each time;
    e. missing: ONE "📋 לטיפול" item for Itzik, kind setup-missing, idempotent per token and set of missing cards,
       closed by itself when nothing is missing;
    f. the tenant page is rebuilt when something changed, and ONE chat line goes to Itzik's monitor.

  Runs as root (it writes into other users' homes), from setup-intake.js: monitor-intake.timer, monitor-intake.path
  (the finish of a form touches data/setup-intake/trigger) and, through request()/managerRound(), from the manager.
  Only forms finished on or after SINCE are pulled completely; older ones got their handling by hand.
  Patient data never leaves the server: nothing here prints file contents, names of patients or lab bodies.
  Visible copy has no dashes.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const REPO = path.join(__dirname, '..');
const SINCE = '2026-11-10T00:00:00Z';
const START = '<!-- מטופס ההקמה: התחלה -->';
const END = '<!-- מטופס ההקמה: סוף -->';
const TENANT_CONFIG = '/usr/local/sbin/tenant-config';

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, o, mode) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { mode: mode || 0o644 });
  fs.renameSync(f + '.tmp', f);
}
function noDash(s) { return String(s == null ? '' : s).replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim(); }
function sha(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }
function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }

function ctxOf(o) {
  o = o || {};
  const data = o.data || path.join(REPO, 'data');
  return {
    data, now: o.now || Date.now(), dry: !!o.dry, noOwn: !!o.noOwn, direct: !!o.direct,
    exec: o.exec || ((cmd, args, opt) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 }, opt || {}))),
    log: o.log || ((s) => console.log(new Date().toISOString().slice(0, 16) + ' ' + s)),
    repo: o.repo || REPO,
    dir: path.join(data, 'setup-intake'),
  };
}

function own(ctx, p, uid, gid) { if (ctx.noOwn || ctx.dry) return; try { fs.chownSync(p, uid, gid); } catch (e) { /* not root */ } }
function ownerOf(p) { const s = fs.statSync(p); return { uid: s.uid, gid: s.gid }; }
// Runs node as the owner of a monitor (root left root owned files behind before).
function asUser(ctx, uid, cwd, args, timeout) {
  const me = process.getuid ? process.getuid() : -1;
  if (me === uid || ctx.direct) return ctx.exec(process.execPath, args, { cwd, timeout });
  return ctx.exec('sudo', ['-u', '#' + uid, '-H', process.execPath].concat(args), { cwd, timeout });
}

/* ---------- who is the tenant of a token ---------- */
function mapFile(ctx) { return path.join(ctx.dir, 'map.json'); }
function sourcesFile(ctx) { return path.join(ctx.data, 'cal', 'sources.json'); }

function resolveTenant(ctx, tok) {
  const sources = readJson(sourcesFile(ctx), []);
  const src = sources.find((x) => x && x.setup === tok) || null;
  const name = src ? src.name : (readJson(mapFile(ctx), {})[tok] || '');
  if (!name) return null;
  const rec = readJson(path.join(ctx.data, 'tenants', 'tenants', name + '.json'), null);
  const dir = (src && src.dir) || (rec && rec.dir) || '';
  if (!dir || !fs.existsSync(dir)) return null;
  const o = ownerOf(dir);
  return { name, dir, uid: o.uid, gid: o.gid, src, rec, isOwner: name === 'abaitzik' };
}

/* ---------- state of the form ---------- */
function load(ctx, tok) {
  const d = path.join(ctx.data, 'setup');
  const def = readJson(path.join(d, tok + '.def.json'), null);
  if (!def) return null;
  return { def, st: readJson(path.join(d, tok + '.json'), { steps: {} }), sec: readJson(path.join(d, tok + '.secrets.json'), {}), filesDir: path.join(d, tok + '-files') };
}
function savedOf(sec, id) { try { const v = JSON.parse(sec[id].value); return v && v.provider ? v : null; } catch (e) { return null; } }
function connected(st, id) { const x = (st.steps || {})[id]; return !!(x && x.got && (!x.revokedAt || Date.parse(x.revokedAt) < Date.parse(x.got))); }
function isFinished(st) { return !!st.finishedAt && (st.finishedAt >= SINCE); }

/* ---------- a. connections ---------- */
function connections(ctx, tok, L, t) {
  const out = { source: false, ms: false, mail: false };
  let google = null, ms = null;
  for (const s of L.def.steps || []) {
    if (!s.oauth || !connected(L.st, s.id)) continue;
    const sv = savedOf(L.sec, s.id);
    if (!sv) continue;
    if (sv.provider === 'google' && !google) google = { id: s.id, sv };
    if (sv.provider === 'microsoft' && !ms) ms = { id: s.id, sv };
  }
  if (!google && !ms) return out;
  const file = sourcesFile(ctx);
  const list = readJson(file, []);
  let e = list.find((x) => x && x.setup === tok);
  let changed = false;
  if (!e && google) {
    e = { name: t.name, dir: t.dir, setup: tok, step: google.id };
    if (/gmail\.readonly/.test(google.sv.scope || '')) { e.mail = true; out.mail = true; }
    if (t.rec) e.tenant = true;
    list.push(e); changed = out.source = true;
  } else if (e) {
    if (t.rec && e.tenant === undefined && e.name !== 'abaitzik') { e.tenant = true; changed = true; }
  }
  if (e && ms && e.msStep !== ms.id) { e.msStep = ms.id; changed = out.ms = true; }
  if (changed && !ctx.dry) {
    let o = null; try { o = ownerOf(file); } catch (x) { /* new file */ }
    writeJson(file, list);
    if (o) own(ctx, file, o.uid, o.gid);
  }
  return out;
}

// What the saved Microsoft connection may do (for the report): Calendars.* reads the calendar, Mail.Read would read mail.
function msScopes(L) {
  for (const s of L.def.steps || []) {
    if (!s.oauth || s.oauth.provider !== 'microsoft') continue;
    const sv = savedOf(L.sec, s.id);
    if (!sv || !connected(L.st, s.id)) continue;
    const sc = String(sv.scope || '');
    return { who: sv.who || '', cal: /Calendars\./i.test(sc), mail: /Mail\.Read/i.test(sc) };
  }
  return null;
}

/* ---------- b. files ---------- */
function copyFiles(ctx, tok, L, t, ist) {
  const res = [];
  for (const s of L.def.steps || []) {
    if (!s.upload) continue;
    const x = (L.st.steps || {})[s.id] || {};
    for (const f of x.files || []) {
      const src = path.join(L.filesDir, s.id, f.file);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(t.dir, 'data', 'files-private', 'setup', s.id, f.file);
      const key = s.id + '/' + f.file;
      const size = fs.statSync(src).size;
      let isNew = false;
      if (!(fs.existsSync(dest) && fs.statSync(dest).size === size)) {
        isNew = true;
        if (!ctx.dry) {
          let d = path.dirname(dest);
          const made = [];
          while (!fs.existsSync(d)) { made.push(d); d = path.dirname(d); }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          made.forEach((m) => { try { fs.chmodSync(m, 0o750); } catch (e) {} own(ctx, m, t.uid, t.gid); });
          fs.copyFileSync(src, dest); fs.chmodSync(dest, 0o600); own(ctx, dest, t.uid, t.gid);
        }
      }
      res.push({ step: s.id, title: s.title || s.id, file: f.file, key, src, dest, isNew });
    }
  }
  return res;
}

/* ---------- c. lab delivery notes ---------- */
function pdfText(ctx, file) { try { return ctx.exec('pdftotext', ['-layout', file, '-'], { maxBuffer: 20 * 1024 * 1024 }); } catch (e) { return ''; } }
function looksLab(ctx, file) {
  const txt = pdfText(ctx, file);
  if (!txt) return false;
  try { return require('./lab-check.js').detectLab(txt) !== 'unknown'; } catch (e) { return false; }
}
// A lab delivery note that is already stored (a copy sits in the tenant's files-private/lab) is not run twice.
function knownShas(t) {
  const set = new Set();
  const dir = path.join(t.dir, 'data', 'files-private', 'lab');
  let names = []; try { names = fs.readdirSync(dir); } catch (e) {}
  for (const n of names) { try { set.add(sha(fs.readFileSync(path.join(dir, n)))); } catch (e) {} }
  return set;
}
function labChecks(ctx, L, t, ist, files) {
  const ran = [];
  const known = knownShas(t);
  ist.files = ist.files || {};
  for (const f of files) {
    if (!/\.pdf$/i.test(f.file)) continue;
    const rec = ist.files[f.key] = ist.files[f.key] || {};
    if (rec.lab) continue;
    const labCard = f.step === 'lab' || /מעבדה/.test(f.title || '');
    if (!labCard && !looksLab(ctx, f.src)) continue;
    const h = sha(fs.readFileSync(f.src)); rec.sha = h;
    if (known.has(h)) { if (!ctx.dry) rec.lab = { at: new Date(ctx.now).toISOString(), how: 'already' }; continue; }
    if (ctx.dry) { ran.push(f.key); continue; }
    try {
      asUser(ctx, t.uid, t.dir, ['lab-check.js', f.dest, '--data', path.join(t.dir, 'data')], 300000);
      rec.lab = { at: new Date(ctx.now).toISOString(), how: 'run' };
      known.add(h); ran.push(f.key);
    } catch (e) { ctx.log(t.name + ': בדיקת מעבדה נכשלה ' + String(e.message).split('\n')[0].slice(0, 80)); }
  }
  return ran;
}

/* ---------- d. answers ---------- */
function answerLines(def, st) {
  const out = [];
  for (const s of def.steps || []) {
    if (s.oauth || s.upload || s.input || s.ms) continue;
    const x = (st.steps || {})[s.id] || {};
    const v = s.ask ? String(x.text || '').trim() : (s.choose ? String(x.choice || '').trim() : '');
    if (!v) continue;
    out.push('- ' + noDash(s.title || s.id) + ': ' + v.replace(/\s*\n+\s*/g, '; ').replace(/\s+/g, ' ').trim());
  }
  return out;
}
function profileBlock(def, st) {
  const lines = answerLines(def, st);
  if (!lines.length) return '';
  return START + '\n## מטופס ההקמה (נכנס אוטומטית מהטופס, מתעדכן בכל סיום)\n' + lines.join('\n') + '\n' + END;
}
// Replaces the marked block, or appends it. An empty block removes it.
function mergeProfile(old, block) {
  const s = String(old || '');
  const a = s.indexOf(START), b = s.indexOf(END);
  if (a >= 0 && b > a) {
    const head = s.slice(0, a).replace(/\s+$/, ''), tail = s.slice(b + END.length).replace(/^\s+/, '');
    return (head + (block ? '\n\n' + block : '') + (tail ? '\n\n' + tail : '')).replace(/^\s+/, '') + '\n';
  }
  if (!block) return s;
  return s.replace(/\s+$/, '') + '\n\n' + block + '\n';
}
// Returns { changed, rebuilt }. The tenant's profile.md is locked (chattr +i); tenant-config unlocks, writes and rebuilds.
function writeProfile(ctx, L, t) {
  const file = path.join(t.dir, 'data', 'profile.md');
  const old = (() => { try { return fs.readFileSync(file, 'utf8'); } catch (e) { return ''; } })();
  const next = mergeProfile(old, profileBlock(L.def, L.st));
  if (next === old) return { changed: false, rebuilt: false };
  if (ctx.dry) return { changed: true, rebuilt: false };
  const tmp = path.join(ctx.dir, 'tmp', t.name + '.profile.md');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, next, { mode: 0o644 });
  try { const o = ownerOf(ctx.data); own(ctx, path.dirname(tmp), o.uid, o.gid); own(ctx, tmp, o.uid, o.gid); } catch (e) {}
  if (t.rec) { ctx.exec(TENANT_CONFIG, [t.name, 'profile', tmp], { timeout: 600000 }); return { changed: true, rebuilt: true }; }
  fs.writeFileSync(file, next);
  return { changed: true, rebuilt: false };
}

/* ---------- e. what is still missing ---------- */
function missingOf(def, st) {
  const out = [];
  for (const s of def.steps || []) {
    const x = (st.steps || {})[s.id] || {};
    if (x.skip || x.skipped) continue;
    if (s.ask && !String(x.text || '').trim()) out.push({ id: s.id, title: noDash(s.title || s.id), kind: 'ask' });
    else if (s.upload && !(x.files && x.files.length)) out.push({ id: s.id, title: noDash(s.title || s.id), kind: 'upload' });
  }
  return out;
}
function missingKey(tok, miss) { return 'setup-missing:' + tok + ':' + sha(miss.map((m) => m.id).sort().join(',')).slice(0, 8); }

// One open item for the set that is missing now; older sets of the same token are closed. Nothing missing closes all.
function syncMissing(ctx, tok, def, miss) {
  const H = require('./handle.js');
  const prefix = 'setup-missing:' + tok + ':';
  const wantKey = miss.length ? missingKey(tok, miss) : '';
  let changed = false, created = false;
  for (const it of H.open(ctx.data)) {
    if (it.key && it.key.indexOf(prefix) === 0 && it.key !== wantKey) { if (!ctx.dry && H.done(ctx.data, it.id)) changed = true; else if (ctx.dry) changed = true; }
  }
  if (miss.length) {
    const who = noDash(def.client || '');
    const r = ctx.dry ? { created: !H.all(ctx.data).some((x) => x.key === wantKey) }
      : H.add(ctx.data, { key: wantKey, kind: 'setup-missing', who, title: 'חסרות תשובות בטופס: ' + miss.map((m) => m.title).join(', '), link: 'tenants' });
    if (r.created) { changed = true; created = true; }
  }
  if (changed && !ctx.dry) {
    const o = ownerOf(ctx.data);
    const dir = H.dirOf(ctx.data);
    let names = []; try { names = fs.readdirSync(dir); } catch (e) {}
    names.forEach((n) => own(ctx, path.join(dir, n), o.uid, o.gid));
  }
  return { changed, created };
}

/* ---------- f. rebuild, chat line ---------- */
function rebuild(ctx, t) {
  if (ctx.dry) return;
  try {
    asUser(ctx, t.uid, t.dir, ['build.js'], 600000);
    if (!ctx.noOwn) ctx.exec('chmod', ['-R', 'o+rX', path.join(t.dir, 'docs')]);
  } catch (e) { ctx.log(t.name + ': בנייה נכשלה ' + String(e.message).split('\n')[0].slice(0, 80)); }
}
function publishOwner(ctx) {
  if (ctx.dry) return;
  try { const o = ownerOf(ctx.data); asUser(ctx, o.uid, ctx.repo, ['push.js', 'לטיפול: טופס הקמה'], 300000); } catch (e) { ctx.log('דחיפה נכשלה ' + String(e.message).split('\n')[0].slice(0, 80)); }
}
function chatLine(ctx, text, tok) {
  if (ctx.dry) return;
  const dir = path.join(ctx.data, 'chat', 'chat');
  fs.mkdirSync(dir, { recursive: true });
  const at = new Date(ctx.now);
  const stamp = at.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  let name = stamp + '-claude-setup-intake-' + tok.slice(0, 6) + '.json';
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = stamp + '-claude-setup-intake-' + tok.slice(0, 6) + '-' + i + '.json';
  const f = path.join(dir, name);
  fs.writeFileSync(f, JSON.stringify({ at: at.toISOString(), from: 'claude', text: noDash(text).replace(/ ; /g, '. ') }, null, 1));
  try { const o = ownerOf(ctx.data); own(ctx, f, o.uid, o.gid); } catch (e) {}
}
function cnt(n, one, many) { return n === 1 ? one : n + ' ' + many; }
function summaryText(client, did, miss) {
  const parts = [];
  if (did.files) parts.push(cnt(did.files, 'קובץ אחד', 'קבצים') + ' במוניטור שלו');
  if (did.labs) parts.push(cnt(did.labs, 'בדיקת מעבדה אחת', 'בדיקות מעבדה'));
  if (did.profile) parts.push('התשובות בפרופיל שלו');
  if (did.source) parts.push('חיבור גוגל הופעל' + (did.mail ? ' עם מייל' : ''));
  if (did.ms) parts.push('חיבור מיקרוסופט נרשם');
  return 'קלטתי את הטופס של ' + noDash(client) + ': ' + (parts.join(', ') || 'אין חדש') + '.'
    + (miss.length ? ' עדיין חסר: ' + miss.map((m) => m.title).join(', ') + '. פתחתי לך פריט בלטיפול.' : ' הכל נענה.');
}

/* ---------- one token ---------- */
function intakeOne(ctx, tok) {
  tok = safeTok(tok);
  const L = tok && load(ctx, tok);
  if (!L) return null;
  const rec = { tok, client: noDash(L.def.client || ''), finishedAt: L.st.finishedAt || '', finished: isFinished(L.st) };
  if (readJson(mapFile(ctx), {})[tok] === '-') return null; // a form that is not a customer (marked by hand)
  const t = resolveTenant(ctx, tok);
  if (!t) { rec.unmapped = rec.finished; return rec; }
  rec.tenant = t.name;
  const sf = path.join(ctx.dir, tok + '.json');
  const ist = readJson(sf, {});
  const did = { files: 0, labs: 0, profile: false, source: false, ms: false, mail: false, missing: false };
  const c = connections(ctx, tok, L, t);
  did.source = c.source; did.ms = c.ms; did.mail = c.mail;
  rec.ms = msScopes(L);
  let rebuilt = false;
  if (rec.finished && !t.isOwner) {
    const files = copyFiles(ctx, tok, L, t, ist);
    did.files = files.filter((f) => f.isNew).length;
    const labs = labChecks(ctx, L, t, ist, files);
    did.labs = labs.length;
    const p = writeProfile(ctx, L, t);
    did.profile = p.changed; rebuilt = p.rebuilt;
    const miss = missingOf(L.def, L.st);
    rec.missing = miss.map((m) => m.title);
    const m = syncMissing(ctx, tok, L.def, miss);
    did.missing = m.changed;
    const touched = did.files || did.labs || did.profile || did.source || did.ms || m.changed;
    if (touched && !ctx.dry) {
      if ((did.files || did.labs) && !rebuilt) rebuild(ctx, t);
      if (m.changed) publishOwner(ctx);
      chatLine(ctx, summaryText(rec.client, did, miss), tok);
      ist.lastPullAt = new Date(ctx.now).toISOString();
      ist.lastPulled = { files: did.files, labs: did.labs, profile: did.profile, source: did.source, ms: did.ms };
    }
    if (touched && ctx.dry) ctx.log(t.name + ': היה נקלט ' + JSON.stringify(did));
  } else if (did.source || did.ms) {
    // a connection made before the form was finished: the first calendar copy comes with the next cal-sync round
    ist.lastPullAt = new Date(ctx.now).toISOString(); ist.lastPulled = { source: did.source, ms: did.ms };
  }
  rec.lastPullAt = ist.lastPullAt || '';
  rec.lastPulled = ist.lastPulled || null;
  if (!ctx.dry) writeJson(sf, ist);
  rec.did = did;
  return rec;
}

/* ---------- all tokens ---------- */
function lock(ctx) {
  const f = path.join(ctx.dir, 'run.lock');
  fs.mkdirSync(ctx.dir, { recursive: true });
  try { const s = fs.statSync(f); if (ctx.now - s.mtimeMs > 20 * 60 * 1000) fs.unlinkSync(f); } catch (e) {}
  try { fs.closeSync(fs.openSync(f, 'wx')); return () => { try { fs.unlinkSync(f); } catch (e) {} }; } catch (e) { return null; }
}
function sweep(opts) {
  const ctx = ctxOf(opts);
  const only = opts && opts.only ? safeTok(opts.only) : null;
  let toks = [];
  try { toks = fs.readdirSync(path.join(ctx.data, 'setup')).filter((f) => /^[a-f0-9]+\.def\.json$/.test(f)).map((f) => f.split('.')[0]); } catch (e) {}
  if (only) toks = toks.filter((x) => x === only);
  const unlock = ctx.dry ? () => {} : lock(ctx);
  if (!unlock) return { busy: true };
  const sum = { ranAt: new Date(ctx.now).toISOString(), tokens: {} };
  try {
    for (const tok of toks) {
      try { const r = intakeOne(ctx, tok); if (r) sum.tokens[tok] = r; } catch (e) { ctx.log(tok.slice(0, 6) + ': ' + String(e.message).split('\n')[0].slice(0, 100)); }
    }
    if (!ctx.dry && !only) {
      writeJson(path.join(ctx.dir, 'summary.json'), sum);
      try { const o = ownerOf(ctx.data); own(ctx, path.join(ctx.dir, 'summary.json'), o.uid, o.gid); } catch (e) {}
    }
  } finally { unlock(); }
  return sum;
}

/* ---------- triggers ---------- */
// A running server (wa-bridge, user monitor) cannot write into other homes: it only leaves a note, and
// monitor-intake.path starts the root run within seconds.
function request(dataDir, tok) {
  try {
    const dir = path.join(dataDir || path.join(REPO, 'data'), 'setup-intake');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'trigger'), JSON.stringify({ at: new Date().toISOString(), tok: tok || '' }));
    return true;
  } catch (e) { return false; }
}
function sleepMs(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) {} }
// The manager's round: run the sweep (directly as root, otherwise by a trigger and a bounded wait), return the summary.
function managerRound(opts) {
  const ctx = ctxOf(opts);
  const readSum = () => readJson(path.join(ctx.dir, 'summary.json'), null);
  if (process.getuid && process.getuid() === 0) return sweep(opts);
  const t0 = Date.now();
  request(ctx.data, 'manager');
  const maxMs = (opts && opts.waitMs) || 100000;
  while (Date.now() - t0 < maxMs) {
    const s = readSum();
    if (s && Date.parse(s.ranAt) >= t0 - 1000) return s;
    sleepMs(3000);
  }
  return readSum();
}

// For the manager card: lines about forms that came back lately. Pure.
function managerLines(sum, now) {
  const out = [];
  for (const r of Object.values((sum && sum.tokens) || {})) {
    if (!r) continue;
    const at = Date.parse(r.lastPullAt || '');
    if (r.unmapped) { out.push({ k: 'intake', icon: '📥', st: 'warn', t: 'טופס של ' + r.client + ' חזר ואין לו מוניטור ממופה', sub: 'צריך לחבר את הטופס ללקוח (node setup-intake.js map)', go: 'tenants' }); continue; }
    if (!r.finished) continue;
    const fresh = !isNaN(at) && now - at < 3 * 24 * 3600 * 1000;
    const miss = r.missing || [];
    if (!fresh && !miss.length) continue;
    const p = r.lastPulled || {};
    const parts = [];
    if (p.files) parts.push(cnt(p.files, 'קובץ אחד', 'קבצים'));
    if (p.labs) parts.push(cnt(p.labs, 'בדיקת מעבדה אחת', 'בדיקות מעבדה'));
    if (p.profile) parts.push('תשובות לפרופיל');
    if (p.source) parts.push('חיבור גוגל');
    out.push({ k: 'intake', icon: '📥', st: miss.length ? 'warn' : 'done',
      t: miss.length ? 'הטופס של ' + r.client + ' נקלט, חסר בו מידע' : 'הטופס של ' + r.client + ' נקלט במלואו',
      sub: noDash((parts.length ? 'נמשך: ' + parts.join(', ') + '. ' : '') + (miss.length ? 'חסר: ' + miss.join(', ') : '')), go: miss.length ? 'tenants' : 'answers' });
  }
  return out.slice(0, 3);
}

module.exports = { sweep, intakeOne, request, managerRound, managerLines, resolveTenant, connections, copyFiles, labChecks, answerLines, profileBlock, mergeProfile, missingOf, missingKey, syncMissing, msScopes, summaryText, ctxOf, SINCE, START, END };
