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
.hb[hidden],.hk-grid[hidden]{display:none}
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
`;

const greet = `<div class="hm-greet" id="hmGreet" aria-live="off" hidden></div>
<div id="sinceBox"></div>`;

const html = `<section class="hb" id="homeBrief" aria-label="דוח הבוקר" hidden></section>
<section class="hk-grid" id="homeKpis" aria-label="מספרים" hidden></section>`;

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
   if(it.act){
    HM_ACTS.push(String(it.act));
    h+='<button type="button" class="hb-act" data-hm-act="'+(HM_ACTS.length-1)+'">'+esc(it.actText||'שליחה')+'</button>';
   }
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
function hmCards(b,m){
 var cards=[],at=b&&b.at?hmHM(b.at):'';
 if(b&&Array.isArray(b.kpis))b.kpis.forEach(function(k){
  if(!k)return;
  cards.push({l:k.k||'',v:hmNum(k.v),u:k.u||'',st:k.state||'ok',sp:k.spark,at:at});
 });
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
function renderHome(){
 var D0=(typeof D!=='undefined'&&D)||{};
 var g=document.getElementById('hmGreet');
 if(g){g.textContent=hmGreeting(new Date());g.hidden=false;}
 HM_ACTS=[];
 var brief=document.getElementById('homeBrief'),kpis=document.getElementById('homeKpis');
 var bh=hmBriefHtml(D0.brief);
 if(brief){
  brief.hidden=!bh;brief.innerHTML=bh;
  if(!brief.getAttribute('data-bound')){brief.setAttribute('data-bound','1');brief.addEventListener('click',hmTap);}
 }
 var cards=hmCards(D0.brief,D0.money);
 if(kpis){kpis.hidden=!cards.length;kpis.innerHTML=cards.map(hmCardHtml).join('');}
}
`;

module.exports = { css, greet, html, js };
