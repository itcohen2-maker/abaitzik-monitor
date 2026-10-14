/*
  The thing that was missing.

  Itzik, 16.9: "what I ask in the monitor does not get done, what I ask in the
  terminal does. How can that be." It is exactly right, and the reason is that
  the monitor is a mailbox. The listener catches his message in a second and
  writes it down in red, and then nothing reads it, because nothing in this
  repo can start a session. It waited for me to happen to look. Tonight six
  messages sat for two hours and forty six minutes, and I only found them
  while cleaning up after something else.

  So this is the part that looks. It runs on a schedule, finds messages of his
  that have no answer, and starts a headless Claude with them. Then it gets out
  of the way: it does not write answers itself and it does not decide anything,
  because a worker that improvises replies in his name is worse than silence.

  Usage: node worker.js [--dry]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const HERE = __dirname;
// Which monitor this is. Defaults are Itzik's folders and Itzik's name.
const inst = require('./lib/instance.js');
/*
  Only on the machine this instance names. See serverHost in lib/instance.js:
  a second the worker on another machine answers every message twice and fights
  the first one over every push.
*/
if (require.main === module && inst.serverHost && require('os').hostname() !== inst.serverHost) {
  console.log('the worker runs on ' + inst.serverHost + ', not here (' + require('os').hostname() + '). Leaving.');
  process.exit(0);
}
const CHAT = path.join(inst.dataPath, 'chat', 'chat');
const STATUS = path.join(inst.dataPath, 'status');
const LOCK = path.join(STATUS, 'worker.lock');
const LOG = path.join(STATUS, 'worker.log');
const SEEN = path.join(STATUS, 'worker-seen.json');
const DRY = process.argv.includes('--dry');
/*
  A message needs a moment to settle, but a minute was never that moment.

  The listener writes the record in the same second it arrives, and since 17.9
  it also transcribes a voice note by itself, in about twenty seconds, so the
  text is on the page long before a session could have read it. The minute here
  was buying nothing and costing a minute of a wait he was already calling
  unanswered. Twenty seconds is enough to let a burst of notes land together
  and be answered in one session rather than three.
*/
const SETTLE_MS = 5 * 1000; // 8.10: was 20s; the listener kicks the worker 6s after a message
/*
  How many of his messages can be worked at the same time.

  Itzik, 18.9: "it cannot be that you take one request at a time, then the
  monitor is worth nothing, it is not efficient and no client will want it."

  It used to be one, with a lock, because two sessions committing to the same
  repository in the same second break the build. That reasoning was right about
  the danger and wrong about the cure: it queued the whole job to protect one
  step of it. Six notes he sent between 07:53 and 07:58 on 17.9 sat behind a
  session that had started at 07:52 and had nothing to do with them.

  So the sessions run together and only the write is queued, in push.js. Three
  is not a hardware limit, it is a judgement: each one is a full session reading
  his repo, and past three they spend more time waiting on that one queue than
  working.
*/
const MAX_LIVE = 3;
const LIVE = path.join(STATUS, 'worker-live.json');
// A session gets ten minutes. The prompt makes it answer inside the first two,
// so a cap costs the tail of the work and never the reply.
const MAX_SESSION_MS = 10 * 60 * 1000;


/*
  A failure he is not told about is a failure that costs him the wait.

  18.9, in his words: "נמאס לי לתקן אותך". Every !! below used to land in
  data/status/worker.log and nowhere else, so the only way he learned that
  the worker had fallen over was that no answer arrived and he asked. The
  budget in notify-channels already protects the channel from a flood, so
  there is no reason left to stay quiet.
*/
function tell(title, body) {
  try {
    require('./lib/notify-channels.js').notify(title, String(body || ''));
  } catch (e) {
    say('!! לא הצלחתי להודיע לו: ' + e.message);
  }
}

function say(line) {
  const t = new Date().toTimeString().slice(0, 8);
  try { fs.appendFileSync(LOG, t + '  ' + line + '\n', 'utf8'); } catch (e) {}
  console.log(t + '  ' + line);
}
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
/*
  The register of sessions that are actually alive.

  There is no lock any more, because there is nothing here to hold one for.
  This is a head count: who is running, since when, and on what. A dispatcher
  run prunes the dead, kills anything past its ten minutes, and starts more
  only if there is room.

  It is a file rather than memory because the dispatcher exits between ticks.
  It has to: while it was alive the scheduled task refused to start another
  one, so a session that ran for nineteen minutes meant nineteen minutes with
  nobody watching the queue. That was the bug behind "the monitor does not
  answer me".
*/
function livePids() {
  const reg = readJson(LIVE, {});
  const now = Date.now();
  const kept = {};
  Object.keys(reg).forEach((pid) => {
    const e = reg[pid];
    if (!alive(Number(pid))) return;
    if (now - Date.parse(e.at) > MAX_SESSION_MS) {
      say('!! סשן ' + pid + ' עבר ' + (MAX_SESSION_MS / 60000) + ' דקות. עוצר אותו.');
      try { process.kill(Number(pid)); } catch (e2) {}
      try { execFile('taskkill', ['/pid', pid, '/t', '/f'], () => {}); } catch (e2) {}
      return;
    }
    /*
      10.10, Itzik took the reviewer's "מחיקה ברשימת הבקשות לא מבטלת כלום".
      "ביטול הבקשה" closed the request so nothing new picks it up, but a
      session already working on it went on to the end. Now it is stopped,
      when every message it holds was cancelled. A session that also holds
      a message still wanted keeps running: stopping it would drop that one.
    */
    const fl = e.files || [];
    if (fl.length && fl.every((f) => (readJson(path.join(CHAT, f), {}) || {}).cancelled)) {
      say('בקשה בוטלה. עוצר את הסשן ' + pid + ' שעבד עליה.');
      try { execFile('pkill', ['-TERM', '-P', pid], () => {}); } catch (e2) {}
      try { process.kill(Number(pid)); } catch (e2) {}
      try { execFile('taskkill', ['/pid', pid, '/t', '/f'], () => {}); } catch (e2) {}
      return;
    }
    kept[pid] = e;
  });
  try { fs.writeFileSync(LIVE, JSON.stringify(kept, null, 1), 'utf8'); } catch (e) {}
  return kept;
}
function register(pid, files) {
  const reg = readJson(LIVE, {});
  reg[pid] = { at: new Date().toISOString(), files };
  try { fs.mkdirSync(STATUS, { recursive: true }); fs.writeFileSync(LIVE, JSON.stringify(reg, null, 1), 'utf8'); } catch (e) {}
}
function unregister(pid) {
  const reg = readJson(LIVE, {});
  delete reg[pid];
  try { fs.writeFileSync(LIVE, JSON.stringify(reg, null, 1), 'utf8'); } catch (e) {}
}

/*
  Unanswered means unanswered by me, not unread by him.

  A message of his is waiting while it carries no done mark and nothing of
  mine in the chat points back at it. Both halves matter: the status is what I
  set when I finish, and the `re` link is what ties an answer to its question.
*/
function waiting() {
  let files = [];
  try { files = fs.readdirSync(CHAT); } catch (e) { return []; }
  const all = files.map((f) => {
    const d = readJson(path.join(CHAT, f), null);
    return d && d.at ? Object.assign({ file: f }, d) : null;
  }).filter(Boolean);
  const answeredIds = new Set(all.filter((m) => m.from === 'claude' && m.re).map((m) => m.re));
  require('./lib/pc-handed.js')().forEach((re) => answeredIds.add(re));
  const done = readJson(SEEN, {});
  const now = Date.now();
  return all.filter((m) => m.from === 'itzik')
    .filter((m) => m.status !== 'done')
    .filter((m) => !(m.id && answeredIds.has(m.id)))
    .filter((m) => !done[m.file])
    .filter((m) => now - Date.parse(m.at) > SETTLE_MS)
    .filter((m) => heard(m, now))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

/*
  A voice note waits for its transcription.

  Itzik, 25.9: "הוא לא הבין הקלטות". On the cloud server whisper takes about
  forty five seconds for a one minute note, and the settle time above is
  twenty. So the session started, found a message whose whole content was
  "(הודעה קולית: voice-....webm)", and answered a man it had not heard. The
  transcript landed in the note eight seconds after the session had begun.

  A message with a voice file and no transcript yet is held until the
  listener writes one. Held, not dropped: after four minutes it goes anyway,
  and the prompt already tells the session to transcribe it itself, because a
  transcription that never comes must not become a message nobody answers.
*/
const VOICE = /.(webm|m4a|ogg|mp3|aac|wav)$/i;
const HEAR_MAX_MS = 4 * 60 * 1000;
function heard(m, now) {
  const voice = (m.files || []).some((f) => VOICE.test(f));
  if (!voice) return true;
  if (/^תמלול:/.test(String(m.note || ''))) return true;
  return now - Date.parse(m.at) > HEAR_MAX_MS;
}

/*
  Was he actually answered.

  18.9: the worker treated exit 0 as success. A session that came up, did
  nothing and exited cleanly was indistinguishable from one that wrote him a
  reply, so the message stayed marked handled and no later tick ever looked
  at it again. That is the wave bug, the one that logged exit 0 three times
  and touched nothing, living on in the worker.

  So the proof is the answer itself: a chat record of mine whose re points
  back at his id. Nothing else counts as done.
*/
function answeredIds() {
  let files = [];
  const out = require('./lib/pc-handed.js')();
  try { files = fs.readdirSync(CHAT); } catch (e) { return out; }
  files.forEach((f2) => {
    const d = readJson(path.join(CHAT, f2), null);
    if (d && d.from === 'claude' && d.re) out.add(d.re);
  });
  return out;
}
function unanswered(list) {
  const got = answeredIds();
  return list.filter((m) => m.id && !got.has(m.id));
}

// Exit 0 with no id to check keeps the old trust; anything else is judged by
// whether an answer (a record of mine with re) exists for the message.
function missedOf(list, code, got) {
  got = got || answeredIds();
  return list.filter((m) => (m.id ? !got.has(m.id) : code !== 0));
}

function markHandled(list) {
  const done = readJson(SEEN, {});
  list.forEach((m) => { done[m.file] = new Date().toISOString(); });
  const keys = Object.keys(done).sort();
  while (keys.length > 500) delete done[keys.shift()];
  try { fs.writeFileSync(SEEN, JSON.stringify(done, null, 1), 'utf8'); } catch (e) {}
}

function unmarkHandled(list) {
  const done = readJson(SEEN, {});
  list.forEach((m) => { delete done[m.file]; });
  try { fs.writeFileSync(SEEN, JSON.stringify(done, null, 1), 'utf8'); } catch (e) {}
  say('הבאטץ׳ הוחזר לתור: ' + list.map((m) => m.file).join(', '));
}

// 14.10: a customer's computer is wired when its keys.json holds a pcKey (setup/enable-pc.sh).
function pcWired() {
  try { return String(JSON.parse(fs.readFileSync(path.join(inst.dataPath, 'keys.json'), 'utf8')).pcKey || '').length >= 16; }
  catch (e) { return false; }
}

function prompt(list) {
  const lines = list.map((m) => '- [' + m.at + '] (id ' + (m.id || m.file) + ') ' + String(m.text || '').replace(/\s+/g, ' '));
  return [
    'זו הרצה אוטומטית. אין אדם בצד השני של הפלט הזה ואף אחד לא יקרא אותו.',
    'אל תבקש אישור ואל תציע לעשות משהו: תבצע. אל תסיים בלי לכתוב תשובה ולדחוף אותה.',
    '',
    'חשוב: יתכן שרצים עכשיו עוד סשנים במקביל על הודעות אחרות שלו.',
    'לכן **אל תריץ git add, git commit או git push בעצמך**. במקום זה תמיד',
    '`node push.js "הודעת הקומיט"`. הוא בונה, מקמט, דוחף ועושה rebase אם צריך,',
    'ומחזיק תור כך ששני סשנים לא דורסים זה את זה. זה הדבר היחיד שמתוזמן.',
    'אל תיגע בקבצים של הודעות שלא הוקצו לך, ואל תענה להודעה שלא ברשימה למטה.',
    '',
    inst.owner + ' שלח את ההודעות האלה למוניטור והן עדיין בלי תשובה:',
    '',
    lines.join('\n'),
    '',
    /*
      The house rules are the instance's.

      Itzik's are a skill on this machine. A second instance has none of that
      and must not inherit it: Ilay's monitor answering in his father's voice,
      about his father's networks, would be the exact failure the separation
      exists to prevent. So the rules come from data/profile.md when it is
      there, written from his own intake answers, and the skill is only named
      for the instance it belongs to.
    */
    houseRules(),
    ...adminRules(),
    /*
      How an answer reads, 26.9. Itzik asked for the whole monitor to be gone
      over, "all your answers and how you bring them", and the answers screen
      showed why: paragraphs full of renderNew, paintDot, instance.json and
      data/keys. He reads these on a phone. Code names are for the commit
      message, the answer is for a person.
    */
    'איך כותבים את התשובה עצמה (היא נקראת בטלפון, על ידי אדם):',
    '  1. המשפט הראשון הוא התוצאה: מה נעשה, או מה התשובה. לא מה בדקת בדרך.',
    '  2. עברית של יום יום. בלי שמות קבצים, פונקציות, משתנים, נתיבים, מזהי קומיט או מונחים באנגלית.',
    '     אם חייבים לציין משהו טכני, אומרים במילים מה הוא עושה ("הכפתור של התזכורות"), לא איך קוראים לו בקוד.',
    '  3. עד חמש שורות קצרות. אם יש כמה דברים, כל אחד בשורה משלו.',
    '  4. אם צריך ממנו משהו, זו השורה האחרונה, ובה רק מה שהוא צריך לעשות.',
    '',
    'אם ל-note של ההודעה כבר יש תמלול, זה התמלול. רק אם אין, תמלל בעצמך עם',
    '`node transcribe.js data/inbox/<שם>.webm`.',
    '',
    /*
      1.10, Itzik: "תבנה שהמחשב יקלוט לבד משימות מהמוניטור שהשרת מסמן לו".
      What needs his PC is no longer sent back to him as "open CLAUDE.cmd".
      It is marked, and pc-pull.js on the PC takes it the next minute it is on.
    */
    /*
      11.10, Rinat's monitor told her twice that "the computer is off" and her
      Illustrator boards would run "the moment it is on". The PC queue is read
      only by Itzik's own PC and only from his folder, so a customer's task sat
      there forever and the sentence was false. A customer has no PC here: the
      queue is offered to Itzik's instance only, and a customer is told plainly.
    */
    /*
      14.10, Itzik at Rinat's computer: "המוניטור והקלוד שלי יהיו המוח והקלוד
      שלה רק יעבוד". A customer whose computer was wired (setup/enable-pc.sh,
      pcKey in keys.json) has the same queue as Itzik: pc-task.js here, and
      pc/pc-pull.ps1 on that computer, over HTTPS (lib/pc-api.js). The session
      here plans; the computer's own Claude, on the customer's own account,
      does what needs that machine (Illustrator, Photoshop, its files).
    */
    /*
      14.10, Rinat through Itzik: "כל הקבצים שאני מבקשת ... כפתור שאני לוחצת ויורד
      לי ישר להורדות ... הכל יהיה מאוד מאוד פשוט, גם התשובות". The page turns every
      files/<name> in an answer into the picture, a big download button, and the
      approve / pick / fix buttons, so the answer itself stays a sentence.
    */
    ...(inst.name !== 'abaitzik' ? [
      'כל תוצר שהלקוח ביקש (תמונה, PDF, קובץ עבודה) נשמר ב data/files-private/<שם בעברית פשוטה> ונכתב בתשובה כשורה files/<שם>.',
      'הדף מציג כל קובץ כזה עם תמונה, כפתור הורדה גדול שיורד ישר להורדות במחשב, וכפתורי "מאשרת", "בוחרת בזה" ו"לתקן".',
      'לכן התשובה עצמה קצרה מאוד: משפט אחד מה מוכן, שורות ה files, ושאלה אחת אם צריך החלטה. בלי הסברים, בלי נתיבים, בלי מונחים טכניים.',
      'כשיש כמה אפשרויות, כל אפשרות היא קובץ נפרד עם שם שאומר מה היא, והלקוח בוחר בלחיצה.',
      '',
    ] : []),
    ...(inst.name !== 'abaitzik' && pcWired() ? [
      'המחשב של ' + inst.owner + ' מחובר למוניטור: הוא בודק כל דקה אם יש לו משימה, ומריץ אותה עם Claude Code שמותקן שם,',
      'על החשבון שלו. משימה שצריכה את המחשב ההוא (אילוסטרייטור, פוטושופ, הקבצים שבמחשב ובכונן החיצוני, תוכנה שמותקנת רק שם)',
      'לא מבצעים כאן ולא מבקשים ממנהל. במקום זה:',
      '  `node pc-task.js add --re <id ההודעה> "<המשימה במלואה: מה לעשות, איפה הקבצים, ומה צריך לחזור>"`',
      '  הפקודה מדפיסה אם המחשב דלוק עכשיו (pc: on) או כבוי (pc: off). לפי זה:',
      '    דלוק: לא כותבים שום תשובה. התשובה של המחשב היא התשובה היחידה. רק מסמנים את ההודעה status "done" ודוחפים.',
      '    כבוי: תשובה אחת בשורה אחת: "המחשב כבוי מאז <שעה>. זה יתבצע לבד ברגע שידליקו אותו."',
      '  המחשב יענה באותו שרשור כשסיים. את החלק שאפשר לעשות כאן עושים כאן, ומעבירים למחשב רק מה שבאמת צריך אותו.',
      '  המחשב ההוא לא מכיר את המוניטור הזה ואת הקבצים כאן: כותבים לו במשימה את כל מה שהוא צריך לדעת, כולל נתיבים אם ידועים.',
      /*
        14.10, Itzik: "המחשב שלה והקלוד שלה עושים רק פעולות יבשות ומקבלות פקודות
        יבשות. שום מחשבה לא עוברת שם." All thinking happens here.
      */
      '  כל החשיבה נעשית כאן, אף פעם לא שם. המחשב ההוא מקבל פקודות יבשות בלבד ומבצע אותן כמו שהן:',
      '    כאן מחליטים הכל (עיצוב, צבעים, מידות, בחירה בין אפשרויות, שמות קבצים), והמשימה היא רשימת צעדים ממוספרים ומדויקים:',
      '    איזה קובץ לפתוח (נתיב מלא), באיזו תוכנה, מה בדיוק לעשות בכל צעד עם ערכים מספריים, איך לשמור ובאיזה שם.',
      '    אסור לכתוב לו "תבחר", "תעצב", "תשפר", "מה שנראה לך". אם חסר מידע כדי לכתוב צעד מדויק, קודם משיגים אותו (גם בצעד קריאה בלבד שמחזיר מידע), ורק אז שולחים את הביצוע.',
      '',
    ] : inst.name !== 'abaitzik' ? [
      'אין כאן חיבור לשום מחשב, לא של הלקוח ולא של איציק. אין תור משימות למחשב, ואסור לכתוב "המחשב כבוי" או "זה יתבצע כשיידלק".',
      'משימה שצריכה תוכנה שמותקנת רק במחשב של הלקוח (אילוסטרייטור, פוטושופ וכדומה): עושים כאן כל מה שאפשר בשרת,',
      'ואם התוכנה עצמה חיונית, אומרים בשורה אחת ובכנות מה אפשר להפיק כאן (למשל PDF או SVG בשכבות שנפתח באילוסטרייטור',
      'ונשמר שם כ-AI בלחיצה) ומבקשים ממנהל דרך הכפתור בקשה ממנהל. לא מבטיחים מה שלא יקרה.',
      '',
    ] : process.platform === 'win32' ? [] : [
      'משימה שצריכה את המחשב שלו (הדפדפן המחובר ל-itcohen2, ריווחית, קבצים בהורדות או בשולחן העבודה,',
      'הדרייב, הוואטסאפ במחשב) לא מבצעים כאן ולא שולחים אותו לפתוח את CLAUDE.cmd. במקום זה:',
      '  `node pc-task.js add --re <id ההודעה שלו> "<המשימה במלואה: מה לעשות, איפה, ומה צריך לחזור אליו>"`',
      '  הפקודה מדפיסה אם המחשב דלוק עכשיו (pc: on) או כבוי (pc: off). לפי זה:',
      '    דלוק: לא כותבים לו שום תשובה. האישור של המחשב הוא התשובה היחידה ("סתם מיותר", 7.10).',
      '      רק מסמנים את ההודעה שלו status "done" (ו-note עם התמלול אם זו הקלטה) ודוחפים.',
      '    כבוי: תשובה אחת בשורה אחת: "המחשב כבוי מאז <שעה>. זה יתבצע לבד ברגע שתדליק אותו."',
      '  המחשב יענה באותו שרשור כשסיים.',
      '  את החלק שאפשר לעשות כאן עושים כאן, ומעבירים למחשב רק את מה שבאמת צריך אותו.',
      '',
    ]),
    'סדר העבודה, ובדיוק בסדר הזה. הוא מחכה מול מסך.',
    '',
    /*
      7.10, Itzik: "אתה עונה על כל תשובה פעמיים ומפציץ אותי בתשובות סתם".
      Every message got an "I am going to" bubble and then a "done" bubble.
      One message, one answer: short work is answered once at the end, long
      work rewrites its first answer in place instead of adding a second.
    */
    'תשובה אחת לכל הודעה. לא שתיים: לא "הבנתי, אני עושה" ואחריה "עשיתי".',
    '',
    'שלב א, לא יותר משתי דקות מתחילת הסשן:',
    '  אם התשובה ידועה, או שהעבודה תיגמר תוך שלוש דקות: לא כותבים כלום עכשיו.',
    '  עושים את העבודה וכותבים פעם אחת, בשלב ג, את התוצאה.',
    '  רק אם העבודה ארוכה יותר:',
    '  1. קובץ חדש ב-data/chat/chat בשם <YYYYMMDD>-<HHMM>-claude-<slug>.json ובו',
    '     {"at":"<ISO עם +03:00>","from":"claude","re":"<id ההודעה שלו>","text":"<התשובה>"}.',
    '     כתוב מה הבנת ומה אתה הולך לעשות, במשפט או שניים. קצר ויבש, בלי מקפים, בלי אימוגי, בלי לפנות בשם.',
    '  2. `node push.js "מה עשית"`. עכשיו, לא בסוף.',
    'שתים עשרה דקות של שקט הן מבחינתו הודעה שנפלה, ולכן עבודה ארוכה מקבלת את זה מיד.',
    '',
    'שלב ב: תעשה בדיוק את מה שהוא ביקש, עד הסוף, ותאמת את התוצאה על הדף החי.',
    /*
      11.10, Itzik, for every monitor (his, Ilay, Rinat, every customer to come):
      plan in Opus 5.5, execute in the cheapest model. The session runs on the
      planner; the legwork goes to a Haiku subagent, and the planner checks it.
    */
    '  חלוקת עבודה בין מודלים: אתה המתכנן. תשובה קצרה או שינוי של שורה עושים לבד.',
    '  כל ביצוע של יותר מכמה צעדים (הרצת פקודות, עיבוד קבצים, חיפוש, כתיבה של קובץ ארוך) עובר לסוכן',
    '  עם הכלי Agent ו model: "haiku", עם הוראות מדויקות ופקודות מוכנות. הוא מבצע ומחזיר מספרים; אתה בודק ומחליט.',
    '',
    'שלב ג, בסוף, לכל הודעה, חובה:',
    '  1. בקובץ שלה ב-data/chat/chat: status ל-"done", ו-note עם התמלול אם זו הקלטה.',
    '  2. התשובה עם מה שיצא בפועל:',
    '     אם לא כתבת בשלב א, זה הקובץ היחיד שלך עכשיו.',
    '     אם כתבת בשלב א, לא פותחים קובץ שני. מחליפים את text באותו קובץ בתוצאה,',
    '     משאירים את at כמו שהוא ומוסיפים "editedAt" עם השעה עכשיו.',
    '  3. npm test, ואז `node push.js "מה עשית"`.',
    '',
    'אם משהו באמת חסום או דורש החלטה שלו, כתוב לו את זה מיד, בשלב א. גם אז',
    'הכתיבה והדחיפה הן חובה: הודעה שלא נכתבה היא הודעה שהוא לא קיבל.',
  ].join('\n');
}

/*
  Itzik, 5.10: a customer uses the monitor, he does not change it. His own
  monitor files a request and Itzik decides. Itzik's monitor gets the other
  half: how an approval is carried out. See lib/change-requests.js.
*/
function adminRules() {
  if (inst.name === 'abaitzik') return [
    'בקשות שינוי של לקוחות: הודעה שמתחילה ב"אישור בקשת שינוי <לקוח>/<מזהה>" היא האישור שלו. תבצע את השינוי:',
    '  הגדרה של הלקוח הזה בלבד (המסכים שלו, השם, הפרופיל, ה-CLAUDE.md שלו) נכתבת לקובץ מלא חדש ונכנסת דרך',
    '  `sudo /usr/local/sbin/tenant-config <לקוח> instance|profile|claude <הקובץ החדש>`. הקבצים שלו נעולים, זו הדרך היחידה.',
    '  תכונה במוצר עצמו נכנסת לקוד כרגיל, ומגיעה לכל הלקוחות.',
    '  בסוף: `node change-request.js decide <לקוח> <מזהה> approved "<משפט אחד ללקוח: מה השתנה>"`.',
    '  הודעה שמתחילה ב"דחיית בקשת שינוי <לקוח>/<מזהה>": רק `node change-request.js decide <לקוח> <מזהה> rejected "<הסיבה, אם כתב>"`.',
    '',
  ];
  /*
    12.10, Itzik on Rinat: "תהפוך את רינת למנהלת ... תן לה יד חופשית".
    Narrowed the same evening: "לא מעוניין שתשנה דברים מהותיים במוניטור, אלא
    רק תוסיף לעצמה בקשות ומענות, לא משהו שקשור בממשק". So the admin changes
    only how her assistant answers (profile.md, CLAUDE.md); anything on the
    page itself goes to Itzik as a request, like any customer.
  */
  /*
    14.10, Itzik by voice on Alon: "הוא יכול לבקש כל דבר במוניטור שלו ובמיוחד
    בתיאטרון, יש לו אישור שינוי של הכל". Whatever he asks for in his own
    monitor is done at once, the interface included. Only the shared product
    code is not his: the sync brings it back, so that one still goes as a request.
  */
  if (inst.admin && inst.adminFull) return [
    inst.owner + ' מנהל את המוניטור שלו, ויש לו אישור לשנות בו הכל, ובמיוחד כל מה שקשור בתיאטרון.',
    'מה שהוא מבקש במוניטור שלו מבצעים מיד, בלי בקשה ממנהל: אריחים, מסכים, כותרות, ברכה, הסברים, קישורים',
    '(instance.json), איך העוזר עונה ומה הוא עושה (data/profile.md, CLAUDE.md), וכל עבודה על התיאטרון.',
    'אחרי שינוי: `node push.js "<מה השתנה>"`, ומספרים לו בשורה אחת מה השתנה ואיפה הוא רואה את זה.',
    'רק קוד המוצר המשותף (קבצי js, העיצוב הכללי, קבצי המפתחות) לא משתנה כאן, כי הסנכרון מחזיר אותו. בקשה כזו:',
    '`node change-request.js add --re <id ההודעה שלו> "<מה הוא רוצה, במילים שלו>"`, ותענה: "שלחתי את זה לבנייה. כשזה מוכן, תקבל כאן תשובה."',
    'שימוש רגיל (הודעות, תזכורות, משימות, פתקים, רעיונות, שאלות) מבצעים כרגיל.',
    'מי שעונה כאן הוא "העוזר שלך" של המוניטור. בתשובות לא מזכירים את השם קלוד, Claude, איציק או אבא איציק.',
    '',
  ];
  if (inst.admin) return [
    inst.owner + ' מנהלת את התוכן של המוניטור הזה, לא את הממשק שלו.',
    'מה היא משנה מיד, בלי בקשה ממנהל: איך העוזר שלה עונה ומה הוא עושה בשבילה, כלומר כללים, בקשות קבועות ומענים,',
    'ב-data/profile.md וב-CLAUDE.md בלבד. אחרי שינוי: `node push.js "<מה השתנה>"`, ומספרים לה בשורה אחת מה השתנה.',
    /*
      12.10, 20:30, Itzik: "היא יכולה להוסיף כפתור ובתוך הכפתור יהיה מה שהיא
      רצתה, זה היא כן יכולה". One opening in the interface: a new tile of her
      own, appended to guides (text inside) or links (her own https site).
      Nothing that exists already is touched.
    */
    'חריג אחד בממשק, שמותר לה מיד: להוסיף לעצמה אריח חדש במסך הבית, ובתוכו מה שהיא רצתה.',
    '  אריח עם תוכן: רשומה חדשה בסוף guides ב-instance.json, {"key":"<מזהה חדש באנגלית>","icon":"<אימוג׳י>","title":"<שם קצר>","sub":"<שורה קטנה>","text":"<מה שבפנים>"}.',
    '  אריח שפותח אתר שלה: רשומה חדשה בסוף links, {"key","icon","title","sub","url"}, רק https.',
    '  רק הוספה: לא משנים, לא מוחקים ולא מזיזים שום אריח, מסך או שדה אחר. מוחקים או משנים רק אריח שהיא עצמה הוסיפה כך.',
    '  אחרי ההוספה: `node push.js "<האריח שנוסף>"`, ותענה בשורה אחת איזה אריח נוסף ואיפה הוא במסך הבית.',
    'כל שאר מה שקשור בממשק לא משנים כאן: שאר instance.json (אריחים קיימים, מסכים, כותרות, ברכה, הסברים, קישורים, צבעים), העיצוב,',
    'קבצי המפתחות וקוד המוצר (קבצי js). בקשה כזו: `node change-request.js add --re <id ההודעה שלה> "<מה היא רוצה, במילים שלה>"`,',
    'ותענה: "שלחתי את הבקשה למנהל. כשהוא יחליט, תקבלי כאן תשובה."',
    'שימוש רגיל (הודעות, תזכורות, משימות, פתקים, רעיונות, שאלות) מבצעים כרגיל.',
    'מי שעונה כאן הוא "העוזר שלך" של המוניטור. בתשובות לא מזכירים את השם קלוד, Claude, איציק או אבא איציק.',
    '',
  ];
  return [
    'כלל אדום של המוניטור הזה: ' + inst.owner + ' משתמש במערכת, הוא לא משנה אותה.',
    'שינוי במערכת: כפתורים, מסכים, עיצוב, הגדרות, הפרופיל, קוד, אוטומציות. אל תבצע שינוי כזה, גם אם הוא מתעקש וגם אם הוא נראה קטן.',
    'במקום זה: `node change-request.js add --re <id ההודעה שלו> "<מה הוא ביקש, במילים שלו>"`, ותענה:',
    '"שלחתי את הבקשה למנהל. כשהוא יחליט, תקבל כאן תשובה."',
    'הודעה שמתחילה ב"בקשה ממנהל:" באה מהכפתור שלו, והיא תמיד בקשה כזו.',
    // Itzik, 8.10: a customer asking for something new is offered the choice, with an example.
    'כשהבקשה היא להוסיף משהו חדש ולא כתוב בה אם כאייקון או ככפתור, תוסיף לתשובה הצעה עם דוגמה לאותו נושא:',
    '"תרצה את זה כאייקון או ככפתור? אייקון הוא ריבוע צבעוני במסך הבית, כמו 📨 בקשה ממערכת המחשוב. כפתור הוא שורה בתוך מסך שכבר יש לך, כמו שליחה למערכת המחשוב. תמיד אפשר לבקש אחר כך למחוק או להוסיף."',
    'מה שהוא עונה על זה מוסיפים לאותה בקשה: `node change-request.js add --re <id התשובה שלו> "<הבקשה הקודמת>, בתור <אייקון או כפתור>"`.',
    'שימוש רגיל (הודעות, תזכורות, משימות, פתקים, רעיונות, שאלות) מבצעים כרגיל.',
    // Itzik, 10.10: the customer's other side is only "העוזר שלך", in the monitor's name.
    'מי שעונה כאן הוא "העוזר שלך" של המוניטור, ותו לא. בתשובות לא מזכירים את השם קלוד, Claude, איציק או אבא איציק,',
    'ולא אומרים מי בנה את המערכת. מי שמחליט על שינויים הוא "המנהל".',
    '',
  ];
}

function houseRules() {
  const lines = [];
  if (inst.name === 'abaitzik') lines.push('כללי הבית: הפעל את הסקיל abaitzik-onboarding לפני שאתה נוגע במשהו.');
  try {
    const prof = fs.readFileSync(path.join(inst.dataPath, 'profile.md'), 'utf8').trim();
    if (prof) lines.push('כללי הבית של המופע הזה, מתוך data/profile.md:', '', prof);
  } catch (e) { /* no profile: nothing to add */ }
  if (!lines.length) lines.push('כללי הבית: ענה קצר, בעברית, בלי מקפים, בלי אימוגי, בלי לפנות בשם.');
  return lines.join('\n');
}

/*
  11.10, Itzik: "תעקוב אחרי הצריכה של רינת". Every session's usage, one line in
  data/status/usage.jsonl: cost at list price and tokens per model, subagents
  included. usage-watch.js on the server reads every monitor's file, reports
  and warns on overuse. Never throws: a bad line must not cost him an answer.
*/
function logUsage(raw, list) {
  try {
    const t = String(raw).trim();
    const d = JSON.parse(t.slice(t.indexOf('{')));
    const models = {};
    for (const [m, u] of Object.entries(d.modelUsage || {})) {
      models[m] = { in: u.inputTokens || 0, out: u.outputTokens || 0, cr: u.cacheReadInputTokens || 0, cw: u.cacheCreationInputTokens || 0, usd: +(u.costUSD || 0).toFixed(4) };
    }
    const line = { at: new Date().toISOString(), who: inst.name, usd: +(d.total_cost_usd || 0).toFixed(4), turns: d.num_turns || 0,
      ms: d.duration_ms || 0, msgs: list.length, sub: (d.subagent_stats && d.subagent_stats.spawned) || 0, models };
    fs.appendFileSync(path.join(STATUS, 'usage.jsonl'), JSON.stringify(line) + '\n');
    return d;
  } catch (e) { return null; }
}

/*
  12.10, Itzik: "גם עם רינת ככה". The rule since 11.10 was a line in the prompt:
  plan in Opus, hand the legwork to a Haiku agent. The sessions ignored it. Of
  Rinat's last 16 sessions none used Haiku, and of his own 60, one. So on a
  customer's monitor the split is no longer the session's choice: a short Opus
  run that may only read writes the plan, and the session that does the work
  runs on Haiku with that plan under the prompt. A planner that fails or comes
  back empty does not cost her the answer: the work still runs, on Haiku,
  without a plan. Itzik's own monitor keeps one Opus session for now (null).
*/
const EXEC_MODEL = process.env.MONITOR_EXEC_MODEL || 'claude-haiku-5-5';
function planFirst(text, list) {
  if (inst.name === 'abaitzik' || process.platform === 'win32' || process.env.MONITOR_ONE_STAGE) return null;
  const ask = text + '\n\n' + [
    '=== שלב תכנון בלבד ===',
    'אתה המתכנן. מותר לך רק לקרוא קבצים (Read, Grep, Glob). אל תכתוב, אל תריץ ואל תענה.',
    'מי שיבצע אחריך הוא מודל זול ומהיר, שיקבל את ההודעות למעלה ואת התוכנית שלך.',
    'כתוב לו תוכנית מדויקת וקצרה: אילו קבצים, אילו פקודות בדיוק, מה לבדוק בסוף,',
    'ואם צריך לענות, את נוסח התשובה המלא בעברית כמו שהוא צריך להיכתב.',
    'אם זו רק תשובה קצרה, כתוב רק את נוסח התשובה.',
  ].join('\n');
  const args = ['-p', '--model', process.env.MONITOR_PLAN_MODEL || 'claude-opus-5-5', '--output-format', 'json',
    '--allowedTools', 'Read', 'Grep', 'Glob', '--max-turns', '15'];
  if (!ownAccount()) args.push('--max-budget-usd', '0.8');
  let out = '';
  try {
    out = require('child_process').execFileSync('claude', args,
      { cwd: HERE, input: ask, encoding: 'utf8', timeout: 4 * 60 * 1000, maxBuffer: 16 << 20 });
  } catch (e) { out = String(e.stdout || ''); say('!! התכנון נכשל, הביצוע ממשיך בלי תוכנית: ' + String(e.message).slice(0, 120)); }
  const d = logUsage(out, list);
  const p = d && typeof d.result === 'string' ? d.result.trim() : '';
  say('תוכנית מאופוס: ' + (p ? p.length + ' תווים' : 'אין') + '. הביצוע ב ' + EXEC_MODEL);
  return p ? '=== התוכנית מהמתכנן (אופוס). בצע אותה עד הסוף, כולל שלב ג ===\n' + p : '';
}

function run(list) {
  const text = prompt(list);
  say('מפעיל סשן על ' + list.length + ' הודעות: ' + list.map((m) => m.file).join(', '));
  // The prompt goes in on stdin, not as an argument. It is long, it is Hebrew,
  // and it quotes him; concatenating it into a Windows command line is a
  // quoting bug waiting for the first message that contains a double quote.
  /*
    The dispatcher waits for its session, and that is allowed now.

    Four versions of this today, three of them mine and all three wrong in the
    same direction: I kept trying to make the dispatcher exit early so the
    scheduled task would not refuse the next tick. Detaching broke the stdin
    pipe. A file redirect produced nothing, measured twice. Unref'ing before the
    pipe flushed truncated a four kilobyte Hebrew prompt. Every one of them
    ended as an empty log file and a message of his going unanswered, and he
    spent a morning watching it.

    The error was the level. Nothing was wrong with piping a prompt into a
    session and waiting for it; what was wrong was a scheduled task set to
    IgnoreNew, so one long session silenced every later tick. That is one
    setting, and it is now Parallel. The dispatcher may take as long as its
    session takes, because another dispatcher is free to start beside it, and
    the count that stops a fourth one is the register below.

    Back to what worked for months, and the concurrency comes from the task.
  */
  /*
    --chrome only where there is a Chrome.

    25.9: the worker also runs on the cloud server now, which has no browser
    and no Profile 4. There, --chrome makes the session fail before reading a
    word of his message. Anything that truly needs his browser still waits for
    the PC, which is why the PC worker keeps running too.
  */
  // 11.10: the planner model, and JSON out so every session's usage is logged (logUsage).
  // 12.10: on a customer's monitor Opus only plans, and the session runs on Haiku (planFirst).
  const plan = planFirst(text, list);
  const model = plan === null ? (process.env.MONITOR_PLAN_MODEL || 'claude-opus-5-5') : EXEC_MODEL;
  const args = ['-p', '--dangerously-skip-permissions', '--model', model, '--output-format', 'json'];
  if (process.platform === 'win32') args.splice(1, 0, '--chrome');
  // 12.10: one customer session can not run away either (see overBudget).
  if (inst.name !== 'abaitzik' && !ownAccount()) args.push('--max-budget-usd', String(SESSION_USD));
  const child = spawn('claude', args,
    { cwd: HERE, shell: true, windowsHide: true });
  child.stdin.end(plan ? text + '\n\n' + plan : text, 'utf8');
  /*
    The session, not the thing that started it.

    18.9: this registered process.pid, so one tick that started three
    sessions counted as a single entry, and the first of them to close
    deleted it while the other two were still running. The next minute saw
    room for three more. MAX_LIVE was a number nobody enforced.
  */
  const sid = child.pid;
  register(sid, list.map((m) => m.file));
  let out = '', json = '';
  child.stdout.on('data', (b2) => { out += b2; json += b2; });
  child.stderr.on('data', (b2) => { out += b2; });
  child.on('close', (code) => {
    unregister(sid);
    const res = logUsage(json, list);
    say('הסשן הסתיים, קוד ' + code + '. ' + String(res ? res.result || '' : out).trim().slice(-300).replace(/\s+/g, ' '));
    /*
      The exit code was never the question.

      A session that came up, did nothing and exited 0 looked exactly like
      one that answered him, so the message stayed marked handled and no
      later tick ever looked at it again. He waited for an answer that was
      never coming and nothing anywhere said so.
    */
    /*
      28.9, 16:36: a session was stopped at ten minutes (code null) on two
      messages another session had already answered at 16:22. Anything that
      was not code 0 counted as missed, so he got "הודעה נשארה בלי תשובה" about
      messages that were answered. "איך יכול להיות תקין?". The answer on disk
      decides, whatever the exit code.
    */
    const missed = missedOf(list, code);
    if (missed.length) {
      unmarkHandled(missed);
      tell(
        'הודעה נשארה בלי תשובה',
        'סשן הסתיים בקוד ' + code + ' ובלי לענות על ' + missed.length +
        '. הוחזרו לתור: ' + missed.map((m) => String(m.text || m.file).slice(0, 60)).join(' · ')
      );
    }
  });
  child.on('error', (e) => {
    unregister(sid);
    say('!! הסשן לא עלה: ' + e.message);
    unmarkHandled(list);
    tell('הסשן לא עלה', e.message);
  });
}

/*
  Itzik, 27.9: "מפספס המון בקשות, חלק מהבקשות נעלמות". Two leaks, both found in
  the data that day.

  One: a session answers (a record of mine with re) but forgets to set his
  message to done. The worker already skips it, rightly, but the page keeps it
  in "עובד על זה" for ever. Eleven such rows sat there, some from 19.9. The
  answer is the proof, so the status follows it here, every tick.

  Two: a message marked handled before its session ran, whose session then died
  without answering. It was never looked at again (IMG_4088, 25.9). It gets one
  more session once no live session holds it and the ten minutes are long past.
  A second failure is told to him once instead of looping.
*/
const RETRY = path.join(STATUS, 'worker-retry.json');
function reconcile(live) {
  let files = [];
  try { files = fs.readdirSync(CHAT); } catch (e) { return; }
  const all = files.map((f) => { const d = readJson(path.join(CHAT, f), null); return d ? Object.assign({ file: f }, d) : null; }).filter(Boolean);
  const got = new Set(all.filter((m) => m.from === 'claude' && m.re).map((m) => m.re));
  const held = new Set();
  Object.keys(live).forEach((pid) => (live[pid].files || []).forEach((f) => held.add(f)));
  // 4.10: the first short reply comes within two minutes, so closing on any
  // reply emptied "in work now" while the session was still on it. A session
  // that is alive closes its own message; this only catches the ones it forgot.
  all.filter((m) => m.from === 'itzik' && m.status !== 'done' && m.id && got.has(m.id) && !held.has(m.file)).forEach((m) => {
    const d = readJson(path.join(CHAT, m.file), null);
    if (!d) return;
    d.status = 'done';
    try { fs.writeFileSync(path.join(CHAT, m.file), JSON.stringify(d, null, 1), 'utf8'); say('סומנה בוצע, כי יש עליה תשובה: ' + m.file); } catch (e) {}
  });
  /*
    28.9: a reply written at 17:46 carried "at": 17:57, a minute a session
    rounded to. On his page the answer sat eleven minutes in the future and the
    waiting time read 13 minutes instead of 2. A reply cannot be later than the
    moment its file was written, so that moment wins.
  */
  all.filter((m) => m.from === 'claude' && m.at).forEach((m) => {
    const full = path.join(CHAT, m.file);
    let mt = 0;
    try { mt = fs.statSync(full).mtimeMs; } catch (e) { return; }
    if (!(Date.parse(m.at) > mt + 60 * 1000)) return;
    const d = readJson(full, null);
    if (!d) return;
    d.at = new Date(mt).toISOString();
    try { fs.writeFileSync(full, JSON.stringify(d, null, 1), 'utf8'); say('זמן תשובה תוקן לזמן הכתיבה: ' + m.file); } catch (e) {}
  });
  const seen = readJson(SEEN, {});
  const retry = readJson(RETRY, {});
  const now = Date.now();
  let changed = false;
  all.filter((m) => m.from === 'itzik' && m.status !== 'done' && seen[m.file] && !(m.id && got.has(m.id)) && !held.has(m.file))
    .filter((m) => now - Date.parse(seen[m.file]) > MAX_SESSION_MS + 2 * 60 * 1000)
    .forEach((m) => {
      if (!retry[m.file]) {
        retry[m.file] = new Date().toISOString();
        delete seen[m.file];
        changed = true;
        say('!! הודעה נלקחה ולא נענתה. מחזיר לתור פעם אחת: ' + m.file);
      } else if (retry[m.file] !== 'told') {
        retry[m.file] = 'told';
        tell('הודעה שלא נענתה', 'ניסיתי פעמיים ולא הצלחתי לענות על: ' + String(m.text || '').slice(0, 80));
      }
    });
  if (changed) try { fs.writeFileSync(SEEN, JSON.stringify(seen, null, 1), 'utf8'); } catch (e) {}
  try { fs.writeFileSync(RETRY, JSON.stringify(retry, null, 1), 'utf8'); } catch (e) {}
}

/*
  12.10, Itzik: "הריצה דברים של חברה ענקית על החשבון הקטן שלי ועלולה לגמור לי
  את כל הטוקנים". A customer runs on his subscription, and the prompt's rule to
  hand work to the cheap model was ignored in every one of Rinat's sessions
  (sub 0, Opus only). So a hard ceiling, in code: a customer whose sessions
  today (Israel) cost MONITOR_DAY_USD (default $8) at list price gets no new
  session until tomorrow. Messages stay waiting, nothing is lost; she is told
  once. usage-watch.js (root) pushes Itzik. His own monitor has no ceiling.
  To raise one customer's: MONITOR_DAY_USD in /etc/<id>.env.
*/
const DAY_USD = Number(process.env.MONITOR_DAY_USD) || 8;
const SESSION_USD = Number(process.env.MONITOR_SESSION_USD) || 2.5;
function spentToday() {
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
  const today = day(new Date());
  try {
    return fs.readFileSync(path.join(STATUS, 'usage.jsonl'), 'utf8').split('\n').filter(Boolean)
      .reduce((n, l) => { try { const u = JSON.parse(l); return day(new Date(u.at)) === today ? n + (u.usd || 0) : n; } catch (e) { return n; } }, 0);
  } catch (e) { return 0; }
}
// 12.10: a customer whose own Claude key is in (setup/apply-own-token.sh) spends its own
// subscription, so Itzik's ceilings no longer apply to it.
function ownAccount() { return fs.existsSync('/srv/monitor-changes/' + inst.name + '.own'); }

function overBudget() {
  if (inst.name === 'abaitzik' || ownAccount()) return false;
  const spent = spentToday();
  if (spent < DAY_USD) return false;
  say('הגיע לתקרה היומית: $' + spent.toFixed(2) + ' מתוך $' + DAY_USD + '. לא מפעיל סשן עד מחר.');
  const flag = path.join(STATUS, 'budget-told.json');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  if (!DRY && readJson(flag, {}).day !== today && waiting().length) {
    try { fs.writeFileSync(flag, JSON.stringify({ day: today, spent })); } catch (e) {}
    tell('המכסה היומית נגמרה', 'ההודעות שלך נשמרו ויטופלו מחר בבוקר.');
  }
  return true;
}

/*
  12.10, Itzik on Rinat: "אני לא יכול לספוג את זה את הכל על המנוי שלי הוא יגמר",
  and he chose to stop her until she has an account of her own. Root puts
  /srv/monitor-changes/<id>.hold (the customer cannot write there); while it is
  there no session runs on his token, and she is told once a day that her
  messages are kept. Deleting the file, once her own token is in, resumes.
*/
function onHold() {
  if (inst.name === 'abaitzik' || !fs.existsSync('/srv/monitor-changes/' + inst.name + '.hold')) return false;
  say('ממתין לחשבון משלו. לא מפעיל סשן.');
  const flag = path.join(STATUS, 'hold-told.json');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  if (!DRY && readJson(flag, {}).day !== today && waiting().length) {
    try { fs.writeFileSync(flag, JSON.stringify({ day: today })); } catch (e) {}
    tell('העבודה ממתינה לחיבור חשבון', 'ההודעות שלך נשמרו ויטופלו מיד אחרי שהמוניטור יחובר לחשבון משלך.');
  }
  return true;
}

function main() {
  // 8.10: a paused customer gets no sessions at all.
  if (inst.paused) { say('מושהה. לא עונה.'); return; }
  if (onHold()) return;
  if (overBudget()) return;
  const live = livePids();
  if (!DRY) reconcile(live);
  const room = MAX_LIVE - Object.keys(live).length;
  const list = waiting();
  if (!list.length) { if (DRY) say('אין הודעות שמחכות. רצים: ' + Object.keys(live).length); return; }
  say('מחכות ' + list.length + ', רצים ' + Object.keys(live).length + ', מקום ל' + Math.max(0, room));
  if (DRY) return;
  if (room <= 0) { say('שלושה סשנים כבר רצים. ממתין לטיק הבא.'); return; }
  /*
    One session per message, not one per batch.

    Batching was a habit from the days of a single lock: if only one thing may
    run, you want it to carry everything. Now that they run together, a batch
    is only a way of making one slow message hold up three fast ones. The one
    exception is a burst he sent in the same breath, which is still one thought
    and reads badly as three separate answers, so notes within ninety seconds
    of each other travel together.
  */
  const BURST_MS = 90 * 1000;
  const batches = [];
  list.forEach((m) => {
    const last = batches[batches.length - 1];
    if (last && Math.abs(Date.parse(m.at) - Date.parse(last[last.length - 1].at)) <= BURST_MS) last.push(m);
    else batches.push([m]);
  });
  batches.slice(0, room).forEach((batch) => {
    // Marked before the session starts, not after. A session that crashes must
    // not put the same message back in the queue for ever; he would rather hear
    // "I missed one" once than get the same answer five times.
    markHandled(batch);
    runDetached(batch);
  });
}

/*
  Itzik, 27.9 21:53: four notes, one answered, three waiting behind it. On the
  server the worker is a oneshot unit fired by a timer, and this process waited
  for its session to close, so the unit stayed "activating" and the timer did
  not fire again until the session ended. MAX_LIVE was three on paper and one in
  practice. The dispatcher now hands each batch to its own detached process
  (worker.js --session <file>) and exits; the unit carries KillMode=process so
  systemd leaves those sessions running. On Windows nothing changes.
*/
function runDetached(batch) {
  if (process.platform === 'win32') return run(batch);
  const f = path.join(STATUS, 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.json');
  try { fs.writeFileSync(f, JSON.stringify(batch), 'utf8'); } catch (e) { return run(batch); }
  // say() already writes data/status/worker.log; the console goes where the
  // unit's own log is (WORKER_CONSOLE_LOG), or nowhere, never twice.
  let out = 'ignore';
  try { if (process.env.WORKER_CONSOLE_LOG) out = fs.openSync(process.env.WORKER_CONSOLE_LOG, 'a'); } catch (e) {}
  const c = spawn(process.execPath, [__filename, '--session', f], { cwd: HERE, detached: true, stdio: ['ignore', out, out] });
  c.unref();
}

// Itzik's decisions on this customer's requests, told in his chat.
function announceDecisions() {
  try {
    const n = require('./lib/change-requests.js').announce();
    if (!n) return;
    say('תשובות מנהל לבקשות שינוי: ' + n);
    execFile('node', ['push.js', 'admin decision on a change request'], { cwd: HERE, timeout: 240000 }, () => {});
  } catch (e) { say('!! תשובות מנהל: ' + e.message); }
}

const si = process.argv.indexOf('--session');
if (si > -1) {
  const f = process.argv[si + 1];
  const batch = readJson(f, []);
  try { fs.unlinkSync(f); } catch (e) {}
  if (batch.length) run(batch);
} else {
  main();
  if (!DRY && inst.name !== 'abaitzik') announceDecisions();
  if (!DRY) require('./lib/pegasus-tick.js').tick(Date.now());
}
