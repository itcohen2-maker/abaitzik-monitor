'use strict';
/*
  Dental lab report duplicate check (10.11.2026, first phase of Dr. Shulman's monitor).

  His rule: a duplicate is the same patient + the same tooth + the same work type.
  The same tooth with a different work type is NOT a duplicate. It is checked
  inside one delivery note and against every earlier note stored for the tenant.

  Per lab there is one parser (PARSERS). A lab we do not know yet falls back to
  the CTI line shape, and when no line is read at all the report says so, instead
  of claiming "no duplicates".

  Teeth: FDI numbers. A range such as 13-27 is expanded along the arch, because
  that is how CTI writes a bridge or span: 13 12 11 21 22 23 24 25 26 27 (10
  teeth, and the quantity column on the note says 10). 31-42 is 31 41 42. The
  expanded list is compared with the quantity column; a mismatch is only noted.

  Pure functions, no I/O except in run() at the bottom of lab-check.js.
*/

// Arch order of FDI numbers, from the back of one side to the back of the other.
const ARCHES = [
  [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
  [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
];

function expandRange(a, b) {
  for (const arch of ARCHES) {
    const i = arch.indexOf(a), j = arch.indexOf(b);
    if (i >= 0 && j >= 0) return (i <= j ? arch.slice(i, j + 1) : arch.slice(j, i + 1).reverse());
  }
  return null;
}

// "46 45", "13-27", "24-26 14 13" -> { teeth: [...], ok } (ok false when a range crosses arches)
function expandTeeth(tokens) {
  const out = [];
  let ok = true;
  for (const t of tokens) {
    const m = /^(\d{2})-(\d{2})$/.exec(t);
    if (m) {
      const r = expandRange(+m[1], +m[2]);
      if (r) r.forEach(x => out.push(x)); else { ok = false; out.push(+m[1], +m[2]); }
    } else out.push(+t);
  }
  return { teeth: [...new Set(out)], ok };
}

const BIDI = /[‎‏‪-‮⁦-⁩]/g;
function clean(text) { return String(text || '').replace(BIDI, '').replace(/\r/g, ''); }
function num(s) { return parseFloat(String(s).replace(/,/g, '')); }
function norm(s) {
  return String(s || '').replace(/[־‐-―]/g, ' ').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const TOOTH = /^\d{2}(-\d{2})?$/;
// Lines that belong to the patient line above them (no patient of their own).
const ADDON = /^(t\s*base|crdho|מולטי יוניט)/i;
// Work types we know, longest first. Anything else: the last two words are the patient.
const WORK_TYPES = [
  'כתר זירקוניה מוברג ללא t base',
  'כתר זירקוניה t+בייס',
  'כתר זירקוניה מוברג',
  'כתר זירקוניה',
  'כתר זמני מוברג',
  'כתר זמני בחריטה',
  'כתר זמני',
].sort((a, b) => b.length - a.length);

function splitDesc(desc) {
  const tokens = desc.split(/\s+/).filter(Boolean);
  const teethTok = [];
  const words = [];
  // teeth may be at the end ("... 46 45") or in front ("44 34 31-42 ...") depending on how the PDF lays the line out
  for (const t of tokens) (TOOTH.test(t) ? teethTok : words).push(t);
  const text = words.join(' ');
  const low = norm(text);
  let work = null, patient = null;
  for (const w of WORK_TYPES) {
    if (low.startsWith(w)) { work = text.slice(0, w.length); patient = text.slice(w.length).trim(); break; }
  }
  if (work === null) {
    if (words.length >= 3) { work = words.slice(0, -2).join(' '); patient = words.slice(-2).join(' '); }
    else { work = text; patient = ''; }
  }
  return { text, work, patient, teethTok };
}

/* ---------- CTI: "קריאטיב טים אינסטרומנטס" ---------- */
const CTI_LINE = /^\s*([\d,]+\.\d\d)\s+([\d,]+\.\d\d)\s+([\d,]+\.\d\d)\s+(.+?)\s+(\d+)\s+(\d+)\s*$/;

function parseCti(raw) {
  const text = clean(raw);
  const doc = { lines: [], unparsed: [] };
  let m = /מספר\s*:?\s*(\d+\/\d+)/.exec(text); doc.no = m ? m[1] : null;
  m = /תאריך\s*:?\s*(\d\d)\/(\d\d)\/(\d{4})/.exec(text); doc.date = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  m = /([\d,]+\.\d\d)\s+סה"כ ללא מע"מ/.exec(text); doc.subtotal = m ? num(m[1]) : null;
  m = /([\d,]+\.\d\d)\s+סה"כ לתשלום/.exec(text); doc.payable = m ? num(m[1]) : null;
  m = /\(([\d,]+\.\d\d)\)\s+הנחה/.exec(text); doc.discount = m ? num(m[1]) : 0;
  let last = null;
  const seen = new Set();
  for (const ln of text.split('\n')) {
    const lm = CTI_LINE.exec(ln);
    if (!lm) continue;
    const no = +lm[6];
    if (seen.has(no)) continue; // the same row printed twice
    seen.add(no);
    const total = num(lm[1]), unit = num(lm[2]), qty = num(lm[3]);
    const sd = splitDesc(lm[4]);
    const item = { no, item: lm[5], total, unit, qty, desc: sd.text, work: sd.work, patient: sd.patient, teeth: [], addon: false };
    if (ADDON.test(norm(sd.text)) || (!sd.teethTok.length && !sd.patient)) {
      item.addon = true;
      item.work = sd.text;
      item.patient = last ? last.patient : '';
      item.parent = last ? last.no : null;
      if (!last) doc.unparsed.push({ no, raw: ln.trim().replace(/\s+/g, ' '), why: 'תוספת בלי שורת מטופל מעליה' });
    } else {
      const e = expandTeeth(sd.teethTok);
      item.teeth = e.teeth;
      if (!sd.patient || !e.teeth.length || !e.ok) {
        doc.unparsed.push({ no, raw: ln.trim().replace(/\s+/g, ' '), why: !sd.patient ? 'לא זוהה שם מטופל' : !e.teeth.length ? 'לא זוהו שיניים' : 'טווח שיניים שלא ברור' });
        item.bad = true;
      } else if (e.teeth.length !== qty) item.qtyMismatch = true;
      last = item;
    }
    doc.lines.push(item);
  }
  // numbering gaps mean a row was not read
  if (doc.lines.length) {
    const max = Math.max(...doc.lines.map(l => l.no));
    for (let i = 1; i <= max; i++) if (!seen.has(i)) doc.unparsed.push({ no: i, raw: '', why: 'לא נקראה, חסרה במספור' });
  }
  return doc;
}

const PARSERS = {
  cti: { name: 'קריאטיב טים אינסטרומנטס', match: /קריאטיב טים/, parse: parseCti },
  newdent: { name: 'ניו דנט', match: /ניו דנט/, parse: null },
  smiletech: { name: 'סמייל טק', match: /סמייל טק/, parse: null },
};

function detectLab(raw) {
  const t = clean(raw);
  for (const [id, p] of Object.entries(PARSERS)) if (p.match.test(t)) return id;
  return 'unknown';
}

function parseDoc(raw) {
  const lab = detectLab(raw);
  const p = PARSERS[lab];
  // known lab without its own parser, or unknown lab: try the CTI shape, say so in the report
  const doc = parseCti(raw);
  doc.lab = lab;
  doc.labName = p ? p.name : 'מעבדה לא מזוהה';
  doc.fallback = !(p && p.parse);
  return doc;
}

/* ---------- duplicates ---------- */
function key(patient, tooth, work) {
  return [norm(patient).split(' ').sort().join(' '), tooth, norm(work)].join('|');
}

function entriesOf(doc) {
  const out = [];
  for (const l of doc.lines) {
    if (l.addon || l.bad) continue;
    for (const t of l.teeth) out.push({ key: key(l.patient, t, l.work), patient: l.patient, tooth: t, work: l.work, line: l.no, doc: doc.no, date: doc.date, lab: doc.lab });
  }
  return out;
}

// previous: array of stored docs (other than this one). Returns [{patient, tooth, work, where: [..]}]
function findDuplicates(doc, previous) {
  const mine = entriesOf(doc);
  const byKey = new Map();
  for (const e of mine) { if (!byKey.has(e.key)) byKey.set(e.key, []); byKey.get(e.key).push(e); }
  const old = new Map();
  for (const d of previous || []) for (const e of entriesOf(d)) { if (!old.has(e.key)) old.set(e.key, []); old.get(e.key).push(e); }
  const out = [];
  for (const [k, list] of byKey) {
    const before = old.get(k) || [];
    if (list.length > 1 || before.length) {
      out.push({ patient: list[0].patient, tooth: list[0].tooth, work: list[0].work, now: list.map(e => e.line), before: before.map(e => ({ doc: e.doc, date: e.date, line: e.line, lab: e.lab })) });
    }
  }
  return out;
}

/* ---------- report text ---------- */
function money(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function heDate(iso) { return iso ? iso.split('-').reverse().join('/') : 'לא ידוע'; }
// no dashes of any kind in a report: a range is written with "עד"
function noDashes(s) {
  return s.replace(/(\d)\s*[-‐-―]\s*(\d)/g, '$1 עד $2').replace(/[-‐-―]/g, ' ').replace(/ {2,}/g, ' ');
}

function buildReport(doc, dups, now) {
  const L = [];
  const pageSum = Math.round(doc.lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
  L.push('מעבדה: ' + doc.labName + (doc.fallback ? ' (פורמט שעוד לא נלמד, נקרא בתבנית כללית, כדאי לבדוק ידנית)' : ''));
  L.push('תעודת משלוח מספר ' + (doc.no || 'לא נמצא') + ' מתאריך ' + heDate(doc.date));
  const addons = doc.lines.filter(l => l.addon).length;
  L.push('נקראו ' + doc.lines.length + ' שורות, מתוכן ' + (doc.lines.length - addons) + ' שורות עבודה ו ' + addons + ' תוספות');
  L.push('');
  L.push('סכומים');
  L.push('סכום השורות לפני מע"מ: ' + money(pageSum));
  if (doc.subtotal == null) L.push('סה"כ לפני מע"מ בתעודה: לא נמצא, אי אפשר לאמת');
  else if (Math.abs(pageSum - doc.subtotal) < 0.005) L.push('סה"כ לפני מע"מ בתעודה: ' + money(doc.subtotal) + ', הסכום תואם');
  else L.push('סה"כ לפני מע"מ בתעודה: ' + money(doc.subtotal) + ', לא תואם, הפרש של ' + money(Math.abs(doc.subtotal - pageSum)) + ', ייתכן ששורה לא נקראה');
  if (doc.discount) L.push('הנחה: ' + money(doc.discount));
  if (doc.payable != null) L.push('סה"כ לתשלום כולל מע"מ: ' + money(doc.payable));
  L.push('');
  L.push('כפילויות (אותו מטופל, אותה שן, אותו סוג עבודה)');
  if (!dups.length) L.push(doc.lines.length ? 'לא נמצאו כפילויות' : 'לא נקראה אף שורה, לכן לא נבדקו כפילויות');
  for (const d of dups) {
    let s = '• ' + d.patient + ', שן ' + d.tooth + ', ' + d.work + ': ';
    const parts = [];
    if (d.now.length > 1) parts.push('מופיע ' + d.now.length + ' פעמים בתעודה הזו, בשורות ' + d.now.join(' ו '));
    else if (d.before.length) parts.push('בשורה ' + d.now[0] + ' בתעודה הזו');
    for (const b of d.before) parts.push('וגם בתעודה ' + b.doc + ' מתאריך ' + heDate(b.date) + ' שורה ' + b.line);
    L.push(s + parts.join(', '));
  }
  L.push('');
  L.push('שורות שלא הצלחתי לקרוא');
  if (!doc.unparsed.length) L.push('כל השורות נקראו');
  for (const u of doc.unparsed) L.push('• שורה ' + u.no + ': ' + u.why + (u.raw ? ' (' + u.raw + ')' : ''));
  const mm = doc.lines.filter(l => l.qtyMismatch);
  if (mm.length) {
    L.push('');
    L.push('הערה: כמות שלא תואמת למספר השיניים');
    for (const l of mm) L.push('• שורה ' + l.no + ': ' + l.patient + ', שיניים ' + l.teeth.join(' ') + ', כמות בתעודה ' + l.qty);
  }
  const d = new Date(now || Date.now());
  const title = 'בדיקת כפילויות מעבדה: ' + doc.labName + ', תעודה ' + (doc.no || '');
  return { at: isoIsrael(d), title: noDashes(title), body: noDashes(L.join('\n')) };
}

function isoIsrael(d) {
  // Israel wall clock with its real offset (+02:00 or +03:00)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const off = Math.round((wall - Math.floor(d.getTime() / 1000) * 1000) / 3600000);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+${String(off).padStart(2, '0')}:00`;
}

module.exports = { expandTeeth, expandRange, parseCti, parseDoc, detectLab, findDuplicates, buildReport, entriesOf, norm, isoIsrael, clean };
