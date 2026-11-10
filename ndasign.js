'use strict';
/*
  5.11.2026, Itzik: "תהפוך את הטופס לטופס עם חתימה דיגיטלית ... תשמור לי במוניטור גם את ה PDF הזה וגם PDF עם חתימה דיגיטלית".
  The NDA a new IT Solution client signs on the phone. The client fills his company details in the
  blanks and signs with a finger. IT Solution signs once, on the owner link, and that signature
  goes on every agreement. One share link for every client: nothing is created when it is opened
  (a WhatsApp preview fetch must not make a record); a signed copy is made only when he signs.

  /n/<shareTok>          the client page (open is counted and reported once per device)
  /n/<ownerTok>          Itzik: the IT Solution details and the one signature
  /n/<shareTok>/pdf      the blank agreement as PDF
  /n/<signedTok>/signed  one client's signed PDF (also in data/files-private/nda-<date>-<tok6>.pdf)
  POST /api/nda          { tok, open } | { tok, owner fields, sig } | { tok, client fields, sig }

  data/ndasign/<doc>/def.json    { title, shareTok, ownerTok, blankOut }
  data/ndasign/<doc>/owner.json  { name, role, addr, sig, at }
  data/ndasign/<doc>/signed/<tok>.json  { f:{co,id,addr,name,role}, sig, date, time, signedAt, ip, ua, out }
  data/ndasign/<doc>/stats.json  { opens, firstOpen, lastOpen }
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ROOT = path.join(__dirname, 'data', 'ndasign');
const PRIV = path.join(__dirname, 'data', 'files-private');
const ITS_ID = '028445518';

function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); }
function docs() { try { return fs.readdirSync(ROOT).map((d) => ({ dir: path.join(ROOT, d), def: readJson(path.join(ROOT, d, 'def.json'), null) })).filter((x) => x.def); } catch (e) { return []; } }
function find(tok) {
  tok = safeTok(tok); if (!tok) return null;
  for (const d of docs()) {
    if (d.def.shareTok === tok) return Object.assign(d, { kind: 'share' });
    if (d.def.ownerTok === tok) return Object.assign(d, { kind: 'owner' });
    const sf = path.join(d.dir, 'signed', tok + '.json');
    if (fs.existsSync(sf)) return Object.assign(d, { kind: 'signed', tok, rec: readJson(sf, null) });
  }
  return null;
}
function owner(d) { return readJson(path.join(d.dir, 'owner.json'), null); }
function nowIL() {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { d: p.day, m: p.month, y: p.year, date: p.day + '/' + p.month + '/' + p.year, time: p.hour + ':' + p.minute };
}
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/* The agreement. v(key) gives a filled value, a blank line, or an input (mode). */
function agreement(v) {
  const P = (t) => '<p>' + t + '</p>', H = (t) => '<h3>' + t + '</h3>';
  return '<div class="doc">'
    + '<h2>הסכם סודיות ואי גילוי</h2><div class="c">(Non Disclosure Agreement, NDA)</div>'
    + '<div class="c">שנערך ונחתם ביום ' + v('day') + ' לחודש ' + v('month') + ' שנת ' + v('year') + '</div>'
    + '<div class="party"><b>בין:</b><br>IT Solution<br>ח.פ./ע.מ.: ' + ITS_ID + '<br>מרחוב: ' + v('itsAddr') + '<br>(להלן: "המקבל" או "IT Solution")</div>'
    + '<div class="party"><b>לבין:</b><br>' + v('co') + '<br>ח.פ./ע.מ.: ' + v('id') + '<br>מרחוב: ' + v('addr') + '<br>(להלן: "המגלה" או "החברה")</div>'
    + P('הואיל והצדדים מנהלים משא ומתן ו/או שיחות מקדימות לבחינת אפשרות להתקשרות עסקית ביניהם, במסגרתה עשויה IT Solution לספק לחברה שירותי פיתוח תוכנה, ייעוץ טכנולוגי ו/או שירותים נלווים (להלן: "ההתקשרות המיועדת");')
    + P('והואיל ובמסגרת הבחינה האמורה, החברה עשויה לגלות ולמסור למקבל מידע סודי וקנייני השייך לה ו/או לצדדים שלישיים הקשורים אליה;')
    + P('והואיל והמקבל מסכים לקבל מידע זה בכפוף להתחייבויות הסודיות המפורטות בהסכם זה;')
    + P('לפיכך הוסכם, הותנה והוצהר בין הצדדים כדלקמן:')
    + H('1. מבוא והגדרות')
    + P('המבוא להסכם זה מהווה חלק בלתי נפרד הימנו.')
    + P('"מידע סודי": כל מידע, בכל צורה שהיא (בכתב, בעל פה, אלקטרוני, חזותי או אחר), שיימסר על ידי החברה למקבל או ייחשף בפניו, במישרין או בעקיפין, לפני או אחרי חתימת הסכם זה, לרבות ומבלי למעט: מידע עסקי, פיננסי, שיווקי, טכנולוגי; תוכניות עסקיות ואסטרטגיות; רשימות לקוחות וספקים; מפרטים טכניים, קוד מקור, ארכיטקטורה, עיצובים ושרטוטים; סודות מסחריים וקניין רוחני; מידע על עובדים; נוסחאות, שיטות עבודה, תהליכים ונהלים; וכן עצם קיומו ותוכנו של המשא ומתן בין הצדדים.')
    + P('"מידע סודי" אינו כולל מידע אשר: (א) הפך לנחלת הכלל שלא בעקבות הפרת הסכם זה; (ב) היה בידי המקבל כדין טרם גילויו ואינו כפוף להתחייבות סודיות אחרת; (ג) התקבל כדין מצד שלישי שאינו כפוף להתחייבות סודיות כלפי החברה; או (ד) פותח על ידי המקבל באופן עצמאי לחלוטין ללא שימוש במידע הסודי, וניתן להוכיח זאת בראיות בכתב.')
    + H('2. התחייבויות המקבל')
    + P('המקבל מתחייב לשמור על המידע הסודי בסודיות מוחלטת ולא לגלותו, להעבירו, לפרסמו או להפיצו לכל צד שלישי, בכל דרך שהיא, ללא הסכמת החברה מראש ובכתב.')
    + P('המקבל ישתמש במידע הסודי אך ורק לצורך בחינת ההתקשרות המיועדת ולא לכל מטרה אחרת, לרבות לא לשימוש מסחרי עצמי, לפיתוח מוצר מתחרה או לטובת צד שלישי כלשהו.')
    + P('המקבל ינקוט בכל האמצעים הסבירים לשמירה על המידע הסודי, באותה רמת זהירות שהוא נוקט ביחס למידע סודי משל עצמו, ובכל מקרה לא פחות מרמה סבירה המקובלת בענף.')
    + P('המקבל יגביל את הגישה למידע הסודי אך ורק לעובדיו, נותני שירותים מטעמו (לרבות שני המפתחים המועסקים על ידו) ויועציו אשר זקוקים לכך במסגרת בחינת ההתקשרות המיועדת (להלן: "נציגים מורשים"), ובלבד שאלו יהיו כפופים להתחייבויות סודיות שאינן פחותות מהמפורטות בהסכם זה.')
    + P('המקבל יהיה אחראי לכל הפרה של הסכם זה על ידי מי מנציגיו המורשים.')
    + P('המקבל לא יעשה העתקה, שכפול או שחזור של המידע הסודי, למעט בהיקף הנדרש באופן סביר לבחינת ההתקשרות המיועדת.')
    + H('3. גילוי על פי דין')
    + P('מקום בו המקבל נדרש לגלות מידע סודי מכוח דין, צו שיפוטי או דרישה של רשות מוסמכת, ימסור על כך הודעה מוקדמת לחברה במידת האפשר ובהקדם האפשרי, על מנת לאפשר לחברה לנקוט באמצעים משפטיים להגנה על המידע, ויגלה אך ורק את החלק הנדרש על פי דין.')
    + H('4. תקופת הסודיות')
    + P('התחייבויות הסודיות של המקבל על פי הסכם זה יעמדו בתוקפן ללא הגבלת זמן, וימשיכו לחול גם לאחר סיום או הפסקת המשא ומתן בין הצדדים, וגם לאחר סיום כל התקשרות עתידית ביניהם, ללא קשר לסיבת הסיום.')
    + H('5. העדר רישיון והעדר התחייבות להתקשרות')
    + P('אין בהסכם זה כדי להעניק למקבל כל זכות, רישיון או בעלות במידע הסודי או בקניין הרוחני של החברה. כל הזכויות במידע הסודי נותרות בבעלות החברה.')
    + P('אין בהסכם זה כדי לחייב מי מהצדדים להתקשר בהסכם כלשהו או להמשיך במשא ומתן, וכל צד רשאי להפסיק את המשא ומתן בכל עת וללא נימוק.')
    + H('6. השבת המידע')
    + P('לבקשת החברה בכתב, או עם סיום המשא ומתן ללא התקשרות, יחזיר המקבל לחברה או ישמיד (לפי בחירת החברה) את כל המידע הסודי שברשותו, לרבות עותקים, תמציות וכל גזירות מהמידע, ויאשר בכתב את ביצוע ההשבה או ההשמדה. על אף האמור, המקבל רשאי לשמור עותק אחד לצרכי ציות לדין וגיבויים אוטומטיים של מערכותיו, בכפוף להמשך חלות חובת הסודיות.')
    + H('7. פיצוי והפרות')
    + P('המקבל מאשר כי הפרת הסכם זה עלולה לגרום לחברה נזק בלתי הפיך שקשה לאומדו, וכי הסעד הכספי לבדו עלול שלא להיות מספק. לפיכך, החברה תהיה זכאית לסעדים של צו מניעה וצו עשה בנוסף לכל סעד אחר העומד לה על פי דין.')
    + P('אין באמור לעיל כדי לגרוע מזכות החברה לתבוע פיצויים בגין נזקים שנגרמו לה עקב הפרת ההסכם.')
    + H('8. כללי')
    + P('הסכם זה ממצה את ההסכמות בין הצדדים בכל הנוגע לסודיות, וגובר על כל הסכמה או מצג קודם בנושא.')
    + P('כל שינוי או תיקון להסכם זה יהיה בתוקף רק אם נעשה בכתב ונחתם על ידי שני הצדדים.')
    + P('אין בהסכם זה כדי ליצור יחסי שותפות, סוכנות, עובד ומעביד או מיזם משותף בין הצדדים.')
    + P('בטלותה או אי אכיפותה של הוראה כלשהי בהסכם זה לא תפגע ביתר ההוראות, אשר ימשיכו לעמוד בתוקפן.')
    + P('המקבל לא יעביר את זכויותיו או חובותיו על פי הסכם זה ללא הסכמת החברה מראש ובכתב.')
    + H('9. דין וסמכות שיפוט')
    + P('על הסכם זה יחול הדין הישראלי בלבד.')
    + P('סמכות השיפוט הבלעדית בכל מחלוקת הנובעת מהסכם זה או הקשורה אליו תהיה נתונה לבית המשפט המוסמך לפי מקום מושבה של IT Solution.')
    + P('ולראיה באו הצדדים על החתום:')
    + '<div class="sigs"><div class="sg"><b>החברה (המגלה):</b><br>שם: ' + v('name') + '<br>תפקיד: ' + v('role') + '<br>תאריך: ' + v('date') + '<div class="sgi">' + v('sig') + '</div></div>'
    + '<div class="sg"><b>IT Solution (המקבל):</b><br>שם: ' + v('itsName') + '<br>תפקיד: ' + v('itsRole') + '<br>תאריך: ' + v('itsDate') + '<div class="sgi">' + v('itsSig') + '</div></div></div>'
    + '</div>';
}
const BLANK = '<span class="bl">&nbsp;</span>';
function filler(vals) { return (k) => (k === 'sig' || k === 'itsSig') ? (vals[k] ? '<img src="' + vals[k] + '" alt="חתימה">' : '') : (vals[k] ? '<u>' + esc(vals[k]) + '</u>' : BLANK); }

const DOC_CSS = '.doc{background:#fff;border-radius:14px;padding:22px 20px;font:400 15.5px/1.75 Heebo;color:#0f1b2a}'
  + '.doc h2{font:900 22px Heebo;text-align:center;margin:0 0 2px}.doc .c{text-align:center;margin:2px 0}.doc h3{font:800 16.5px Heebo;margin:18px 0 4px}.doc p{margin:6px 0}'
  + '.doc .party{margin:12px 0;line-height:1.7}.doc u{text-decoration:none;border-bottom:1.5px solid #0f1b2a;padding:0 4px;font-weight:700}'
  + '.doc .bl{display:inline-block;min-width:120px;border-bottom:1.5px solid #0f1b2a}.doc .hi{background:#cffafe;border-bottom:2px solid #06b6d4;padding:0 6px;border-radius:4px;color:#0e7490;font-weight:700}'
  + '.doc .sigs{display:flex;gap:18px;margin-top:16px;flex-wrap:wrap}.doc .sg{flex:1;min-width:220px;line-height:1.9}.doc .sgi{height:80px;margin-top:4px;border-bottom:1.5px solid #0f1b2a}.doc .sgi img{max-height:78px;max-width:100%}';
const CSS = '*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#0f1b2a;font-family:Heebo,sans-serif}'
  + '.wrap{max-width:680px;margin:0 auto;padding:18px 16px 48px}.brand{font:900 15px Heebo;letter-spacing:.5px;color:#0e7490;margin:0 0 4px}'
  + 'h1{font:900 23px/1.25 Heebo;margin:4px 0 6px}.sub{font:400 15px/1.6 Heebo;color:#24364b;margin:0 0 6px}'
  + '.step{font:800 17px Heebo;margin:22px 0 10px}.step i{font-style:normal;display:inline-flex;width:28px;height:28px;border-radius:50%;background:#0f1b2a;color:#fff;align-items:center;justify-content:center;font:800 14px Heebo;margin-left:8px}'
  + '.jump{display:block;width:100%;background:#fff;border:2px solid #0f1b2a;border-radius:14px;padding:12px;font:800 15.5px Heebo;color:#0f1b2a;margin:0 0 12px;cursor:pointer}'
  + 'label{display:block;font:700 14.5px Heebo;margin:12px 0 5px}'
  + 'input[type=text]{width:100%;font:500 17px Heebo;padding:12px 14px;border:2px solid #e2e8f0;border-radius:14px;background:#fff;color:#0f1b2a}input[type=text]:focus{outline:none;border-color:#06b6d4}'
  + '.pad{background:#fff;border:2px dashed #94a3b8;border-radius:16px;position:relative;touch-action:none}.pad canvas{display:block;width:100%;height:200px;touch-action:none}'
  + '.pad .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 17px Heebo;color:#94a3b8;pointer-events:none}'
  + '.clr{background:none;border:0;color:#0e7490;font:700 14.5px Heebo;padding:8px 0;cursor:pointer}'
  + '.ok{display:flex;gap:10px;align-items:flex-start;margin-top:14px;font:500 15.5px/1.5 Heebo}.ok input{width:22px;height:22px;flex:none;margin-top:2px}'
  + '.go{display:block;width:100%;margin-top:16px;background:#06b6d4;color:#0f1b2a;border:0;border-radius:16px;padding:17px;font:900 19px Heebo;cursor:pointer}.go:disabled{background:#cbd5e1;color:#6b7c90}'
  + '.err{color:#b91c1c;font:700 14.5px Heebo;margin-top:10px;min-height:1em}'
  + '.done{background:#fff;border-radius:20px;padding:24px 18px;text-align:center;margin:10px 0}.done .big{font-size:50px}.done h2{font:900 22px Heebo;margin:6px 0}.done p{font:400 15.5px/1.6 Heebo;color:#24364b;margin:6px 0}'
  + '.dl{display:block;margin-top:14px;background:#0f1b2a;color:#fff;border-radius:14px;padding:14px;font:800 16px Heebo;text-decoration:none;text-align:center}' + DOC_CSS;
function head(title) {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>' + esc(title) + '</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet"><style>' + CSS + '</style></head><body><div class="wrap"><div class="brand">IT Solution</div>';
}
// The signature pad and a POST helper, shared by both pages.
const PAD_JS = 'var cv=$("cv"),cx=cv.getContext("2d"),dn=false,inked=false,fw=-1;'
  + 'function fit(force){var r=cv.getBoundingClientRect(),k=window.devicePixelRatio||1;if(!force&&Math.round(r.width)===fw)return;fw=Math.round(r.width);var img=inked?cv.toDataURL():null;cv.width=r.width*k;cv.height=r.height*k;cx.setTransform(k,0,0,k,0,0);cx.lineWidth=2.8;cx.lineCap="round";cx.lineJoin="round";cx.strokeStyle="#0f1b5a";if(img){var im=new Image();im.onload=function(){cx.drawImage(im,0,0,r.width,r.height)};im.src=img}}'
  + 'fit();window.addEventListener("resize",function(){fit()});function pt(e){var r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}'
  + 'cv.addEventListener("pointerdown",function(e){dn=true;cv.setPointerCapture(e.pointerId);var p=pt(e);cx.beginPath();cx.moveTo(p[0],p[1]);cx.lineTo(p[0]+.1,p[1]+.1);cx.stroke();inked=true;$("ph").style.display="none";e.preventDefault()});'
  + 'cv.addEventListener("pointermove",function(e){if(!dn)return;var p=pt(e);cx.lineTo(p[0],p[1]);cx.stroke();e.preventDefault()});'
  + 'cv.addEventListener("pointerup",function(){dn=false});cv.addEventListener("pointercancel",function(){dn=false});'
  + '$("clr").onclick=function(){cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);fit(true);inked=false;$("ph").style.display="flex"};'
  + 'function post(o){return fetch("/api/nda",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)}).then(function(r){return r.json()})}';
function padHtml() {
  return '<label>חתימה</label><div class="pad"><canvas id="cv"></canvas><div class="ph" id="ph">✍️ חותמים כאן עם האצבע</div></div><button class="clr" id="clr" type="button">🔄 למחוק ולחתום מחדש</button>';
}
function field(id, label, ph, val) { return '<label for="' + id + '">' + label + '</label><input type="text" id="' + id + '" maxlength="80" placeholder="' + esc(ph || '') + '" value="' + esc(val || '') + '">'; }

function clientPage(d) {
  const o = owner(d), n = nowIL();
  let h = head(d.def.title) + '<h1>' + esc(d.def.title) + '</h1>';
  if (!o) return h + '<div class="done"><div class="big">⏳</div><h2>המסמך עוד לא מוכן לחתימה</h2><p>נעדכן אותך ברגע שהוא מוכן.</p></div></div></body></html>';
  const live = { day: n.d, month: MONTHS[+n.m - 1], year: n.y, itsAddr: o.addr, itsName: o.name, itsRole: o.role, itsDate: n.date, itsSig: o.sig, date: n.date };
  const v = (k) => ['co', 'id', 'addr', 'name', 'role'].indexOf(k) > -1 ? '<span class="hi" data-k="' + k + '">ימולא למטה</span>' : filler(live)(k);
  h += '<p class="sub">קוראים את ההסכם, ממלאים את פרטי החברה למטה וחותמים עם האצבע. מקבלים מיד עותק חתום.</p>'
    + '<div id="mine"></div><button class="jump" id="jump">⬇️ ישר למילוי ולחתימה</button>'
    + '<div class="step"><i>1</i>קוראים את ההסכם</div>' + agreement(v)
    + '<div id="form"><div class="step" id="sg"><i>2</i>פרטי החברה וחתימה</div>'
    + field('co', 'שם החברה או העסק', '') + field('id', 'ח.פ. או ע.מ.', '') + field('addr', 'כתובת', 'רחוב, מספר ועיר')
    + field('name', 'שם החותם', '') + field('role', 'תפקיד', 'למשל מנכ״ל, בעלים')
    + padHtml()
    + '<label class="ok"><input type="checkbox" id="agree"><span>קראתי את ההסכם ואני מאשר אותו בשם החברה</span></label>'
    + '<button class="go" id="go" type="button">✍️ חתימה ושליחה</button><div class="err" id="err"></div></div>'
    + '<script>(function(){var T="' + d.def.shareTok + '";function $(i){return document.getElementById(i)}' + PAD_JS
    + '$("jump").onclick=function(){$("sg").scrollIntoView({behavior:"smooth"})};'
    + '["co","id","addr","name","role"].forEach(function(k){$(k).addEventListener("input",function(){var s=document.querySelector(\'[data-k="\'+k+\'"]\');if(s)s.textContent=this.value.trim()||"ימולא למטה"})});'
    + 'var done=null;try{done=JSON.parse(localStorage.getItem("nda:"+T)||"null")}catch(e){}'
    + 'if(done&&done.tok){$("mine").innerHTML=\'<div class="done"><div class="big">✅</div><h2>כבר חתמת על ההסכם</h2><p>\'+(done.co||"")+\'</p><a class="dl" href="/n/\'+done.tok+\'/signed">📄 העותק החתום שלך</a></div>\'}'
    + 'try{if(!localStorage.getItem("ndaOpen:"+T)){localStorage.setItem("ndaOpen:"+T,"1");post({tok:T,open:true}).catch(function(){})}}catch(e){}'
    + '$("go").onclick=function(){var er=$("err"),f={};for(var k of ["co","id","addr","name","role"]){f[k]=$(k).value.trim();if(f[k].length<2){er.textContent="חסר: "+document.querySelector(\'label[for="\'+k+\'"]\').textContent;$(k).focus();return}}'
    + 'if(!inked){er.textContent="צריך לחתום עם האצבע בתוך המסגרת";return}if(!$("agree").checked){er.textContent="צריך לסמן שקראת ואתה מאשר";return}'
    + 'er.textContent="";var g=$("go");g.disabled=true;g.textContent="שולח ומפיק עותק חתום...";'
    + 'post({tok:T,f:f,sig:cv.toDataURL("image/png")}).then(function(j){if(!j.ok)throw 0;try{localStorage.setItem("nda:"+T,JSON.stringify({tok:j.tok,co:f.co}))}catch(e){}'
    + '$("form").innerHTML=\'<div class="done"><div class="big">✅</div><h2>חתמת, תודה</h2><p>ההסכם החתום נשלח ל IT Solution.</p><a class="dl" href="/n/\'+j.tok+\'/signed">📄 העותק החתום שלך (PDF)</a></div>\';$("form").scrollIntoView({behavior:"smooth"})})'
    + '.catch(function(){g.disabled=false;g.textContent="✍️ חתימה ושליחה";er.textContent="השליחה לא עברה. בדוק את החיבור לאינטרנט ונסה שוב."})};'
    + '})();</script>';
  return h + '</div></body></html>';
}

function ownerPage(d) {
  const o = owner(d) || {}, list = signedList(d);
  let h = head('IT Solution, חתימה על ' + d.def.title) + '<h1>' + esc(d.def.title) + ': החתימה של IT Solution</h1>'
    + '<p class="sub">חותמים פעם אחת. החתימה והפרטים האלה נכנסים לכל הסכם שלקוח חותם עליו. אפשר לחתום מחדש מתי שרוצים, וזה משפיע רק על הסכמים חדשים.</p>';
  if (o.sig) h += '<div class="done"><div class="big">✅</div><h2>חתמת בשם IT Solution</h2><p>' + esc(o.name) + ', ' + esc(o.role) + '</p><img src="' + o.sig + '" alt="" style="max-height:80px"></div>';
  h += '<p class="sub">' + (list.length ? 'לקוחות שחתמו: ' + list.length + '. ' : 'עוד אף לקוח לא חתם. ') + 'פתחו את הקישור ללקוחות: ' + (readJson(path.join(d.dir, 'stats.json'), {}).opens || 0) + '.</p>'
    + '<div class="step"><i>' + (o.sig ? '🔄' : '1') + '</i>' + (o.sig ? 'לעדכן את הפרטים או את החתימה' : 'הפרטים של IT Solution וחתימה') + '</div>'
    + field('itsName', 'שם החותם', '', o.name) + field('itsRole', 'תפקיד', 'למשל בעלים', o.role) + field('itsAddr', 'כתובת העסק', 'רחוב, מספר ועיר', o.addr)
    + padHtml() + '<button class="go" id="go" type="button">✍️ לשמור את החתימה של IT Solution</button><div class="err" id="err"></div>'
    + '<script>(function(){var T="' + d.def.ownerTok + '";function $(i){return document.getElementById(i)}' + PAD_JS
    + '$("go").onclick=function(){var er=$("err"),f={};for(var k of ["itsName","itsRole","itsAddr"]){f[k]=$(k).value.trim();if(f[k].length<2){er.textContent="חסר: "+document.querySelector(\'label[for="\'+k+\'"]\').textContent;$(k).focus();return}}'
    + 'if(!inked){er.textContent="צריך לחתום עם האצבע בתוך המסגרת";return}var g=$("go");g.disabled=true;g.textContent="שומר...";'
    + 'post({tok:T,f:f,sig:cv.toDataURL("image/png")}).then(function(j){if(!j.ok)throw 0;location.reload()}).catch(function(){g.disabled=false;g.textContent="✍️ לשמור את החתימה של IT Solution";er.textContent="השמירה לא עברה, נסה שוב."})};'
    + '})();</script>';
  return h + '</div></body></html>';
}

function signedList(d) {
  let fl = []; try { fl = fs.readdirSync(path.join(d.dir, 'signed')).filter((x) => /\.json$/.test(x)); } catch (e) {}
  return fl.map((x) => readJson(path.join(d.dir, 'signed', x), null)).filter(Boolean).sort((a, b) => String(b.signedAt).localeCompare(String(a.signedAt)));
}

// The printable agreement: vals filled, or blank lines everywhere for the empty copy.
function printHtml(vals) {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800;900&display=swap" rel="stylesheet"><style>'
    + '@page{size:A4;margin:16mm 16mm 18mm}body{margin:0;font-family:Heebo,sans-serif;color:#0f1b2a}' + DOC_CSS
    + '.doc{border-radius:0;padding:0;font-size:11.5pt;line-height:1.6}.doc h2{font-size:17pt}.doc h3{font-size:12pt;break-after:avoid}.sigs{break-inside:avoid}'
    + '.audit{margin-top:18px;border-top:1px solid #cbd5e1;padding-top:8px;font:400 8.5pt/1.5 Heebo;color:#475569;break-inside:avoid}.brand{font:900 11pt Heebo;color:#0e7490;margin-bottom:6px}'
    + '</style></head><body><div class="brand">IT Solution</div>' + agreement(filler(vals)) + (vals.audit ? '<div class="audit">' + vals.audit + '</div>' : '') + '</body></html>';
}
function toPdf(html, out, cb) {
  const tmp = out.replace(/\.pdf$/, '.html');
  fs.writeFileSync(tmp, html);
  execFile('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000', '--print-to-pdf=' + out, 'file://' + tmp], { timeout: 90000 }, (e) => {
    try { fs.unlinkSync(tmp); } catch (x) {}
    cb(e || (fs.existsSync(out) ? null : new Error('no pdf')));
  });
}
function blankPdf(d, cb) {
  const out = path.join(d.dir, 'blank.pdf');
  toPdf(printHtml({}), out, (e) => { if (!e && d.def.blankOut) { try { fs.copyFileSync(out, path.join(PRIV, d.def.blankOut)); } catch (x) {} } cb && cb(e); });
}

function serve(tok, sub, s) {
  const d = find(tok);
  const nf = () => { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); s.end('הקישור לא נמצא'); };
  if (!d) return nf();
  const html = (b) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); s.end(b); };
  const pdf = (f, name) => { if (!fs.existsSync(f)) return nf(); s.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="' + name + '"', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(s); };
  if (d.kind === 'share' && !sub) return html(clientPage(d));
  if (d.kind === 'share' && sub === 'pdf') return pdf(path.join(d.dir, 'blank.pdf'), 'it-solution-nda.pdf');
  if (d.kind === 'owner' && !sub) return html(ownerPage(d));
  if (d.kind === 'signed' && sub === 'signed') return pdf(path.join(d.dir, 'signed', d.tok + '.pdf'), 'nda-signed.pdf');
  nf();
}

let dayCount = { day: '', n: 0 };
function handlePost(b, notify, ip, ua, done) {
  const d = find(b && b.tok);
  if (!d || d.kind === 'signed') return done({ status: 404, body: { ok: false } });
  const clean = (x, n) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n || 80);
  const sig = String(b.sig || ''), sigOk = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 500000;
  if (d.kind === 'share' && b.open) {
    // 5.11 (iron rule, analytics): every open is counted; Itzik hears of it once per device.
    const sf = path.join(d.dir, 'stats.json'), st = readJson(sf, {}), now = new Date().toISOString();
    st.opens = (st.opens || 0) + 1; st.firstOpen = st.firstOpen || now; st.lastOpen = now; writeJson(sf, st);
    notify('הסכם סודיות', 'מישהו פתח את הסכם הסודיות לחתימה (פתיחה ' + st.opens + ').');
    return done({ status: 200, body: { ok: true } });
  }
  const f = b.f || {};
  if (d.kind === 'owner') {
    const o = { name: clean(f.itsName), role: clean(f.itsRole), addr: clean(f.itsAddr), sig, at: new Date().toISOString() };
    if (o.name.length < 2 || o.role.length < 2 || o.addr.length < 2 || !sigOk) return done({ status: 400, body: { ok: false } });
    writeJson(path.join(d.dir, 'owner.json'), o);
    execFile('node', [path.join(__dirname, 'push.js'), 'nda: IT Solution חתם'], { cwd: __dirname, timeout: 180000 }, () => {});
    return done({ status: 200, body: { ok: true } });
  }
  // A client signs.
  const o = owner(d); if (!o) return done({ status: 409, body: { ok: false } });
  const c = { co: clean(f.co), id: clean(f.id, 30), addr: clean(f.addr), name: clean(f.name), role: clean(f.role) };
  if (Object.keys(c).some((k) => c[k].length < 2) || !sigOk) return done({ status: 400, body: { ok: false } });
  const n = nowIL(); if (dayCount.day !== n.date) dayCount = { day: n.date, n: 0 };
  if (++dayCount.n > 30) return done({ status: 429, body: { ok: false } });
  const tok = crypto.randomBytes(10).toString('hex'), out = 'nda-' + n.y + n.m + n.d + '-' + tok.slice(0, 6) + '.pdf';
  const rec = { f: c, sig, date: n.date, time: n.time, signedAt: new Date().toISOString(), ip: String(ip || ''), ua: clean(ua, 300), out, owner: { name: o.name, role: o.role, at: o.at } };
  const docHash = crypto.createHash('sha256').update(printHtml({})).digest('hex').slice(0, 16);
  const vals = Object.assign({}, c, { day: n.d, month: MONTHS[+n.m - 1], year: n.y, date: n.date, sig, itsAddr: o.addr, itsName: o.name, itsRole: o.role, itsDate: n.date, itsSig: o.sig,
    audit: 'נחתם דיגיטלית ב <bdi>form.it-solution.co.il</bdi> ב <bdi>' + esc(n.date) + '</bdi> בשעה <bdi>' + esc(n.time) + '</bdi> (שעון ישראל).<br>כתובת IP של החותם: <bdi dir="ltr">' + esc(rec.ip || 'לא ידועה') + '</bdi> · מזהה ההסכם: <bdi dir="ltr">' + tok + '</bdi> · טביעת נוסח ההסכם: <bdi dir="ltr">' + docHash + '</bdi>' });
  writeJson(path.join(d.dir, 'signed', tok + '.json'), rec);
  const pdfPath = path.join(d.dir, 'signed', tok + '.pdf');
  toPdf(printHtml(vals), pdfPath, (e) => {
    try { require('./lib/handle.js').complete({ key: 'nda:' + tok, kind: 'nda', who: c.co, title: 'חתם על הסכם הסודיות', link: 'biz' }); } catch (x) { /* the push still goes out */ }
    if (e) { notify('הסכם סודיות', c.co + ' חתם על הסכם הסודיות, אבל הפקת ה PDF נכשלה: ' + e.message); return done({ status: 200, body: { ok: true, tok } }); }
    try { fs.copyFileSync(pdfPath, path.join(PRIV, out)); } catch (x) {}
    execFile('node', [path.join(__dirname, 'push.js'), 'nda: ' + out], { cwd: __dirname, timeout: 180000 }, () => {});
    notify('הסכם סודיות', '✍️ ' + c.co + ' חתם על הסכם הסודיות (' + n.date + ', ' + n.time + '). חתם: ' + c.name + ', ' + c.role + '.\nההסכם החתום במוניטור: 💼 העסק שלי ← 💻 IT Solution.');
    done({ status: 200, body: { ok: true, tok } });
  });
}

// For the monitor (build.js): the owner state, the links and every signed copy, newest first.
function state() {
  const d = docs()[0]; if (!d) return null;
  const o = owner(d), st = readJson(path.join(d.dir, 'stats.json'), {});
  return { owner: !!(o && o.sig), ownerAt: o && o.at, share: 'https://form.it-solution.co.il/n/' + d.def.shareTok, own: 'https://form.it-solution.co.il/n/' + d.def.ownerTok,
    blank: d.def.blankOut, opens: st.opens || 0, lastOpen: st.lastOpen || '',
    signed: signedList(d).map((r) => ({ co: r.f.co, name: r.f.name, at: r.signedAt, file: r.out })) };
}

module.exports = { serve, handlePost, state, blankPdf, find };
