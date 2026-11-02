'use strict';
/*
  24.10.2026, stage 6 (Web Push). The page side of "התראות לטלפון": the service worker
  registration, the app badge, and the box in settings that turns notifications on.
  Plain strings, build.js drops them into the page as they are (same pattern as
  lib/help-ui.js). No backslashes in the JS on purpose: it is emitted from a template
  literal.

  The box exists only when the instance has a VAPID public key (build.js passes it).
  The registration and the badge run in every page, with or without a key.
  On iPhone, notifications work only from the home screen icon, so a phone that is
  not standalone gets the install guide instead of the button.
*/

const css = `
.pushGuide{margin:8px 0 0;padding:10px 12px;border-radius:12px;background:var(--sunk);font:500 14.5px/1.6 Heebo,sans-serif;color:var(--ink);text-align:start}
.pushGuide[hidden]{display:none}
#pushBtn[hidden]{display:none}
`;

// Settings box. Empty when there is no key, so the page has no push UI at all.
function html(key) {
  if (!key) return '';
  return `<div class="alerts" id="pushBox" hidden>
 <div>
  <b>התראות לטלפון</b>
  <small id="pushSaid">כל תשובה קופצת בטלפון, גם כשהמוניטור סגור.</small>
 </div>
 <div class="pushGuide" id="pushGuide" hidden>כדי לקבל התראות באייפון: שיתוף ← הוספה למסך הבית, ואז לפתוח מהאייקון</div>
 <button type="button" class="abtn" id="pushBtn" hidden>להפעיל התראות</button>
</div>`;
}

// The page script. PUSH_KEY is the public VAPID key, written as a JSON string.
function js(key) {
  return 'var PUSH_KEY=' + JSON.stringify(String(key || '')) + ';\n' + JS_BODY;
}

const JS_BODY = `
function pushB64(s){var pad='='.repeat((4-s.length%4)%4);var b=(s+pad).replace(/-/g,'+').replace(/_/g,'/');var raw=atob(b);var out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function pushIsIos(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function pushStandalone(){return !!((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true);}
function pushSay(t){var s=document.getElementById('pushSaid');if(s)s.textContent=t;}
// The app badge is the number of approvals waiting ("מחכה לך"). Only where the browser has it.
function pushBadge(){
 if(!('setAppBadge' in navigator))return;
 var n=(typeof apvOpen==='function')?apvOpen().length:0;
 var p=n>0?navigator.setAppBadge(n):(navigator.clearAppBadge?navigator.clearAppBadge():Promise.resolve());
 p.catch(function(e){console.warn('badge: '+e.message);});
}
function pushSubscribe(){
 var btn=document.getElementById('pushBtn');
 if(btn)btn.disabled=true;
 pushSay('מבקש רשות להתראות...');
 Notification.requestPermission().then(function(p){
  if(p!=='granted'){pushSay('לא אושר. אפשר לאשר שוב מכאן, בלחיצה על הכפתור.');if(btn)btn.disabled=false;return null;}
  return navigator.serviceWorker.ready.then(function(reg){
   return reg.pushManager.getSubscription().then(function(old){
    return old||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushB64(PUSH_KEY)});
   });
  }).then(function(sub){
   return sendText('התראות לטלפון','מנוי התראות: '+JSON.stringify(sub.toJSON()),'הגדרה');
  }).then(function(){
   pushSay('מופעל. ההתראות יגיעו לטלפון הזה.');
   if(btn)btn.disabled=false;
   toast('נשמר. ההתראות לטלפון מופעלות.');
  });
 }).catch(function(e){
  pushSay('לא הצלחתי להפעיל: '+e.message+'. אפשר לנסות שוב.');
  if(btn)btn.disabled=false;
 });
}
function pushInit(){
 var box=document.getElementById('pushBox');
 if(!box||!PUSH_KEY)return;
 var guide=document.getElementById('pushGuide'),btn=document.getElementById('pushBtn');
 box.hidden=false;
 if(pushIsIos()&&!pushStandalone()){guide.hidden=false;return;}
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
  pushSay('הדפדפן הזה לא תומך בהתראות לטלפון. באייפון צריך לפתוח מהאייקון במסך הבית.');
  return;
 }
 btn.hidden=false;
 btn.addEventListener('click',pushSubscribe);
 navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription();}).then(function(sub){
  if(sub)pushSay('מופעל. ההתראות יגיעו לטלפון הזה.');
 }).catch(function(e){pushSay('לא נבדק המנוי: '+e.message+'.');});
}
function pushStart(){
 pushBadge();
 if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(function(e){console.warn('service worker: '+e.message);});
 }
 pushInit();
}
boot('push',pushStart);
`;

module.exports = { css, html, js };
