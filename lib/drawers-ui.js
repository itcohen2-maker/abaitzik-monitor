'use strict';
/*
  Order inside a tile: numbers on top, drawers below (direction ד of docs/nav-designs.html).

  4.11.2026, Itzik: "בתוך האריחים אני צריך סדר... הלשוניות שעשית, כמו בעסק שלי, הן
  לשוניות גסות ותופסות חלק גדול מהמסך". He picked ד, and then: "אני רוצה לשמור על צבעים
  ואני רוצה לשמור על חיות, כמו שעכשיו המוניטור, ולא להחזיר אותו לתקופת ה AI אבן מיובשת
  בלי צבעים." So every drawer carries its own colour from the monitor's palette, the keys
  on top are coloured buttons with a number, and opening is animated.

  drawerize(box, opts) works on any screen without rewriting it: every <h3> that is a direct
  child of box starts a drawer, and the siblings after it, up to the next h3, go inside.
  Nodes are moved, never cloned, so every id and handler keeps working. The render code
  keeps hiding and showing its h3 as before; a MutationObserver mirrors that onto the drawer
  and the keys, and a count is read from data-n on the h3 or from the rows of its content.

  One drawer open at a time. The last one opened is remembered per screen on this device.
  opts.counts 'data': only data-n on the h3 counts (no guessing from rows).
  opts: { key, icons: { 'title start': '🧾' }, hints: { ... }, short: { 'title start': 'key label' }, keys: 4, open: index }
*/
const css = `
.dwKeys{display:grid;grid-template-columns:repeat(var(--dwk,4),minmax(0,1fr));gap:8px;margin:4px 0 14px}
.dwKey{--h:#4285F4;position:relative;border:0;border-radius:16px;padding:10px 4px 9px;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;color:#fff;
 background:linear-gradient(155deg,color-mix(in srgb,var(--h) 92%,#fff 8%),color-mix(in srgb,var(--h) 78%,#000 22%));
 box-shadow:0 6px 16px -8px color-mix(in srgb,var(--h) 70%,transparent),inset 0 1px 0 rgba(255,255,255,.25);
 transition:transform .25s cubic-bezier(.2,.9,.3,1.4),box-shadow .25s,filter .2s;font-family:Heebo,sans-serif}
.dwKey:active{transform:scale(.95)}
.dwKey i{font-style:normal;font-size:19px;line-height:1.1}
.dwKey b{font-size:19px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.15}
.dwKey small{font-size:11.5px;font-weight:700;opacity:.92;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px}
.dwKey.on{transform:translateY(-2px);box-shadow:0 10px 22px -8px color-mix(in srgb,var(--h) 85%,transparent),inset 0 0 0 2px rgba(255,255,255,.75)}
.dwKey.pop b{animation:dwPop .5s cubic-bezier(.2,.9,.3,1.5)}
@keyframes dwPop{0%{transform:scale(.6);opacity:.3}100%{transform:none;opacity:1}}
.dw{--h:#4285F4;margin:0 0 10px;border-radius:18px;overflow:hidden;background:var(--surface);
 box-shadow:0 2px 10px -4px rgba(0,0,0,.35);border:1px solid color-mix(in srgb,var(--h) 35%,transparent)}
.dw>summary{list-style:none;display:flex;align-items:center;gap:10px;padding:13px 14px;cursor:pointer;
 background:linear-gradient(100deg,color-mix(in srgb,var(--h) 26%,var(--surface)),color-mix(in srgb,var(--h) 8%,var(--surface)));
 font:800 16.5px Heebo,sans-serif;color:var(--ink);transition:background .3s}
.dw>summary::-webkit-details-marker{display:none}
.dw>summary .dwI{width:34px;height:34px;flex:0 0 34px;border-radius:11px;display:grid;place-items:center;font-size:18px;
 background:linear-gradient(155deg,var(--h),color-mix(in srgb,var(--h) 70%,#000));box-shadow:0 4px 10px -4px var(--h)}
.dw>summary .dwT{flex:1;min-width:0;line-height:1.3}
.dw>summary .dwT small{display:block;font:500 12.5px Heebo,sans-serif;color:var(--dim);margin-top:1px}
.dw>summary .dwN{font:800 13px Heebo,sans-serif;color:#fff;background:var(--h);border-radius:999px;padding:2px 9px;font-variant-numeric:tabular-nums}
.dw>summary .dwC{font-size:12px;color:var(--dim);transition:transform .3s cubic-bezier(.2,.9,.3,1)}
.dw[open]>summary{background:linear-gradient(100deg,color-mix(in srgb,var(--h) 40%,var(--surface)),color-mix(in srgb,var(--h) 14%,var(--surface)))}
.dw[open]>summary .dwC{transform:rotate(180deg)}
.dw .dwIn{padding:4px 12px 12px;animation:dwIn .35s cubic-bezier(.2,.9,.3,1)}
@keyframes dwIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.dw .dwIn>h3:first-child{display:none}
.dw.dwNew>summary .dwI,.dwKey.dwNew i{animation:dwBl 1s steps(1) infinite}
@keyframes dwBl{50%{opacity:.25}}
.dwKey.dwNew::after{content:'';position:absolute;top:6px;left:6px;width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--h)}
@media (prefers-reduced-motion:reduce){.dwKey,.dw .dwIn,.dwKey.pop b,.dw>summary .dwC{animation:none!important;transition:none!important}}
`;

const js = `
/* 4.11.2026: numbers on top, coloured drawers below (lib/drawers-ui.js). */
var DW_HUES=['#4285F4','#EA4335','#f0a000','#34A853','#e8710a','#8e5cf7','#06b6d4','#e0418f'];
function dwText(h){return String(h.textContent||'').replace(/\\s+/g,' ').trim();}
function dwIcon(t,icons){
 for(var k in icons){if(t.indexOf(k)===0)return icons[k];}
 var m=/^(\\p{Extended_Pictographic}\\uFE0F?)/u.exec(t);if(m)return m[1];
 // No emoji: the number the title starts with (01, 03א), else its first letter, on the coloured square.
 var d=/^(\\d{1,2}[א-ת]?)\\s/.exec(t);return d?d[1]:(t.charAt(0)||'•');
}
function dwCount(h,inner){
 var n=h.getAttribute('data-n');if(n!=null&&n!=='')return n;
 // Rows are often one level down (a list box inside the drawer): a details per row counts first,
 // else the widest list among the drawer's elements, three levels deep.
 var dn=inner.querySelectorAll('details').length;if(dn>0)return String(dn);
 var best=0;
 (function walk(el,depth){Array.prototype.forEach.call(el.children,function(c){if(c===h||c.hidden)return;var k=c.children.length;if(k>best)best=k;if(depth<3)walk(c,depth+1);});})(inner,0);
 return best>1?String(best):'';
}
function drawerize(box,o){
 if(!box||box.getAttribute('data-dw'))return;
 if(box.__dwObs){try{box.__dwObs.disconnect();}catch(e){}box.__dwObs=null;}
 o=o||{};box.setAttribute('data-dw','1');
 var icons=o.icons||{},hints=o.hints||{},key='dwOpen:'+(o.key||box.id);
 var heads=Array.prototype.filter.call(box.children,function(c){return c.tagName==='H3';});
 if(heads.length<2)return;
 var keys=document.createElement('div');keys.className='dwKeys';
 box.insertBefore(keys,heads[0]);
 var D=[];
 heads.forEach(function(h,i){
  var d=document.createElement('details');d.className='dw';
  var hue=DW_HUES[i%DW_HUES.length];d.style.setProperty('--h',hue);
  var t=dwText(h),ic=dwIcon(t,icons),title=t.replace(/^(\\p{Extended_Pictographic}\\uFE0F?)\\s*/u,'');
  var hint='';for(var hk in hints){if(t.indexOf(hk)===0||title.indexOf(hk)===0)hint=hints[hk];}
  d.innerHTML='<summary><span class="dwI" aria-hidden="true"></span><span class="dwT"></span><span class="dwN" hidden></span><span class="dwC" aria-hidden="true">▼</span></summary><div class="dwIn"></div>';
  d.querySelector('.dwI').textContent=ic;
  d.querySelector('.dwT').textContent=title;
  if(hint){var s=document.createElement('small');s.textContent=hint;d.querySelector('.dwT').appendChild(s);}
  if(h.getAttribute('data-new')==='1')d.classList.add('dwNew');
  box.insertBefore(d,h);
  var inner=d.querySelector('.dwIn');
  var n=h.nextSibling;inner.appendChild(h);
  while(n&&!(n.tagName==='H3')){var nx=n.nextSibling;inner.appendChild(n);n=nx;}
  var sh='';var shorts=o.short||{};for(var sk in shorts){if(t.indexOf(sk)===0||title.indexOf(sk)===0)sh=shorts[sk];}
  D.push({d:d,h:h,inner:inner,ic:ic,title:title,hue:hue,short:sh||title.split(/[,:]/)[0]});
 });
 function sync(){
  var vis=[];
  D.forEach(function(x){
   if(x.d.hidden!==!!x.h.hidden)x.d.hidden=!!x.h.hidden;
   var c=o.counts==='data'?(x.h.getAttribute('data-n')||''):dwCount(x.h,x.inner),b=x.d.querySelector('.dwN');
   b.hidden=!c;if(c&&b.textContent!==c)b.textContent=c;x.c=c;
   if(!x.d.hidden)vis.push(x);
  });
  var want=vis.slice(0,o.keys||4);
  keys.style.setProperty('--dwk',Math.max(1,want.length));
  var sig=want.map(function(x){return x.title+'|'+x.c;}).join(';');
  if(keys.getAttribute('data-sig')===sig)return;
  keys.setAttribute('data-sig',sig);
  keys.innerHTML='';
  want.forEach(function(x){
   var k=document.createElement('button');k.type='button';k.className='dwKey pop';k.style.setProperty('--h',x.hue);
   k.innerHTML='<i></i><b></b><small></small>';
   k.querySelector('i').textContent=x.ic;k.querySelector('b').textContent=x.c||'';if(!x.c)k.querySelector('b').style.display='none';k.querySelector('small').textContent=x.short;
   k.setAttribute('aria-label',x.title+(x.c?' '+x.c:''));
   k.onclick=function(){x.d.open=true;setTimeout(function(){try{x.d.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){x.d.scrollIntoView();}},40);};
   if(x.d.classList.contains('dwNew'))k.classList.add('dwNew');
   x.k=k;keys.appendChild(k);
  });
  marks();
 }
 function marks(){D.forEach(function(x){if(x.k)x.k.classList.toggle('on',x.d.open);});}
 D.forEach(function(x,i){
  x.d.addEventListener('toggle',function(){
   if(x.d.open){x.d.classList.remove('dwNew');if(x.k)x.k.classList.remove('dwNew');D.forEach(function(y){if(y!==x&&y.d.open)y.d.open=false;});try{localStorage.setItem(key,x.title);}catch(e){}}
   marks();
  });
 });
 var last='';try{last=localStorage.getItem(key)||'';}catch(e){}
 var first=D.filter(function(x){return x.title===last&&!x.h.hidden;})[0]||D.filter(function(x){return !x.h.hidden;})[o.open||0];
 if(first)first.d.open=true;
 sync();
 var t=null;
 try{box.__dwObs=new MutationObserver(function(){clearTimeout(t);t=setTimeout(sync,60);});box.__dwObs.observe(box,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-n']});}catch(e){}
}
// For a screen whose render rewrites the whole box: call after every render.
function dwRe(box,o){if(!box)return;box.removeAttribute('data-dw');drawerize(box,o);}
`;

module.exports = { css, js };
