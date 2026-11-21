'use strict';
/*
  17.11.2026, Itzik: the public demo monitor (it-solution.co.il/demo, demo.m.it-solution.co.il).
  A real monitor page with invented barbershop data (lib/demo-data.js), built by setup/demo-build.sh.

  On only when instance.json says "publicDemo": true. Every other monitor gets an empty string
  from both functions, so this file changes nothing for Itzik or a customer.

  head(): runs before the page's own scripts. One choke point for everything that leaves the page:
  fetch, XHR, sendBeacon, service worker, notifications, window.open, form submit. Only same origin
  GETs (the page's own data files) and the demo chat API go out. A blocked action that the visitor
  started gets its own line, what was received and what was done (lib/demo-acts.js, 19.11). Background polling is dropped silently.

  tail(): after the page's scripts. The fast chat (fcPost) goes to /api/demo/chat on wa-bridge, with
  the thread kept in this browser only, 5 questions per visitor (the server enforces it too). A
  WhatsApp strip at the bottom to the IT Solution line, with the ref, and a small demo ribbon on top.
*/
const WA = '972528074881';
const API = 'https://wa.abaitzik.com/api/demo/';

// 19.11.2026: the interceptors and the per button lines live in lib/demo-acts.js (client, say), put here with toString.
function head(inst) {
  if (!inst || inst.publicDemo !== true) return '';
  const A = require('./demo-acts.js');
  // 21.11.2026: a trade demo (lib/trades.js) opens folded on its three cards (lib/trade-cards.js), the rest behind "עוד כלים"
  const TD = require('./trades.js').get(inst.trade) ? 'window.DEMO_TRADE=true;' : '';
  return '<script>' + TD + 'window.demoSay=' + A.say.toString() + ';\n(' + A.client.toString() + ')(' + JSON.stringify(API) + ',' + JSON.stringify(WA) + ');</script>\n';
}

function tail(inst) {
  if (!inst || inst.publicDemo !== true) return '';
  // 21.11.2026: a trade demo (lib/trades.js) names its trade in the ribbon
  const TR = require('./trades.js').get(inst.trade);
  const RIB = (TR ? TR.ribbon : 'הדגמה: מספרה לדוגמה, הנתונים מומצאים. השיחה עם המוניטור אמיתית.').replace(/[<>"]/g, '');
  const css = '#demoToast{position:fixed;inset-inline:16px;top:64px;max-width:560px;margin:0 auto;z-index:2147483646;background:#1f2937;color:#fff;font:500 16px/1.4 Heebo,system-ui,sans-serif;'
    + 'padding:12px 16px;border-radius:14px;text-align:start;box-shadow:0 6px 24px rgba(0,0,0,.3);opacity:0;transform:translateY(-10px);transition:.25s;pointer-events:none}'
    + '#demoToast.on{opacity:1;transform:none;pointer-events:auto}#demoToast div{margin:2px 0}#demoToast b{color:#7dd3fc}#demoToast small{display:block;margin-top:6px;font-size:13px;opacity:.75}'
    + '#demoRib{position:sticky;top:0;z-index:2147483641;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 12px;background:#fff7e0;color:#6b4e00;font:500 14px/1.4 Heebo,system-ui,sans-serif;text-align:center;padding:7px 12px;border-bottom:1px solid #f0dca0}'
    + '#demoBack{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;background:#0e7490;color:#fff;font:800 15px Heebo,system-ui,sans-serif;text-decoration:none;white-space:nowrap}'
    + '#demoWa{position:fixed;inset-inline:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 14px;'
    + 'background:#128c4b;color:#fff;font:700 16px/1.3 Heebo,system-ui,sans-serif;text-decoration:none;box-shadow:0 -2px 12px rgba(0,0,0,.18)}'
    + '#demoWa small{display:block;font-weight:400;font-size:13px;opacity:.9}'
    + '#qhBtn,#gAdminReq,#welcomeCard{display:none!important}';
  const js = '(function(){\n'
    + 'var API=' + JSON.stringify(API) + ',WA=' + JSON.stringify(WA) + ';\n'
    + 'var REF="demo";try{var q=new URLSearchParams(location.search).get("ref");if(q&&/^[a-z0-9_-]{1,40}$/i.test(q)){REF=q;localStorage.setItem("demoRef",q);}else REF=localStorage.getItem("demoRef")||"demo";}catch(e){}\n'
    + 'var VID="";try{VID=localStorage.getItem("demoVid")||"";if(!VID){VID=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("demoVid",VID);}}catch(e){VID="x"+Date.now();}\n'
    + 'function post(p,b){b.vid=VID;b.ref=REF;return fetch(API+p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});}\n'
    + 'try{if(!sessionStorage.getItem("demoHit")){sessionStorage.setItem("demoHit","1");post("hit",{});}}catch(e){}\n'
    // the ribbon and the WhatsApp strip
    + 'var rib=document.createElement("div");rib.id="demoRib";rib.innerHTML="<a id=\\"demoBack\\" href=\\"https://it-solution.co.il/' + (TR ? 'day' : 'start') + '/\\">→ חזרה להרשמה</a><span>' + RIB + '</span>";document.body.insertBefore(rib,document.body.firstChild);\n'
    // 17.11.2026, Itzik: "אין כפתור חזרה מהמוניטור להדגמה לטופס ההרשמה". The ribbon stays on top with a way back to /start.
    + 'var txt="היי, ראיתי את ההדגמה של המוניטור ואני רוצה כזה לעסק שלי ["+REF+"]";\n'
    + 'var wa=document.createElement("a");wa.id="demoWa";wa.href="https://wa.me/"+WA+"?text="+encodeURIComponent(txt);wa.target="_blank";wa.rel="noopener";\n'
    + 'wa.innerHTML="<span style=\\"font-size:22px\\">💬</span><span>רוצה מוניטור כזה לעסק שלך?<small>כתבו לנו בוואטסאפ, ונבנה אותו יחד</small></span>";\n'
    + 'wa.addEventListener("click",function(){post("wa",{});});document.body.appendChild(wa);\n'
    + 'function place(){var bn=document.querySelector(".bn");var h=bn&&getComputedStyle(bn).display!=="none"&&bn.offsetWidth>window.innerWidth*0.6?bn.offsetHeight:0;wa.style.bottom=h+"px";document.body.style.paddingBottom=(h+wa.offsetHeight+8)+"px";}\n'
    + 'place();window.addEventListener("resize",place);setTimeout(place,800);\n'
    // 17.11.2026: the page replaces its body after this runs, and the ribbon (with the way back to /start) and the
    // WhatsApp strip were gone. They are put back whenever they are not in the page.
    + 'function keepIn(){if(!document.body)return;if(!rib.isConnected)document.body.insertBefore(rib,document.body.firstChild);if(!wa.isConnected){document.body.appendChild(wa);place();}}\n'
    + 'window.addEventListener("load",keepIn);document.addEventListener("DOMContentLoaded",keepIn);setInterval(keepIn,1000);\n'
    // 17.11.2026, Itzik: "כתבתי משהו בשורת הכתב ואז הוא ענה, אבל אין כפתורי חזרה". The chat and every other screen that opens
    // over the page (position fixed, from the top) had its own → חזרה button under the ribbon. Each such screen now starts
    // below the ribbon, so its back button and the way back to /start are both in sight on every screen.
    + 'function clearRib(){if(!rib.isConnected)return;var h=rib.offsetHeight;document.querySelectorAll("body *").forEach(function(el){if(el===rib||el===wa||el.id==="demoToast"||rib.contains(el))return;var cs=getComputedStyle(el);if(cs.position!=="fixed"||cs.display==="none")return;var t=parseFloat(cs.top);if(el._demoTop===undefined){if(!(t<h)||el.offsetHeight<window.innerHeight*0.4)return;el._demoTop=1;}el.style.setProperty("top",h+"px","important");});}\n'
    + 'clearRib();setInterval(clearRib,400);document.addEventListener("click",function(){setTimeout(clearRib,30);setTimeout(clearRib,300);},true);window.addEventListener("resize",clearRib);\n'
    // The screens in the page itself (calendar, clients, mail, quotes, connections) open scrolled so their → חזרה sits at
    // the very top, under the sticky ribbon. Right after a tap, a back button hidden under the ribbon is brought into view.
    + 'function backInView(){var h=rib.offsetHeight;document.documentElement.style.scrollPaddingTop=h+"px";document.querySelectorAll(".gBack").forEach(function(b){if(!b.offsetParent)return;var t=b.getBoundingClientRect().top;if(t>-60&&t<h&&window.scrollY>0)window.scrollBy(0,t-h-4);});}\n'
    + 'document.addEventListener("click",function(){[60,250,600,1200].forEach(function(ms){setTimeout(backInView,ms);});},true);\n'
    + 'function hideInstall(){var b=document.getElementById("installGo");if(b){var c=b.parentNode;while(c&&c.parentNode&&c.parentNode.id!=="pH"&&c.parentNode!==document.body)c=c.parentNode;if(c)c.style.display="none";}}\n'
    + 'hideInstall();setTimeout(hideInstall,1500);setInterval(hideInstall,2000);\n'
    // 17.11, Itzik: the manager card first on the home, as on his own monitor. agents-ui.js puts it back above the round
    // icons on every repaint, so that one parent ignores re-inserting it; everything else it inserts goes through as usual.
    + 'function mgrUp(){var t=document.getElementById("mgrTop"),a=document.getElementById("blkIcons")||document.getElementById("blkTiles"),home=document.getElementById("pH");\n'
    + ' if(!t||!a||!home)return;var p=a.parentNode;if(p&&!p._demoMg){p._demoMg=1;p.insertBefore=function(n,r){if(n&&n.id==="mgrTop"&&n.parentNode)return n;return Node.prototype.insertBefore.call(this,n,r);};}\n'
    + ' if(home.firstChild!==t)Node.prototype.insertBefore.call(home,t,home.firstChild);}\n'
    + 'if(!window.DEMO_TRADE){mgrUp();setTimeout(mgrUp,400);setTimeout(mgrUp,1500);setTimeout(mgrUp,4000);}\n'
    // the fast chat, on the demo API, thread in this browser only
    + 'function load(){try{return JSON.parse(localStorage.getItem("demoThread")||"[]");}catch(e){return [];}}\n'
    + 'function save(m){try{localStorage.setItem("demoThread",JSON.stringify(m.slice(-30)));}catch(e){}}\n'
    + 'function mk(from,text){return {id:"d"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),at:new Date().toISOString(),from:from,text:text,via:"page"};}\n'
    + 'window.fcPost=function(p,body){\n'
    + ' var MD=function(){try{return localStorage.getItem("demoMode")||"chat";}catch(e){return "chat";}};\n'
    + ' if(p==="/thread")return Promise.resolve({mode:MD(),msgs:load()});\n'
    // 19.11.2026: the campaign interviewer has its own demo path (lib/demo-chat.js /api/demo/camp)
    + ' if(p==="/camp")return post("camp",body).then(function(r){if(!r.ok){var er=new Error("api "+r.status);er.status=r.status;throw er;}return r.json();});\n'
    + ' if(p==="/todo"){demoAct("משימה","משימה להיום, היום ("+new Date().toISOString().slice(0,10)+"): "+String((body&&body.text)||"מהשיחה").slice(0,120));return Promise.resolve({ok:true});}\n'
    + ' var t=String((body&&body.text)||"").trim();var m=load();var hist=m.slice(-6).map(function(x){return {from:x.from,text:String(x.text||"").slice(0,400)};});\n'
    + ' m.push(mk("me",t));save(m);\n'
    + ' return post("chat",{text:t,hist:hist,mode:MD()}).then(function(r){return r.json().catch(function(){return {};});}).then(function(j){\n'
    + '  var reply=(j&&j.reply)||"משהו נתקע רגע. אפשר לנסות שוב.",md=(j&&j.mode)||"chat";try{localStorage.setItem("demoMode",md);}catch(e){}m=load();m.push(mk("bot",reply));save(m);return {reply:reply,mode:md,msgs:m};});\n'
    + '};\n'
    // the main box: in the demo a question goes to the conversation, not to a task queue
    + 'document.addEventListener("submit",function(e){if(!e.target||e.target.id!=="quickForm")return;e.preventDefault();e.stopImmediatePropagation();\n'
    + ' var bx=document.getElementById("quickText"),v=bx?String(bx.value||"").trim():"";if(!v)return;bx.value="";try{growQuick();}catch(er){}\n'
    + ' try{fcSheet();}catch(er){}fcSend(v);},true);\n'
    + 'if(typeof fcS!=="undefined"){fcS.msgs=load();fcS.loaded=true;try{fcPaintRow();}catch(e){}}\n'
    // a file the monitor prepared (🎁): in the demo the file itself is not on the page, so its button answers
    + 'if(typeof fileOpen==="function"){window.fileOpen=function(n){demoToast({got:"לפתוח את "+String(n||"הקובץ"),did:"אצלך הוא נפתח כאן לצפייה, עם הורדה ותיבת הערה. מאשרים, והוא עולה לרשתות."});};}\n'
    + '})();';
  return '<style>' + css + '</style>\n<script>' + js + '</script>\n';
}

module.exports = { head, tail, WA, API };
