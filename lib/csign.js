'use strict';
/*
  14.11.2026, the offer page promises every package "הצעות מחיר, והלקוח שלך חותם עליהן מהטלפון":
  5 digital signatures a month in the entry package and in Small (50 more with the sign50 add-on, lib/addons.js),
  no limit in Medium and Large. Until today a customer had no way to send anything for signing.

  The customer makes a quote in 🧾 הצעות מחיר (lib/biz-home.js) and taps "לשלוח לחתימה". His page posts the quote
  with its visit key to wa.abaitzik.com/api/csign/create; this checks the month's count against his package, keeps
  the quote and answers with https://form.it-solution.co.il/c/<token>, which he sends to his client. The client reads
  the quote, writes his name, signs with a finger and confirms. The signed PDF (the quote, the signature, name, time,
  address and the quote's fingerprint) is made with Chrome and the customer gets a message in his own monitor.

  Nothing here trusts HTML from the page: the quote comes as fields and is drawn here, every value escaped.
  data/csign/<token>.json        { tenant, at, month, q, biz, logo, state:{ openedAt, opens, signedAt, name, ip, ua, sig, docHash } }
  data/csign/count/<tenant>-<YYYY-MM>.json { n }
  data/csign/<token>.signed.pdf
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const P = require('./plan.js');

const FREE = 5, ADD = 50;
function root(DATA) { return path.join(DATA, 'csign'); }
function safeTok(t) { return /^[a-f0-9]{24}$/.test(String(t || '')) ? String(t) : null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rj(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function wj(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); }

// How many links a month: unlimited in Medium and Large, 5 (plus 50 with the add-on) otherwise.
function limitFor(state) {
  if (state && P.valid(state) && (state.plan === 'medium' || state.plan === 'large')) return Infinity;
  const extra = state && state.addons && state.addons.sign50 && state.addons.sign50.on ? ADD : 0;
  return FREE + extra;
}
function countFile(DATA, tenant, month) { return path.join(root(DATA), 'count', tenant + '-' + month + '.json'); }
function used(DATA, tenant, month) { return Number((rj(countFile(DATA, tenant, month), {}) || {}).n) || 0; }
function left(DATA, tenant, state, now) {
  const lim = limitFor(state);
  return lim === Infinity ? -1 : Math.max(0, lim - used(DATA, tenant, P.monthOf(now)));
}

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const num = (v) => { const x = Number(v); return isFinite(x) ? Math.max(0, Math.min(1e9, x)) : 0; };
// The quote as fields, exactly the shape lib/biz-home.js keeps (items are [name, qty, price, desc, unit]).
function clean(q) {
  if (!q || typeof q !== 'object') return null;
  const items = (Array.isArray(q.items) ? q.items : []).slice(0, 40).map((r) => [str(r && r[0], 200), num(r && r[1]), num(r && r[2]), str(r && r[3], 1500), str(r && r[4], 20)])
    .filter((r) => r[0] && r[1] && r[2]);
  const c = { no: str(q.no, 30), at: isNaN(Date.parse(q.at)) ? new Date().toISOString() : new Date(q.at).toISOString(), client: str(q.client, 120), co: str(q.co, 120), coId: str(q.coId, 30),
    phone: str(q.phone, 40), mail: str(q.mail, 120), subject: str(q.subject, 300), intro: str(q.intro, 3000), items,
    disc: Math.min(100, num(q.disc)), terms: str(q.terms, 300), when: str(q.when, 300), valid: Math.min(365, num(q.valid) || 30), notes: str(q.notes, 4000) };
  return c.client && items.length ? c : null;
}
function cleanBiz(b) { b = b || {}; return { name: str(b.name, 120), sub: str(b.sub, 160), vat: str(b.vat, 30), phone: str(b.phone, 40), email: str(b.email, 120), address: str(b.address, 200) }; }
function cleanLogo(l) { l = String(l || ''); return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(l) && l.length < 450000 ? l : ''; }

function sum(q) {
  let g = 0; q.items.forEach((r) => { g += r[1] * r[2]; });
  const disc = Math.round(g * q.disc) / 100, net = g - disc, vat = Math.round(net * 18) / 100;
  return { gross: g, disc, net, vat, total: net + vat };
}
function money(n) { n = Math.round((Number(n) || 0) * 100) / 100; return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
function day(iso) { return new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }); }
function ltr(s) { return '<bdi dir="ltr">' + esc(s) + '</bdi>'; }

// The quote drawn here, the same parts as the customer's own PDF (biz-home bhQuoteHtml).
function docHtml(rec) {
  const q = rec.q, b = rec.biz, s = sum(q), until = new Date(Date.parse(q.at) + q.valid * 864e5).toISOString();
  const terms = [];
  if (q.terms) terms.push('תנאי תשלום: ' + q.terms + '.');
  if (q.when) terms.push('לוח זמנים: ' + q.when + '.');
  terms.push('המחירים בהצעה אינם כוללים מע״מ, שיתווסף כחוק.');
  terms.push('ההצעה בתוקף עד ' + day(until) + '.');
  q.notes.split(/\r?\n/).forEach((l) => { l = l.trim(); if (l) terms.push(l); });
  const who = [q.co ? esc(q.co) : '', q.coId ? 'ח״פ ' + ltr(q.coId) : '', q.phone ? ltr(q.phone) : '', q.mail ? ltr(q.mail) : ''].filter(Boolean);
  return '<div class="doc"><div class="top"><div class="biz">' + (rec.logo ? '<img src="' + rec.logo + '" alt="">' : '') + (b.name ? '<b>' + esc(b.name) + '</b>' : '') + (b.sub ? '<span>' + esc(b.sub) + '</span>' : '') + '</div>'
    + '<div class="ttl"><h2>הצעת מחיר</h2><table class="meta"><tr><td>מספר</td><td>' + esc(q.no) + '</td></tr><tr><td>תאריך</td><td>' + day(q.at) + '</td></tr><tr><td>בתוקף עד</td><td>' + day(until) + '</td></tr></table></div></div>'
    + '<div class="to"><div><small>לכבוד</small><b>' + esc(q.client) + '</b>' + who.map((x) => '<span>' + x + '</span>').join('') + '</div>'
    + '<div><small>מאת</small><b>' + esc(b.name) + '</b>' + [b.vat ? 'עוסק ' + ltr(b.vat) : '', b.phone ? ltr(b.phone) : '', b.email ? ltr(b.email) : '', b.address ? esc(b.address) : ''].filter(Boolean).map((x) => '<span>' + x + '</span>').join('') + '</div></div>'
    + (q.subject ? '<p class="sub">הנדון: ' + esc(q.subject) + '</p>' : '') + (q.intro ? '<p class="intro">' + esc(q.intro) + '</p>' : '')
    + '<table class="tab"><thead><tr><th>#</th><th>פריט</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr></thead><tbody>'
    + q.items.map((r, k) => '<tr><td>' + (k + 1) + '</td><td><b>' + esc(r[0]) + '</b>' + (r[3] ? '<div class="ds">' + esc(r[3]) + '</div>' : '') + '</td><td>' + esc(String(r[1])) + (r[4] && r[4] !== 'יח׳' ? ' ' + esc(r[4]) : '') + '</td><td>' + money(r[2]) + '</td><td>' + money(r[1] * r[2]) + '</td></tr>').join('')
    + '</tbody></table><table class="sum">' + (s.disc ? '<tr><td>סה״כ</td><td>' + money(s.gross) + '</td></tr><tr><td>הנחה ' + esc(String(q.disc)) + '%</td><td>' + money(s.disc) + '</td></tr>' : '')
    + '<tr><td>סה״כ לפני מע״מ</td><td>' + money(s.net) + '</td></tr><tr><td>מע״מ 18%</td><td>' + money(s.vat) + '</td></tr><tr class="tot"><td>סה״כ לתשלום</td><td>' + money(s.total) + '</td></tr></table>'
    + '<div class="terms"><h4>תנאים</h4><ol>' + terms.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ol></div></div>';
}
const CSS = '*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#0f1b2a;font-family:Heebo,Arial,sans-serif}main{max-width:760px;margin:0 auto;padding:14px}'
  + '.doc{background:#fff;border-radius:14px;padding:18px;box-shadow:0 2px 12px rgba(15,27,42,.08);font-size:14px;line-height:1.55}.top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}'
  + '.biz img{max-height:64px;max-width:200px;display:block;margin-bottom:6px}.biz b{display:block;font-size:17px}.biz span,.to span{display:block;color:#475569;font-size:13px}'
  + '.ttl h2{margin:0 0 6px;font-size:22px}.meta td{padding:1px 6px;font-size:13px}.meta td:first-child{color:#64748b}.to{display:flex;gap:16px;margin:14px 0;flex-wrap:wrap}.to>div{flex:1;min-width:200px;background:#f8fafc;border-radius:10px;padding:10px}'
  + '.to small{color:#64748b}.to b{display:block}.sub{font-weight:700}.tab{width:100%;border-collapse:collapse;margin:10px 0}.tab th{background:#0f1b2a;color:#fff;padding:7px;font-weight:500;text-align:right}'
  + '.tab td{border-bottom:1px solid #e2e8f0;padding:7px;vertical-align:top}.ds{color:#475569;font-size:12.5px;white-space:pre-wrap}.sum{margin-inline-start:auto;min-width:240px}.sum td{padding:3px 8px}.sum td:last-child{text-align:left}'
  + '.sum .tot td{font-weight:800;border-top:2px solid #0f1b2a;font-size:16px}.terms h4{margin:12px 0 4px}.terms ol{margin:0;padding-inline-start:20px;color:#334155}'
  + '.card{background:#fff;border-radius:14px;padding:16px;margin-top:14px;box-shadow:0 2px 12px rgba(15,27,42,.08)}label{display:block;font-weight:700;margin:10px 0 4px}'
  + 'input[type=text]{width:100%;font:inherit;padding:11px;border:1.5px solid #cbd5e1;border-radius:10px}.pad{position:relative;height:170px;border:2px dashed #94a3b8;border-radius:12px;background:#fff;touch-action:none}'
  + '.pad canvas{width:100%;height:100%;display:block}.ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;pointer-events:none;font-size:18px}'
  + '.redo{background:none;border:0;color:#2563eb;font:inherit;margin-top:6px;cursor:pointer}.agree{display:flex;gap:8px;font-weight:400;align-items:flex-start}.agree input{width:22px;height:22px;flex:none}'
  + '.go{width:100%;margin-top:14px;padding:15px;border:0;border-radius:12px;background:#16a34a;color:#fff;font:800 18px Heebo,Arial,sans-serif;cursor:pointer}.go:disabled{opacity:.6}.err{color:#b91c1c;margin-top:8px;min-height:1.2em}'
  + '.ok{background:#ecfdf5;border:1.5px solid #16a34a;border-radius:12px;padding:14px;font-size:16px}.ok a{display:inline-block;margin-top:8px;font-weight:700}'
  + '.sgn{display:flex;gap:16px;margin-top:16px;flex-wrap:wrap}.sgn>div{flex:1;min-width:220px;border-top:1.5px solid #94a3b8;padding-top:6px;font-size:12.5px;color:#334155}.sgn img{max-height:90px;display:block}'
  + '@media print{body{background:#fff}main{padding:0}.doc{box-shadow:none;padding:0}}';
function shell(title, body) {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    + '<title>' + esc(title) + '</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet"><style>' + CSS + '</style></head><body><main>' + body + '</main></body></html>';
}
function ilTime(iso) { return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function signedBlock(rec) {
  const st = rec.state;
  return '<div class="sgn"><div><b>אישור הלקוח</b><br>' + esc(st.name) + '<img src="' + st.sig + '" alt="חתימה"></div>'
    + '<div>נחתם דיגיטלית ' + esc(ilTime(st.signedAt)) + '<br>כתובת IP ' + esc(st.ip) + '<br>טביעת ההצעה ' + esc(String(st.docHash).slice(0, 16)) + '</div></div>';
}

function page(rec, tok, view) {
  const st = rec.state || {};
  const doc = docHtml(rec);
  if (st.signedAt) {
    return shell('ההצעה נחתמה', '<div class="doc">' + doc.slice('<div class="doc">'.length, -'</div>'.length) + signedBlock(rec) + '</div>'
      + '<div class="card ok">✅ ההצעה נחתמה ' + esc(ilTime(st.signedAt)) + '. תודה!<br><a href="/c/' + tok + '/signed">להורדת העותק החתום (PDF)</a></div>');
  }
  const js = '(function(){var T=' + JSON.stringify(tok) + ',inked=false,$=function(i){return document.getElementById(i)};'
    + 'var cv=$("cv"),cx=cv.getContext("2d"),dn=false,fw=-1;'
    + 'function fit(f){var r=cv.getBoundingClientRect(),k=window.devicePixelRatio||1;if(!f&&Math.round(r.width)===fw)return;fw=Math.round(r.width);cv.width=r.width*k;cv.height=r.height*k;cx.setTransform(k,0,0,k,0,0);cx.lineWidth=2.6;cx.lineCap="round";cx.lineJoin="round";cx.strokeStyle="#0f1b2a";}'
    + 'fit();window.addEventListener("resize",function(){if(!inked)fit()});'
    + 'function pt(e){var r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}'
    + 'cv.addEventListener("pointerdown",function(e){dn=true;cv.setPointerCapture(e.pointerId);var p=pt(e);cx.beginPath();cx.moveTo(p[0],p[1]);cx.lineTo(p[0]+.1,p[1]+.1);cx.stroke();inked=true;$("ph").style.display="none";e.preventDefault()});'
    + 'cv.addEventListener("pointermove",function(e){if(!dn)return;var p=pt(e);cx.lineTo(p[0],p[1]);cx.stroke();e.preventDefault()});'
    + 'cv.addEventListener("pointerup",function(){dn=false});cv.addEventListener("pointercancel",function(){dn=false});'
    + '$("clr").onclick=function(){cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);fit(true);inked=false;$("ph").style.display="flex"};'
    + (view ? '$("go").disabled=true;$("go").textContent="תצוגה בלבד";' : 'fetch("/api/csign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:T,open:true})}).catch(function(){});')
    + '$("go").onclick=function(){var er=$("err"),nm=$("nm").value.trim();'
    + 'if(nm.length<2){er.textContent="צריך למלא שם מלא";$("nm").focus();return}'
    + 'if(!inked){er.textContent="צריך לחתום עם האצבע בתוך המסגרת";return}'
    + 'if(!$("ag").checked){er.textContent="צריך לסמן שקראת ואתה מאשר";return}'
    + 'er.textContent="";var g=$("go");g.disabled=true;g.textContent="שולח...";'
    + 'fetch("/api/csign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:T,name:nm,sig:cv.toDataURL("image/png")})})'
    + '.then(function(r){return r.json()}).then(function(j){if(j.ok){location.reload()}else{throw 0}})'
    + '.catch(function(){g.disabled=false;g.textContent="✍️ חתימה ואישור";er.textContent="השליחה לא עברה. בדוק את החיבור לאינטרנט ונסה שוב."})};})();';
  return shell('הצעת מחיר לחתימה', doc
    + '<div class="card"><label for="nm">שם מלא</label><input type="text" id="nm" autocomplete="name">'
    + '<label>חתימה <small>(עם האצבע, בתוך המסגרת)</small></label><div class="pad"><canvas id="cv"></canvas><div class="ph" id="ph">✍️ חותמים כאן</div></div>'
    + '<button type="button" class="redo" id="clr">🔄 למחוק ולחתום מחדש</button>'
    + '<label class="agree"><input type="checkbox" id="ag"><span>קראתי את ההצעה ואת התנאים שבה, ואני מאשר אותה.</span></label>'
    + '<button type="button" class="go" id="go">✍️ חתימה ואישור</button><div class="err" id="err"></div></div><script>' + js + '</script>');
}

// The customer's page asks for a signing link. state: lib/plan-io.js stateOf(tenant).
function create(DATA, tenant, body, state, now) {
  const q = clean(body && body.q);
  if (!q) return { ok: false, why: 'bad' };
  const month = P.monthOf(now), lim = limitFor(state), n = used(DATA, tenant, month);
  if (n >= lim) return { ok: false, why: 'limit', limit: lim };
  const tok = crypto.randomBytes(12).toString('hex');
  wj(path.join(root(DATA), tok + '.json'), { tenant, at: new Date(now == null ? Date.now() : now).toISOString(), month, q, biz: cleanBiz(body.biz), logo: cleanLogo(body.logo), state: {} });
  wj(countFile(DATA, tenant, month), { n: n + 1 });
  return { ok: true, tok, link: 'https://form.it-solution.co.il/c/' + tok, left: lim === Infinity ? -1 : lim - n - 1 };
}

function servePage(DATA, tok, sub, s) {
  tok = safeTok(tok); const rec = tok && rj(path.join(root(DATA), tok + '.json'), null);
  if (!rec) { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('הקישור לא נמצא'); }
  if (sub === 'signed') {
    const f = path.join(root(DATA), tok + '.signed.pdf');
    if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="signed-quote.pdf"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(f).pipe(s);
  }
  s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
  s.end(page(rec, tok, sub === 'view'));
}

/*
  The client opens (once reported) and signs. tell(tenant, text) writes a message into the customer's own monitor.
  render(htmlFile, pdfFile, cb) makes the PDF; Chrome by default, a stub in the tests.
*/
function chromePdf(htmlFile, pdfFile, cb) {
  execFile('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=6000', '--print-to-pdf=' + pdfFile, 'file://' + htmlFile], { timeout: 90000 }, (e) => cb(e));
}
function handlePost(DATA, b, ip, ua, tell, render) {
  const tok = safeTok(b && b.token); const f = tok && path.join(root(DATA), tok + '.json');
  const rec = f && rj(f, null);
  if (!rec) return { status: 404, body: { ok: false } };
  const st = rec.state || (rec.state = {});
  const now = new Date().toISOString();
  if (b.open) {
    st.opens = (st.opens || 0) + 1; st.lastOpenAt = now;
    const first = !st.openedAt && !st.signedAt;
    if (first) st.openedAt = now;
    wj(f, rec);
    if (first) tell(rec.tenant, '👀 ' + rec.q.client + ' פתח את הצעת המחיר ' + rec.q.no + ' לחתימה.');
    return { status: 200, body: { ok: true } };
  }
  if (st.signedAt) return { status: 200, body: { ok: true } };
  const sig = String(b.sig || ''), name = str(b.name, 80);
  if (name.length < 2 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 400000) return { status: 400, body: { ok: false } };
  const docHash = crypto.createHash('sha256').update(docHtml(rec)).digest('hex');
  Object.assign(st, { signedAt: now, name, ip: String(ip || '').slice(0, 60), ua: String(ua || '').slice(0, 300), sig, docHash });
  wj(f, rec);
  const html = path.join(root(DATA), tok + '.signed.html'), pdf = path.join(root(DATA), tok + '.signed.pdf');
  fs.writeFileSync(html, shell('הצעת מחיר חתומה', '<div class="doc">' + docHtml(rec).slice('<div class="doc">'.length, -'</div>'.length) + signedBlock(rec) + '</div>'));
  (render || chromePdf)(html, pdf, (e) => {
    tell(rec.tenant, '🎉 ' + rec.q.client + ' חתם על הצעת המחיר ' + rec.q.no + '.' + '\n'
      + (e ? 'העותק החתום עוד לא הופק, ננסה שוב.' : 'העותק החתום: https://form.it-solution.co.il/c/' + tok + '/signed'));
  });
  return { status: 200, body: { ok: true } };
}

module.exports = { FREE, ADD, limitFor, used, left, clean, create, docHtml, servePage, handlePost, safeTok };
