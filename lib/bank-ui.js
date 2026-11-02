'use strict';
/*
  24.10.2026: the screen behind the home tile "🏦 חיבור הבנק" (gBank), a customer's
  page only. The tile itself is hidden until data/status/features.json says
  {"bank":true} (lib/features.js). Source text: "הדרכה לחיבור הבנק במוניטור.md".
  No password, no login, no automatic connection: the customer downloads the movements
  file and sends it with the normal file send, captioned "קובץ בנק".
  Hebrew only, no dashes of any kind in the text, wording neutral for both genders.
*/
const BANK_SUBJECT = 'קובץ בנק';
const BANK_TEXT = [
  ['h', 'איך מחברים את הבנק?'],
  ['p', 'המוניטור לא נכנס לחשבון הבנק ולא מבקש סיסמה, אף פעם. את הקובץ מורידים מהבנק בעצמך, ואני מסדר ממנו את ההוצאות וההכנסות.'],
  ['s', '1. נכנסים לאתר הבנק מהמחשב. באפליקציה בדרך כלל אי אפשר להוריד קובץ.'],
  ['s', '2. נכנסים למסך התנועות בעובר ושב.'],
  ['s', '3. בוחרים תקופה, למשל שלושת החודשים האחרונים.'],
  ['s', '4. לוחצים על הסמל של אקסל, או על ייצוא, או על הורדה.'],
  ['s', '5. שולחים את הקובץ כאן, בכפתור הגדול שלמטה.'],
  ['p', 'בנק הפועלים: בסרגל העליון נכנסים ללשונית עו״ש, בוחרים תאריכים, ולוחצים על הסמל של אקסל בצד שמאל למעלה.'],
  ['p', 'לא מוצאים את הכפתור? מצלמים את מסך התנועות ושולחים לי. אסמן בדיוק איפה ללחוץ.'],
  ['p', 'כרטיס אשראי: אותו דבר, באתר של חברת האשראי (ישראכרט, כאל, מקס), במסך פירוט העסקאות.'],
  ['p', 'לא שולחים סיסמה או קוד שמגיע בהודעה. אין בזה צורך.'],
];
const BTN = '📎 שליחת קובץ התנועות';

const js = `
boot('bank',function(){
 var t=document.getElementById('gBank');if(!t)return;
 var TXT=${JSON.stringify(BANK_TEXT)};
 t.onclick=function(){
  var w=document.createElement('div');
  w.className='ysheet';w.setAttribute('role','dialog');w.setAttribute('aria-label','חיבור הבנק');
  w.innerHTML='<div class="ycard" style="max-height:88vh;display:flex;flex-direction:column;overflow:hidden"><div style="overflow:auto;flex:1 1 auto;min-height:0">'
   +TXT.map(function(l){
    if(l[0]==='h')return '<b>'+esc(l[1])+'</b>';
    return '<div style="font-size:16px;line-height:1.55;margin-top:'+(l[0]==='s'?'4':'10')+'px">'+esc(l[1])+'</div>';
   }).join('')
   +'</div><button type="button" class="yb" data-a="send" style="flex:0 0 auto;margin-top:12px;width:100%;padding:18px 10px;font-size:19px;font-weight:800;border:0;border-radius:14px;background:#14675a;color:#fff">${BTN}</button>'
   +'<button type="button" class="yb yx" data-a="x">סגירה</button></div>';
  w.onclick=function(e){
   var a=e.target.getAttribute&&e.target.getAttribute('data-a');
   if(e.target===w||a==='x'){w.remove();return;}
   if(a==='send'){
    w.remove();
    // The ordinary file send, nothing new: the caption "${BANK_SUBJECT}" is the subject the worker reads.
    pane('m');
    var cap=document.getElementById('fCap');if(cap)cap.value='${BANK_SUBJECT}';
    openPicker('full','',true);
   }
  };
  document.body.appendChild(w);
 };
});
`;

module.exports = { BANK_SUBJECT, BANK_TEXT, BTN, js };
