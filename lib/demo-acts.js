'use strict';
/*
  19.11.2026, Itzik: "כל כפתור שאני לוחץ, הוא יעדכן ויגיד מה הוא קיבל ומה הוא עשה".
  The public demo only (lib/public-demo.js puts this on the page when instance.json says publicDemo: true).

  Almost every button on the monitor page ends in one call: ntfyText(kind, text), the line that goes to
  the server ("מחיקת משימה: <id> (<text>)", "שגרה חדשה: {...}", "סטטוס ליד: <name> · <status>" and so on).
  In the demo nothing leaves the page, so the same line is read here and turned into two short sentences:
  what the monitor received and what it did. say() is pure and self contained (it is put on the page with
  toString), so it is tested in node (tests/demo-acts.test.js).
*/

function say(kind, text) {
  kind = String(kind || '').trim();
  text = String(text || '').replace(/\s+/g, ' ').trim();
  var cut = function (s, n) { s = String(s || '').trim(); n = n || 70; return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
  var q = function (s, n) { return '"' + cut(s, n) + '"'; };
  var m;
  var R = function (got, did) { return { got: got, did: did }; };
  // the conversation itself goes to the demo chat (public-demo.js), this is only its line
  if (kind === 'הודעה') return R('הודעה: ' + q(text), 'עונה לך עכשיו בחלון השיחה.');
  if ((m = /^סטטוס ליד: (.+?) · (.+)$/.exec(text))) return R('לעדכן את ' + cut(m[1], 30) + ' ל"' + cut(m[2], 30) + '"', 'עדכנתי את הכרטיס שלו ב 🔔 לידים. מהיום הוא בדוח הבוקר לפי הסטטוס החדש.');
  if ((m = /^מחיקת משימה: \S+ \((.*)\)$/.exec(text))) return R('למחוק את המשימה ' + q(m[1], 60), 'הורדתי אותה מהרשימה.');
  if ((m = /^עדכון משימה: \S+ \| (.+), ליום (\S+)/.exec(text))) return R('לעדכן את המשימה ' + q(m[1], 50) + ' ליום ' + m[2], 'שמרתי, והיא תחכה לך באותו יום ב ✅ משימות.');
  if ((m = /^משימה (להיום|ליום)[ ,]*(.*?)\s*\([\d-]+\): (.+)$/.exec(text))) return R('משימה חדשה: ' + q(m[3], 60), m[1] === 'להיום' ? 'הוספתי אותה לרשימה של היום, ואזכיר לך אם לא סומנה עד הערב.' : 'הוספתי אותה ליום ' + cut(m[2], 20) + ', ואזכיר לך באותו בוקר.');
  if ((m = /^מחיקת תור: \S+ \((.+)\)$/.exec(text))) return R('לבטל את התור ' + q(m[1], 50), 'מחקתי מהיומן, והכנתי ללקוח הודעה קצרה שהתור בוטל, לשליחה בלחיצה.');
  if (kind === 'תור') return R((/^עדכון/.test(text) ? 'לעדכן תור: ' : 'תור חדש: ') + q(text.replace(/^(תור חדש|עדכון תור)[:\s]*/, ''), 60), 'רשמתי ביומן, והכנתי ללקוח הודעת אישור ותזכורת יום לפני.');
  if ((m = /^תזכורת שוב: (.*)$/.exec(text))) return R('להזכיר שוב', 'אזכיר לך שוב בעוד שעה, בטלפון.');
  if (kind === 'תזכורת') return R('תזכורת: ' + q(text.replace(/^תזכורת[:\s]*/, ''), 60), 'קבעתי. היא תקפוץ לך בטלפון בדיוק בזמן.');
  if ((m = /^שגרה חדשה: (\{.*\})$/.exec(text))) {
    var o = {}; try { o = JSON.parse(m[1]) || {}; } catch (e) { o = {}; }
    return R('שגרה חדשה: ' + q(o.text || 'משימה קבועה', 60), o.kind === 'remind' ? 'שמרתי. התזכורת תקפוץ לך כל פעם בזמן שקבעת.' : 'שמרתי. הסוכנת תעשה את זה לבד בזמן שקבעת, והתוצאה תחכה לך בתשובות.');
  }
  if ((m = /^שגרה (מחיקה|עצירה|חידוש): /.exec(text))) return R(m[1] === 'מחיקה' ? 'למחוק שגרה' : m[1] === 'עצירה' ? 'לעצור שגרה' : 'להפעיל שגרה מחדש', m[1] === 'מחיקה' ? 'מחקתי אותה. הסוכנת לא תריץ אותה יותר.' : m[1] === 'עצירה' ? 'עצרתי. היא מחכה בצד עד שתחדש.' : 'הפעלתי. היא רצה שוב בזמן שלה.');
  if ((m = /^שגרה סוכן מחיקה: /.exec(text))) return R('להוריד סוכן מהצוות', 'הורדתי אותו, והשגרות שלו עברו למנהלת.');
  if ((m = /^שגרה סוכן: (\{.*\})$/.exec(text))) { var a = {}; try { a = JSON.parse(m[1]) || {}; } catch (e) { a = {}; } return R('סוכן: ' + cut(a.name || 'חדש', 20) + (a.role ? ', ' + cut(a.role, 30) : ''), 'הוספתי אותו לצוות של המנהלת. אפשר לתת לו שגרות.'); }
  if ((m = /^בקשה ממנהל: (תוספת 200 פעולות|שדרוג לחבילת [^,.]+)/.exec(text))) return R(m[1], m[1].indexOf('תוספת') === 0 ? 'אצלך עוברים לתשלום מאובטח, ו 200 הפעולות נוספות לחודש הזה מיד אחרי.' : 'אצלך עוברים לתשלום מאובטח של ההפרש, והחבילה מתעדכנת מיד.');
  if ((m = /^בקשה ממנהל: בקשת שדרוג: ([^.]+)/.exec(text))) return R('להוסיף: ' + cut(m[1], 50), 'אצלך עוברים לעמוד תשלום מאובטח, והתוספת נפתחת לבד ברגע שהתשלום עובר.');
  if ((m = /^בקשה ממנהל: (.+)$/.exec(text))) return R('בקשה לצוות: ' + q(m[1], 60), 'העברתי לצוות IT Solution. התשובה תגיע אליך לצ׳אט.');
  if ((m = /^קמפיין: ([^|]*)/.exec(text))) return R('קמפיין: ' + q(m[1], 50), 'הכנתי טיוטה: כותרת, טקסט, קהל ותקציב יומי. היא מחכה לאישור שלך ב 📣 קמפיינים.');
  if (/^מצב אישי איפוס/.test(text)) return R('לאפס את המצב האישי', 'החזרתי אותו להתחלה: בלי אריחים ובלי בחירות.');
  if (/^מצב אישי/.test(text)) return R('במצב האישי: ' + q(text.replace(/^מצב אישי\s*(בקשה|בחירה)?[:\s]*/, ''), 50), 'סידרתי לך את זה במסך האישי. רק אתה רואה אותו.');
  if ((m = /^📝 הערה לתפריט "(.+?)": (.+)$/.exec(text))) return R('הערה על ' + cut(m[1], 25) + ': ' + q(m[2], 50), 'רשמתי, והשינוי נכנס לתפריט הזה.');
  if ((m = /^🗑 ניקוי בתפריט "(.+?)"/.exec(text))) return R('לנקות את ' + cut(m[1], 30), 'הורדתי את מה שסימנת מהמסך.');
  if (/^🗑 מחיקת ליד/.test(text)) return R('להסיר ליד', 'הסרתי אותו מהרשימה. הוא נשמר בארכיון, למקרה שיחזור.');
  if (/^🎙️ מפתח פיירפליס/.test(text)) return R('לחבר את פיירפליס', 'חיברתי. כל פגישה מוקלטת תגיע מסוכמת ל 🎙️ סיכומי פגישות, עם משימות ליומן.');
  if (kind === 'ליד חדש') return R('ליד חדש: ' + q(text, 50), 'פתחתי לו כרטיס ב 🔔 לידים, והכנתי לו הודעה ראשונה לאישורך.');
  if (kind === 'עדכון עסק') return R('עדכון: ' + q(text, 60), 'עדכנתי את הרשומה, וזה נכנס לדוח הבוקר.');
  if ((m = /^ליד \[([^\]]+)\]: (סטטוס|צעד|הערה|תזכורת|אתר)\s*(.*)$/.exec(text))) {
    var who = /^demo-lead-|^[a-z0-9-]{6,}$/i.test(m[1]) ? 'הליד' : m[1];
    if (m[2] === 'סטטוס') return R('להעביר את ' + who + ' ל"' + cut(m[3], 25) + '"', 'עדכנתי את הכרטיס ואת הספירה בלוח. מהיום הוא בדוח הבוקר לפי השלב החדש.');
    if (m[2] === 'צעד') return R('הצעד הבא מול ' + who + ': ' + q(m[3], 50), 'רשמתי בכרטיס, ואזכיר לך אם זה לא נעשה עד מחר.');
    if (m[2] === 'הערה') return R('הערה על ' + who + ': ' + q(m[3], 50), 'רשמתי בהיסטוריה של הכרטיס.');
    if (m[2] === 'תזכורת') return R('תזכורת על ' + who, 'קבעתי. היא תקפוץ לך בטלפון בזמן.');
    return R('אתר של ' + who, 'שמרתי בכרטיס שלו.');
  }
  if (kind === 'ליד') return R('ליד: ' + q(text, 60), 'עדכנתי את לוח הלידים.');
  if ((m = /^רעיון שלי: (.+)$/.exec(text)) || kind === 'רעיון') return R('רעיון: ' + q(m ? m[1] : text, 60), 'שמרתי אותו ברעיונות, ואזכיר כשיתאים לפוסט או לסטורי.');
  if (kind === 'פתק') return R('עזרה בפתק', 'עברתי על הפתק. הניסוח המסודר מחכה לך בתשובות.');
  if (kind === 'בקשת מייל') return R('מייל: ' + q(text, 60), 'ניסחתי את המייל. הוא מחכה לאישור שלך לפני שהוא יוצא.');
  if (kind === 'הערה') return R('הערה: ' + q(text, 60), 'תיקנתי לפי ההערה, והגרסה החדשה מחכה לך.');
  if ((m = /^בחירה: (.+) ← (.+)$/.exec(text))) return R('בחרת ' + q(m[2], 40), 'ממשיך לפי הבחירה שלך.');
  if (/^💬 שיחה על אישור/.test(text)) return R('לשנות את הנוסח', 'ניסחתי מחדש לפי מה שכתבת. הנוסח החדש מחכה לאישורך.');
  if (/^אישור: /.test(text) || kind === 'אישור') return R('אישור: ' + q(text.replace(/^אישור:\s*/, ''), 50), 'אושר. זה יוצא לבד בזמן שנקבע.');
  if (kind === 'תשובה') return R('תגובה לתשובה: ' + q(text, 50), 'קראתי, וממשיך מאותה נקודה. התשובה בשרשור.');
  if (kind === 'בקשה' && /דוח|עבודת המנהל/.test(text)) return R('תגובה: ' + q(text, 60), 'המנהלת קיבלה, ומעדכנת את העבודה לפי מה שכתבת.');
  if (kind === 'בקשה') return R('בקשה: ' + q(text, 60), 'עשיתי, והתוצאה מחכה לך בתשובות.');
  if (kind === 'דוח' || /^דוח עכשיו/.test(text)) return R('דוח עכשיו', 'הכנתי דוח מעודכן. הוא ב 📄 דוחות.');
  if (kind === 'הגדרה' && /מחיקת כל הנתונים|בקשה למחיקת/.test(text)) return R('למחוק את כל הנתונים', 'אצלך הבקשה מחכה לאישור שלך, ורק אז הכל נמחק. בהדגמה לא מוחקים כלום.');
  if (kind === 'הגדרה') return R('הגדרה: ' + q(text, 60), 'עדכנתי את ההגדרה בטלפון שלך.');
  if (kind === 'תיקון') return R('תיקון פרטים: ' + q(text, 50), 'תיקנתי, ומעכשיו אני עובד עם הפרטים הנכונים.');
  if (kind === 'help-human' || kind === 'no-answer') return R('פנייה לצוות: ' + q(text.replace(/^(בעיה|בקשה מיוחדת):\s*/, ''), 50), 'העברתי לצוות IT Solution. אדם אמיתי חוזר אליך.');
  if (kind === 'req-cancel') return R('לבטל בקשה', 'ביטלתי אותה.');
  if (kind === 'פרויקט') return R('בפרויקט: ' + q(text, 60), 'עדכנתי את הפרויקט, והשלב הבא מחכה לך.');
  if (kind === 'בדיקה') return R('בדיקת חיבור', 'החיבור עובד.');
  if (kind === 'קובץ' && /^קמפיין: /.test(text)) return R('קבצים לקמפיין: ' + q(text.replace(/^קמפיין: /, '').split('|')[0], 40), 'הכנתי מהם טיוטת קמפיין: כותרת, טקסט, קהל ותקציב יומי. היא מחכה לאישור שלך ב 📣 קמפיינים.');
  if (kind === 'קובץ') return R('קובץ' + (text ? ': ' + q(text, 50) : ''), 'קראתי אותו, שמרתי בתיקייה שלך, ומה שצריך לעשות איתו כבר בטיפול.');
  if (kind === 'עדכון' && /^ספק /.test(text)) return R(cut(text, 70), 'רשמתי ליד הספק.');
  if (/^בקשה להסיר מהמסך/.test(text)) return R('להוריד מהמסך', 'הורדתי. אפשר להחזיר מתי שתרצה.');
  if (/^✓ ראיתי/.test(text)) return R('סימון שראית', 'סימנתי, וזה לא יחזור בדוח הבא.');
  if ((m = /^📤 נשלח: (.+)$/.exec(text))) return R('ההודעה יצאה מהוואטסאפ שלך', 'סימנתי אותה כנשלחה ברשימה.');
  if ((m = /^▶️ ערוץ יוטיוב: /.exec(text))) return R('לחבר ערוץ יוטיוב', 'חיברתי. תגובות ושאלות מהערוץ יופיעו ב ▶️, הכי חשובות למעלה.');
  if (/^🎛️ מלוח הבקרה/.test(text)) return R('בלוח הבקרה: ' + q(text, 50), 'עדכנתי את לוח הבקרה.');
  if (/^שאלות היכרות:/.test(text)) return R('התשובות שלך', 'קראתי, ואציע מה עוד כדאי לבנות לך.');
  var fb = R(text ? q(text, 70) : 'הלחיצה שלך', 'טיפלתי, והתשובה מחכה לך בתשובות.'); fb.fb = true;
  return fb;
}

/*
  19.11.2026, Itzik: "כל כפתור שאני לוחץ, הוא יעדכן ויגיד מה הוא קיבל ומה הוא עשה". The page's own scripts still run as
  they do for a customer (the row is hidden, the lead moves, the task is added), and the line that would go to the
  server is read by lib/demo-acts.js: one toast with what the monitor received and what it did, and the same pair is
  written into this browser's answers thread (D.chat), so the visitor sees the work land in תשובות too.
  client() runs on the page (toString), before the page's own scripts.
*/
function client(API, WA) {
  window.PUBLIC_DEMO = true;
  try { localStorage.setItem('welcomeSeen', '1'); localStorage.setItem('micChecked', '1'); if (localStorage.getItem('bareHome') === null) localStorage.setItem('bareHome', window.DEMO_TRADE ? '1' : '0'); } catch (e) {}
  var lastTap = 0;
  ['pointerdown', 'keydown', 'click'].forEach(function (t) { document.addEventListener(t, function () { lastTap = Date.now(); }, true); });
  function user() { return Date.now() - lastTap < 1500; }
  var shown = 0, shownMsg = '';
  window.demoToast = function (msg) {
    var r = msg && typeof msg === 'object' ? msg : null;
    var line = r ? r.got + '|' + r.did : String(msg || '');
    var now = Date.now(); if (now - shown < 1200 && line === shownMsg) return; shown = now; shownMsg = line;
    var t = document.getElementById('demoToast'); if (!t) { t = document.createElement('div'); t.id = 'demoToast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = '';
    if (r) {
      [['קיבלתי', r.got], ['עשיתי', r.did]].forEach(function (x) { var p = document.createElement('div'); var b = document.createElement('b'); b.textContent = x[0] + ': '; p.appendChild(b); p.appendChild(document.createTextNode(x[1])); t.appendChild(p); });
      var s = document.createElement('small'); s.textContent = 'בהדגמה רק מראים. אצלך זה קורה באמת.'; t.appendChild(s);
    } else t.textContent = line || 'בהדגמה רק מראים. אצלך זה קורה באמת.';
    t.className = 'on'; clearTimeout(t._h);
    t._h = setTimeout(function () { t.className = ''; }, Math.min(9000, Math.max(4200, line.length * 75)));
    t.onclick = function () { clearTimeout(t._h); t.className = ''; };
  };
  // the pair also lands in the answers thread, in this browser only
  function acts() { try { var a = JSON.parse(localStorage.getItem('demoActs') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function reapply() {
    if (!window.D || typeof window.D !== 'object') return false;
    var C = window.D.chat = window.D.chat || [], have = {}, added = false;
    C.forEach(function (m) { if (m && m.id) have[m.id] = 1; });
    acts().forEach(function (a) {
      if (have[a.id]) return; added = true;
      C.push({ id: a.id, at: a.at, from: 'itzik', text: a.me, status: 'done', ackAt: a.at });
      C.push({ id: a.id + 'r', at: a.at2, from: 'claude', re: a.id, text: a.bot });
    });
    if (added) ['renderThread', 'renderAnswers', 'renderNew', 'paintNew'].forEach(function (f) { try { if (typeof window[f] === 'function') window[f](); } catch (e) {} });
    return added;
  }
  window.demoReapply = reapply;
  function remember(me, r) {
    // after the page's own .then() wrote its "pending" line, so the thread counts it as answered
    setTimeout(function () {
      var at = new Date(), id = 'dx' + at.getTime().toString(36);
      var a = acts(); a.push({ id: id, at: at.toISOString(), at2: new Date(at.getTime() + 1500).toISOString(), me: me, bot: '✅ ' + r.did });
      try { localStorage.setItem('demoActs', JSON.stringify(a.slice(-20))); } catch (e) {}
      reapply();
    }, 700);
  }
  window.demoRemember = remember;
  setInterval(reapply, 1500);
  var lastFile = 0;
  window.demoAct = function (kind, text, quiet) {
    // a lead line carries the record id; the visitor knows the name
    try { text = String(text || '').replace(/^ליד \[([^\]]+)\]/, function (all, id) { var L = (window.D && (D.biz || [])) || []; var x = [].concat(L).filter(function (y) { return y && y.id === id; })[0]; return x && x.name ? 'ליד [' + x.name + ']' : all; }); } catch (e) {}
    var r = window.demoSay(kind, text);
    if (r.fb && screen()) r = { got: 'במסך ' + screen() + ': ' + r.got, did: r.did };
    if (kind === 'קובץ') lastFile = Date.now();
    window.demoToast(r);
    if (kind === 'הודעה') { setTimeout(function () { try { window.fcSheet(); window.fcSend(text); } catch (e) {} }, 60); remember(String(text).slice(0, 300), { did: 'עניתי לך בחלון השיחה שנפתח.' }); return r; }
    if (!quiet) remember(r.got, r);
    return r;
  };
  function allowed(u, m) {
    u = String(u || ''); m = String(m || 'GET').toUpperCase();
    if (u.indexOf(API) === 0) return true;
    var a; try { a = new URL(u, location.href); } catch (e) { return false; }
    return a.origin === location.origin && (m === 'GET' || m === 'HEAD');
  }
  function hdr(h, k) { try { if (!h) return ''; if (typeof h.get === 'function') return h.get(k) || ''; for (var x in h) if (x.toLowerCase() === k.toLowerCase()) return String(h[x]); } catch (e) {} return ''; }
  // the screen the visitor is on, for the lines that have no pattern of their own
  function screen() {
    try {
      var vis = function (e) { var r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.bottom > 40 && r.top < innerHeight - 40 && c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0.2; };
      var fx = [].filter.call(document.querySelectorAll('body > *, body > * > *'), function (e) { return getComputedStyle(e).position === 'fixed' && e.offsetHeight > 300 && ['demoWa', 'demoRib', 'demoToast', 'qhSheet'].indexOf(e.id) < 0 && vis(e); });
      var h = fx.length ? fx[fx.length - 1].querySelector('b, h2, h3') : null;
      if (!h) { var pb = document.getElementById('pbTitle'); if (pb && vis(pb)) h = pb; }
      var t = h ? String(h.textContent || '').replace(/\s+/g, ' ').replace(/[?✕]/g, '').trim() : '';
      return t.length > 1 && t.length < 40 ? t : '';
    } catch (e) { return ''; }
  }
  function gen() { var s = screen(); return { got: s ? 'פעולה במסך ' + s : 'הבקשה שלך', did: 'אצלך היא מתבצעת עכשיו, והתוצאה מגיעה לתשובות.' }; }
  // what a blocked request was: true when it got its own line
  function read(u, m, body, headers) {
    u = String(u || ''); m = String(m || 'GET').toUpperCase();
    if (/ntfy\.sh\//.test(u) && m !== 'GET') {
      if (typeof body !== 'string') { if (Date.now() - lastFile > 4000) window.demoAct('קובץ', decodeURIComponent(hdr(headers, 'Filename') || '')); return true; }
      var L = body.split('\n'), kind = L.shift() || '';
      if (L.length && /^קוד /.test(L[L.length - 1])) { L.pop(); if (L.length && L[L.length - 1] === '') L.pop(); }
      window.demoAct(kind, L.join('\n'));
      return true;
    }
    if (/formsubmit\.co/.test(u)) { var f = {}; try { f = JSON.parse(body) || {}; } catch (e) {} window.demoAct('', f['הודעה'] || ''); return true; }
    if (/\/api\/quote\/save$/.test(u)) {
      var q = {}; try { q = JSON.parse(body).q || {}; } catch (e) {}
      var r = { got: 'הצעת מחיר ' + (q.no || '') + (q.client ? ' ל' + q.client : ''), did: 'שמרתי אותה עם הלוגו שלך. היא מוכנה ב PDF, לשליחה בוואטסאפ או לחתימה דיגיטלית.' };
      window.demoToast(r); remember('🧾 ' + r.got, r);
      return true;
    }
    if (/\/up\//.test(u) && m !== 'GET') { if (Date.now() - lastFile > 4000) window.demoAct('קובץ', ''); return true; }
    return false;
  }
  var SILENT = /\/api\/(quote\/list|visit|owner-open|track)\b/;
  var of = window.fetch;
  window.fetch = function (i, o) {
    var u = (i && i.url) || i, m = (o && o.method) || (i && i.method) || 'GET';
    if (allowed(u, m)) return of.apply(this, arguments);
    // only a write is something the visitor did; a GET right after a tap is the page polling (ntfy, live.json)
    var mine = !SILENT.test(String(u)) && String(m).toUpperCase() !== 'GET' && Date.now() - lastTap < 8000;
    if (mine && !read(u, m, o && o.body, o && o.headers)) window.demoToast(gen());
    // the payment pages never open in the demo (the click is answered below); the button just waits
    if (/\/api\/pay\//.test(String(u))) return new Promise(function () {});
    return Promise.resolve(new Response(/quote\/list/.test(String(u)) ? '{"quotes":[]}' : '{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  var xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this._demoOk = allowed(u, m); this._demoM = String(m || 'GET').toUpperCase(); this._demoU = u; return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    if (this._demoOk) return xs.apply(this, arguments);
    if (this._demoM !== 'GET' && Date.now() - lastTap < 8000) { if (!read(this._demoU, this._demoM, b, null)) window.demoToast(gen()); }
  };
  try { navigator.sendBeacon = function () { return true; }; } catch (e) {}
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () { return Promise.reject(new Error('demo')); };
      if (navigator.serviceWorker.getRegistrations) navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.unregister(); }); });
    }
  } catch (e) {}
  try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = function () { window.demoToast({ got: 'הקלטה קולית', did: 'אצלך מדברים, ואני מתמלל ומבצע. בהדגמה כותבים בתיבה.' }); return Promise.reject(new Error('demo')); }; } catch (e) {}
  try { if (window.Notification) Notification.requestPermission = function () { window.demoToast({ got: 'להפעיל התראות', did: 'אצלך כל תשובה קופצת בטלפון, גם כשהמוניטור סגור.' }); return Promise.resolve('default'); }; } catch (e) {}
  try { window.WebSocket = function () { throw new Error('demo'); }; window.EventSource = function () { throw new Error('demo'); }; } catch (e) {}
  function waText(u) { try { return new URL(u).searchParams.get('text') || ''; } catch (e) { return ''; } }
  function outLine(u) {
    u = String(u || '');
    if (/wa\.me\//.test(u)) { var t = waText(u); return { got: t ? 'לשלוח בוואטסאפ: "' + t.slice(0, 60) + (t.length > 60 ? '…' : '') + '"' : 'לפתוח שיחה בוואטסאפ', did: 'אצלך נפתח הוואטסאפ שלך עם ההודעה מוכנה. לוחצים שלח, וזה יוצא מהמספר שלך.' }; }
    if (/^tel:/.test(u)) return { got: 'להתקשר ל ' + u.slice(4), did: 'אצלך זה מחייג ישר מהטלפון.' };
    if (/^mailto:/.test(u)) return { got: 'לכתוב מייל', did: 'אצלך נפתח המייל שלך עם הנמען מוכן.' };
    if (/^sms:/.test(u)) return { got: 'לשלוח SMS', did: 'אצלך נפתחת ההודעה בטלפון, מוכנה לשליחה.' };
    return { got: 'לפתוח קישור', did: 'אצלך הוא נפתח בלשונית חדשה.' };
  }
  var wo = window.open;
  window.open = function (u) { u = String(u || ''); if (u.indexOf('https://wa.me/' + WA) === 0) return wo.apply(window, arguments); window.demoToast(outLine(u)); return null; };
  document.addEventListener('submit', function (e) { var f = e.target, ac = f && f.getAttribute && f.getAttribute('action'); if (ac && !allowed(ac, 'GET')) { e.preventDefault(); e.stopPropagation(); window.demoToast({ got: 'הטופס שמילאת', did: 'אצלך הוא נשלח ונשמר, ואתה מקבל עדכון כשמישהו ממלא.' }); } }, true);
  document.addEventListener('click', function (e) {
    var t = e.target;
    // a paid add-on or the package: SUMIT's page never opens from the demo
    var pay = t && t.closest && t.closest('[data-pk="axgo"],[data-pk="upgo"],[data-po]');
    if (pay) {
      e.preventDefault(); e.stopImmediatePropagation();
      var nm = ''; try { var row = pay.parentNode; var b0 = row && row.previousElementSibling; nm = (b0 && b0.getAttribute && b0.getAttribute('data-pk') === 'ax' && b0.textContent) || ''; } catch (x) {}
      if (pay.getAttribute('data-pk') === 'upgo') nm = 'שדרוג ' + pay.textContent; nm = String(nm || '').split(',')[0].trim();
      var r = { got: 'להוסיף' + (nm ? ': ' + nm : ' את התוספת'), did: 'אצלך נפתח עמוד תשלום מאובטח, וברגע שהתשלום עובר התוספת נפתחת לבד, בלי לחכות לאף אחד.' };
      window.demoToast(r); remember('🛒 ' + r.got, r); return;
    }
    // 🔌: the Fireflies key never leaves the demo page
    var ff = t && t.closest && t.closest('[data-ff]');
    if (ff) { e.preventDefault(); e.stopImmediatePropagation(); var r2 = { got: 'מפתח לפיירפליס', did: 'חיברתי. כל פגישה שמוקלטת מגיעה מסוכמת ל 🎙️ סיכומי פגישות, עם החלטות ומשימות ליומן.' }; window.demoToast(r2); remember('🎙️ ' + r2.got, r2); return; }
    var a = t && t.closest && t.closest('a[href]'); if (!a) return; var h = a.getAttribute('href') || '';
    var cn = a.closest && a.closest('.cnr'), cb = cn && cn.querySelector('.cnt b');
    if (cb) { e.preventDefault(); e.stopPropagation(); var r3 = { got: (/again/.test(a.className) ? 'לחבר מחדש: ' : 'לחבר: ') + cb.textContent.trim(), did: 'אצלך נפתח מסך ההרשאה של השירות. מאשרים בלחיצה, וכאן זה מסומן מחובר תוך כמה דקות.' }; window.demoToast(r3); return; }
    if (h.indexOf('https://wa.me/' + WA) === 0 || h.indexOf('https://it-solution.co.il/start') === 0 || h.charAt(0) === '#' || h.indexOf('javascript:') === 0) return;
    var x; try { x = new URL(h, location.href); } catch (er) { return; } if (x.origin === location.origin && !a.hasAttribute('download')) return;
    e.preventDefault(); e.stopPropagation(); window.demoToast(a.hasAttribute('download') ? { got: 'להוריד את הקובץ', did: 'אצלך הוא יורד לטלפון, או נפתח לתצוגה.' } : outLine(x.href));
  }, true);
}


module.exports = { say, client };
