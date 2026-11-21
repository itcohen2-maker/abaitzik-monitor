'use strict';
/*
  15.11.2026, Itzik (his sister Rinat got stuck on "Google לא אימתה את האפליקציה הזו" and tapped nowhere):
  under every Google connect button, a small drawing of that warning screen with "מתקדם" circled,
  then the second tap and the third. Our app is under Google review since 11.11; until it is verified
  every client sees this screen. Remove (return '') once Google approves.
  Inline styles only and double quotes only, so the same string works in setup.js and inside build.js page code.
*/
const WARN_HTML = '<div dir="rtl" style="margin:10px 0 4px;padding:12px;border-radius:14px;background:#f8fafc;border:1px solid #cbd5e1;color:#0f172a;font:500 13.5px/1.5 Heebo,sans-serif;text-align:right">'
  + '<b style="display:block;font-size:14.5px;margin-bottom:6px">גוגל יציג אזהרה? ככה עוברים אותה:</b>'
  + '<div style="margin:0 0 6px"><b>1.</b> לא ללחוץ על הכפתור הכחול. ללחוץ על המילה הקטנה <b>מתקדם</b>, למטה משמאל.</div>'
  + '<div style="background:#1f1f1f;color:#e3e3e3;border-radius:10px;padding:10px 12px;margin:0 0 10px">'
  + '<div style="color:#f28b82;font-size:18px;line-height:1">⚠</div>'
  + '<div style="font-size:13px;margin:4px 0 10px">Google לא אימתה את האפליקציה הזו</div>'
  + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
  + '<span style="background:#0b57d0;color:#fff;border-radius:6px;padding:4px 8px;font-size:11.5px;opacity:.55">חזרה למצב בטוח</span>'
  + '<span style="border:2px solid #ef4444;border-radius:999px;padding:2px 10px;color:#a8c7fa;text-decoration:underline;font-weight:700">👈 מתקדם</span>'
  + '</div></div>'
  + '<div style="margin:0 0 6px"><b>2.</b> ייפתחו עוד שורות. ללחוץ על <b>מעבר אל it-solution.co.il (לא בטוח)</b>.</div>'
  + '<div style="margin:0 0 6px"><b>3.</b> לסמן את כל התיבות וללחוץ <b>המשך</b>.</div>'
  + '<div style="font-size:12.5px;color:#475569">האזהרה מופיעה רק כי גוגל עוד בודקת את האפליקציה החדשה שלנו. החיבור בטוח, והגישה נשארת רק אצלך במוניטור.</div>'
  + '</div>';
module.exports = { WARN_HTML };
