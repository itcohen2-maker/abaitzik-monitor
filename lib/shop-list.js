'use strict';
/*
  3.11.2026, Itzik: Shai gets the shopping list tile too ("🛒 קניות", gShopList).

  Itzik's own tile opens a shared Google Doc of his family, so its markup and its
  handler sit inside ITZIK blocks and never reach a customer. A customer gets his
  own list, empty at first: add a line, tick what was bought, clear the ticked
  ones, share the list to WhatsApp. Kept on his phone (localStorage "shopList"),
  nothing of anyone else's in it. Included in every customer's page; the tile
  shows only when gShopList is in his screens.
*/
const js = `
(function(){
 var el=document.getElementById('gShopList');if(!el)return;
 function get(){try{var a=JSON.parse(localStorage.getItem('shopList')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
 function put(a){try{localStorage.setItem('shopList',JSON.stringify(a));}catch(e){}}
 function draw(w){
  var a=get(),box=w.querySelector('#shopItems');if(!box)return;
  box.innerHTML=a.length?a.map(function(x,i){return '<label class="shop-it'+(x.done?' on':'')+'"><input type="checkbox" data-shop="'+i+'"'+(x.done?' checked':'')+'><span>'+esc(x.t)+'</span></label>';}).join('')
   :'<div class="bh-empty shop-empty">הרשימה ריקה. כותבים מוצר ולוחצים הוספה.</div>';
 }
 function open(){
  var h='<style>.shop-add{display:flex;gap:8px;margin:10px 0}.shop-add input{flex:1;font:400 16px Heebo,sans-serif;padding:10px;border-radius:10px;border:1px solid #cbd5e1;direction:rtl}'
   +'.shop-add button,.shop-row button{border:0;border-radius:12px;padding:10px 14px;font:700 14px Heebo,sans-serif;background:#0f1b2a;color:#fff;cursor:pointer}'
   +'.shop-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.shop-row button.alt{background:#eef2f7;color:#0f1b2a}.shop-row button.wa{background:#25d366;color:#05361a}'
   +'.shop-it{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--line,#e2e8f0);font:500 16px Heebo,sans-serif}'
   +'.shop-it input{width:22px;height:22px}.shop-it.on span{text-decoration:line-through;opacity:.55}'
   +'.shop-empty{background:var(--surface,#fff);border:1px dashed var(--line,#cbd5e1);border-radius:16px;padding:16px;margin:10px 0;font:500 15px/1.6 Heebo,sans-serif}</style>'
   +'<form class="shop-add" id="shopForm"><input id="shopIn" placeholder="מה לקנות?" autocomplete="off"><button type="submit">הוספה</button></form>'
   +'<div id="shopItems"></div>'
   +'<div class="shop-row"><button type="button" class="alt" id="shopClear">🧹 להוריד את מה שנקנה</button><button type="button" class="wa" id="shopWa">💬 שיתוף בוואטסאפ</button></div>';
  shipOpen('shopSheet','🛒 קניות',h,function(w){
   draw(w);
   w.querySelector('#shopForm').onsubmit=function(e){e.preventDefault();var i=w.querySelector('#shopIn'),v=i.value.trim();if(!v)return i.focus();var a=get();a.push({t:v.slice(0,120),done:false});put(a);i.value='';draw(w);i.focus();};
   w.querySelector('#shopItems').addEventListener('change',function(e){var k=e.target.getAttribute&&e.target.getAttribute('data-shop');if(k==null)return;var a=get();if(a[+k]){a[+k].done=e.target.checked;put(a);draw(w);}});
   w.querySelector('#shopClear').onclick=function(){put(get().filter(function(x){return !x.done;}));draw(w);};
   w.querySelector('#shopWa').onclick=function(){var a=get().filter(function(x){return !x.done;});if(!a.length){toast('הרשימה ריקה.');return;}
    window.open('https://wa.me/?text='+encodeURIComponent('🛒 קניות'+String.fromCharCode(10)+a.map(function(x){return '• '+x.t;}).join(String.fromCharCode(10))),'_blank','noopener');};
  });
 }
 el.addEventListener('click',open);
 if(location.hash==='#shop')setTimeout(open,300);
})();
`;
module.exports = { js };
