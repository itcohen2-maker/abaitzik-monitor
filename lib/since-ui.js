'use strict';
/*
  24.10.2026: "מאז שהיית כאן", one line under the home greeting. On load the page compares
  what it holds now (answers from claude in the chat, reports, open approvals) with the
  snapshot this device saved the last time the page was left. The line is computed once
  per load, so it stays on screen while the person reads; the snapshot is only taken when
  the page is hidden or closed. Nothing changed, or no snapshot yet, means the box stays hidden.
  The pure functions (sinceNow, sinceDiff, sinceLine, sinceSnapshot) are tested from tests/since-ui.test.js.
*/
const css = `
.since{margin:0 0 12px;padding:9px 12px;border-radius:14px;background:var(--sunk);border:1px solid var(--line);color:var(--ink);font:600 14px/1.5 Heebo,sans-serif;text-align:start}
.since[hidden]{display:none}
`;

const js = `
var SINCE_KEY='sinceSnap';
function sinceRead(){
 try{var v=JSON.parse(localStorage.getItem(SINCE_KEY)||'null');return v&&typeof v==='object'&&v.at?v:null;}catch(e){return null;}
}
function sinceWrite(v){try{localStorage.setItem(SINCE_KEY,JSON.stringify(v));}catch(e){}}
// What the page holds now, as the diff needs it: the times of claude's answers and of the
// reports, and the ids of approvals still waiting (done is the list of answered ids).
function sinceNow(data,done){
 var answerAts=[],reportAts=[],approvalIds=[];
 (data.chat||[]).forEach(function(m){if(m&&m.from==='claude')answerAts.push(String(m.at||''));});
 (data.reports||[]).forEach(function(r){reportAts.push(String((r&&r.at)||''));});
 (data.choices||[]).forEach(function(c){
  if(c&&c.type==='approve'&&(done||[]).indexOf(c.id)<0)approvalIds.push(String(c.id));
 });
 return {answerAts:answerAts,reportAts:reportAts,approvalIds:approvalIds};
}
// The snapshot saved when the page is left: the moment, and the approvals waiting then.
function sinceSnapshot(now,ms){
 return {at:ms,approvalIds:now.approvalIds.slice(0,200)};
}
function sinceDiff(snap,now){
 var since=Number(snap&&snap.at)||0,seen=(snap&&snap.approvalIds)||[];
 function later(a){var t=Date.parse(a);return !isNaN(t)&&t>since;}
 return {
  answers:now.answerAts.filter(later).length,
  reports:now.reportAts.filter(later).length,
  approvals:now.approvalIds.filter(function(id){return seen.indexOf(id)<0;}).length
 };
}
function sinceLine(d){
 var parts=[];
 if(d.answers)parts.push(d.answers===1?'תשובה חדשה אחת':d.answers+' תשובות חדשות');
 if(d.approvals)parts.push(d.approvals===1?'אישור אחד ממתין':d.approvals+' אישורים ממתינים');
 if(d.reports)parts.push(d.reports===1?'דוח חדש':d.reports+' דוחות חדשים');
 return parts.length?'מאז שהיית כאן: '+parts.join(', '):'';
}
// The box sits just above the approvals strip in the home section. It is made here when the
// markup does not carry it, so both layouts work.
function sinceHost(){
 var h=document.getElementById('sinceBox');
 if(h)return h;
 var apv=document.getElementById('approvalsBox');
 if(!apv||!apv.parentNode)return null;
 h=document.createElement('div');
 h.id='sinceBox';h.className='since';h.hidden=true;
 apv.parentNode.insertBefore(h,apv);
 return h;
}
function sinceDoneIds(){
 try{return idList('choicesDone')||[];}catch(e){return [];}
}
function renderSince(){
 var host=sinceHost();if(!host)return;
 var snap=sinceRead(),line='';
 if(snap)line=sinceLine(sinceDiff(snap,sinceNow(D,sinceDoneIds())));
 host.textContent=line;host.hidden=!line;
}
function sinceLeave(){
 try{sinceWrite(sinceSnapshot(sinceNow(D,sinceDoneIds()),Date.now()));}catch(e){}
}
function sinceBoot(){
 renderSince();
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')sinceLeave();});
 window.addEventListener('pagehide',sinceLeave);
}
`;

module.exports = { css, js };
