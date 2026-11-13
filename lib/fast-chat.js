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
// 10.11.2026, Itzik: "כל האימון לעסק ואימון אישי, האייקונים, בכל מוניטור". The third training: personal, one
// small goal a week for life outside the business (health, family, habits, rest). Its goals live in personal.json.
const PERSONAL_START = /^\s*(?:אימון אישי|בוא נתאמן על החיים)[.!]*\s*$/;

const dirOf = (dataPath) => path.join(dataPath, 'fastchat');
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), 'utf8');
  fs.renameSync(f + '.tmp', f);
}

function load(dataPath, now) {
  const t = readJson(path.join(dirOf(dataPath), 'thread.json'), null);
  const th = { mode: 'chat', msgs: [] };
  if (t && typeof t === 'object') {
    if (t.mode === 'sales' || t.mode === 'coach' || t.mode === 'personal') th.mode = t.mode;
    if (Array.isArray(t.msgs)) th.msgs = t.msgs;
    if (t.sales) th.sales = t.sales;
  }
  // A sales training that timed out is over: the screen must not show it as active.
  if (th.mode === 'sales') {
    let live = false; try { live = !!(th.sales && require('./sales-train.js').active(th.sales, now)); } catch (e) { live = false; }
    if (!live) { th.mode = 'chat'; delete th.sales; }
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
function mk(from, text, via, now, kind) {
  const m = { id: 'm' + now.toString(36) + (seq++).toString(36), at: new Date(now).toISOString(), from, text, via };
  if (kind) m.kind = kind;
  return m;
}

function defaultLlm() {
  const st = require('./sales-train.js');
  return (model, system, input) => st.llm(model, system, input, 60000);
}

function chatSystem(owner, business, via, ctx) {
  const l = [
    'אתה "המוניטור", יועץ עסקי אישי של בעל עסק קטן בישראל. ישיר, חם, עניני.',
    'העסק: ' + (business || 'עסק קטן בישראל') + '.',
    'ענה בעברית מדוברת, עד 6 שורות. בלי מקפים בטקסט, בלי כותרות, בלי טבלאות.',
    // 13.11.2026: a request to act is never a conversation. One line that starts with "משימה:", and the server forwards it.
    'אם ההודעה האחרונה היא בקשה לעשות משהו (לשלוח, לקבוע, לעדכן, להכין, לפרסם, להזכיר, לבדוק במערכת, לתקן, למחוק, להוסיף) ולא שאלה או התייעצות: אל תפתח שיחה, אל תשאל שאלות ואל תציע. ענה בשורה אחת בלבד שמתחילה במילה "משימה:" ואחריה הבקשה במילים קצרות.',
    'אל תמציא נתונים על העסק, על לקוחות או על מספרים. אם אינך יודע, אמור זאת ושאל.',
  ];
  if (ctx && ctx.text) l.push('מה שהמוניטור יודע עכשיו על בעל העסק (אמיתי, מותר ורצוי להשתמש בזה כשזה עוזר, אל תוסיף פרטים שאין כאן):\n' + ctx.text);
  if (ctx && ctx.conns && ctx.conns.length) {
    l.push('חיבורים שעוד לא מחוברים למוניטור: ' + ctx.conns.map((c) => c.id + ' = ' + c.title + (c.paid ? ' (' + c.paid + ')' : '')).join('; ') + '.');
    l.push('רק אם כדי לעזור באמת צריך אחד מהם (למשל שאלה על מיילים בלי גוגל), הצע לחבר אותו במשפט קצר, ואם כתוב ליד תוספת בתשלום אמור זאת. אז הוסף בסוף התשובה שורה נפרדת בדיוק: חיבור: <המזהה>. לכל היותר חיבור אחד.');
  }
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

function personalSystem(last) {
  return [
    'אתה "המוניטור" במצב אימון אישי: מאמן חם, רגוע וישיר לאדם, על החיים מחוץ לעבודה (בריאות, משפחה, שינה, הרגלים, זמן לעצמו).',
    'שאל שאלה אחת בכל פעם, קצרה. עזור לבחור יעד אחד קטן לשבוע, שאפשר לעמוד בו.',
    last ? 'היעד האישי האחרון שנשמר: "' + last + '". בפתיחת האימון שאל איך הלך עם היעד הזה.' : 'עוד לא נשמר יעד אישי. בפתיחה שאל מה הדבר האחד שהיה עושה לו טוב השבוע.',
    'כשהיעד נקבע ואושר, סיים את התשובה בשורה אחרונה נפרדת בדיוק בפורמט: יעד: <הטקסט של היעד>. אל תכתוב שורה כזו לפני שנקבע יעד.',
    'אתה לא רופא ולא מטפל: אם מדובר בבעיה רפואית או נפשית חמורה, אמור בעדינות שכדאי לפנות לאיש מקצוע. עברית מדוברת, עד 5 שורות, בלי מקפים בטקסט. אל תמציא עובדות עליו.',
  ].join('\n');
}

function transcript(msgs) {
  return msgs.slice(-SEND).map((m) => (m.from === 'me' ? 'משתמש: ' : 'מוניטור: ') + m.text).join('\n') + '\nמוניטור:';
}

function extractConn(reply, conns) {
  let conn = null;
  const kept = String(reply).split('\n').filter((ln) => {
    const m = ln.match(/^\s*חיבור:\s*(\S+)\s*$/);
    if (!m) return true;
    if (!conn) conn = (conns || []).find((c) => c.id === m[1]) || null;
    return false;
  });
  return { conn, text: kept.join('\n').trim() };
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
  const clock = () => (opts.now ? opts.now() : Date.now());
  const th = load(dataPath, now);
  const t = String(text || '').trim().slice(0, MAXLEN);
  if (!t) return { reply: '', mode: th.mode, thread: th.msgs };
  const via = opts.via || 'page';
  // 13.11.2026, Itzik: "למה ה AI התערב בבקשה שלי וכתב משהו לא קשור". A personal training started on 10.11 stayed on
  // for two days and answered a work request as a life coach. A training left quiet for two hours is over by itself.
  if (th.mode === 'coach' || th.mode === 'personal') {
    const prev = th.msgs.length ? new Date(th.msgs[th.msgs.length - 1].at).getTime() : 0;
    if (!prev || new Date(now).getTime() - prev > 2 * 3600e3) th.mode = 'chat';
  }
  th.msgs.push(mk('me', t, via, now));
  if (th.mode === 'sales' && !(th.sales && ST.active(th.sales, now))) { th.mode = 'chat'; delete th.sales; }
  save(dataPath, th); // the user's message survives a crash during the model call
  let kept = '';
  // The bot message is stamped when the answer is ready, not when the question came in.
  const finish = (reply, kind, extra) => {
    th.msgs.push(Object.assign(mk('bot', reply, via, clock(), kind || (th.mode === 'sales' ? 'sales' : '')), extra || {}));
    save(dataPath, th);
    return { reply, mode: th.mode, thread: th.msgs.slice(-KEEP), kept };
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
      try { if (ST.keep) kept = ST.keep(dataPath, tr, res) || ''; } catch (e) {}
      return finish(res, 'sales');
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
  if (th.mode === 'coach' || th.mode === 'personal') {
    if (COACH_END.test(t)) { th.mode = 'chat'; return finish('יצאנו מהאימון. אפשר להמשיך לדבר.'); }
  } else if (COACH_START.test(t)) th.mode = 'coach';
  else if (PERSONAL_START.test(t)) th.mode = 'personal';
  save(dataPath, th);

  let sys;
  const goalFile = th.mode === 'personal' ? 'personal.json' : 'coach.json';
  if (th.mode === 'coach') {
    const goals = (readJson(path.join(dirOf(dataPath), 'coach.json'), { goals: [] }).goals) || [];
    sys = coachSystem(!!opts.owner, opts.business, goals.length ? goals[goals.length - 1].text : '');
  } else if (th.mode === 'personal') {
    const goals = (readJson(path.join(dirOf(dataPath), 'personal.json'), { goals: [] }).goals) || [];
    sys = personalSystem(goals.length ? goals[goals.length - 1].text : '');
  } else {
    let ctx = null; try { ctx = opts.context ? opts.context() : null; } catch (e) { ctx = null; }
    opts._ctx = ctx;
    sys = chatSystem(!!opts.owner, opts.business, via, ctx);
  }
  let r = ''; try { r = await llm('haiku', sys, transcript(th.msgs)); } catch (e) { r = ''; }
  r = String(r || '').trim();
  if (!r) return fail();
  if (th.mode === 'coach' || th.mode === 'personal') {
    const g = extractGoal(r);
    if (g.goal) {
      const f = path.join(dirOf(dataPath), goalFile);
      const c = readJson(f, { goals: [] });
      c.goals = (c.goals || []).concat([{ at: new Date(now).toISOString(), text: g.goal }]).slice(-20);
      writeJson(f, c);
    }
    r = g.text || (g.goal ? 'קבענו יעד: ' + g.goal : r);
  }
  // 13.11.2026: the model marked a request to act. It goes to the request queue now, and the chat says so in one line.
  if (th.mode === 'chat' && /^\s*משימה\s*:/.test(r)) {
    if (typeof opts.toMonitor === 'function') {
      try { await opts.toMonitor('שיחה', t); return finish('זו משימה, אז העברתי אותה לביצוע. התשובה תגיע במסך התשובות.', '', { todo: true }); }
      catch (e) { /* the queue did not take it: say how to send it */ }
    }
    return finish(via === 'wa' ? 'זו משימה. כתוב "לביצוע" ואעביר אותה לביצוע.' : 'זו משימה. אפשר ללחוץ להעביר לביצוע.');
  }
  if (th.mode === 'chat') {
    const x = extractConn(r, opts._ctx && opts._ctx.conns);
    if (x.conn) {
      const c = x.conn;
      if (via === 'wa') return finish((x.text + '\n\n🔌 ' + (c.paid ? c.paid + '. ' : '') + (c.link ? 'לחיבור ' + c.title + ': ' + c.link : 'כתוב "לביצוע" ונתאם את החיבור.')).trim());
      return finish(x.text, '', { conn: c });
    }
    r = x.text || r;
  }
  return finish(r);
}

function turn(dataPath, text, opts) {
  return enqueue(path.resolve(dataPath), () => run(dataPath, text, opts || {}));
}

// "להעביר לביצוע": the question (the 'me' message before the bot answer) and the answer go to the
// request queue together. One send per bot message (todo:true is stored), also under a double click.
function todoText(msgs, i) {
  let q = null;
  for (let k = i - 1; k >= 0; k--) if (msgs[k].from === 'me') { q = msgs[k]; break; }
  const bot = msgs[i].text;
  const NL = String.fromCharCode(10);
  return q ? 'בקשה מהשיחה:' + NL + q.text + NL + NL + 'מה שהמוניטור הציע:' + NL + bot : bot;
}
function sendTodo(dataPath, pick, toMonitor) {
  return enqueue(path.resolve(dataPath), async () => {
    const th = load(dataPath);
    const i = pick(th.msgs);
    if (i < 0 || !th.msgs[i] || th.msgs[i].from !== 'bot') return { status: 404, json: { error: 'not found' } };
    const m = th.msgs[i];
    if (m.kind === 'sales') return { status: 400, json: { error: 'sales' } };
    if (m.todo) return { status: 200, json: { ok: true, dup: true } };
    const id = await toMonitor('שיחה', todoText(th.msgs, i));
    m.todo = true;
    save(dataPath, th);
    return { status: 200, json: { ok: true, req: id } };
  });
}
// WhatsApp: the word "לביצוע" sends the last question and answer pair.
function todoLast(dataPath, toMonitor) {
  return sendTodo(dataPath, (msgs) => { for (let k = msgs.length - 1; k >= 0; k--) if (msgs[k].from === 'bot' && msgs[k].kind !== 'sales') return k; return -1; }, toMonitor);
}
const TODO_CMD = /^\s*לביצוע[.!]*\s*$/;
const isTodoCmd = (t) => TODO_CMD.test(String(t || ''));

// Pure HTTP-ish layer for wa-bridge (the code check already happened there).
async function chatApi(p, body, deps) {
  const b = body || {};
  const d = deps || {};
  if (d.enabled === false) return { status: 404, json: { error: 'off' } };
  if (p === '/api/chat') {
    const text = String(b.text || '').trim();
    if (!text) return { status: 400, json: { error: 'empty' } };
    const r = await turn(d.dataPath, text, { llm: d.llm, salesTrain: d.salesTrain, now: d.now, business: d.business, owner: d.owner, via: 'page', context: d.context, toMonitor: d.toMonitor });
    return { status: 200, json: { reply: r.reply, mode: r.mode, msgs: r.thread.slice(-SEND) } };
  }
  if (p === '/api/chat/thread') {
    const th = load(d.dataPath);
    return { status: 200, json: { mode: th.mode, msgs: th.msgs.slice(-SEND) } };
  }
  if (p === '/api/chat/todo') {
    const want = String(b.id || '');
    return sendTodo(d.dataPath, (msgs) => msgs.findIndex((x) => x.id === want), d.toMonitor);
  }
  return { status: 404, json: { error: 'path' } };
}

const CHAT_ON = /^\s*(?:מצב שיחה|בוא נדבר)\s*[.!]*\s*$/;
const CHAT_OFF = /^\s*(?:מצב בקשות|סיום שיחה)\s*[.!]*\s*$/;
const chatOn = (t) => CHAT_ON.test(String(t || ''));
const chatOff = (t) => CHAT_OFF.test(String(t || ''));

module.exports = { turn, load, chatApi, chatOn, chatOff, todoLast, isTodoCmd, FAIL };
