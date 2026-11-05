'use strict';
/*
  1.11.2026, Itzik: "בוא נבנה טופס, כמו שעשינו עם יואל, טופס אונליין, שברגע
  שהוא מסמן, אנחנו כבר יודעים מה התשובות", only multiple choice answers.

  A client intake form at https://form.it-solution.co.il/f/<token> (IT Solution
  only, no name of Itzik anywhere). Served by wa-bridge.js through Caddy.

  data/forms/<token>.def.json   the form: { client, title, hello, questions: [
                                  { id, q, multi?, max?, options: [...] } ] }
                                3.11: a question may be { id, q, text: true, rows?, hint? } (free text),
                                and the def may set thanks (the text after sending).
  data/forms/<token>.json       the answers, saved on every tap:
                                  { answers: {id: [..]}, openedAt, updatedAt, submittedAt, reported }

  Itzik hears about it in his monitor (the in topic, kind "טופס אפיון"):
  when the form is first opened, when it is sent, and, if the client stopped in
  the middle, the partial answers after 20 quiet minutes.
*/
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'data', 'forms');

function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }
function def(tok) { try { return JSON.parse(fs.readFileSync(path.join(DIR, tok + '.def.json'), 'utf8')); } catch (e) { return null; } }
function state(tok) { try { return JSON.parse(fs.readFileSync(path.join(DIR, tok + '.json'), 'utf8')); } catch (e) { return { answers: {} }; } }
function saveState(tok, s) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, tok + '.json.tmp'), JSON.stringify(s, null, 1)); fs.renameSync(path.join(DIR, tok + '.json.tmp'), path.join(DIR, tok + '.json')); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function summary(d, s, partial) {
  const NL = '\n';
  let t = (partial ? 'טופס אפיון, מילוי חלקי (נעצר באמצע): ' : 'טופס אפיון מולא ונשלח: ') + d.client + NL + NL;
  d.questions.forEach((q, i) => {
    const a = (s.answers || {})[q.id];
    t += (i + 1) + '. ' + q.q + NL + '   ' + (a && a.length ? a.join(', ') : 'לא ענה') + NL;
  });
  return t + NL + (d.ask || 'מה מזה כדאי להראות לו בהדגמה, ומה לשאול אותו בשיחה?');
}

function page(tok, d, s) {
  const qs = d.questions.map((q, i) => {
    const sel = (s.answers || {})[q.id] || [];
    return '<section class="q" data-id="' + esc(q.id) + '" data-multi="' + (q.multi ? 1 : 0) + '" data-max="' + (q.max || 0) + '">'
      + '<h2><span>' + (i + 1) + '</span>' + esc(q.q) + '</h2>'
      + (q.text ? (q.hint ? '<p class="hint">' + esc(q.hint) + '</p>' : '') + '<textarea class="tx" rows="' + (q.rows || 2) + '">' + esc(sel[0] || '') + '</textarea></section>'
      : (q.multi ? '<p class="hint">' + (q.max ? 'אפשר לסמן עד ' + q.max : 'אפשר לסמן כמה') + '</p>' : '')
      + '<div class="ops">' + q.options.map((o) => '<button type="button" class="op' + (sel.indexOf(o) > -1 ? ' on' : '') + '">' + esc(o) + '</button>').join('') + '</div></section>');
  }).join('');
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>' + esc(d.title) + ' | IT Solution</title>'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet">'
    + '<style>'
    + '*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#0f1b2a;font-family:Heebo,sans-serif}'
    + '.top{background:#0f1b2a;color:#fff;padding:18px 18px 16px;position:sticky;top:0;z-index:2}'
    + '.brand{display:flex;align-items:center;gap:9px;direction:ltr;justify-content:flex-end}.brand span{width:34px;height:34px;border-radius:10px;background:#06b6d4;color:#0f1b2a;display:flex;align-items:center;justify-content:center;font:900 14px Heebo}.brand b{font:800 21px Heebo}.brand b i{font-style:normal;color:#06b6d4}'
    + '.bar{height:6px;background:rgba(255,255,255,.15);border-radius:9px;margin-top:12px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:#06b6d4;transition:width .3s}'
    + '.cnt{font:500 12.5px Heebo;color:#cbd5e1;margin-top:6px}'
    + '.wrap{max-width:640px;margin:0 auto;padding:18px 16px 40px}'
    + 'h1{font:900 24px/1.25 Heebo;margin:4px 0 6px}.hello{font:400 15.5px/1.6 Heebo;color:#24364b;margin:0 0 18px}'
    + '.q{background:#fff;border-radius:18px;padding:16px;margin:0 0 12px;box-shadow:0 1px 6px rgba(15,27,42,.06)}'
    + '.q h2{font:700 16.5px/1.45 Heebo;margin:0 0 10px;display:flex;gap:9px;align-items:flex-start}.q h2 span{flex:none;width:26px;height:26px;border-radius:50%;background:#e0f7fb;color:#0e7490;font:800 13px/26px Heebo;text-align:center}'
    + '.q.done h2 span{background:#06b6d4;color:#0f1b2a}'
    + '.hint{font:500 13px Heebo;color:#6b7c90;margin:-4px 0 10px}'
    + '.ops{display:flex;flex-wrap:wrap;gap:8px}.op{border:1.5px solid #cbd5e1;background:#fff;color:#0f1b2a;border-radius:999px;padding:10px 15px;font:500 15px Heebo;cursor:pointer;min-height:44px}'
    + '.op.on{background:#0f1b2a;border-color:#0f1b2a;color:#fff;font-weight:700}'
    + '.tx{width:100%;border:1.5px solid #cbd5e1;border-radius:14px;padding:10px 12px;font:500 15.5px/1.5 Heebo;color:#0f1b2a;resize:vertical}.tx:focus{outline:none;border-color:#06b6d4}'
    + '.send{display:block;width:100%;border:0;border-radius:16px;background:#06b6d4;color:#0f1b2a;font:800 18px Heebo;padding:16px;margin-top:8px;cursor:pointer}'
    + '.saved{font:500 13px Heebo;color:#6b7c90;text-align:center;margin-top:10px}'
    + '.thanks{display:none;text-align:center;padding:60px 20px}.thanks b{display:block;font:900 26px Heebo;margin-bottom:8px}.thanks p{font:400 16px/1.6 Heebo;color:#24364b}'
    + 'body.sent .wrap{display:none}body.sent .thanks{display:block}'
    + '</style></head><body' + (s.submittedAt ? ' class="sent"' : '') + '>'
    + '<div class="top"><div class="brand"><span>IT</span><b>IT<i>solution</i></b></div><div class="bar"><i id="bar"></i></div><div class="cnt" id="cnt"></div></div>'
    + '<div class="wrap"><h1>' + esc(d.title) + '</h1><p class="hello">' + esc(d.hello) + '</p>' + qs
    + '<button type="button" class="send" id="send">שליחה</button><p class="saved" id="saved">כל סימון נשמר מיד. אפשר לסגור ולחזור אחר כך.</p></div>'
    + '<div class="thanks"><b>תודה! ✓</b><p>' + esc(d.thanks || 'התשובות הגיעו אלינו. נבנה את ההדגמה בדיוק סביב מה שסימנת.') + '</p></div>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ',Q=[].slice.call(document.querySelectorAll(".q")),tm=null;'
    + 'function ans(){var o={};Q.forEach(function(q){var t=q.querySelector(".tx");o[q.getAttribute("data-id")]=t?(t.value.trim()?[t.value.trim()]:[]):[].slice.call(q.querySelectorAll(".op.on")).map(function(b){return b.textContent;});});return o;}'
    + 'function paint(){var n=0;Q.forEach(function(q){var t=q.querySelector(".tx"),d=t?!!t.value.trim():q.querySelectorAll(".op.on").length>0;q.classList.toggle("done",d);if(d)n++;});document.getElementById("bar").style.width=Math.round(n/Q.length*100)+"%";document.getElementById("cnt").textContent="ענית על "+n+" מתוך "+Q.length;}'
    + 'function post(sub){return fetch("/api/form",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:T,answers:ans(),submit:!!sub})}).then(function(r){if(!r.ok)throw 0;return r.json();});}'
    + 'function save(){clearTimeout(tm);tm=setTimeout(function(){post(false).then(function(){document.getElementById("saved").textContent="נשמר ✓";},function(){document.getElementById("saved").textContent="אין חיבור כרגע. הסימונים יישמרו כשיחזור.";});},500);}'
    + 'Q.forEach(function(q){var multi=q.getAttribute("data-multi")==="1",max=+q.getAttribute("data-max")||0;q.addEventListener("click",function(e){var b=e.target.closest(".op");if(!b)return;'
    + 'if(multi){if(!b.classList.contains("on")&&max&&q.querySelectorAll(".op.on").length>=max){q.querySelector(".hint").textContent="אפשר לסמן עד "+max+". כדי להחליף, לבטל קודם אחד";return;}b.classList.toggle("on");}'
    + 'else{q.querySelectorAll(".op.on").forEach(function(x){if(x!==b)x.classList.remove("on");});b.classList.toggle("on");if(b.classList.contains("on")){var nx=q.nextElementSibling;if(nx&&nx.classList.contains("q"))setTimeout(function(){nx.scrollIntoView({behavior:"smooth",block:"center"});},250);}}'
    + 'paint();save();});var tx=q.querySelector(".tx");if(tx)tx.addEventListener("input",function(){paint();save();});});'
    + 'document.getElementById("send").onclick=function(){var b=this;b.disabled=true;b.textContent="שולח...";post(true).then(function(){document.body.classList.add("sent");window.scrollTo(0,0);},function(){b.disabled=false;b.textContent="לא נשלח, לנסות שוב";});};'
    + 'paint();fetch("/api/form",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:T,open:true})}).catch(function(){});})();</script>'
    + '</body></html>';
}

// GET /f/<token>
function servePage(tok, res) {
  tok = safeTok(tok); const d = tok && def(tok);
  if (!d) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('הטופס לא נמצא'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.end(page(tok, d, state(tok)));
}

// POST /api/form {t, answers?, submit?, open?}. notify(kind, text) goes to the monitor.
function handlePost(b, notify) {
  const tok = safeTok(b && b.t); const d = tok && def(tok);
  if (!d) return { status: 404, body: { error: 'form' } };
  const s = state(tok);
  const now = new Date().toISOString();
  if (b.open) {
    // 5.11 (iron rule, analytics): every open counts, not only the first.
    s.opens = (s.opens || 0) + 1; s.lastOpenAt = now;
    if (s.openedAt) saveState(tok, s);
    if (!s.openedAt) { s.openedAt = now; saveState(tok, s); notify('טופס אפיון', d.client + ' פתח את טופס האפיון עכשיו.'); }
    return { status: 200, body: { ok: true } };
  }
  if (b.answers && typeof b.answers === 'object') {
    const clean = {};
    d.questions.forEach((q) => {
      if (q.text) { const v = Array.isArray(b.answers[q.id]) ? String(b.answers[q.id][0] || '').trim().slice(0, 1500) : ''; clean[q.id] = v ? [v] : []; return; }
      const a = Array.isArray(b.answers[q.id]) ? b.answers[q.id].map(String).filter((x) => q.options.indexOf(x) > -1) : [];
      clean[q.id] = q.multi ? a.slice(0, q.max || q.options.length) : a.slice(0, 1);
    });
    s.answers = clean; s.updatedAt = now;
  }
  if (b.submit && !s.submittedAt) { s.submittedAt = now; s.reported = 'full'; saveState(tok, s); notify('טופס אפיון', summary(d, s, false)); }
  else saveState(tok, s);
  return { status: 200, body: { ok: true } };
}

// Called every few seconds: a form left in the middle is reported once, after 20 quiet minutes.
function sweep(notify) {
  let files = []; try { files = fs.readdirSync(DIR).filter((f) => /^[a-f0-9]+\.def\.json$/.test(f)); } catch (e) { return; }
  files.forEach((f) => {
    const tok = f.split('.')[0], d = def(tok), s = state(tok);
    if (!d || s.submittedAt || s.reported || !s.updatedAt) return;
    if (Date.now() - Date.parse(s.updatedAt) < 20 * 60e3) return;
    s.reported = 'partial'; saveState(tok, s);
    notify('טופס אפיון', summary(d, s, true));
  });
}

module.exports = { servePage, handlePost, sweep, summary };
