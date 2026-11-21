'use strict';
/*
  17.11.2026, the audit Itzik approved ("מסך הבית: אריחים לקיפול"), and "חוץ מהכניסה של hagitit תסיים הכל".
  On his own monitor only, once per phone per fold: tiles folded into the existing hidden lists (tilesHidden,
  iconsHidden), the same lists the edit mode − writes. "מה הסתרנו" → "להחזיר הכל" brings them back.
  A new fold gets a new key, so a phone is never folded twice and what he brought back stays back.
    fold20261117:  🏠 הום סטייל (paused since 11.10), 🎬 הדגמה (the old in-monitor demo, replaced by it-solution.co.il/demo).
                   Not 🤝 שותפים: Shai left as a customer on 7.11 but is an active referral partner since 12.11.
    fold20261117b: Itzik chose them, 17.11: ⚖️ עו״ד ויואל, 🩺 אחרי הניתוח.
*/
const FOLDS = [
  { key: 'fold20261117', tiles: ['gHomestyle'], icons: ['icDemo'] },
  { key: 'fold20261117b', tiles: ['gSale', 'gMed'], icons: [] },
];

function head(inst) {
  if (!inst || inst.name !== 'abaitzik') return '';
  const js = '(function(){try{'
    + 'function add(k,a){var h=[];try{h=JSON.parse(localStorage.getItem(k)||"[]")||[];}catch(e){}'
    + 'a.forEach(function(x){if(h.indexOf(x)<0)h.push(x);});localStorage.setItem(k,JSON.stringify(h));}'
    + JSON.stringify(FOLDS) + '.forEach(function(f){if(localStorage.getItem(f.key))return;'
    + 'add("tilesHidden",f.tiles);add("iconsHidden",f.icons);localStorage.setItem(f.key,"1");});'
    + '}catch(e){}})();';
  return '<script>' + js + '</script>\n';
}

module.exports = { head, FOLDS };
