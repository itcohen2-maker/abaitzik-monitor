'use strict';
/*
  17.11.2026, the audit Itzik approved ("מסך הבית: אריחים לקיפול"), and "חוץ מהכניסה של hagitit תסיים הכל".
  On his own monitor only, once per phone: the tiles that are no longer active are folded into the existing hidden lists
  (tilesHidden, iconsHidden), the same lists the edit mode − writes. "מה הסתרנו" → "להחזיר הכל" brings them back.
  Folded: 🏠 הום סטייל (paused since 11.10), 🎬 הדגמה (the old in-monitor demo mode,
  replaced by the public demo at it-solution.co.il/demo). Not 🤝 שותפים: Shai left as a customer on 7.11 but is an
  active referral partner since 12.11 (data/affiliates). A new fold gets a new key, so he is never folded twice.
*/
const KEY = 'fold20261117';
const TILES = ['gHomestyle'];
const ICONS = ['icDemo'];

function head(inst) {
  if (!inst || inst.name !== 'abaitzik') return '';
  const js = '(function(){try{if(localStorage.getItem(' + JSON.stringify(KEY) + '))return;'
    + 'function add(k,a){var h=[];try{h=JSON.parse(localStorage.getItem(k)||"[]")||[];}catch(e){}'
    + 'a.forEach(function(x){if(h.indexOf(x)<0)h.push(x);});localStorage.setItem(k,JSON.stringify(h));}'
    + 'add("tilesHidden",' + JSON.stringify(TILES) + ');add("iconsHidden",' + JSON.stringify(ICONS) + ');'
    + 'localStorage.setItem(' + JSON.stringify(KEY) + ',"1");}catch(e){}})();';
  return '<script>' + js + '</script>\n';
}

module.exports = { head, KEY, TILES, ICONS };
