'use strict';
/*
  24.10.2026: the "מחכה לך" strip at the top of the home screen. It shows the approve
  docs from data/choices (lib/approvals.js normalizes them in build.js). Plain strings,
  build.js drops them into the page as they are. Every action sends one line back
  through sendText, the same channel as the other choices. Nothing is sent before the
  5 second undo runs out. Sits above renderAsk, which skips approve docs.
*/
const css = `
.apv{margin:0 0 14px;padding:16px;border-radius:20px;background:var(--accent);border:0;color:var(--on-accent);box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 35%,transparent)}
.apv[hidden]{display:none}
.apv-head{display:flex;align-items:center;gap:8px;font:800 16px Heebo,sans-serif;margin-bottom:2px}
.apv-n{min-width:26px;height:26px;padding:0 8px;border-radius:13px;background:var(--surface);color:var(--accent);font:800 13px/26px Heebo,sans-serif;text-align:center}
.apv-card{background:color-mix(in srgb,var(--on-accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--on-accent) 25%,transparent);border-radius:14px;padding:12px;margin-top:8px;color:var(--on-accent)}
.apv-q{font:700 15.5px/1.5 Heebo,sans-serif;text-align:start}
.apv-prev{margin-top:6px;padding:9px 11px;border-radius:12px;background:var(--sunk);color:var(--ink);font:400 14.5px/1.6 Heebo,sans-serif;white-space:pre-wrap;text-align:start;overflow-wrap:anywhere}
.apv-exp{margin-top:6px;font:500 12.5px Heebo,sans-serif;color:inherit;opacity:.9}
.apv-more,.apv-whyt{min-height:44px;padding:0 6px;border:0;background:none;color:var(--on-accent);text-decoration:underline;font:700 14px Heebo,sans-serif;cursor:pointer}
.apv-why{margin-top:4px;font:400 14px/1.6 Heebo,sans-serif;color:inherit;opacity:.9;text-align:start}
.apv-why[hidden]{display:none}
.apv-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.apv-btns button{flex:1 1 28%;min-height:46px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:700 15px Heebo,sans-serif;cursor:pointer}
.apv-btns button[disabled]{opacity:.5}
.apv-btns .apv-ok{background:var(--surface);border-color:transparent;color:var(--accent)}
.apv-ta{display:block;width:100%;min-height:120px;box-sizing:border-box;margin-top:8px;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--sunk);color:var(--ink);font:400 15px/1.6 Heebo,sans-serif}
.apv-undo{display:block;width:100%;min-height:46px;margin-top:10px;border:0;border-radius:14px;background:var(--wait);color:#fff;font:800 15px Heebo,sans-serif;cursor:pointer}
`;

const html = `<section id="approvalsBox" class="apv" aria-live="polite" hidden></section>`;

const js = `
var APV_UNDO_MS=5000, APV_SNOOZE_MS=4*60*60*1000;
var apvPending={}, apvEditing={}, apvTimers={}, apvMore={}, apvWhy={};
function apvRead(key){try{var v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'?v:{};}catch(e){return {};}}
function apvWrite(key,v){try{localStorage.setItem(key,JSON.stringify(v));}catch(e){}}
// Open approvals: not answered, not snoozed on this device.
function apvOpen(){
 var done=idList('choicesDone'),snz=apvRead('approvalsSnooze'),now=Date.now();
 return (D.choices||[]).filter(function(c){
  return c.type==='approve'&&done.indexOf(c.id)<0&&!(snz[c.id]>now);
 });
}
function apvHM(iso){
 var d=new Date(iso);if(isNaN(d.getTime()))return '';
 try{return d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jerusalem'});}
 catch(e){return d.getHours()+':'+('0'+d.getMinutes()).slice(-2);}
}
function apvCard(c){
 var full=c.preview||'',long=full.length>160,more=!!apvMore[c.id],why=!!apvWhy[c.id],h='';
 h+='<div class="apv-q">'+esc(c.question)+'</div>';
 if(apvEditing[c.id]){
  h+='<textarea class="apv-ta" dir="auto" aria-label="התיקון">'+esc(full)+'</textarea>'
   +'<div class="apv-btns"><button type="button" class="apv-ok" data-a="send">שלח</button><button type="button" data-a="cancel">ביטול</button></div>';
 }else if(apvPending[c.id]){
  h+='<button type="button" class="apv-undo" data-a="undo">אושר. ביטול</button>';
 }else{
  if(full)h+='<div class="apv-prev" dir="auto">'+esc(long&&!more?full.slice(0,160)+'…':full)+'</div>';
  if(long)h+='<button type="button" class="apv-more" data-a="more" aria-expanded="'+(more?'true':'false')+'">'+(more?'הסתר':'הצג הכול')+'</button>';
  if(c.expires){var t=apvHM(c.expires);if(t)h+='<div class="apv-exp">בתוקף עד '+t+'</div>';}
  if(c.why)h+='<button type="button" class="apv-whyt" data-a="why" aria-expanded="'+(why?'true':'false')+'">למה?</button>'
   +'<div class="apv-why"'+(why?'':' hidden')+'>'+esc(c.why)+'</div>';
  h+='<div class="apv-btns"><button type="button" class="apv-ok" data-a="ok">אשר</button><button type="button" data-a="edit">ערוך</button><button type="button" data-a="later">לא עכשיו</button></div>';
 }
 return h;
}
// One send path for all three actions. "after" replaces the default (mark answered).
function apvSend(c,text,kind,after){
 sendText('תשובה מהמוניטור',text,kind).then(function(){
  delete apvPending[c.id];delete apvEditing[c.id];
  if(after)after();
  else{var d=idList('choicesDone');d.push(c.id);apvWrite('choicesDone',d);}
  toast(kind==='לא עכשיו'?'בסדר, אחזיר את זה אחרי ארבע שעות.':'נשלח.');
  renderApprovals();
 }).catch(function(){
  delete apvPending[c.id];
  toast('לא נשלח. תנסה שוב.');
  renderApprovals();
 });
}
function apvBind(card,c){
 function on(a,fn){var b=card.querySelector('[data-a="'+a+'"]');if(b)b.onclick=fn;}
 on('ok',function(){
  apvPending[c.id]=true;
  apvTimers[c.id]=setTimeout(function(){apvSend(c,'אישור: '+c.question,'אישור');},APV_UNDO_MS);
  renderApprovals();
 });
 on('undo',function(){clearTimeout(apvTimers[c.id]);delete apvPending[c.id];renderApprovals();});
 on('edit',function(){apvEditing[c.id]=true;renderApprovals();});
 on('cancel',function(){delete apvEditing[c.id];renderApprovals();});
 on('send',function(){
  var ta=card.querySelector('.apv-ta'),txt=ta?ta.value.trim():'';
  apvSend(c,'אישור עם תיקון: '+c.question+'\\n'+txt,'אישור');
 });
 on('more',function(){apvMore[c.id]=!apvMore[c.id];renderApprovals();});
 on('why',function(){apvWhy[c.id]=!apvWhy[c.id];renderApprovals();});
 on('later',function(){
  apvSend(c,'לא עכשיו: '+c.question,'לא עכשיו',function(){
   var s=apvRead('approvalsSnooze');s[c.id]=Date.now()+APV_SNOOZE_MS;apvWrite('approvalsSnooze',s);
  });
 });
}
function renderApprovals(){
 var host=document.getElementById('approvalsBox');
 if(!host)return;
 var open=apvOpen();
 if(!open.length){host.hidden=true;host.innerHTML='';return;}
 host.hidden=false;
 host.innerHTML='<div class="apv-head"><b>מחכה לך</b><span class="apv-n">'+open.length+'</span></div>'
  +open.map(function(c){return '<div class="apv-card" data-id="'+esc(c.id)+'">'+apvCard(c)+'</div>';}).join('');
 var cards=host.querySelectorAll('.apv-card');
 for(var i=0;i<open.length;i++)apvBind(cards[i],open[i]);
}
`;

module.exports = { css, html, js };
