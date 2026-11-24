'use strict';
/*
  24.11.2026: the screen 🗂️ שיחות ופגישות of a customer whose instance.json says calls: true (the archive of lib/calls-store.js,
  read through lib/calls-api.js on the central wa-bridge). Search on top (live, 250ms), chips for the time range, the kind and
  the tracked topics, the rows with the summary, the full transcript, the recording, delete (asked inside the page), the
  contact card, and the settings (private numbers, tracked topics, tagging the last 30 days again).

  The page is static and holds no call data at all: everything is fetched when the screen opens, through the page's own
  helper fcPost (the same one the fast chat uses, it sends the customer's key). The routes are /api/calls/*, and the helper
  prefixes /api/chat, so the path starts with /../ and the browser resolves it. Everything that comes from the API is put
  on the page as text (esc), never as raw markup.
  Not enabled: html() is '' and the page is as it was.
*/

// the page side, put on the page with toString. Plain ES5, no closing script tag inside.
function page() {
  var W = window, PAGE = 30, MAXT = 10;
  var S = { q: '', range: '', kind: '', topic: '', rows: [], total: 0, busy: false, err: '', topics: [], askDel: '', loaded: false };
  var seq = 0, timer = 0, byId = {}, listEl = null, chipsEl = null, inputEl = null;
  var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var EMPTY = 'עוד אין שיחות. ברגע שהמרכזייה תעביר שיחה, היא תופיע כאן עם סיכום.';
  var FAILED = 'הסיכום לא הצליח, התמלול המלא כאן';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function say(t) { if (typeof toast === 'function') toast(t); }
  function api(route, body) { return fcPost('/../calls/' + route, body || {}); }
  function failText(e) { return e && e.status === 403 ? 'אין הרשאה לארכיון הזה.' : 'לא הצלחתי לטעון עכשיו. אפשר לנסות שוב בעוד רגע.'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function when(at) {
    var d = typeof at === 'number' ? new Date(at) : new Date(String(at || ''));
    if (isNaN(d.getTime())) return '';
    var n = new Date(), t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(), t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var diff = Math.round((t0 - t1) / 864e5), hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (diff === 0) return 'היום ' + hm;
    if (diff === 1) return 'אתמול ' + hm;
    if (diff > 1 && diff < 7) return 'יום ' + DAYS[d.getDay()] + ' ' + hm;
    return d.getDate() + '.' + (d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2) + ' ' + hm;
  }
  function mins(sec) { var m = Math.round(Number(sec || 0) / 60); return m < 1 ? 'פחות מדקה' : m + ' דק׳'; }
  function normPhone(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.indexOf('972') === 0) d = '0' + d.slice(3);
    return /^0\d{8,9}$/.test(d) ? d : '';
  }
  function cidOf(r) { if (r.contactId) return String(r.contactId); var p = normPhone(r.number); return p ? 'p' + p : ''; }
  function audioHref(u) {
    u = String(u || '');
    if (/^https:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/' && u.charAt(1) !== '/') return 'https://wa.abaitzik.com' + u;
    return '';
  }
  function numHtml(n) { return n ? '<bdi dir="ltr">' + esc(n) + '</bdi>' : ''; }
  function nameOf(r) { return r.name ? esc(r.name) : (r.number ? numHtml(r.number) : 'מספר לא מזוהה'); }

  // one result row, also used inside the contact card
  function rowHtml(r) {
    byId[r.id] = r;
    var about = r.status === 'failed' ? FAILED : (r.about || r.snippet || '');
    var task = r.tasks && r.tasks[0], tags = (r.topics || []).map(function (t) { return '#' + esc(t); }).join(' ');
    var cid = cidOf(r), icon = r.kind === 'meet' ? '🎙️' : '📞';
    var h = '<div class="clRow" data-id="' + esc(r.id) + '"><div class="clHead">';
    h += (cid ? '<button type="button" class="clName" data-a="contact" data-id="' + esc(r.id) + '">' : '<span class="clName">') + icon + ' ' + nameOf(r) + (cid ? '</button>' : '</span>');
    h += '<small>' + esc(when(r.at)) + ' · ' + esc(mins(r.durationSec)) + '</small></div>';
    if (about) h += '<p class="clAbout' + (r.status === 'failed' ? ' clBad' : '') + '">' + esc(about) + '</p>';
    if (task && task.text) h += '<p class="clTask">✅ ' + esc(task.text) + (task.due ? ' <small>' + esc(task.due) + '</small>' : '') + '</p>';
    if (tags) h += '<p class="clTags">' + tags + '</p>';
    if (S.askDel === r.id) {
      h += '<div class="clAsk"><span>למחוק את השיחה הזאת? אי אפשר לשחזר מכאן.</span><button type="button" class="clBtn clDanger" data-a="del2" data-id="' + esc(r.id) + '">כן, למחוק</button><button type="button" class="clBtn" data-a="del0">לא</button></div>';
    } else {
      h += '<div class="clAct"><button type="button" class="clBtn" data-a="full" data-id="' + esc(r.id) + '">תמלול מלא</button>';
      if (audioHref(r.audioUrl)) h += '<button type="button" class="clBtn" data-a="play" data-id="' + esc(r.id) + '">▶️ האזנה</button>';
      h += '<button type="button" class="clBtn clIcon" data-a="del" data-id="' + esc(r.id) + '" aria-label="מחיקה">🗑</button></div>';
    }
    return h + '</div>';
  }

  function paintChips() {
    if (!chipsEl) return;
    function chip(a, v, label, on) { return '<button type="button" class="clChip" data-a="' + a + '" data-v="' + esc(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>'; }
    var h = chip('range', 'today', 'היום', S.range === 'today') + chip('range', 'week', 'השבוע', S.range === 'week') + chip('range', '', 'הכל', S.range === '');
    h += '<i class="clSep"></i>' + chip('kind', 'call', 'שיחות', S.kind === 'call') + chip('kind', 'meet', 'פגישות', S.kind === 'meet');
    if (S.topics.length) h += '<i class="clSep"></i>' + S.topics.map(function (t) { return chip('topic', t, '#' + t, S.topic === t); }).join('');
    chipsEl.innerHTML = h;
  }
  function paintList() {
    if (!listEl) return;
    var h = '';
    if (S.err) h = '<div class="clNote">' + esc(S.err) + '<button type="button" class="clBtn" data-a="retry">לנסות שוב</button></div>';
    else if (!S.rows.length && S.loaded && !S.busy) h = '<div class="clNote">' + esc(S.q || S.range || S.kind || S.topic ? 'לא נמצא כלום. אפשר לנסות מילה אחרת.' : EMPTY) + '</div>';
    else h = S.rows.map(rowHtml).join('');
    if (S.rows.length && S.rows.length < S.total) h += '<button type="button" class="clBtn clMore" data-a="more">עוד</button>';
    if (S.busy && !S.rows.length) h = '<div class="clNote">טוען</div>';
    listEl.innerHTML = h;
  }
  function range() {
    var n = new Date(), s = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (S.range === 'today') return { from: s.toISOString(), to: new Date(s.getTime() + 864e5).toISOString() };
    if (S.range === 'week') return { from: new Date(s.getTime() - 6 * 864e5).toISOString(), to: new Date(s.getTime() + 864e5).toISOString() };
    return { from: '', to: '' };
  }
  function load(more) {
    var my = ++seq, r = range();
    S.busy = true; S.err = '';
    if (!more) { S.rows = []; S.total = 0; }
    paintList();
    api('search', { q: S.q, from: r.from, to: r.to, kind: S.kind, topic: S.topic, contactId: '', offset: more ? S.rows.length : 0 }).then(function (j) {
      if (my !== seq) return;
      S.busy = false; S.loaded = true;
      S.total = Number(j && j.total) || 0;
      S.rows = (more ? S.rows : []).concat(Array.isArray(j && j.rows) ? j.rows : []);
      paintList();
    }, function (e) { if (my !== seq) return; S.busy = false; S.err = failText(e); paintList(); });
  }
  function later() { clearTimeout(timer); timer = setTimeout(function () { load(false); }, 250); }

  // a sheet of the page (shipOpen), with its own click handler
  function sheet(id, title, body, onClick) {
    return shipOpen(id, title, '<div class="cl" id="' + id + 'B">' + body + '</div>', function (w) {
      var box = w.querySelector('#' + id + 'B');
      box.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-a]'); if (b) onClick(b, box, e); });
    });
  }
  function openFull(id) {
    var r = byId[id] || { id: id };
    var w = sheet('clItem', 'תמלול מלא', '<div class="clNote">טוען</div>', function (b) { if (b.getAttribute('data-a') === 'play') playOf(id); });
    var box = w.querySelector('#clItemB');
    api('item', { id: id }).then(function (j) {
      var it = (j && j.item) || {}, h = '<p class="clHead"><b>' + (r.kind === 'meet' ? '🎙️ ' : '📞 ') + nameOf(r.name || r.number ? r : it) + '</b><small>' + esc(when(it.at || r.at)) + '</small></p>';
      if (it.summary && it.summary.about) h += '<p class="clAbout">' + esc(it.summary.about) + '</p>';
      if (audioHref(it.audioUrl || r.audioUrl)) h += '<div class="clAct"><button type="button" class="clBtn" data-a="play">▶️ האזנה</button></div>';
      var segs = Array.isArray(it.segments) ? it.segments : [];
      if (segs.length) h += '<div class="clTr">' + segs.map(function (s) { return '<p><b>' + esc(s.speaker || '') + '</b> ' + esc(s.text || '') + '</p>'; }).join('') + '</div>';
      else if (it.transcript) h += '<div class="clTr"><p>' + esc(it.transcript) + '</p></div>';
      else h += '<div class="clNote">אין תמלול לשיחה הזאת.</div>';
      byId[id] = Object.assign ? Object.assign({}, r, { audioUrl: it.audioUrl || r.audioUrl }) : r;
      box.innerHTML = h;
    }, function (e) { box.innerHTML = '<div class="clNote">' + esc(failText(e)) + '</div>'; });
  }
  function playOf(id) { var r = byId[id], u = r && audioHref(r.audioUrl); if (u) W.open(u, '_blank', 'noopener'); }
  function doDelete(id) {
    api('delete', { id: id }).then(function () {
      S.askDel = ''; S.rows = S.rows.filter(function (r) { return r.id !== id; }); S.total = Math.max(0, S.total - 1); paintList(); say('השיחה נמחקה.');
    }, function (e) { S.askDel = ''; paintList(); say(failText(e)); });
  }

  // the contact card: every call of the person, the open tasks of all of them, and a name for an unknown number
  function openContact(id) {
    var r = byId[id] || {}, cid = cidOf(r);
    if (!cid) return;
    var cardRows = {};
    var w = sheet('clCard', 'כרטיס איש קשר', '<div class="clNote">טוען</div>', function (b, box) {
      var a = b.getAttribute('data-a'), rid = b.getAttribute('data-id');
      if (a === 'full') openFull(rid); else if (a === 'play') playOf(rid);
      else if (a === 'del') { S.askDel = rid; paintCard(); } else if (a === 'del0') { S.askDel = ''; paintCard(); }
      else if (a === 'del2') { api('delete', { id: rid }).then(function () { S.askDel = ''; delete cardRows[rid]; S.rows = S.rows.filter(function (x) { return x.id !== rid; }); paintCard(); paintList(); say('השיחה נמחקה.'); }, function (e) { S.askDel = ''; paintCard(); say(failText(e)); }); }
      else if (a === 'name') {
        var v = (box.querySelector('#clNm') || {}).value || '';
        v = v.replace(/\s+/g, ' ').trim();
        if (!v) { say('צריך לכתוב שם.'); return; }
        api('name', { number: r.number || '', name: v }).then(function () { say('השם נשמר.'); if (cardData && cardData.contact) cardData.contact.name = v; r.name = v; paintCard(); load(false); }, function (e) { say(failText(e)); });
      }
    });
    var box = w.querySelector('#clCardB'), cardData = null;
    function paintCard() {
      if (!cardData) return;
      var c = cardData.contact || {}, h = '<p class="clHead"><b>' + (c.name ? esc(c.name) : nameOf(r)) + '</b></p>';
      var det = (c.phones || []).map(numHtml).concat((c.emails || []).map(function (m) { return '<bdi dir="ltr">' + esc(m) + '</bdi>'; }));
      if (det.length) h += '<p class="clAbout">' + det.join(' · ') + '</p>';
      if (!c.name && r.number) h += '<div class="clAsk"><input id="clNm" class="clInput" type="text" maxlength="60" placeholder="שם לאיש הקשר" aria-label="שם לאיש הקשר"><button type="button" class="clBtn" data-a="name">תן שם למספר</button></div>';
      var open = Array.isArray(cardData.open) ? cardData.open : [];
      if (open.length) h += '<p class="clSec">משימות פתוחות</p>' + open.map(function (t) { return '<p class="clTask">✅ ' + esc(t.text) + (t.due ? ' <small>' + esc(t.due) + '</small>' : '') + '</p>'; }).join('');
      var calls = Array.isArray(cardData.calls) ? cardData.calls : [];
      h += '<p class="clSec">' + (calls.length ? 'כל השיחות והפגישות' : 'עוד אין שיחות עם האיש הזה') + '</p>' + calls.map(function (x) { cardRows[x.id] = x; return rowHtml(x); }).join('');
      box.innerHTML = h;
    }
    api('contact', { contactId: cid }).then(function (j) { cardData = j || {}; paintCard(); }, function (e) { box.innerHTML = '<div class="clNote">' + esc(failText(e)) + '</div>'; });
  }

  // the settings: private numbers, tracked topics, tagging the last 30 days again
  function openSettings() {
    var st = { priv: null, topics: null, askPriv: false, retag: null };
    var w = sheet('clSet', 'הגדרות', '<div class="clNote">טוען</div>', function (b, box) {
      var a = b.getAttribute('data-a');
      if (a === 'savetopics') {
        var tl = lines(box.querySelector('#clTp').value).map(function (x) { return x.replace(/^#+/, ''); }).filter(Boolean);
        if (tl.length > MAXT) { say('אפשר לעקוב אחרי עד ' + MAXT + ' נושאים.'); return; }
        api('topics', { list: tl }).then(function (j) { S.topics = (j && j.topics) || tl; st.topics = S.topics; paintChips(); say('הנושאים נשמרו.'); paintSet(); }, function (e) { say(failText(e)); });
      } else if (a === 'savepriv') {
        var pl = lines(box.querySelector('#clPv').value), added = pl.filter(function (p) { return (st.priv || []).indexOf(p) < 0; });
        if (added.length && !st.askPriv) { st.askPriv = true; st.draft = pl; paintSet(); return; }
        api('private', { list: pl }).then(function (j) { st.priv = (j && j.numbers) || pl; st.askPriv = false; say('הרשימה נשמרה.'); paintSet(); load(false); }, function (e) { say(failText(e)); });
      } else if (a === 'privno') { st.askPriv = false; paintSet(); }
      else if (a === 'retag') {
        api('retag', { days: 30 }).then(function (j) { st.retag = { count: Number(j && j.count) || 0, usd: Number(j && j.estimateUsd) || 0 }; paintSet(); }, function (e) { say(failText(e)); });
      } else if (a === 'retag2') {
        api('retag', { days: 30, confirm: true }).then(function (j) { st.retag = null; say('סומנו ' + (Number(j && j.count) || 0) + ' שיחות לתיוג מחדש.'); paintSet(); }, function (e) { say(failText(e)); });
      } else if (a === 'retag0') { st.retag = null; paintSet(); }
    });
    var box = w.querySelector('#clSetB');
    function lines(s) { var seen = {}, out = []; String(s || '').split(/\r?\n/).forEach(function (x) { x = x.replace(/\s+/g, ' ').trim(); if (x && !seen[x]) { seen[x] = 1; out.push(x); } }); return out; }
    function paintSet() {
      if (!st.priv || !st.topics) return;
      var h = '<p class="clSec">מספרים פרטיים</p><p class="clAbout">מספר אחד בכל שורה. שיחות מהמספרים האלה לא נשמרות בכלל.</p>';
      h += '<textarea id="clPv" class="clInput clArea" rows="4" aria-label="מספרים פרטיים">' + esc((st.askPriv && st.draft ? st.draft : st.priv).join('\n')) + '</textarea>';
      if (st.askPriv) h += '<div class="clAsk"><span>מספר חדש ברשימה מעביר את השיחות הקיימות שלו מהארכיון. להמשיך?</span><button type="button" class="clBtn clDanger" data-a="savepriv">כן, לשמור</button><button type="button" class="clBtn" data-a="privno">לא</button></div>';
      else h += '<button type="button" class="clBtn" data-a="savepriv">שמירת המספרים</button>';
      h += '<p class="clSec">נושאים במעקב</p><p class="clAbout">נושא אחד בכל שורה, עד ' + MAXT + '. כל שיחה מקבלת את הנושאים שמתאימים לה.</p>';
      h += '<textarea id="clTp" class="clInput clArea" rows="4" aria-label="נושאים במעקב">' + esc(st.topics.join('\n')) + '</textarea><button type="button" class="clBtn" data-a="savetopics">שמירת הנושאים</button>';
      h += '<p class="clSec">תיוג מחדש</p>';
      if (st.retag) h += '<div class="clAsk"><span>' + (st.retag.count ? 'יתויגו מחדש ' + st.retag.count + ' שיחות מ 30 הימים האחרונים, עלות משוערת ' + esc(st.retag.usd.toFixed(2)) + ' דולר. להמשיך?' : 'אין שיחות לתייג מחדש ב 30 הימים האחרונים.') + '</span>' + (st.retag.count ? '<button type="button" class="clBtn clDanger" data-a="retag2">כן, לתייג</button>' : '') + '<button type="button" class="clBtn" data-a="retag0">' + (st.retag.count ? 'לא' : 'סגירה') + '</button></div>';
      else h += '<button type="button" class="clBtn" data-a="retag">תייג מחדש 30 ימים</button>';
      box.innerHTML = h;
    }
    api('private', {}).then(function (j) { st.priv = (j && j.numbers) || []; paintSet(); }, function (e) { box.innerHTML = '<div class="clNote">' + esc(failText(e)) + '</div>'; });
    api('topics', {}).then(function (j) { st.topics = (j && j.topics) || []; S.topics = st.topics; paintChips(); paintSet(); }, function () { st.topics = []; paintSet(); });
  }

  function openScreen() {
    if (typeof shipOpen !== 'function') return;
    S.q = ''; S.range = ''; S.kind = ''; S.topic = ''; S.askDel = ''; S.loaded = false; S.rows = []; S.total = 0; byId = {};
    var w = shipOpen('clSheet', '🗂️ שיחות ופגישות', '<div class="cl"><div class="clTop"><input id="clQ" class="clInput" type="search" enterkeyhint="search" autocomplete="off" placeholder="חיפוש: שם, מספר או מילה" aria-label="חיפוש"><button type="button" class="clBtn clIcon" data-a="settings" aria-label="הגדרות">⚙️</button></div><div class="clChips" id="clChips"></div><div id="clList"></div></div>', function (w) {
      inputEl = w.querySelector('#clQ'); chipsEl = w.querySelector('#clChips'); listEl = w.querySelector('#clList');
      inputEl.addEventListener('input', function () { S.q = inputEl.value.trim(); S.askDel = ''; later(); });
      w.querySelector('.cl').addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
        var a = b.getAttribute('data-a'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
        if (a === 'range') { S.range = v; paintChips(); load(false); }
        else if (a === 'kind') { S.kind = S.kind === v ? '' : v; paintChips(); load(false); }
        else if (a === 'topic') { S.topic = S.topic === v ? '' : v; paintChips(); load(false); }
        else if (a === 'more') load(true);
        else if (a === 'retry') load(S.rows.length > 0);
        else if (a === 'full') openFull(id);
        else if (a === 'play') playOf(id);
        else if (a === 'contact') openContact(id);
        else if (a === 'del') { S.askDel = id; paintList(); }
        else if (a === 'del0') { S.askDel = ''; paintList(); }
        else if (a === 'del2') doDelete(id);
        else if (a === 'settings') openSettings();
      });
      paintChips(); load(false);
      api('topics', {}).then(function (j) { S.topics = (j && j.topics) || []; paintChips(); }, function () {});
    });
    return w;
  }
  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('#gCalls'); if (t) openScreen(); });
  W.clOpen = openScreen;
}

function css() {
  return `
#clSheet .ycard,#clItem .ycard,#clCard .ycard,#clSet .ycard{--clA:#2563eb;--clS:#eef3fd;--clInk:#16202c;--clDim:#5f6b7f;--clLine:#e2e8f0}
.cl{font-family:Heebo,system-ui,sans-serif;direction:rtl;text-align:right;color:var(--clInk)}
.cl p{margin:0}
.clTop{display:flex;gap:8px;margin:6px 0 8px}
.clInput{box-sizing:border-box;flex:1;min-width:0;min-height:46px;padding:0 14px;border-radius:14px;border:1.5px solid var(--clLine);background:#fff;color:var(--clInk);font:500 16px Heebo,system-ui,sans-serif;direction:rtl;text-align:right}
.clInput:focus{outline:3px solid var(--clA);outline-offset:1px}
.clArea{display:block;width:100%;padding:10px 14px;line-height:1.5;resize:vertical}
.clChips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px}
.clChip{all:unset;box-sizing:border-box;cursor:pointer;min-height:36px;padding:0 14px;border-radius:18px;background:var(--clS);color:var(--clInk);font:600 14px Heebo,system-ui,sans-serif;display:grid;place-items:center}
.clChip[aria-pressed=true]{background:var(--clA);color:#fff}
.clSep{width:1px;height:20px;background:var(--clLine)}
.clBtn{all:unset;box-sizing:border-box;cursor:pointer;min-height:44px;padding:0 14px;border-radius:12px;background:var(--clS);color:var(--clA);font:700 14.5px Heebo,system-ui,sans-serif;display:inline-grid;place-items:center;text-align:center}
.clBtn:active{transform:scale(.97)}
.clBtn:focus-visible,.clChip:focus-visible,.clName:focus-visible{outline:3px solid var(--clA);outline-offset:2px}
.clIcon{min-width:46px;padding:0}
.clDanger{background:#d93a2f;color:#fff}
.clMore{width:100%;margin:10px 0 4px}
.clRow{padding:12px 2px;border-bottom:1px solid var(--clLine)}
.clHead{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 10px}
.clName{all:unset;box-sizing:border-box;cursor:pointer;font:800 16px Heebo,system-ui,sans-serif;line-height:1.4}
button.clName{color:var(--clA)}
.clHead small{font-size:13px;color:var(--clDim)}
.clAbout{margin:4px 0 0;font-size:14.5px;line-height:1.5}
.clBad{color:var(--clDim)}
.clTask{margin:4px 0 0;font-size:14.5px;line-height:1.5;font-weight:600}
.clTask small{font-weight:400;color:var(--clDim)}
.clTags{margin:4px 0 0;font-size:13px;color:var(--clA);font-weight:600}
.clAct,.clAsk{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 0}
.clAsk span{flex:1 1 100%;font-size:14px;line-height:1.5}
.clAsk .clInput{flex:1 1 140px}
.clNote{margin:12px 0;padding:12px;border-radius:12px;background:var(--clS);font-size:14.5px;line-height:1.6;text-align:center}
.clNote .clBtn{display:grid;margin:10px auto 0}
.clSec{margin:16px 0 4px!important;font-weight:800;font-size:15px}
.clTr{margin:10px 0}.clTr p{margin:0 0 8px;font-size:15px;line-height:1.6}.clTr b{color:var(--clA);margin-inline-end:4px}
@media (prefers-reduced-motion:reduce){.clBtn{transition:none}}
`;
}

const enabled = (inst) => !!(inst && inst.calls === true);
function html(inst) {
  if (!enabled(inst)) return '';
  return '<style>' + css() + '</style><script>(' + page.toString() + ')();</script>';
}

module.exports = { html, enabled, page, css };
