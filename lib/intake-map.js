'use strict';
/*
  24.10.2026, stage 7: the intake questionnaire (setup/intake-form.gs, "שאלון אפיון")
  becomes an instance.json proposal. Pure functions only: no file, no network. The
  CLI is setup/intake-to-instance.js; setup/new-tenant.sh --from-intake reads the file.

  Mapping table. Question titles are copied exactly from intake-form.gs; a test
  (tests/intake-map.test.js) checks both directions, so a renamed question fails there.
  Each answer either sets something, or it goes to intakeNotes as "<question>: <answer>"
  for the operator. The customer never sees intakeNotes.

  Sets               Question (intake-form.gs)                          Answer -> effect
  -----------------  --------------------------------------------------  ------------------------------------------
  owner, welcome     איך קוראים לך?                                       any text (the name)
  nothing (privacy)  טלפון או מייל לחזרה                                  never written to the file
  biz                מה מתאר הכי טוב את מה שאתה עושה ביום יום?           own business, brand builder, several jobs
  biz                כמה לקוחות פעילים יש לך עכשיו?                        anything but "אין עדיין"
  biz                היית רוצה מסך של כסף במערכת?                          "כן, חשוב"
  screens gRemind    מה הכי נופל לך בין הכיסאות?                           לחזור לאנשים, גבייה
  screens gToday     מה הכי נופל לך בין הכיסאות?                           דדליינים
  screens gCIdeas    מה הכי נופל לך בין הכיסאות?                           רעיונות שנשכחים
  screens gToday     כשאתה מקבל משימה חדשה, מה קורה בפועל?                 רושם אבל לא חוזר, תלוי במצב רוח
  desk               אתה עובד בעיקר מול מחשב או מול טלפון?                 מחשב, שניהם באותה מידה
  computer           איזה מחשב יש לך?                                      מק (אפל) = mac, ווינדוס = win, אין לי = none
  phone              איזה טלפון יש לך?                                     אייפון = ios, אנדרואיד = android
  services           מה אתה מספק ללקוח בפועל?                             any text (profile.services)
  screens gFiles     אתה שומר את החומרים של כל לקוח במקום מסודר?           any answer but "לא שומר"
  screens gRemind    היית רוצה שהמערכת תזכיר לך לחזור ללקוח שנעלם?         כן, חשוב מאוד / כן, לפעמים
  screens gPlan      באילו רשתות אתה פעיל?                                 any answer
  screens gPlan      אתה עובד עם לוח תוכן מראש?                            כן, מתוכנן / חלקית
  screens gCIdeas    היית רוצה שהמערכת תכין לך רעיונות מראש?                כן, הרבה / כן, מעט
  bank               באיזה בנק מתנהל חשבון העסק?                           any bank (profile.bank); the bank tile
                                                                         stays hidden until Itzik approves
  screens gVoices    איך תעדיף לכתוב למערכת?                               להקליט קול
  screens gBrief     כמה עדכונים היית רוצה לקבל ביום?                      אחד מרוכז, שניים שלושה
  screens gPush      אתה רוצה התראות לטלפון?                               כן, על הכל / רק על דחוף
  tone               מה הטון שמתאים לך?                                    ענייני ויבש, ישיר בלי לרכך, תלוי בנושא = formal;
                                                                         חברי = casual
  modules morning    any free text (scanned, all questions)               Morning / מורנינג / Green Invoice
  suggestedTier      any free text (scanned, all questions)               "20 דולר", "$20" or "Pro" = pro20 suggestion

  Always on: screens gTasks and gNotes (the same default as new-tenant.sh without screens).
  gRemote is added when the customer works at a computer that is not "אין לי מחשב".
  gBiz is added when biz is true. Everything else: a note.

  Not in the form, so never guessed: business name (profile.business), opening hours
  (profile.hours). Both are left empty and noted; the customer fills them on the
  "מה אני יודע על העסק שלך" screen. The owner and page title come from the name.

  Why intakeNotes and not notes: lib/instance.js uses `notes` for its own load notes.
*/

// The screen ids in the order the page lists them (must all exist in build.js TENANT_TILES).
const SCREEN_ORDER = ['gToday', 'gTasks', 'gNotes', 'gRemind', 'gCIdeas', 'gPlan', 'gVoices',
  'gFiles', 'gRemote', 'gBiz', 'gPush', 'gBrief'];
const ALWAYS = ['gTasks', 'gNotes'];

// Free text answers are scanned for these. A Morning or Green Invoice mention turns the
// morning module on; a 20 dollar plan mention suggests the pro20 profile (setup/profiles).
const MORNING_RE = /מורנינג|morning|גרין\s*אינ|green\s*invoice/i;
const PRO20_RE = /20\s*דולר|\$\s*20|20\s*\$|\bpro\b/i;

const TIMESTAMP_RE = /^(timestamp|חותמת זמן)$/i;

/*
  One rule per question. choices: answer -> effect. free: effect for any other text
  (used when the answer is not in choices). private: never written, only noted.
  A question with no choices and no free effect is noted whatever the answer.
  An effect is an object: screens, biz ('work' | 'clients' | 'money'), desk, computer,
  phone, tone, services, owner, bank. An empty effect {} counts as "no effect", so the
  answer is noted.
*/
const RULES = [
  { title: 'איך קוראים לך?', free: { owner: true } },
  { title: 'טלפון או מייל לחזרה', private: true },
  { title: 'מה מתאר הכי טוב את מה שאתה עושה ביום יום?', choices: {
    'עסק עצמאי שלי': { biz: 'work' },
    'מלווה ובונה מותגים ללקוחות': { biz: 'work' },
    'כמה דברים במקביל': { biz: 'work' } } },
  { title: 'כמה זמן אתה בתחום הזה?' },
  { title: 'אתה עובד לבד או עם אנשים?' },
  { title: 'מאיפה מגיעים אליך הלקוחות היום?' },
  { title: 'כמה לקוחות פעילים יש לך עכשיו?', choices: {
    'אחד עד שלושה': { biz: 'clients' },
    'ארבעה עד עשרה': { biz: 'clients' },
    'יותר מעשרה': { biz: 'clients' } } },
  { title: 'מה הדבר שהכי גוזל לך זמן?' },
  { title: 'איך אתה עוקב היום אחרי מה שצריך לעשות?' },
  { title: 'מה הכי נופל לך בין הכיסאות?', choices: {
    'לחזור לאנשים': { screens: ['gRemind'] },
    'גבייה': { screens: ['gRemind'] },
    'דדליינים': { screens: ['gToday'] },
    'רעיונות שנשכחים': { screens: ['gCIdeas'] } } },
  { title: 'באיזו שעה ביום אתה הכי פרודוקטיבי?' },
  { title: 'כמה ימים בשבוע אתה עובד?' },
  { title: 'אתה עובד בעיקר מול מחשב או מול טלפון?', choices: {
    'מחשב': { desk: true },
    'שניהם באותה מידה': { desk: true } } },
  { title: 'איזה מחשב יש לך?', choices: {
    'מק (אפל)': { computer: 'mac' },
    'ווינדוס': { computer: 'win' },
    'אין לי מחשב': { computer: null } } },
  { title: 'איזה טלפון יש לך?', choices: {
    'אייפון': { phone: 'ios' },
    'אנדרואיד (סמסונג, שיאומי וכו׳)': { phone: 'android' } } },
  { title: 'כשאתה מקבל משימה חדשה, מה קורה בפועל?', choices: {
    'רושם אבל לא חוזר': { screens: ['gToday'] },
    'תלוי במצב רוח': { screens: ['gToday'] } } },
  { title: 'מה עושה לך יום טוב בעבודה?' },
  { title: 'אתה מנהל מותג של לקוח מההתחלה או נכנס לקיים?' },
  { title: 'מה אתה מספק ללקוח בפועל?', free: { services: true } },
  { title: 'כמה זמן נמשך ליווי טיפוסי?' },
  { title: 'איך אתה מתעד מה סוכם עם לקוח?' },
  { title: 'מה הכי מתסכל אצל לקוחות?' },
  { title: 'אתה שומר את החומרים של כל לקוח במקום מסודר?', choices: {
    'כן, לכל אחד תיקייה': { screens: ['gFiles'] },
    'הכל ביחד': { screens: ['gFiles'] },
    'מפוזר': { screens: ['gFiles'] } } },
  { title: 'היית רוצה שהמערכת תזכיר לך לחזור ללקוח שנעלם?', choices: {
    'כן, חשוב מאוד': { screens: ['gRemind'] },
    'כן, לפעמים': { screens: ['gRemind'] } } },
  { title: 'באילו רשתות אתה פעיל?', free: { screens: ['gPlan'] } },
  { title: 'כל כמה זמן אתה מעלה תוכן?' },
  { title: 'מה הכי קשה בתוכן?' },
  { title: 'אתה עובד עם לוח תוכן מראש?', choices: {
    'כן, מתוכנן': { screens: ['gPlan'] },
    'חלקית': { screens: ['gPlan'] } } },
  { title: 'מי כותב את הטקסטים?' },
  { title: 'היית רוצה שהמערכת תכין לך רעיונות מראש?', choices: {
    'כן, הרבה': { screens: ['gCIdeas'] },
    'כן, מעט': { screens: ['gCIdeas'] } } },
  { title: 'מה מודד אצלך הצלחה בתוכן?' },
  { title: 'איך אתה מוציא חשבוניות?' },
  { title: 'אתה יודע בכל רגע כמה חייבים לך?' },
  { title: 'מה קורה כשלקוח לא משלם בזמן?' },
  { title: 'היית רוצה מסך של כסף במערכת?', choices: {
    'כן, חשוב': { biz: 'money' } } },
  { title: 'אתה שומר קבלות והוצאות באופן מסודר?' },
  { title: 'באיזה בנק מתנהל חשבון העסק?', choices: {
    'אין חשבון עסקי נפרד': {} }, free: { bank: true } },
  { title: 'איך תעדיף לכתוב למערכת?', choices: {
    'להקליט קול': { screens: ['gVoices'] } } },
  { title: 'למה המוניטור ישמש אותך?', choices: {
    'רק לצרכי העסק (המוניטור יכול לשמש גם עובד, אך רק לצרכי העסק)': {},
    'גם לניהול החיים הפרטיים שלי': {} } },
  { title: 'כמה עדכונים היית רוצה לקבל ביום?', choices: {
    'אחד מרוכז': { screens: ['gBrief'] },
    'שניים שלושה': { screens: ['gBrief'] } } },
  { title: 'באיזו שעה נוח לקבל עדכון יומי?' },
  { title: 'אתה רוצה התראות לטלפון?', choices: {
    'כן, על הכל': { screens: ['gPush'] },
    'רק על דחוף': { screens: ['gPush'] } } },
  { title: 'מה יגרום לך להפסיק להשתמש במערכת?' },
  { title: 'אתה מעדיף תשובות קצרות או מפורטות?' },
  { title: 'מה הטון שמתאים לך?', choices: {
    'ענייני ויבש': { tone: 'formal' },
    'חברי': { tone: 'casual' },
    'ישיר בלי לרכך': { tone: 'formal' },
    'תלוי בנושא': { tone: 'formal' } } },
  { title: 'מה אתה עושה כשאתה לא עובד?' },
  { title: 'יש לך משהו שאתה לומד עכשיו?' },
  { title: 'מה הדבר שהכי היית רוצה לשפר בעצמך בעבודה?' },
  { title: 'מה מלחיץ אותך הכי הרבה?' },
  { title: 'איפה אתה רואה את עצמך בעוד שנה?' },
  { title: 'מה היית רוצה שהמערכת תעשה בשבילך שאף אחד לא עושה היום?' },
  { title: 'יש משהו שלא שאלנו ואתה חושב שחשוב שנדע?' },
];

// Every answer string the table names, for the test that checks them against the form.
function choiceStrings() {
  const out = [];
  for (const r of RULES) for (const k of Object.keys(r.choices || {})) out.push(k);
  return out;
}

function clean(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/*
  Google Forms exports RFC 4180 CSV: quoted fields may hold commas and line breaks,
  and a quote inside a quoted field is doubled. A leading byte order mark is dropped.
*/
function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/*
  The answers of one response. row is 1 based over the responses (the first
  response is 1); the default is the last one. The timestamp column is not an answer.
*/
function answersFromCsv(text, row) {
  const rows = parseCsv(text).filter((r) => r.some((c) => clean(c) !== ''));
  if (rows.length < 2) throw new Error('אין תשובות בקובץ');
  const header = rows[0].map(clean), data = rows.slice(1);
  const n = row ? Number(row) : data.length;
  if (!Number.isInteger(n) || n < 1 || n > data.length) {
    throw new Error('אין תשובה מספר ' + row + ', יש ' + data.length + ' תשובות');
  }
  const line = data[n - 1];
  const answers = {};
  header.forEach((h, i) => {
    if (h && !TIMESTAMP_RE.test(h)) answers[h] = clean(line[i]);
  });
  return { answers, row: n, of: data.length };
}

function pick(answer, rule) {
  if (rule.choices && Object.prototype.hasOwnProperty.call(rule.choices, answer)) return rule.choices[answer];
  if (rule.free) return rule.free;
  return null;
}

function mapIntake(answers) {
  const notes = [];
  const S = {
    owner: '', bizWork: false, bizClients: false, bizMoney: false,
    screens: new Set(), desk: false, computer: null, phone: null,
    tone: 'formal', services: [], bank: '',
  };
  const seen = new Set();
  const src = answers && typeof answers === 'object' ? answers : {};

  for (const rule of RULES) {
    const a = clean(src[rule.title]);
    seen.add(rule.title);
    if (!a) continue;
    if (rule.private) { notes.push(rule.title + ': לא נכתב לקובץ, נשאר בטופס'); continue; }
    const eff = pick(a, rule);
    if (!eff || !Object.keys(eff).length) { notes.push(rule.title + ': ' + a); continue; }
    if (eff.owner) S.owner = a;
    if (eff.services) S.services.push(a);
    if (eff.bank) S.bank = a;
    if (eff.tone) S.tone = eff.tone;
    if (eff.desk) S.desk = true;
    if ('computer' in eff) S.computer = eff.computer;
    if ('phone' in eff) S.phone = eff.phone;
    if (eff.biz === 'work') S.bizWork = true;
    if (eff.biz === 'clients') S.bizClients = true;
    if (eff.biz === 'money') S.bizMoney = true;
    for (const s of eff.screens || []) S.screens.add(s);
  }

  // Answers the table does not know (a renamed question, an extra column): kept for the operator.
  for (const k of Object.keys(src)) {
    if (seen.has(k) || TIMESTAMP_RE.test(k) || !clean(src[k])) continue;
    notes.push('לא בטופס המיפוי, ' + k + ': ' + clean(src[k]));
  }

  const everything = Object.values(src).map(clean).join('\n');
  const biz = S.bizWork || S.bizClients || S.bizMoney;
  const morning = MORNING_RE.test(everything);
  const tier = PRO20_RE.test(everything) ? 'pro20' : '';
  if (biz) S.screens.add('gBiz');
  if (S.desk && (S.computer === 'mac' || S.computer === 'win')) S.screens.add('gRemote');
  for (const s of ALWAYS) S.screens.add(s);
  const screens = SCREEN_ORDER.filter((s) => S.screens.has(s));
  const modules = [];
  if (biz) modules.push('biz');
  if (morning) modules.push('morning');

  if (!S.owner) notes.push('איך קוראים לך?: לא נענה, השם חסר');
  if (morning) notes.push('ניתן לזהות מורנינג או גרין אינבוי בתשובות: לבדוק מה מחברים');
  if (tier) notes.push('ציין מנוי של 20 דולר בתשובות: להציע את הפרופיל pro20 (setup/profiles/pro20.env)');
  notes.push('לא נשאל בשאלון: שם העסק ושעות הפעילות. להשלים בשיחה או במסך "מה אני יודע על העסק שלך"');

  const first = S.owner.split(/\s+/)[0] || '';
  return {
    owner: S.owner,
    pageTitle: S.owner ? 'המוניטור של ' + S.owner : 'המוניטור',
    welcome: (first ? 'שלום ' + first + ', ' : 'שלום, ') + 'המוניטור שלך מוכן. המסכים נבנו לפי השאלון שמילאת. '
      + 'מה שלא נכון או חסר, אפשר לתקן במסך "מה אני יודע על העסק שלך" בהגדרות.',
    screens,
    biz,
    computer: S.computer,
    phone: S.phone,
    profile: {
      business: '',
      hours: '',
      services: S.services,
      tone: S.tone,
      modules,
      bank: S.bank,
      suggestedTier: tier,
    },
    intakeNotes: notes,
  };
}

module.exports = { mapIntake, parseCsv, answersFromCsv, choiceStrings, RULES, SCREEN_ORDER, MORNING_RE, PRO20_RE };
