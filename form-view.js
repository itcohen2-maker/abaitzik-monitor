'use strict';
/*
  4.11.2026, Itzik: "כל פעם אני רוצה לראות אותם לפני שאני שולח, אז אתה ישר רושם שזה נפתח".
  /f/<token>/view and /s/<token>/view: the live client page, always the current version,
  for Itzik only. Rendered with an empty state, a yellow banner, and fetch replaced so
  nothing is saved, nothing is reported and "פתח" is never marked.
*/
const BANNER = '<div style="background:#fde68a;color:#0f1b2a;font:700 14px Heebo,sans-serif;text-align:center;padding:8px">תצוגה לאיציק בלבד. אפשר ללחוץ, שום דבר לא נשמר, לא נשלח ולא נרשם שנפתח.</div>';
const STUB = '<script>var __n=0;window.fetch=function(u,o){var b={};try{b=JSON.parse(o.body)}catch(e){}var r={ok:true};'
  + 'if(b.ms==="start")r={code:"F7KQ2XLM",url:"https://microsoft.com/devicelogin",minutes:15};'
  + 'if(b.ms==="poll")r=(++__n>2)?{status:"ok",who:"example@example.co.il"}:{status:"pending"};'
  + 'return Promise.resolve({ok:true,json:function(){return Promise.resolve(r);}});};</script>';
function serve(mod, tok, res) {
  let code = 200, head = {}, out = '';
  const fake = { writeHead(c, h) { code = c; head = h || {}; }, end(x) { out = String(x || ''); } };
  require(mod).servePage(tok, fake);
  if (code === 200) {
    out = out.replace(/<body([^>]*)>/, (m, a) => '<body' + a.replace(/class="sent"/, '') + '>' + BANNER);
    out = out.replace('<script>', STUB + '<script>');
    // 5.11: "connect" buttons are real here, so Itzik can try them with his own accounts. They carry
    // v=1, and the provider sends him back to this view, never to the client's page.
    if (/\/oauth\/[a-z]+\/start\?/.test(out)) {
      out = out.replace(/(\/oauth\/[a-z]+\/start\?t=[a-f0-9]+&amp;s=[^"&]+)/g, '$1&amp;v=1');
      out = out.replace(BANNER, BANNER.replace('שום דבר לא נשמר, לא נשלח ולא נרשם שנפתח.', 'לא נרשם שנפתח. כפתורי ההתחברות אמיתיים: מה שמחברים כאן נשמר, ואחרי הבדיקה מאפסים.'));
    }
  }
  res.writeHead(code, Object.assign({}, head, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }));
  res.end(out);
}
module.exports = { serve };
