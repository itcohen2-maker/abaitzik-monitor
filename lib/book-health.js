'use strict';
/*
  23.11.2026: the health declaration (הצהרת בריאות) a client signs with her finger when she books a service the owner marked
  health: true (lib/bookings.js cleanServices), e.g. peeling, a face treatment, hair removal. It replaces the paper form.

  WHERE IT LIVES: only in the tenant's own data folder, data/bookings/health/<hash of the phone>.json, mode 0600, written by the
  tenant's own agent (lib/book-core.js) inside the diary lock. The platform's bridge (lib/book-page.js) only shape checks and forwards
  it; it keeps nothing and logs nothing. Answers are never written to a log or to a notification text.

  PRIVACY DESIGN (the safe one): the page ALWAYS asks for the declaration when the chosen service needs it. The agent never says
  whether a phone already has one, so a stranger who types somebody's phone learns nothing about her. A client who books twice signs twice.

  SIGNATURE: a compact SVG path of integer points on a 300x120 grid, "M12,40L13,42L15,45M60,30L..." (M starts a stroke, L continues it),
  at most SIG_MAX characters (the bridge reads a POST body of 8KB at most, Hebrew counts two bytes a character). It is drawn on the
  owner's screen as <path d>, so the strict character set below is what keeps it safe there.

  QUESTIONS is the one list: change the text here and the page, the validation and the owner's view follow. A record keeps the texts that
  were asked (q), so an old declaration still reads as it was signed.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUESTIONS = [
  { id: 'q1', text: 'האם את בהריון או מניקה?' },
  { id: 'q2', text: 'האם יש לך אלרגיות (לתרופות, לקוסמטיקה, למזון)?' },
  { id: 'q3', text: 'האם את נוטלת תרופות באופן קבוע?' },
  { id: 'q4', text: 'האם נטלת רואקוטן (או תכשיר דומה) בחצי השנה האחרונה?' },
  { id: 'q5', text: 'האם יש לך מחלת עור פעילה, פצעים או דלקת באזור הטיפול?' },
  { id: 'q6', text: 'האם עברת טיפול לייזר, פילינג או חשיפה חזקה לשמש בשבועיים האחרונים?' },
  { id: 'q7', text: 'האם יש לך סוכרת, אפילפסיה, מחלת לב או קוצב לב?' },
  { id: 'q8', text: 'האם יש משהו נוסף שחשוב שאדע לפני הטיפול?', free: true },
];
const AGREE_TEXT = 'אני מצהירה שהפרטים נכונים, ואעדכן אם משהו ישתנה.';
const DETAIL_MAX = 120, NOTE_MAX = 300, SIG_MAX = 3000, SIG_W = 300, SIG_H = 120, KEEP = 5, VALID_MS = 365 * 864e5;
const YESNO = QUESTIONS.filter((q) => !q.free), FREE = QUESTIONS.find((q) => q.free);

const txt = (v, n) => String(v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

// "M12,40L13,42..." -> the same string when it is a drawing (only M and L, integer points inside the grid, a mark bigger than a dot), else ''
function cleanSig(s) {
  if (typeof s !== 'string' || s.length < 12 || s.length > SIG_MAX || !/^[ML0-9,]+$/.test(s) || s.charAt(0) !== 'M') return '';
  const re = /([ML])(\d{1,3}),(\d{1,3})/g;
  let m, pos = 0, n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  while ((m = re.exec(s))) {
    if (m.index !== pos) return '';
    pos = re.lastIndex; n++;
    const x = +m[2], y = +m[3];
    if (x >= SIG_W || y >= SIG_H) return '';
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (pos !== s.length || n < 3 || (x1 - x0 < 12 && y1 - y0 < 12)) return '';
  return s;
}

// What the page sends: { answers: { q1: { a: 'y'|'n', d }, ... q7 }, note, sig, agreed: true }. Strict: every yes/no question answered, no
// unknown id, agreed exactly true, a real drawing. Text is capped, not refused. -> { answers, note, sig } or null.
function validate(h) {
  if (!isObj(h) || h.agreed !== true || !isObj(h.answers)) return null;
  const ids = Object.keys(h.answers);
  if (ids.length !== YESNO.length || ids.some((k) => !YESNO.some((q) => q.id === k))) return null;
  const answers = {};
  for (const q of YESNO) {
    const a = h.answers[q.id];
    if (!isObj(a) || (a.a !== 'y' && a.a !== 'n')) return null;
    if (a.d != null && typeof a.d !== 'string') return null;
    answers[q.id] = a.a === 'y' ? { a: 'y', d: txt(a.d || '', DETAIL_MAX) } : { a: 'n' };
  }
  if (h.note != null && typeof h.note !== 'string') return null;
  const sig = cleanSig(h.sig);
  if (!sig) return null;
  return { answers, note: txt(h.note || '', NOTE_MAX), sig };
}

// ---- the tenant's own folder ----
const dirOf = (dp) => path.join(dp, 'bookings', 'health');
const keyOf = (phone) => crypto.createHash('sha256').update('health1:' + String(phone || '')).digest('hex').slice(0, 24);
function readFile(f) { try { if (!fs.lstatSync(f).isFile()) return null; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return isObj(j) && Array.isArray(j.list) ? j : null; } catch (e) { return null; } }
function realDir(p) { try { return fs.lstatSync(p).isDirectory(); } catch (e) { return e.code === 'ENOENT'; } }

// Adds a declaration for this phone (the last KEEP are kept). Throws when the folder is not a real folder: the caller then undoes the booking.
function save(dp, phone, decl, bookingId, now, B) {
  const dir = dirOf(dp);
  if (!realDir(path.join(dp, 'bookings')) || !realDir(dir)) throw new Error('unsafe folder');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = path.join(dir, keyOf(phone) + '.json'), cur = readFile(f) || { list: [] };
  const q = {}; QUESTIONS.forEach((x) => { q[x.id] = x.text; });
  cur.list.push({ at: new Date(now == null ? Date.now() : now).toISOString(), bookingId: String(bookingId || ''), q, answers: decl.answers, note: decl.note, sig: decl.sig });
  cur.list = cur.list.slice(-KEEP);
  B.writeAtomic(f, cur, 0o600);
}
function load(dp, phone) { const j = readFile(path.join(dirOf(dp), keyOf(phone) + '.json')); return j && j.list.length ? j.list[j.list.length - 1] : null; }
const validAt = (rec, now) => !!rec && Date.parse(rec.at) > (now == null ? Date.now() : now) - VALID_MS;

// For the owner's screen (lib/bookings-ui.js data): { <phone>: { at, q, answers, note, sig } } for these phones, the newest declaration of each.
// The signature is checked again before it goes into the payload.
function forPhones(dp, phones, now) {
  const out = {};
  Array.from(new Set(phones)).slice(0, 60).forEach((p) => {
    const r = p ? load(dp, p) : null;
    if (r && cleanSig(r.sig) && isObj(r.answers)) out[p] = { at: r.at, valid: validAt(r, now), q: r.q || {}, answers: r.answers, note: String(r.note || ''), sig: r.sig };
  });
  return out;
}

// what the agent tells the page (info): the questions as they are now
const publicQuestions = () => QUESTIONS.map((q) => ({ id: q.id, text: q.text, free: !!q.free }));

module.exports = { QUESTIONS, AGREE_TEXT, DETAIL_MAX, NOTE_MAX, SIG_MAX, SIG_W, SIG_H, FREE, validate, cleanSig, save, load, validAt, forPhones, publicQuestions, keyOf, dirOf };
