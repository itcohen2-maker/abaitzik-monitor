'use strict';
/*
  The monthly report, three pages. Plain code, no model.

  6.11.2026, after reading Revora's code: Noam sends a three page PDF on the
  1st. Itzik: "תמשיך". The monitor already holds the month: leads (biz and the
  contacts from the networks), quotes with their open and sign times, forms and
  documents for signature. This file only counts; monthly-report.js draws it.

    page 1  מה היה החודש     what came in and what closed
    page 2  איפה זה נתקע     forgotten leads, quotes opened and not signed
    page 3  שלושה צעדים      three moves for next month, from the numbers

  Missing data is shown as missing, never as zero (Revora's rule, a good one).
  No bank, no debts, no personal appointments: business only.
*/
const fs = require('fs');
const path = require('path');

const DAY = 24 * 3600e3;
const TZ = 'Asia/Jerusalem';
const LEAD_CLOSED = /^(נסגר|אבד|done|טופל|סגור|לא רלוונטי|בוטל)$/;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function dir(p) { try { return fs.readdirSync(p); } catch (e) { return null; } }
function dayOf(ms) { return new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ }); }
function monthOf(v) { const ms = Date.parse(v); return isNaN(ms) ? '' : dayOf(ms).slice(0, 7); }
const NET = { tiktok: 'טיקטוק', facebook: 'פייסבוק', instagram: 'אינסטגרם', linkedin: 'לינקדין', youtube: 'יוטיוב', whatsapp: 'וואטסאפ', messenger: 'מסנג׳ר', site: 'האתר', other: 'אחר', email: 'מייל', mail: 'מייל' };
function net(v) { const k = String(v || '').trim(); return NET[k.toLowerCase()] || k || 'אחר'; }
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
function monthName(ym) { const [y, m] = ym.split('-'); return MONTHS[Number(m) - 1] + ' ' + y; }
function prevMonth(ym) { let [y, m] = ym.split('-').map(Number); m--; if (!m) { m = 12; y--; } return y + '-' + String(m).padStart(2, '0'); }

function biz(dataPath) {
  const d = path.join(dataPath, 'biz', 'biz'), f = dir(d);
  if (!f) return null;
  return f.filter((x) => x.endsWith('.json')).map((x) => readJson(path.join(d, x), null)).filter((r) => r && typeof r === 'object');
}
function contacts(dataPath) {
  const d = path.join(dataPath, 'contacts', 'contacts'), f = dir(d);
  if (!f) return null;
  return f.filter((x) => x.endsWith('.json')).map((x) => readJson(path.join(d, x), null)).filter((r) => r && r.name);
}
// Quotes (sign.js): value is the chosen plan's monthly price plus setup.
function quotes(dataPath) {
  const d = path.join(dataPath, 'sign'), f = dir(d);
  if (!f) return null;
  return f.filter((x) => x.endsWith('.def.json')).map((x) => {
    const tok = x.replace(/\.def\.json$/, '');
    const def = readJson(path.join(d, x), {}), st = readJson(path.join(d, tok + '.json'), {});
    const plan = (def.plans || []).find((p) => p.id === st.plan);
    const sentAt = def.sentAt || (fs.existsSync(path.join(d, x)) ? fs.statSync(path.join(d, x)).mtime.toISOString() : null);
    return { tok, client: def.client || def.clientBiz || '', no: def.quoteNo || '', sentAt, openedAt: st.openedAt || null,
      signedAt: st.signedAt || null, archived: !!def.archived,
      monthly: plan ? num(plan.price) : 0, setup: plan ? num(plan.setup) : 0 };
  });
}
function forms(dataPath) {
  const d = path.join(dataPath, 'forms'), f = dir(d);
  if (!f) return null;
  return f.filter((x) => x.endsWith('.def.json')).map((x) => {
    const tok = x.replace(/\.def\.json$/, '');
    const def = readJson(path.join(d, x), {}), st = readJson(path.join(d, tok + '.json'), {});
    return { title: def.title || '', client: def.client || '', sentAt: def.sentAt || st.openedAt || null, submittedAt: st.submittedAt || null, archived: !!def.archived };
  });
}

/*
  collect(dataPath, ym, now) -> everything the three pages need for month ym.
  "now" is the moment the report is made (the 1st of the next month), so
  "stuck" is measured to the end of the month, not to some later day.
*/
function collect(dataPath, ym, now) {
  const t = now == null ? Date.now() : Number(now);
  const B = biz(dataPath), C = contacts(dataPath), Q = quotes(dataPath), F = forms(dataPath);
  const inM = (v) => monthOf(v) === ym;
  const r = { ym, name: monthName(ym), prev: prevMonth(ym), missing: [] };

  // Leads: biz leads and network contacts that arrived this month.
  if (!B && !C) r.missing.push('לידים');
  const bizLeads = (B || []).filter((x) => x.kind === 'lead' || x.kind === 'customer');
  r.leadsIn = bizLeads.filter((x) => inM(x.at)).length + (C || []).filter((x) => inM(x.at)).length;
  r.leadsPrev = bizLeads.filter((x) => monthOf(x.at) === r.prev).length + (C || []).filter((x) => monthOf(x.at) === r.prev).length;
  const src = {};
  bizLeads.filter((x) => inM(x.at)).forEach((x) => { const k = net(x.source); src[k] = (src[k] || 0) + 1; });
  (C || []).filter((x) => inM(x.at)).forEach((x) => { const k = net(x.network || x.source); src[k] = (src[k] || 0) + 1; });
  r.sources = Object.entries(src).sort((a, b) => b[1] - a[1]);
  r.newCustomers = (B || []).filter((x) => x.kind === 'customer' && inM(x.updatedAt || x.at)).map((x) => x.name);

  // Quotes this month.
  if (!Q) r.missing.push('הצעות מחיר');
  const live = (Q || []).filter((q) => !q.archived);
  r.quotesSent = live.filter((q) => inM(q.sentAt)).length;
  const signed = (Q || []).filter((q) => inM(q.signedAt));
  r.quotesSigned = signed.map((q) => ({ client: q.client, monthly: q.monthly, setup: q.setup }));
  r.signedMonthly = signed.reduce((n, q) => n + q.monthly, 0);
  r.signedSetup = signed.reduce((n, q) => n + q.setup, 0);

  // Forms.
  if (!F) r.missing.push('טפסים');
  r.formsFilled = (F || []).filter((f) => inM(f.submittedAt)).length;

  // Page 2: where it got stuck, as of now.
  const touched = (x) => Date.parse(x.updatedAt || x.at);
  r.forgotten = bizLeads.filter((x) => x.kind === 'lead' && !LEAD_CLOSED.test(String(x.status || '').trim()) && !(touched(x) > t - 7 * DAY))
    .map((x) => ({ name: x.name || '', days: isNaN(touched(x)) ? null : Math.floor((t - touched(x)) / DAY) }))
    .concat((C || []).filter((x) => !LEAD_CLOSED.test(String(x.status || '').trim()) && !(touched(x) > t - 7 * DAY) && t - Date.parse(x.at) < 45 * DAY)
      .map((x) => ({ name: x.name, days: Math.floor((t - touched(x)) / DAY) })))
    .sort((a, b) => (b.days || 0) - (a.days || 0));
  r.openedNotSigned = live.filter((q) => q.openedAt && !q.signedAt).map((q) => ({ client: q.client, days: Math.floor((t - Date.parse(q.openedAt)) / DAY) }));
  r.sentNotOpened = live.filter((q) => q.sentAt && !q.openedAt && !q.signedAt).map((q) => ({ client: q.client, days: Math.floor((t - Date.parse(q.sentAt)) / DAY) }));
  r.formsWaiting = (F || []).filter((f) => !f.archived && f.sentAt && !f.submittedAt).map((f) => ({ title: f.title, client: f.client }));

  r.steps = steps(r);
  return r;
}

// Three moves, from the numbers, most money-near first.
function steps(r) {
  const s = [];
  if (r.openedNotSigned.length) {
    const q = r.openedNotSigned[0];
    s.push((q.client || 'לקוח') + ' פתח את ההצעה לפני ' + q.days + ' ימים ולא חתם. להתקשר אליו השבוע ולשאול מה עוצר אותו.');
  }
  if (r.forgotten.length) {
    s.push(r.forgotten.length === 1 ? 'לחזור ל' + r.forgotten[0].name + ', הוא מחכה בלי מענה.'
      : r.forgotten.length + ' לידים מחכים בלי מגע, הראשון ' + r.forgotten[0].name + '. לעבור עליהם ביום ראשון, עשר דקות לכל אחד.');
  }
  if (r.sentNotOpened.length) s.push('ההצעה ל' + (r.sentNotOpened[0].client || 'לקוח') + ' עוד לא נפתחה. לשלוח לו אותה שוב בוואטסאפ, עם משפט אישי.');
  if (r.sources.length && s.length < 3) s.push('רוב הלידים הגיעו מ' + r.sources[0][0] + '. לשים שם את רוב הזמן של החודש הבא.');
  if (r.leadsIn < r.leadsPrev && s.length < 3) s.push('נכנסו פחות לידים מבחודש שעבר (' + r.leadsIn + ' מול ' + r.leadsPrev + '). להעלות השבוע פוסט אחד לרשת שהביאה הכי הרבה.');
  if (r.formsWaiting.length && s.length < 3) s.push('הטופס "' + r.formsWaiting[0].title + '" עוד לא מולא. תזכורת קצרה ללקוח.');
  if (s.length < 3) s.push('לבקש מלקוח מרוצה המלצה קצרה, ולשים אותה באתר.');
  return s.slice(0, 3);
}

module.exports = { collect, steps, monthName, prevMonth, dayOf };
