// Codex's two reproductions, run against the generated page.
const fs=require('fs'); const vm=require('vm');
const html=fs.readFileSync('docs/index.html','utf8');
const m=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const main=m.map(x=>x[1]).sort((a,b)=>b.length-a.length)[0];
// Pull the two functions out and run them against fixtures, with no DOM.
const src=main.slice(main.indexOf('function recordFor(r){'), main.indexOf('function renderReqs(){'));
const ctx={D:{chat:[]}};vm.createContext(ctx);vm.runInContext(src,ctx);
// P0 #1: request A at 10:00; unrelated request B at 11:00 marked done.
ctx.D.chat=[
 {id:'m1',at:'2026-09-12T11:00:00+03:00',from:'itzik',status:'done',requestId:'rB',text:'בקשה אחרת'},
];
const A={id:'rA',at:'2026-09-12T10:00:00+03:00',kind:'text',text:'בקשה א'};
const a=vm.runInContext('reqStatus('+JSON.stringify(A)+')',ctx);
console.log('P0-1 request A =>', a.k, '/', a.t);
console.log('P0-1 verdict  :', a.k==='done' ? 'STILL BROKEN' : 'fixed - B no longer speaks for A');
// And a record that really is about A still works.
ctx.D.chat.push({id:'m2',at:'2026-09-12T12:00:00+03:00',from:'itzik',status:'done',requestId:'rA',text:'זו א'});
const a2=vm.runInContext('reqStatus('+JSON.stringify(A)+')',ctx);
console.log('P0-1 matched  =>', a2.k, '/', a2.t);
// P0 #2: pingPaint with a newer build and zero replies.
const psrc=main.slice(main.indexOf('function pingPaint(){'), main.indexOf('function pingBind(){'));
let said='';let cls=[];
const ctx2={D:{builtAt:'2026-09-12T11:00:00+03:00',chat:[]},
 pingState:()=>({at:'2026-09-12T10:00:00+03:00',code:'PING-ABC123'}),
 pingSay:(t)=>{said=t;},since:()=>'לפני שעה',ago:()=>'שעה',
 document:{getElementById:()=>({classList:{add:(c)=>cls.push('+'+c),remove:(c)=>cls.push('-'+c)}})}};
vm.createContext(ctx2);vm.runInContext(psrc+'\npingPaint();',ctx2);
console.log('P0-2 zero replies =>', said.slice(0,60));
console.log('P0-2 classes      =>', cls.join(' '));
console.log('P0-2 verdict      :', /החיבור עובד/.test(said) ? 'STILL BROKEN' : 'fixed - a new build is not a round trip');
// And a real echo does turn it green.
ctx2.D.chat=[{id:'x',at:'2026-09-12T10:05:00+03:00',from:'claude',text:'חזרתי. PING-ABC123'}];
said='';cls=[];vm.runInContext('pingPaint();',ctx2);
console.log('P0-2 real echo    =>', said.slice(0,60), '|', cls.join(' '));
