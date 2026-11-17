'use strict';
/*
  17.11.2026, the short signup: four questions on /start, and "8 השאלות האחרות של ההרשמה עוברות לכרטיס 🚀 בוא נתחיל
  בתוך המוניטור" (the audit Itzik approved). A customer's page asks the server (wa-bridge /api/start/more, by the
  page's visit key) which of them have no answer, and asks them one by one in a card under the first steps card.
  Every answer goes back at once; signup-personalize.js applies it within a minute, as if given at signup.
  Not on Itzik's own monitor, not in the public demo. The questions and options are the signup page's own.
  Plain JS, put inside the page's main script after agents-ui.js; no backticks and no dollar-brace in it.
*/
const Q = [
  { k: 'bizName', t: 'text', h: 'איך קוראים לעסק שלך?', ph: 'למשל: הקליניקה של דנה' },
  { k: 'team', t: 'one', h: 'כמה אתם בעסק?', o: [['solo', '🙋', 'רק אני'], ['small', '👥', '2 עד 5'], ['big', '🏢', '6 ומעלה']] },
  { k: 'from', t: 'multi', h: 'מאיפה מגיעים אליך לקוחות?', s: 'אפשר לבחור כמה.', o: [['wa', '💬', 'וואטסאפ'], ['phone', '📞', 'טלפון'], ['site', '🌐', 'האתר'], ['social', '📸', 'אינסטגרם ופייסבוק'], ['refer', '🤝', 'המלצות']] },
  { k: 'tools', t: 'multi', h: 'איפה אתה מנהל את זה היום?', s: 'בלי בושה, אצל רוב העסקים זה בראש ובמחברת.', o: [['head', '🧠', 'בראש'], ['paper', '📒', 'מחברת'], ['excel', '📊', 'אקסל'], ['soft', '💻', 'תוכנה או CRM'], ['acct', '🧮', 'הנהלת חשבונות']] },
  { k: 'start', t: 'one', h: 'מתי מתחיל לך היום?', s: 'באותה שעה תקבל ממני בוקר טוב ומה יש לך היום.', o: [['06', '🌅', '06:00'], ['07', '☕', '07:00'], ['08', '☀️', '08:00'], ['09', '🕘', '09:00']] },
  { k: 'style', t: 'one', h: 'איך תרצה שאענה לך?', o: [['short', '⚡', 'קצר ולעניין'], ['full', '📝', 'מפורט, עם הסבר']] },
  { k: 'personal', t: 'multi', h: 'ועכשיו משהו בשבילך 🏡', s: 'למוניטור יש גם מצב אישי, הצד של הבית. מה לשים בו? תמיד אפשר לשנות.', o: [['shop', '🛒', 'רשימת קניות'], ['doctor', '🩺', 'תורים לרופא'], ['pills', '💊', 'תרופות ומרשמים'], ['bills', '🏠', 'חשבונות הבית'], ['tickets', '🎟️', 'כרטיסים והופעות'], ['dates', '🎂', 'ימי הולדת'], ['docs', '🛂', 'דרכון, רישיון ורכב'], ['growth', '📚', 'קורסים וסדנאות'], ['kidsSchool', '🎒', 'ילדים: גן ובית ספר'], ['kidsTrips', '🚌', 'ילדים: טיולים'], ['kidsHealth', '🧸', 'ילדים: בריאות'], ['kidsSport', '⚽', 'ילדים: ספורט']] },
];

const css = '#moreQ{margin:0 0 14px;padding:14px 16px;border-radius:18px;background:var(--surface,#fff);border:2px solid #6366f1;box-shadow:0 6px 18px rgba(99,102,241,.15);font-family:Heebo,sans-serif;color:var(--ink,#0f1b2a)}'
  + '#moreQ .mqH{display:flex;align-items:center;gap:8px;font:800 17px Heebo,sans-serif}#moreQ .mqH small{margin-inline-start:auto;font:600 12.5px Heebo,sans-serif;color:var(--dim,#64748b)}'
  + '#moreQ .mqBar{height:6px;border-radius:3px;background:#e0e7ff;margin:8px 0 10px;overflow:hidden}#moreQ .mqBar i{display:block;height:100%;background:#6366f1;transition:width .3s}'
  + '#moreQ .mqQ{font:700 16px Heebo,sans-serif;margin:4px 0 2px}#moreQ .mqS{color:var(--dim,#64748b);font-size:13.5px;margin:0 0 8px}'
  + '#moreQ .mqO{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}#moreQ .mqO button{border:1.5px solid #c7d2fe;background:#eef2ff;color:#1e1b4b;border-radius:999px;padding:9px 14px;font:600 15px Heebo,sans-serif;cursor:pointer}'
  + '#moreQ .mqO button.on{background:#6366f1;border-color:#6366f1;color:#fff}#moreQ input{width:100%;box-sizing:border-box;font:400 16px Heebo,sans-serif;padding:11px;border-radius:12px;border:1.5px solid #cbd5e1;margin:6px 0}'
  + '#moreQ .mqA{display:flex;gap:10px;align-items:center;margin-top:6px}#moreQ .mqGo{border:0;border-radius:12px;padding:10px 20px;background:#6366f1;color:#fff;font:800 15px Heebo,sans-serif;cursor:pointer}'
  + '#moreQ .mqSk{border:0;background:none;color:var(--dim,#64748b);font:600 14px Heebo,sans-serif;cursor:pointer;text-decoration:underline}#moreQ .mqLater{margin-inline-start:auto}';

function js(isOwner) {
  if (isOwner) return '';
  return '\n;(function(){\n'
    + 'try{var st=document.createElement("style");st.textContent=' + JSON.stringify(css) + ';document.head.appendChild(st);}catch(e){}\n'
    + 'var Q=' + JSON.stringify(Q) + ';\n'
    // 17.11.2026: D.visitKey is sealed, it is there only after the gate opens and the sealed parts load. Run once on
    // load the card never saw it, so the 8 questions never showed (Itzik, the hagitit7 test). moreStart() runs again
    // from the visits painter in build.js, the same moment visitStart() does.
    + 'var moreOn=false;window.moreStart=function(){\n'
    + 'if(moreOn||window.PUBLIC_DEMO||!window.D||!D.visitKey)return;\n'
    + 'try{if(Date.now()<+(localStorage.getItem("moreLater")||0))return;}catch(e){}\n'
    + 'moreOn=true;\n'
    + 'var API=(D.payApi||"https://wa.abaitzik.com")+"/api/start/more",ask=[],k=0,pick={},box=null;\n'
    + 'function E(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}\n'
    + 'function post(b){b.key=D.visitKey;return fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json();});}\n'
    + 'function place(){var a=document.getElementById("firstSteps");box=document.getElementById("moreQ");if(!box){box=document.createElement("div");box.id="moreQ";}\n'
    + ' if(a&&a.parentNode){if(a.nextSibling!==box)a.parentNode.insertBefore(box,a.nextSibling);}else{var h=document.getElementById("pH");if(!h)return false;if(h.firstChild!==box)h.insertBefore(box,h.firstChild);}return true;}\n'
    + 'function draw(){if(!place())return;if(k>=ask.length){box.innerHTML="<div class=mqH>✓ תודה</div><p class=mqS>תוך דקה המוניטור מתעדכן לפי מה שסיפרת.</p>";setTimeout(function(){box.remove();},6000);return;}\n'
    + ' var q=ask[k],h="<div class=mqH>🚀 בוא נתחיל<small>"+(k+1)+" מתוך "+ask.length+"</small></div><div class=mqBar><i style=width:"+Math.round(k/ask.length*100)+"%></i></div><p class=mqQ>"+E(q.h)+"</p>"+(q.s?"<p class=mqS>"+E(q.s)+"</p>":"");\n'
    + ' if(q.t==="text")h+="<input id=mqIn maxlength=60 placeholder=\\""+E(q.ph||"")+"\\">";\n'
    + ' else h+="<div class=mqO>"+q.o.map(function(o){return "<button type=button data-v=\\""+o[0]+"\\""+((pick[q.k]||[]).indexOf(o[0])>=0?" class=on":"")+">"+o[1]+" "+E(o[2])+"</button>";}).join("")+"</div>";\n'
    + ' h+="<div class=mqA>"+(q.t==="one"?"":"<button type=button class=mqGo data-a=go>המשך</button>")+"<button type=button class=mqSk data-a=skip>לדלג</button><button type=button class=\\"mqSk mqLater\\" data-a=later>לא עכשיו</button></div>";\n'
    + ' box.innerHTML=h;}\n'
    + 'function next(ans,skip){var q=ask[k];var b={};if(skip)b.skipped=[q.k];else{b.answers={};b.answers[q.k]=ans;}post(b).catch(function(){});k++;draw();}\n'
    + 'function wire(){box.onclick=function(e){var t=e.target.closest&&e.target.closest("button");if(!t)return;var q=ask[k];if(!q)return;\n'
    + ' var a=t.getAttribute("data-a"),v=t.getAttribute("data-v");\n'
    + ' if(a==="later"){try{localStorage.setItem("moreLater",String(Date.now()+864e5));}catch(x){}box.remove();return;}\n'
    + ' if(a==="skip")return next(null,true);\n'
    + ' if(v!=null){if(q.t==="one")return next(v);var p=pick[q.k]=pick[q.k]||[];var i=p.indexOf(v);if(i>=0)p.splice(i,1);else p.push(v);t.classList.toggle("on");return;}\n'
    + ' if(a==="go"){if(q.t==="text"){var x=String((document.getElementById("mqIn")||{}).value||"").trim();return x?next(x):next(null,true);}var s=pick[q.k]||[];return s.length?next(s):next(null,true);}};}\n'
    + 'post({}).then(function(j){var want=(j&&j.ask)||[];ask=Q.filter(function(q){return want.indexOf(q.k)>=0;});if(!ask.length)return;if(!place())return;wire();draw();}).catch(function(){moreOn=false;});\n'
    + '};\nmoreStart();\n'
    + '})();\n';
}

module.exports = { js, Q };
