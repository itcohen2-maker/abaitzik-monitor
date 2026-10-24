'use strict';
/*
  24.10.2026, stage 7: the customer's "מה אני יודע על העסק שלך" screen. It lists the
  business facts the monitor holds (instance.json: owner, profile, biz) and gives each
  one a "לתקן" button. The button opens an inline text box, never window.prompt, and
  the correction goes to Itzik as an ordinary message:
    sendText('תיקון פרטים', 'תיקון בפרופיל העסק: <field>: <new value>', 'תיקון')
  The customer does not change the system here: a correction is a request, and Itzik
  decides. Entry point is a row in the settings screen (pZ); the screen is pane 'Pf'.
  Plain strings, so build.js drops them into the page as they are. Itzik's own copy
  gets an empty hidden section and no entry row.
*/

// The text sent to Itzik for one correction. Also embedded in the page (see js below).
function correctionText(label, value) {
  return 'תיקון בפרופיל העסק: ' + label + ': ' + value;
}

const MODULE_LABELS = {
  biz: 'העסק שלי: לידים, לקוחות וכסף',
  morning: 'חשבוניות במורנינג או בגרין אינבוי',
};
const EMPTY = 'לא הוגדר, אפשר לתקן';

function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/*
  The rows, from the instance. A row with no value still shows, with EMPTY, so the
  customer can fill the gap. Modules come from profile.modules, plus biz when biz is on.
*/
function factRows(inst) {
  const p = inst.profile || {};
  const mods = Array.isArray(p.modules) ? p.modules.slice() : [];
  if (inst.biz && mods.indexOf('biz') < 0) mods.unshift('biz');
  const services = Array.isArray(p.services) ? p.services.filter(Boolean).join(', ') : '';
  return [
    { field: 'owner', label: 'השם שלך', value: inst.owner || '' },
    { field: 'business', label: 'שם העסק', value: p.business || '' },
    { field: 'hours', label: 'שעות פעילות', value: p.hours || '' },
    { field: 'services', label: 'מה אני מספק', value: services },
    { field: 'tone', label: 'טון התשובות', value: p.tone === 'casual' ? 'חברי' : 'ענייני' },
    { field: 'modules', label: 'מודולים פעילים', value: mods.map((m) => MODULE_LABELS[m] || m).join(', ') },
  ];
}

const css = `
#profEntry{margin-top:10px}
.pfRow{padding:12px 14px;margin:8px 0;border-radius:14px;border:1px solid var(--line);background:var(--surface)}
.pfRow .pfTxt small{display:block;opacity:.7;font:600 13px Heebo,sans-serif}
.pfRow .pfTxt b{font:700 16px/1.5 Heebo,sans-serif;word-break:break-word}
.pfFix{margin-top:8px;padding:9px 16px;border-radius:10px;border:1.5px solid #4f7cff;background:transparent;color:#4f7cff;font:800 14px Heebo,sans-serif;cursor:pointer;min-height:44px}
.pfEdit{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.pfEdit[hidden]{display:none}
.pfIn{flex:1 1 180px;min-height:44px;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--sunk);color:var(--ink);font:400 16px Heebo,sans-serif}
.pfSave,.pfCancel{min-height:44px;padding:9px 16px;border-radius:10px;font:800 14px Heebo,sans-serif;cursor:pointer;border:0}
.pfSave{background:#4f7cff;color:#fff}
.pfSave:disabled{opacity:.6}
.pfCancel{background:var(--sunk);color:var(--ink)}
.pfSaid{margin-top:8px;font:600 14px Heebo,sans-serif;opacity:.85}
`;

function entry() {
  return '<div class="alerts" id="profEntry"><div><b>מה אני יודע על העסק שלך</b>'
    + '<small>הפרטים שהמוניטור שמר מהשאלון. אפשר לתקן כל אחד.</small></div>'
    + '<button type="button" class="abtn" id="gProfile">פתיחה</button></div>';
}

function html(inst) {
  if (!inst || inst.name === 'abaitzik') return '<section id="pPf" hidden></section>';
  const rows = factRows(inst).map((r) => '\n <div class="pfRow" data-field="' + esc(r.field) + '" data-label="' + esc(r.label) + '">'
    + '<div class="pfTxt"><small>' + esc(r.label) + '</small><b>' + esc(r.value || EMPTY) + '</b></div>'
    + '<button type="button" class="pfFix">לתקן</button>'
    + '<div class="pfEdit" hidden><input type="text" class="pfIn" maxlength="300" aria-label="' + esc(r.label) + '">'
    + '<button type="button" class="pfSave">שליחה</button><button type="button" class="pfCancel">ביטול</button></div>'
    + '<div class="pfSaid" aria-live="polite"></div></div>').join('');
  return '\n<section id="pPf" hidden>\n <h2>מה אני יודע על העסק שלך</h2>\n'
    + ' <div class="rephint">אלה הפרטים שהמוניטור שמר מהשאלון. אם משהו לא נכון או חסר, לוחצים על לתקן, כותבים, ושולחים.</div>'
    + rows + '\n</section>\n';
}

const js = `
var pfCorrection=${correctionText.toString()};
boot('profile',function(){
 var sec=document.getElementById('pPf');if(!sec)return;
 var open=document.getElementById('gProfile');
 if(open)open.onclick=function(){pane('Pf');};
 function say(row,t){var s=row.querySelector('.pfSaid');if(s)s.textContent=t;}
 sec.onclick=function(e){
  var t=e.target;
  var row=t.closest?t.closest('.pfRow'):null;
  if(!row)return;
  var ed=row.querySelector('.pfEdit'),inp=row.querySelector('.pfIn');
  if(t.classList.contains('pfFix')){ed.hidden=false;inp.value='';say(row,'');inp.focus();return;}
  if(t.classList.contains('pfCancel')){ed.hidden=true;return;}
  if(t.classList.contains('pfSave')){
   var v=inp.value.trim();
   if(!v){say(row,'צריך לכתוב את התיקון.');return;}
   t.disabled=true;
   sendText('תיקון פרטים',pfCorrection(row.getAttribute('data-label'),v),'תיקון').then(function(){
    t.disabled=false;ed.hidden=true;say(row,'נשלח. אני מטפל בזה.');
   }).catch(function(){t.disabled=false;say(row,'לא יצא, נסה שוב.');});
  }
 };
});
`;

module.exports = { correctionText, factRows, css, entry, html, js };
