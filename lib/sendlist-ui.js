'use strict';
/*
  12.11.2026, Itzik: "📤 הודעות לשליחה" (lib/sendlist.js). The sheet of messages the monitor prepared one by one and HE
  sends from his own WhatsApp. Plain strings; build.js drops css and js into the page as they are, so there is no
  backtick, no dollar brace and no backslash in the js (the template escaping traps in CLAUDE.md).

  The tile gSend is hidden until a list has an unsent row, and then fades teal to amber (taskblink, the shared
  alertfade). A tap on "לשלוח בוואטסאפ" opens wa.me in a new tab, marks the row on this phone at once (localStorage
  sendSent: "<listId>:<idx>" = 0 not yet reported, 1 reported) and reports "📤 נשלח: <listId> <idx>", which listen.js
  writes into the list file with no model. Unreported marks are retried whenever the sheet or the page paints.
  Reads D.sendlist (sealed payload only). Nothing here sends anything by itself.
*/
const css = `
.sdNote{margin:8px 0 12px;padding:10px 12px;border-radius:12px;background:rgba(224,161,0,.16);font:600 14px/1.55 Heebo,sans-serif;text-align:right}
.sdList{margin:14px 0 4px;font:800 15.5px/1.4 Heebo,sans-serif;text-align:right}
.sdList small{display:block;font-weight:500;opacity:.75}
.sdRow{margin:6px 0;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.10);text-align:right}
.sdRow.sdDone{opacity:.72}
.sdHead{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.sdRow details{margin:6px 0 2px;line-height:1.5}
.sdRow summary{cursor:pointer;list-style:none;opacity:.85;font-size:14px;overflow-wrap:anywhere}
.sdRow details[open] summary{display:none}
.sdFull{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14.5px;line-height:1.6}
.sdBtns{display:flex;gap:8px;margin-top:8px;align-items:stretch}
.sdGo{flex:2;display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:14px;background:#1f9d55;color:#fff!important;text-decoration:none;font:800 17px Heebo,sans-serif;text-align:center}
.sdRow.sdDone .sdGo{background:rgba(127,127,127,.25);color:inherit!important;font-weight:600;font-size:14px}
.sdCp{flex:1;min-height:52px;margin:0}
.sdBad{margin-top:6px;font:600 13.5px Heebo,sans-serif;color:#c0392b}
`;

const js = `
var SD_KEY='sendSent',sdBusy=false;
function sdMarks(){try{return JSON.parse(localStorage.getItem(SD_KEY)||'{}')||{};}catch(e){return {};}}
function sdSave(m){try{localStorage.setItem(SD_KEY,JSON.stringify(m));}catch(e){}}
function sdIsSent(l,it,m){return !!it.sentAt||m[l.id+':'+it.i]!==undefined;}
/* How many rows still wait, over every list (a row with no valid phone is not counted: it cannot be sent). */
function sdCount(lists,m){
 var n=0,total=0;
 (lists||[]).forEach(function(l){(l.items||[]).forEach(function(it){total++;if(!it.bad&&!sdIsSent(l,it,m))n++;});});
 return {n:n,total:total};
}
function sdRowHtml(l,it,m){
 var done=sdIsSent(l,it,m),pre=String(it.text||'').split(String.fromCharCode(10)).join(' ').slice(0,70);
 return '<div class="sdRow'+(done?' sdDone':'')+'">'
  +'<div class="sdHead"><b>'+(done?'✓ ':'')+esc(it.name)+'</b><small>'+esc(it.phoneMask||'אין מספר')+'</small></div>'
  +'<details><summary>'+esc(pre)+(String(it.text||'').length>70?'... לפתיחת ההודעה':'')+'</summary><div class="sdFull">'+esc(it.text||'')+'</div></details>'
  +(it.bad?'<div class="sdBad">אין מספר וואטסאפ תקין, אפשר להעתיק את ההודעה ולשלוח ידנית.</div>':'')
  +'<div class="sdBtns">'
  +(it.bad?'':'<a class="sdGo" data-a="go" data-l="'+esc(l.id)+'" data-i="'+it.i+'" href="'+esc(it.link)+'" target="_blank" rel="noopener">'+(done?'נשלח, לשלוח שוב':'לשלוח בוואטסאפ')+'</a>')
  +'<button type="button" class="yb sdCp" data-a="cp" data-l="'+esc(l.id)+'" data-i="'+it.i+'">העתקה</button>'
  +'</div></div>';
}
function sdHtml(lists,m){
 var L=(lists||[]).filter(function(l){return (l.items||[]).length;});
 if(!L.length)return '<small>אין הודעות לשליחה.</small>';
 return L.map(function(l){
  var sent=l.items.filter(function(it){return sdIsSent(l,it,m);}).length;
  return '<div class="sdList">'+esc(l.title)+'<small>'+sent+' מתוך '+l.items.length+' נשלחו'+(l.note?' · '+esc(l.note):'')+'</small></div>'
   +l.items.map(function(it){return sdRowHtml(l,it,m);}).join('');
 }).join('');
}
function sdPaint(){
 var t=document.getElementById('gSend');if(!t)return;
 var c=sdCount(D.sendlist,sdMarks());
 t.hidden=!c.n;
 if(!c.n){t.classList.remove('taskblink');return;}
 t.classList.add('taskblink');
 var b=t.querySelector('b'),sm=t.querySelector('small');
 if(b)b.textContent='📤 הודעות לשליחה · '+c.n;
 if(sm)sm.textContent='מוכנות לך אחת אחת, לחיצה פותחת את הוואטסאפ';
 sdFlush();
}
/* Report the marks the server has not heard yet, one at a time. A failure stays 0 and is tried again on the next paint. */
function sdFlush(){
 if(sdBusy)return;
 var m=sdMarks(),k=Object.keys(m).filter(function(x){return m[x]===0;})[0];
 if(!k)return;
 sdBusy=true;
 var p=k.lastIndexOf(':'),line='📤 נשלח: '+k.slice(0,p)+' '+k.slice(p+1);
 sendText('נשלח',line,'משימה').then(function(){var mm=sdMarks();mm[k]=1;sdSave(mm);sdBusy=false;sdFlush();}).catch(function(){sdBusy=false;});
}
function sdMark(id,i){
 var m=sdMarks(),k=id+':'+i;
 if(m[k]===undefined){m[k]=0;sdSave(m);}
 sdPaint();sdFlush();
}
function sdFind(id,i){
 var l=(D.sendlist||[]).filter(function(x){return x.id===id;})[0];
 return l?l.items[Number(i)]:null;
}
function sdCopy(txt){
 function fb(){var a=document.createElement('textarea');a.value=txt;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();try{document.execCommand('copy');}catch(e){}a.remove();toast('ההודעה הועתקה');}
 try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){toast('ההודעה הועתקה');}).catch(fb);return;}}catch(e){}
 fb();
}
function sdSheet(){
 var old=document.getElementById('sdSheet');if(old)old.remove();
 var w=document.createElement('div');w.id='sdSheet';w.className='ysheet';
 w.setAttribute('role','dialog');w.setAttribute('aria-label','הודעות לשליחה');
 function body(){return sdHtml(D.sendlist,sdMarks());}
 w.innerHTML='<div class="ycard"><b>📤 הודעות לשליחה</b>'
  +'<div class="sdNote">ההודעות יוצאות מהוואטסאפ שלך, בשם שלך. לחיצה פותחת את הצ׳אט עם ההודעה מוכנה, ואתה לוחץ שלח.</div>'
  +'<div id="sdBody">'+body()+'</div><button type="button" class="yb yx" data-a="x">סגירה</button></div>';
 function close(){w.remove();sdPaint();}
 function redraw(){var b=document.getElementById('sdBody');if(b)b.innerHTML=body();sdPaint();}
 w.onclick=function(e){
  var t=e.target;if(t===w)return close();
  while(t&&t!==w&&!(t.getAttribute&&t.getAttribute('data-a')))t=t.parentNode;
  var a=t&&t.getAttribute&&t.getAttribute('data-a');
  if(a==='x')return close();
  if(a==='go'){sdMark(t.getAttribute('data-l'),t.getAttribute('data-i'));setTimeout(redraw,80);return;}
  if(a==='cp'){var it=sdFind(t.getAttribute('data-l'),t.getAttribute('data-i'));if(it)sdCopy(it.text);}
 };
 document.body.appendChild(w);
 sdFlush();
}
on('gSend',function(){sdSheet();setTimeout(sdPaint,60);});
`;

const tile = '<button type="button" class="gt g16" id="gSend" hidden data-new="1"><b>📤 הודעות לשליחה</b><small>מוכנות לך אחת אחת</small></button>';

module.exports = { css, js, tile };
