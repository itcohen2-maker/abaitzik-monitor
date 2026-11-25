'use strict';
/*
  25.11.2026, Itzik: "אני מתקשה קצת לדבר עם לקוחות חדשים שמגיעים מהלידים... נתקעו בלאבבל ובבייס 44...
  תייצר לי שאלון שאני יכול לדבר עם הלקוח... עם מודל של AI, כדי שאני אוכל גם להקיש וגם לשאול שאלות תוך כדי."
  Later in the same request: "אל תשלח לו כלום", "לא לערב את טום". So the page names no team member and sends
  nothing to anyone. Questions Itzik cannot answer go to a list only he sees, with a copy button.

  A private page by unguessable link: https://form.it-solution.co.il/k/<20 hex>. The token lives in
  data/call-kit/token.txt only (this repo is public). Calls are kept in data/call-kit/calls/<id>.json,
  so a Safari refresh in the middle of a call loses nothing.

  GET  /k/<tok>        the page (lib/call-kit.html, the token put in at serve time).
  POST /api/callkit    JSON { tok, op } with op one of:
                         ask   { q, notes }  a short answer he can say aloud, by haiku
                         next  { notes }     the three most useful questions not asked yet, by haiku
                         sum   { notes }     a tidy summary of the call, by sonnet
                         save  { id, call }  keep the call (overwrites the same id)
                         list  {}            the calls, newest first
                         get   { id }        one call
  Runs on Itzik's own subscription (his own tool, no customer behind it). 150 model calls a day at most.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DAY_CAP = 150;
const MAX_CALLS = 300;
const MAX_CALL_BYTES = 60000;
const FALLBACK = 'העוזר לא ענה הפעם. בינתיים אפשר להגיד: "שאלה טובה, אני רושם אותה ובודק עם הצוות הטכני שלנו, ואחזור אליך עם תשובה מדויקת."';

const FACTS = [
  'Lovable בונה אתרים ואפליקציות ווב מתוך צ׳אט. הקוד שלו הוא React רגיל, ואפשר לחבר את הפרויקט ל GitHub ולקבל עותק מלא של הקוד. הנתונים וההתחברות יושבים בדרך כלל ב Supabase או ב Lovable Cloud. מפתחות וסיסמאות של שירותים לא עוברים בייצוא, וצריך להגדיר אותם מחדש. כשנגמרים הקרדיטים, גם השרת של Lovable Cloud יכול לעצור עד שמשלמים.',
  'Base44 בונה אפליקציות מתוך צ׳אט, והשרת, הנתונים וההתחברות יושבים אצלם. ייצוא קוד קיים רק בחבילה בתשלום, ובעיקר של החזית. הלוגיקה בצד השרת והקבצים שהועלו קשים להוצאה, ולכן מעבר מ Base44 הוא לפעמים בנייה מחדש של הצד האחורי.',
  'Bolt, Replit ו v0 הם כלים דומים. Cursor ו Claude Code הם כלים למתכנתים.',
  'למה נתקעים: לולאת תיקונים שבה הסוכן מתקן דבר אחד ושובר אחר ושורף קרדיטים; בקשה עם הרבה שינויים בבת אחת; התחברות והרשאות (ב Supabase הגדרת הרשאות חסרה, RLS, גורמת לשגיאה 403 או לנתונים שנראים ריקים); תשלומים; חיבור לשירותים חיצוניים; המעבר מדמו יפה למוצר עם משתמשים אמיתיים; אפליקציה לחנויות (הכלים האלה בונים אתר, לא אפליקציה לאייפון ולאנדרואיד); דומיין ופרסום לאוויר; מהירות.',
  'מה קובע את המחיר: כמה מסכים ופעולות יש; מצב הקוד, אם אפשר לתקן או שצריך לבנות מחדש; חיבורים לתשלומים, מייל, וואטסאפ או מערכות אחרות; נתונים קיימים שצריך להעביר; דדליין; ומי מתחזק אחר כך.',
  'מה מבקשים מהלקוח כדי להעריך: קישור לאפליקציה, צילום מסך של השגיאה, גישה לפרויקט (הזמנה לפרויקט או קישור ל GitHub), ורשימה קצרה של מה עובד ומה לא.',
  'אם שואלים אם השירות בתשלום: כן. השיחה הזאת בלי עלות, ואחרי שמבינים מה צריך מקבלים הצעת מחיר מסודרת לפני שמתחילים משהו.',
].join('\n');

const BASE = [
  'אתה עוזר שקט של איציק בזמן שיחת טלפון עם לקוח פוטנציאלי של IT Solution. הלקוחות בנו מוצר בכלי AI כמו Lovable או Base44 ונתקעו. איציק לא טכני, והוא קורא את התשובה שלך תוך כדי שיחה.',
  'כתוב בעברית פשוטה ומדוברת. בלי מקפים, בלי כוכביות ובלי עיצוב. באנגלית רק שמות של כלים.',
  'אסור לתת מחיר, טווח מחיר או זמן ביצוע, ואסור להבטיח שמשהו אפשרי. על מחיר אומרים: "המחיר תלוי במה שנמצא בפנים. אחרי שנראה את הפרויקט תקבל הצעה מסודרת, לפני שמתחילים משהו."',
  'כשאתה לא בטוח בתשובה טכנית, אל תנחש. תן את המשפט: "שאלה טובה, אני רושם אותה ובודק עם הצוות הטכני שלנו, ואחזור אליך עם תשובה מדויקת."',
  'אל תזכיר שמות של אנשים.',
  'עובדות שאפשר להסתמך עליהן:',
  FACTS,
].join('\n');

const MODES = {
  ask: {
    model: 'haiku', ms: 45000,
    sys: BASE + '\nענה בעד ארבע שורות קצרות. שורה ראשונה מתחילה ב "להגיד ללקוח:" עם משפט שאפשר לומר בקול. אם יש מונח שאיציק צריך להבין, שורה שמתחילה ב "בשבילך:" עם הסבר פשוט. אם לא ידעת לענות, שורה אחרונה שמתחילה ב "לרשימה:" עם השאלה בקיצור.',
  },
  next: {
    model: 'haiku', ms: 45000,
    sys: BASE + '\nלפי מה שנרשם עד עכשיו בשיחה, כתוב את שלוש השאלות הכי חשובות שעוד לא נשאלו או שהתשובה עליהן חסרה. שורה לכל שאלה, בניסוח שאפשר להגיד בקול ללקוח, בלי מספור ובלי הסברים.',
  },
  sum: {
    model: 'sonnet', ms: 90000,
    sys: BASE + '\nכתוב סיכום שיחה מסודר לאיציק, בשורות קצרות, עם הכותרות האלה בשורה נפרדת כל אחת: הלקוח, המוצר, איפה נבנה, איפה נתקע, מה הוא רוצה, זמנים ותקציב, מה עוד חסר לנו לדעת, שאלות פתוחות, הצעד הבא. מה שלא נאמר בשיחה כותבים "לא נאמר". לא ממציאים, ובלי מחיר.',
  },
};

function root(DATA) { return path.join(DATA, 'call-kit'); }
function token(DATA) { try { const t = fs.readFileSync(path.join(root(DATA), 'token.txt'), 'utf8').trim(); return /^[a-f0-9]{20}$/.test(t) ? t : ''; } catch (e) { return ''; } }
function tokOk(DATA, t) {
  const a = token(DATA), b = String(t || '');
  return !!a && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }

function ilDay(now) { return new Date(now + 2 * 3600e3).toISOString().slice(0, 10); }
/** Counts one model call; false when today's cap is reached. */
function takeCap(DATA, now) {
  const f = path.join(root(DATA), 'usage.json');
  const u = readJson(f, {});
  const d = ilDay(now);
  const n = u.day === d ? (u.n || 0) : 0;
  if (n >= DAY_CAP) return false;
  writeJson(f, { day: d, n: n + 1 });
  return true;
}

const clip = (s, n) => String(s == null ? '' : s).replace(/\u0000/g, '').trim().slice(0, n);
const idOk = (id) => /^[a-z0-9-]{6,40}$/.test(String(id || ''));

/** The model's text, tidied: no markdown marks, no dashes as punctuation. */
function tidy(t) {
  return String(t || '').replace(/\*\*?|__|^#+\s*/gm, '').replace(/\s[–—-]\s/g, ', ').replace(/[–—]/g, ',').trim();
}

async function model(DATA, b, llm, now) {
  const m = MODES[b.op];
  const notes = clip(b.notes, 8000);
  const q = clip(b.q, 1500);
  if (b.op === 'ask' && !q) return { status: 400, json: { ok: false, error: 'empty' } };
  if (!takeCap(DATA, now)) return { status: 429, json: { ok: false, text: 'הגענו למכסה של היום לעוזר. ' + FALLBACK } };
  const input = (notes ? 'מה שנרשם בשיחה עד עכשיו:\n' + notes + '\n\n' : 'עוד לא נרשם כלום בשיחה.\n\n') + (q ? 'השאלה של איציק: ' + q : 'בצע את המשימה.');
  try {
    const out = tidy(await llm(m.model, m.sys, input, m.ms));
    if (!out) throw new Error('empty');
    return { status: 200, json: { ok: true, text: out } };
  } catch (e) {
    return { status: 200, json: { ok: false, text: FALLBACK } };
  }
}

function callsDir(DATA) { return path.join(root(DATA), 'calls'); }

function save(DATA, b, now) {
  if (!idOk(b.id)) return { status: 400, json: { ok: false, error: 'id' } };
  const call = b.call && typeof b.call === 'object' && !Array.isArray(b.call) ? b.call : null;
  if (!call) return { status: 400, json: { ok: false, error: 'call' } };
  const raw = JSON.stringify(call);
  if (Buffer.byteLength(raw) > MAX_CALL_BYTES) return { status: 413, json: { ok: false, error: 'big' } };
  const f = path.join(callsDir(DATA), b.id + '.json');
  const old = readJson(f, null);
  writeJson(f, { id: b.id, created: (old && old.created) || new Date(now).toISOString(), saved: new Date(now).toISOString(), call: call });
  prune(DATA);
  return { status: 200, json: { ok: true } };
}

function prune(DATA) {
  let fs1 = []; try { fs1 = fs.readdirSync(callsDir(DATA)).filter((f) => f.endsWith('.json')); } catch (e) { return; }
  if (fs1.length <= MAX_CALLS) return;
  fs1.map((f) => ({ f, t: fs.statSync(path.join(callsDir(DATA), f)).mtimeMs })).sort((a, b) => a.t - b.t)
    .slice(0, fs1.length - MAX_CALLS).forEach((x) => { try { fs.unlinkSync(path.join(callsDir(DATA), x.f)); } catch (e) {} });
}

function list(DATA) {
  let files = []; try { files = fs.readdirSync(callsDir(DATA)).filter((f) => f.endsWith('.json')); } catch (e) {}
  const out = files.map((f) => readJson(path.join(callsDir(DATA), f), null)).filter(Boolean).map((r) => {
    const a = (r.call && r.call.a) || {};
    return { id: r.id, saved: r.saved, created: r.created, name: clip(a.name, 60), tool: clip([].concat(a.tool || []).join(', '), 60), stuck: clip([].concat(a.stuck || []).join(', '), 80) };
  });
  out.sort((x, y) => String(y.saved).localeCompare(String(x.saved)));
  return { status: 200, json: { ok: true, calls: out.slice(0, 100) } };
}

function get(DATA, b) {
  if (!idOk(b.id)) return { status: 400, json: { ok: false } };
  const r = readJson(path.join(callsDir(DATA), b.id + '.json'), null);
  return r ? { status: 200, json: { ok: true, call: r.call, saved: r.saved } } : { status: 404, json: { ok: false } };
}

/** The API. llm(model, system, input, ms) -> Promise<string>; injected in the tests. */
async function handle(DATA, b, llm, opts) {
  const now = (opts && opts.now) || Date.now();
  if (!b || typeof b !== 'object' || !tokOk(DATA, b.tok)) return { status: 403, json: { ok: false } };
  if (MODES[b.op]) return model(DATA, b, llm, now);
  if (b.op === 'save') return save(DATA, b, now);
  if (b.op === 'list') return list(DATA);
  if (b.op === 'get') return get(DATA, b);
  return { status: 400, json: { ok: false, error: 'op' } };
}

function page(tok) {
  return fs.readFileSync(path.join(__dirname, 'call-kit.html'), 'utf8').replace('__TOK__', tok);
}

function serve(DATA, tok, s) {
  if (!tokOk(DATA, tok)) { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('לא נמצא'); }
  s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  s.end(page(tok));
}

module.exports = { handle, serve, page, tidy, DAY_CAP, FALLBACK, MODES };
