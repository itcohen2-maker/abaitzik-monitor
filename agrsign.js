'use strict';
/*
  8.11.2026, Itzik: "יש לי לקוח חדש ... ד״ר פבלו שולמן. אני צריך לשלוח לו מסמך סודיות למרפאה ולמטופלים ...
  בחתימה הוא צריך לאשר גם את ההסכם וגם את טופס סודיות. טופס אבטחה גם צריך להכלל בהסכם בינינו".
  One page per client: the service agreement with its security annex, and the clinic NDA. One signature,
  two separate approvals. IT Solution signs once (owner link), and that signature goes on every signed copy.

  /a/<clientTok>          the client page (an open is counted only by the page script, not by a WhatsApp preview)
  /a/<clientTok>/view     Itzik's look from the monitor: no open report, nothing can be sent
  /a/<clientTok>/signed   the signed PDF
  /a/<ownerTok>           Itzik: the IT Solution name, role and the one signature
  POST /api/agr           { tok, open } | { tok, name, role, sig } (owner) | { tok, name, biz, idno, addr, role, sig, agA, agB }

  data/agrsign/def.json             { ownerTok }
  data/agrsign/owner.json           { name, role, sig, at }
  data/agrsign/c/<tok>.def.json     { client, biz, title, out, docs: ["contract","annex","clinic"] }
  data/agrsign/c/<tok>.json         { opens, openedAt, lastOpenAt, signedAt, f:{...}, sig, ip, ua, hashes }
  data/agrsign/c/<tok>.signed.pdf   also copied to data/files-private/<def.out>
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ROOT = path.join(__dirname, 'data', 'agrsign');
const CDIR = path.join(ROOT, 'c');
const PRIV = path.join(__dirname, 'data', 'files-private');
const BASE = 'https://form.it-solution.co.il/a/';

const DOCS = {
  contract: { file: 'contract-1.0.html', label: 'הסכם השירות, גרסה 1.0' },
  annex: { file: 'security-annex-1.0.html', label: 'נספח א: אבטחת המידע' },
  clinic: { file: 'clinic-nda-1.0.html', label: 'הסכם סודיות: המרפאה והמטופלים' },
};
function legal(k) { try { return fs.readFileSync(path.join(__dirname, 'legal', DOCS[k].file), 'utf8'); } catch (e) { return ''; } }
function hash(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); }
function ilTime(iso) { return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function mainDef() { return readJson(path.join(ROOT, 'def.json'), {}); }
function owner() { return readJson(path.join(ROOT, 'owner.json'), null); }
function cdef(tok) { return readJson(path.join(CDIR, tok + '.def.json'), null); }
function cstate(tok) { return readJson(path.join(CDIR, tok + '.json'), {}); }
function clients() {
  try { return fs.readdirSync(CDIR).filter((f) => /^[a-f0-9]{16,40}\.def\.json$/.test(f)).map((f) => f.slice(0, -9)); } catch (e) { return []; }
}

const CTR_CSS = '.ctr{font:400 14.5px/1.7 Heebo;color:#24364b}.ctr h2{font:900 19px Heebo;color:#0f1b2a;margin:0 0 2px}.ctr .cv{font:500 12.5px Heebo;color:#6b7c90;margin:0 0 10px}'
  + '.ctr h3{font:800 15.5px Heebo;color:#0f1b2a;margin:16px 0 6px}.ctr ol{margin:0;padding:0 20px 0 0}.ctr li{margin-bottom:5px}.ctr p{margin:0 0 8px}.ctr b{color:#0f1b2a}';
const CSS = '*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#0f1b2a;font-family:Heebo,sans-serif}'
  + '.top{background:linear-gradient(135deg,#0a0a0f,#123a5a 60%,#0e7490);color:#fff;padding:16px 18px}'
  + '.brand{display:flex;align-items:center;gap:9px;direction:ltr;justify-content:flex-end}.brand span{width:34px;height:34px;border-radius:10px;background:#06b6d4;color:#0f1b2a;display:flex;align-items:center;justify-content:center;font:900 14px Heebo}.brand b{font:800 21px Heebo}'
  + '.wrap{max-width:680px;margin:0 auto;padding:18px 16px 48px}'
  + '.intro{background:#fff;border-radius:20px;padding:20px 18px;box-shadow:0 2px 12px rgba(15,27,42,.06)}.intro .to{font:500 15px Heebo;color:#4a5a6e;margin:0 0 6px}.intro .to b{color:#0f1b2a}'
  + 'h1{font:900 25px/1.25 Heebo;margin:0 0 8px}.intro p.big{font:500 17px/1.65 Heebo;margin:0}'
  + '.sec{font:900 19px Heebo;margin:24px 0 10px;display:flex;align-items:center;gap:8px}.sec i{font-style:normal;display:inline-flex;width:30px;height:30px;border-radius:50%;background:#0f1b2a;color:#fff;align-items:center;justify-content:center;font:800 15px Heebo}'
  + 'details.doc{background:#fff;border:2px solid #e2e8f0;border-radius:18px;margin:0 0 12px;overflow:hidden}details.doc[open]{border-color:#06b6d4}'
  + 'details.doc summary{list-style:none;cursor:pointer;padding:15px 16px;font:800 17px Heebo;display:flex;justify-content:space-between;align-items:center;gap:10px}details.doc summary::-webkit-details-marker{display:none}'
  + 'details.doc summary small{display:block;font:500 13.5px Heebo;color:#4a5a6e;margin-top:2px}details.doc summary:after{content:"▾";color:#0e7490;font-size:20px;transition:transform .2s}details.doc[open] summary:after{transform:rotate(180deg)}'
  + 'details.doc .in{padding:4px 16px 16px;border-top:1px solid #e2e8f0}details.doc .in hr{border:0;border-top:2px dashed #cbd5e1;margin:18px 0}'
  + 'label{display:block;font:700 14.5px Heebo;margin:12px 0 5px}label small{font-weight:400;color:#6b7c90}'
  + 'input[type=text]{width:100%;font:500 17px Heebo;padding:12px 14px;border:2px solid #e2e8f0;border-radius:14px;background:#fff;color:#0f1b2a}input[type=text]:focus{outline:none;border-color:#06b6d4}'
  + '.pad{background:#fff;border:2px dashed #94a3b8;border-radius:16px;position:relative;touch-action:none}.pad canvas{display:block;width:100%;height:190px;touch-action:none}'
  + '.pad .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 16px Heebo;color:#94a3b8;pointer-events:none}'
  + '.redo{display:block;width:100%;margin-top:8px;background:#fff;border:2px solid #0e7490;color:#0e7490;border-radius:14px;padding:11px;font:800 15.5px Heebo;cursor:pointer}'
  + '.agree{display:flex;gap:10px;align-items:flex-start;background:#fff;border:2px solid #e2e8f0;border-radius:14px;padding:13px 14px;margin-top:12px;font:500 15px/1.5 Heebo;cursor:pointer}.agree input{width:24px;height:24px;flex:none;margin-top:1px;accent-color:#06b6d4}.agree b{color:#0f1b2a}'
  + '.go{display:block;width:100%;margin-top:16px;background:#06b6d4;color:#0f1b2a;border:0;border-radius:16px;padding:17px;font:900 19px Heebo;cursor:pointer}.go:disabled{background:#cbd5e1;color:#6b7c90}'
  + '.err{color:#b91c1c;font:700 14.5px Heebo;margin-top:10px;min-height:1em}'
  + '.done{background:#fff;border-radius:20px;padding:26px 18px;text-align:center;margin-top:10px}.done .big{font-size:52px}.done h2{font:900 23px Heebo;margin:6px 0}.done p{font:400 15.5px/1.6 Heebo;color:#24364b}'
  + '.dl{display:block;margin-top:14px;background:#0f1b2a;color:#fff;border-radius:14px;padding:14px;font:800 16px Heebo;text-decoration:none;text-align:center}' + CTR_CSS;

function head(title) {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>' + esc(title) + ' | IT Solution</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet">'
    + '<style>' + CSS + '</style></head><body><div class="top"><div class="brand"><span>IT</span><b>IT Solution</b></div></div><div class="wrap">';
}
const PAD_JS = 'var $=function(i){return document.getElementById(i)};var cv=$("cv"),cx=cv.getContext("2d"),dn=false,inked=false,fw=-1;'
  + 'function fit(force){var r=cv.getBoundingClientRect(),k=window.devicePixelRatio||1;if(!force&&Math.round(r.width)===fw)return;fw=Math.round(r.width);var img=inked?cv.toDataURL():null;cv.width=r.width*k;cv.height=r.height*k;cx.setTransform(k,0,0,k,0,0);cx.lineWidth=2.7;cx.lineCap="round";cx.lineJoin="round";cx.strokeStyle="#0f1b5a";if(img){var im=new Image();im.onload=function(){cx.drawImage(im,0,0,r.width,r.height)};im.src=img}}'
  + 'fit();window.addEventListener("resize",function(){fit()});function pt(e){var r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}'
  + 'cv.addEventListener("pointerdown",function(e){dn=true;cv.setPointerCapture(e.pointerId);var p=pt(e);cx.beginPath();cx.moveTo(p[0],p[1]);cx.lineTo(p[0]+.1,p[1]+.1);cx.stroke();inked=true;$("ph").style.display="none";e.preventDefault()});'
  + 'cv.addEventListener("pointermove",function(e){if(!dn)return;var p=pt(e);cx.lineTo(p[0],p[1]);cx.stroke();e.preventDefault()});'
  + 'cv.addEventListener("pointerup",function(){dn=false});cv.addEventListener("pointercancel",function(){dn=false});'
  + '$("clr").onclick=function(){cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);fit(true);inked=false;$("ph").style.display="flex"};'
  + 'function post(o){return fetch("/api/agr",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)}).then(function(r){return r.json()})}';
function pad() { return '<label>חתימה <small>(עם האצבע, בתוך המסגרת)</small></label><div class="pad"><canvas id="cv"></canvas><div class="ph" id="ph">✍️ חותמים כאן</div></div><button type="button" class="redo" id="clr">🔄 למחוק את החתימה ולחתום מחדש</button>'; }
function field(id, label, extra) { return '<label for="' + id + '">' + label + '</label><input type="text" id="' + id + '" maxlength="80"' + (extra || '') + '>'; }

function docsBlock(d) {
  const ks = d.docs || ['contract', 'annex', 'clinic'];
  const agr = ks.filter((k) => k !== 'clinic'), nda = ks.filter((k) => k === 'clinic');
  let h = '';
  if (agr.length) {
    h += '<details class="doc" id="dA"><summary><span>📜 הסכם בינינו<small>הסכם השירות ונספח אבטחת המידע · לחיצה פותחת</small></span></summary><div class="in">'
      + agr.map(legal).join('<hr>') + '</div></details>';
  }
  if (nda.length) {
    h += '<details class="doc" id="dB"><summary><span>🔒 טופס סודיות למרפאה ולמטופלים<small>שמירה על המידע הרפואי · לחיצה פותחת</small></span></summary><div class="in">'
      + legal('clinic') + '</div></details>';
  }
  return h;
}

function clientPage(tok, d, s, view) {
  let h = head(d.title);
  if (s.signedAt && !view) {
    return h + '<div class="done"><div class="big">✅</div><h2>נחתם, תודה!</h2><p>' + esc(d.title) + '</p><p>נחתם ב ' + esc(ilTime(s.signedAt)) + '</p>'
      + '<a class="dl" href="/a/' + tok + '/signed" target="_blank">📄 העותק החתום (PDF)</a></div></div></body></html>';
  }
  if (!view && !(owner() && owner().sig)) {
    return h + '<div class="done"><div class="big">⏳</div><h2>המסמך עוד לא מוכן</h2><p>נשלח אליך קישור מעודכן בהקדם.</p></div></div></body></html>';
  }
  h += '<div class="intro"><p class="to">לכבוד: <b>' + esc(d.client) + '</b>' + (d.biz ? ', ' + esc(d.biz) : '') + '</p>'
    + '<h1>' + esc(d.title) + '</h1><p class="big">' + esc(d.intro || 'שני מסמכים, חתימה אחת. פותחים כל מסמך וקוראים, ממלאים את הפרטים, חותמים עם האצבע ומאשרים את שניהם. העותק החתום מגיע מיד.') + '</p></div>'
    + '<div class="sec"><i>1</i>קוראים את המסמכים</div>' + docsBlock(d)
    + '<div class="sec"><i>2</i>פרטים וחתימה</div>'
    + field('nm', 'שם מלא', ' autocomplete="name"') + field('bz', 'שם המרפאה', ' autocomplete="organization" value="' + esc(d.bizDefault || '') + '"')
    + field('idn', 'מספר עוסק, ח.פ. או ת.ז.', ' inputmode="numeric"') + field('ad', 'כתובת המרפאה', ' autocomplete="street-address"') + field('rl', 'תפקיד', ' value="' + esc(d.roleDefault || '') + '"')
    + pad()
    + '<label class="agree"><input type="checkbox" id="agA"><span>קראתי את <b>הסכם בינינו</b>: הסכם השירות (גרסה 1.0) ונספח אבטחת המידע, ואני מאשר אותם בשם המרפאה.</span></label>'
    + '<label class="agree"><input type="checkbox" id="agB"><span>קראתי את <b>טופס הסודיות למרפאה ולמטופלים</b>, ואני מאשר אותו בשם המרפאה.</span></label>'
    + '<button type="button" class="go" id="go">✍️ חתימה ואישור של שני המסמכים</button><div class="err" id="err"></div>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ';' + PAD_JS
    + (view ? '$("go").disabled=true;$("go").textContent="תצוגה בלבד, כך הלקוח רואה את הדף";'
      : 'try{if(!sessionStorage.getItem("agrOpen"+T)){sessionStorage.setItem("agrOpen"+T,"1");post({tok:T,open:true}).catch(function(){})}}catch(x){post({tok:T,open:true}).catch(function(){})}')
    + '$("go").onclick=function(){var er=$("err"),v=function(i){return $(i).value.trim()};'
    + 'if(v("nm").length<2){er.textContent="צריך למלא שם מלא";$("nm").focus();return}'
    + 'if(v("bz").length<2){er.textContent="צריך למלא את שם המרפאה";$("bz").focus();return}'
    + 'if(!inked){er.textContent="צריך לחתום עם האצבע בתוך המסגרת";return}'
    + 'if(!$("agA").checked){er.textContent="צריך לאשר את הסכם בינינו";return}'
    + 'if(!$("agB").checked){er.textContent="צריך לאשר את טופס הסודיות";return}'
    + 'er.textContent="";var g=$("go");g.disabled=true;g.textContent="שולח...";'
    + 'post({tok:T,name:v("nm"),biz:v("bz"),idno:v("idn"),addr:v("ad"),role:v("rl"),agA:true,agB:true,sig:cv.toDataURL("image/png")})'
    + '.then(function(j){if(j.ok){location.reload()}else{throw 0}})'
    + '.catch(function(){g.disabled=false;g.textContent="✍️ חתימה ואישור של שני המסמכים";er.textContent="השליחה לא עברה. בדוק את החיבור לאינטרנט ונסה שוב."})};'
    + '})();</script>';
  return h + '</div></body></html>';
}

function ownerPage(tok) {
  // 8.11, Itzik: the signer's name and role are filled in for him (def.json ownerName, ownerRole); he can change them.
  const m = mainDef(), o = Object.assign({ name: m.ownerName || '', role: m.ownerRole || '' }, owner() || {});
  let h = head('חתימה בשם IT Solution');
  h += '<div class="intro"><h1>חתימה בשם IT Solution</h1><p class="big">פעם אחת. החתימה הזו נכנסת לכל הסכם שלקוח חותם עליו בדף הזה.' + (o.sig ? ' כבר חתמת ב ' + esc(ilTime(o.at)) + ', אפשר לחתום מחדש.' : '') + '</p></div>'
    + field('nm', 'שם החותם בשם IT Solution', ' value="' + esc(o.name || '') + '"') + field('rl', 'תפקיד', ' value="' + esc(o.role || '') + '"')
    + pad() + '<button type="button" class="go" id="go">✍️ שמירת החתימה</button><div class="err" id="err"></div>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ';' + PAD_JS
    + '$("go").onclick=function(){var er=$("err"),nm=$("nm").value.trim();if(nm.length<2){er.textContent="צריך למלא שם";return}if(!inked){er.textContent="צריך לחתום";return}'
    + 'var g=$("go");g.disabled=true;post({tok:T,name:nm,role:$("rl").value.trim(),sig:cv.toDataURL("image/png")}).then(function(j){if(!j.ok)throw 0;document.querySelector(".wrap").innerHTML="<div class=done><div class=big>✅</div><h2>החתימה נשמרה</h2><p>אפשר לשלוח ללקוח את הקישור מהמוניטור.</p></div>"})'
    + '.catch(function(){g.disabled=false;er.textContent="השמירה לא עברה, נסה שוב."})};})();</script>';
  return h + '</div></body></html>';
}

function serve(tok, sub, s) {
  tok = safeTok(tok);
  const nf = () => { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); s.end('הקישור לא נמצא'); };
  if (!tok) return nf();
  const html = (b) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); s.end(b); };
  if (tok === mainDef().ownerTok && !sub) return html(ownerPage(tok));
  const d = cdef(tok); if (!d) return nf();
  if (sub === 'signed') {
    const f = path.join(CDIR, tok + '.signed.pdf');
    if (!fs.existsSync(f)) return nf();
    s.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="it-solution-signed.pdf"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(f).pipe(s);
  }
  return html(clientPage(tok, d, sub === 'view' ? {} : cstate(tok), sub === 'view'));
}

function sigBlock(title, o, st) {
  const cell = (k, v) => '<div style="border-bottom:1.5px solid #94a3b8;padding:0 0 1.5mm"><div style="font:500 10.5px Heebo;color:#6b7c90">' + k + '</div><div style="font:700 13px Heebo;min-height:5mm">' + esc(v) + '</div></div>';
  const img = (src) => '<div style="border-bottom:1.5px solid #94a3b8;padding:0 0 1mm"><div style="font:500 10.5px Heebo;color:#6b7c90">חתימה</div>' + (src ? '<img src="' + src + '" style="display:block;height:15mm;max-width:100%;object-fit:contain">' : '<div style="height:15mm"></div>') + '</div>';
  const f = st.f || {};
  return '<div style="page-break-inside:avoid;margin-top:8mm;border-top:2px solid #0f1b2a;padding-top:4mm"><div style="font:900 15px Heebo;margin-bottom:3mm">ולראיה באו הצדדים על החתום: ' + esc(title) + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8mm">'
    + '<div><div style="font:800 13px Heebo;margin-bottom:2mm">' + esc(f.biz || '') + '</div><div style="display:grid;gap:2.5mm">' + cell('שם החותם', f.name) + cell('תפקיד', f.role || '') + cell('מספר עוסק, ח.פ. או ת.ז.', f.idno || '') + cell('כתובת', f.addr || '') + cell('תאריך ושעה', ilTime(st.signedAt)) + img(st.sig) + '</div></div>'
    + '<div><div style="font:800 13px Heebo;margin-bottom:2mm">IT Solution, ע.מ. 028445518</div><div style="display:grid;gap:2.5mm">' + cell('שם החותם', (o && o.name) || '') + cell('תפקיד', (o && o.role) || '') + cell('תאריך', ilTime(st.signedAt)) + img(o && o.sig) + '</div></div>'
    + '</div></div>';
}

function renderSigned(tok, d, st, cb) {
  const o = owner();
  const ver = (k) => '<p style="font:400 9.5px/1.4 Heebo;color:#6b7c90;margin:2mm 0 0">נחתם דיגיטלית באתר form.it-solution.co.il · ' + esc(ilTime(st.signedAt)) + ' · כתובת IP ' + esc(st.ip) + ' · מזהה מסמך ' + esc(String(st.hashes[k] || '').slice(0, 16)) + '</p>';
  const part = (k) => '<div style="page-break-before:always;padding:12mm 14mm">' + legal(k) + '</div>';
  const ks = d.docs || ['contract', 'annex', 'clinic'];
  let body = '<div style="padding:12mm 14mm"><div style="font:900 22px Heebo">IT Solution</div><div style="font:800 18px Heebo;margin:3mm 0">' + esc(d.title) + '</div>'
    + '<p style="font:500 13.5px/1.7 Heebo">' + esc(st.f.biz) + ', על ידי ' + esc(st.f.name) + (st.f.role ? ', ' + esc(st.f.role) : '') + ', חתם ואישר בנפרד את שני המסמכים:</p><ol style="font:500 13.5px/1.8 Heebo">'
    + '<li>הסכם בינינו: הסכם השירות גרסה 1.0, ונספח א אבטחת המידע ✓</li><li>הסכם סודיות: המרפאה והמטופלים, גרסה 1.0 ✓</li></ol>' + sigBlock('שני המסמכים', o, st) + ver('all') + '</div>';
  ks.filter((k) => k !== 'clinic').forEach((k) => { body += part(k); });
  body += '<div style="padding:0 14mm">' + sigBlock('הסכם בינינו', o, st) + ver('contract') + '</div>';
  if (ks.includes('clinic')) body += part('clinic') + '<div style="padding:0 14mm">' + sigBlock('הסכם הסודיות', o, st) + ver('clinic') + '</div>';
  const html = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet">'
    + '<style>@page{size:A4;margin:0}body{margin:0;font-family:Heebo;color:#0f1b2a}' + CTR_CSS + '</style></head><body>' + body + '</body></html>';
  const tmp = path.join(CDIR, tok + '.signed.html'); fs.writeFileSync(tmp, html);
  const out = path.join(CDIR, tok + '.signed.pdf');
  execFile('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=6000', '--print-to-pdf=' + out, 'file://' + tmp], { timeout: 90000 }, (e) => {
    if (!e && fs.existsSync(out) && d.out) { try { fs.copyFileSync(out, path.join(PRIV, d.out)); } catch (x) {} }
    cb(e);
  });
}

const okSig = (sig) => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 400000;
const cut = (v, n) => String(v || '').trim().slice(0, n);

function handlePost(b, notify, ip, ua, done) {
  const tok = safeTok(b && b.tok); const now = new Date().toISOString();
  if (!tok) return done({ status: 404, body: { ok: false } });
  if (tok === mainDef().ownerTok) {
    const sig = String(b.sig || '');
    if (cut(b.name, 80).length < 2 || !okSig(sig)) return done({ status: 400, body: { ok: false } });
    writeJson(path.join(ROOT, 'owner.json'), { name: cut(b.name, 80), role: cut(b.role, 80), sig, at: now });
    return done({ status: 200, body: { ok: true } });
  }
  const d = cdef(tok); if (!d) return done({ status: 404, body: { ok: false } });
  const s = cstate(tok);
  if (b.open) {
    s.opens = (s.opens || 0) + 1; s.lastOpenAt = now;
    const first = !s.openedAt && !s.signedAt; if (first) s.openedAt = now;
    writeJson(path.join(CDIR, tok + '.json'), s);
    if (first) notify('חתימה על הסכם', d.client + ' פתח את דף החתימה על ההסכם וטופס הסודיות.');
    return done({ status: 200, body: { ok: true } });
  }
  if (s.signedAt) return done({ status: 200, body: { ok: true } });
  if (!(owner() && owner().sig)) return done({ status: 409, body: { ok: false } });
  const sig = String(b.sig || '');
  if (cut(b.name, 80).length < 2 || cut(b.biz, 80).length < 2 || b.agA !== true || b.agB !== true || !okSig(sig)) return done({ status: 400, body: { ok: false } });
  const all = (d.docs || ['contract', 'annex', 'clinic']).map(legal);
  Object.assign(s, {
    signedAt: now, f: { name: cut(b.name, 80), biz: cut(b.biz, 80), idno: cut(b.idno, 20), addr: cut(b.addr, 120), role: cut(b.role, 60) },
    agA: true, agB: true, sig, ip: String(ip || ''), ua: String(ua || '').slice(0, 300),
    hashes: { contract: hash(legal('contract') + legal('annex')), clinic: hash(legal('clinic')), all: hash(all.join('')) },
  });
  writeJson(path.join(CDIR, tok + '.json'), s);
  done({ status: 200, body: { ok: true } });
  renderSigned(tok, d, s, (e) => {
    notify('חתימה על הסכם', '🎉 ' + d.client + ' חתם על הסכם בינינו ועל טופס הסודיות!\n'
      + s.f.name + ', ' + s.f.biz + (s.f.idno ? ', ' + s.f.idno : '') + '\n'
      + (e ? 'ה PDF החתום לא הופק: ' + e.message : 'ה PDF החתום נמצא במוניטור: 💼 העסק שלי ← ' + d.client));
  });
}

// For the monitor (build.js payload.agr): one entry per client, and the owner link.
function state() {
  const m = mainDef(); if (!m.ownerTok) return null;
  const o = owner();
  return {
    owner: !!(o && o.sig), ownerAt: o && o.at, own: BASE + m.ownerTok,
    clients: clients().map((t) => {
      const d = cdef(t), s = cstate(t);
      return { tok: t, client: d.client, biz: d.biz || '', tab: d.tab || '', link: BASE + t, view: BASE + t + '/view',
        // 8.11: the client's setup page (connections and files), sent only after he signed.
        setup: d.setupTok ? 'https://form.it-solution.co.il/s/' + d.setupTok : '', monitor: d.monitorUrl || '',
        opens: s.opens || 0, openedAt: s.openedAt || '', signedAt: s.signedAt || '', file: s.signedAt ? d.out : '', signer: s.f ? s.f.name : '' };
    }),
  };
}

module.exports = { serve, handlePost, state };
