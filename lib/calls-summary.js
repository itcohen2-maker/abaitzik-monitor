'use strict';
/*
  24.11.2026, the calls archive, the summary. A finished call or meeting with a transcript gets one fixed summary
  from Haiku (about, decided, tasks with a date, topics from the customer's own list). Tasks with a date go to
  data/cal/add/ in the exact format of lib/meet-push.js, so cal-sync.js puts them in his Google Calendar.
  llm is passed in (lib/sales-train.js llm(model, system, input, ms)); a failure never throws out of summarize():
  it counts a try, and after 3 tries the call stays as a transcript only (status failed).
  No content in logs: this file logs nothing.
  Spec: docs/superpowers/specs/2026-11-24-calls-archive-design.md
*/
const fs = require('fs');
const path = require('path');
const Store = require('./calls-store.js');

const MAX_TOPICS = 10, MAX_TASKS = 10, MAX_CHARS = 40000, MAX_TRIES = 3, MIN_SEC = 20;

function SYSTEM(topics) {
  const list = (topics || []).length ? (topics || []).map((t) => '"' + t + '"').join(', ') : '(אין נושאים, החזר מערך ריק)';
  return [
    'אתה מסכם שיחות ופגישות עסקיות בעברית עבור בעל עסק.',
    'קיבלת תמלול. החזר אך ורק JSON תקין, בלי טקסט לפני או אחרי, בצורה המדויקת הזאת:',
    '{"about": "עד שני משפטים קצרים", "decided": ["..."], "tasks": [{"text": "...", "due": "YYYY-MM-DD"}], "topics": ["..."]}',
    'כללים:',
    '- about: עד שני משפטים קצרים על מה השיחה. בלי מקפים ובלי קווים מפרידים בטקסט.',
    '- decided: מה הוחלט בפועל. מערך ריק אם לא הוחלט כלום.',
    '- tasks: משימות שבעל העסק צריך לעשות, עד 10. due הוא תאריך בפורמט YYYY-MM-DD, מחושב ביחס לתאריך השיחה שבקלט, לפי שעון ישראל (Asia/Jerusalem). אם לא נאמר מתי, due הוא מחרוזת ריקה.',
    '- topics: רק מתוך הרשימה הזאת, בדיוק באותו כתיב: ' + list + '. נושא שלא מופיע ברשימה לא נכתב.',
    '- אל תמציא עובדות, שמות, מספרים או תאריכים שלא נאמרו בתמלול.',
  ].join('\n');
}

function ilDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
}
function ilTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

function input(item) {
  const it = item || {};
  const L = [];
  L.push('תאריך השיחה (שעון ישראל): ' + ilDate(it.at) + ' ' + ilTime(it.at));
  L.push('סוג: ' + (it.kind === 'meet' ? 'פגישה' : 'שיחת טלפון' + (it.direction === 'out' ? ' יוצאת' : it.direction === 'in' ? ' נכנסת' : '')));
  const who = it.name || it.number || '';
  if (who) L.push('עם: ' + who);
  if (it.durationSec) L.push('משך בשניות: ' + it.durationSec);
  L.push('');
  L.push('תמלול:');
  const segs = Array.isArray(it.segments) ? it.segments.filter((s) => s && s.text) : [];
  const body = segs.length ? segs.map((s) => (s.speaker ? s.speaker + ': ' : '') + s.text).join('\n') : String(it.transcript || '');
  return (L.join('\n') + '\n' + body).slice(0, MAX_CHARS);
}

function needs(item) {
  if (!item) return false;
  const st = item.status;
  if (!(st === 'new' || (st === 'failed' && (item.tries || 0) < MAX_TRIES))) return false;
  if (!String(item.transcript || '').trim()) return false;
  if (item.kind !== 'meet' && !((item.durationSec || 0) >= MIN_SEC)) return false;
  return true;
}

function strs(a) { return (Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()); }

function parse(text, topics) {
  const s = String(text == null ? '' : text);
  const a = s.indexOf('{');
  if (a < 0) return null;
  // the first {...} block: from the first "{", the first closing brace that gives valid JSON
  let o = null;
  for (let b = s.indexOf('}', a); b > -1 && !o; b = s.indexOf('}', b + 1)) {
    try { const v = JSON.parse(s.slice(a, b + 1)); if (v && typeof v === 'object' && !Array.isArray(v)) o = v; } catch (e) {}
  }
  if (!o) return null;
  const list = topics || [];
  const tasks = (Array.isArray(o.tasks) ? o.tasks : []).map((t) => {
    if (typeof t === 'string') return { text: t.trim(), due: '' };
    if (!t || typeof t.text !== 'string') return null;
    const due = typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due.trim()) ? t.due.trim() : '';
    return { text: t.text.trim(), due };
  }).filter((t) => t && t.text).slice(0, MAX_TASKS);
  return {
    about: typeof o.about === 'string' ? o.about.trim() : '',
    decided: strs(o.decided),
    tasks,
    topics: strs(o.topics).filter((t, i, arr) => list.indexOf(t) > -1 && arr.indexOf(t) === i),
  };
}

function topics(dataPath) {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(dataPath, 'calls', 'topics.json'), 'utf8'));
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch (e) { return []; }
}
function setTopics(dataPath, list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((t) => {
    const v = String(t == null ? '' : t).trim().slice(0, 30).trim();
    if (v && out.indexOf(v) < 0 && out.length < MAX_TOPICS) out.push(v);
  });
  const dir = path.join(dataPath, 'calls');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'topics.json'), tmp = f + '.tmp' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 1), { mode: 0o664 });
  fs.renameSync(tmp, f);
  return { ok: true, topics: out };
}

async function summarize(dataPath, item, llm, now) {
  let it = item;
  try {
    const tp = topics(dataPath);
    let s = null;
    try { s = parse(await llm('haiku', SYSTEM(tp), input(it), 90000), tp); } catch (e) { s = null; }
    it = Object.assign({}, it);
    if (s) {
      it.summary = s; it.topics = s.topics; it.status = 'summarized';
    } else {
      it.tries = (it.tries || 0) + 1;
      it.status = it.tries >= MAX_TRIES ? 'failed' : 'new';
    }
    Store.write(dataPath, it);
    return { ok: !!s, item: it };
  } catch (e) {
    return { ok: false, item: it };
  }
}

// Same file format as lib/meet-push.js write(): { title, date, note, at }, one all-day item per dated task.
function calTasks(dataPath, item) {
  const tasks = (item && item.summary && item.summary.tasks) || [];
  const ad = path.join(dataPath, 'cal', 'add');
  const idPart = String(item.id || 'c').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  const at = new Date().toISOString();
  let n = 0;
  tasks.slice(0, MAX_TASKS).forEach((t, i) => {
    if (!t || !t.text || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.due || ''))) return;
    const name = idPart + '-' + i + '.json';
    if (fs.existsSync(path.join(ad, name)) || fs.existsSync(path.join(ad, 'done', name))) return;
    fs.mkdirSync(ad, { recursive: true });
    fs.writeFileSync(path.join(ad, name), JSON.stringify({ title: '✅ ' + String(t.text).slice(0, 140), date: t.due, note: (item.kind === 'meet' ? 'משימה מפגישה' : 'משימה משיחה') + ' (ארכיון שיחות)', at }, null, 1), { mode: 0o664 });
    n++;
  });
  return n;
}

module.exports = { SYSTEM, input, needs, parse, summarize, calTasks, topics, setTopics };
