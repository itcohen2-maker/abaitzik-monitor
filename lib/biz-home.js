'use strict';
/*
  3.11.2026: "המסך העסקי" for a business customer, from real data.

  Shai (IT Solution customer, an independent business advisor) saw these tiles in
  the client demo on 3.11 (lib/demo-mode.js) and bought them: meeting summaries,
  his clients, meetings and calendar with today, mail, and quotes. The demo draws
  them from data/demo/demo.json on Itzik's copy only. This is the same set for a
  customer, on the monitor's own tiles, from the customer's own folder:

    data/biz-home/meetings.json  [{id, src, title, at, clientId, client, people, summary,
                                   decisions[], tasksClient[], tasksMe[], next, keywords[]}]
                                 written by fireflies-pull.js
    data/biz-home/clients.json   [{id, name, biz, emails[], domains[], aliases[], status, terms, note}]
                                 fireflies-pull.js adds a client it could not match; the worker edits
    data/biz-home/events.json    [{id, start, end, title, where, attendees[], clientId}]
                                 empty until the calendar (Microsoft Graph) is connected
    data/biz-home/mail.json      [{id, at, from, subject, text, tag, reply}]
                                 empty until mail-check fills it
    data/biz-home/quotes.json    [{id, at, no, client, subject, items:[[name, qty, price]], terms, valid}]
    data/biz-home/logo.png|jpg|svg  the business logo for quotes, when it arrives

  On only when instance.json has "bizHome": true. The tiles are listed in screens
  like any other (gBhMeet, gBhClients, gBhCal, gBhMail, gBhQuote). Everything the
  page shows is computed here at build time (view), so the page only draws.
  Nothing here is Itzik's: no name, no link, no address of his.
*/
const fs = require('fs');
const path = require('path');

const FILES = { meet: 'meetings.json', client: 'clients.json', event: 'events.json', mail: 'mail.json', quote: 'quotes.json' };
const FREE_MAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com',
  'me.com', 'walla.co.il', 'walla.com', 'msn.com', 'aol.com', 'proton.me', 'protonmail.com', 'bezeqint.net', 'netvision.net.il'];

function dirOf(dataPath) { return path.join(dataPath, 'biz-home'); }
function readList(dataPath, kind) {
  try { const a = JSON.parse(fs.readFileSync(path.join(dirOf(dataPath), FILES[kind]), 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function writeList(dataPath, kind, list) {
  const d = dirOf(dataPath); fs.mkdirSync(d, { recursive: true });
  const f = path.join(d, FILES[kind]);
  fs.writeFileSync(f + '.tmp', JSON.stringify(list, null, 1)); fs.renameSync(f + '.tmp', f);
}
// instance.json's biz block. lib/instance.js keeps only a boolean there (biz: false is the CRM switch),
// so the business details for a quote are read from the file itself.
function bizInfo(root) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(root, 'instance.json'), 'utf8')).biz;
    if (!b || typeof b !== 'object') return {};
    const s = (v) => (v == null ? '' : String(v)).slice(0, 160);
    return { name: s(b.name), sub: s(b.sub), vat: s(b.vat), email: s(b.email), phone: s(b.phone), address: s(b.address) };
  } catch (e) { return {}; }
}
function logoData(dataPath) {
  const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
  for (const ext of Object.keys(types)) {
    const f = path.join(dirOf(dataPath), 'logo.' + ext);
    try { const st = fs.statSync(f); if (st.size > 0 && st.size < 400 * 1024) return 'data:' + types[ext] + ';base64,' + fs.readFileSync(f).toString('base64'); } catch (e) { /* none */ }
  }
  return '';
}

function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/["'`״׳]/g, '').replace(/\s+/g, ' ').trim(); }
function domainOf(e) { const m = /@([^@\s>]+)$/.exec(String(e || '').trim().toLowerCase()); return m ? m[1] : ''; }
function isOwner(p, ownerEmails, ownerNames) {
  const em = norm(p && p.email);
  if (em && (ownerEmails || []).some((o) => norm(o) === em)) return true;
  const nm = norm(p && p.name);
  return !!nm && (ownerNames || []).some((o) => { o = norm(o); return o && (nm === o || nm.indexOf(o) === 0); });
}

/*
  Which of his clients a meeting belongs to. In order: an attendee's exact mail
  address, then a company domain (never gmail and the like), then a client's name
  or alias inside an attendee's name or the meeting title. Null when nothing fits.
*/
function findClient(clients, people, title) {
  clients = clients || []; people = people || [];
  const mails = people.map((p) => norm(p.email)).filter(Boolean);
  for (const c of clients) if ((c.emails || []).some((e) => mails.indexOf(norm(e)) > -1)) return c;
  const doms = mails.map(domainOf).filter((d) => d && FREE_MAIL.indexOf(d) < 0);
  for (const c of clients) {
    const cd = (c.domains || []).map(norm).concat((c.emails || []).map(domainOf).filter((d) => d && FREE_MAIL.indexOf(d) < 0));
    if (cd.some((d) => doms.indexOf(d) > -1)) return c;
  }
  const hay = [norm(title)].concat(people.map((p) => norm(p.name)));
  for (const c of clients) {
    const names = [c.name].concat(c.aliases || []).map(norm).filter((n) => n.length >= 2);
    if (names.some((n) => hay.some((h) => h && h.indexOf(n) > -1))) return c;
  }
  return null;
}

/*
  Fireflies' action_items is plain text grouped under the speaker:
    **Shai Bodek**
    Send the proposal (12:30)
  Items under the owner are his, the rest are the client's. Items with no
  speaker line above them are his: he is the one who has to follow up.
*/
function splitActionItems(text, ownerNames) {
  const out = { me: [], client: [] };
  let who = null;
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const l = raw.trim();
    if (!l) return;
    const h = /^\*\*(.+?)\*\*:?$/.exec(l) || /^#+\s*(.+)$/.exec(l);
    if (h) { who = h[1].trim(); return; }
    const item = l.replace(/^[-*•]\s*/, '').replace(/\s*\(\d{1,2}:\d{2}(?::\d{2})?\)\s*$/, '').replace(/\*\*/g, '').trim();
    if (!item) return;
    const mine = who === null || isOwner({ name: who }, [], ownerNames);
    (mine ? out.me : out.client).push(item);
  });
  return out;
}
// Lines that say something was decided. Fireflies has no decisions field.
function decisionsFrom(texts) {
  const out = [];
  [].concat(texts || []).forEach((t) => String(t || '').split(/\r?\n|(?<=[.!?])\s+/).forEach((s) => {
    s = s.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim();
    if (s && /הוחלט|סוכם|הוסכם|החלטנו|סגרנו ש|decided|agreed|decision/i.test(s) && out.indexOf(s) < 0) out.push(s);
  }));
  return out.slice(0, 8);
}
function nextFrom(texts) {
  let hit = '';
  [].concat(texts || []).forEach((t) => String(t || '').split(/\r?\n|(?<=[.!?])\s+/).forEach((s) => {
    s = s.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim();
    if (!hit && s && /פגישת המשך|הפגישה הבאה|פגישה הבאה|נפגש(ים)? שוב|follow[ -]?up (meeting|call)|next meeting/i.test(s)) hit = s;
  }));
  return hit;
}
function toIso(d) {
  if (d == null || d === '') return '';
  const n = typeof d === 'number' ? d : (/^\d+$/.test(String(d)) ? Number(d) : Date.parse(d));
  return isNaN(n) ? '' : new Date(n).toISOString();
}
function slug(s) { return norm(s).replace(/[^a-z0-9֐-׿]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'x'; }

/*
  One Fireflies transcript into one meeting record. Returns { meeting, newClient };
  newClient is set when no client matched and someone outside the business was in
  the meeting: he becomes a client with status "חדש מפגישה", for Shai to keep or drop.
*/
function meetingFromTranscript(t, opts) {
  opts = opts || {};
  const ownerEmails = (opts.ownerEmails || []).slice(), ownerNames = (opts.ownerNames || []).slice();
  if (t && t.organizer_email && !ownerEmails.length) ownerEmails.push(t.organizer_email);
  // The owner's name as Fireflies writes it ("Shai Bodek", not "שי") comes from his own attendee line.
  (t && t.meeting_attendees || []).forEach((a) => {
    if (a && a.email && ownerEmails.some((o) => norm(o) === norm(a.email))) [a.displayName, a.name].forEach((n) => { if (n) ownerNames.push(String(n)); });
  });
  const sum = (t && t.summary) || {};
  const people = [];
  const seen = {};
  (t.meeting_attendees || []).forEach((a) => {
    if (!a) return;
    const p = { name: String(a.displayName || a.name || '').trim(), email: String(a.email || '').trim().toLowerCase() };
    const k = p.email || norm(p.name); if (!k || seen[k]) return; seen[k] = 1; people.push(p);
  });
  (t.participants || []).forEach((e) => {
    String(e || '').split(/[,;]/).map((x) => x.trim().toLowerCase()).filter((x) => /@/.test(x)).forEach((em) => {
      if (seen[em]) return; seen[em] = 1; people.push({ name: '', email: em });
    });
  });
  const outside = people.filter((p) => !isOwner(p, ownerEmails, ownerNames));
  let c = findClient(opts.clients || [], outside, t.title);
  let newClient = null;
  if (!c) {
    const p = outside.find((x) => x.email) || outside.find((x) => x.name);
    if (p) {
      const name = p.name || p.email.split('@')[0];
      newClient = { id: 'c-' + slug(name), name, biz: '', emails: p.email ? [p.email] : [], domains: [], aliases: [],
        status: 'חדש מפגישה', terms: '', note: '', at: toIso(t.date) || new Date().toISOString() };
      c = newClient;
    }
  }
  const acts = splitActionItems(sum.action_items, ownerNames);
  const texts = [sum.overview, sum.shorthand_bullet, sum.action_items];
  const meeting = {
    id: 'ff-' + String(t.id), src: 'fireflies', title: String(t.title || 'פגישה').slice(0, 200), at: toIso(t.date),
    minutes: t.duration ? Math.round(Number(t.duration)) : 0,
    clientId: c ? c.id : '', client: c ? c.name : '',
    people: outside.map((p) => p.name || p.email).slice(0, 12),
    summary: String(sum.overview || sum.short_summary || '').trim().slice(0, 4000),
    decisions: decisionsFrom(texts), tasksClient: acts.client.slice(0, 20), tasksMe: acts.me.slice(0, 20),
    next: nextFrom(texts), keywords: (Array.isArray(sum.keywords) ? sum.keywords : []).slice(0, 10).map(String),
  };
  return { meeting, newClient };
}
function upsert(list, rec) {
  const out = (list || []).filter((x) => x && x.id !== rec.id);
  out.push(rec);
  return out.sort((a, b) => String(b.at || b.start || '').localeCompare(String(a.at || a.start || '')));
}

function ilDay(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }
function eventClient(ev, clients) {
  if (ev.clientId) return (clients || []).find((c) => c.id === ev.clientId) || null;
  return findClient(clients, (ev.attendees || []).map((e) => (typeof e === 'string' ? { email: e } : e || {})), ev.title);
}
/*
  Per client: what is open, the last meeting and the next one. The next one is a
  calendar event when there is one, otherwise the follow up the last meeting named.
  Clients with a meeting coming first (soonest on top), then by the last meeting.
*/
function clientView(clients, meetings, events, now) {
  const t = now === undefined ? Date.now() : now;
  return (clients || []).map((c) => {
    const ms = (meetings || []).filter((m) => m.clientId === c.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const last = ms[0] || null;
    const nextEv = (events || []).filter((e) => Date.parse(e.start) >= t && (eventClient(e, clients) || {}).id === c.id)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))[0] || null;
    return {
      id: c.id, name: c.name, biz: c.biz || '', status: c.status || '', terms: c.terms || '', note: c.note || '',
      last: last ? { at: last.at, title: last.title } : null,
      next: nextEv ? { at: nextEv.start, title: nextEv.title, where: nextEv.where || '' } : (last && last.next ? { at: '', title: last.next } : null),
      openMe: last ? (last.tasksMe || []) : [], openClient: last ? (last.tasksClient || []) : [],
    };
  }).sort((a, b) => {
    const an = a.next && a.next.at ? a.next.at : '9', bn = b.next && b.next.at ? b.next.at : '9';
    if (an !== bn) return an.localeCompare(bn);
    return String((b.last || {}).at || '').localeCompare(String((a.last || {}).at || ''));
  });
}
// Today's events and the next fourteen days, each with its client's name.
function calView(events, clients, now) {
  const t = now === undefined ? Date.now() : now;
  const today = ilDay(new Date(t).toISOString());
  const withC = (events || []).filter((e) => e && e.start && !isNaN(Date.parse(e.start)))
    .map((e) => { const c = eventClient(e, clients); return { start: e.start, end: e.end || '', title: e.title || '', where: e.where || '', client: c ? c.name : '' }; })
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    today: withC.filter((e) => ilDay(e.start) === today),
    soon: withC.filter((e) => ilDay(e.start) > today && Date.parse(e.start) < t + 14 * 864e5),
  };
}

function view(dataPath, root, now) {
  const t = now === undefined ? Date.now() : now;
  const meet = readList(dataPath, 'meet'), clients = readList(dataPath, 'client'), events = readList(dataPath, 'event');
  let keys = {};
  try { keys = JSON.parse(fs.readFileSync(path.join(dataPath, 'keys.json'), 'utf8')) || {}; } catch (e) { /* none */ }
  const cal = calView(events, clients, t);
  return {
    biz: bizInfo(root), logo: logoData(dataPath),
    meet: meet.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 60),
    client: clientView(clients, meet, events, t),
    today: cal.today, soon: cal.soon,
    mail: readList(dataPath, 'mail').sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 40),
    quote: readList(dataPath, 'quote').sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 40),
    on: { fireflies: !!keys.firefliesKey, calendar: fs.existsSync(path.join(dirOf(dataPath), FILES.event)), mail: fs.existsSync(path.join(dirOf(dataPath), FILES.mail)) },
  };
}

const css = `
.bh-card{background:var(--surface,#fff);color:var(--ink,#0f1b2a);border-radius:16px;padding:14px;margin:10px 0;border:1px solid var(--line,#e2e8f0);text-align:right}
.bh-card b{font:700 15px Heebo,sans-serif}
.bh-card p{margin:6px 0 0;font:400 14.5px/1.55 Heebo,sans-serif;white-space:pre-wrap}
.bh-meta{font:500 12.5px Heebo,sans-serif;color:var(--dim,#6b7c90)}
.bh-tag{display:inline-block;font:700 12px Heebo,sans-serif;padding:2px 9px;border-radius:999px;background:#eef2f7;color:#24364b;margin-inline-start:6px}
.bh-tag.hot{background:#fee2e2;color:#991b1b}.bh-tag.ok{background:#dcfce7;color:#166534}
.bh-box{margin-top:10px;padding:10px 12px;border-radius:12px;background:#ecfeff;border:1px solid #a5f3fc;color:#0f1b2a}
.bh-box small{display:block;font:700 12px Heebo,sans-serif;color:#0e7490;margin-bottom:4px}
.bh-box p{margin:2px 0 0;color:#0f1b2a}
.bh-box.cl{background:#fef3c7;border-color:#fcd34d}.bh-box.cl small{color:#92400e}
.bh-box.me{background:#eef2f7;border-color:#cbd5e1}.bh-box.me small{color:#24364b}
.bh-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.bh-b{border:0;border-radius:12px;padding:10px 14px;font:700 14px Heebo,sans-serif;cursor:pointer;background:#0f1b2a;color:#fff;text-decoration:none;display:inline-block}
.bh-b.alt{background:#eef2f7;color:#0f1b2a}.bh-b.wa{background:#25d366;color:#05361a}
.bh-empty{background:var(--surface,#fff);border:1px dashed var(--line,#cbd5e1);border-radius:16px;padding:16px;margin:10px 0;font:500 15px/1.6 Heebo,sans-serif;color:var(--ink,#0f1b2a);text-align:right}
.bh-sec{font:800 14px Heebo,sans-serif;color:#0e7490;margin:14px 2px 4px}
.bh-f{display:flex;flex-direction:column;gap:6px;margin:8px 0;text-align:right}
.bh-f label{font:700 13px Heebo,sans-serif;color:var(--ink,#24364b)}
.bh-f input{font:400 16px Heebo,sans-serif;padding:10px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a;direction:rtl}
.bh-items{width:100%;border-collapse:collapse;margin-top:6px}
.bh-items td{padding:4px 2px;font:700 13px Heebo,sans-serif}
.bh-items input{width:100%;box-sizing:border-box;font:400 15px Heebo,sans-serif;padding:8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a}
.bh-q{background:#fff;color:#0f1b2a;border-radius:16px;padding:18px;margin-top:12px;border:1px solid #e2e8f0;text-align:right;direction:rtl;font-family:Heebo,sans-serif}
.bh-q h3{margin:0;font:800 21px Heebo,sans-serif}
.bh-q table{width:100%;border-collapse:collapse;margin-top:12px;font:400 14px Heebo,sans-serif}
.bh-q th,.bh-q td{border-bottom:1px solid #e2e8f0;padding:7px 4px;text-align:right}
.bh-q th{font-weight:700;background:#f4f7fb}
.bh-q .tot td{font-weight:800;border-bottom:0}
.bh-q .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.bh-q .br{text-align:left;font:400 12.5px/1.5 Heebo,sans-serif;color:#4a5a6e}
.bh-q .br b{display:block;font:800 16px Heebo,sans-serif;color:#0f1b2a}
.bh-q .br img{max-width:120px;max-height:56px;display:block;margin:0 0 4px auto}
#bhPrint{display:none}
@media print{body.bh-print>*{display:none!important}body.bh-print>#bhPrint{display:block!important}}
`;

const js = `
var BH_NL=String.fromCharCode(10);
function bhD(){return (window.D&&D.bizHome)||{};}
function bhMoney(n){n=Number(n)||0;return '₪'+n.toLocaleString('he-IL',{maximumFractionDigits:2});}
function bhWhen(w){w=String(w||'');var d=new Date(w);if(!w||isNaN(d))return w;return d.toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'numeric',timeZone:'Asia/Jerusalem'})+', '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jerusalem'});}
function bhHour(w){var d=new Date(w);return isNaN(d)?'':d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jerusalem'});}
function bhEmpty(t){return '<div class="bh-empty">'+esc(t)+'</div>';}
function bhLi(a){return (a||[]).map(function(x){return '<p>• '+esc(x)+'</p>';}).join('');}
function bhTag(s){if(!s)return '';var c=/חדש|דחוף/.test(s)?'hot':/פעיל|נסגר|שולם/.test(s)?'ok':'';return '<span class="bh-tag '+c+'">'+esc(s)+'</span>';}
function bhWa(t){window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank','noopener');}
function bhMeetText(m){var t='סיכום הפגישה'+(m.client?' עם '+m.client:'')+(m.at?', '+bhWhen(m.at):'')+BH_NL+BH_NL+(m.summary||'');
 if((m.decisions||[]).length)t+=BH_NL+BH_NL+'הוחלט:'+BH_NL+m.decisions.map(function(x){return '• '+x;}).join(BH_NL);
 if((m.tasksClient||[]).length)t+=BH_NL+BH_NL+'המשימות שלך:'+BH_NL+m.tasksClient.map(function(x){return '• '+x;}).join(BH_NL);
 if(m.next)t+=BH_NL+BH_NL+'פגישת המשך: '+m.next;return t;}
function bhOpen(key){
 var d=bhD(),h='',label='',on=d.on||{};
 if(key==='meet'){
  label='🎙️ סיכומי פגישות';
  h=(d.meet||[]).length?(d.meet||[]).map(function(m,i){
   return '<div class="bh-card"><b>'+esc(m.client||m.title||'פגישה')+'</b>'+(m.client&&m.title?'<div class="bh-meta">'+esc(m.title)+'</div>':'')+'<div class="bh-meta">'+esc(bhWhen(m.at))+(m.minutes?' · '+m.minutes+' דקות':'')+'</div>'
    +(m.summary?'<p>'+esc(m.summary)+'</p>':'')
    +((m.decisions||[]).length?'<div class="bh-box"><small>✅ הוחלט</small>'+bhLi(m.decisions)+'</div>':'')
    +((m.tasksClient||[]).length?'<div class="bh-box cl"><small>📋 משימות ללקוח</small>'+bhLi(m.tasksClient)+'</div>':'')
    +((m.tasksMe||[]).length?'<div class="bh-box me"><small>🙋 משימות שלי</small>'+bhLi(m.tasksMe)+'</div>':'')
    +'<div class="bh-meta" style="margin-top:8px">📅 פגישת המשך: '+esc(m.next||'עוד לא נקבעה')+'</div>'
    +'<div class="bh-row"><button type="button" class="bh-b wa" data-bh-wa="'+i+'">💬 לשלוח ללקוח בוואטסאפ</button></div></div>';
  }).join(''):bhEmpty(on.fireflies?'עוד אין פגישות. פיירפליס מחובר, והפגישה המוקלטת הבאה תופיע כאן עם סיכום, החלטות ומשימות.':'עוד אין פגישות. אחרי שמחברים את פיירפליס, כל פגישה מוקלטת תופיע כאן עם סיכום ומשימות.');
 } else if(key==='clients'){
  label='👥 הלקוחות שלי';
  h=(d.client||[]).length?(d.client||[]).map(function(c){
   var nx=c.next?(c.next.at?bhWhen(c.next.at)+(c.next.title?', '+c.next.title:''):c.next.title):'עוד לא נקבעה';
   return '<div class="bh-card"><b>'+esc(c.name)+'</b>'+bhTag(c.status)+(c.biz?'<div class="bh-meta">'+esc(c.biz)+'</div>':'')
    +'<p>🗓️ פגישה אחרונה: '+esc(c.last?bhWhen(c.last.at):'עוד לא הייתה')+BH_NL+'📅 הבאה: '+esc(nx)+'</p>'
    +((c.openMe||[]).length?'<div class="bh-box me"><small>📌 פתוח אצלי</small>'+bhLi(c.openMe)+'</div>':'')
    +((c.openClient||[]).length?'<div class="bh-box cl"><small>⏳ מחכה מהלקוח</small>'+bhLi(c.openClient)+'</div>':'')+'</div>';
  }).join(''):bhEmpty('עוד אין לקוחות כאן. כל לקוח שמשתתף בפגישה מוקלטת נוסף לבד, ואפשר גם לכתוב לי בצ׳אט: "לקוח חדש: שם, מייל".');
 } else if(key==='cal'){
  label='📅 פגישות ויומן';
  var ev=function(e){return '<div class="bh-card"><b>'+esc(bhHour(e.start))+' · '+esc(e.title||'פגישה')+'</b>'+(e.client||e.where?'<div class="bh-meta">'+esc([e.client,e.where].filter(Boolean).join(' · '))+'</div>':'')+'</div>';};
  var mine=[];(d.client||[]).forEach(function(c){(c.openMe||[]).forEach(function(t){mine.push(c.name+': '+t);});});
  h='<div class="bh-sec">מה יש לי היום</div>'+((d.today||[]).length?(d.today||[]).map(ev).join(''):bhEmpty(on.calendar?'אין פגישות היום.':'היומן עוד לא מחובר. אחרי החיבור ליומן של Outlook, הפגישות של היום יופיעו כאן, כל אחת עם הלקוח שלה.'))
   +((d.soon||[]).length?'<div class="bh-sec">בהמשך</div>'+(d.soon||[]).map(function(e){return '<div class="bh-card"><b>'+esc(bhWhen(e.start))+'</b><div class="bh-meta">'+esc([e.client,e.where].filter(Boolean).join(' · '))+'</div><p>'+esc(e.title||'')+'</p></div>';}).join(''):'')
   +(mine.length?'<div class="bh-sec">משימות שלי מהפגישות</div><div class="bh-card">'+bhLi(mine)+'</div>':'');
 } else if(key==='mail'){
  label='📧 מייל';
  h=(d.mail||[]).length?(d.mail||[]).map(function(m){return '<div class="bh-card"><b>'+esc(m.from||'')+'</b>'+bhTag(m.tag)+'<div class="bh-meta">'+esc(m.subject||'')+(m.at?' · '+esc(bhWhen(m.at)):'')+'</div>'+(m.text?'<p>'+esc(m.text)+'</p>':'')
   +(m.reply?'<div class="bh-box"><small>✨ טיוטת תשובה</small><p>'+esc(m.reply)+'</p></div>':'')+'</div>';}).join('')
   :bhEmpty('המייל עוד לא מחובר. אחרי החיבור ל Gmail, מה שחשוב יופיע כאן לפי דחיפות, עם טיוטת תשובה.');
 } else if(key==='quote'){ return bhQuoteSheet(); }
 shipOpen('bhSheet',label,h,function(el){el.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-bh-wa]');if(!b)return;var m=(bhD().meet||[])[+b.getAttribute('data-bh-wa')];if(m)bhWa(bhMeetText(m));});});
}
// Quotes: prices before VAT, his logo and details, terms per client, and a share to his own WhatsApp.
function bhSaved(){try{return JSON.parse(localStorage.getItem('bhQuotes')||'[]');}catch(e){return [];}}
function bhQuoteSheet(){
 var d=bhD(),cl=d.client||[],all=(d.quote||[]).concat(bhSaved()).sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));});
 var h=(all.length?'<div class="bh-sec">הצעות שהופקו</div>'+all.slice(0,20).map(function(q,i){var s=0;(q.items||[]).forEach(function(r){s+=(Number(r[1])||0)*(Number(r[2])||0);});
   return '<div class="bh-card"><b>'+esc(q.client||'')+'</b><div class="bh-meta">'+esc(q.no||'')+(q.at?' · '+esc(new Date(q.at).toLocaleDateString('he-IL')):'')+(q.subject?' · '+esc(q.subject):'')+'</div><p>לפני מע״מ: '+bhMoney(s)+'</p><div class="bh-row"><button type="button" class="bh-b alt" data-bhq-open="'+i+'">📄 פתיחה ו PDF</button></div></div>';}).join('')
  :'')
  +'<div class="bh-sec">הצעה חדשה</div><div class="bh-card"><div class="bh-f"><label>שם הלקוח</label><input id="bqName" list="bqList" autocomplete="off"><datalist id="bqList">'+cl.map(function(c){return '<option value="'+esc(c.name)+'">';}).join('')+'</datalist></div>'
  +'<div class="bh-f"><label>נושא</label><input id="bqSub"></div>'
  +'<table class="bh-items" id="bqItems"><tr><td style="width:55%">פריט</td><td>כמות</td><td>מחיר לפני מע״מ</td></tr><tr><td><input></td><td><input inputmode="decimal" value="1"></td><td><input inputmode="decimal"></td></tr><tr><td><input></td><td><input inputmode="decimal"></td><td><input inputmode="decimal"></td></tr></table>'
  +'<div class="bh-f"><label>תנאי תשלום</label><input id="bqTerms" value="שוטף + 30"></div>'
  +'<div class="bh-f"><label>תוקף ההצעה, בימים</label><input id="bqValid" inputmode="numeric" value="30"></div>'
  +'<div class="bh-row"><button type="button" class="bh-b alt" data-bhq="row">+ שורה</button><button type="button" class="bh-b" data-bhq="make">להפיק הצעה</button></div></div><div id="bqOut"></div>';
 shipOpen('bhSheet','🧾 הצעות מחיר',h,function(w){
  var nm=w.querySelector('#bqName');
  nm.addEventListener('change',function(){var c=null;cl.forEach(function(x){if(x.name===nm.value)c=x;});if(c&&c.terms)w.querySelector('#bqTerms').value=c.terms;});
  w.addEventListener('click',function(e){
   var b=e.target.closest&&e.target.closest('[data-bhq],[data-bhq-open]');if(!b)return;
   if(b.hasAttribute('data-bhq-open')){var q=all[+b.getAttribute('data-bhq-open')];if(q)bhQuoteShow(q,w);return;}
   var a=b.getAttribute('data-bhq');
   if(a==='row'){w.querySelector('#bqItems').insertAdjacentHTML('beforeend','<tr><td><input></td><td><input inputmode="decimal"></td><td><input inputmode="decimal"></td></tr>');return;}
   if(a==='make'){
    var rows=[].slice.call(w.querySelectorAll('#bqItems tr')).slice(1).map(function(tr){var i=tr.querySelectorAll('input');return [i[0].value.trim(),Number(i[1].value)||0,Number(i[2].value)||0];}).filter(function(r){return r[0]&&r[1]&&r[2];});
    if(!nm.value.trim()||!rows.length){toast('צריך שם לקוח ולפחות שורה אחת עם כמות ומחיר.');return;}
    var no=Number((function(){try{return localStorage.getItem('bhQuoteNo');}catch(x){return 0;}})()||0)+1;try{localStorage.setItem('bhQuoteNo',String(no));}catch(x){}
    var q={id:'q'+Date.now(),at:new Date().toISOString(),no:'הצעה '+(1000+no),client:nm.value.trim(),subject:w.querySelector('#bqSub').value.trim(),items:rows,terms:w.querySelector('#bqTerms').value.trim(),valid:Number(w.querySelector('#bqValid').value)||30};
    var s=bhSaved();s.push(q);try{localStorage.setItem('bhQuotes',JSON.stringify(s.slice(-40)));}catch(x){}
    bhQuoteShow(q,w);
   }
  });
 });
}
function bhQuoteHtml(q){
 var d=bhD(),b=d.biz||{},sum=0;(q.items||[]).forEach(function(r){sum+=(Number(r[1])||0)*(Number(r[2])||0);});
 var vat=Math.round(sum*18)/100,day=new Date(q.at||Date.now()),until=new Date(day.getTime()+(q.valid||30)*864e5);
 return '<div class="bh-q"><div class="hd"><div><h3>הצעת מחיר</h3><div class="bh-meta">'+esc(q.no||'')+' · '+esc(day.toLocaleDateString('he-IL'))+'</div></div>'
  +'<div class="br">'+(d.logo?'<img src="'+d.logo+'" alt="">':'')+(b.name?'<b>'+esc(b.name)+'</b>':'')+(b.sub?esc(b.sub)+'<br>':'')+(b.vat?'עוסק '+esc(b.vat)+'<br>':'')+(b.email?esc(b.email)+'<br>':'')+(b.phone?esc(b.phone):'')+'</div></div>'
  +'<p style="margin:14px 0 0;font:600 15px Heebo,sans-serif">לכבוד: '+esc(q.client||'')+'</p>'+(q.subject?'<p style="margin:4px 0 0;font:400 14px Heebo,sans-serif">הנדון: '+esc(q.subject)+'</p>':'')
  +'<table><tr><th>פריט</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr>'
  +(q.items||[]).map(function(r){return '<tr><td>'+esc(r[0])+'</td><td>'+esc(String(r[1]))+'</td><td>'+bhMoney(r[2])+'</td><td>'+bhMoney(r[1]*r[2])+'</td></tr>';}).join('')
  +'<tr class="tot"><td colspan="3">סה״כ לפני מע״מ</td><td>'+bhMoney(sum)+'</td></tr><tr><td colspan="3">מע״מ 18%</td><td>'+bhMoney(vat)+'</td></tr><tr><td colspan="3">סה״כ כולל מע״מ</td><td>'+bhMoney(sum+vat)+'</td></tr></table>'
  +'<p class="bh-meta" style="margin-top:14px">המחירים לפני מע״מ. תנאי תשלום: '+esc(q.terms||'שוטף + 30')+'. ההצעה בתוקף עד '+esc(until.toLocaleDateString('he-IL'))+'.</p></div>';
}
function bhQuoteText(q){var s=0,t='הצעת מחיר ל'+(q.client||'')+(q.subject?', '+q.subject:'')+BH_NL;(q.items||[]).forEach(function(r){s+=r[1]*r[2];t+='• '+r[0]+(r[1]>1?' × '+r[1]:'')+': '+bhMoney(r[1]*r[2])+BH_NL;});return t+'סה״כ לפני מע״מ: '+bhMoney(s)+BH_NL+'תנאי תשלום: '+(q.terms||'שוטף + 30');}
function bhQuoteShow(q,w){
 var o=w.querySelector('#bqOut');if(!o)return;var html=bhQuoteHtml(q);
 o.innerHTML=html+'<div class="bh-row"><button type="button" class="bh-b" id="bqPdf">הורדה כ PDF</button><button type="button" class="bh-b wa" id="bqWa">💬 שיתוף לוואטסאפ</button></div>';
 o.querySelector('#bqPdf').onclick=function(){var p=document.getElementById('bhPrint');if(!p){p=document.createElement('div');p.id='bhPrint';document.body.appendChild(p);}p.innerHTML=html;document.body.classList.add('bh-print');setTimeout(function(){window.print();setTimeout(function(){document.body.classList.remove('bh-print');},500);},50);};
 o.querySelector('#bqWa').onclick=function(){bhWa(bhQuoteText(q));};
 o.scrollIntoView({behavior:'smooth'});
}
[['gBhMeet','meet'],['gBhClients','clients'],['gBhCal','cal'],['gBhMail','mail'],['gBhQuote','quote']].forEach(function(x){
 var el=document.getElementById(x[0]);if(el)el.addEventListener('click',function(){bhOpen(x[1]);});
});
// A push can open a tile straight away: #bh-meet, #bh-clients, #bh-cal, #bh-mail, #bh-quote.
(function(){var m=/^#bh-(meet|clients|cal|mail|quote)$/.exec(location.hash||'');if(!m)return;var n=0,t=setInterval(function(){if((window.D&&D.bizHome)||++n>40){clearInterval(t);if(window.D&&D.bizHome)bhOpen(m[1]);}},250);})();
`;

module.exports = {
  FILES, dirOf, readList, writeList, bizInfo, logoData, norm, findClient, splitActionItems, decisionsFrom, nextFrom,
  meetingFromTranscript, upsert, clientView, calView, view, ilDay, css, js,
};
