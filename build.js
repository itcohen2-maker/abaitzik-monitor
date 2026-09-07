'use strict';
// Generates docs/index.html: a standalone page with the data baked in, for
// GitHub Pages. No server, no database, opens in any browser.
//
// Privacy note: GitHub Pages on a free account serves from a PUBLIC repo, so
// surnames are shortened to an initial and the page asks not to be indexed.
// Itzik still recognises everyone; a search engine cannot build a profile.

const fs = require('fs');
const path = require('path');
const store = require('./lib/store');

const OUT_DIR = path.join(__dirname, 'docs');
const NET = { facebook: 'פייסבוק', instagram: 'אינסטגרם', tiktok: 'טיקטוק', youtube: 'יוטיוב' };
const CAT = {
  blessing: 'ברכה', encouragement: 'עידוד', personal: 'אישי', pain: 'שיתוף כאב',
  medical_advice: 'המלצה רפואית', offer_help: 'הצעת עזרה', donation: 'שאלת תרומות',
};

function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'ללא שם';
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function build() {
  const state = store.load();
  const items = Object.values(state.items).map(i => ({
    network: i.network,
    author: shortName(i.author),
    text: i.text,
    category: i.category,
    seenAt: i.seenAt,
    repliedAt: i.repliedAt,
    replyText: i.replyText,
  }));

  const replied = items.filter(i => i.repliedAt);
  const pending = items.filter(i => !i.repliedAt);
  const today = new Date().toDateString();
  const repliedToday = replied.filter(i => new Date(i.repliedAt).toDateString() === today);

  const payload = {
    builtAt: new Date().toISOString(),
    counts: { pending: pending.length, replied: replied.length, today: repliedToday.length },
    pending: pending.sort((a, b) => (a.seenAt < b.seenAt ? 1 : -1)),
    replied: replied.sort((a, b) => (a.repliedAt < b.repliedAt ? 1 : -1)),
  };

  const html = PAGE
    .replace('__DATA__', JSON.stringify(payload).replace(/</g, '\\u003c'))
    .replace('__NET__', JSON.stringify(NET))
    .replace('__CAT__', JSON.stringify(CAT));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '', 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
  console.log('built docs/index.html |', items.length, 'items,',
    payload.counts.pending, 'pending,', payload.counts.replied, 'replied');
}

const PAGE = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>מוניטור אבא איציק</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=Heebo:wght@300;400;500;700&display=swap">
<style>
:root{--ground:#faf7f2;--surface:#fff;--sunk:#f2ede4;--ink:#22201c;--dim:#6e675d;
 --line:#e6e0d5;--accent:#14675a;--accent-soft:#dfece8;--wait:#a8681a;
 --shadow:0 1px 2px rgba(40,32,20,.06)}
@media (prefers-color-scheme:dark){:root{--ground:#191714;--surface:#221f1b;--sunk:#1f1c18;
 --ink:#f0ece5;--dim:#9b9387;--line:#35312b;--accent:#4fb3a0;--accent-soft:#1d3630;
 --wait:#d99b45;--shadow:none}}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);direction:rtl;
 font:400 16px/1.65 Heebo,system-ui,"Segoe UI",Arial,sans-serif}
.wrap{max-width:620px;margin:0 auto;padding:22px 18px 64px}
h1{font:700 27px/1.2 "Frank Ruhl Libre",Georgia,serif;margin:0 0 6px;text-wrap:balance}
.sub{color:var(--dim);font-size:14px;font-weight:300}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0 26px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:11px;
 padding:13px 14px;box-shadow:var(--shadow)}
.tile .k{font-size:12px;color:var(--dim)}
.tile .v{font:500 28px/1.15 "Frank Ruhl Libre",Georgia,serif;
 font-variant-numeric:tabular-nums;margin-top:3px}
.tile.wait .v{color:var(--wait)}
h2{font:500 15px/1.3 Heebo,sans-serif;margin:0 0 11px;color:var(--dim);letter-spacing:.04em}
section{margin-bottom:30px}
.seg{display:flex;gap:4px;background:var(--sunk);border-radius:10px;padding:4px;margin-bottom:14px}
.seg button{flex:1;background:transparent;color:var(--dim);border:0;border-radius:7px;
 padding:8px 4px;font:500 14px Heebo,sans-serif;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.seg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.item{background:var(--surface);border:1px solid var(--line);border-radius:11px;
 padding:12px 14px;margin-bottom:9px;box-shadow:var(--shadow);
 border-inline-start:3px solid var(--line)}
.item.answered{border-inline-start-color:var(--accent)}
.item.pain{border-inline-start-color:var(--wait)}
.item .top{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;
 font-size:13px;color:var(--dim);margin-bottom:5px}
.item .who{color:var(--ink);font-weight:500;font-size:14px}
.chip{background:var(--sunk);border-radius:999px;padding:1px 9px;font-size:11px;color:var(--dim)}
.item .body{font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}
.item .said{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);
 font-size:14px;color:var(--accent)}
.empty{color:var(--dim);font-size:15px;font-weight:300;padding:16px 2px}
.note{font-size:13px;color:var(--dim);font-weight:300;border-top:1px solid var(--line);
 padding-top:14px;margin-top:30px}
.note b{color:var(--ink);font-weight:500}
</style>
</head>
<body>
<div class="wrap">
<h1>מוניטור אבא איציק</h1>
<div class="sub">מי פנה, מה נענה, ומה עוד מחכה.</div>

<div class="tiles">
 <div class="tile wait"><div class="k">ממתין לתשובה</div><div class="v" id="tP">0</div></div>
 <div class="tile"><div class="k">נענה היום</div><div class="v" id="tT">0</div></div>
 <div class="tile"><div class="k">נענה סך הכל</div><div class="v" id="tA">0</div></div>
</div>

<section>
 <div class="seg" role="group" aria-label="סינון">
  <button type="button" id="bP" aria-pressed="true">ממתין</button>
  <button type="button" id="bD" aria-pressed="false">נענה</button>
 </div>
 <div id="list"></div>
</section>

<div class="note">
 <b>הכלל האדום.</b> לא פונים למי שלא פנה. כל שורה כאן היא מישהו שהגיב,
 ענה לסטורי או שלח הודעה. שעות שקט בין 23:00 ל־07:00.
 <br><br>
 שמות משפחה מקוצרים לאות אחת, כי הדף הזה פתוח לכל מי שיש לו הקישור.
 <span id="built"></span>
</div>
</div>

<script>
var D = __DATA__, NET = __NET__, CAT = __CAT__, tab = 'pending';
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
 return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function ago(iso){if(!iso)return'';var d=Date.parse(iso);if(isNaN(d))return'';
 var s=(Date.now()-d)/1000;if(s<90)return'עכשיו';if(s<3600)return Math.round(s/60)+' דקות';
 if(s<86400)return Math.round(s/3600)+' שעות';return Math.round(s/86400)+' ימים';}
function row(i){
 var cls='item'+(i.repliedAt?' answered':(i.category==='pain'?' pain':''));
 return '<div class="'+cls+'"><div class="top"><span class="who">'+esc(i.author)+'</span>'
  +'<span class="chip">'+esc(NET[i.network]||i.network)+'</span>'
  +(i.category?'<span class="chip">'+esc(CAT[i.category]||i.category)+'</span>':'')
  +'<span>'+ago(i.repliedAt||i.seenAt)+'</span></div>'
  +'<div class="body">'+esc(i.text)+'</div>'
  +(i.replyText?'<div class="said">'+esc(i.replyText)+'</div>':'')+'</div>';
}
function render(){
 document.getElementById('tP').textContent=D.counts.pending;
 document.getElementById('tT').textContent=D.counts.today;
 document.getElementById('tA').textContent=D.counts.replied;
 document.getElementById('bP').setAttribute('aria-pressed',tab==='pending');
 document.getElementById('bD').setAttribute('aria-pressed',tab==='done');
 var rows=tab==='pending'?D.pending:D.replied;
 document.getElementById('list').innerHTML=rows.length?rows.map(row).join('')
  :'<div class="empty">'+(tab==='pending'?'התור ריק. כל מי שפנה קיבל תשובה.':'עוד לא נשלחו תשובות.')+'</div>';
 document.getElementById('built').textContent='עודכן לפני '+ago(D.builtAt)+'.';
}
document.getElementById('bP').onclick=function(){tab='pending';render();};
document.getElementById('bD').onclick=function(){tab='done';render();};
render();
</script>
</body>
</html>`;

build();
