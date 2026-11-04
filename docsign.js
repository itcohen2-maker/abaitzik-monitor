'use strict';
/*
  4.11.2026: sign an existing document (a bank form) on the phone, "חתימה על מסמך".
  Every signer gets his own link https://form.it-solution.co.il/d/<signer token>.
  He reads the pages, the date and time are filled for him, he signs with his finger.
  When the last signer signs, the final PDF is printed with Chrome: the original pages
  as images, with date, time and signature placed in each signer's row.

  data/docsign/<doc>/def.json   { title, sub, out, w, h, pages: [png], signers: [ { id, tok, name, page, y0, y1, sign:[x0,x1], time:[x0,x1], date:[x0,x1] } ] }  (points, from top left)
  data/docsign/<doc>/state.json { <signer id>: { date, time, sig, signedAt, ip, ua } , doneAt }
  data/docsign/<doc>/signed.pdf and data/files-private/<def.out>
*/
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ROOT = path.join(__dirname, 'data', 'docsign');
const PRIV = path.join(__dirname, 'data', 'files-private');

function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function find(tok) {
  tok = safeTok(tok); if (!tok) return null;
  let dirs = []; try { dirs = fs.readdirSync(ROOT); } catch (e) { return null; }
  for (const d of dirs) {
    const dir = path.join(ROOT, d), def = readJson(path.join(dir, 'def.json'), null);
    if (!def || !def.signers) continue;
    const me = def.signers.find((x) => x.tok === tok);
    if (me) return { dir, def, me, st: readJson(path.join(dir, 'state.json'), {}) };
  }
  return null;
}
function saveState(dir, st) { const f = path.join(dir, 'state.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(st, null, 1)); fs.renameSync(f + '.tmp', f); }
function nowIL() {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { date: p.day + '/' + p.month + '/' + p.year, time: p.hour + ':' + p.minute };
}

const CSS = '*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#0f1b2a;font-family:Heebo,sans-serif}'
  + '.wrap{max-width:640px;margin:0 auto;padding:18px 16px 48px}'
  + 'h1{font:900 23px/1.25 Heebo;margin:4px 0 6px}.sub{font:400 15px/1.6 Heebo;color:#24364b;margin:0 0 6px}'
  + '.step{font:800 17px Heebo;margin:22px 0 10px}.step i{font-style:normal;display:inline-flex;width:28px;height:28px;border-radius:50%;background:#0f1b2a;color:#fff;align-items:center;justify-content:center;font:800 14px Heebo;margin-left:8px}'
  + '.pg{position:relative;background:#fff;border-radius:10px;overflow:hidden;margin:0 0 10px;box-shadow:0 1px 4px #0f1b2a22}.pg img{display:block;width:100%}'
  + '.hl{position:absolute;border:3px solid #06b6d4;background:#06b6d433;border-radius:4px;animation:bl 1.4s ease-in-out infinite}@keyframes bl{50%{background:#06b6d466}}'
  + '.jump{display:block;width:100%;background:#fff;border:2px solid #0f1b2a;border-radius:14px;padding:12px;font:800 15.5px Heebo;color:#0f1b2a;margin:0 0 12px;cursor:pointer}'
  + '.row{display:flex;gap:10px}.row>div{flex:1}'
  + 'label{display:block;font:700 14.5px Heebo;margin:12px 0 5px}'
  + 'input[type=text]{width:100%;font:500 18px Heebo;padding:12px 14px;border:2px solid #e2e8f0;border-radius:14px;background:#fff;color:#0f1b2a;direction:ltr;text-align:center}input[type=text]:focus{outline:none;border-color:#06b6d4}'
  + '.pad{background:#fff;border:2px dashed #94a3b8;border-radius:16px;position:relative;touch-action:none}.pad canvas{display:block;width:100%;height:200px;touch-action:none}'
  + '.pad .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 17px Heebo;color:#94a3b8;pointer-events:none}'
  + '.clr{background:none;border:0;color:#0e7490;font:700 14.5px Heebo;padding:8px 0;cursor:pointer}'
  + '.go{display:block;width:100%;margin-top:16px;background:#06b6d4;color:#0f1b2a;border:0;border-radius:16px;padding:17px;font:900 19px Heebo;cursor:pointer}.go:disabled{background:#cbd5e1;color:#6b7c90}'
  + '.err{color:#b91c1c;font:700 14.5px Heebo;margin-top:10px;min-height:1em}'
  + '.done{background:#fff;border-radius:20px;padding:24px 18px;text-align:center;margin-top:10px}.done .big{font-size:50px}.done h2{font:900 22px Heebo;margin:6px 0}.done p{font:400 15.5px/1.6 Heebo;color:#24364b;margin:6px 0}'
  + '.done img{max-width:70%;max-height:90px;margin:8px auto;display:block}.dl{display:block;margin-top:14px;background:#0f1b2a;color:#fff;border-radius:14px;padding:14px;font:800 16px Heebo;text-decoration:none}';

function pct(v, of) { return (100 * v / of).toFixed(3) + '%'; }

function page(f) {
  const { def, me, st } = f, mine = st[me.id], all = def.signers.every((x) => st[x.id]);
  let h = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>חתימה על מסמך</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet"><style>' + CSS + '</style></head><body><div class="wrap">'
    + '<h1>' + esc(def.title) + '</h1><p class="sub">' + esc(def.sub || '') + '</p>'
    + '<p class="sub">חותם: <b>' + esc(me.name) + '</b></p>';
  if (mine) {
    h += '<div class="done"><div class="big">✅</div><h2>חתמת, תודה</h2><p>' + esc(mine.date) + ' בשעה ' + esc(mine.time) + '</p><img src="' + mine.sig + '" alt="">'
      + (all ? '<p>כל החתימות התקבלו, המסמך החתום מוכן.</p><a class="dl" href="/d/' + me.tok + '/signed">📄 המסמך החתום</a>'
        : '<p>מחכים לחתימה של ' + esc(def.signers.filter((x) => !st[x.id]).map((x) => x.name).join(', ')) + '.</p>')
      + (all ? '' : '<button class="clr" id="again">🔄 למחוק את החתימה שלי ולחתום מחדש</button>')
      + '</div><script>var a=document.getElementById("again");if(a)a.onclick=function(){fetch("/api/docsign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tok:"' + me.tok + '",undo:true})}).then(function(){location.reload()})}</script></div></body></html>';
    return h;
  }
  const n = nowIL();
  h += '<button class="jump" id="jump">⬇️ ישר לחתימה</button>'
    + '<div class="step"><i>1</i>קוראים את המסמך</div><p class="sub">המקום של החתימה שלך מסומן בתכלת, בעמוד ' + me.page + '.</p>';
  def.pages.forEach((p, i) => {
    h += '<div class="pg"><img src="/d/' + me.tok + '/' + esc(p) + '" alt="עמוד ' + (i + 1) + '" loading="lazy">';
    if (i + 1 === me.page) h += '<div class="hl" style="right:' + pct(def.w - me.date[1], def.w) + ';left:' + pct(me.sign[0], def.w) + ';top:' + pct(me.y0, def.h) + ';height:' + pct(me.y1 - me.y0, def.h) + '"></div>';
    h += '</div>';
  });
  h += '<div class="step" id="sg"><i>2</i>תאריך, שעה וחתימה</div>'
    + '<div class="row"><div><label for="dt">תאריך</label><input type="text" id="dt" value="' + n.date + '" inputmode="numeric"></div>'
    + '<div><label for="tm">שעה</label><input type="text" id="tm" value="' + n.time + '" inputmode="numeric"></div></div>'
    + '<label>חתימה</label><div class="pad"><canvas id="cv"></canvas><div class="ph" id="ph">✍️ חותמים כאן עם האצבע</div></div>'
    + '<button class="clr" id="clr">🔄 למחוק ולחתום מחדש</button>'
    + '<button class="go" id="go">✍️ חתימה ושליחה</button><div class="err" id="err"></div>'
    + '<script>(function(){var T="' + me.tok + '",inked=false;function $(i){return document.getElementById(i)}'
    + '$("jump").onclick=function(){$("sg").scrollIntoView({behavior:"smooth"})};'
    + 'var cv=$("cv"),cx=cv.getContext("2d"),dn=false;'
    + 'var fw=-1;function fit(force){var r=cv.getBoundingClientRect(),k=window.devicePixelRatio||1;if(!force&&Math.round(r.width)===fw)return;fw=Math.round(r.width);var img=inked?cv.toDataURL():null;cv.width=r.width*k;cv.height=r.height*k;cx.setTransform(k,0,0,k,0,0);cx.lineWidth=2.8;cx.lineCap="round";cx.lineJoin="round";cx.strokeStyle="#0f1b5a";if(img){var im=new Image();im.onload=function(){cx.drawImage(im,0,0,r.width,r.height)};im.src=img}}'
    + 'fit();window.addEventListener("resize",fit);'
    + 'function pt(e){var r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}'
    + 'cv.addEventListener("pointerdown",function(e){dn=true;cv.setPointerCapture(e.pointerId);var p=pt(e);cx.beginPath();cx.moveTo(p[0],p[1]);cx.lineTo(p[0]+.1,p[1]+.1);cx.stroke();inked=true;$("ph").style.display="none";e.preventDefault()});'
    + 'cv.addEventListener("pointermove",function(e){if(!dn)return;var p=pt(e);cx.lineTo(p[0],p[1]);cx.stroke();e.preventDefault()});'
    + 'cv.addEventListener("pointerup",function(){dn=false});cv.addEventListener("pointercancel",function(){dn=false});'
    + '$("clr").onclick=function(){cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);fit(true);inked=false;$("ph").style.display="flex"};'
    + '$("go").onclick=function(){var er=$("err"),dt=$("dt").value.trim(),tm=$("tm").value.trim();'
    + 'if(dt.length<6){er.textContent="צריך למלא תאריך";return}if(tm.length<3){er.textContent="צריך למלא שעה";return}'
    + 'if(!inked){er.textContent="צריך לחתום עם האצבע בתוך המסגרת";return}'
    + 'er.textContent="";var g=$("go");g.disabled=true;g.textContent="שולח...";'
    + 'fetch("/api/docsign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tok:T,date:dt,time:tm,sig:cv.toDataURL("image/png")})})'
    + '.then(function(r){return r.json()}).then(function(j){if(j.ok){location.reload()}else{throw 0}})'
    + '.catch(function(){g.disabled=false;g.textContent="✍️ חתימה ושליחה";er.textContent="השליחה לא עברה. בדוק את החיבור לאינטרנט ונסה שוב."})};'
    + '})();</script>';
  return h + '</div></body></html>';
}

function render(f, cb) {
  const { dir, def, st } = f, W = def.w, H = def.h;
  let html = '<!doctype html><html dir="rtl"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500&display=swap" rel="stylesheet"><style>'
    + '@page{size:' + W + 'pt ' + H + 'pt;margin:0}*{margin:0;padding:0}body{font-family:Heebo,sans-serif}'
    + '.p{position:relative;width:' + W + 'pt;height:' + H + 'pt;overflow:hidden;page-break-after:always}.p:last-child{page-break-after:auto}.p>img{position:absolute;inset:0;width:100%;height:100%}'
    + '.c{position:absolute;display:flex;align-items:center;justify-content:center;font:500 10.5pt Heebo;color:#0f1b5a;direction:ltr}.c img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body>';
  def.pages.forEach((p, i) => {
    html += '<div class="p"><img src="file://' + path.join(dir, p) + '">';
    def.signers.filter((x) => x.page === i + 1 && st[x.id]).forEach((x) => {
      const s = st[x.id], box = (r, pad) => 'left:' + (r[0] + pad) + 'pt;width:' + (r[1] - r[0] - 2 * pad) + 'pt;top:' + (x.y0 + pad) + 'pt;height:' + (x.y1 - x.y0 - 2 * pad) + 'pt';
      html += '<div class="c" style="' + box(x.date, 2) + '">' + esc(s.date) + '</div>'
        + '<div class="c" style="' + box(x.time, 2) + '">' + esc(s.time) + '</div>'
        + '<div class="c" style="' + box(x.sign, 5) + '"><img src="' + s.sig + '"></div>';
    });
    html += '</div>';
  });
  html += '</body></html>';
  const tmp = path.join(dir, 'signed.html'), out = path.join(dir, 'signed.pdf');
  fs.writeFileSync(tmp, html);
  execFile('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--allow-file-access-from-files', '--virtual-time-budget=6000', '--print-to-pdf=' + out, 'file://' + tmp], { timeout: 90000 }, (e) => {
    if (!e && fs.existsSync(out) && def.out) { try { fs.copyFileSync(out, path.join(PRIV, def.out)); } catch (x) {} }
    cb(e);
  });
}

function serve(tok, sub, s) {
  const f = find(tok);
  if (!f) { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return s.end('הקישור לא נמצא'); }
  if (!sub) { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return s.end(page(f)); }
  if (sub === 'signed') {
    const out = path.join(f.dir, 'signed.pdf');
    if (!f.st.doneAt || !fs.existsSync(out)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="' + (f.def.out || 'signed.pdf') + '"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(out).pipe(s);
  }
  if (f.def.pages.indexOf(sub) > -1) {
    s.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' });
    return fs.createReadStream(path.join(f.dir, sub)).pipe(s);
  }
  s.writeHead(404); s.end();
}

function handlePost(b, notify, ip, ua, done) {
  const f = find(b && b.tok);
  if (!f) return done({ status: 404, body: { ok: false } });
  const { dir, def, me, st } = f;
  if (st.doneAt) return done({ status: 409, body: { ok: false } });
  if (b.undo) { delete st[me.id]; saveState(dir, st); return done({ status: 200, body: { ok: true } }); }
  const sig = String(b.sig || ''), date = String(b.date || '').trim().slice(0, 20), time = String(b.time || '').trim().slice(0, 10);
  if (date.length < 6 || time.length < 3 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 500000) return done({ status: 400, body: { ok: false } });
  st[me.id] = { date, time, sig, signedAt: new Date().toISOString(), ip: String(ip || ''), ua: String(ua || '').slice(0, 300) };
  const left = def.signers.filter((x) => !st[x.id]);
  if (left.length) {
    saveState(dir, st);
    const nx = left[0];
    notify('חתימה על מסמך', me.name + ' חתם על "' + def.title + '" (' + date + ', ' + time + ').\nעכשיו חסרה החתימה של ' + nx.name + '. הקישור שלו:\nhttps://form.it-solution.co.il/d/' + nx.tok);
    return done({ status: 200, body: { ok: true } });
  }
  st.doneAt = new Date().toISOString(); saveState(dir, st);
  render(f, (e) => {
    if (e) { delete st.doneAt; saveState(dir, st); notify('חתימה על מסמך', 'כולם חתמו על "' + def.title + '", אבל הפקת ה PDF נכשלה: ' + e.message); return done({ status: 200, body: { ok: true } }); }
    notify('חתימה על מסמך', 'כל החתימות התקבלו על "' + def.title + '". אחרון חתם ' + me.name + ' (' + date + ', ' + time + ').\nהמסמך החתום: files/' + def.out + '\nאפשר לשלוח אותו למאי בבנק.');
    done({ status: 200, body: { ok: true } });
  });
}

module.exports = { serve, handlePost, render, find };
