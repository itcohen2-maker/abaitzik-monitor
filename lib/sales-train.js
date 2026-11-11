'use strict';
/*
  Sales training on WhatsApp: the monitor plays the customer, a score at the end.

  6.11.2026, from Revora's code (Noam's sales mode: role play and a scorecard
  against a rubric). Itzik: "כן". The queue answers in about a minute and a half,
  too slow for a conversation, so this talks to Haiku directly (about 3 seconds,
  claude -p from a neutral folder, no tools), and the score is written by
  Sonnet. Nothing here touches the client list or sends anything to anyone.

    "אימון מכירות"                    start, a customer of this business
    "אימון מכירות: לקוח שאומר שיקר"  start with that scenario
    any text or voice note           the next line of the seller
    "סיימנו" / "תן ציון"              the score, and the training ends
    "עצור אימון"                      ends with no score
  Idle 30 minutes: the training is dropped.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const IDLE_MS = 30 * 60e3;
const START = /^\s*(?:אימון מכירות|תאמן אותי|בוא נתאמן|סימולציית מכירה)\s*(?:[:,.\-]\s*(.*))?$/s;
const END = /^\s*(?:סיימנו|סיום אימון|תן ציון|תני ציון|מה הציון|זהו סיימנו)[.!]*\s*$/;
const STOP = /^\s*(?:עצור אימון|בטל אימון|צא מהאימון)[.!]*\s*$/;

function startOf(t) { const m = String(t || '').match(START); return m ? { scenario: (m[1] || '').trim() } : null; }
const isEnd = (t) => END.test(String(t || ''));
const isStop = (t) => STOP.test(String(t || ''));
function active(tr, now) { return !!(tr && tr.turns && (now || Date.now()) - tr.last < IDLE_MS); }

function llm(model, system, input, ms, env) {
  return new Promise((ok, no) => {
    const args = ['-p', '--model', model, '--output-format', 'text', '--system-prompt', system, '--disallowedTools',
      'Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Task', 'Agent'];
    const child = spawn('claude', args, { cwd: os.tmpdir(), env: env || process.env });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); no(new Error('timeout')); }, ms || 90000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(timer); return code ? no(new Error('claude ' + code + ' ' + err.slice(0, 200))) : ok(out.trim()); });
    child.stdin.end(input, 'utf8');
  });
}

function script(tr) {
  return tr.turns.map((x) => (x.who === 'me' ? 'מוכר: ' : 'לקוח: ') + x.t).join('\n');
}

function customerSystem(tr) {
  return [
    'אתה משחק לקוח ישראלי בשיחת מכירה, כדי שבעל עסק יתאמן. אתה לא עוזר ולא מאמן, רק הלקוח.',
    'העסק של המוכר: ' + (tr.business || 'עסק קטן בישראל') + '.',
    'התרחיש: ' + (tr.scenario || 'לקוח שהתעניין, קצת חשדן, עם תקציב מוגבל ומעט זמן.'),
    'דבר עברית מדוברת וטבעית, משפט או שניים בכל פעם, כמו בוואטסאפ או בטלפון. בלי מקפים, בלי אימוג׳י, בלי רשימות.',
    'העלה התנגדויות אמיתיות לאורך השיחה (מחיר, זמן, אמון, "אני צריך לחשוב", "יש לי כבר מישהו"), אחת בכל פעם.',
    'אל תתרצה מהר. אם המוכר שואל שאלות טובות, מקשיב ומחבר את ההצעה לצורך שלך, התרכך בהדרגה. אם הוא לוחץ או מדבר על עצמו, התרחק.',
    'אל תמציא עובדות על העסק של המוכר: לא סעיפים בתנאים, לא מספרי ימים, לא מחירים ולא ספקים שלא נאמרו בשיחה או בתיאור העסק. אם משהו מעניין אותך, שאל עליו.',
    'אל תצא מהדמות, ואל תכתוב "לקוח:" לפני התשובה.',
  ].join('\n');
}

const RUBRIC = ['פתיחה ויצירת קשר', 'שאלות לבירור הצורך', 'הקשבה ושיקוף', 'חיבור ההצעה לצורך', 'טיפול בהתנגדויות', 'סגירה וצעד הבא'];

function scoreSystem() {
  return [
    'אתה מאמן מכירות ישראלי, ישיר וחם. קיבלת תמליל של אימון: המוכר מול לקוח מדומה.',
    'תן ציון לכל אחד מששת הנושאים, 0 עד 10: ' + RUBRIC.join(', ') + '. הציון הכולל מ 0 עד 100 הוא סכום הנושאים כפול 100 חלקי 60, מעוגל.',
    'הפורמט, בעברית, בלי מקפים ובלי טבלאות:',
    'שורה ראשונה: "🎯 ציון: N מתוך 100".',
    'אחר כך שש שורות קצרות, נושא וציון ומשפט אחד.',
    '"מה עבד:" שתי נקודות, כל אחת עם ציטוט מדויק מהמוכר במירכאות.',
    '"מה לשפר:" שתי נקודות, כל אחת עם ציטוט מדויק מהמוכר ומה היה עדיף להגיד, במשפט מלא שאפשר להגיד ללקוח.',
    '"תרגיל לפעם הבאה:" משפט אחד.',
    'ציטוט רק מילה במילה מהתמליל. אם המוכר כמעט לא דיבר, אמור את זה ותן ציון בהתאם.',
  ].join('\n');
}

async function customerTurn(tr, env) {
  return llm('haiku', customerSystem(tr), script(tr) + '\nלקוח:', 60000, env);
}
async function score(tr, env) {
  return llm('sonnet', scoreSystem(), 'התרחיש: ' + (tr.scenario || 'כללי') + '\n\nהתמליל:\n' + script(tr), 180000, env);
}

function keep(dataPath, tr, result) {
  const dir = path.join(dataPath, 'files-private');
  fs.mkdirSync(dir, { recursive: true });
  const f = 'train-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12) + '.txt';
  fs.writeFileSync(path.join(dir, f), 'אימון מכירות' + (tr.scenario ? ': ' + tr.scenario : '') + '\n\n' + script(tr) + '\n\n' + result + '\n', 'utf8');
  return f;
}

// 11.11.2026: the same trainings for a customer, every model call on the customers' API key (lib/customer-env.js).
function forCustomer() {
  const env = require('./customer-env.js').customerEnv();
  return Object.assign({}, module.exports, {
    llm: (model, system, input, ms) => llm(model, system, input, ms, env),
    customerTurn: (tr) => customerTurn(tr, env),
    score: (tr) => score(tr, env),
  });
}

module.exports = { startOf, isEnd, isStop, active, customerTurn, score, keep, script, llm, forCustomer, RUBRIC, IDLE_MS };
