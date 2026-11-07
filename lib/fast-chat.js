'use strict';
/*
  7.11.2026, "שיחה עם המוניטור": a fast consulting chat (Haiku, a few seconds)
  that the page and WhatsApp share. One file per monitor:
    <dataPath>/fastchat/thread.json   { mode, msgs[40], sales? }
    <dataPath>/fastchat/coach.json    { goals: [{ at, text, done? }] }
  Modes: chat (adviser), sales (sales-train role play), coach (one goal a week).
  The chat never acts: "להעביר לביצוע" hands a message to the request queue.
  Writes are serialized per folder inside the process and land atomically
  (.tmp then rename), so two quick messages never overwrite each other.
*/
const fs = require('fs');
const path = require('path');

const KEEP = 40;
const SEND = 20;
const MAXLEN = 2000;
const FAIL = 'לא הצלחתי לענות עכשיו, נסה שוב';
const COACH_START = /^\s*(?:אימון עסקי|בוא נתאמן על העסק)[.!]*\s*$/;
const COACH_END = /^\s*(?:סיום אימון|סיימנו|עצור אימון)[.!]*\s*$/;

const dirOf = (dataPath) => path.join(dataPath, 'fastchat');
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), 'utf8');
  fs.renameSync(f + '.tmp', f);
}

function load(dataPath) {
  const t = readJson(path.join(dirOf(dataPath), 'thread.json'), null);
  const th = { mode: 'chat', msgs: [] };
  if (t && typeof t === 'object') {
    if (t.mode === 'sales' || t.mode === 'coach') th.mode = t.mode;
    if (Array.isArray(t.msgs)) th.msgs = t.msgs;
    if (t.sales) th.sales = t.sales;
  }
  const c = readJson(path.join(dirOf(dataPath), 'coach.json'), null);
  if (c && Array.isArray(c.goals)) th.coach = { goals: c.goals };
  return th;
}

function save(dataPath, th) {
  const o = { mode: th.mode, msgs: th.msgs.slice(-KEEP) };
  if (th.sales) o.sales = th.sales;
  writeJson(path.join(dirOf(dataPath), 'thread.json'), o);
}

const queues = new Map();
function enqueue(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return next;
}

let seq = 0;
function mk(from, text, via, now) {
  return { id: 'm' + now.toString(36) + (seq++).toString(36), at: new Date(now).toISOString(), from, text, via };
}

function defaultLlm() {
  const st = require('./sales-train.js');
  return (model, system, input) => st.llm(model, system, input, 60000);
}

function chatSystem(owner, business) {
  const l = [
    'אתה "המוניטור", יועץ עסקי אישי של בעל עסק קטן בישראל. ישיר, חם, עניני.',
    'העסק: ' + (business || 'עסק קטן בישראל') + '.',
    'ענה בעברית מדוברת, עד 6 שורות. בלי מקפים בטקסט, בלי כותרות, בלי טבלאות.',
    'כשמשהו הוא עבודה לביצוע (שליחת מייל, הצעת מחיר, פרסום, בדיקה במערכת) אל תעשה אותו, ותגיד: "אפשר ללחוץ להעביר לביצוע".',
    'אל תמציא נתונים על העסק, על לקוחות או על מספרים. אם אינך יודע, אמור זאת ושאל.',
  ];
  if (!owner) l.push('אם ההצעה שלך דורשת עבודה מעבר למה שכלול, אמור זאת בפירוש: "תוספת בתשלום". אם המחיר ידוע לך מתיאור העסק, ציין אותו. אם לא, אל תמציא מספר, ואל תבטיח עבודה בחינם.');
  return l.join('\n');
}

function coachSystem(owner, business, last) {
  return [
    'אתה "המוניטור" במצב אימון עסקי: מאמן חם וישיר לבעל עסק קטן בישראל.',
    'העסק: ' + (business || 'עסק קטן בישראל') + '.',
    'שאל שאלה אחת בכל פעם, קצרה. עזור לבחור יעד אחד לשבוע, מדיד וקטן.',
    last ? 'היעד האחרון שנשמר: "' + last + '". בפתיחת האימון שאל איך הלך עם היעד הזה.' : 'עוד לא נשמר יעד. בפתיחה שאל מה הדבר האחד שהכי יזיז את העסק השבוע.',
    'כשהיעד נקבע ואושר, סיים את התשובה בשורה אחרונה נפרדת בדיוק בפורמט: יעד: <הטקסט של היעד>. אל תכתוב שורה כזו לפני שנקבע יעד.',
    'עברית מדוברת, עד 5 שורות, בלי מקפים בטקסט. אל תמציא נתונים על העסק.',
  ].join('\n');
}

function transcript(msgs) {
  return msgs.slice(-SEND).map((m) => (m.from === 'me' ? 'משתמש: ' : 'מוניטור: ') + m.text).join('\n') + '\nמוניטור:';
}

function extractGoal(reply) {
  let goal = '';
  const kept = String(reply).split('\n').filter((ln) => {
    const m = ln.match(/^\s*יעד:\s*(.+?)\s*$/);
    if (m) { goal = m[1]; return false; }
    return true;
  });
  return { goal, text: kept.join('\n').trim() };
}

async function run(dataPath, text, opts) {
  const now = (opts.now ? opts.now() : Date.now());
  const llm = opts.llm || defaultLlm();
  const ST = opts.salesTrain || require('./sales-train.js');
  const th = load(dataPath);
  const t = String(text || '').trim().slice(0, MAXLEN);
  if (!t) return { reply: '', mode: th.mode, thread: th.msgs };
  const via = opts.via || 'page';
  th.msgs.push(mk('me', t, via, now));
  if (th.mode === 'sales' && !(th.sales && ST.active(th.sales, now))) { th.mode = 'chat'; delete th.sales; }
  save(dataPath, th); // the user's message survives a crash during the model call
  const finish = (reply) => {
    th.msgs.push(mk('bot', reply, via, now));
    save(dataPath, th);
    return { reply, mode: th.mode, thread: th.msgs.slice(-KEEP) };
  };
  const fail = () => { save(dataPath, th); return { reply: FAIL, mode: th.mode, thread: th.msgs.slice(-KEEP) }; };

  if (th.mode === 'sales') {
    if (ST.isStop(t)) { th.mode = 'chat'; delete th.sales; return finish('האימון נעצר, בלי ציון.'); }
    if (ST.isEnd(t)) {
      const tr = th.sales;
      let res = ''; try { res = await ST.score(tr); } catch (e) { res = ''; }
      // A failed score keeps the training so the user can say "סיימנו" again.
      if (!res) return finish('לא הצלחתי לחשב ציון הפעם. אפשר לכתוב "סיימנו" שוב.');
      th.mode = 'chat'; delete th.sales;
      try { if (ST.keep) ST.keep(dataPath, tr, res); } catch (e) {}
      return finish(res);
    }
    const tr = th.sales;
    tr.turns.push({ who: 'me', t }); tr.last = now;
    save(dataPath, th);
    let r = ''; try { r = await ST.customerTurn(tr); } catch (e) { r = ''; }
    if (!r) return fail();
    tr.turns.push({ who: 'client', t: r });
    return finish(r);
  }

  const s0 = ST.startOf(t);
  if (s0) {
    th.mode = 'sales';
    th.sales = { scenario: s0.scenario, business: opts.business || '', turns: [], last: now };
    return finish('🎭 מתחילים אימון מכירות. אני הלקוח' + (s0.scenario ? ' (' + s0.scenario + ')' : '') + '. אתה פותח את השיחה.\n"סיימנו" לציון, "עצור אימון" ליציאה.');
  }
  if (th.mode === 'coach') {
    if (COACH_END.test(t)) { th.mode = 'chat'; return finish('יצאנו מהאימון. אפשר להמשיך לדבר.'); }
  } else if (COACH_START.test(t)) th.mode = 'coach';
  save(dataPath, th);

  let sys;
  if (th.mode === 'coach') {
    const goals = (readJson(path.join(dirOf(dataPath), 'coach.json'), { goals: [] }).goals) || [];
    sys = coachSystem(!!opts.owner, opts.business, goals.length ? goals[goals.length - 1].text : '');
  } else sys = chatSystem(!!opts.owner, opts.business);
  let r = ''; try { r = await llm('haiku', sys, transcript(th.msgs)); } catch (e) { r = ''; }
  r = String(r || '').trim();
  if (!r) return fail();
  if (th.mode === 'coach') {
    const g = extractGoal(r);
    if (g.goal) {
      const f = path.join(dirOf(dataPath), 'coach.json');
      const c = readJson(f, { goals: [] });
      c.goals = (c.goals || []).concat([{ at: new Date(now).toISOString(), text: g.goal }]).slice(-20);
      writeJson(f, c);
    }
    r = g.text || (g.goal ? 'קבענו יעד: ' + g.goal : r);
  }
  return finish(r);
}

function turn(dataPath, text, opts) {
  return enqueue(path.resolve(dataPath), () => run(dataPath, text, opts || {}));
}

// Pure HTTP-ish layer for wa-bridge (the code check already happened there).
async function chatApi(p, body, deps) {
  const b = body || {};
  const d = deps || {};
  if (p === '/api/chat') {
    const text = String(b.text || '').trim();
    if (!text) return { status: 400, json: { error: 'empty' } };
    const r = await turn(d.dataPath, text, { llm: d.llm, salesTrain: d.salesTrain, now: d.now, business: d.business, owner: d.owner, via: 'page' });
    return { status: 200, json: { reply: r.reply, mode: r.mode, msgs: r.thread.slice(-SEND) } };
  }
  if (p === '/api/chat/thread') {
    const th = load(d.dataPath);
    return { status: 200, json: { mode: th.mode, msgs: th.msgs.slice(-SEND) } };
  }
  if (p === '/api/chat/todo') {
    const m = load(d.dataPath).msgs.find((x) => x.id === String(b.id || ''));
    if (!m) return { status: 404, json: { error: 'not found' } };
    const id = await d.toMonitor('שיחה', m.text);
    return { status: 200, json: { ok: true, req: id } };
  }
  return { status: 404, json: { error: 'path' } };
}

module.exports = { turn, load, chatApi, FAIL };
