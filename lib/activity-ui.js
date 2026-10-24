'use strict';
/*
  24.10.2026: the "יומן פעולות" screen, Itzik's copy only. The rows and the cost figures come
  from lib/activity-log.js (build.js puts them in D.activity). The screen lives in the ITZIK
  blocks, so a customer's copy keeps only stand-ins. Opened from the settings screen.
*/
const css = `
.act-stats{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.act-stat{flex:1 1 30%;min-width:120px;padding:10px;border-radius:14px;background:var(--surface);border:1px solid var(--line)}
.act-stat small{display:block;color:var(--dim);font:500 12.5px Heebo,sans-serif}
.act-stat b{font:800 19px Heebo,sans-serif;color:var(--ink)}
.act-none{padding:10px 12px;border-radius:14px;background:var(--sunk);font:600 14.5px Heebo,sans-serif;color:var(--dim)}
.act-note{font:400 12.5px/1.5 Heebo,sans-serif;color:var(--dim);margin:4px 0 10px}
.act-row{padding:9px 12px;margin-bottom:6px;border-radius:14px;background:var(--surface);border:1px solid var(--line)}
.act-row b{display:block;font:700 14.5px/1.5 Heebo,sans-serif;color:var(--ink);text-align:start;overflow-wrap:anywhere}
.act-row small{display:block;font:500 12.5px Heebo,sans-serif;color:var(--dim);margin-top:2px}
`;

const html = `<section id="pLg" hidden>
 <h2>יומן פעולות</h2>
 <div class="rephint">מה המוניטור עשה, מהחדש לישן. 50 השורות האחרונות.</div>
 <div id="actSum"></div>
 <div id="actList"></div>
</section>`;

const js = `
function actMoney(v){return (Math.round(Number(v)*10)/10)+' ש״ח';}
function actStat(label,value){return '<div class="act-stat"><small>'+esc(label)+'</small><b>'+value+'</b></div>';}
function renderActLog(){
 var sum=document.getElementById('actSum'),list=document.getElementById('actList');
 if(!sum||!list)return;
 var A=D.activity;
 if(!A||!A.hasCost){
  sum.innerHTML='<div class="act-none">אין עדיין נתוני עלות</div>';
  list.innerHTML=A&&A.rows&&A.rows.length?actRows(A.rows):'<div class="empty">עוד אין פעולות ביומן.</div>';
  return;
 }
 sum.innerHTML='<div class="act-stats">'
  +actStat('היום, בערך',actMoney(A.today))
  +actStat('החודש, בערך',actMoney(A.month))
  +actStat('עלות ממוצעת לבקשה',A.avg==null?'אין עדיין נתוני עלות':actMoney(A.avg))
  +'</div>'
  +'<div class="act-note">הסכומים בערך, לפי מחיר המחירון ב 3.7 ש״ח לדולר. נענו החודש: '+A.answered+' בקשות.</div>';
 list.innerHTML=A.rows.length?actRows(A.rows):'<div class="empty">עוד אין פעולות ביומן.</div>';
}
function actRows(rows){
 return rows.map(function(r){
  var bits=[r.when];
  if(r.model)bits.push(r.model);
  if(r.cost!=null)bits.push('בערך '+actMoney(r.cost));
  return '<div class="act-row"><b>'+esc(r.did)+'</b><small>'+esc(bits.join(' · '))+'</small></div>';
 }).join('');
}
`;

module.exports = { css, html, js };
