'use strict';
/*
  12.11.2026, Itzik: "תייצר לו לינק affiliate שהוא יכול לשלוח ללקוח למלא פרטים שאני אחזור אליו.
  ואז נדע שזה ממנו ונכניס את זה לטבלה שלו. ולהתחשבנות בינינו."

  A referrer (שותף) has an unguessable token. Served on form.it-solution.co.il through Caddy:
    GET  /r/<token>      a short form for the referrer's customer: name, phone, business, what they need
    GET  /r/<token>/t    the referrer's table: his leads, their status in Itzik's leads table, and what he earned
    POST /api/ref-lead   { t, name, phone, biz, note } -> a lead in Itzik's table (source 'aff', ref) + an urgent alert

  data/affiliates/<token>.json   { ref:'shai', name:'שי', grant:200, pct:10, months:12, bonusFrom:5, bonusPct:12, leads:[{at,id,name}] }
  The status and the monthly amount of each lead live in Itzik's leads table (data/biz/biz), so the table always shows
  what he set there: status נסגר + amount (the monthly price) makes the money show up here.
  Signups through ?ref=<ref> on /start are counted in data/signup/refs/<ref>.json and shown here too.
*/
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, 'data');
const DIR = path.join(DATA, 'affiliates');

function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, j) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(j, null, 1)); fs.renameSync(f + '.tmp', f); }
function aff(tok) { tok = safeTok(tok); return tok ? readJson(path.join(DIR, tok + '.json'), null) : null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
function phoneNorm(p) { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? '0' + d.slice(3) : d; }
function nis(n) { return Math.round(n).toLocaleString('he-IL') + ' ₪'; }

const HEAD = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
  + '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800&display=swap" rel="stylesheet">'
  + '<style>:root{--ink:#14202e;--mut:#5b6b7d;--line:#e3e8ee;--acc:#d97706;--blue:#1d4ed8}*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:var(--ink);font-family:Heebo,system-ui,sans-serif;line-height:1.55;font-size:16px}'
  + '.wrap{max-width:560px;margin:0 auto;padding:24px 16px 48px}.brand{color:var(--blue);font-weight:800;font-size:14px}h1{font-size:26px;margin:6px 0 6px;font-weight:800}.lead{color:var(--mut);margin:0 0 16px}'
  + '.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;margin:10px 0}label{display:block;font-weight:600;margin:12px 0 4px}input,textarea{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}'
  + 'textarea{min-height:90px;resize:vertical}button{width:100%;margin-top:16px;padding:14px;border:0;border-radius:12px;background:var(--acc);color:#fff;font:inherit;font-weight:800;font-size:18px;cursor:pointer}button:disabled{opacity:.6}'
  + '.msg{margin-top:10px;font-weight:600}.bad{color:#b91c1c}.small{color:var(--mut);font-size:13px;margin-top:12px}.ok{text-align:center;padding:30px 10px}.ok b{font-size:22px;display:block;margin-bottom:6px}'
  + 'table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:right;padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mut);font-weight:600;font-size:13px}'
  + '.sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sum div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;text-align:center}.sum b{display:block;font-size:22px;color:var(--acc)}.sum small{color:var(--mut);font-size:13px}'
  + '.st{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2f7;font-size:13px}.st.won{background:#dcfce7;color:#166534}.st.lost{background:#fee2e2;color:#991b1b}</style>';

function formPage(tok, a) {
  // 12.11, Itzik: the link goes out with a picture of the monitor (WhatsApp preview) and the page shows it too.
  const og = 'https://it-solution.co.il/start/monitor-og2.jpg', url = 'https://form.it-solution.co.il/r/' + tok;
  return HEAD + '<title>המוניטור לעסק | IT Solution</title>'
    + '<meta property="og:type" content="website"><meta property="og:url" content="' + url + '"><meta property="og:title" content="המוניטור לעסק | IT Solution">'
    + '<meta property="og:description" content="' + esc(a.name) + ' ממליץ. השאר שם וטלפון ונחזור אליך לשיחה קצרה."><meta property="og:image" content="' + og + '">'
    + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">'
    + '</head><body><div class="wrap"><div class="brand">IT Solution · המוניטור לעסק</div>'
    + '<img src="https://it-solution.co.il/start/monitor-og2.jpg" alt="המוניטור לעסק: פתרון מיידי, סדר מופתי" width="1200" height="630" style="display:block;width:100%;height:auto;margin:14px auto 6px;border-radius:16px">'
    + '<h1>נשמח לחזור אליך</h1><p class="lead">' + esc(a.name) + ' המליץ עלינו. השאר שם וטלפון, ונחזור אליך לשיחה קצרה על המוניטור לעסק שלך.</p>'
    + '<div class="card" id="box"><form id="f" novalidate>'
    + '<label for="n">שם מלא</label><input id="n" autocomplete="name" required maxlength="60">'
    + '<label for="p">טלפון</label><input id="p" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20">'
    + '<label for="b">שם העסק (לא חובה)</label><input id="b" autocomplete="organization" maxlength="80">'
    + '<label for="x">במה נוכל לעזור? (לא חובה)</label><textarea id="x" maxlength="600"></textarea>'
    + '<button id="go" type="submit">שליחה</button><div class="msg" id="m" role="status"></div>'
    + '<p class="small">הפרטים משמשים רק כדי לחזור אליך בנוגע לפנייה הזו.</p></form></div></div>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ',f=document.getElementById("f"),m=document.getElementById("m"),g=document.getElementById("go");'
    + 'function v(i){return document.getElementById(i).value.trim();}'
    + 'f.addEventListener("submit",function(e){e.preventDefault();m.className="msg";'
    + 'if(v("n").length<2){m.className="msg bad";m.textContent="כתוב את השם שלך.";return;}'
    + 'if(v("p").replace(/[^0-9]/g,"").length<9){m.className="msg bad";m.textContent="מספר הטלפון לא נראה תקין.";return;}'
    + 'g.disabled=true;m.textContent="שולח...";'
    + 'fetch("/api/ref-lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:T,name:v("n"),phone:v("p"),biz:v("b"),note:v("x")})})'
    + '.then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(r.ok&&j.ok){document.getElementById("box").innerHTML="<div class=ok><b>תודה, קיבלנו!</b>נחזור אליך בהקדם.</div>";return;}'
    + 'g.disabled=false;m.className="msg bad";m.textContent=j.error==="limit"?"נשלחו כבר כמה פניות. אפשר לנסות שוב מאוחר יותר.":"משהו לא עבר. נסה שוב בעוד רגע.";});})'
    + '.catch(function(){g.disabled=false;m.className="msg bad";m.textContent="משהו לא עבר. נסה שוב בעוד רגע.";});});})();</script></body></html>';
}

// What the referrer earned, from Itzik's leads table: a closed lead with its monthly amount.
function rows(a) {
  const leads = require('./lib/leads.js').readAll(DATA);
  const byId = {}; leads.forEach((l) => { byId[l.id] = l; });
  let closedN = 0;
  return (a.leads || []).map((x) => {
    const l = byId[x.id] || null;
    const status = l ? l.status : 'נמחק';
    const won = status === 'נסגר';
    let pct = a.pct;
    if (won) { closedN++; if (a.bonusFrom && closedN >= a.bonusFrom) pct = a.bonusPct || pct; }
    const monthly = won && l && Number(l.amount) > 0 ? Number(l.amount) * pct / 100 : 0;
    return { at: x.at, name: (l && l.name) || x.name, biz: x.biz || '', status, won, grant: won ? a.grant : 0, monthly, pct };
  });
}

/*
  12.11.2026, Itzik: "תן שם בדיוק את ההסבר, תעשה מוקאפ של הסברים: לקוח חותם ב 15 בחודש, מחושב מה 15 עד ה 15,
  ומה שיהיה באותו חודש לפי זה מחשבים את שי, אלא אם הוא ביטל בחודש השני, אז גם העמלה של שי תתקזז".
  A worked example on the referrer's table, with his own numbers (grant, pct, months, bonus) from his file.
*/
function howItWorks(a) {
  const price = 990, pct = a.pct || 10, fee = Math.round(price * pct / 100), months = a.months || 12, grant = a.grant || 0;
  const row = (m, when, paid, you, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td><b>' + m + '</b><br><small style="color:var(--mut)">' + when + '</small></td><td>' + paid + '</td><td><b>' + you + '</b></td></tr>';
  return '<h2 style="font-size:20px;margin:26px 0 6px">איך מחושב מה שמגיע לך</h2>'
    + '<div class="card"><b>1. החודש מתחיל ביום שהלקוח חתם.</b><br>לקוח שחתם ב 15 בחודש: החודש שלו הוא מה 15 עד ה 15 בחודש הבא. לא לפי חודש בלוח השנה.</div>'
    + '<div class="card"><b>2. מחשבים לפי מה שהלקוח שילם באותו חודש.</b><br>על כל חודש ששולם מגיע לך ' + pct + '% ממנו, למשך ' + months + ' חודשים. על החודש הראשון מגיע לך גם מענק סגירה של ' + nis(grant) + ', אחרי שהלקוח שילם אותו.'
    + (a.bonusFrom ? '<br>מהלקוח ה ' + a.bonusFrom + ' שלך והלאה: ' + a.bonusPct + '% במקום ' + pct + '%.' : '') + '</div>'
    + '<div class="card" style="border-color:#fecaca;background:#fff7f7"><b>3. ביטול בחודש השני: העמלה מתקזזת.</b><br>אם הלקוח מבטל בחודש השני, מה שקיבלת עליו מתקזז מהתשלום הבא שלך.</div>'
    + '<h3 style="font-size:17px;margin:20px 0 4px">דוגמה: לקוח שחתם ב 15.1, מנוי של ' + nis(price) + ' בחודש</h3>'
    + '<div class="card"><table><thead><tr><th>חודש</th><th>הלקוח שילם</th><th>מגיע לך</th></tr></thead><tbody>'
    + row('חודש 1', '15.1 עד 15.2', nis(price), nis(grant + fee) + '<br><small style="color:var(--mut)">מענק ' + nis(grant) + ' ועוד ' + nis(fee) + '</small>')
    + row('חודש 2', '15.2 עד 15.3', nis(price), nis(fee))
    + row('חודש 3', '15.3 עד 15.4', nis(price), nis(fee))
    + '<tr><td colspan="3" style="text-align:center;color:var(--mut)">וכך כל חודש, עד חודש ' + months + '</td></tr>'
    + '</tbody></table><p style="margin:10px 0 0">סך הכל על לקוח אחד בשנה: <b style="color:var(--acc)">' + nis(grant + fee * months) + '</b></p></div>'
    + '<h3 style="font-size:17px;margin:20px 0 4px">דוגמה: אותו לקוח ביטל בחודש השני</h3>'
    + '<div class="card"><table><thead><tr><th>חודש</th><th>מה קרה</th><th>מגיע לך</th></tr></thead><tbody>'
    + row('חודש 1', '15.1 עד 15.2', 'שילם ' + nis(price), nis(grant + fee))
    + row('חודש 2', '15.2 עד 15.3', 'ביטל', '<span style="color:#b91c1c">מתקזז ' + nis(grant + fee) + '</span>')
    + '</tbody></table><p style="margin:10px 0 0">סך הכל על הלקוח הזה: <b>0 ₪</b>. הסכום יורד מהתשלום הבא שלך.</p></div>';
}

/*
  12.11.2026, Itzik: "תוסיף שם את החתימה ממני, ותן לו גם לחתום על זה ... ואחרי שהוא יחתום, תעדכן לו את הטופס רגיל, בלי חתימה."
  Until the referrer signs, his table ends with Itzik's signature (the one saved for the agreements, data/agrsign/owner.json)
  and a pad for his own. POST /api/ref-lead { t, sign:1, name, agree, sig }. After that the page is the plain table again.
  The signed copy: data/files-private/aff-<ref>-signed-<date>.html, and the signature in data/affiliates/<tok>.sig.png.
*/
function ownerSig() { const o = readJson(path.join(DATA, 'agrsign', 'owner.json'), null); return o && o.sig ? o : null; }
function signBlock(tok, a) {
  const o = ownerSig();
  return '<h2 style="font-size:20px;margin:26px 0 6px">אישור התנאים</h2>'
    + '<div class="card"><p style="margin:0 0 10px">התנאים שבדף הזה מוסכמים על שנינו.</p>'
    + '<div style="border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:14px"><small style="color:var(--mut)">IT Solution</small>'
    + (o ? '<img src="' + o.sig + '" alt="החתימה של יצחק כהן" style="display:block;max-width:220px;height:auto;margin:4px 0">' : '')
    + '<b>' + esc(o ? o.name : 'יצחק כהן') + '</b>, IT Solution</div>'
    + '<small style="color:var(--mut)">' + esc(a.name) + '</small>'
    + '<label for="sn">שם מלא</label><input id="sn" value="' + esc(a.name) + '" autocomplete="name">'
    + '<label style="display:flex;gap:8px;align-items:flex-start;font-weight:400"><input type="checkbox" id="sa" style="width:auto;margin-top:5px"> קראתי את ההסבר ואני מאשר את התנאים</label>'
    + '<label>החתימה שלך (עם האצבע)</label>'
    + '<canvas id="cv" style="width:100%;height:160px;border:1px dashed #9aa8b8;border-radius:12px;background:#fff;touch-action:none;display:block"></canvas>'
    + '<button type="button" id="cl" style="background:#eef2f7;color:var(--ink);font-size:15px;padding:10px;margin-top:8px">לנקות ולחתום שוב</button>'
    + '<button type="button" id="go">✍️ לחתום ולאשר</button><div class="msg bad" id="er"></div></div>'
    + '<script>(function(){var T="' + tok + '",cv=document.getElementById("cv"),x=cv.getContext("2d"),dn=false,ink=false;'
    + 'function fit(){var r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;x.scale(d,d);x.lineWidth=2.4;x.lineCap="round";x.strokeStyle="#14202e";ink=false}fit();'
    + 'function pt(e){var r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}'
    + 'cv.addEventListener("pointerdown",function(e){dn=true;var p=pt(e);x.beginPath();x.moveTo(p.x,p.y);cv.setPointerCapture(e.pointerId)});'
    + 'cv.addEventListener("pointermove",function(e){if(!dn)return;var p=pt(e);x.lineTo(p.x,p.y);x.stroke();ink=true});'
    + 'cv.addEventListener("pointerup",function(){dn=false});'
    + 'document.getElementById("cl").onclick=function(){x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);fit()};'
    + 'var g=document.getElementById("go"),er=document.getElementById("er");'
    + 'g.onclick=function(){var n=document.getElementById("sn").value.trim();er.textContent="";'
    + 'if(n.length<2){er.textContent="צריך שם מלא.";return}if(!document.getElementById("sa").checked){er.textContent="צריך לסמן שקראת ואתה מאשר.";return}if(!ink){er.textContent="צריך לחתום בתיבה.";return}'
    + 'g.disabled=true;g.textContent="שומר...";fetch("/api/ref-lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:T,sign:1,name:n,agree:true,sig:cv.toDataURL("image/png")})})'
    + '.then(function(r){return r.json()}).then(function(j){if(!j.ok)throw 0;location.reload()}).catch(function(){g.disabled=false;g.textContent="✍️ לחתום ולאשר";er.textContent="השמירה לא עברה, נסה שוב."})}})()</script>';
}
function handleSign(b, ip, ua, notify) {
  const tok = safeTok(b && b.t), a = tok && aff(tok);
  if (!a) return { ok: false, error: 'link' };
  if (a.signed) return { ok: true, already: true };
  const name = clean(b.name, 60), sig = String(b.sig || '');
  if (name.length < 2) return { ok: false, error: 'name' };
  if (b.agree !== true) return { ok: false, error: 'agree' };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 400000) return { ok: false, error: 'sig' };
  if (limited(ip)) return { ok: false, error: 'limit' };
  const at = new Date().toISOString();
  fs.writeFileSync(path.join(DIR, tok + '.sig.png'), Buffer.from(sig.split(',')[1], 'base64'));
  const day = at.slice(0, 10), o = ownerSig();
  const copy = HEAD + '<title>תנאי שותפות, ' + esc(a.name) + ', חתום</title></head><body><div class="wrap"><div class="brand">IT Solution · שותפים</div>'
    + '<h1>תנאי שותפות: ' + esc(a.name) + '</h1>' + howItWorks(a)
    + '<div class="card"><b>IT Solution</b>' + (o ? '<img src="' + o.sig + '" style="display:block;max-width:220px">' + esc(o.name) : '') + '</div>'
    + '<div class="card"><b>' + esc(name) + '</b><img src="' + sig + '" style="display:block;max-width:260px;background:#fff">'
    + '<small>נחתם ' + new Date(at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) + ' · כתובת ' + esc(ip) + '</small></div></div></body></html>';
  const priv = path.join(DATA, 'files-private');
  fs.mkdirSync(priv, { recursive: true });
  const file = 'aff-' + a.ref + '-signed-' + day + '.html';
  fs.writeFileSync(path.join(priv, file), copy);
  a.signed = { name, at, ip, ua: clean(ua, 200), file };
  writeJson(path.join(DIR, tok + '.json'), a);
  try { notify('aff-sign', '✍️ ' + a.name + ' חתם על תנאי השותפות. העותק החתום: files/' + file); } catch (e) {}
  return { ok: true };
}

function tablePage(tok, a) {
  const r = rows(a);
  const sr = readJson(path.join(DATA, 'signup', 'refs', a.ref + '.json'), { visits: 0, signups: 0, people: [] });
  const won = r.filter((x) => x.won);
  const grants = won.reduce((s, x) => s + x.grant, 0), monthly = won.reduce((s, x) => s + x.monthly, 0);
  const d = (s) => new Date(s).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit' });
  let t = HEAD + '<title>הטבלה של ' + esc(a.name) + ' | IT Solution</title></head><body><div class="wrap"><div class="brand">IT Solution · שותפים</div>'
    + '<h1>' + esc(a.name) + ', הלקוחות שהבאת</h1><p class="lead">מתעדכן לבד. כל לקוח שהשאיר פרטים בקישור שלך, ומה המצב שלו.</p>'
    + '<div class="sum"><div><b>' + r.length + '</b><small>השאירו פרטים</small></div><div><b>' + won.length + '</b><small>סגרו</small></div><div><b>' + nis(grants) + '</b><small>מענקי סגירה</small></div></div>'
    + (monthly ? '<div class="card" style="text-align:center">ועוד <b style="color:var(--acc)">' + nis(monthly) + '</b> כל חודש, מהמנויים של מי שסגר (עד ' + a.months + ' חודשים לכל לקוח).</div>' : '')
    + '<div class="card"><table><thead><tr><th>תאריך</th><th>לקוח</th><th>מצב</th><th>מגיע לך</th></tr></thead><tbody>';
  if (!r.length) t += '<tr><td colspan="4" style="color:var(--mut);text-align:center;padding:18px">עוד אין לקוחות. ברגע שמישהו ימלא את הטופס שלך, הוא יופיע כאן.</td></tr>';
  r.slice().reverse().forEach((x) => {
    const cls = x.won ? 'won' : (x.status === 'אבד' || x.status === 'נמחק' ? 'lost' : '');
    t += '<tr><td>' + d(x.at) + '</td><td>' + esc(x.name) + (x.biz ? '<br><small style="color:var(--mut)">' + esc(x.biz) + '</small>' : '') + '</td><td><span class="st ' + cls + '">' + esc(x.status) + '</span></td><td>'
      + (x.won ? nis(x.grant) + (x.monthly ? '<br><small>+ ' + nis(x.monthly) + ' לחודש (' + x.pct + '%)</small>' : '') : '·') + '</td></tr>';
  });
  t += '</tbody></table></div>';
  if (sr.visits || sr.signups) t += '<div class="card">בקישור ההרשמה שלך: ' + sr.visits + ' כניסות, ' + sr.signups + ' נרשמו לשבוע ניסיון.</div>';
  t += howItWorks(a);
  if (!a.signed) t += signBlock(tok, a);
  return t + '<p class="small">מענק סגירה ' + nis(a.grant) + ' אחרי שהלקוח שילם את החודש הראשון, ו ' + a.pct + '% מהמנוי החודשי למשך ' + a.months + ' חודשים'
    + (a.bonusFrom ? ' (מהלקוח ה ' + a.bonusFrom + ' והלאה ' + a.bonusPct + '%)' : '') + '.</p></div></body></html>';
}

function serve(tok, view, res) {
  const a = aff(tok);
  const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
  // 12.11.2026, Itzik on Shai: "תסיר את הדף שמראה כמה לקוחות הוא הביא". "noTable": true in the referrer's file closes /t.
  if (!a || (view === 't' && a.noTable)) { res.writeHead(404, h); return res.end('<!doctype html><meta charset="utf-8"><p>הדף לא נמצא.</p>'); }
  res.writeHead(200, h); res.end(view === 't' ? tablePage(tok, a) : formPage(tok, a));
}

const hits = {};
function limited(ip) {
  const now = Date.now(), k = String(ip || '-');
  hits[k] = (hits[k] || []).filter((t) => now - t < 3600e3); hits[k].push(now);
  return hits[k].length > 5;
}

// Returns { ok, lead } or { ok:false, error }. notify(kind, text) is the bridge's urgent alert to Itzik.
function handleLead(b, ip, notify) {
  const tok = safeTok(b && b.t), a = tok && aff(tok);
  if (!a) return { ok: false, error: 'link' };
  const name = clean(b.name, 60), phone = phoneNorm(b.phone), biz = clean(b.biz, 80), note = clean(b.note, 600);
  if (name.length < 2) return { ok: false, error: 'name' };
  if (phone.length < 9 || phone.length > 12) return { ok: false, error: 'phone' };
  if (limited(ip)) return { ok: false, error: 'limit' };
  const at = new Date().toISOString();
  const L = require('./lib/leads.js');
  const text = 'השאיר פרטים בקישור של ' + a.name + (biz ? '. העסק: ' + biz : '') + (note ? '. ' + note : '');
  const rec = L.addFound(DATA, { src: 'aff', key: 'aff:' + a.ref + ':' + phone, name, phone, text, at });
  if (rec) {
    rec.ref = a.ref; rec.note = 'הגיע דרך ' + a.name + ' (שותף)'; rec.next = 'להתקשר';
    fs.writeFileSync(path.join(DATA, 'biz', 'biz', rec.id + '.json'), JSON.stringify(Object.assign({}, rec, { _file: undefined }), null, 1));
    a.leads = a.leads || []; a.leads.push({ at, id: rec.id, name, biz });
    writeJson(path.join(DIR, tok + '.json'), a);
    try { require('./lib/handle.js').complete({ key: 'aff-' + rec.id, kind: 'lead', who: name, title: 'ליד דרך ' + a.name + ': ' + name + ', ' + phone + (biz ? ', ' + biz : '') + '. לחזור אליו.', link: 'biz' }); } catch (e) {}
    try { notify('ליד דרך ' + a.name, name + ', ' + phone + (biz ? ', ' + biz : '') + (note ? '\n' + note : '')); } catch (e) {}
  }
  return { ok: true };
}

module.exports = { serve, handleLead, handleSign, rows, aff };
