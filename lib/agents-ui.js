'use strict';
/*
  14.11.2026, Itzik: "אני רוצה שתשים אריח המנהל שלי ... קודם כל האריח יהיה למעלה ... תן למנהל פקודות שחוזרות על עצמן
  כל יום. תיצור למנהל סוכנים. לכל סוכן תיתן שם, עם אפשרות לשינוי השמות. וכל סוכן יהיה לו תפקיד ... אני רוצה מוקאפ
  שכתוב עליו עבודת המנהל ... הוא יפרט את כל מה שהמנהל עושה ועשה." Designed together on a private page first
  (/p/028727aa4fbf06dcceb8.html), then "להעביר למוניטור".

  The screen sits on top of the routines (lib/routines.js): an agent is a name, a role and a colour, and every routine
  may belong to one. Everything is sent the way the old sheet sent it ("שגרה חדשה|עצירה|חידוש|מחיקה|עכשיו|סוכן|סוכן
  מחיקה: ..."), saved by the listener with no model, and run by the worker on its minute timer. A routine never gets
  more rights than a message typed by hand: sends, payments and deletes still wait for approval.
  The old sheet (myMgrSheet in build.js) stays in the code; this one takes the tile's tap before it.
  Page JS rules: a plain string, so no backslashes, no backticks and no dollar-brace in it.
*/
const css = `
/* ---- המנהל: the tile at the top and the agents screen (14.11) ---- */
@property --mgAng{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes mgSpin{to{--mgAng:360deg}}
@keyframes mgDraw{to{stroke-dashoffset:0}}
@keyframes mgDrop{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes mgWave{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-5px);opacity:1}}
#mgrTop{display:flex;align-items:center;gap:14px;width:100%;box-sizing:border-box;text-align:right;cursor:pointer;border-radius:22px;padding:13px 15px;margin:4px 0 14px;
 color:var(--ink,#e8eaed);font-family:Heebo,sans-serif;border:2px solid transparent;
 background:linear-gradient(var(--surface,#1a1c21),var(--surface,#1a1c21)) padding-box,conic-gradient(from var(--mgAng),#4285F4,#EA4335,#FBBC05,#34A853,#4285F4) border-box;box-shadow:0 8px 24px rgba(66,133,244,.14)}
#mgrTop.busy{animation:mgSpin 3s linear infinite}
#mgrTop .mgAv{flex:0 0 50px;width:50px;height:50px;border-radius:50%;padding:2.5px;background:conic-gradient(from var(--mgAng),#4285F4,#EA4335,#FBBC05,#34A853,#4285F4)}
#mgrTop.busy .mgAv{animation:mgSpin 2.2s linear infinite}
#mgrTop .mgAv span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:var(--surface,#1a1c21);font-size:23px}
#mgrTop b{display:block;font:800 17px Heebo,sans-serif}#mgrTop small{display:block;color:var(--dim,#9aa0a6);font-size:13px;margin-top:2px}
#mgrTop .mgGo{margin-inline-start:auto;color:var(--dim,#9aa0a6);font-size:20px}
#agScr{position:fixed;inset:0;z-index:100001;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--ground,#0b0d12);color:var(--ink,#e8eaed);font-family:Heebo,sans-serif}
#agScr .agW{max-width:520px;margin:0 auto;padding:12px 16px calc(110px + env(safe-area-inset-bottom))}
#agScr .agBar{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:2;background:var(--ground,#0b0d12);padding:calc(10px + env(safe-area-inset-top)) 0 10px}
#agScr .agX{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom));z-index:3;font:800 16px Heebo,sans-serif;border:0;border-radius:999px;padding:13px 30px;cursor:pointer;color:var(--ground,#0b0d12);background:var(--ink,#e8eaed);box-shadow:0 6px 22px rgba(0,0,0,.35)}
#agScr .agBack{border:1px solid var(--line,#2e3036);background:var(--surface,#1a1c21);color:inherit;border-radius:999px;padding:8px 15px;font:700 14px Heebo,sans-serif;cursor:pointer}
#agScr h2{font:800 22px Heebo,sans-serif;margin:0;color:var(--ink,#e8eaed)}
#agScr .agN b,#agScr .agSec,#agScr .agWork h3,#agScr .agSum b,#agScr .agL li,#agScr .ev .tx{color:var(--ink,#e8eaed)}
#agScr .agLead{color:var(--dim,#9aa0a6);font-size:14.5px;line-height:1.55;margin:4px 0 14px}
#agScr .agSum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
#agScr .agSum div{background:var(--surface,#1a1c21);border:1px solid var(--line,#2e3036);border-radius:16px;padding:10px 6px;text-align:center}
#agScr .agSum b{display:block;font:800 22px Heebo,sans-serif}#agScr .agSum small{color:var(--dim,#9aa0a6);font-size:12px}
#agScr .agSec{font:800 16px Heebo,sans-serif;margin:16px 0 8px;display:flex;align-items:center;justify-content:space-between}
#agScr .agNew{font:700 13.5px Heebo,sans-serif;border:0;border-radius:999px;padding:8px 15px;cursor:pointer;color:#fff;background:linear-gradient(90deg,#4285F4,#6d5cf0)}
#agScr .ag{background:var(--surface,#1a1c21);border:1px solid var(--line,#2e3036);border-radius:20px;padding:12px 14px;margin-bottom:10px;border-inline-start:4px solid var(--c);animation:mgDrop .35s ease-out}
#agScr .ag.off{opacity:.6}
#agScr .agH{display:flex;align-items:center;gap:10px;cursor:pointer}
#agScr .agChev{flex:none;color:var(--dim,#9aa0a6);font-size:13px;transition:transform .2s}
#agScr .ag.open .agChev{transform:rotate(180deg)}
#agScr .agS1{font-size:13px;color:var(--dim,#9aa0a6);margin:6px 52px 0 0;cursor:pointer}
#agScr .agS1 b{font-weight:700}
#agScr .ag:not(.open) .agBody{display:none}
#agScr .agBody{animation:mgDrop .25s ease-out}
#agScr .agA{flex:0 0 42px;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font:800 18px Heebo,sans-serif;color:#fff;background:var(--c);position:relative}
#agScr .ag.work .agA::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent;background:conic-gradient(from var(--mgAng),#4285F4,#EA4335,#FBBC05,#34A853,#4285F4) border-box;
 -webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:mgSpin 1.8s linear infinite}
#agScr .agN{flex:1;min-width:0}
#agScr .agN b{font:800 16px Heebo,sans-serif;display:flex;align-items:center;gap:6px}
#agScr .agN input{font:800 16px Heebo,sans-serif;color:inherit;background:var(--sunk,#14161a);border:1px solid #4285F4;border-radius:8px;padding:3px 8px;width:10em}
#agScr .agEd{border:0;background:transparent;color:var(--dim,#9aa0a6);cursor:pointer;font-size:14px;padding:2px 4px}
#agScr .agN small{color:var(--dim,#9aa0a6);font-size:12.5px}
#agScr .agSw{flex:0 0 44px;width:44px;height:26px;border-radius:13px;background:#34A853;position:relative;border:0;cursor:pointer;padding:0}
#agScr .agSw::after{content:'';position:absolute;top:4px;left:4px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .2s}
#agScr .ag.off .agSw{background:var(--line,#3a3b3f)}#agScr .ag.off .agSw::after{left:22px}
#agScr .agL{list-style:none;margin:10px 0 0;padding:0}
#agScr .agL li{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line,#2e3036);font-size:14.5px;line-height:1.45}
#agScr .agL li.off{opacity:.55}
#agScr .agL .t{flex:1;min-width:0}
#agScr .agL .fq{display:inline-block;font:700 11.5px Heebo,sans-serif;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);border-radius:999px;padding:2px 9px;margin-top:3px}
#agScr .agL .x{flex:none;border:0;background:transparent;color:var(--dim,#9aa0a6);cursor:pointer;font-size:15px;padding:4px}
#agScr .agLast{font-size:12.5px;color:var(--dim,#9aa0a6);margin-top:7px;display:flex;align-items:center;gap:6px}
#agScr .dots{display:inline-flex;gap:4px}#agScr .dots i{width:6px;height:6px;border-radius:50%;background:#4285F4;animation:mgWave 1.1s infinite}
#agScr .dots i:nth-child(2){background:#EA4335;animation-delay:.12s}#agScr .dots i:nth-child(3){background:#FBBC05;animation-delay:.24s}#agScr .dots i:nth-child(4){background:#34A853;animation-delay:.36s}
#agScr .agAct{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
#agScr .agAct button{font:600 13px Heebo,sans-serif;padding:6px 12px;border-radius:999px;border:1px solid var(--line,#2e3036);background:transparent;color:inherit;cursor:pointer}
#agScr .agOpt{margin-top:8px;padding:10px;border-radius:14px;background:var(--sunk,#14161a)}
#agScr .agOpt label{display:block;font:700 12.5px Heebo,sans-serif;color:var(--dim,#9aa0a6);margin:8px 0 5px}
#agScr .agCh{display:flex;flex-wrap:wrap;gap:6px}
#agScr .agCh button{font:600 13px Heebo,sans-serif;border:1px solid var(--line,#2e3036);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;cursor:pointer}
#agScr .agCh button.on{background:rgba(66,133,244,.2);border-color:#4285F4}
#agScr .agOpt input[type=time]{font:15px Heebo,sans-serif;border-radius:10px;border:1px solid var(--line,#2e3036);background:var(--surface,#1a1c21);color:inherit;padding:7px}
#agScr .agSave{width:100%;margin-top:12px;font:800 15px Heebo,sans-serif;border:0;border-radius:999px;padding:11px;color:#fff;background:linear-gradient(90deg,#4285F4,#6d5cf0);cursor:pointer}
#agScr .agWork{background:var(--surface,#1a1c21);border:1px solid var(--line,#2e3036);border-radius:22px;padding:14px;margin-top:18px}
#agScr .agWork h3{margin:0;font:800 17px Heebo,sans-serif;display:flex;align-items:center;justify-content:space-between}
#agScr .agWork h3 small{font:600 12.5px Heebo,sans-serif;color:var(--dim,#9aa0a6)}
#agScr .agTabs{display:flex;gap:6px;margin:10px 0}
#agScr .agTabs button{font:600 13px Heebo,sans-serif;border:1px solid var(--line,#2e3036);background:transparent;color:var(--dim,#9aa0a6);border-radius:999px;padding:5px 12px;cursor:pointer}
#agScr .agTabs button.on{background:var(--ink,#e8eaed);color:var(--ground,#0b0d12);border-color:var(--ink,#e8eaed)}
#agScr .ev{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--line,#2e3036)}
#agScr .ev .ic{flex:0 0 26px;height:26px;display:grid;place-items:center;font-size:16px}
#agScr .ev svg{width:22px;height:22px}
#agScr .ev circle,#agScr .ev path{fill:none;stroke:#34A853;stroke-width:2.6;stroke-linecap:round;stroke-dasharray:80;stroke-dashoffset:80;animation:mgDraw .5s forwards}
#agScr .ev path{animation-delay:.25s}
#agScr .ev.now .ic{border-radius:50%;padding:2px;box-sizing:border-box;background:conic-gradient(from var(--mgAng),#4285F4,#EA4335,#FBBC05,#34A853,#4285F4);animation:mgSpin 1.6s linear infinite}
#agScr .ev.now .ic span{display:block;width:100%;height:100%;border-radius:50%;background:var(--surface,#1a1c21)}
#agScr .ev .tx{flex:1;min-width:0;font-size:14px;line-height:1.5}
#agScr .ev .tx small{display:block;color:var(--dim,#9aa0a6);font-size:12px}
#agScr .ev .who{font-weight:800;color:var(--c)}
#agScr .agEmpty{color:var(--dim,#9aa0a6);font-size:14px;padding:8px 0}
#agScr .tpl{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#agScr .tpl button{text-align:right;font:600 13px Heebo,sans-serif;color:inherit;background:var(--surface,#1a1c21);border:1px solid var(--line,#2e3036);border-radius:14px;padding:9px;cursor:pointer}
#agScr .tpl button small{display:block;color:var(--dim,#9aa0a6);font-weight:400;font-size:11.5px;margin-top:2px}
#agScr .tpl button.on{border-color:#4285F4}
#agScr .agOpt input[type=text]{width:100%;box-sizing:border-box;font:16px Heebo,sans-serif;color:inherit;background:var(--surface,#1a1c21);border:1px solid var(--line,#2e3036);border-radius:12px;padding:9px 11px}
@media(prefers-reduced-motion:reduce){#mgrTop,#mgrTop .mgAv,#agScr *{animation:none!important}}
`;

// His monitor only (see the comment where SYS is used).
const SYS_OWNER = "[['asysmail','נועה','מיילים ודוח בוקר',['brief','mail','mailsweep'],[['כל יום 07:25, 13:00, 18:00','📰','דוח בוקר וקריאת כל המיילים'],['כל 10 דקות','🛠️','מייל על תקלה במוניטור נשלח לתיקון']]],\n  ['asyscal','דני','יומן ועוזר אישי',['cal'],[['בכל סבב','📅','מה יש היום ביומן'],['חצי שעה לפני','⏰','תזכורת לכל פגישה']]],\n  ['asyslead','מאיה','לידים',['leads','bizleads'],[['בכל סבב','🔔','לידים חדשים שמחכים לך'],['אחרי שעתיים','🕵️','ליד שעוד לא טופל']]],\n  ['asyscli','אבי','לקוחות ומוניטורים',['clients','handle','intake','signup','guard'],[['כל 2 דקות','👥','בודק ומתקן כל מוניטור של לקוח'],['כל שעה','🖱️','בודק כל כפתור בכל המוניטורים']]],\n  ['asyscont','שירה','תוכן ורשתות',['plate','platesite','status','aistory','story','linkedin','platestock','statusstock','candles'],[['כל יום','🍽️','מה בצלחת, סטטוס, נרות, לינקדין וסטורי'],['כל בוקר 06:30','🎬','מלאי לשבוע מראש']]],\n  ['asyssec','רון','אבטחה ואישורים',['security','vercel','approvals'],[['פעמיים ביום','🔒','בדיקת אבטחה'],['כל יום','🛡️','אישורים של מטא וגוגל, וורסל']]],\n  ['asyswork','ליאת','מה נשאר לך',[],[['בכל סבב','🙋','מה פתוח ומחכה לך היום']]]]";

function js(isOwner) {
  const NAME = isOwner ? 'המנהל שלי' : 'המנהלת שלי';
  return `
(function(){
 var NAME=${JSON.stringify(NAME)},COL=['#4285F4','#EA4335','#FBBC05','#34A853'],NL=String.fromCharCode(10);
 var TPL=[['📬 מיילים','נועה','אחראית על המיילים','לבדוק את המייל ולסכם לי מה חשוב','work'],['⏰ תזכורות','דני','עוזר אישי ותזכורות','להזכיר לי את מה שיש היום ביומן','remind'],
  ['🔔 לידים','מאיה','אחראית על הלידים','לבדוק אם נכנס ליד חדש ולהכין לו תשובה','work'],['💰 כסף','יוסי','כסף וגבייה','לבדוק מי עוד לא שילם ולנסח תזכורת מנומסת','work'],
  ['📱 רשתות','שירה','רשתות חברתיות','לבדוק תגובות והודעות חדשות ברשתות','work'],['🤝 לקוחות','אבי','לקוחות קיימים','להזכיר לי לחזור ללקוח שלא דיברנו איתו חודש','remind']];
 // 14.11.2026, Itzik: "הרשימות שלו לא מעודכנות אצלי". On his monitor the manager already works all day (lib/manager.js,
 // rounds 07:25, 13:00, 18:00, D.manager). Its work is shown as fixed agents by field, with today's state of each item.
 // The names are his to change (saved like any agent, under the fixed id); their own commands can be added under them.
 var SYS=${isOwner ? SYS_OWNER : '[]'};
 function MI(){return (window.D&&D.manager&&D.manager.items)||[];}
 function MAT(){return (window.D&&D.manager&&D.manager.at)||'';}
 function sysOf(k){for(var i=0;i<SYS.length;i++)if(SYS[i][3].indexOf(k)>=0)return SYS[i];return SYS[SYS.length-1];}
 function sysAgents(){
  if(!MI().length)return [];
  return SYS.map(function(S,n){var ov=((window.D&&D.agents)||[]).filter(function(x){return x.id===S[0];})[0];
   return {id:S[0],name:ov?ov.name:S[1],role:S[2],c:n%4,sys:S,items:MI().filter(function(i){return sysOf(i.k)===S;})};}).filter(function(a){return a.items.length;});
 }
 function ALL(){return sysAgents().concat(A());}
 function E(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
 function A(){return ((window.D&&D.agents)||[]).filter(function(x){return String(x.id).indexOf('asys')!==0;});}
 function R(){return (window.D&&D.routines)||[];}
 function tday(iso){if(!iso)return false;var d=new Date(iso),n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();}
 function hhmm(iso){var d=new Date(iso);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
 function newId(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
 function say(t){try{toast(t);}catch(e){}}
 // one line to the listener, the same road the old sheet used
 function send(cmd,body){var note='שגרה '+cmd+': '+body;return sendText('שגרה',note,'משימה').then(function(){try{markSent('text',note);}catch(e){}});}
 function chain(list){return list.reduce(function(p,x){return p.then(function(){return send(x[0],x[1]);});},Promise.resolve());}
 function routinesOf(a){return R().filter(function(r){return a?r.agent===a.id:!r.agent||!ALL().some(function(x){return x.id===r.agent;});});}
 function busy(){return R().filter(function(r){return r.runNow;});}
 // ---- the tile, first in the tiles block ----
 function sub(){
  var on=A().length,rs=R().filter(function(r){return r.state==='active';}),b=busy()[0];
  if(b){var ag=ALL().filter(function(a){return a.id===b.agent;})[0];return (ag?ag.name+' ':'')+'עובד עכשיו: '+b.text;}
  if(MI().length){var w=MI().filter(function(i){return i.st!=='done'&&i.st!=='ok';}).length;return ALL().length+' סוכנים · סבב '+hhmm(MAT())+' · '+(w?w+' מחכים לך':'הכל טופל');}
  if(!rs.length)return 'תן למנהל פקודות שחוזרות על עצמן';
  var nx=rs.filter(function(r){return r.next;}).sort(function(x,y){return x.next<y.next?-1:1;})[0];
  return (on?on+' סוכנים · ':'')+(nx?'הבא: '+nx.text.slice(0,40)+' ב '+hhmm(nx.next):rs.length+' פקודות פעילות');
 }
 function tile(){
  // first in the tools: above the round icons, so it shows with עוד כלים and hides with it
  var anchor=document.getElementById('blkIcons')||document.getElementById('blkTiles');if(!anchor||!anchor.parentNode)return;
  var t=document.getElementById('mgrTop');
  if(!t){t=document.createElement('button');t.type='button';t.id='mgrTop';
   t.innerHTML='<div class="mgAv"><span>🧑‍💼</span></div><div><b></b><small></small></div><span class="mgGo">‹</span>';
   t.addEventListener('click',function(e){e.preventDefault();open();});}
  if(anchor.previousSibling!==t)anchor.parentNode.insertBefore(t,anchor);
  t.querySelector('b').textContent=NAME;t.querySelector('small').textContent=sub();
  t.classList.toggle('busy',!!busy().length);
  var old=document.getElementById('gMyMgr');if(old)old.style.display='none';
 }
 // ---- the screen ----
 var agOpen={},scr=null,tab='all',formFor=null,fq='day',kind='remind',pickT=-1;
 function chk(){return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.2 3.2L17 9"/></svg>';}
 function optHtml(withAgent){
  return '<div class="agOpt">'+(withAgent?'<label>תבנית (או כותבים לבד)</label><div class="tpl">'+TPL.map(function(T,k){return '<button type="button" data-tpl="'+k+'"'+(pickT===k?' class="on"':'')+'>'+T[0]+'<small>'+E(T[3])+'</small></button>';}).join('')+'</div>'
    +'<label>שם הסוכן</label><input type="text" id="agNm" maxlength="24" placeholder="למשל: נועה"><label>התפקיד שלו</label><input type="text" id="agRl" maxlength="80" placeholder="למשל: אחראית על המיילים">':'')
   +'<label>מה לעשות (כותבים או אומרים)</label><div class="rpill"><input id="agTx" placeholder="למשל: לבדוק את המייל ולסכם לי מה חשוב"><button type="button" class="rpMic" aria-label="להקליט">🎤</button><button type="button" class="rpGo" data-a="save" aria-label="לשמור">שמירה</button></div>'
   +'<label>כמה פעמים</label><div class="agCh" data-g="fq">'+[['day','פעם ביום'],['3','3 פעמים ביום'],['hour','כל שעה'],['week','פעם בשבוע'],['month','פעם בחודש']].map(function(x){return '<button type="button" data-v="'+x[0]+'"'+(fq===x[0]?' class="on"':'')+'>'+x[1]+'</button>';}).join('')+'</div>'
   +(fq==='3'?'<label>ב 08:00, 13:00 ו 18:00</label>':'<label>'+(fq==='hour'?'באיזו דקה בכל שעה (מ 08:00 עד 20:00)':'באיזו שעה')+'</label><input type="time" id="agHm" value="08:00">')
   +(fq==='week'?'<label>באיזה יום</label><div class="agCh" data-g="dw">'+['א','ב','ג','ד','ה','ו','ש'].map(function(n,i){return '<button type="button" data-v="'+i+'"'+(i===0?' class="on"':'')+'>'+n+'</button>';}).join('')+'</div>':'')
   +(fq==='month'?'<label>באיזה יום בחודש</label><input type="time" id="agDom" style="display:none"><div class="agCh" data-g="dm">'+[1,10,15,20,28].map(function(n,i){return '<button type="button" data-v="'+n+'"'+(i===0?' class="on"':'')+'>'+n+'</button>';}).join('')+'</div>':'')
   +'<label>מה הוא עושה עם זה</label><div class="agCh" data-g="kind"><button type="button" data-v="remind"'+(kind==='remind'?' class="on"':'')+'>⏰ מזכיר לי</button><button type="button" data-v="work"'+(kind==='work'?' class="on"':'')+'>🛠️ עושה ומחזיר תשובה</button></div>'
   +'<button type="button" class="agSave" data-a="save">'+(withAgent?'ליצור את הסוכן':'להוסיף את הפקודה')+'</button>'
   +'<small style="display:block;color:var(--dim,#9aa0a6);margin-top:8px;font-size:12px">שליחה לאנשים, תשלום ומחיקה תמיד מחכים לאישור שלך.</small></div>';
 }
 function agHtml(a,i){
  var L=routinesOf(a),on=L.some(function(r){return r.state==='active';}),wk=L.some(function(r){return r.runNow;});
  var last=L.reduce(function(m,r){return r.lastRunAt&&(!m||r.lastRunAt>m.lastRunAt)?r:m;},null);
  var c=a?COL[(a.c||0)%4]:'#9aa0a6',id=a?a.id:'',S=a&&a.sys;
  var ST={done:'✓',ok:'✓',warn:'⚠️',todo:'○'};
  var isOpen=!!agOpen[id||'_']||formFor===id+'|cmd';
  var nW=S?a.items.filter(function(i){return i.st!=='done'&&i.st!=='ok';}).length:0,nD=S?a.items.length-nW:0;
  var s1=S?(nW?'<b style="color:#FBBC05">⚠️ '+nW+' מחכים לך</b>':'<b style="color:#34A853">✓ הכל טופל</b>')+(nD?' · ✓ '+nD+' נעשו':'')+(L.length?' · '+L.length+' פקודות שלך':'')
    :(L.length?L.length+(L.length===1?' פקודה':' פקודות')+(L[0]?' · '+E(L[0].label):''):'עוד אין פקודות');
  var fixed=S?'<ul class="agL">'+a.items.map(function(i){return '<li><span>'+(ST[i.st]||'•')+'</span><span class="t">'+E(String(i.t||'').replace('undefined ',''))+(i.sub?'<br><small style="color:var(--dim,#9aa0a6)">'+E(i.sub)+'</small>':'')+'</span></li>';}).join('')+'</ul>'
   +'<ul class="agL">'+S[4].map(function(x){return '<li><span>'+x[1]+'</span><span class="t">'+E(x[2])+'<br><span class="fq">'+E(x[0])+' · קבוע</span></span></li>';}).join('')+'</ul>':'';
  return '<div class="ag'+(isOpen?' open':'')+(on||!L.length?'':' off')+(wk?' work':'')+'" style="--c:'+c+'" data-ag="'+E(id)+'"><div class="agH"><div class="agA">'+E(a?a.name.charAt(0):'⚙')+'</div>'
   +'<div class="agN"><b><span class="nm">'+E(a?a.name:'כללי')+'</span>'+(a?'<button type="button" class="agEd" data-a="ren" aria-label="לשנות את השם">✏️</button>':'')+'</b><small>'+E(a?(a.role||'בלי תפקיד'):'פקודות בלי סוכן')+'</small></div>'
   +(L.length?'<button type="button" class="agSw" data-a="sw" aria-label="'+(on?'לעצור':'להפעיל')+'"></button>':'')+'<span class="agChev" aria-hidden="true">▼</span></div><div class="agS1">'+s1+'</div><div class="agBody">'
   +fixed+(L.length?'<ul class="agL">'+L.map(function(r){return '<li class="'+(r.state==='active'?'':'off')+'"><span>'+(r.kind==='work'?'🛠️':'⏰')+'</span><span class="t">'+E(r.text)+'<br><span class="fq">'+E(r.label)+(r.state==='active'?'':' · עצור')+'</span></span><button type="button" class="x" data-a="del" data-r="'+E(r.id)+'" aria-label="למחוק את הפקודה">🗑</button></li>';}).join('')+'</ul>':(S?'':'<div class="agEmpty">עוד אין לו פקודות. כותבים למטה מה לעשות.</div>'))
   +'<div class="agLast">'+(S&&!wk?'עודכן בסבב של '+hhmm(MAT()):wk?'<span class="dots"><i></i><i></i><i></i><i></i></span>עובד עכשיו':last?'אחרון: '+(tday(last.lastRunAt)?'היום ':'')+hhmm(last.lastRunAt)+' · '+E(last.lastResult||last.text):'עוד לא רץ')+'</div>'
   +'<div class="agAct">'+(L.length?'<button type="button" data-a="run">▶ להריץ עכשיו</button>':'')+'<button type="button" data-a="add">+ פקודה</button>'+(a&&!S?'<button type="button" data-a="rm">למחוק את הסוכן</button>':'')+'</div>'
   +(formFor===id+'|cmd'?optHtml(false):'')+'</div></div>';
 }
 function events(){
  var ev=[];
  sysAgents().forEach(function(a){a.items.forEach(function(i){ev.push({k:(i.st==='done'||i.st==='ok')?'done':'wait',at:MAT(),c:COL[a.c%4],who:a.name,t:String(i.t||'').replace('undefined ',''),res:i.sub||''});});});
  R().forEach(function(r){var a=ALL().filter(function(x){return x.id===r.agent;})[0],c=a?COL[(a.c||0)%4]:'#9aa0a6',who=a?a.name:NAME;
   if(r.runNow)ev.push({k:'now',at:new Date().toISOString(),c:c,who:who,t:r.text});
   (r.runs||[]).forEach(function(x){if(tday(x.at))ev.push({k:'done',at:x.at,c:c,who:who,t:r.text,res:x.result});});
   if(r.state==='active'&&r.next&&tday(r.next))ev.push({k:'next',at:r.next,c:c,who:who,t:r.text});});
  return ev.sort(function(x,y){var o={now:0,wait:1,done:2,next:3};return o[x.k]-o[y.k]||(x.k==='next'?(x.at<y.at?-1:1):(x.at>y.at?-1:1));});
 }
 function workHtml(){
  var ev=events(),sh=ev.filter(function(e){return tab==='all'||e.k===tab||(tab==='done'&&e.k==='now');});
  return '<div class="agWork"><h3>🗂️ עבודת '+(NAME==='המנהל שלי'?'המנהל':'המנהלת')+' <small>היום · '+ev.filter(function(e){return e.k!=='next';}).length+' נעשו</small></h3>'
   +'<div class="agTabs">'+[['all','הכל'],['wait','מחכה לך'],['done','נעשה'],['next','בהמשך היום']].map(function(x){return '<button type="button" data-tab="'+x[0]+'"'+(tab===x[0]?' class="on"':'')+'>'+x[1]+'</button>';}).join('')+'</div>'
   +(sh.length?sh.map(function(e){return '<div class="ev '+e.k+'" style="--c:'+e.c+'"><div class="ic">'+(e.k==='now'?'<span></span>':e.k==='next'?'🕒':e.k==='wait'?'⚠️':chk())+'</div><div class="tx"><small>'+(e.k==='now'?'עכשיו':hhmm(e.at))+(e.k==='wait'?' · מחכה לך':'')+'</small><span class="who">'+E(e.who)+'</span> '+E(e.t)+(e.res?'<small>'+E(e.res)+'</small>':'')+'</div></div>';}).join('')
     :'<div class="agEmpty">'+(tab==='next'?'אין עוד משהו היום.':tab==='wait'?'שום דבר לא מחכה לך.':'עוד לא נעשה כלום היום.')+'</div>')+'</div>';
 }
 function draw(){
  if(!scr)return;var y=scr.scrollTop;
  var ag=ALL(),gen=routinesOf(null),rs=R(),act=rs.filter(function(r){return r.state==='active';}).length,ev=events();
  scr.innerHTML='<div class="agW"><div class="agBar"><button type="button" class="agBack" data-a="x">‹ חזרה</button><h2>🧑‍💼 '+NAME+'</h2></div>'
   +'<p class="agLead">תן למנהל פקודות שחוזרות על עצמן. כל סוכן אחראי על תחום אחד, ואתה קובע לו מה לעשות וכמה פעמים. תזכורת מגיעה לטלפון, ועבודה חוזרת עם תשובה במסך התשובות.</p>'
   +'<div class="agSum"><div><b>'+ag.length+'</b><small>סוכנים</small></div><div><b>'+(MI().length?ev.filter(function(e){return e.k==='wait';}).length:act)+'</b><small>'+(MI().length?'מחכים לך':'פקודות פעילות')+'</small></div><div><b>'+ev.filter(function(e){return e.k==='done';}).length+'</b><small>נעשו היום</small></div></div>'
   +'<div class="agSec">הסוכנים שלך <button type="button" class="agNew" data-a="new">+ סוכן חדש</button></div>'
   +(formFor==='|new'?'<div class="ag" style="--c:#4285F4"><b>סוכן חדש</b>'+optHtml(true)+'</div>':'')
   +(ag.length||gen.length?ag.map(agHtml).join('')+(gen.length?agHtml(null):''):'<div class="agEmpty">עוד אין סוכנים. "+ סוכן חדש" ומתחילים מתבנית, למשל מיילים או תזכורות.</div>')
   +workHtml()+'</div><button type="button" class="agX" data-a="x">✕ סגירה</button>';
  scr.scrollTop=y;
 }
 function open(){
  if(!scr){scr=document.createElement('div');scr.id='agScr';scr.setAttribute('role','dialog');scr.setAttribute('aria-label',NAME);scr.addEventListener('click',onClick);document.body.appendChild(scr);}
  formFor=null;draw();scr.scrollTop=0;
  try{history.pushState({ag:1},'');}catch(e){}
 }
 function close(){if(scr){scr.remove();scr=null;}tile();}
 window.addEventListener('popstate',function(){if(scr)close();});
 function readForm(){
  var tx=(document.getElementById('agTx')||{}).value||'';tx=tx.trim();
  if(tx.length<3){say('מה לעשות? כותבים או אומרים.');return null;}
  var hm=(document.getElementById('agHm')||{}).value||'08:00',out=[];
  var pick=function(g){var b=scr.querySelector('[data-g="'+g+'"] .on');return b?b.getAttribute('data-v'):null;};
  if(fq==='3')['08:00','13:00','18:00'].forEach(function(h){out.push({text:tx,kind:kind,sched:{freq:'daily',hm:h}});});
  else if(fq==='hour')out.push({text:tx,kind:kind,sched:{freq:'hourly',hm:hm}});
  else if(fq==='week')out.push({text:tx,kind:kind,sched:{freq:'weekly',hm:hm,days:[+(pick('dw')||0)]}});
  else if(fq==='month')out.push({text:tx,kind:kind,sched:{freq:'monthly',hm:hm,dom:+(pick('dm')||1)}});
  else out.push({text:tx,kind:kind,sched:{freq:'daily',hm:hm}});
  return out;
 }
 function label(s){if(s.freq==='hourly')return 'כל שעה';if(s.freq==='weekly')return 'כל שבוע ב '+s.hm;if(s.freq==='monthly')return 'ב '+s.dom+' לחודש ב '+s.hm;return 'כל יום ב '+s.hm;}
 function addLocal(list,agentId){
  if(!window.D)return;D.routines=(D.routines||[]).concat(list.map(function(o){return {id:'',text:o.text,kind:o.kind,sched:o.sched,state:'active',label:label(o.sched)+' · נשמר',agent:agentId||'',runs:[]};}));
 }
 function onClick(e){
  // a tap on the card's head or its summary line opens or closes it, like an answer
  var hd=e.target.closest?e.target.closest('.agH,.agS1'):null;
  if(hd&&!e.target.closest('button,input')){var cd=hd.closest('[data-ag]'),k=cd.getAttribute('data-ag')||'_';agOpen[k]=!agOpen[k];draw();return;}
  var b=e.target.closest?e.target.closest('button'):null;if(!b)return;
  var a=b.getAttribute('data-a'),card=b.closest('[data-ag]'),aid=card?card.getAttribute('data-ag'):'';
  var ag=ALL().filter(function(x){return x.id===aid;})[0];
  if(b.getAttribute('data-tab')){tab=b.getAttribute('data-tab');draw();return;}
  var g=b.parentNode&&b.parentNode.getAttribute&&b.parentNode.getAttribute('data-g');
  if(g){if(g==='fq'){fq=b.getAttribute('data-v');var keep=(document.getElementById('agTx')||{}).value,nm=(document.getElementById('agNm')||{}).value,rl=(document.getElementById('agRl')||{}).value;draw();
     if(keep)document.getElementById('agTx').value=keep;if(nm&&document.getElementById('agNm'))document.getElementById('agNm').value=nm;if(rl&&document.getElementById('agRl'))document.getElementById('agRl').value=rl;return;}
   if(g==='kind')kind=b.getAttribute('data-v');
   Array.prototype.forEach.call(b.parentNode.children,function(x){x.classList.toggle('on',x===b);});return;}
  if(b.getAttribute('data-tpl')!=null){pickT=+b.getAttribute('data-tpl');var T=TPL[pickT];
   document.getElementById('agNm').value=T[1];document.getElementById('agRl').value=T[2];document.getElementById('agTx').value=T[3];kind=T[4];
   Array.prototype.forEach.call(scr.querySelectorAll('[data-tpl]'),function(x){x.classList.toggle('on',x===b);});
   Array.prototype.forEach.call(scr.querySelectorAll('[data-g="kind"] button'),function(x){x.classList.toggle('on',x.getAttribute('data-v')===kind);});return;}
  if(a==='x'){close();try{if(history.state&&history.state.ag)history.back();}catch(x){}return;}
  if(a==='new'){formFor=formFor==='|new'?null:'|new';fq='day';kind='remind';pickT=-1;draw();var f=document.getElementById('agNm');if(f)f.focus();return;}
  if(a==='add'){formFor=formFor===aid+'|cmd'?null:aid+'|cmd';fq='day';kind='remind';draw();var t=document.getElementById('agTx');if(t)t.focus();return;}
  if(a==='save'){
   var list=readForm();if(!list)return;
   if(formFor==='|new'){
    var nm=((document.getElementById('agNm')||{}).value||'').trim(),rl=((document.getElementById('agRl')||{}).value||'').trim();
    if(!nm){say('איך לקרוא לסוכן?');return;}
    var na={id:newId('a'),name:nm,role:rl,c:A().length%4};
    b.disabled=true;
    chain([['סוכן',JSON.stringify(na)]].concat(list.map(function(o){o.agent=na.id;return ['חדשה',JSON.stringify(o)];}))).then(function(){
     D.agents=A().concat([na]);addLocal(list,na.id);formFor=null;draw();say(nm+' מוכן לעבודה. האישור יגיע בתשובות.');
    }).catch(function(){b.disabled=false;say('לא נשלח. תבדוק חיבור ותנסה שוב.');});
    return;
   }
   b.disabled=true;
   chain(list.map(function(o){if(aid)o.agent=aid;return ['חדשה',JSON.stringify(o)];})).then(function(){addLocal(list,aid);formFor=null;draw();say('הפקודה נשמרה'+(ag?' אצל '+ag.name:'')+'.');})
    .catch(function(){b.disabled=false;say('לא נשלח. תבדוק חיבור ותנסה שוב.');});
   return;
  }
  if(a==='ren'&&ag){
   var sp=card.querySelector('.nm'),inp=document.createElement('input');inp.value=ag.name;inp.maxLength=24;sp.replaceWith(inp);b.style.display='none';inp.focus();inp.select();
   var done=false,fin=function(){if(done)return;done=true;var v=inp.value.trim();
    if(!v||v===ag.name){draw();return;}
    send('סוכן',JSON.stringify({id:ag.id,name:v,role:ag.role,c:ag.c})).then(function(){var L=(D.agents=D.agents||[]),o=L.filter(function(x){return x.id===ag.id;})[0];if(o)o.name=v;else L.push({id:ag.id,name:v,role:ag.role,c:ag.c});ag.name=v;draw();tile();say('השם נשמר: '+v);}).catch(function(){draw();say('לא נשמר. תנסה שוב.');});};
   inp.addEventListener('blur',fin);inp.addEventListener('keydown',function(k){if(k.key==='Enter'){k.preventDefault();inp.blur();}});return;}
  if(a==='sw'){
   var L=routinesOf(ag||null).filter(function(r){return r.id;}),on=L.some(function(r){return r.state==='active';});
   b.disabled=true;
   chain(L.map(function(r){return [on?'עצירה':'חידוש',r.id];})).then(function(){L.forEach(function(r){r.state=on?'paused':'active';});draw();say(on?(ag?ag.name:'הפקודות')+' בהפסקה':(ag?ag.name:'הפקודות')+' חזר לעבוד');})
    .catch(function(){b.disabled=false;say('לא נשלח. תנסה שוב.');});return;}
  if(a==='run'){
   var Lr=routinesOf(ag||null).filter(function(r){return r.id&&r.state==='active';});
   if(!Lr.length){say('אין פקודה פעילה להריץ.');return;}
   b.disabled=true;
   chain(Lr.map(function(r){return ['עכשיו',r.id];})).then(function(){Lr.forEach(function(r){r.runNow=true;});draw();tile();say('רץ בדקה הקרובה. התוצאה תופיע בעבודת המנהל.');})
    .catch(function(){b.disabled=false;say('לא נשלח. תנסה שוב.');});return;}
  if(a==='del'){
   var rid=b.getAttribute('data-r');if(!rid){say('הפקודה עוד נשמרת. עוד רגע אפשר למחוק.');return;}
   if(!b.getAttribute('data-sure')){b.setAttribute('data-sure','1');b.textContent='למחוק?';return;}
   send('מחיקה',rid).then(function(){D.routines=R().filter(function(r){return r.id!==rid;});draw();tile();say('הפקודה נמחקה.');}).catch(function(){say('לא נמחק. תנסה שוב.');});return;}
  if(a==='rm'&&ag){
   if(!b.getAttribute('data-sure')){b.setAttribute('data-sure','1');b.textContent='בטוח? '+ag.name+' והפקודות שלו יימחקו';return;}
   send('סוכן מחיקה',ag.id).then(function(){D.agents=A().filter(function(x){return x.id!==ag.id;});D.routines=R().filter(function(r){return r.agent!==ag.id;});draw();tile();say(ag.name+' נמחק.');})
    .catch(function(){say('לא נמחק. תנסה שוב.');});return;}
 }
 // the old tile and the top tile both open this screen
 document.addEventListener('click',function(e){var t=e.target.closest?e.target.closest('#gMyMgr'):null;if(!t)return;e.preventDefault();e.stopImmediatePropagation();open();},true);
 window.agentsOpen=open;
 function boot(){try{tile();}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 window.addEventListener('load',boot);setTimeout(boot,1500);setTimeout(boot,5000);setInterval(function(){if(!scr)boot();},20000);
})();
`;
}

module.exports = { css, js };
