'use strict';
/*
  21.11.2026, Itzik: a campaign taste. One full campaign questionnaire (build.js campQuiz, sent to the chat as
  "קמפיין: ... (שאלון)") with its images, once per customer, the trial included (plans trial, solo and pro).
  The second one gets one line: the business package Small, with its price + מע״מ and its actions.
  21.11.2026 security review: the counter is the bridge's own file, DATA/taste/<tenant>.json, never the customer's folder.
  It is created with O_EXCL (a symlink or an existing file is never followed or overwritten). A counter that can not be
  read or written refuses the questionnaire. Not enforced here: the two images (they arrive as files).
*/
const fs = require('fs');
const path = require('path');
const P = require('./plan.js');

// 21.11.2026 (third review): the campaign taste is OFF. One constant: while false, no tenant is gated or counted for it,
// and the page does not show the campaign tile to trade customers (build.js). Switch it back only with a new review.
const TASTE_ON = false;
const TASTE_PLANS = ['trial', 'solo', 'pro'];

function applies(plan) { return TASTE_PLANS.indexOf(plan) > -1; }
function isQuestionnaire(text) { return /^\s*קמפיין:/.test(String(text || '')) && /\(שאלון\)/.test(String(text || '')); }
function offerLine() {
  const s = P.PACKAGES.small;
  return 'הקמפיין הראשון והשאלון המלא כלולים פעם אחת לכל לקוח. להמשך קמפיינים: חבילת ' + s.label + ' ב '
    + s.price + ' ₪ לחודש + מע״מ, שכוללת ' + s.actions + ' פעולות בחודש.';
}
function refuseLine() { return 'השאלון לא נפתח כרגע. נסה שוב בעוד כמה דקות, או כתוב לנו.'; }

// The counter file: a regular file in DATA/taste. Anything else (a symlink, a folder) is refused, never followed.
function counterFile(DATA, tenant) {
  if (!/^[a-z0-9-]+$/.test(String(tenant || ''))) throw new Error('bad tenant');
  return path.join(DATA, 'taste', tenant + '.json');
}
function used(DATA, tenant) {
  const f = counterFile(DATA, tenant);
  let st = null;
  try { st = fs.lstatSync(f); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  if (!st.isFile()) throw new Error('counter is not a regular file');
  return !!JSON.parse(fs.readFileSync(f, 'utf8')).at;
}
/*
  pass: true when the message may go on to the worker. The first questionnaire is marked (O_EXCL) and passes
  ({marked: true}). A second one does not pass and carries the line. A counter that fails refuses: {pass:false, line}.
*/
function gate(DATA, tenant, plan, text, now, on) {
  if (!(on === undefined ? TASTE_ON : on)) return { pass: true };
  if (!applies(plan) || !isQuestionnaire(text)) return { pass: true };
  try {
    if (used(DATA, tenant)) return { pass: false, line: offerLine() };
    fs.mkdirSync(path.join(DATA, 'taste'), { recursive: true });
    const fd = fs.openSync(counterFile(DATA, tenant), 'wx', 0o600);
    try { fs.writeSync(fd, JSON.stringify({ at: new Date(now == null ? Date.now() : now).toISOString() })); } finally { fs.closeSync(fd); }
    return { pass: true, marked: true };
  } catch (e) {
    if (e.code === 'EEXIST') return { pass: false, line: offerLine() };
    return { pass: false, line: refuseLine(), error: e.message };
  }
}

module.exports = { TASTE_ON, TASTE_PLANS, applies, isQuestionnaire, offerLine, gate };
