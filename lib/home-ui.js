'use strict';
/*
  24.10.2026: the top of the home screen, direction "A + B" (approved by Itzik).
  From the top: the greeting and the since box, the "מחכה לך" card (approvals-ui),
  the morning brief "דוח הבוקר", then a two column bento of numbers. Each part reads
  a field another job writes (D.brief, D.money, D.since) and stays hidden when that
  field is missing, so a page without the data shows nothing new. Plain strings,
  build.js drops them into the page as they are. Brief pills send through sendText,
  the same channel as the other requests.
*/
const css = `
.hm-greet{margin:6px 2px 12px;font:800 22px/1.25 Heebo,sans-serif;color:var(--ink)}
.hm-greet[hidden]{display:none}
.hb{margin:0 0 14px;padding:16px;border-radius:20px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);color:var(--ink)}
.hb[hidden],.hk-grid[hidden],.hm-money[hidden]{display:none}
.hm-money{margin:0 0 14px;border-radius:18px;background:var(--surface);border:1px solid var(--line)}
.hm-money>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:52px;padding:0 16px;font:700 16px Heebo,sans-serif;color:var(--ink);cursor:pointer}
.hm-money>summary::-webkit-details-marker{display:none}
.hm-money>summary small{font:500 13px Heebo,sans-serif;color:var(--dim)}
.hm-money[open]>summary small{display:none}
.hm-money .hk-grid{margin:0;padding:0 12px 12px}
.hb-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.hb-head b{font:800 17px Heebo,sans-serif}
.hb-head small{font:500 13px Heebo,sans-serif;color:var(--dim);font-variant-numeric:tabular-nums}
.hb-list{margin:10px 0 0;padding:0;list-style:none}
.hb-list li{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--line)}
.hb-list li:first-child{border-top:0;padding-top:4px}
.hb-n{flex:0 0 auto;width:28px;height:28px;border-radius:50%;background:var(--accent-soft);color:var(--accent);font:800 14px/28px Heebo,sans-serif;text-align:center;font-variant-numeric:tabular-nums}
.hb-body{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.hb-t{font:700 15.5px/1.5 Heebo,sans-serif;overflow-wrap:anywhere}
.hb-s{font:400 14px/1.5 Heebo,sans-serif;color:var(--dim);overflow-wrap:anywhere}
.hb-act{margin-top:6px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--accent);background:var(--accent-soft);color:var(--accent);font:700 14px Heebo,sans-serif;cursor:pointer}
.hb-act:disabled{opacity:.5}
.hb-act:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.hb-none{margin:10px 0 0;font:400 15px Heebo,sans-serif;color:var(--dim)}
.hb-end{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font:700 14px Heebo,sans-serif;color:var(--dim);text-align:center}
.hk-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 14px}
.hk{min-width:0;padding:14px;border-radius:18px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);color:var(--ink)}
.hk-l{font:500 14px/1.3 Heebo,sans-serif;color:var(--dim)}
.hk-v{margin-top:4px;font:800 26px/1.15 Heebo,sans-serif;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.hk-u{margin-top:2px;font:500 13px/1.4 Heebo,sans-serif;color:var(--dim)}
.hk-sp{display:block;width:100%;height:30px;margin-top:6px;color:var(--green)}
.hk-sp.warn{color:var(--wait)}
.hk-sp.bad{color:var(--red)}
.hk-f{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:6px;font:500 12.5px Heebo,sans-serif;color:var(--dim);font-variant-numeric:tabular-nums}
.hk-st{display:inline-flex;align-items:center;gap:5px;font:700 13px Heebo,sans-serif;color:var(--ink)}
.hk-st i{width:9px;height:9px;border-radius:50%;background:var(--green)}
.hk-st.warn i{background:var(--wait)}
.hk-st.bad i{background:var(--red)}
.cnt,.nb-c,.gb-c,.apv-n,.icN,.tile .v{font-variant-numeric:tabular-nums}
.mg{margin:0 0 14px;padding:16px;border-radius:20px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);color:var(--ink)}
.mg[hidden]{display:none}
.mg-list{margin:10px 0 0;padding:0;list-style:none}
.mg-list li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line);cursor:default}
.mg-list li:first-child{border-top:0;padding-top:4px}
.mg-list li[data-go]{cursor:pointer}
.mg-i{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:16px;background:var(--accent-soft)}
.mg-b{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mg-t{font:700 15px/1.45 Heebo,sans-serif;overflow-wrap:anywhere}
.mg-s{font:400 13.5px/1.45 Heebo,sans-serif;color:var(--dim);overflow-wrap:anywhere}
.mg-st{flex:0 0 auto;font:800 12.5px Heebo,sans-serif;padding:3px 9px;border-radius:999px;align-self:center}
.mg-st.done{background:rgba(34,197,94,.15);color:var(--green)}
.mg-st.todo{background:var(--accent-soft);color:var(--accent)}
.mg-st.warn{background:rgba(245,158,11,.18);color:var(--wait)}
.rx{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rx button{min-height:40px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);font:600 13.5px Heebo,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.rx .rx-ok{border-color:var(--green);color:var(--green)}
.rx .rx-me{border-color:var(--accent);color:var(--accent)}
.rx button:disabled,.rx-snz button:disabled{opacity:.5}
.rx-snz{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.rx-snz[hidden]{display:none}
.rx-snz button{min-height:40px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--accent-soft);color:var(--ink);font:600 13.5px Heebo,sans-serif;cursor:pointer}
.rx-snz input[type=date]{min-height:40px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:500 14px Heebo,sans-serif;padding:0 8px}
`;

const greet = `<div class="hm-greet" id="hmGreet" aria-live="off" hidden></div>
<div id="sinceBox"></div>`;

const html = `<section class="mg" id="homeMgr" aria-label="המנהל" hidden></section>
<section class="hb" id="homeBrief" aria-label="דוח הבוקר" hidden></section>
<section class="hk-grid" id="homeKpis" aria-label="מספרים" hidden></section>
<details class="hm-money" id="homeMoney" hidden><summary>💰 הכסף שלי<small>מוסתר, לחיצה לפתיחה</small></summary><div class="hk-grid" id="homeMoneyGrid"></div></details>`;

const js = `
var HM_ACTS=[];
var HM_STATE={ok:['ok','תקין'],warn:['warn','לשים לב'],bad:['bad','דחוף']};
function hmHM(iso){
 var d=new Date(iso);if(isNaN(d.getTime()))return '';
 try{return d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jerusalem'});}
 catch(e){return d.getHours()+':'+('0'+d.getMinutes()).slice(-2);}
}
// Greeting by the Israel hour, so a phone abroad still says the right thing.
function hmGreeting(now){
 var h=parseInt(now.toLocaleString('en-GB',{hour:'2-digit',hour12:false,timeZone:'Asia/Jerusalem'}),10)%24;
 if(isNaN(h))h=now.getHours();
 if(h>=5&&h<12)return 'בוקר טוב';
 if(h>=12&&h<17)return 'צהריים טובים';
 if(h>=17&&h<21)return 'ערב טוב';
 return 'לילה טוב';
}
function hmNum(n){
 var s;
 try{s=typeof n==='number'?n.toLocaleString('he-IL'):String(n==null?'':n);}catch(e){s=String(n);}
 return '<bdi>'+esc(s)+'</bdi>';
}
function hmMoney(n){
 var s;
 try{s=new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(Number(n)||0);}
 catch(e){s='₪'+Math.round(Number(n)||0);}
 return '<bdi>'+esc(s)+'</bdi>';
}
function hmStatus(st){var s=HM_STATE[st]||HM_STATE.ok;return '<span class="hk-st '+s[0]+'"><i aria-hidden="true"></i>'+s[1]+'</span>';}
// Sparkline: one polyline in a 100 by 30 box, scaled to its own min and max.
function hmSpark(nums,st){
 if(!Array.isArray(nums))return '';
 var v=nums.map(Number).filter(function(x){return isFinite(x);});
 if(v.length<2)return '';
 var lo=Math.min.apply(null,v),hi=Math.max.apply(null,v),span=(hi-lo)||1,pts=[];
 for(var i=0;i<v.length;i++)pts.push((i*100/(v.length-1)).toFixed(2)+','+(28-(v[i]-lo)/span*26).toFixed(2));
 return '<svg class="hk-sp '+(st==='bad'?'bad':st==='warn'?'warn':'')+'" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+pts.join(' ')+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
}
// The morning brief: up to five numbered items, each with an optional pill that
// sends its act line. Empty when there is no brief at all.
function hmBriefHtml(b){
 if(!b||typeof b!=='object'||!b.at)return '';
 var items=Array.isArray(b.items)?b.items.slice(0,5):[],at=hmHM(b.at),h='';
 h+='<div class="hb-head"><b>דוח הבוקר</b>'+(at?'<small>עודכן '+esc(at)+'</small>':'')+'</div>';
 if(!items.length)h+='<p class="hb-none">אין שום דבר פתוח להיום</p>';
 else{
  h+='<ol class="hb-list">';
  for(var i=0;i<items.length;i++){
   var it=items[i]||{};
   h+='<li><span class="hb-n" aria-hidden="true">'+(i+1)+'</span><div class="hb-body">'
    +'<span class="hb-t" dir="auto">'+esc(it.t||'')+'</span>'
    +(it.sub?'<span class="hb-s" dir="auto">'+esc(it.sub)+'</span>':'');
   if(rxDone(it.t)){h=h.slice(0,h.lastIndexOf('<li'));continue;}
   if(it.act){
    HM_ACTS.push(String(it.act));
    h+='<button type="button" class="hb-act" data-hm-act="'+(HM_ACTS.length-1)+'">'+esc(it.actText||'שליחה')+'</button>';
   }
   h+=rxHtml(it.t,it.sub);
   h+='</div></li>';
  }
  h+='</ol>';
 }
 h+='<div class="hb-end">זהו להיום</div>';
 return h;
}
// The bento: the brief KPIs, then bank, debts and the 90 day forecast from D.money.
// late is the shekel amount more than 30 days past due (money.js): a warning,
// and bad once it is half of all the debt or more.
// 24.10.2026, Itzik: the bank and the debtors are not something to meet every morning.
// Money is never in the open bento: it sits folded under 💰 הכסף שלי, closed on every
// load, and only when the customer asked for it (D.features.money, lib/features.js).
function hmCards(b,m){
 var cards=[],at=b&&b.at?hmHM(b.at):'';
 if(b&&Array.isArray(b.kpis))b.kpis.forEach(function(k){
  if(!k||k.u==='₪')return;
  cards.push({l:k.k||'',v:hmNum(k.v),u:k.u||'',st:k.state||'ok',sp:k.spark,at:at});
 });
return cards;
}
function hmMoneyCards(b,m){
 var cards=[];
 if(m&&typeof m==='object'){
  var mat=m.at?hmHM(m.at):'',late=Number(m.late)||0;
  if(m.cash!=null)cards.push({l:'בבנק',v:hmMoney(m.cash),u:'',st:'ok',sp:null,at:mat});
  if(m.debt!=null)cards.push({l:'חייבים',v:hmMoney(m.debt),u:late?hmMoney(late).replace(/<[^>]+>/g,'')+' באיחור':'',st:late&&late*2>=(Number(m.debt)||0)?'bad':late>0?'warn':'ok',sp:null,at:mat});
  if(Array.isArray(m.forecast90)&&m.forecast90.length){
   var last=Number(m.forecast90[m.forecast90.length-1])||0;
   var neg=m.forecast90.some(function(x){return Number(x)<0;});
   cards.push({l:'תחזית 90 יום',v:hmMoney(last),u:'',st:neg?'bad':'ok',sp:m.forecast90,at:mat});
  }
 }
 return cards;
}
function hmCardHtml(c){
 var st=c.st==='warn'||c.st==='bad'?c.st:'ok';
 return '<div class="hk"><div class="hk-l" dir="auto">'+esc(c.l)+'</div>'
  +'<div class="hk-v">'+c.v+'</div>'
  +(c.u?'<div class="hk-u" dir="auto">'+esc(c.u)+'</div>':'')
  +hmSpark(c.sp,st)
  +'<div class="hk-f">'+hmStatus(st)+(c.at?'<span>עודכן '+esc(c.at)+'</span>':'')+'</div></div>';
}
function hmTap(e){
 var t=e.target&&e.target.closest?e.target.closest('[data-hm-act]'):null;
 if(!t||t.disabled)return;
 var act=HM_ACTS[Number(t.getAttribute('data-hm-act'))];
 if(!act)return;
 t.disabled=true;
 sendText('בקשה מהמוניטור',act,'בקשה').then(function(){t.disabled=false;toast('נשלח.');}).catch(function(){t.disabled=false;toast('לא נשלח. תנסה שוב.');});
}
// 4.11.2026, Itzik: "אין לי שום דרך להגיב אם עשיתי או לא, לשמור להמשך היום או ליום אחר, או לתת לך משימה".
// Every open line in the brief and the manager card gets: done, later (2 hours, 20:00, tomorrow, a date),
// a task for me, not relevant. Each sends one line in a format the server already acts on (שעון מעורר,
// משימה ליום), and the line leaves the card on this phone (only what is current stays).
var RX_K='rxHandled';
function rxDay(d){try{return (d||new Date()).toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});}catch(e){return new Date().toISOString().slice(0,10);}}
function rxMap(){try{return JSON.parse(localStorage.getItem(RX_K)||'{}');}catch(e){return {};}}
function rxDone(t){return !!rxMap()[rxDay()+'|'+String(t||'')];}
function rxMark(t,how){var m=rxMap(),d=rxDay(),o={};Object.keys(m).forEach(function(k){if(k.slice(0,10)>=d)o[k]=m[k];});o[d+'|'+String(t||'')]=how;try{localStorage.setItem(RX_K,JSON.stringify(o));}catch(e){}}
var RX_ITEMS=[];
function rxHtml(t,sub){
 RX_ITEMS.push({t:String(t||''),sub:String(sub||'')});var n=RX_ITEMS.length-1;
 return '<div class="rx" data-rx="'+n+'"><button type="button" class="rx-ok" data-rx-do="ok">✓ בוצע</button><button type="button" data-rx-do="later">⏰ אחר כך</button><button type="button" class="rx-me" data-rx-do="me">🤖 משימה לך</button><button type="button" data-rx-do="no">✕ לא רלוונטי</button></div>'
  +'<div class="rx-snz" data-rx-snz="'+n+'" hidden><button type="button" data-rx-do="h2">בעוד שעתיים</button><button type="button" data-rx-do="eve">הערב 20:00</button><button type="button" data-rx-do="tmr">מחר</button><input type="date" data-rx-do="date" aria-label="יום אחר"></div>';
}
function rxHM(ms){var d=new Date(ms);try{return d.toLocaleTimeString('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hour12:false});}catch(e){return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}}
var RX_WD=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
function rxDayLine(ymd){var d=new Date(ymd+'T12:00:00');return 'משימה ליום '+RX_WD[d.getDay()]+' ('+ymd+'): ';}
function rxSend(n,how,extra){
 var it=RX_ITEMS[n];if(!it)return;var t=it.t+(it.sub?' ('+it.sub+')':''),msg,mark=how,toastTxt;
 if(how==='ok'){msg='✓ סימנתי בוצע מהדוח: '+t+'. להוריד מהמעקב.';toastTxt='סומן בוצע.';}
 else if(how==='no'){msg='✕ לא רלוונטי מהדוח: '+t+'. להוריד מהמעקב.';toastTxt='ירד מהרשימה.';}
 else if(how==='me'){msg='🤖 משימה בשבילך מהדוח: '+t+'. תטפל ותעדכן אותי.';toastTxt='עבר אליי, אעדכן.';}
 else if(how==='h2'||how==='eve'){var hm=how==='h2'?rxHM(Date.now()+2*3600*1000):'20:00';msg='שעון מעורר '+hm+': '+t;mark='later';toastTxt='אזכיר ב '+hm+'.';}
 else if(how==='tmr'||how==='date'){var ymd=how==='tmr'?rxDay(new Date(Date.now()+24*3600*1000)):extra;if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(ymd||''))return;msg=rxDayLine(ymd)+t+'. וגם ביומן גוגל.';mark='later';toastTxt='נדחה ל '+ymd.split('-').reverse().join('.')+'.';}
 if(!msg)return;
 sendText('תגובה לדוח',msg,'בקשה').then(function(){rxMark(it.t,mark);toast(toastTxt);if(typeof renderHome==='function')renderHome();})
  .catch(function(){toast('לא נשלח. תנסה שוב.');var b=document.querySelectorAll('[data-rx="'+n+'"] button,[data-rx-snz="'+n+'"] button');for(var i=0;i<b.length;i++)b[i].disabled=false;});
}
function rxTap(e){
 var b=e.target&&e.target.closest?e.target.closest('[data-rx-do]'):null;if(!b||b.tagName==='INPUT')return;
 e.stopPropagation();var box=b.closest('[data-rx],[data-rx-snz]');if(!box)return;
 var n=Number(box.getAttribute('data-rx')||box.getAttribute('data-rx-snz'));var how=b.getAttribute('data-rx-do');
 if(how==='later'){var s=document.querySelector('[data-rx-snz="'+n+'"]');if(s)s.hidden=!s.hidden;return;}
 var all=document.querySelectorAll('[data-rx="'+n+'"] button,[data-rx-snz="'+n+'"] button');for(var i=0;i<all.length;i++)all[i].disabled=true;
 rxSend(n,how);
}
if(typeof document!=='undefined'){document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('.rx,.rx-snz'))rxTap(e);},true);
document.addEventListener('change',function(e){var x=e.target;if(x&&x.getAttribute&&x.getAttribute('data-rx-do')==='date'&&x.value){var n=Number(x.closest('[data-rx-snz]').getAttribute('data-rx-snz'));x.disabled=true;rxSend(n,'date',x.value);}},true);}
// 4.11.2026: the manager's round (lib/manager.js), what it checked this morning and what is left for him.
var MG_GO={plate:function(){location.href='plate/plate.html?v='+Date.now();},status:function(){location.href='status/index.html?v='+Date.now();},
 cal:function(){window.open('https://calendar.google.com/calendar/u/0/r/day','_blank','noopener');},
 answers:function(){if(typeof pane==='function'){pane('a');if(typeof renderAnswers==='function')renderAnswers();if(typeof landPane==='function')landPane('pA');}},
 biz:function(){if(typeof bizSheet==='function')bizSheet();}};
var MG_ST={done:'✓ בוצע',todo:'עליך',warn:'לשים לב'};
function hmMgrHtml(m){
 if(!m||!Array.isArray(m.items)||!m.items.length)return '';
 var left=m.items.filter(function(i){return i.st!=='done';}).length,at=hmHM(m.at);
 var h='<div class="hb-head"><b>🧑‍💼 המנהל</b><small>'+(at?'סבב '+esc(at)+' · ':'')+(left?left+' פתוחים':'הכל בוצע')+'</small></div><ul class="mg-list">';
 m.items.forEach(function(i){
  var st=MG_ST[i.st]?i.st:'todo';
  if(st!=='done'&&rxDone(i.t))return;
  h+='<li'+(i.go&&MG_GO[i.go]?' data-go="'+esc(i.go)+'"':'')+'><span class="mg-i" aria-hidden="true">'+esc(i.icon||'•')+'</span><div class="mg-b"><span class="mg-t" dir="auto">'+esc(i.t||'')+'</span>'+(i.sub?'<span class="mg-s" dir="auto">'+esc(i.sub)+'</span>':'')+(st!=='done'?rxHtml(i.t,i.sub):'')+'</div><span class="mg-st '+st+'">'+MG_ST[st]+'</span></li>';
 });
 return h+'</ul>';
}
function renderHome(){
 RX_ITEMS=[];
 var D0=(typeof D!=='undefined'&&D)||{};
 var g=document.getElementById('hmGreet');
 if(g){g.textContent=hmGreeting(new Date());g.hidden=false;}
 HM_ACTS=[];
 var mg=document.getElementById('homeMgr');
 if(mg){var mh=hmMgrHtml(D0.manager);mg.hidden=!mh;mg.innerHTML=mh;
  if(!mg.getAttribute('data-bound')){mg.setAttribute('data-bound','1');mg.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.rx,.rx-snz'))return;var li=e.target&&e.target.closest?e.target.closest('[data-go]'):null;if(li&&MG_GO[li.getAttribute('data-go')])MG_GO[li.getAttribute('data-go')]();});}}
 var brief=document.getElementById('homeBrief'),kpis=document.getElementById('homeKpis');
 var bh=hmBriefHtml(D0.brief);
 if(brief){
  brief.hidden=!bh;brief.innerHTML=bh;
  if(!brief.getAttribute('data-bound')){brief.setAttribute('data-bound','1');brief.addEventListener('click',hmTap);}
 }
 var cards=hmCards(D0.brief,D0.money);
 if(kpis){kpis.hidden=!cards.length;kpis.innerHTML=cards.map(hmCardHtml).join('');}
 var mbox=document.getElementById('homeMoney'),mgrid=document.getElementById('homeMoneyGrid');
 var F=D0.features||{},mc=F.money?hmMoneyCards(D0.brief,D0.money):[];
 if(mbox&&mgrid){mbox.hidden=!mc.length;mgrid.innerHTML=mc.map(hmCardHtml).join('');}
}
`;

module.exports = { css, greet, html, js };
