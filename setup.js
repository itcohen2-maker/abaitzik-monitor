'use strict';
/*
  1.11.2026: a client setup page, "דף הקמה". One card per connection the monitor
  needs (Facebook page and ads, mail and calendar, WhatsApp). The client taps
  through it; every tap is saved and reported to Itzik's monitor (kind "דף הקמה").
  IT Solution only, no name of Itzik anywhere.

  https://form.it-solution.co.il/s/<token>, served by wa-bridge.js like forms.js.

  data/setup/<token>.def.json  { client, title, hello, steps: [ {
      id, icon, title, text,
      choose?: { q, options: [...] },          one choice
      copy?:   { label, value },               a value to copy (our business ID)
      copies?: [ { label, value, msg? } ]      5.11: more values; msg: a Hebrew message he forwards to someone
      link?:   { label, url },                 a button that opens a page
      done?:   "label of the done button",
      input?:  { label, placeholder?, hint? }  3.11: the client pastes a key (Gmail app password,
                                               Fireflies API key). Saved only in <token>.secrets.json
                                               (mode 600), never shown back, never sent in a report.
      ms?:     { button }                      4.11: Microsoft 365 calendar by device code (ms-cal.js).
                                               The page shows a code, the client approves at Microsoft,
                                               the refresh token is saved like a secret. } ] }
  offers?: [ { id, icon, title, text, price?, choose } ]   5.11: "אולי יעניין אותך" under the cards: an extra product
                                               (first: digital signature on quotes). Not counted in progress; a choice
                                               other than the last option tells Itzik's monitor at once (a sale lead).
  data/setup/<token>.json      { steps: { id: { choice?, done?, got? } }, openedAt, updatedAt, finishedAt }
*/
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'data', 'setup');

function safeTok(t) { return /^[a-f0-9]{16,40}$/.test(String(t || '')) ? String(t) : null; }
function def(tok) { try { return JSON.parse(fs.readFileSync(path.join(DIR, tok + '.def.json'), 'utf8')); } catch (e) { return null; } }
function state(tok) { try { return JSON.parse(fs.readFileSync(path.join(DIR, tok + '.json'), 'utf8')); } catch (e) { return { steps: {} }; } }
function saveState(tok, s) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, tok + '.json.tmp'), JSON.stringify(s, null, 1)); fs.renameSync(path.join(DIR, tok + '.json.tmp'), path.join(DIR, tok + '.json')); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function saveSecret(tok, id, v) {
  const f = path.join(DIR, tok + '.secrets.json');
  let o = {}; try { o = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  o[id] = { value: v, at: new Date().toISOString() };
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); fs.chmodSync(f, 0o600);
}
function complete(st, s) { const x = (s.steps || {})[st.id] || {}; return (st.input || st.ms) ? !!x.got : (st.done ? !!x.done : (st.choose ? !!x.choice : false)); }

function summary(d, s) {
  const NL = '\n';
  let t = 'דף הקמה: ' + d.client + NL;
  d.steps.forEach((st) => {
    const x = (s.steps || {})[st.id] || {};
    t += (complete(st, s) ? '✓ ' : '○ ') + st.title + (x.choice ? ': ' + x.choice : '') + (x.got ? (st.ms ? ' (מחובר' + (x.who ? ': ' + x.who : '') + ')' : ' (המפתח התקבל)') : '') + NL;
  });
  (d.offers || []).forEach((st) => { const x = (s.steps || {})[st.id] || {}; if (x.choice) t += '✨ ' + st.title + ': ' + x.choice + NL; });
  return t;
}

function card(st, i, s) {
  const x = (s.steps || {})[st.id] || {};
  let h = '<section class="c' + (complete(st, s) ? ' ok' : '') + '" data-id="' + esc(st.id) + '">'
    + '<div class="hd"><span class="ic">' + esc(st.icon || '•') + '</span><h2>' + esc(st.title) + '</h2><i class="ck">✓</i></div>'
    + '<p class="tx">' + esc(st.text) + '</p>';
  if (st.choose) h += '<p class="cq">' + esc(st.choose.q) + '</p><div class="ops">' + st.choose.options.map((o) => '<button type="button" class="op' + (x.choice === o ? ' on' : '') + '">' + esc(o) + '</button>').join('') + '</div>';
  // 5.11: several values per card; msg: true is a Hebrew message to forward (right to left, keeps its lines).
  [].concat(st.copy || [], st.copies || []).forEach((c) => {
    h += c.msg
      ? '<div class="cp cpm"><span>' + esc(c.label) + '</span><b dir="rtl">' + esc(c.value) + '</b><button type="button" class="cpb" data-v="' + esc(c.value) + '">העתקת ההודעה</button></div>'
      : '<div class="cp"><span>' + esc(c.label) + '</span><b dir="ltr">' + esc(c.value) + '</b><button type="button" class="cpb" data-v="' + esc(c.value) + '">העתקה</button></div>';
  });
  if (st.link) h += '<a class="lk" href="' + esc(st.link.url) + '" target="_blank" rel="noopener">' + esc(st.link.label) + ' ↗</a>';
  if (st.input) h += '<div class="in" data-got="' + (x.got ? 1 : 0) + '"><p class="cq">' + esc(st.input.label) + '</p>'
    + (st.input.hint ? '<p class="ih">' + esc(st.input.hint) + '</p>' : '')
    + '<div class="ir"><input type="text" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(st.input.placeholder || '') + '"><button type="button" class="sv">שמירה</button></div>'
    + '<p class="ig">' + (x.got ? '✓ התקבל ונשמר במקום מאובטח. כדי להחליף, להדביק שוב.' : '') + '</p></div>';
  if (st.ms) h += '<div class="ms" data-got="' + (x.got ? 1 : 0) + '">'
    + '<button type="button" class="msb">' + esc(x.got ? 'לחבר מחדש' : (st.ms.button || 'חיבור היומן')) + '</button>'
    + '<div class="msc" hidden><div class="cp"><span>הקוד שלך:</span><b dir="ltr" class="msk"></b><button type="button" class="cpb" data-v="">העתקה</button></div>'
    + '<a class="lk msl" href="https://microsoft.com/devicelogin" target="_blank" rel="noopener">פתיחת מסך האישור של מיקרוסופט ↗</a>'
    + '<p class="ih">שם מדביקים את הקוד, נכנסים עם המייל של ה 365 ולוחצים אישור. הדף הזה יסמן ✓ לבד.</p></div>'
    + '<p class="ig">' + (x.got ? '✓ היומן מחובר' + (x.who ? ' (' + esc(x.who) + ')' : '') : '') + '</p></div>';
  if (st.done) h += '<button type="button" class="dn' + (x.done ? ' on' : '') + '">' + (x.done ? '✓ ' : '') + esc(st.done) + '</button>';
  return h + '</section>';
}

function page(tok, d, s) {
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
    + '.c{background:#fff;border-radius:18px;padding:16px;margin:0 0 12px;box-shadow:0 1px 6px rgba(15,27,42,.06);border:2px solid transparent;transition:border-color .2s}'
    + '.c.ok{border-color:#06b6d4}'
    + '.hd{display:flex;align-items:center;gap:10px}.ic{font-size:24px;line-height:1}.hd h2{flex:1;font:800 17.5px/1.35 Heebo;margin:0}'
    + '.ck{font-style:normal;width:28px;height:28px;border-radius:50%;background:#e2e8f0;color:#fff;font:900 15px/28px Heebo;text-align:center}.c.ok .ck{background:#06b6d4;color:#0f1b2a}'
    + '.tx{font:400 15px/1.6 Heebo;color:#24364b;margin:8px 0 10px}'
    + '.cq{font:700 15px Heebo;margin:4px 0 8px}'
    + '.ops{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}.op{border:1.5px solid #cbd5e1;background:#fff;color:#0f1b2a;border-radius:999px;padding:10px 15px;font:500 15px Heebo;cursor:pointer;min-height:44px}'
    + '.op.on{background:#0f1b2a;border-color:#0f1b2a;color:#fff;font-weight:700}'
    + '.cp{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:#f1f5f9;border-radius:12px;padding:10px 12px;margin:0 0 10px}.cp span{font:500 13.5px Heebo;color:#4a5a6e}.cp b{font:800 17px Heebo;letter-spacing:.5px;flex:1}'
    + '.xh{font:900 19px Heebo;margin:26px 0 10px;color:#0f1b2a}.c.xo{background:linear-gradient(160deg,#ecfeff,#fff);border-color:#a5f3fc}.c.xo.ok{border-color:#06b6d4}.pr{font-style:normal;font:800 13.5px Heebo;color:#0e7490;background:#cffafe;border-radius:999px;padding:4px 10px;white-space:nowrap}'
    + '.cpm{display:block}.cpm span{display:block;margin-bottom:6px}.cpm b{display:block;white-space:pre-wrap;font:500 15px/1.6 Heebo!important;letter-spacing:0!important;background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:8px}.cpm .cpb{width:100%}'
    + '.cpb{border:0;border-radius:10px;background:#0f1b2a;color:#fff;font:700 14px Heebo;padding:9px 14px;cursor:pointer;min-height:40px}'
    + '.lk{display:block;text-align:center;text-decoration:none;border:1.5px solid #0f1b2a;color:#0f1b2a;border-radius:14px;padding:12px;font:700 15.5px Heebo;margin:0 0 10px}'
    + '.dn{display:block;width:100%;border:0;border-radius:14px;background:#06b6d4;color:#0f1b2a;font:800 16px Heebo;padding:13px;cursor:pointer;min-height:48px}.dn.on{background:#e0f7fb;color:#0e7490}'
    + '.in{background:#f1f5f9;border-radius:12px;padding:10px 12px;margin:0 0 10px}.in .cq{margin:0 0 6px}.ih{font:500 13px/1.5 Heebo;color:#4a5a6e;margin:0 0 8px}'
    + '.ir{display:flex;gap:8px}.ir input{flex:1;min-width:0;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px;font:500 16px monospace;background:#fff}'
    + '.sv{border:0;border-radius:10px;background:#0f1b2a;color:#fff;font:700 15px Heebo;padding:0 16px;min-height:44px;cursor:pointer}.ig{font:600 13.5px Heebo;color:#0e7490;margin:8px 0 0}'
    + '.msb{display:block;width:100%;border:0;border-radius:14px;background:#0f1b2a;color:#fff;font:800 16px Heebo;padding:13px;cursor:pointer;min-height:48px;margin:0 0 10px}.msk{font:900 24px monospace!important;letter-spacing:3px!important}'
    + '.fin{display:block;width:100%;border:0;border-radius:16px;background:#0f1b2a;color:#fff;font:800 18px Heebo;padding:16px;margin-top:8px;cursor:pointer}'
    + '.saved{font:500 13px Heebo;color:#6b7c90;text-align:center;margin-top:10px}'
    + '.thanks{display:none;text-align:center;padding:60px 20px}.thanks b{display:block;font:900 26px Heebo;margin-bottom:8px}.thanks p{font:400 16px/1.6 Heebo;color:#24364b}'
    + 'body.sent .wrap{display:none}body.sent .thanks{display:block}'
    + '</style></head><body' + (s.finishedAt ? ' class="sent"' : '') + '>'
    + '<div class="top"><div class="brand"><span>IT</span><b>IT<i>solution</i></b></div><div class="bar"><i id="bar"></i></div><div class="cnt" id="cnt"></div></div>'
    + '<div class="wrap"><h1>' + esc(d.title) + '</h1><p class="hello">' + esc(d.hello) + '</p>'
    + d.steps.map((st, i) => card(st, i, s)).join('')
    + ((d.offers || []).length ? '<h3 class="xh">✨ אולי יעניין אותך</h3>' + d.offers.map((st) => card(st, 0, s).replace('<section class="c', '<section class="c xo').replace('</h2>', '</h2>' + (st.price ? '<em class="pr">' + esc(st.price) + '</em>' : ''))).join('') : '')
    + '<button type="button" class="fin" id="fin">סיימתי, אפשר להתחיל</button><p class="saved" id="saved">כל לחיצה נשמרת מיד. אפשר לסגור ולחזור אחר כך.</p></div>'
    + '<div class="thanks"><b>תודה! ✓</b><p>קיבלנו. נחבר את מה שנשאר ונעדכן אותך כשהמוניטור מוכן.</p></div>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ',C=[].slice.call(document.querySelectorAll(".c:not(.xo)")),X=[].slice.call(document.querySelectorAll(".c.xo"));'
    + 'function post(o){o.t=T;return fetch("/api/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)}).then(function(r){if(!r.ok)throw 0;return r.json();});}'
    + 'function msg(t){document.getElementById("saved").textContent=t;}'
    + 'function paint(){var n=C.filter(function(c){return c.classList.contains("ok");}).length;document.getElementById("bar").style.width=Math.round(n/C.length*100)+"%";document.getElementById("cnt").textContent=n+" מתוך "+C.length+" מוכנים";}'
    + 'function ok(c){var dn=c.querySelector(".dn"),inp=c.querySelector(".in")||c.querySelector(".ms");c.classList.toggle("ok",inp?inp.getAttribute("data-got")==="1":(dn?dn.classList.contains("on"):!!c.querySelector(".op.on")));paint();}'
    + 'C.forEach(function(c){var id=c.getAttribute("data-id");c.addEventListener("click",function(e){'
    + 'var b=e.target.closest(".op");if(b){c.querySelectorAll(".op.on").forEach(function(x){if(x!==b)x.classList.remove("on");});b.classList.add("on");ok(c);post({id:id,choice:b.textContent}).then(function(){msg("נשמר ✓");},function(){msg("אין חיבור כרגע. נסו שוב בעוד רגע.");});return;}'
    + 'var p=e.target.closest(".cpb");if(p){var v=p.getAttribute("data-v");(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){p.textContent="הועתק ✓";},function(){p.textContent=v;});return;}'
    + 'var sv=e.target.closest(".sv");if(sv){var box=c.querySelector(".in"),f=box.querySelector("input"),g=box.querySelector(".ig"),v=f.value.trim();if(!v){g.textContent="צריך להדביק קודם";return;}sv.disabled=true;g.textContent="שומר...";'
    + 'post({id:id,secret:v}).then(function(){f.value="";box.setAttribute("data-got","1");g.textContent="✓ התקבל ונשמר במקום מאובטח. כדי להחליף, להדביק שוב.";sv.disabled=false;ok(c);msg("נשמר ✓");},function(){sv.disabled=false;g.textContent="לא נשמר. נסו שוב בעוד רגע.";});return;}'
    + 'var mb=e.target.closest(".msb");if(mb){var mx=c.querySelector(".ms"),mg=mx.querySelector(".ig"),mc=mx.querySelector(".msc");mb.disabled=true;mg.textContent="מבקש קוד ממיקרוסופט...";'
    + 'post({id:id,ms:"start"}).then(function(r){mb.disabled=false;if(!r.code){mg.textContent=r.error==="notready"?"החיבור למיקרוסופט ייפתח בקרוב. נעדכן אותך.":"לא התקבל קוד. נסו שוב בעוד רגע.";return;}'
    + 'mx.querySelector(".msk").textContent=r.code;mx.querySelector(".msc .cpb").setAttribute("data-v",r.code);mx.querySelector(".msc .cpb").textContent="העתקה";mx.querySelector(".msl").href=r.url;mc.hidden=false;mg.textContent="מחכה לאישור שלך במיקרוסופט (הקוד תקף "+r.minutes+" דקות)...";'
    + 'var w=setInterval(function(){post({id:id,ms:"poll"}).then(function(q){if(q.status==="pending")return;clearInterval(w);'
    + 'if(q.status==="ok"){mc.hidden=true;mx.setAttribute("data-got","1");mb.textContent="לחבר מחדש";mg.textContent="✓ היומן מחובר"+(q.who?" ("+q.who+")":"");ok(c);msg("נשמר ✓");}'
    + 'else{mc.hidden=true;mg.textContent=q.status==="expired"?"הקוד פג. לוחצים שוב לקבלת קוד חדש.":(q.status==="declined"?"האישור בוטל. אפשר לנסות שוב.":"מיקרוסופט לא אישרה. ייתכן שמנהל ה 365 צריך לאשר. נעדכן אותך.");}},function(){});},5000);'
    + '},function(){mb.disabled=false;mg.textContent="אין חיבור כרגע. נסו שוב בעוד רגע.";});return;}'
    + 'var d=e.target.closest(".dn");if(d){var on=!d.classList.contains("on");d.classList.toggle("on",on);d.textContent=(on?"✓ ":"")+d.textContent.replace(/^✓ /,"");ok(c);post({id:id,done:on}).then(function(){msg("נשמר ✓");},function(){msg("אין חיבור כרגע. נסו שוב בעוד רגע.");});}'
    + '});});'
    + 'X.forEach(function(c){var id=c.getAttribute("data-id");c.addEventListener("click",function(e){var b=e.target.closest(".op");if(!b)return;c.querySelectorAll(".op.on").forEach(function(x){if(x!==b)x.classList.remove("on");});b.classList.add("on");c.classList.add("ok");post({id:id,choice:b.textContent}).then(function(){msg("נשמר ✓");},function(){msg("אין חיבור כרגע. נסו שוב בעוד רגע.");});});});'
    + 'document.getElementById("fin").onclick=function(){var b=this;b.disabled=true;b.textContent="שולח...";post({finish:true}).then(function(){document.body.classList.add("sent");window.scrollTo(0,0);},function(){b.disabled=false;b.textContent="לא נשלח, לנסות שוב";});};'
    + 'paint();post({open:true}).catch(function(){});})();</script>'
    + '</body></html>';
}

// GET /s/<token>
function servePage(tok, res) {
  tok = safeTok(tok); const d = tok && def(tok);
  if (!d) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('הדף לא נמצא'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.end(page(tok, d, state(tok)));
}

// POST /api/setup {t, open? | id + choice? | id + done? | finish?}. notify(kind, text) goes to the monitor.
function handlePost(b, notify) {
  const tok = safeTok(b && b.t); const d = tok && def(tok);
  if (!d) return { status: 404, body: { error: 'setup' } };
  const s = state(tok); s.steps = s.steps || {};
  const now = new Date().toISOString();
  const K = 'דף הקמה';
  if (b.open) {
    // 5.11 (iron rule, analytics): every open counts, not only the first.
    s.opens = (s.opens || 0) + 1; s.lastOpenAt = now;
    if (s.openedAt) saveState(tok, s);
    if (!s.openedAt) { s.openedAt = now; saveState(tok, s); notify(K, d.client + ' פתח את דף ההקמה עכשיו.'); }
    return { status: 200, body: { ok: true } };
  }
  if (b.finish) {
    if (!s.finishedAt) { s.finishedAt = now; saveState(tok, s); notify(K, summary(d, s) + '\nהלקוח לחץ "סיימתי". מה שמסומן ○ עוד פתוח.'); }
    return { status: 200, body: { ok: true } };
  }
  const offer = (d.offers || []).find((x) => x.id === b.id);
  const st = d.steps.find((x) => x.id === b.id) || offer;
  if (!st) return { status: 400, body: { error: 'step' } };
  if (st.ms && (b.ms === 'start' || b.ms === 'poll')) return msStep(tok, d, st, b.ms, notify);
  const x = s.steps[st.id] = s.steps[st.id] || {};
  if (typeof b.choice === 'string' && st.choose && st.choose.options.indexOf(b.choice) > -1) {
    const was = x.choice; x.choice = b.choice;
    const last = st.choose.options[st.choose.options.length - 1];
    if (offer && b.choice !== last && b.choice !== was) notify(K, '💰 ' + d.client + ' מתעניין: ' + st.title + (st.price ? ' (' + st.price + ')' : '') + '. בחר: ' + b.choice + '. לחזור אליו עם פרטים.');
  }
  if (typeof b.done === 'boolean' && st.done) x.done = b.done;
  if (typeof b.secret === 'string' && st.input) {
    const v = b.secret.trim();
    if (!v || v.length > 400) return { status: 400, body: { error: 'secret' } };
    saveSecret(tok, st.id, v); x.got = now;
  }
  s.updatedAt = now; s.reported = false; saveState(tok, s);
  return { status: 200, body: { ok: true } };
}

// 4.11: the calendar card. Returns a Promise; wa-bridge resolves it.
function msStep(tok, d, st, what, notify) {
  const ms = require('./ms-cal.js');
  if (what === 'start') return ms.start(tok).then((r) => ({ status: 200, body: r }), () => ({ status: 200, body: { error: 'ms' } }));
  return ms.poll(tok).then((r) => {
    if (r.status === 'ok') {
      saveSecret(tok, st.id, JSON.stringify(r.tokens));
      const s = state(tok); s.steps = s.steps || {};
      const x = s.steps[st.id] = s.steps[st.id] || {};
      x.got = new Date().toISOString(); x.who = r.who || '';
      s.updatedAt = x.got; s.reported = false; saveState(tok, s);
      notify('דף הקמה', d.client + ': היומן של מיקרוסופט חובר' + (r.who ? ' (' + r.who + ')' : '') + '.');
    }
    if (r.status === 'error') notify('דף הקמה', d.client + ': חיבור היומן נכשל במיקרוסופט: ' + (r.detail || '') + '. ייתכן שצריך אישור של מנהל ה 365 שלו.');
    return { status: 200, body: { status: r.status, who: r.who || '' } };
  }, () => ({ status: 200, body: { status: 'pending' } }));
}

// Every notify wakes a worker round, so taps are not reported one by one: only
// open, finish, and one summary after 20 quiet minutes if the client stopped midway.
function sweep(notify) {
  let files = []; try { files = fs.readdirSync(DIR).filter((f) => /^[a-f0-9]+\.def\.json$/.test(f)); } catch (e) { return; }
  files.forEach((f) => {
    const tok = f.split('.')[0], d = def(tok), s = state(tok);
    if (!d || s.finishedAt || s.reported !== false || !s.updatedAt) return;
    if (Date.now() - Date.parse(s.updatedAt) < 20 * 60e3) return;
    s.reported = true; saveState(tok, s);
    notify('דף הקמה', summary(d, s) + '\nהלקוח עצר באמצע (20 דקות בלי לחיצה).');
  });
}

module.exports = { servePage, handlePost, sweep, summary };
