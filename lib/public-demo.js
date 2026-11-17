'use strict';
/*
  17.11.2026, Itzik: the public demo monitor (it-solution.co.il/demo, demo.m.it-solution.co.il).
  A real monitor page with invented barbershop data (lib/demo-data.js), built by setup/demo-build.sh.

  On only when instance.json says "publicDemo": true. Every other monitor gets an empty string
  from both functions, so this file changes nothing for Itzik or a customer.

  head(): runs before the page's own scripts. One choke point for everything that leaves the page:
  fetch, XHR, sendBeacon, service worker, notifications, window.open, form submit. Only same origin
  GETs (the page's own data files) and the demo chat API go out. A blocked action that the visitor
  started gets one line: "בהדגמה רק מראים. אצלך זה קורה באמת." Background polling is dropped silently.

  tail(): after the page's scripts. The fast chat (fcPost) goes to /api/demo/chat on wa-bridge, with
  the thread kept in this browser only, 5 questions per visitor (the server enforces it too). A
  WhatsApp strip at the bottom to the IT Solution line, with the ref, and a small demo ribbon on top.
*/
const WA = '972528074881';
const API = 'https://wa.abaitzik.com/api/demo/';

function head(inst) {
  if (!inst || inst.publicDemo !== true) return '';
  return '<script>(function(){\n'
    + 'window.PUBLIC_DEMO=true;var API=' + JSON.stringify(API) + ';\n'
    + 'try{localStorage.setItem("welcomeSeen","1");localStorage.setItem("micChecked","1");if(localStorage.getItem("bareHome")===null)localStorage.setItem("bareHome","0");}catch(e){}\n'
    + 'var lastTap=0;["pointerdown","keydown","click"].forEach(function(t){document.addEventListener(t,function(){lastTap=Date.now();},true);});\n'
    + 'var shown=0;window.demoToast=function(msg){var now=Date.now();if(now-shown<1200)return;shown=now;\n'
    + ' var t=document.getElementById("demoToast");if(!t){t=document.createElement("div");t.id="demoToast";document.body.appendChild(t);}\n'
    + ' t.textContent=msg||"בהדגמה רק מראים. אצלך זה קורה באמת.";t.className="on";clearTimeout(t._h);t._h=setTimeout(function(){t.className="";},3200);};\n'
    + 'function user(){return Date.now()-lastTap<1500;}\n'
    + 'function allowed(u,m){u=String(u||"");m=String(m||"GET").toUpperCase();\n'
    + ' if(u.indexOf(API)===0)return true;\n'
    + ' var a;try{a=new URL(u,location.href);}catch(e){return false;}\n'
    + ' return a.origin===location.origin&&(m==="GET"||m==="HEAD");}\n'
    + 'var of=window.fetch;window.fetch=function(i,o){var u=(i&&i.url)||i,m=(o&&o.method)||(i&&i.method)||"GET";\n'
    + ' if(allowed(u,m))return of.apply(this,arguments);if(user()||(Date.now()-lastTap<8000&&String(m).toUpperCase()!=="GET"))demoToast();\n'
    + ' return Promise.resolve(new Response("{}",{status:200,headers:{"Content-Type":"application/json"}}));};\n'
    + 'var xo=XMLHttpRequest.prototype.open,xs=XMLHttpRequest.prototype.send;\n'
    + 'XMLHttpRequest.prototype.open=function(m,u){this._demoOk=allowed(u,m);this._demoM=String(m||"GET").toUpperCase();return xo.apply(this,arguments);};\n'
    + 'XMLHttpRequest.prototype.send=function(){if(this._demoOk)return xs.apply(this,arguments);if(user()||(Date.now()-lastTap<8000&&this._demoM!=="GET"))demoToast();};\n'
    + 'try{navigator.sendBeacon=function(){return true;};}catch(e){}\n'
    + 'try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.reject(new Error("demo"));};\n'
    + ' navigator.serviceWorker.getRegistrations&&navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});});}}catch(e){}\n'
    + 'try{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=function(){demoToast("אצלך מדברים, והמוניטור מתמלל ומבצע. בהדגמה כותבים בתיבה.");return Promise.reject(new Error("demo"));};}catch(e){}\n'
    + 'try{if(window.Notification)Notification.requestPermission=function(){demoToast("אצלך כל תשובה קופצת בטלפון.");return Promise.resolve("default");};}catch(e){}\n'
    + 'try{window.WebSocket=function(){throw new Error("demo");};window.EventSource=function(){throw new Error("demo");};}catch(e){}\n'
    + 'var wo=window.open;window.open=function(u){u=String(u||"");if(u.indexOf("https://wa.me/' + WA + '")===0)return wo.apply(window,arguments);\n'
    + ' if(/^https:\\/\\/wa\\.me\\//.test(u))demoToast("אצלך זה נפתח בוואטסאפ שלך, עם ההודעה מוכנה.");else demoToast();return null;};\n'
    + 'document.addEventListener("submit",function(e){var f=e.target,ac=f&&f.getAttribute&&f.getAttribute("action");if(ac&&!allowed(ac,"GET")){e.preventDefault();e.stopPropagation();demoToast();}},true);\n'
    + 'document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";\n'
    + ' if(h.indexOf("https://wa.me/' + WA + '")===0||h.indexOf("https://it-solution.co.il/start")===0||h.charAt(0)==="#"||h.indexOf("javascript:")===0)return;\n'
    + ' var x;try{x=new URL(h,location.href);}catch(er){return;}if(x.origin===location.origin&&!a.hasAttribute("download"))return;\n'
    + ' e.preventDefault();e.stopPropagation();demoToast(/^(tel|mailto|sms):/.test(h)||/wa\\.me/.test(h)?"אצלך זה פותח את השיחה מהטלפון.":"");},true);\n'
    + '})();</script>\n';
}

function tail(inst) {
  if (!inst || inst.publicDemo !== true) return '';
  const css = '#demoToast{position:fixed;inset-inline:16px;bottom:140px;z-index:2147483646;background:#1f2937;color:#fff;font:500 16px/1.4 Heebo,system-ui,sans-serif;'
    + 'padding:12px 16px;border-radius:14px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.3);opacity:0;transform:translateY(10px);transition:.25s;pointer-events:none}'
    + '#demoToast.on{opacity:1;transform:none}'
    + '#demoRib{position:sticky;top:0;z-index:2147483641;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 12px;background:#fff7e0;color:#6b4e00;font:500 14px/1.4 Heebo,system-ui,sans-serif;text-align:center;padding:7px 12px;border-bottom:1px solid #f0dca0}'
    + '#demoBack{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;background:#0e7490;color:#fff;font:800 15px Heebo,system-ui,sans-serif;text-decoration:none;white-space:nowrap}'
    + '#demoWa{position:fixed;inset-inline:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 14px;'
    + 'background:#128c4b;color:#fff;font:700 16px/1.3 Heebo,system-ui,sans-serif;text-decoration:none;box-shadow:0 -2px 12px rgba(0,0,0,.18)}'
    + '#demoWa small{display:block;font-weight:400;font-size:13px;opacity:.9}'
    + '#qhBtn,#gAdminReq,#welcomeCard,#icPersonal{display:none!important}';
  const js = '(function(){\n'
    + 'var API=' + JSON.stringify(API) + ',WA=' + JSON.stringify(WA) + ';\n'
    + 'var REF="demo";try{var q=new URLSearchParams(location.search).get("ref");if(q&&/^[a-z0-9_-]{1,40}$/i.test(q)){REF=q;localStorage.setItem("demoRef",q);}else REF=localStorage.getItem("demoRef")||"demo";}catch(e){}\n'
    + 'var VID="";try{VID=localStorage.getItem("demoVid")||"";if(!VID){VID=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("demoVid",VID);}}catch(e){VID="x"+Date.now();}\n'
    + 'function post(p,b){b.vid=VID;b.ref=REF;return fetch(API+p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});}\n'
    + 'try{if(!sessionStorage.getItem("demoHit")){sessionStorage.setItem("demoHit","1");post("hit",{});}}catch(e){}\n'
    // the ribbon and the WhatsApp strip
    + 'var rib=document.createElement("div");rib.id="demoRib";rib.innerHTML="<a id=\\"demoBack\\" href=\\"https://it-solution.co.il/start/\\">→ חזרה להרשמה</a><span>הדגמה: מספרה לדוגמה, הנתונים מומצאים. השיחה עם המוניטור אמיתית.</span>";document.body.insertBefore(rib,document.body.firstChild);\n'
    // 17.11.2026, Itzik: "אין כפתור חזרה מהמוניטור להדגמה לטופס ההרשמה". The ribbon stays on top with a way back to /start.
    + 'var txt="היי, ראיתי את ההדגמה של המוניטור ואני רוצה כזה לעסק שלי ["+REF+"]";\n'
    + 'var wa=document.createElement("a");wa.id="demoWa";wa.href="https://wa.me/"+WA+"?text="+encodeURIComponent(txt);wa.target="_blank";wa.rel="noopener";\n'
    + 'wa.innerHTML="<span style=\\"font-size:22px\\">💬</span><span>רוצה מוניטור כזה לעסק שלך?<small>כתבו לנו בוואטסאפ, ונבנה אותו יחד</small></span>";\n'
    + 'wa.addEventListener("click",function(){post("wa",{});});document.body.appendChild(wa);\n'
    + 'function place(){var bn=document.querySelector(".bn");var h=bn&&getComputedStyle(bn).display!=="none"?bn.offsetHeight:0;wa.style.bottom=h+"px";document.body.style.paddingBottom=(h+wa.offsetHeight+8)+"px";}\n'
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
    + 'hideInstall();setTimeout(hideInstall,1500);\n'
    // 17.11, Itzik: the manager card first on the home, as on his own monitor. agents-ui.js puts it back above the round
    // icons on every repaint, so that one parent ignores re-inserting it; everything else it inserts goes through as usual.
    + 'function mgrUp(){var t=document.getElementById("mgrTop"),a=document.getElementById("blkIcons")||document.getElementById("blkTiles"),home=document.getElementById("pH");\n'
    + ' if(!t||!a||!home)return;var p=a.parentNode;if(p&&!p._demoMg){p._demoMg=1;p.insertBefore=function(n,r){if(n&&n.id==="mgrTop"&&n.parentNode)return n;return Node.prototype.insertBefore.call(this,n,r);};}\n'
    + ' if(home.firstChild!==t)Node.prototype.insertBefore.call(home,t,home.firstChild);}\n'
    + 'mgrUp();setTimeout(mgrUp,400);setTimeout(mgrUp,1500);setTimeout(mgrUp,4000);\n'
    // the fast chat, on the demo API, thread in this browser only
    + 'function load(){try{return JSON.parse(localStorage.getItem("demoThread")||"[]");}catch(e){return [];}}\n'
    + 'function save(m){try{localStorage.setItem("demoThread",JSON.stringify(m.slice(-30)));}catch(e){}}\n'
    + 'function mk(from,text){return {id:"d"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),at:new Date().toISOString(),from:from,text:text,via:"page"};}\n'
    + 'window.fcPost=function(p,body){\n'
    + ' var MD=function(){try{return localStorage.getItem("demoMode")||"chat";}catch(e){return "chat";}};\n'
    + ' if(p==="/thread")return Promise.resolve({mode:MD(),msgs:load()});\n'
    + ' if(p==="/todo"){demoToast();return Promise.resolve({ok:true});}\n'
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
    + '})();';
  return '<style>' + css + '</style>\n<script>' + js + '</script>\n';
}

module.exports = { head, tail, WA, API };
