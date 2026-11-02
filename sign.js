'use strict';
/*
  2.11.2026: sign a quote on the phone, "חתימה על הצעה". The client opens
  https://form.it-solution.co.il/q/<token>, reads the quote, taps a package,
  types his name and signs with his finger. No printing, no scanning.
  On signing: the signed PDF is rendered (quote HTML + filled approval block),
  saved to data/sign/<token>.signed.pdf and data/files-private/<def.out>, and
  Itzik's monitor gets an urgent report (kind "חתימה על הצעה").
  IT Solution only, no name of Itzik anywhere.

  data/sign/<token>.def.json  { client, title, quoteNo, out, plans: [ { id, name, price, setup, note } ] }
  data/sign/<token>.html      the quote source; the block between <!--SIGN--> and <!--/SIGN--> is replaced when signed
  data/sign/<token>.pdf       the quote as sent (served at /q/<token>/pdf)
  data/sign/<token>.json      { openedAt, signedAt, plan, name, biz, idno, ip, ua, sig, docHash }
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const DIR = path.join(__dirname, 'data', 'sign');
const PRIV = path.join(__dirname, 'data', 'files-private');

function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }
function def(tok) { try { return JSON.parse(fs.readFileSync(path.join(DIR, tok + '.def.json'), 'utf8')); } catch (e) { return null; } }
function state(tok) { try { return JSON.parse(fs.readFileSync(path.join(DIR, tok + '.json'), 'utf8')); } catch (e) { return {}; } }
function saveState(tok, s) { fs.mkdirSync(DIR, { recursive: true }); const f = path.join(DIR, tok + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(s, null, 1)); fs.renameSync(f + '.tmp', f); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function nis(n) { return Number(n).toLocaleString('en-US') + ' ₪'; }
function ilTime(iso) { return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

const CSS = '*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#0f1b2a;font-family:Heebo,sans-serif}'
  + '.top{background:#0f1b2a;color:#fff;padding:16px 18px}'
  + '.brand{display:flex;align-items:center;gap:9px;direction:ltr;justify-content:flex-end}.brand span{width:34px;height:34px;border-radius:10px;background:#06b6d4;color:#0f1b2a;display:flex;align-items:center;justify-content:center;font:900 14px Heebo}.brand b{font:800 21px Heebo}.brand b i{font-style:normal;color:#06b6d4}'
  + '.wrap{max-width:640px;margin:0 auto;padding:18px 16px 48px}'
  + 'h1{font:900 24px/1.25 Heebo;margin:4px 0 6px}.hello{font:400 15.5px/1.6 Heebo;color:#24364b;margin:0 0 16px}'
  + '.step{font:800 17px Heebo;margin:22px 0 10px}.step i{font-style:normal;display:inline-flex;width:28px;height:28px;border-radius:50%;background:#0f1b2a;color:#fff;align-items:center;justify-content:center;font:800 14px Heebo;margin-left:8px}'
  + '.pdf{display:flex;align-items:center;justify-content:center;gap:8px;background:#fff;border:2px solid #0f1b2a;border-radius:16px;padding:15px;font:800 16.5px Heebo;color:#0f1b2a;text-decoration:none}'
  + '.pl{display:block;width:100%;text-align:right;background:#fff;border:2px solid #e2e8f0;border-radius:18px;padding:14px 16px 14px 50px;margin:0 0 10px;font-family:Heebo;color:#0f1b2a;cursor:pointer;position:relative}'
  + '.pl.on{border-color:#06b6d4;box-shadow:0 0 0 4px #d5f5fb}'
  + '.pl .r{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.pl .n{font:800 15px Heebo;color:#0e7490;direction:ltr}.pl .p{font:900 24px Heebo}.pl .p small{font:600 13px Heebo;color:#4a5a6e}'
  + '.pl .d{font:400 14px/1.5 Heebo;color:#24364b;margin-top:2px}'
  + '.pl .su{display:inline-block;margin-top:8px;border-radius:999px;padding:4px 12px;font:700 13.5px Heebo;background:#f1f5f9;color:#4a5a6e}.pl .su.free{background:#06b6d4;color:#0f1b2a;font-weight:900}'
  + '.pl .ok{position:absolute;left:14px;top:14px;width:26px;height:26px;border-radius:50%;border:2px solid #cbd5e1}.pl.on .ok{background:#06b6d4;border-color:#06b6d4}.pl.on .ok:after{content:"✓";color:#0f1b2a;font:900 15px Heebo;display:flex;justify-content:center;align-items:center;height:100%}'
  + 'label{display:block;font:700 14.5px Heebo;margin:12px 0 5px}label small{font-weight:400;color:#6b7c90}'
  + 'input[type=text]{width:100%;font:500 17px Heebo;padding:12px 14px;border:2px solid #e2e8f0;border-radius:14px;background:#fff;color:#0f1b2a}input[type=text]:focus{outline:none;border-color:#06b6d4}'
  + '.pad{background:#fff;border:2px dashed #94a3b8;border-radius:16px;position:relative;touch-action:none}.pad canvas{display:block;width:100%;height:190px;touch-action:none}'
  + '.pad .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 16px Heebo;color:#94a3b8;pointer-events:none}'
  + '.clr{background:none;border:0;color:#0e7490;font:700 14px Heebo;padding:8px 0;cursor:pointer}'
  + '.agree{display:flex;gap:10px;align-items:flex-start;background:#fff;border-radius:14px;padding:13px 14px;margin-top:14px;font:500 14.5px/1.5 Heebo;cursor:pointer}.agree input{width:22px;height:22px;flex:none;margin-top:1px;accent-color:#06b6d4}'
  + '.tot{background:#0f1b2a;color:#fff;border-radius:16px;padding:14px 16px;margin-top:14px;font:500 14.5px/1.6 Heebo;display:none}.tot b{font-weight:900}'
  + '.go{display:block;width:100%;margin-top:16px;background:#06b6d4;color:#0f1b2a;border:0;border-radius:16px;padding:17px;font:900 19px Heebo;cursor:pointer}.go:disabled{background:#cbd5e1;color:#6b7c90}'
  + '.err{color:#b91c1c;font:700 14.5px Heebo;margin-top:10px;min-height:1em}'
  + '.done{background:#fff;border-radius:20px;padding:26px 18px;text-align:center;margin-top:10px}.done .big{font-size:52px}.done h2{font:900 23px Heebo;margin:6px 0}.done p{font:400 15.5px/1.6 Heebo;color:#24364b}';

function head(title) {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>' + esc(title) + ' | IT Solution</title>'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet">'
    + '<style>' + CSS + '</style></head><body><div class="top"><div class="brand"><span>IT</span><b>IT<i>solution</i></b></div></div><div class="wrap">';
}

function doneHtml(tok, d, s) {
  const p = (d.plans || []).find((x) => x.id === s.plan) || {};
  return '<div class="done"><div class="big">✅</div><h2>ההצעה נחתמה, תודה!</h2>'
    + '<p>חבילת <b dir="ltr">' + esc(p.name || s.plan) + '</b> · נחתם ב ' + esc(ilTime(s.signedAt)) + '</p>'
    + '<p>נחזור אליך בקרוב לתיאום שיחת ההקמה.</p>'
    + '<a class="pdf" href="/q/' + tok + '/signed" target="_blank">📄 ההצעה החתומה (PDF)</a></div>';
}

// 2.11, Itzik: the whole quote on one page, no PDF to open. First what he gets (big, on top),
// then the prices, then the terms, then sign. "לא ישר שיפלו על המחיר בלי לדעת מה יש בפנים."
// Content lives in the def: intro, includes [[bold, text]], setup {title, text, old, price}, how [[bold, text]], terms [html], date, valid.
const CSS2 = '.intro{background:#fff;border-radius:20px;padding:20px 18px;margin:0 0 6px;box-shadow:0 2px 12px rgba(15,27,42,.06)}'
  + '.intro .to{font:500 15px Heebo;color:#4a5a6e;margin:0 0 6px}.intro .to b{color:#0f1b2a}'
  + '.intro h1{font:900 27px/1.2 Heebo;margin:0 0 10px}.intro .big{font:500 18.5px/1.65 Heebo;color:#0f1b2a;margin:0}'
  + '.meta{font:500 13px/1.6 Heebo;color:#6b7c90;margin:10px 0 0}'
  + '.sec{font:900 20px Heebo;margin:26px 0 10px;display:flex;align-items:center;gap:8px}.sec i{font-style:normal;display:inline-flex;width:30px;height:30px;border-radius:50%;background:#0f1b2a;color:#fff;align-items:center;justify-content:center;font:800 15px Heebo}'
  + '.inc{list-style:none;margin:0;padding:0}.inc li{background:#fff;border-radius:14px;padding:12px 44px 12px 14px;margin:0 0 8px;font:400 15.5px/1.55 Heebo;color:#24364b;position:relative}'
  + '.inc li:before{content:"✓";position:absolute;right:14px;top:11px;width:22px;height:22px;border-radius:50%;background:#06b6d4;color:#0f1b2a;font:900 13px Heebo;display:flex;align-items:center;justify-content:center}.inc li b{color:#0f1b2a}'
  + '.card{background:#fff;border-radius:16px;padding:14px 16px;margin:0 0 10px;font:400 15px/1.6 Heebo;color:#24364b}.card b{color:#0f1b2a}.card p{margin:0 0 8px}.card p:last-child{margin:0}'
  + '.card .ttl{font:800 16.5px Heebo;color:#0f1b2a;margin-bottom:4px}.card del{color:#8a99ab}'
  + '.terms{margin:0;padding:0 20px 0 0;font:400 14.5px/1.65 Heebo;color:#24364b}.terms li{margin-bottom:6px}.terms b{color:#0f1b2a}'
  + 'details.card summary{font:800 16px Heebo;color:#0f1b2a;cursor:pointer;list-style:none}details.card summary:after{content:" ▾";color:#0e7490}details.card[open] summary{margin-bottom:10px}'
  + '.redo{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:8px;background:#fff;border:2px solid #0e7490;color:#0e7490;border-radius:14px;padding:11px;font:800 15.5px Heebo;cursor:pointer}'
  + '.vat{font:500 13px Heebo;color:#6b7c90;margin:-2px 0 8px}';

function page(tok, d, s, view) {
  let h = head(d.title).replace('</style>', CSS2 + '</style>');
  if (s.signedAt) return h + '<h1>' + esc(d.title) + '</h1>' + doneHtml(tok, d, s) + '</div></body></html>';
  h += '<div class="intro"><p class="to">לכבוד: <b>' + esc(d.client) + '</b>' + (d.clientBiz ? ', ' + esc(d.clientBiz) : '') + '</p>'
    + '<h1>' + esc(d.title) + '</h1>'
    + '<p class="big">' + esc(d.intro || '') + '</p>'
    + '<p class="meta">הצעה מספר ' + esc(d.quoteNo) + (d.date ? ' · ' + esc(d.date) : '') + (d.valid ? ' · בתוקף עד ' + esc(d.valid) : '') + '</p></div>';
  if ((d.includes || []).length) {
    h += '<div class="sec"><i>1</i>מה מקבלים</div><ul class="inc">'
      + d.includes.map((x) => '<li><b>' + esc(x[0]) + '</b> ' + esc(x[1]) + '</li>').join('') + '</ul>';
  }
  if (d.setup) {
    h += '<div class="card"><div class="ttl">' + esc(d.setup.title) + '</div><p>' + esc(d.setup.text) + '</p></div>';
  }
  if ((d.how || []).length) {
    h += '<div class="sec"><i>2</i>איך זה עובד</div><div class="card">'
      + d.how.map((x) => '<p><b>' + esc(x[0]) + '</b> ' + esc(x[1]) + '</p>').join('') + '</div>';
  }
  h += '<div class="sec"><i>3</i>בוחרים חבילה</div><p class="vat">המחירים לחודש, לא כולל מע״מ.</p>';
  (d.plans || []).forEach((p) => {
    h += '<button type="button" class="pl" data-id="' + esc(p.id) + '" data-price="' + p.price + '" data-setup="' + p.setup + '"><span class="ok"></span>'
      + '<div class="r"><span class="n">' + esc(p.name) + '</span><span class="p">' + nis(p.price) + ' <small>לחודש</small></span></div>'
      + '<div class="d">' + esc(p.note || '') + '</div>'
      + (p.setup ? '<span class="su">הקמה: ' + nis(p.setup) + ' חד פעמי</span>' : '<span class="su free">✓ הקמה בחינם</span>')
      + '</button>';
  });
  h += '<div class="tot" id="tot"></div>';
  if ((d.terms || []).length) {
    h += '<details class="card"><summary>📋 תנאי ההצעה (' + d.terms.length + ')</summary><ol class="terms">'
      + d.terms.map((t) => '<li>' + t + '</li>').join('') + '</ol></details>';
  }
  h += '<div class="sec"><i>4</i>פרטים וחתימה</div>'
    + '<label>שם מלא</label><input type="text" id="nm" autocomplete="name">'
    + '<label>שם העסק</label><input type="text" id="bz" autocomplete="organization">'
    + '<label>מספר עוסק או תעודת זהות <small>(לחשבונית)</small></label><input type="text" id="idn" inputmode="numeric">'
    + '<label>חתימה <small>(עם האצבע, בתוך המסגרת)</small></label>'
    + '<div class="pad"><canvas id="cv"></canvas><div class="ph" id="ph">✍️ חותמים כאן</div></div>'
    + '<button type="button" class="redo" id="clr">🔄 למחוק את החתימה ולחתום מחדש</button>'
    + '<label class="agree"><input type="checkbox" id="ag"><span>קראתי את ההצעה ואת התנאים שבה, ואני מאשר אותם.</span></label>'
    + '<button type="button" class="go" id="go">✍️ חתימה ושליחה</button><div class="err" id="err"></div>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ',plan=null,inked=false;'
    + 'var $=function(i){return document.getElementById(i)};'
    + 'function fmt(n){return Number(n).toLocaleString("en-US")+" ₪"}'
    + 'document.querySelectorAll(".pl").forEach(function(b){b.onclick=function(){document.querySelectorAll(".pl").forEach(function(x){x.classList.remove("on")});b.classList.add("on");plan=b.dataset.id;'
    + 'var pr=+b.dataset.price,su=+b.dataset.setup,t=$("tot");t.style.display="block";'
    + 't.innerHTML="החיוב הראשון: <b>"+fmt(pr)+"</b> לחודש"+(su?" ועוד <b>"+fmt(su)+"</b> הקמה חד פעמית":", <b>ההקמה בחינם</b>")+". המחירים לא כוללים מע״מ."}});'
    + 'var cv=$("cv"),cx=cv.getContext("2d"),dn=false;'
    + 'function fit(){var r=cv.getBoundingClientRect(),k=window.devicePixelRatio||1;var img=inked?cv.toDataURL():null;cv.width=r.width*k;cv.height=r.height*k;cx.setTransform(k,0,0,k,0,0);cx.lineWidth=2.6;cx.lineCap="round";cx.lineJoin="round";cx.strokeStyle="#0f1b2a";if(img){var im=new Image();im.onload=function(){cx.drawImage(im,0,0,r.width,r.height)};im.src=img}}'
    + 'fit();window.addEventListener("resize",fit);'
    + 'function pt(e){var r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}'
    + 'cv.addEventListener("pointerdown",function(e){dn=true;cv.setPointerCapture(e.pointerId);var p=pt(e);cx.beginPath();cx.moveTo(p[0],p[1]);cx.lineTo(p[0]+.1,p[1]+.1);cx.stroke();inked=true;$("ph").style.display="none";e.preventDefault()});'
    + 'cv.addEventListener("pointermove",function(e){if(!dn)return;var p=pt(e);cx.lineTo(p[0],p[1]);cx.stroke();e.preventDefault()});'
    + 'cv.addEventListener("pointerup",function(){dn=false});cv.addEventListener("pointercancel",function(){dn=false});'
    + '$("clr").onclick=function(){cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);fit();inked=false;$("ph").style.display="flex"};'
    // 2.11: /q/<token>/view is Itzik's own look from the monitor: no open report, nothing is sent.
    + (view ? '$("go").disabled=true;$("go").textContent="תצוגה בלבד, כך הלקוח רואה את ההצעה";' : 'fetch("/api/sign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:T,open:true})}).catch(function(){});')
    + '$("go").onclick=function(){var er=$("err"),nm=$("nm").value.trim(),bz=$("bz").value.trim();'
    + 'if(!plan){er.textContent="צריך לבחור חבילה (שלב 3)";return}'
    + 'if(nm.length<2){er.textContent="צריך למלא שם מלא";$("nm").focus();return}'
    + 'if(!inked){er.textContent="צריך לחתום עם האצבע בתוך המסגרת";return}'
    + 'if(!$("ag").checked){er.textContent="צריך לסמן שקראת ואתה מאשר";return}'
    + 'er.textContent="";var g=$("go");g.disabled=true;g.textContent="שולח...";'
    + 'fetch("/api/sign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:T,plan:plan,name:nm,biz:bz,idno:$("idn").value.trim(),sig:cv.toDataURL("image/png")})})'
    + '.then(function(r){return r.json()}).then(function(j){if(j.ok){location.reload()}else{throw 0}})'
    + '.catch(function(){g.disabled=false;g.textContent="✍️ חתימה ושליחה";er.textContent="השליחה לא עברה. בדוק את החיבור לאינטרנט ונסה שוב."})};'
    + '})();</script>';
  return h + '</div></body></html>';
}

function servePage(tok, sub, s) {
  tok = safeTok(tok); const d = tok && def(tok);
  if (!d) { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('הקישור לא נמצא'); }
  if (sub === 'pdf' || sub === 'signed') {
    const f = path.join(DIR, tok + (sub === 'signed' ? '.signed.pdf' : '.pdf'));
    if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="quote' + (sub === 'signed' ? '-signed' : '') + '.pdf"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(f).pipe(s);
  }
  s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(page(tok, d, sub === 'view' ? {} : state(tok), sub === 'view'));
}

function signedBlock(d, st) {
  const p = (d.plans || []).find((x) => x.id === st.plan) || {};
  const cell = (k, v) => '<div style="border-bottom:1.5px solid #94a3b8;padding:0 0 1.5mm"><div style="font:500 11px Heebo;color:#6b7c90">' + k + '</div><div style="font:700 14px Heebo;min-height:5mm">' + esc(v) + '</div></div>';
  return '<h2 style="margin-bottom:1.5mm">אישור ההצעה <span style="color:#0e7490">✓ נחתם דיגיטלית</span></h2>'
    + '<p class="lead" style="margin-bottom:2mm">בחתימה על ההצעה, העסק מאשר את המחירים ואת התנאים המפורטים בה. החבילה שנבחרה: <b dir="ltr">' + esc(p.name || st.plan) + '</b>, ' + nis(p.price || 0) + ' לחודש' + (p.setup ? ', הקמה ' + nis(p.setup) + ' חד פעמי' : ', הקמה בחינם') + '.</p>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1.3fr;gap:4mm;align-items:end">'
    + cell('שם העסק', st.biz || '') + cell('שם החותם', st.name) + cell('מספר עוסק או ת.ז.', st.idno || '') + cell('תאריך ושעה', ilTime(st.signedAt))
    + '<div style="border-bottom:1.5px solid #94a3b8;padding:0 0 1mm"><div style="font:500 11px Heebo;color:#6b7c90">חתימה</div><img src="' + st.sig + '" style="display:block;height:15mm;max-width:100%;object-fit:contain"></div></div>'
    + '<p style="font:400 9.5px/1.4 Heebo;color:#6b7c90;margin:1.5mm 0 0">נחתם באתר form.it-solution.co.il · כתובת IP ' + esc(st.ip) + ' · מזהה מסמך ' + esc(String(st.docHash).slice(0, 16)) + '</p>';
}

function renderSigned(tok, d, st, cb) {
  let html = fs.readFileSync(path.join(DIR, tok + '.html'), 'utf8');
  html = html.replace(/<!--SIGN-->[\s\S]*?<!--\/SIGN-->/, signedBlock(d, st));
  const tmp = path.join(DIR, tok + '.signed.html'); fs.writeFileSync(tmp, html);
  const out = path.join(DIR, tok + '.signed.pdf');
  execFile('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=6000', '--print-to-pdf=' + out, 'file://' + tmp], { timeout: 90000 }, (e) => {
    if (!e && fs.existsSync(out) && d.out) { try { fs.copyFileSync(out, path.join(PRIV, d.out)); } catch (x) {} }
    cb(e);
  });
}

function handlePost(b, notify, ip, ua) {
  const tok = safeTok(b && b.token); const d = tok && def(tok);
  if (!d) return { status: 404, body: { ok: false } };
  const s = state(tok); const now = new Date().toISOString();
  if (b.open) {
    if (!s.openedAt && !s.signedAt) { s.openedAt = now; saveState(tok, s); notify('חתימה על הצעה', d.client + ' פתח את דף החתימה על ההצעה (' + d.quoteNo + ').'); }
    return { status: 200, body: { ok: true } };
  }
  if (s.signedAt) return { status: 200, body: { ok: true } };
  const plan = (d.plans || []).find((x) => x.id === b.plan);
  const sig = String(b.sig || '');
  if (!plan || String(b.name || '').trim().length < 2 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 400000) return { status: 400, body: { ok: false } };
  let docHash = ''; try { docHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, tok + '.pdf'))).digest('hex'); } catch (e) {}
  Object.assign(s, { signedAt: now, plan: plan.id, name: String(b.name).trim().slice(0, 80), biz: String(b.biz || '').trim().slice(0, 80), idno: String(b.idno || '').trim().slice(0, 20), ip: String(ip || ''), ua: String(ua || '').slice(0, 300), sig, docHash });
  saveState(tok, s);
  renderSigned(tok, d, s, (e) => {
    const NL = '\n';
    notify('חתימה על הצעה', '🎉 ' + d.client + ' חתם על ההצעה ' + d.quoteNo + '!' + NL
      + 'חבילה: ' + plan.name + ', ' + nis(plan.price) + ' לחודש' + (plan.setup ? ' ועוד ' + nis(plan.setup) + ' הקמה' : ', הקמה בחינם') + NL
      + 'שם: ' + s.name + (s.biz ? ', ' + s.biz : '') + (s.idno ? ', ' + s.idno : '') + NL
      + (e ? 'ה PDF החתום לא הופק: ' + e.message : 'ה PDF החתום: data/files-private/' + d.out));
  });
  return { status: 200, body: { ok: true } };
}

module.exports = { servePage, handlePost };
