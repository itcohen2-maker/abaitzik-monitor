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
const crypto = require('crypto');
const DIR = process.env.SETUP_DIR || path.join(__dirname, 'data', 'setup');
/*
  5.11: oauth?: { provider: "google" | "meta", scopes?: ["gmail","calendar",...], button? }
  A card with a "Connect with ..." button (lib/oauth.js). The button goes to
  /oauth/<provider>/start; the provider sends the client back to /oauth/<provider>/callback,
  the token is saved like a secret under the step id, and the client lands back on this page.
*/
const OA_NAME = { google: 'גוגל', meta: 'פייסבוק', microsoft: 'מיקרוסופט', fireflies: 'פיירפליס', linkedin: 'לינקדין', tiktok: 'טיקטוק' };
const oaProv = (o) => (require('./lib/oauth.js').PROVIDERS.indexOf(o && o.provider) > -1 ? o.provider : 'google');
const OA_ERR = {
  denied: 'החיבור בוטל באמצע. אפשר ללחוץ שוב.',
  state: 'הקישור פג או נפתח פעמיים. לוחצים שוב על הכפתור.',
  norefresh: 'גוגל לא נתן הרשאה קבועה. לוחצים שוב ומאשרים את כל הסימונים.',
  exchange: 'החיבור לא הושלם אצל הספק. נסו שוב בעוד רגע, ואם זה חוזר נעדכן אתכם.',
  revoked: 'החיבור נותק (אולי הסיסמה הוחלפה או שהגישה בוטלה). לוחצים כדי לחבר מחדש.',
};

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
/*
  8.11.2026, Itzik, for the clinic: "תכין קובץ שהוא יוכל להעלות לו את הקבצים הדרושים". Two more card kinds:
  ask?:    { label, hint?, rows?, placeholder? }   free text (suppliers list, mails to share with). Saved in state, not secret.
  upload?: { label, hint?, accept? }               files from the phone or computer, POST /api/setup-file, up to 20MB each.
           Saved to data/setup/<token>-files/<step>/ (mode 600), never shown back; Itzik's monitor hears of each file.
*/
const UP_MAX = 20 * 1024 * 1024;
function complete(st, s) { const x = (s.steps || {})[st.id] || {}; if (st.upload) return !!(x.files && x.files.length); if (st.ask) return !!(x.text && x.text.trim()); return (st.input || st.ms || st.oauth) ? !!x.got : (st.done ? !!x.done : (st.choose ? !!x.choice : false)); }

function summary(d, s) {
  const NL = '\n';
  let t = 'דף הקמה: ' + d.client + NL;
  d.steps.forEach((st) => {
    const x = (s.steps || {})[st.id] || {};
    t += (complete(st, s) ? '✓ ' : '○ ') + st.title + (x.choice ? ': ' + x.choice : '')
      + (st.ask && x.text ? ': ' + x.text.replace(/\s+/g, ' ').slice(0, 300) : '') + (st.upload && x.files && x.files.length ? ' (' + x.files.length + ' קבצים)' : '') + (x.got && !st.ask && !st.upload ? (st.ms || st.oauth ? ' (מחובר' + (x.who ? ': ' + x.who : '') + ')' : ' (המפתח התקבל)') : '') + NL;
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
  // 5.11, Itzik: "צריך ממש הסבר מדויק לכל דבר, כי לקוח לא טכנולוגי לא יצליח לעבור את זה".
  // guide: [ { t: "what you see and what to press", img?: "file in data/setup/img" } ], open by default,
  // just before the button, so it is read before the page is left for the provider's screens.
  if (Array.isArray(st.guide) && st.guide.length && !(st.oauth && st.oauth.soon)) {
    h += '<details class="gd" open><summary>' + esc(st.guideTitle || '📋 מה יופיע על המסך ומה ללחוץ, שלב אחרי שלב') + '</summary><ol>'
      + st.guide.map((g) => {
        const step = typeof g === 'string' ? { t: g } : (g || {});
        let im = '';
        if (step.img && /^[a-z0-9-]+\.(jpg|png)$/.test(step.img)) {
          try { im = '<img alt="" loading="lazy" src="data:image/' + (step.img.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(path.join(DIR, 'img', step.img)).toString('base64') + '">'; } catch (e) {}
        }
        // English button names in brackets, addresses and mails keep their own direction inside Hebrew.
        const txt = esc(step.t)
          .replace(/\(([A-Za-z][^()]*?(?:\([^()]*\)[^()]*?)?)\)/g, '<bdi dir="ltr">($1)</bdi>')
          .replace(/(^|[\s"])([\w.-]+@[\w.-]+\.[a-z]{2,}|[a-z0-9-]+\.(?:co\.il|com|ai))(?=[\s".,)]|$)/g, '$1<bdi dir="ltr">$2</bdi>');
        return '<li>' + txt + im + '</li>';
      }).join('') + '</ol></details>';
  }
  if (st.link) h += '<a class="lk" href="' + esc(st.link.url) + '" target="_blank" rel="noopener">' + esc(st.link.label) + ' ↗</a>';
  if (st.input) h += '<div class="in" data-got="' + (x.got ? 1 : 0) + '"><p class="cq">' + esc(st.input.label) + '</p>'
    + (st.input.hint ? '<p class="ih">' + esc(st.input.hint) + '</p>' : '')
    + '<div class="ir"><input type="text" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(st.input.placeholder || '') + '"><button type="button" class="sv">שמירה</button></div>'
    + '<p class="ig">' + (x.got ? '✓ התקבל ונשמר במקום מאובטח. כדי להחליף, להדביק שוב.' : '') + '</p></div>';
  if (st.oauth) {
    const pr = oaProv(st.oauth);
    // 5.11: oauth.soon = the provider has not approved our app yet; show a calm note instead of a button that would fail.
    const live = require('./lib/oauth.js').ready(pr) && !st.oauth.soon;
    const href = '/oauth/' + pr + '/start?t=' + encodeURIComponent(s._tok || '') + '&s=' + encodeURIComponent(st.id);
    h += '<div class="oa" data-got="' + (x.got ? 1 : 0) + '">'
      + (live
        ? '<a class="oab oa-' + pr + '" rel="noreferrer" referrerpolicy="no-referrer" href="' + esc(href) + '">' + esc(x.got ? 'לחבר מחדש' : (st.oauth.button || 'התחברות עם ' + OA_NAME[pr])) + '</a>'
        : '<p class="ih">' + esc(typeof st.oauth.soon === 'string' ? st.oauth.soon : 'החיבור ל' + OA_NAME[pr] + ' בלחיצה ייפתח בקרוב. נעדכן אותך.') + '</p>')
      + '<p class="ig">' + (x.got ? '✓ מחובר' + (x.who ? ' (' + esc(x.who) + ')' : '') : (x.oaErr ? esc(OA_ERR[x.oaErr] || OA_ERR.exchange) : '')) + '</p></div>';
  }
  if (st.ms) h += '<div class="ms" data-got="' + (x.got ? 1 : 0) + '">'
    + '<button type="button" class="msb">' + esc(x.got ? 'לחבר מחדש' : (st.ms.button || 'חיבור היומן')) + '</button>'
    + '<div class="msc" hidden><div class="cp"><span>הקוד שלך:</span><b dir="ltr" class="msk"></b><button type="button" class="cpb" data-v="">העתקה</button></div>'
    + '<a class="lk msl" href="https://microsoft.com/devicelogin" target="_blank" rel="noopener">פתיחת מסך האישור של מיקרוסופט ↗</a>'
    + '<p class="ih">שם מדביקים את הקוד, נכנסים עם המייל של ה 365 ולוחצים אישור. הדף הזה יסמן ✓ לבד.</p></div>'
    + '<p class="ig">' + (x.got ? '✓ היומן מחובר' + (x.who ? ' (' + esc(x.who) + ')' : '') : '') + '</p></div>';
  if (st.ask) h += '<div class="tq" data-got="' + (x.text ? 1 : 0) + '"><p class="cq">' + esc(st.ask.label) + '</p>'
    + (st.ask.hint ? '<p class="ih">' + esc(st.ask.hint) + '</p>' : '')
    + '<textarea class="tqa" rows="' + (st.ask.rows || 3) + '" placeholder="' + esc(st.ask.placeholder || '') + '">' + esc(x.text || '') + '</textarea>'
    + '<button type="button" class="sv tqb">שמירה</button><p class="ig">' + (x.text ? '✓ נשמר. אפשר לערוך ולשמור שוב.' : '') + '</p></div>';
  if (st.upload) h += '<div class="up" data-got="' + (x.files && x.files.length ? 1 : 0) + '"><p class="cq">' + esc(st.upload.label) + '</p>'
    + (st.upload.hint ? '<p class="ih">' + esc(st.upload.hint) + '</p>' : '')
    + '<label class="upb">📎 בחירת קבצים להעלאה<input type="file" multiple accept="' + esc(st.upload.accept || '.pdf,image/*,.xlsx,.xls,.csv,.doc,.docx') + '" hidden></label>'
    + '<ul class="upl">' + (x.files || []).map((f) => '<li>✓ ' + esc(f.name) + '</li>').join('') + '</ul><p class="ig"></p></div>';
  if (st.done) h += '<button type="button" class="dn' + (x.done ? ' on' : '') + '">' + (x.done ? '✓ ' : '') + esc(st.done) + '</button>';
  // 5.11, Itzik: "תשים בטופס, מתחת לכל ההסברים, הערה, אם הוא רוצה לכתוב משהו, הצליח, לא הצליח".
  // Every card with a guide ends with "how did it go" + a free note. Sent to Itzik's monitor at once.
  if (Array.isArray(st.guide) && st.guide.length && !(st.oauth && st.oauth.soon)) {
    const HOW = ['הצליח ✓', 'לא הצליח ✗'];
    h += '<div class="nt"><p class="cq">איך הלך? (לא חובה)</p><div class="ops">'
      + HOW.map((o) => '<button type="button" class="nh' + (x.how === o ? ' on' : '') + '">' + esc(o) + '</button>').join('') + '</div>'
      + '<textarea class="nta" rows="2" placeholder="רוצה לכתוב לנו משהו? מה ראית, איפה נתקעת, שאלה">' + esc(x.note || '') + '</textarea>'
      + '<button type="button" class="ntb">שליחת ההערה</button><p class="ig ntg"></p></div>';
  }
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
    + '.oab{display:block;text-align:center;text-decoration:none;border-radius:14px;background:#0f1b2a;color:#fff;font:800 16px Heebo;padding:14px;min-height:48px;margin:0 0 10px}.oa-google{background:#fff;color:#1f1f1f;border:1.5px solid #747775}.oa-meta{background:#1877f2}.oa-microsoft{background:#2f2f2f}.oa-fireflies{background:#6b21a8}.oa-linkedin{background:#0a66c2}.oa-tiktok{background:#000}'
    + '.gd{background:#fffbeb;border:1.5px solid #fcd34d;border-radius:14px;padding:10px 12px;margin:0 0 12px}.gd summary{font:800 15px Heebo;cursor:pointer;color:#92400e}.gd ol{margin:8px 0 0;padding:0 22px 0 0}.gd li{font:400 15px/1.65 Heebo;color:#1f2937;margin:0 0 10px}.nt{border-top:1px dashed #cbd5e1;margin-top:12px;padding-top:10px}.nh{border:1.5px solid #cbd5e1;background:#fff;color:#0f1b2a;border-radius:999px;padding:8px 14px;font:500 14.5px Heebo;cursor:pointer;min-height:40px}.nh.on{background:#0f1b2a;border-color:#0f1b2a;color:#fff}.nta{display:block;width:100%;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px;font:400 15px Heebo;margin:8px 0;resize:vertical}.ntb{border:0;border-radius:10px;background:#e2e8f0;color:#0f1b2a;font:700 14.5px Heebo;padding:9px 16px;cursor:pointer;min-height:40px}'
    + '.gd bdi{white-space:nowrap}.gd img{display:block;width:100%;max-width:340px;border:1px solid #e5e7eb;border-radius:10px;margin:8px 0 0}'
    + '.tq,.up{background:#f1f5f9;border-radius:12px;padding:10px 12px;margin:0 0 10px}.tq .cq,.up .cq{margin:0 0 6px}.tqa{display:block;width:100%;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px;font:400 16px/1.5 Heebo;margin:0 0 8px;resize:vertical;background:#fff}'
    + '.upb{display:block;text-align:center;border:2px dashed #0e7490;border-radius:14px;padding:14px;font:800 16px Heebo;color:#0e7490;background:#fff;cursor:pointer;min-height:48px}.upl{list-style:none;margin:8px 0 0;padding:0}.upl li{font:500 14px Heebo;color:#0f1b2a;padding:3px 0;word-break:break-all}'
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
    + 'function ok(c){var dn=c.querySelector(".dn"),inp=c.querySelector(".in")||c.querySelector(".ms")||c.querySelector(".oa")||c.querySelector(".tq")||c.querySelector(".up");c.classList.toggle("ok",inp?inp.getAttribute("data-got")==="1":(dn?dn.classList.contains("on"):!!c.querySelector(".op.on")));paint();}'
    + 'C.forEach(function(c){var id=c.getAttribute("data-id");c.addEventListener("click",function(e){var nh=e.target.closest(".nh");if(nh){c.querySelectorAll(".nh.on").forEach(function(x){if(x!==nh)x.classList.remove("on");});nh.classList.add("on");post({id:id,how:nh.textContent}).then(function(){msg("נשמר ✓");},function(){msg("אין חיבור כרגע. נסו שוב בעוד רגע.");});return;}var nb=e.target.closest(".ntb");if(nb){var ta=c.querySelector(".nta"),ng=c.querySelector(".ntg");nb.disabled=true;ng.textContent="שולח...";post({id:id,note:ta.value}).then(function(){nb.disabled=false;ng.textContent="✓ ההערה הגיעה אלינו. נחזור אליך אם צריך.";},function(){nb.disabled=false;ng.textContent="לא נשלח. נסו שוב בעוד רגע.";});return;}'
    + 'var b=e.target.closest(".op");if(b){c.querySelectorAll(".op.on").forEach(function(x){if(x!==b)x.classList.remove("on");});b.classList.add("on");ok(c);post({id:id,choice:b.textContent}).then(function(){msg("נשמר ✓");},function(){msg("אין חיבור כרגע. נסו שוב בעוד רגע.");});return;}'
    + 'var p=e.target.closest(".cpb");if(p){var v=p.getAttribute("data-v");(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){p.textContent="הועתק ✓";},function(){p.textContent=v;});return;}'
    + 'var tb=e.target.closest(".tqb");if(tb){var tq=c.querySelector(".tq"),tg=tq.querySelector(".ig"),tv=tq.querySelector(".tqa").value.trim();tb.disabled=true;tg.textContent="שומר...";'
    + 'post({id:id,text:tv}).then(function(){tb.disabled=false;tq.setAttribute("data-got",tv?"1":"0");tg.textContent=tv?"✓ נשמר. אפשר לערוך ולשמור שוב.":"";ok(c);msg("נשמר ✓");},function(){tb.disabled=false;tg.textContent="לא נשמר. נסו שוב בעוד רגע.";});return;}'
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
    // 8.11: upload cards. One file at a time, as base64 JSON, to /api/setup-file.
    + 'C.forEach(function(c){var fi=c.querySelector(".up input[type=file]");if(!fi)return;var id=c.getAttribute("data-id"),up=c.querySelector(".up"),ug=up.querySelector(".ig"),ul=up.querySelector(".upl");'
    + 'fi.addEventListener("change",function(){var fs=[].slice.call(fi.files||[]);fi.value="";var i=0;function next(){if(i>=fs.length){ug.textContent=fs.length?"✓ הקבצים הגיעו אלינו.":"";return;}var f=fs[i++];'
    + 'if(f.size>' + UP_MAX + '){ug.textContent=f.name+" גדול מ 20 מגה. אפשר לשלוח אותו לנו בוואטסאפ.";return next();}ug.textContent="מעלה "+f.name+"...";var r=new FileReader();r.onload=function(){'
    + 'fetch("/api/setup-file",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:T,id:id,name:f.name,type:f.type,data:String(r.result).split(",")[1]||""})}).then(function(x){if(!x.ok)throw 0;return x.json();})'
    + '.then(function(){var li=document.createElement("li");li.textContent="✓ "+f.name;ul.appendChild(li);up.setAttribute("data-got","1");ok(c);msg("נשמר ✓");next();},function(){ug.textContent=f.name+" לא עלה. נסו שוב בעוד רגע.";});};r.readAsDataURL(f);}next();});});'
    + 'X.forEach(function(c){var id=c.getAttribute("data-id");c.addEventListener("click",function(e){var b=e.target.closest(".op");if(!b)return;c.querySelectorAll(".op.on").forEach(function(x){if(x!==b)x.classList.remove("on");});b.classList.add("on");c.classList.add("ok");post({id:id,choice:b.textContent}).then(function(){msg("נשמר ✓");},function(){msg("אין חיבור כרגע. נסו שוב בעוד רגע.");});});});'
    + 'document.getElementById("fin").onclick=function(){var b=this;b.disabled=true;b.textContent="שולח...";post({finish:true}).then(function(){document.body.classList.add("sent");window.scrollTo(0,0);},function(){b.disabled=false;b.textContent="לא נשלח, לנסות שוב";});};'
    + 'paint();post({open:true}).catch(function(){});})();</script>'
    + '</body></html>';
}

/*
  9.11.2026, Itzik, for Dr. Shulman's form: "תשים סיסמה על הטופס ... אם הוא מעביר אותו למישהו אני רוצה לדעת".
  A form has a password when data/setup/<token>.pass exists (one line). Without the cookie the page is only the
  password box; /api/setup, /api/setup-file and the connect buttons refuse too. The cookie is an HMAC keyed by the
  password, so changing the password logs everyone out. Itzik's own mark cookie (owner-mark.js) passes.
  Every open or password entry from a device not seen before tells Itzik's monitor ("passed on?").
  Five wrong passwords lock the form for 10 minutes and tell him once.
*/
function gatePass(tok) { try { return fs.readFileSync(path.join(DIR, tok + '.pass'), 'utf8').trim(); } catch (e) { return ''; } }
function gateCookie(tok) { return crypto.createHmac('sha256', gatePass(tok)).update('sg:' + tok).digest('hex').slice(0, 40); }
function gateName(tok) { return 'sg_' + tok.slice(0, 8); }
function gateOk(tok, req) {
  tok = safeTok(tok); if (!tok || !gatePass(tok)) return true;
  if (!req) return true;
  if (require('./owner-mark.js').meta(req).owner) return true;
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + gateName(tok) + '=([a-f0-9]+)'));
  return !!(m && m[1] === gateCookie(tok));
}
// A device not seen before on this form: tell Itzik. The first device is the baseline.
function trackDevice(tok, d, s, meta, notify, why) {
  const key = (meta && meta.dev) || '?';
  s.devs = s.devs || [];
  if (s.devs.indexOf(key) > -1) return false;
  s.devs.push(key);
  if (s.devs.length > 1) notify('דף הקמה', '🔔 ' + d.client + ': הטופס ' + why + ' ממכשיר נוסף (' + key + '), מכשיר מספר ' + s.devs.length + '. ייתכן שהקישור הועבר למישהו אחר.');
  return true;
}
const TRIES = {};
function handleGate(b, req, notify) {
  const tok = safeTok(b && b.t); const d = tok && def(tok);
  const pw = tok && gatePass(tok);
  if (!d || !pw) return { status: 404, body: { error: 'setup' } };
  const meta = require('./owner-mark.js').meta(req);
  const t = TRIES[tok] = TRIES[tok] || { n: 0, until: 0, told: false };
  const now = Date.now();
  if (t.until > now) return { status: 429, body: { error: 'locked' } };
  const given = String((b && b.p) || '').trim().toLowerCase();
  const ok = given.length === pw.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pw.toLowerCase()));
  const s = state(tok);
  if (!ok) {
    t.n++;
    if (t.n >= 5) { t.until = now + 10 * 60 * 1000; t.n = 0; notify('דף הקמה', '⚠️ ניסו 5 סיסמאות שגויות בטופס של ' + d.client + ' (' + meta.dev + '). הטופס ננעל ל 10 דקות.'); }
    return { status: 403, body: { error: 'pass' } };
  }
  t.n = 0;
  trackDevice(tok, d, s, meta, notify, 'נפתח עם הסיסמה');
  s.passAt = new Date().toISOString(); s.passes = (s.passes || 0) + 1; saveState(tok, s);
  return { status: 200, body: { ok: true }, cookie: gateName(tok) + '=' + gateCookie(tok) + '; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax' };
}
function gatePage(tok, d) {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow"><title>' + esc(d.title) + ' | IT Solution</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;800&display=swap" rel="stylesheet"><style>'
    + '*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#0f1b2a;font-family:Heebo,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}'
    + '.b{background:#fff;border-radius:18px;padding:26px 22px;max-width:380px;width:100%;box-shadow:0 8px 30px #0f1b2a18;text-align:center}'
    + 'h1{font-size:20px;margin:0 0 8px}p{margin:0 0 16px;color:#44556a;font-size:15px;line-height:1.5}'
    + 'input{width:100%;font:700 20px Heebo;text-align:center;letter-spacing:2px;padding:12px;border:2px solid #cbd5e1;border-radius:12px;direction:ltr}'
    + 'button{margin-top:12px;width:100%;border:0;border-radius:14px;background:#06b6d4;color:#0f1b2a;font:800 17px Heebo;padding:14px;cursor:pointer;min-height:48px}'
    + '#e{color:#b91c1c;min-height:22px;margin-top:10px;font-size:14px}</style></head><body><div class="b">'
    + '<h1>' + esc(d.title) + '</h1><p>הטופס מוגן בסיסמה. הסיסמה נשלחה אליך בנפרד מהקישור.</p>'
    + '<input id="p" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="סיסמה"><button id="g">כניסה</button><div id="e"></div></div>'
    + '<script>(function(){var T=' + JSON.stringify(tok) + ',p=document.getElementById("p"),e=document.getElementById("e"),g=document.getElementById("g");'
    + 'function go(){g.disabled=true;e.textContent="";fetch("/api/setup-gate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:T,p:p.value})})'
    + '.then(function(r){if(r.ok){location.reload();return;}g.disabled=false;e.textContent=r.status===429?"נסיתם יותר מדי פעמים. אפשר שוב בעוד 10 דקות.":"הסיסמה לא נכונה.";})'
    + '.catch(function(){g.disabled=false;e.textContent="אין חיבור כרגע. נסו שוב בעוד רגע.";});}'
    + 'g.onclick=go;p.addEventListener("keydown",function(k){if(k.key==="Enter")go();});})();</script></body></html>';
}

// GET /s/<token>
function servePage(tok, res, req) {
  tok = safeTok(tok); const d = tok && def(tok);
  if (!d) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('הדף לא נמצא'); }
  if (req && !gateOk(tok, req)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); return res.end(gatePage(tok, d)); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  const s = state(tok); s._tok = tok;
  res.end(page(tok, d, s));
}

// POST /api/setup {t, open? | id + choice? | id + done? | finish?}. notify(kind, text) goes to the monitor.
function handlePost(b, notify, meta) {
  const tok = safeTok(b && b.t); const d = tok && def(tok);
  if (!d) return { status: 404, body: { error: 'setup' } };
  const s = state(tok); s.steps = s.steps || {};
  const now = new Date().toISOString();
  const K = 'דף הקמה';
  if (b.open) {
    if (require('./owner-mark.js').onOpen(s, meta, now, () => saveState(tok, s))) return { status: 200, body: { ok: true } };
    // 5.11 (iron rule, analytics): every open counts, not only the first.
    s.opens = (s.opens || 0) + 1; s.lastOpenAt = now;
    trackDevice(tok, d, s, meta, notify, 'נפתח');
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
  // 5.11: "how did it go" and a free note under each guide; Itzik sees it at once.
  if ((typeof b.how === 'string' || typeof b.note === 'string') && Array.isArray(st.guide)) {
    const how = typeof b.how === 'string' && /^(הצליח ✓|לא הצליח ✗)$/.test(b.how) ? b.how : null;
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) : null;
    if (how && how !== x.how) { x.how = how; notify(K, '📝 ' + d.client + ', ' + st.title + ': ' + how + (x.note ? '. כתב: ' + x.note : '')); }
    if (note !== null && note !== (x.note || '')) { x.note = note; if (note) notify(K, '📝 ' + d.client + ' כתב על ' + st.title + (x.how ? ' (' + x.how + ')' : '') + ': ' + note); }
  }
  if (typeof b.text === 'string' && st.ask) { x.text = b.text.trim().slice(0, 5000); if (x.text) x.got = now; else delete x.got; }
  if (typeof b.secret === 'string' && st.input) {
    const v = b.secret.trim();
    if (!v || v.length > 400) return { status: 400, body: { error: 'secret' } };
    saveSecret(tok, st.id, v); x.got = now;
  }
  s.updatedAt = now; s.reported = false; saveState(tok, s);
  return { status: 200, body: { ok: true } };
}

// 8.11: POST /api/setup-file { t, id, name, type, data (base64) }. Only to a card with upload.
function handleFile(b, notify) {
  const tok = safeTok(b && b.t); const d = tok && def(tok);
  const st = d && d.steps.find((x) => x.id === b.id && x.upload);
  if (!st) return { status: 404, body: { error: 'step' } };
  let buf; try { buf = Buffer.from(String(b.data || ''), 'base64'); } catch (e) { buf = null; }
  if (!buf || !buf.length || buf.length > UP_MAX) return { status: 400, body: { error: 'size' } };
  const name = String(b.name || 'file').replace(/[\/\\\0]/g, '_').replace(/^\.+/, '').slice(-120) || 'file';
  if (!/\.(pdf|jpe?g|png|heic|heif|webp|gif|xlsx?|csv|docx?|txt)$/i.test(name)) return { status: 400, body: { error: 'type' } };
  const dir = path.join(DIR, tok + '-files', st.id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const now = new Date().toISOString();
  const out = path.join(dir, now.replace(/\D/g, '').slice(0, 14) + '-' + name);
  fs.writeFileSync(out, buf, { mode: 0o600 });
  const s = state(tok); s.steps = s.steps || {};
  const x = s.steps[st.id] = s.steps[st.id] || {};
  x.files = (x.files || []).concat({ name, size: buf.length, at: now, file: path.basename(out) }).slice(-50); x.got = now;
  s.updatedAt = now; saveState(tok, s);
  notify('דף הקמה', '📎 ' + d.client + ' העלה קובץ ב"' + st.title + '": ' + name + ' (' + Math.max(1, Math.round(buf.length / 1024)) + 'KB). נשמר בשרת, לא בצ׳אט.');
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

// 5.11: GET /oauth/<p>/start?t=&s=  -> 302 to the consent screen of Google or Meta.
function oauthStart(p, q, res) {
  const oa = require('./lib/oauth.js');
  const tok = safeTok(q.get('t')); const d = tok && def(tok);
  const st = d && d.steps.find((x) => x.id === q.get('s') && x.oauth && oaProv(x.oauth) === p);
  if (!st) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('הדף לא נמצא'); }
  const view = q.get('v') === '1';
  const r = oa.startUrl(p, tok, st.id, st.oauth.scopes, null, view);
  if (!r.url) { res.writeHead(302, { Location: '/s/' + tok + (view ? '/view' : '') + '#' + st.id }); return res.end(); }
  res.writeHead(302, { Location: r.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end();
}

// 5.11: GET /oauth/<p>/callback. Saves the token as the step's secret, tells the monitor, sends the client back.
async function oauthCallback(p, q, res, notify) {
  const oa = require('./lib/oauth.js');
  let r; try { r = await oa.callback(p, q); } catch (e) { r = { ok: false, error: 'exchange', detail: e.message }; }
  const tok = safeTok(r.t); const d = tok && def(tok);
  const st = d && d.steps.find((x) => x.id === r.s && x.oauth);
  if (!st) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('הקישור פג. חוזרים לדף ההקמה ולוחצים שוב.'); }
  const s = state(tok); s.steps = s.steps || {};
  const x = s.steps[st.id] = s.steps[st.id] || {};
  const now = new Date().toISOString(); const K = 'דף הקמה';
  if (r.ok) {
    saveSecret(tok, st.id, JSON.stringify(r.saved));
    x.got = now; x.who = r.who || ''; delete x.oaErr; delete x.broken;
    if (r.pages) x.pages = r.pages.map((pg) => pg.name + (pg.ig ? ' + @' + pg.ig : ''));
    notify(K, d.client + ': ' + OA_NAME[p] + ' חובר' + (r.who ? ' (' + r.who + ')' : '') + '.'
      + (r.pages ? (r.pages.length ? ' דפים: ' + x.pages.join(', ') + '.' : ' לא נמצא אף דף עסקי שהוא מנהל.') : ''));
  } else {
    x.oaErr = r.error;
    if (r.error === 'exchange') notify(K, d.client + ': החיבור ל' + OA_NAME[p] + ' נכשל אצל הספק' + (r.detail ? ': ' + r.detail : '') + '.');
  }
  s.updatedAt = now; s.reported = false; saveState(tok, s);
  res.writeHead(302, { Location: '/s/' + tok + (r.v ? '/view' : '') + '#' + st.id, 'Cache-Control': 'no-store' }); res.end();
}

module.exports = { servePage, handlePost, handleFile, sweep, summary, oauthStart, oauthCallback, gateOk, handleGate, DIR };
