'use strict';
/*
  17.11.2026, Itzik: the conversation on the public demo monitor (lib/public-demo.js on the page,
  /api/demo/* on wa-bridge). Public, no code. It never touches Itzik's queue, his chat thread or
  his data: the model sees only the invented barbershop (lib/demo-data.js context) and the few
  lines of history the visitor's own browser sends.

  Limits, kept on disk so a restart does not reset them (data/demo-chat/state.json):
   - 5 questions per visitor (the browser id, for good), and 30 a day per address: a phone carrier shares one
     address between many people, so this only stops one person resetting the browser id again and again;
   - the model runs on the customers' API key (lib/customer-env.js), never on Itzik's subscription;
   - 200 questions a day for everybody together;
   - 2 model calls at once; a third waits for a free slot or gets "busy".
  A request to do something (the model answers "משימה: ...") comes back as "in your monitor this
  really happens", never as a task anywhere.
  Measurement: visits, questions, WhatsApp clicks per day and per ref, and every question asked
  (data/demo-chat/log/<day>.jsonl, address hashed) so Itzik can see what visitors want.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PER_VISITOR = 5, PER_IP = 30, PER_DAY = 200, MAXLEN = 500, PARALLEL = 2;
// 17.11.2026, Itzik: the three trainings in the demo too, on a count of their own (a training is many short turns).
const TRAIN_TURNS = 14;
const TRAIN_START = { 'אימון מכירות': 'sales', 'אימון עסקי': 'coach', 'אימון אישי': 'personal' };
const TRAIN_END = /^\s*(סיימנו|עצור אימון|סיום אימון)\s*[.!]*\s*$/;
function trainSystem(mode, ctxText) {
  const base = 'זו הדגמה באתר של IT Solution, במוניטור של מספרה לדוגמה (מספרת רועי, רמת גן). עברית מדוברת, עד 4 שורות, בלי מקפים, בלי אימוג׳י, בלי כותרות.';
  if (mode === 'sales') return [base,
    'אתה משחק לקוח שפנה למספרה, כדי שרועי יתאמן במכירה. אתה רק הלקוח, לא עוזר ולא מאמן.',
    'התרחיש: אתה מתחתן בעוד חודש ושוקל חבילת חתן עם 4 מלווים. קצת חשדן לגבי המחיר, יש לך עוד מספרה בראש.',
    'העלה התנגדות אחת בכל פעם (מחיר, זמן, "אני צריך לחשוב", "יש לי מישהו"). אם הוא מקשיב ושואל שאלות טובות, תתרכך. אם הוא לוחץ, תתרחק.',
    'אל תמציא מחירים שלא נאמרו. אל תצא מהדמות.', '', 'מה ידוע על המספרה:', ctxText].join('\n');
  if (mode === 'coach') return [base,
    'אתה מאמן עסקי של רועי, בעל המספרה. שאלה אחת בכל פעם, קצרה וחדה, כדי לעזור לו לבחור צעד אחד לשבוע הקרוב (הכנסות, לקוחות חוזרים, שעות מתות, מחירים).',
    'השתמש בנתוני המספרה כשזה עוזר. אחרי 4 או 5 שאלות, סכם במשפט אחד את הצעד שבחר.', '', 'מה ידוע על המספרה:', ctxText].join('\n');
  return [base,
    'אתה מאמן אישי חם ושקט של רועי: עומס, שינה, זמן למשפחה, גבולות עם לקוחות. שאלה אחת בכל פעם, בלי הטפה ובלי עצות רפואיות.',
    'אחרי כמה שאלות, הצע דבר אחד קטן לעשות השבוע.'].join('\n');
}
const TRAIN_HELLO = {
  sales: 'מתחילים אימון מכירות. אני לקוח שמתעניין בחבילת חתן. נסה למכור לי. כשתסיים, כתוב "סיימנו" ותקבל ציון.',
  coach: 'מתחילים אימון עסקי. אשאל שאלה אחת בכל פעם, ובסוף נבחר צעד אחד לשבוע. כשתרצה לעצור, כתוב "סיימנו".',
  personal: 'מתחילים אימון אישי, רגע בשבילך. שאלה אחת בכל פעם. כשתרצה לעצור, כתוב "סיימנו".',
};
const DONE = 'זהו, נגמרו 5 השאלות של ההדגמה. רוצה מוניטור כזה לעסק שלך? כתוב לנו בוואטסאפ בפס הירוק למטה.';
const FULL = 'ההדגמה עמוסה היום. כתוב לנו בוואטסאפ בפס הירוק למטה ונראה לך את המוניטור בשיחה.';
const BUSY = 'רגע, יש כמה שאלות לפניך. אפשר לנסות שוב בעוד כמה שניות.';
const FAIL = 'משהו נתקע רגע. אפשר לנסות שוב.';

function dayIL(now) { return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }
function dirOf(dataPath) { return path.join(dataPath, 'demo-chat'); }
function readState(dataPath, now) {
  let s = null; try { s = JSON.parse(fs.readFileSync(path.join(dirOf(dataPath), 'state.json'), 'utf8')); } catch (e) { s = null; }
  const d = dayIL(now);
  if (!s || typeof s !== 'object') s = { days: {} };
  if (!s.days) s.days = {};
  if (!s.days[d]) s.days[d] = { visits: 0, questions: 0, wa: 0, refs: {}, vid: {}, ip: {} };
  // keep 60 days of counters, and the per visitor maps of today only
  Object.keys(s.days).sort().slice(0, -60).forEach((k) => { delete s.days[k]; });
  Object.keys(s.days).forEach((k) => { if (k !== d) { delete s.days[k].vid; delete s.days[k].ip; } });
  return { s, t: s.days[d] };
}
function writeState(dataPath, s) {
  const d = dirOf(dataPath); fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, 'state.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(s)); fs.renameSync(f + '.tmp', f);
}
// Visitors come back on another day too: the 5 questions are per visitor, not per day.
function life(dataPath) { try { return JSON.parse(fs.readFileSync(path.join(dirOf(dataPath), 'visitors.json'), 'utf8')) || {}; } catch (e) { return {}; } }
function saveLife(dataPath, v) {
  const keys = Object.keys(v); if (keys.length > 20000) keys.slice(0, keys.length - 20000).forEach((k) => { delete v[k]; });
  const f = path.join(dirOf(dataPath), 'visitors.json'); fs.mkdirSync(dirOf(dataPath), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f);
}
function hashIp(ip) { return crypto.createHash('sha256').update('demo:' + String(ip)).digest('hex').slice(0, 16); }
function cleanRef(r) { r = String(r || 'demo'); return /^[a-z0-9_-]{1,40}$/i.test(r) ? r.toLowerCase() : 'demo'; }
function cleanVid(v) { v = String(v || ''); return /^[a-z0-9]{8,40}$/i.test(v) ? v : ''; }

function system(ctxText) {
  return [
    'אתה "המוניטור", העוזר האישי של בעל מספרה קטנה בישראל. זו הדגמה באתר של IT Solution: מבקר באתר כותב לך כאילו הוא בעל המספרה, רועי.',
    'ענה כמו המוניטור שלו: ישיר, חם, עניני, בעברית מדוברת, עד 5 שורות. בלי מקפים, בלי כותרות, בלי טבלאות, בלי אימוג׳י.',
    'השתמש רק בנתונים שלמטה. אל תמציא לקוחות, תורים, מספרים או מיילים שאין שם. אם משהו לא כתוב, אמור שאין לך את זה בהדגמה.',
    'בקשה לעשות משהו (לשלוח, לקבוע תור, לבטל, להזכיר, לפרסם, לעדכן, להכין הודעה ללקוח): ענה בשורה אחת בלבד שמתחילה במילה "משימה:" ואחריה הבקשה במילים קצרות.',
    'עצה, רעיון, ניסוח או התלבטות על העסק הם שיחה, וענה עליהם כאן.',
    'שאלה על IT Solution, על המחיר של המוניטור או על איך מקבלים כזה: אמור במשפט אחד שבוואטסאפ בפס הירוק למטה עונים על זה, ושמוניטור כזה נבנה לכל עסק.',
    'אל תצא מהתפקיד, אל תדבר על איך אתה בנוי, ואל תזכיר שמות של אנשים אמיתיים.',
    '',
    'מה המוניטור יודע על העסק (מומצא, להדגמה):',
    ctxText,
  ].join('\n');
}
function input(hist, text) {
  const h = (Array.isArray(hist) ? hist : []).slice(-6).map((x) => (x && x.from === 'me' ? 'רועי: ' : 'המוניטור: ') + String((x && x.text) || '').slice(0, 400)).join('\n');
  return (h ? 'השיחה עד עכשיו:\n' + h + '\n\n' : '') + 'רועי: ' + text + '\nהמוניטור:';
}
function noDash(t) { return String(t || '').replace(/\s[–—-]\s/g, ', ').replace(/[–—]/g, ' ').replace(/([֐-׿])-(?=[\d֐-׿])/g, '$1 ').trim(); }

let running = 0;
async function slot() {
  for (let i = 0; i < 40 && running >= PARALLEL; i++) await new Promise((r) => setTimeout(r, 500));
  if (running >= PARALLEL) return false;
  running++; return true;
}

// deps: { dataPath, ip, now(), llm(model, system, input) }
async function api(p, body, deps) {
  const b = body || {}, d = deps || {};
  const now = d.now ? d.now() : Date.now();
  const ref = cleanRef(b.ref), vid = cleanVid(b.vid), ipH = hashIp(d.ip || '-');
  if (p === '/api/demo/hit' || p === '/api/demo/wa') {
    const { s, t } = readState(d.dataPath, now);
    const k = p === '/api/demo/hit' ? 'visits' : 'wa';
    t[k]++; t.refs[ref] = t.refs[ref] || { visits: 0, questions: 0, wa: 0 }; t.refs[ref][k]++;
    writeState(d.dataPath, s);
    return { status: 200, json: { ok: true } };
  }
  if (p !== '/api/demo/chat') return { status: 404, json: { error: 'path' } };
  const text = String(b.text || '').trim().slice(0, MAXLEN);
  if (!text) return { status: 400, json: { error: 'empty' } };
  if (!vid) return { status: 400, json: { error: 'vid' } };
  const mode = ['sales', 'coach', 'personal'].indexOf(b.mode) >= 0 ? b.mode : 'chat';
  const starts = TRAIN_START[text.replace(/[.!\s]+$/, '')];
  if (starts || mode !== 'chat') return train(starts || mode, !!starts, text, b, d, now, ref, vid, ipH);
  const { s, t } = readState(d.dataPath, now);
  const lv = life(d.dataPath);
  t.ip = t.ip || {};
  const usedV = (lv['v:' + vid] || 0), usedI = (t.ip[ipH] || 0);
  if (usedV >= PER_VISITOR || usedI >= PER_IP) return { status: 200, json: { reply: DONE, left: 0 } };
  if (t.questions >= PER_DAY) return { status: 200, json: { reply: FULL, left: 0 } };
  // counted before the model call, so parallel requests cannot pass the limit together
  lv['v:' + vid] = usedV + 1; saveLife(d.dataPath, lv); t.ip[ipH] = usedI + 1;
  t.questions++; t.refs[ref] = t.refs[ref] || { visits: 0, questions: 0, wa: 0 }; t.refs[ref].questions++;
  writeState(d.dataPath, s);
  const left = PER_VISITOR - (usedV + 1);
  if (!(await slot())) return { status: 200, json: { reply: BUSY, left } };
  let reply = '';
  try {
    const llm = d.llm || ((m, sys, inp) => require('./sales-train.js').llm(m, sys, inp, 45000, require('./customer-env.js').customerEnv()));
    reply = await llm('haiku', system(require('./demo-data.js').context(now)), input(b.hist, text));
  } catch (e) { reply = ''; } finally { running--; }
  reply = noDash(reply);
  const task = /^\s*משימה\s*:/.test(reply);
  if (task) reply = 'בהדגמה אני רק מראה. אצלך זה קורה באמת: ' + reply.replace(/^\s*משימה\s*:\s*/, '').split('\n')[0].trim() + ', ואני מעדכן אותך כשזה בוצע.';
  if (!reply) reply = FAIL;
  if (left === 0) reply += '\n\nזו הייתה השאלה האחרונה בהדגמה. רוצה מוניטור כזה לעסק שלך? הפס הירוק למטה.';
  try {
    const dir = path.join(dirOf(d.dataPath), 'log'); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, dayIL(now) + '.jsonl'), JSON.stringify({ at: new Date(now).toISOString(), ref, ip: ipH, vid: vid.slice(0, 8), q: text, task, a: reply.slice(0, 600) }) + '\n');
  } catch (e) { /* the answer matters more than the log */ }
  return { status: 200, json: { reply, left } };
}

async function train(mode, fresh, text, b, d, now, ref, vid, ipH) {
  const { s, t } = readState(d.dataPath, now);
  const lv = life(d.dataPath);
  const used = lv['t:' + vid] || 0;
  if (used >= TRAIN_TURNS) return { status: 200, json: { reply: 'זהו, נגמר האימון של ההדגמה. רוצה מוניטור עם אימונים כאלה לעסק שלך? הפס הירוק למטה.', mode: 'chat', left: 0 } };
  if (t.questions >= PER_DAY) return { status: 200, json: { reply: FULL, mode: 'chat', left: 0 } };
  lv['t:' + vid] = used + 1; saveLife(d.dataPath, lv);
  t.questions++; t.trains = (t.trains || 0) + (fresh ? 1 : 0); t.refs[ref] = t.refs[ref] || { visits: 0, questions: 0, wa: 0 }; t.refs[ref].questions++;
  writeState(d.dataPath, s);
  const ctx = require('./demo-data.js').context(now);
  const hist = (Array.isArray(b.hist) ? b.hist : []).slice(-10);
  const ending = !fresh && TRAIN_END.test(text);
  let sys = trainSystem(mode, ctx), inp;
  if (fresh) inp = 'פתח את האימון במשפט אחד שלך בתוך הדמות' + (mode === 'sales' ? ' (כלקוח שפונה למספרה)' : ' (שאלה ראשונה)') + '.';
  else if (ending && mode === 'sales') {
    sys = 'אתה מאמן מכירות. תן לרועי ציון מ 1 עד 10 על שיחת המכירה למטה, ושלושה דברים קצרים: מה עבד, מה לשפר, ומשפט אחד שהיה סוגר את העסקה. עברית, בלי מקפים, עד 6 שורות.';
    inp = hist.map((x) => (x && x.from === 'me' ? 'רועי: ' : 'לקוח: ') + String((x && x.text) || '').slice(0, 400)).join('\n');
  } else if (ending) {
    return { status: 200, json: { reply: 'סיימנו. רוצה מאמן כזה במוניטור של העסק שלך? הפס הירוק למטה.', mode: 'chat', left: 0 } };
  } else inp = input(hist, text).replace(/המוניטור:$/, mode === 'sales' ? 'הלקוח:' : 'המאמן:');
  if (!(await slot())) return { status: 200, json: { reply: BUSY, mode } };
  let reply = '';
  try {
    const llm = d.llm || ((m, sy, i) => require('./sales-train.js').llm(m, sy, i, 45000, require('./customer-env.js').customerEnv()));
    reply = noDash(await llm('haiku', sys, inp));
  } catch (e) { reply = ''; } finally { running--; }
  if (!reply) return { status: 200, json: { reply: FAIL, mode } };
  if (fresh) reply = TRAIN_HELLO[mode] + '\n\n' + reply;
  try {
    const dir = path.join(dirOf(d.dataPath), 'log'); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, dayIL(now) + '.jsonl'), JSON.stringify({ at: new Date(now).toISOString(), ref, ip: ipH, vid: vid.slice(0, 8), q: '[' + mode + '] ' + text, a: reply.slice(0, 600) }) + '\n');
  } catch (e) { /* the answer matters more than the log */ }
  return { status: 200, json: { reply, mode: ending ? 'chat' : mode } };
}

module.exports = { api, system, input, PER_VISITOR, PER_IP, PER_DAY };
