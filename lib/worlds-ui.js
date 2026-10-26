'use strict';
/*
  26.10.2026: the world layout, step 3 of plans/2026-10-26-three-worlds.md.

  Plain strings, build.js drops them into the page as they are:
  css   structure only (no world look): the hidden boxes, the empty groups, and the three
        world css slots (lib/world-paper.js, lib/world-pad.js, lib/world-radio.js);
  js    while data-skin is 7, 8 or 9 it moves the existing home tiles and icons (never clones
        them, so every handler stays) into one block "התעדכן" and five groups; the money group
        is folded. On skin 1 every node goes back to its original parent and index.
  GROUPS  the groups, in order: [key, label]. The money group is a <details>.
*/
const paper = require('./world-paper.js');
const pad = require('./world-pad.js');
const radio = require('./world-radio.js');

const GROUPS = [
  ['upd', 'התעדכן'],
  ['net', 'רשתות ותוכן'],
  ['work', 'לקוחות ועבודה'],
  ['day', 'יומן ובריאות'],
  ['proj', 'אתרים ופרויקטים'],
  ['home', 'בית ומסמכים'],
  ['more', 'עוד'],
  ['money', '💰 הכסף שלי'],
];

const structCss = `
/* 26.10.2026: structure of the worlds only. Skin 1 has no rule here except that the block stays out of sight. */
.wh-empty{display:none!important}
body.world #tidyBox,body.world #tileTools,body.world #swapBlocks{display:none!important}
.wg-none{display:none}
#worldHome{display:block}
:root:not([data-skin="7"]):not([data-skin="8"]):not([data-skin="9"]) #worldHome{display:none}
`;

const css = structCss + paper.css + pad.css + radio.css;

const js = `
/* 26.10.2026: the world layout (plans/2026-10-26-three-worlds.md, step 3). Nodes are moved,
   never cloned. wldRecs keeps the original box and index of every tile and icon, so skin 1
   puts them back exactly as they were. */
var WG_GROUPS=${JSON.stringify(GROUPS)};
var wldRecs=[],wldIsOn=false,wldObs=null,wldBoxObs=null;
function wldKnown(g){
 for(var i=1;i<WG_GROUPS.length;i++)if(WG_GROUPS[i][0]===g)return true;
 return false;
}
// A tile with an unopened hand or update blink goes to the top block; the rest to their group.
function wldGroupOf(el){
 if(el.classList.contains('taskblink')||el.classList.contains('updblink'))return 'upd';
 var g=el.getAttribute('data-grp')||'';
 return wldKnown(g)?g:'more';
}
function wldRec(el){
 for(var i=0;i<wldRecs.length;i++)if(wldRecs[i].el===el)return wldRecs[i];
 return null;
}
function wldOrd(el){var r=wldRec(el);return r?r.ord:1e9;}
function wldList(key){
 var s=document.querySelector('#worldHome .wg[data-g="'+key+'"]');
 return s?s.querySelector('.wg-l'):null;
}
// Put el into the group list at its original relative place (icons first, then tiles).
function wldPlace(el,key){
 var list=wldList(key);
 if(!list)return;
 var o=wldOrd(el),ref=null;
 Array.prototype.some.call(list.children,function(c){
  if(c!==el&&wldOrd(c)>o){ref=c;return true;}
  return false;
 });
 list.insertBefore(el,ref);
}
// A group with no visible child is hidden.
function wldEmpty(){
 Array.prototype.forEach.call(document.querySelectorAll('#worldHome .wg'),function(s){
  var list=s.querySelector('.wg-l');
  var any=Array.prototype.some.call(list.children,function(c){return !c.hidden;});
  var want=!any;
  if(s.classList.contains('wg-none')!==want)s.classList.toggle('wg-none',want);
 });
}
// Re-place a tile when its blink changes (taskblink/updblink, or hidden).
function wldCheck(recs){
 var seen=false;
 recs.forEach(function(m){
  var el=m.target;
  if(!wldRec(el)||!el.parentNode||!el.parentNode.parentNode)return;
  seen=true;
  var want=wldGroupOf(el),have=el.parentNode.parentNode.getAttribute('data-g');
  if(want!==have)wldPlace(el,want);
 });
 if(seen)wldEmpty();
}
// Every box of the home screen that holds tiles: the round icons and each tile grid
// (his page has more than one: the main grid, the business and project grids, the last row).
function wldBoxes(){
 var h=document.getElementById('pH');if(!h)return [];
 return Array.prototype.filter.call(h.children,function(el){return el.id==='blkIcons'||el.classList.contains('grid');});
}
function worldOn(){
 if(wldIsOn)return;
 var boxes=wldBoxes();
 if(!boxes.length)return;
 // Remember where every node stands before anything moves.
 wldRecs=[];
 var ord=0;
 boxes.forEach(function(box){
  Array.prototype.forEach.call(box.children,function(el,i){
   if(!el.classList.contains('ic')&&!el.classList.contains('gt'))return;
   wldRecs.push({el:el,box:box,idx:i,ord:ord++});
  });
 });
 var wh=document.getElementById('worldHome');
 if(!wh){
  wh=document.createElement('div');
  wh.id='worldHome';wh.className='wh';
  WG_GROUPS.forEach(function(g){
   var money=g[0]==='money';
   var s=document.createElement(money?'details':'section');
   s.className='wg';s.setAttribute('data-g',g[0]);
   var h=document.createElement(money?'summary':'h3');
   h.className='wg-h';h.textContent=g[1];
   s.appendChild(h);
   var l=document.createElement('div');l.className='wg-l';
   s.appendChild(l);
   wh.appendChild(s);
  });
  // The long press on the home screen must not start from inside a world.
  wh.addEventListener('pointerdown',function(e){e.stopPropagation();});
  boxes[0].parentNode.insertBefore(wh,boxes[0]);
 }
 wldRecs.forEach(function(r){wldPlace(r.el,wldGroupOf(r.el));});
 boxes.forEach(function(b){b.classList.add('wh-empty');});
 // The money group is folded every time the world opens.
 var md=wh.querySelector('details.wg');
 if(md)md.open=false;
 document.body.classList.add('world');
 wldIsOn=true;
 wldEmpty();
 wldObs=new MutationObserver(wldCheck);
 wldObs.observe(wh,{attributes:true,attributeFilter:['class','hidden'],subtree:true});
 // A tile added to the hidden boxes while a world is on is moved into its group too.
 wldBoxObs=new MutationObserver(function(recs){
  var added=false;
  recs.forEach(function(m){
   Array.prototype.forEach.call(m.addedNodes,function(el){
    if(!el.classList||wldRec(el))return;
    if(!el.classList.contains('ic')&&!el.classList.contains('gt'))return;
    wldRecs.push({el:el,box:m.target,idx:Array.prototype.indexOf.call(m.target.children,el),ord:100000+wldRecs.length});
    wldPlace(el,wldGroupOf(el));
    added=true;
   });
  });
  if(added)wldEmpty();
 });
 boxes.forEach(function(b){wldBoxObs.observe(b,{childList:true});});
}
function worldOff(){
 if(!wldIsOn)return;
 if(wldObs)wldObs.disconnect();
 if(wldBoxObs)wldBoxObs.disconnect();
 wldObs=null;wldBoxObs=null;
 var boxes=wldBoxes(),icons=document.getElementById('blkIcons'),tiles=document.getElementById('blkTiles');
 // Back in the original order: each node goes in at its recorded index, lowest first.
 boxes.forEach(function(box){
  wldRecs.filter(function(r){return r.box===box;}).sort(function(a,b){return a.idx-b.idx;}).forEach(function(r){
   box.insertBefore(r.el,box.children[r.idx]||null);
  });
  box.classList.remove('wh-empty');
 });
 var wh=document.getElementById('worldHome');
 if(wh&&wh.parentNode)wh.parentNode.removeChild(wh);
 document.body.classList.remove('world');
 wldRecs=[];wldIsOn=false;
 if(typeof applyOrder==='function'){
  if(tiles)applyOrder(tiles,'tileOrder');
  if(icons)applyOrder(icons,'iconOrder');
 }
}
// The one entry point: follows data-skin. Safe to call any number of times.
function worldSync(){
 var s=document.documentElement.getAttribute('data-skin')||'1';
 if(s==='7'||s==='8'||s==='9')worldOn();else worldOff();
}
// Guards while a world is on: the saved box order and the tile lift are not used.
var wldSaveOrder=saveOrder;
saveOrder=function(box,key){if(document.body.classList.contains('world'))return;return wldSaveOrder(box,key);};
var wldFloatTile=floatTile;
floatTile=function(id,up){if(document.body.classList.contains('world'))return;return wldFloatTile(id,up);};
`;

module.exports = { GROUPS, css, js };
