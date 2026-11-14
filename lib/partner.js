'use strict';
/*
  14.11.2026, Itzik: "התחייבתי בפרסומים שגם עושים קמפיינים. אז אם הפייסבוק לא מחובר, איך זה יקרה באופן אוטומטי?"
  Until Meta's App Review, a customer can not connect Facebook through our app. The agency way works today:
  the customer adds IT Solution (business 2131000707784066) as a partner in his own Meta business settings and
  shares his Page and ad account. Our system user (ai-poster) already holds every permission on our own app.

    1. 🔌 in his monitor links to wa.abaitzik.com/api/partner?t=<tenant>&c=<his code>: four steps, and a field
       for the link to his Page. The claim is kept in data/partner/claims/<tenant>.json.
    2. partner-sync.js (cron, every 10 minutes) lists the Pages and ad accounts shared with our business,
       matches a claimed Page by id, user name or link, takes the ad accounts of the same owner business,
       assigns our system user to them, and registers the customer for the ad report (data/ads/sources.json),
       the private messages (data/social-dm/tenants.json) and leads. He gets a message in his monitor.
  Pure helpers here; the network and the files are in partner-sync.js.
*/
const BIZ = '2131000707784066';
const SYSUSER = '61596280745260';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// What he pasted: a Page link, a user name or a numeric id. Returns { id } or { name } or null.
function pageRef(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (/^\d{6,20}$/.test(s)) return { id: s };
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { u = null; }
  if (u && /(^|\.)(facebook|fb)\.com$/i.test(u.hostname)) {
    const qid = u.searchParams.get('id');
    if (qid && /^\d{6,20}$/.test(qid)) return { id: qid };
    const parts = u.pathname.split('/').filter(Boolean);
    const num = parts.find((p) => /^\d{6,20}$/.test(p));
    if (num) return { id: num };
    const first = (parts[0] || '').replace(/[^A-Za-z0-9.]/g, '');
    if (first && !/^(pages|people|profile\.php|groups|watch|share)$/i.test(parts[0])) return { name: first.toLowerCase() };
    return null;
  }
  if (/^[A-Za-z0-9.]{3,80}$/.test(s)) return { name: s.toLowerCase() };
  return null;
}

// The shared Page this claim points at, from client_pages ({ id, name, username, link, business }).
function match(ref, pages) {
  if (!ref) return null;
  return (pages || []).find((p) => {
    if (ref.id) return String(p.id) === ref.id;
    const user = String(p.username || '').toLowerCase();
    let linkName = ''; try { linkName = new URL(p.link).pathname.split('/').filter(Boolean)[0].toLowerCase(); } catch (e) {}
    return user === ref.name || linkName === ref.name;
  }) || null;
}
// The ad accounts that belong to the same owner business as the Page.
function adsOf(page, accounts) {
  const b = page && page.business && page.business.id;
  if (!b) return [];
  return (accounts || []).filter((a) => a.business && String(a.business.id) === String(b)).map((a) => a.id);
}

function page(t, c, claim, link) {
  const done = link && link.pageId;
  const st = done ? '<div class="ok">✅ מחובר: ' + esc(link.pageName) + (link.adAccounts && link.adAccounts.length ? ' · ' + link.adAccounts.length + ' חשבונות מודעות' : '') + '</div>'
    : claim ? '<div class="wait">⏳ קיבלנו את הקישור לדף. ברגע שהשיתוף שלך יגיע אלינו (עד 10 דקות אחרי שתסיים את הצעדים), הכל יתחבר לבד ותקבל הודעה במוניטור.</div>' : '';
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    + '<title>חיבור פייסבוק ואינסטגרם</title><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800&display=swap" rel="stylesheet"><style>'
    + '*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#1c2430;font:16px/1.6 Heebo,Arial,sans-serif}main{max-width:560px;margin:0 auto;padding:18px 16px 50px}'
    + 'h1{font-size:24px;margin:6px 0}.c{background:#fff;border-radius:16px;padding:16px;margin:0 0 14px;box-shadow:0 1px 3px rgba(0,0,0,.08)}ol{padding-inline-start:22px}li{margin:6px 0}'
    + '.id{direction:ltr;display:inline-block;background:#eef2ff;border-radius:8px;padding:2px 10px;font-weight:800;letter-spacing:.5px}button.cp{border:0;background:#e0e7ff;border-radius:8px;padding:4px 10px;font:inherit;cursor:pointer;margin-inline-start:6px}'
    + 'input{width:100%;font:inherit;padding:12px;border:1.5px solid #cbd5e1;border-radius:10px;direction:ltr}.go{width:100%;margin-top:10px;padding:14px;border:0;border-radius:12px;background:#1877f2;color:#fff;font:800 17px Heebo,Arial,sans-serif;cursor:pointer}'
    + '.ok{background:#ecfdf5;border:1.5px solid #16a34a;border-radius:12px;padding:12px;margin-bottom:12px}.wait{background:#fffbeb;border:1.5px solid #f59e0b;border-radius:12px;padding:12px;margin-bottom:12px}small{color:#64748b}.err{color:#b91c1c}'
    + '</style></head><body><main><h1>📘 חיבור פייסבוק ואינסטגרם</h1>' + st
    + '<div class="c"><b>למה ככה?</b><br>כך עובדים מול סוכנות פרסום: אתה נותן ל IT Solution גישת שותף לדף ולחשבון המודעות שלך. הסיסמה נשארת אצלך, ואפשר לבטל בכל רגע מאותו מסך.</div>'
    + '<div class="c"><b>4 צעדים, בערך 3 דקות, מהמחשב:</b><ol>'
    + '<li>נכנסים ל <a href="https://business.facebook.com/settings/partners" target="_blank" rel="noopener">הגדרות העסק במטא ← שותפים</a>.</li>'
    + '<li>לוחצים <b>הוספה</b> ← <b>לתת לשותף גישה לנכסים שלך</b>, ומדביקים את מספר העסק שלנו: <span class="id" id="biz">' + BIZ + '</span><button type="button" class="cp" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + BIZ + '\');this.textContent=\'הועתק\'">להעתיק</button></li>'
    + '<li>בוחרים את <b>הדף</b> שלך ומסמנים גישה מלאה (כולל הודעות ופרסום). ממשיכים, ובוחרים את <b>חשבון המודעות</b> עם ניהול קמפיינים. אם יש אינסטגרם עסקי מקושר לדף, הוא מגיע איתו.</li>'
    + '<li>מדביקים כאן את הקישור לדף הפייסבוק שלך, ולוחצים שמירה.</li></ol>'
    + '<form method="post" action="/api/partner/claim"><input type="hidden" name="t" value="' + esc(t) + '"><input type="hidden" name="c" value="' + esc(c) + '">'
    + '<input name="page" placeholder="https://www.facebook.com/השם-של-הדף" value="' + esc(claim ? claim.input : '') + '" required>'
    + '<button class="go" type="submit">שמירה</button></form><small>זה הכל. כשהשיתוף מגיע, המוניטור מתחבר לבד: דוח הקמפיינים, לידים, והודעות עם תשובה מוצעת. שום דבר לא יוצא ולא מתפרסם בלי אישור שלך.</small></div>'
    + '</main></body></html>';
}

module.exports = { BIZ, SYSUSER, pageRef, match, adsOf, page, esc };
