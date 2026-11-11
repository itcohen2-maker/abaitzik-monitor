'use strict';
/*
  11.11.2026, Itzik, after Dr. Shulman's two voice notes were never heard: "אין לנו בודק למוניטור חדש שיוצא? אני מצפה
  שלקוח חדש שעכשיו יסלוק ויחכה 3 דקות, יהיה לו מוניטור שיעבוד 100%." And: "אם קורה מצב שהוא לא מצליח לתמלל, מיד צריכה
  להגיע בקשה לתיקון ולתקן את זה באופן עצמאי. אני נותן אישור."

  What went wrong: faster_whisper was installed only for the monitor user, every customer runs as its own user, so every
  customer's voice note failed ("No module named faster_whisper"), always, and nobody was told. The manager's "כל הלקוחות
  תקינים" only knew that the services were up.

  This runs as root every 10 minutes (cron) and at the end of setup/new-tenant.sh (--new <id>). Plain code, no model.
  For every customer in data/tenants/tenants:
    1. voice   A voice note of the last 48 hours that was not transcribed is transcribed again as that customer's user.
               When it works the message is opened again with the transcript (reopenAt), so his monitor answers it.
    2. whisper Once an hour (and always with --new) a known sample is transcribed as that user. A failure repairs the
               shared engine (/opt/whisper-venv, pinned versions, read rights on it and on the model in /opt/hf)
               and tests again.
    3. visits  The visit key on his side matches Itzik's keys.json (the 👀 tile), or it is written again.
    4. answer  A message of his that waits more than 15 minutes with no answer is a problem.
    5. page    His public address answers 200.
  What it fixed goes into data/status/tenant-check.json (the manager's card shows it). What it could not fix becomes
  one 📋 לטיפול item and one push for Itzik, once a day per problem.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'status', 'tenant-check.json');
const VENV = '/opt/whisper-venv';
const SAMPLE = path.join(VENV, 'selftest.mp3');
const PINS = ['av==18.1.0', 'ctranslate2==4.8.2', 'faster-whisper==1.2.1', 'onnxruntime==1.30.0', 'tokenizers==0.23.2'];
const args = process.argv.slice(2);
const NEW = args.indexOf('--new') >= 0 ? args[args.indexOf('--new') + 1] : '';
const DRY = args.includes('--dry');

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } }
function log(s) { console.log(new Date().toISOString().slice(11, 19) + '  ' + s); }
function asUser(user, cmd, argv, timeout) {
  return spawnSync('sudo', ['-u', user, 'env', 'HOME=/home/' + user].concat([cmd], argv), { encoding: 'utf8', timeout: timeout || 300000, cwd: '/tmp' });
}
function transcribeAs(t, audio) {
  const r = asUser(t.user, 'node', [path.join(t.dir, 'transcribe.js'), audio], 600000);
  const text = String(r.stdout || '').trim().split('\n').filter(Boolean).filter((l) => !/^\(\d/.test(l)).pop() || '';
  return { ok: r.status === 0 && !!text, text, err: String(r.stderr || '').trim().split('\n').slice(-2).join(' ').slice(0, 200) };
}

function repairWhisper() {
  if (DRY) return 'dry';
  try {
    if (!fs.existsSync(path.join(VENV, 'bin', 'python'))) execFileSync('python3', ['-m', 'venv', VENV], { timeout: 120000 });
    execFileSync(path.join(VENV, 'bin', 'pip'), ['install', '-q'].concat(PINS), { timeout: 900000 });
    execFileSync('chmod', ['-R', 'a+rX', VENV, '/opt/hf'], { timeout: 120000 });
    return 'ok';
  } catch (e) { return 'failed: ' + String(e.message).slice(0, 160); }
}

function tenants() {
  const dir = path.join(DATA, 'tenants', 'tenants');
  let fl = []; try { fl = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) {}
  return fl.map((f) => readJson(path.join(dir, f), null)).filter((t) => t && t.id && t.dir && t.user && fs.existsSync(t.dir))
    .filter((t) => !NEW || t.id === NEW);
}

const CANT = /לא תומלל|לא הצלחתי לתמלל|לא הצלחתי להאזין|מנוע התמלול/;
function voiceRecovery(t, res) {
  const chat = path.join(t.dir, 'data', 'chat', 'chat');
  let fl = []; try { fl = fs.readdirSync(chat).filter((f) => f.endsWith('.json')); } catch (e) { return; }
  const now = Date.now();
  fl.forEach((f) => {
    const full = path.join(chat, f);
    const rec = readJson(full, null);
    if (!rec || rec.from !== 'itzik' || !Array.isArray(rec.files) || rec.retx) return;
    if (now - Date.parse(rec.at) > 48 * 3600000) return;
    const voice = rec.files.filter((x) => /^voice-.*\.(m4a|webm|mp3|ogg|wav)$/.test(x))[0];
    if (!voice || /^תמלול:/.test(rec.note || '')) return;
    // not transcribed: the note says so, or a session answered it saying so
    const answers = fl.filter((g) => g > f).map((g) => readJson(path.join(chat, g), {})).filter((m) => m.from === 'claude').slice(0, 3);
    if (!CANT.test(rec.note || '') && !answers.some((m) => CANT.test(m.text || ''))) return;
    const audio = [path.join(t.dir, 'data', 'inbox', voice), path.join(t.dir, 'data', 'files-private', voice)].filter((p) => fs.existsSync(p))[0];
    if (!audio) { res.problems.push('הקלטה ' + voice + ' לא נמצאה בשרת'); return; }
    let r = transcribeAs(t, audio);
    if (!r.ok) { res.fixed.push('מנוע התמלול: ' + repairWhisper()); r = transcribeAs(t, audio); }
    if (!r.ok) { res.problems.push('הודעה קולית מ ' + rec.at.slice(11, 16) + ' עדיין לא מתומללת: ' + r.err); return; }
    const words = r.text.replace(/[^֐-׿a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    rec.retx = new Date().toISOString();
    if (words.length < 3) { rec.note = 'תמלול: ' + r.text + ' (קצר מאוד, כנראה שקט)'; }
    else {
      rec.note = 'תמלול: ' + r.text;
      delete rec.status;
      rec.reopenAt = rec.retx;
      rec.reopenNote = 'ההודעה הקולית לא תומללה קודם בגלל תקלה אצלנו, שתוקנה. זה מה שנאמר בה. לטפל בבקשה עכשיו, ולהתנצל במשפט אחד על העיכוב. אם פרט לא ברור בתמלול (שם, שעה), לשאול שאלה אחת קצרה.';
    }
    if (!DRY) {
      fs.writeFileSync(full, JSON.stringify(rec, null, 1));
      spawnSync('chown', [t.user + ':' + t.user, full]);
    }
    res.fixed.push('הודעה קולית מ ' + new Date(rec.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) + ' תומללה מחדש' + (words.length < 3 ? ' (שקט)' : ' והוחזרה לטיפול') + ': ' + r.text.slice(0, 80));
  });
}

function whisperTest(t, res, prev) {
  const last = prev && prev.whisperAt ? Date.parse(prev.whisperAt) : 0;
  if (!NEW && Date.now() - last < 3600000 && prev && prev.whisperOk) { res.whisperAt = prev.whisperAt; res.whisperOk = true; return; }
  let r = transcribeAs(t, SAMPLE);
  if (!r.ok || !/תמלול/.test(r.text)) { res.fixed.push('מנוע התמלול: ' + repairWhisper()); r = transcribeAs(t, SAMPLE); }
  res.whisperAt = new Date().toISOString();
  res.whisperOk = r.ok && /תמלול/.test(r.text);
  if (!res.whisperOk) res.problems.push('תמלול לא עובד: ' + (r.err || r.text || 'אין פלט'));
}

function visitsCheck(t, res) {
  const keys = readJson(path.join(DATA, 'visits', 'keys.json'), {});
  const kf = path.join(t.dir, 'data', 'status', 'visit-key.txt');
  let mine = ''; try { mine = fs.readFileSync(kf, 'utf8').trim(); } catch (e) {}
  if (keys[t.id] && mine === keys[t.id]) return;
  if (!keys[t.id]) { res.problems.push('אין לו מפתח כניסות (👀)'); return; }
  if (!DRY) { fs.writeFileSync(kf, keys[t.id]); spawnSync('chown', [t.user + ':' + t.user, kf]); fs.chmodSync(kf, 0o600); }
  res.fixed.push('מפתח הכניסות נכתב מחדש');
}

function answerCheck(t, res) {
  const chat = path.join(t.dir, 'data', 'chat', 'chat');
  let fl = []; try { fl = fs.readdirSync(chat).filter((f) => f.endsWith('.json')).sort().slice(-60); } catch (e) { return; }
  const all = fl.map((f) => readJson(path.join(chat, f), null)).filter(Boolean);
  const now = Date.now();
  const late = all.filter((m) => m.from === 'itzik' && m.status !== 'done' && now - Date.parse(m.reopenAt || m.at) > 15 * 60000 && now - Date.parse(m.at) < 72 * 3600000);
  if (late.length) res.problems.push(late.length + ' הודעות שלו מחכות יותר מרבע שעה בלי תשובה');
}

function pageCheck(t, res) {
  if (!t.host) return;
  const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '20', 'https://' + t.host + '/'], { encoding: 'utf8' });
  if (String(r.stdout).trim() !== '200') res.problems.push('הדף שלו לא עונה (' + (String(r.stdout).trim() || 'אין חיבור') + ')');
}

function escalate(t, res, state) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  res.problems.forEach((p) => {
    const key = day + '|' + t.id + '|' + p.replace(/\d+/g, '#').slice(0, 60);
    if (state.told[key] || DRY) return;
    state.told[key] = new Date().toISOString();
    try {
      require('./lib/handle.js').add(DATA, { key: 'tenant-check-' + key, kind: 'tenant-broken', who: t.title || t.id, title: (t.title || t.id).replace(/^המוניטור של /, '') + ': ' + p + '. ניסיתי לתקן לבד ולא הצליח.', link: 'tenants' });
      spawnSync('chown', ['-R', 'monitor:monitor', path.join(DATA, 'handle')]);
    } catch (e) { log('handle: ' + e.message); }
    spawnSync('sudo', ['-u', 'monitor', 'env', 'HOME=/home/monitor', 'node', 'notify.js', '--urgent', 'תקלה אצל לקוח', (t.title || t.id) + ': ' + p], { cwd: ROOT, timeout: 60000 });
  });
}

function main() {
  const prevAll = readJson(OUT, { tenants: {}, told: {} });
  const state = { at: new Date().toISOString(), tenants: {}, told: prevAll.told || {} };
  // keep a week of "told" keys only
  Object.keys(state.told).forEach((k) => { if (Date.now() - Date.parse(state.told[k]) > 7 * 86400000) delete state.told[k]; });
  tenants().forEach((t) => {
    const prev = (prevAll.tenants || {})[t.id] || {};
    const res = { title: t.title || t.id, problems: [], fixed: [] };
    try { voiceRecovery(t, res); } catch (e) { res.problems.push('בדיקת הקלטות נכשלה: ' + e.message); }
    try { whisperTest(t, res, prev); } catch (e) { res.problems.push('בדיקת תמלול נכשלה: ' + e.message); }
    try { visitsCheck(t, res); } catch (e) { res.problems.push('בדיקת כניסות נכשלה: ' + e.message); }
    try { answerCheck(t, res); } catch (e) {}
    try { pageCheck(t, res); } catch (e) {}
    res.ok = !res.problems.length;
    // what it fixed today stays on the card for the day
    const day = state.at.slice(0, 10);
    res.fixedToday = (prev.fixedDay === day ? prev.fixedToday || [] : []).concat(res.fixed.map((x) => new Date().toISOString().slice(11, 16) + ' ' + x)).slice(-10);
    res.fixedDay = day;
    state.tenants[t.id] = res;
    log(t.id + ': ' + (res.ok ? 'ok' : 'PROBLEM ' + res.problems.join(' | ')) + (res.fixed.length ? ' · fixed: ' + res.fixed.join(' | ') : ''));
    escalate(t, res, state);
    if (res.fixed.some((x) => /הוחזרה לטיפול/.test(x)) && !DRY) spawnSync('systemctl', ['start', '--no-block', 'monitor-worker-' + t.id + '.service']);
  });
  if (NEW) state.tenants = Object.assign({}, prevAll.tenants || {}, state.tenants);
  if (!DRY) {
    fs.writeFileSync(OUT, JSON.stringify(state, null, 1) + '\n');
    spawnSync('chown', ['monitor:monitor', OUT]);
  }
  if (NEW) { const r = state.tenants[NEW]; console.log(r && r.ok ? 'בדיקת מוניטור חדש: הכל עובד' : 'בדיקת מוניטור חדש: ' + (r ? r.problems.join(' | ') : 'לא נמצא')); process.exitCode = r && r.ok ? 0 : 1; }
}

main();
