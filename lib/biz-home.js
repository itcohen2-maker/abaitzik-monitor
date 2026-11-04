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
.bh-f textarea,.bq-it textarea{font:400 15.5px/1.5 Heebo,sans-serif;padding:10px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a;direction:rtl;resize:vertical;width:100%;box-sizing:border-box}
.bq-form .bq-h{font:800 15px Heebo,sans-serif;color:var(--ink,#0f1b2a);margin:18px 0 4px;padding-top:12px;border-top:1px solid var(--line,#e2e8f0)}
.bq-form .bq-h:first-child{margin-top:0;padding-top:0;border-top:0}
.bq-logo{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bq-logo img{max-width:140px;max-height:64px;background:#fff;border-radius:8px;padding:4px;border:1px solid #e2e8f0}
.bq-nologo{font:500 13.5px Heebo,sans-serif;color:var(--dim,#6b7c90)}
.bq-up{cursor:pointer}
.bq-it{position:relative;background:#f6f8fb;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin:10px 0;display:flex;flex-direction:column;gap:8px}
.bq-it>input{font:600 16px Heebo,sans-serif;padding:10px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a;direction:rtl;margin-left:34px}
.bq-x{position:absolute;top:12px;left:10px;width:30px;height:30px;border-radius:50%;border:0;background:#e2e8f0;color:#24364b;font-size:14px;cursor:pointer}
.bq-3{display:grid;grid-template-columns:1fr 1.1fr 1.4fr;gap:8px}
.bq-3 label{display:flex;flex-direction:column;gap:4px;font:700 12px Heebo,sans-serif;color:#4a5a6e}
.bq-3 input,.bq-3 select{width:100%;box-sizing:border-box;font:400 15px Heebo,sans-serif;padding:9px 8px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f1b2a}
.bq-wrap{margin-top:14px;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,27,42,.18)}
.bq-doc{background:#fff;color:#1b2533;direction:rtl;text-align:right;font:400 13.5px/1.55 Heebo,sans-serif;padding:26px 22px 18px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bq-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
.bq-biz{display:flex;flex-direction:column;gap:2px;max-width:55%}
.bq-biz img{max-width:150px;max-height:70px;object-fit:contain;margin-bottom:6px;align-self:flex-start}
.bq-biz b{font:800 18px Heebo,sans-serif;color:#13294b}
.bq-biz span{font:400 12.5px Heebo,sans-serif;color:#5b6b7f}
.bq-ttl h2{margin:0 0 6px;font:800 26px Heebo,sans-serif;color:#13294b;letter-spacing:.5px}
.bq-meta{border-collapse:collapse;font:400 12.5px Heebo,sans-serif}
.bq-meta td{padding:1px 0 1px 10px;color:#5b6b7f}.bq-meta td+td{color:#1b2533;font-weight:700}
.bq-bar{height:4px;margin:16px 0 18px;border-radius:2px;background:linear-gradient(90deg,#c9a45c,#13294b 35%)}
.bq-to{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.bq-to>div{background:#f5f7fa;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:1px}
.bq-to small,.bq-sign small{font:700 11px Heebo,sans-serif;color:#8a6d2f;letter-spacing:.3px}
.bq-to b{font:700 14.5px Heebo,sans-serif;color:#13294b}
.bq-to span{font:400 12.5px Heebo,sans-serif;color:#45556a;word-break:break-word}
.bq-sub{margin:18px 0 0;font:700 15px Heebo,sans-serif;color:#13294b}
.bq-intro{margin:8px 0 0;white-space:pre-wrap}
.bq-tab{width:100%;border-collapse:collapse;margin-top:16px}
.bq-tab th{background:#13294b;color:#fff;font:700 12.5px Heebo,sans-serif;padding:8px 6px;text-align:right}
.bq-tab th:first-child{border-radius:0 8px 0 0}.bq-tab th:last-child{border-radius:8px 0 0 0}
.bq-tab td{padding:9px 6px;border-bottom:1px solid #e6eaf0;vertical-align:top;white-space:nowrap}
.bq-tab td:nth-child(2){white-space:normal;width:100%}
.bq-tab tbody tr:nth-child(even) td{background:#fafbfd}
.bq-k{color:#8a96a6}
.bq-ds{font:400 12px/1.5 Heebo,sans-serif;color:#5b6b7f;white-space:pre-wrap;margin-top:2px}
.bq-sum{margin:12px 0 0 0;margin-right:auto;border-collapse:collapse;min-width:230px}
.bq-sum td{padding:5px 8px;font:400 13.5px Heebo,sans-serif}.bq-sum td+td{text-align:left;font-weight:700}
.bq-sum .bq-tot td{background:#13294b;color:#fff;font:800 15px Heebo,sans-serif;padding:9px 10px}
.bq-sum .bq-tot td:first-child{border-radius:0 8px 8px 0}.bq-sum .bq-tot td:last-child{border-radius:8px 0 0 8px}
.bq-terms{margin-top:20px}
.bq-terms h4{margin:0 0 4px;font:800 14px Heebo,sans-serif;color:#13294b}
.bq-terms ol{margin:0;padding-right:20px;font:400 12.5px/1.65 Heebo,sans-serif;color:#33435a}
.bq-sign{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:26px}
.bq-sign>div{display:flex;flex-direction:column;gap:2px}
.bq-sign b{font:600 13px Heebo,sans-serif;color:#1b2533}
.bq-line{border-bottom:1.5px solid #13294b;height:42px}
.bq-sign span{font:400 11.5px Heebo,sans-serif;color:#8a96a6}
.bq-foot{margin-top:22px;padding-top:10px;border-top:1px solid #e6eaf0;text-align:center;font:400 11px Heebo,sans-serif;color:#8a96a6}
@media (max-width:420px){.bq-doc{padding:20px 14px 14px;font-size:12.5px}.bq-to{grid-template-columns:1fr}.bq-tab th,.bq-tab td{padding:7px 3px}.bq-ttl h2{font-size:22px}}
@media print{@page{size:A4;margin:14mm}.bq-doc{padding:0;font-size:12.5px}.bq-tab tr,.bq-sign,.bq-terms{break-inside:avoid}}
.bq-up2{margin:16px 0 6px;padding:16px;border-radius:16px;background:linear-gradient(135deg,#13294b,#1f4f7a);color:#fff;text-align:right}
.bq-up2-t{font:800 16px Heebo,sans-serif}
.bq-up2 p{margin:6px 0 0;font:400 14px/1.6 Heebo,sans-serif;opacity:.92}
.bq-up2-p{display:inline-block;margin:10px 0 10px;padding:4px 12px;border-radius:999px;background:#c9a45c;color:#13294b;font:800 14px Heebo,sans-serif}
.bq-up2 .bh-b{display:block;width:100%;background:#fff;color:#13294b;padding:12px}
.bq-up2 .bh-b:disabled{opacity:.85}
.bq-up2-s{display:block;margin-top:8px;font:500 13px Heebo,sans-serif;opacity:.9}
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
// Quotes. 4.11.2026, Itzik on Shai's monitor: "טמפלט מאוד זול, חסר המון פריטים, אין מקום למלל. תביא משהו ברמה, עם מקום ללוגו, כמו מסמך שאנחנו שולחים לחתימה".
// A full document: logo and business, client block, subject and opening text, items with a description each,
// discount, VAT, terms and schedule, and a signature area for both sides. Prices before VAT. Items stay arrays
// [name, qty, price, desc, unit] so older quotes (three cells) still open.
function bhSaved(){try{return JSON.parse(localStorage.getItem('bhQuotes')||'[]');}catch(e){return [];}}
function bhLogo(){try{var l=localStorage.getItem('bhLogo');if(l)return l;}catch(e){}return bhD().logo||'';}
function bhIt(r){r=r||[];return {name:String(r[0]||''),qty:Number(r[1])||0,price:Number(r[2])||0,desc:String(r[3]||''),unit:String(r[4]||'')};}
var BQ_UNITS=['יח׳','שעות','ימים','חודשים','פרויקט'];
function bqItemHtml(it){it=it||{qty:1};
 return '<div class="bq-it"><button type="button" class="bq-x" data-bhq="del" aria-label="למחוק את הפריט">✕</button>'
  +'<input class="bq-n" placeholder="שם הפריט או השירות" value="'+esc(it.name||'')+'">'
  +'<textarea class="bq-d" rows="2" placeholder="תיאור: מה כולל, היקף, הערות">'+esc(it.desc||'')+'</textarea>'
  +'<div class="bq-3"><label>כמות<input class="bq-q" inputmode="decimal" value="'+esc(String(it.qty||''))+'"></label>'
  +'<label>יחידה<select class="bq-u">'+BQ_UNITS.map(function(u){return '<option'+(u===(it.unit||'יח׳')?' selected':'')+'>'+u+'</option>';}).join('')+'</select></label>'
  +'<label>מחיר ליחידה<input class="bq-p" inputmode="decimal" value="'+esc(it.price?String(it.price):'')+'"></label></div></div>';
}
function bqF(id,label,val,ph,attr){return '<div class="bh-f"><label for="'+id+'">'+label+'</label><input id="'+id+'" value="'+esc(val||'')+'"'+(ph?' placeholder="'+esc(ph)+'"':'')+(attr||'')+'></div>';}
function bqT(id,label,val,ph,rows){return '<div class="bh-f"><label for="'+id+'">'+label+'</label><textarea id="'+id+'" rows="'+(rows||3)+'" placeholder="'+esc(ph||'')+'">'+esc(val||'')+'</textarea></div>';}
function bhQuoteSheet(pre){
 var d=bhD(),cl=d.client||[],all=(d.quote||[]).concat(bhSaved()).sort(function(a,b){return String(b.at||'').localeCompare(String(a.at||''));});
 var q=pre||{},items=(q.items&&q.items.length?q.items.map(bhIt):[{qty:1}]),lg=bhLogo();
 var h=(all.length&&!pre?'<div class="bh-sec">הצעות שהופקו</div>'+all.slice(0,20).map(function(x,i){var s=bqSum(x);
   return '<div class="bh-card"><b>'+esc(x.client||'')+'</b><div class="bh-meta">'+esc(x.no||'')+(x.at?' · '+esc(new Date(x.at).toLocaleDateString('he-IL')):'')+(x.subject?' · '+esc(x.subject):'')+'</div><p>לפני מע״מ: '+bhMoney(s.net)+'</p><div class="bh-row"><button type="button" class="bh-b alt" data-bhq-open="'+i+'">📄 פתיחה ו PDF</button><button type="button" class="bh-b alt" data-bhq-copy="'+i+'">✏️ לשכפל ולערוך</button></div></div>';}).join('')
  :'')
  +'<div class="bh-sec">'+(pre?'עריכה, תצא כהצעה חדשה':'הצעה חדשה')+'</div>'
  +'<div class="bh-card bq-form">'
  +'<div class="bq-h">🖼️ הלוגו שלך</div><div class="bq-logo">'+(lg?'<img id="bqLogoImg" src="'+lg+'" alt="הלוגו">':'<span id="bqLogoImg" class="bq-nologo">עוד אין לוגו. הוא יופיע בראש ההצעה.</span>')
  +'<label class="bh-b alt bq-up">'+(lg?'להחליף לוגו':'להעלות לוגו')+'<input type="file" id="bqLogoIn" accept="image/*" hidden></label></div>'
  +'<div class="bq-h">👤 פרטי הלקוח</div>'
  +'<div class="bh-f"><label for="bqName">שם הלקוח או איש הקשר</label><input id="bqName" list="bqList" autocomplete="off" value="'+esc(q.client||'')+'"><datalist id="bqList">'+cl.map(function(c){return '<option value="'+esc(c.name)+'">';}).join('')+'</datalist></div>'
  +bqF('bqCo','שם החברה',q.co,'לא חובה')+bqF('bqCoId','ח״פ או עוסק מורשה',q.coId,'לא חובה',' inputmode="numeric"')
  +bqF('bqPhone','טלפון',q.phone,'לא חובה',' inputmode="tel"')+bqF('bqMail','מייל',q.mail,'לא חובה',' inputmode="email"')
  +'<div class="bq-h">✍️ ההצעה</div>'
  +bqF('bqSub','הנדון',q.subject,'למשל: ליווי אסטרטגי לשותפות')
  +bqT('bqIntro','פתיח',q.intro,'למשל: בהמשך לפגישתנו, שמחים להגיש הצעה לליווי. להלן הפירוט.',3)
  +'<div class="bq-h">📋 פריטים</div><div id="bqItems">'+items.map(bqItemHtml).join('')+'</div>'
  +'<div class="bh-row" style="margin-top:4px"><button type="button" class="bh-b alt" data-bhq="row">+ פריט</button></div>'
  +bqF('bqDisc','הנחה באחוזים',q.disc?String(q.disc):'','לא חובה',' inputmode="decimal"')
  +'<div class="bq-h">📑 תנאים</div>'
  +bqF('bqTerms','תנאי תשלום',q.terms||'שוטף + 30')
  +bqF('bqWhen','לוח זמנים לביצוע',q.when,'למשל: תחילת עבודה תוך 7 ימים מאישור')
  +bqF('bqValid','תוקף ההצעה, בימים',String(q.valid||30),'',' inputmode="numeric"')
  +bqT('bqNotes','הערות ותנאים נוספים',q.notes,'כל שורה תופיע כסעיף נפרד. למשל: נסיעות מחוץ למרכז בתוספת תשלום',3)
  +'<div class="bh-row"><button type="button" class="bh-b" data-bhq="make">להפיק הצעה</button></div></div><div id="bqOut"></div>'
  // 4.11.2026, Itzik: an offer under the quote. Digital signature is a product of its own, 120 a month; the button asks the admin, who arranges payment.
  +(bqSignOn()?'':'<div class="bq-up2"><div class="bq-up2-t">✍️ ללקוח שלך: חתימה דיגיטלית על ההצעה</div><p>הלקוח מקבל קישור, קורא את ההצעה בטלפון וחותם באצבע. בלי להדפיס ובלי לסרוק. ההצעה החתומה חוזרת אליך כ PDF, עם תאריך, שעה וחתימה.</p><div class="bq-up2-p">120 ₪ לחודש</div><button type="button" class="bh-b" data-bhq="buy">לפנות למנהל לרכישה</button><small class="bq-up2-s" hidden></small></div>');
 shipOpen('bhSheet','🧾 הצעות מחיר',h,function(w){
  var nm=w.querySelector('#bqName');
  nm.addEventListener('change',function(){var c=null;cl.forEach(function(x){if(x.name===nm.value)c=x;});if(!c)return;if(c.terms)w.querySelector('#bqTerms').value=c.terms;if(c.biz&&!w.querySelector('#bqCo').value)w.querySelector('#bqCo').value=c.biz;if(c.email&&!w.querySelector('#bqMail').value)w.querySelector('#bqMail').value=c.email;});
  w.querySelector('#bqLogoIn').addEventListener('change',function(){
   var f=this.files&&this.files[0];if(!f)return;var rd=new FileReader();
   rd.onload=function(){var im=new Image();im.onload=function(){
    var k=Math.min(1,600/im.width,300/im.height),cv=document.createElement('canvas');cv.width=Math.round(im.width*k);cv.height=Math.round(im.height*k);
    cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);var u=cv.toDataURL('image/png');
    try{localStorage.setItem('bhLogo',u);}catch(x){toast('הלוגו גדול מדי לשמירה. אפשר לנסות תמונה קטנה יותר.');return;}
    var o=w.querySelector('#bqLogoImg');var ni=document.createElement('img');ni.id='bqLogoImg';ni.src=u;ni.alt='הלוגו';o.parentNode.replaceChild(ni,o);toast('הלוגו נשמר, והוא יופיע בכל הצעה.');
   };im.src=rd.result;};rd.readAsDataURL(f);
  });
  w.addEventListener('click',function(e){
   var b=e.target.closest&&e.target.closest('[data-bhq],[data-bhq-open],[data-bhq-copy]');if(!b)return;
   if(b.hasAttribute('data-bhq-open')){var x=all[+b.getAttribute('data-bhq-open')];if(x)bhQuoteShow(x,w);return;}
   if(b.hasAttribute('data-bhq-copy')){var y=all[+b.getAttribute('data-bhq-copy')];if(y)bhQuoteSheet(y);return;}
   var a=b.getAttribute('data-bhq');
   if(a==='row'){w.querySelector('#bqItems').insertAdjacentHTML('beforeend',bqItemHtml({qty:1}));var l=w.querySelectorAll('.bq-it .bq-n');if(l.length)l[l.length-1].focus();return;}
   if(a==='del'){var it=b.closest('.bq-it');if(w.querySelectorAll('.bq-it').length>1)it.parentNode.removeChild(it);else[].forEach.call(it.querySelectorAll('input,textarea'),function(i){i.value='';});return;}
   if(a==='buy'){b.disabled=true;var sm=w.querySelector('.bq-up2-s');
    sendText('בקשה ממנהל','בקשה ממנהל: רוצה לרכוש חתימה דיגיטלית על הצעות מחיר, 120 ₪ לחודש.','משימה').then(function(){try{localStorage.setItem('bqSignAsked',new Date().toISOString());}catch(x){}if(typeof arWaitMark==='function')arWaitMark();b.textContent='✓ הבקשה נשלחה';if(sm){sm.hidden=false;sm.textContent='המנהל יחזור אליך בצ׳אט עם פרטי התשלום, ואחרי התשלום זה נפתח לך.';}},function(){b.disabled=false;toast('לא נשלח. תנסה שוב.');});return;}
   if(a==='make'){
    var v=function(id){var el=w.querySelector('#'+id);return el?el.value.trim():'';};
    var rows=[].slice.call(w.querySelectorAll('.bq-it')).map(function(el){return [el.querySelector('.bq-n').value.trim(),Number(el.querySelector('.bq-q').value)||0,Number(el.querySelector('.bq-p').value)||0,el.querySelector('.bq-d').value.trim(),el.querySelector('.bq-u').value];}).filter(function(r){return r[0]&&r[1]&&r[2];});
    if(!nm.value.trim()||!rows.length){toast('צריך שם לקוח ולפחות פריט אחד עם כמות ומחיר.');return;}
    var no=Number((function(){try{return localStorage.getItem('bhQuoteNo');}catch(x){return 0;}})()||0)+1;try{localStorage.setItem('bhQuoteNo',String(no));}catch(x){}
    var nq={id:'q'+Date.now(),at:new Date().toISOString(),no:String(1000+no),client:nm.value.trim(),co:v('bqCo'),coId:v('bqCoId'),phone:v('bqPhone'),mail:v('bqMail'),
     subject:v('bqSub'),intro:v('bqIntro'),items:rows,disc:Math.max(0,Math.min(100,Number(v('bqDisc'))||0)),terms:v('bqTerms'),when:v('bqWhen'),valid:Number(v('bqValid'))||30,notes:v('bqNotes')};
    var s=bhSaved();s.push(nq);try{localStorage.setItem('bhQuotes',JSON.stringify(s.slice(-40)));}catch(x){}
    bhQuoteShow(nq,w);
   }
  });
 });
}
function bqM(n){n=Math.round((Number(n)||0)*100)/100;return '₪'+n.toLocaleString('he-IL',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2});}
function bqL(s){return '<bdi dir="ltr">'+esc(s)+'</bdi>';}
function bqSignOn(){var i=(typeof INSTANCE!=='undefined'&&INSTANCE)||{};return !!i.quoteSign;}
function bqSum(q){var g=0;(q.items||[]).forEach(function(r){var i=bhIt(r);g+=i.qty*i.price;});var dc=Math.round(g*(Number(q.disc)||0))/100,net=g-dc,vat=Math.round(net*18)/100;return {gross:g,disc:dc,net:net,vat:vat,total:net+vat};}
function bhQuoteHtml(q){
 var b=bhD().biz||{},lg=bhLogo(),s=bqSum(q),day=new Date(q.at||Date.now()),until=new Date(day.getTime()+(q.valid||30)*864e5),f=function(x){return x.toLocaleDateString('he-IL');};
 var no=String(q.no||'').replace(/^הצעה /,'');
 var terms=[];if(q.terms)terms.push('תנאי תשלום: '+q.terms+'.');if(q.when)terms.push('לוח זמנים: '+q.when+'.');
 terms.push('המחירים בהצעה אינם כוללים מע״מ, שיתווסף כחוק.');terms.push('ההצעה בתוקף עד '+f(until)+'.');
 String(q.notes||'').split(BH_NL).forEach(function(l){l=l.trim();if(l)terms.push(l);});
 var who=[q.co?esc(q.co):'',q.coId?'ח״פ '+bqL(q.coId):'',q.phone?bqL(q.phone):'',q.mail?bqL(q.mail):''].filter(Boolean);
 return '<div class="bq-doc"><div class="bq-top"><div class="bq-biz">'+(lg?'<img src="'+lg+'" alt="">':'')+(b.name?'<b>'+esc(b.name)+'</b>':'')+(b.sub?'<span>'+esc(b.sub)+'</span>':'')+'</div>'
  +'<div class="bq-ttl"><h2>הצעת מחיר</h2><table class="bq-meta"><tr><td>מספר</td><td>'+esc(no)+'</td></tr><tr><td>תאריך</td><td>'+f(day)+'</td></tr><tr><td>בתוקף עד</td><td>'+f(until)+'</td></tr></table></div></div>'
  +'<div class="bq-bar"></div>'
  +'<div class="bq-to"><div><small>לכבוד</small><b>'+esc(q.client||'')+'</b>'+who.map(function(x){return '<span>'+x+'</span>';}).join('')+'</div>'
  +'<div><small>מאת</small><b>'+esc(b.name||'')+'</b>'+[b.vat?'עוסק '+bqL(b.vat):'',b.phone?bqL(b.phone):'',b.email?bqL(b.email):'',b.address?esc(b.address):''].filter(Boolean).map(function(x){return '<span>'+x+'</span>';}).join('')+'</div></div>'
  +(q.subject?'<p class="bq-sub">הנדון: '+esc(q.subject)+'</p>':'')
  +(q.intro?'<p class="bq-intro">'+esc(q.intro)+'</p>':'')
  +'<table class="bq-tab"><thead><tr><th>#</th><th>פריט</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr></thead><tbody>'
  +(q.items||[]).map(function(r,k){var i=bhIt(r);return '<tr><td class="bq-k">'+(k+1)+'</td><td><b>'+esc(i.name)+'</b>'+(i.desc?'<div class="bq-ds">'+esc(i.desc)+'</div>':'')+'</td><td>'+esc(String(i.qty))+(i.unit&&i.unit!=='יח׳'?' '+esc(i.unit):'')+'</td><td>'+bqM(i.price)+'</td><td>'+bqM(i.qty*i.price)+'</td></tr>';}).join('')
  +'</tbody></table>'
  +'<table class="bq-sum">'+(s.disc?'<tr><td>סה״כ</td><td>'+bqM(s.gross)+'</td></tr><tr><td>הנחה '+esc(String(q.disc))+'%</td><td>'+bqM(s.disc)+'</td></tr>':'')
  +'<tr><td>סה״כ לפני מע״מ</td><td>'+bqM(s.net)+'</td></tr><tr><td>מע״מ 18%</td><td>'+bqM(s.vat)+'</td></tr><tr class="bq-tot"><td>סה״כ לתשלום</td><td>'+bqM(s.total)+'</td></tr></table>'
  +'<div class="bq-terms"><h4>תנאים</h4><ol>'+terms.map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ol></div>'
  +'<div class="bq-sign"><div><small>בכבוד רב</small><b>'+esc(b.name||'')+'</b><div class="bq-line"></div><span>חתימה</span></div>'
  +'<div><small>אישור הלקוח</small><b>קראתי ואני מאשר את ההצעה</b><div class="bq-line"></div><span>שם, תאריך וחתימה</span></div></div>'
  +'<div class="bq-foot">'+[b.name?esc(b.name):'',b.vat?'עוסק '+bqL(b.vat):'',b.phone?bqL(b.phone):'',b.email?bqL(b.email):''].filter(Boolean).join(' · ')+'</div></div>';
}
function bhQuoteText(q){var s=bqSum(q),t='הצעת מחיר ל'+(q.client||'')+(q.subject?', '+q.subject:'')+BH_NL;(q.items||[]).forEach(function(r){var i=bhIt(r);t+='• '+i.name+(i.qty>1?' × '+i.qty:'')+': '+bhMoney(i.qty*i.price)+BH_NL;});if(s.disc)t+='הנחה '+q.disc+'%'+BH_NL;return t+'סה״כ לפני מע״מ: '+bhMoney(s.net)+BH_NL+'תנאי תשלום: '+(q.terms||'שוטף + 30');}
function bhQuoteShow(q,w){
 var o=w.querySelector('#bqOut');if(!o)return;var html=bhQuoteHtml(q);
 o.innerHTML='<div class="bq-wrap">'+html+'</div><div class="bh-row"><button type="button" class="bh-b" id="bqPdf">הורדה כ PDF</button><button type="button" class="bh-b wa" id="bqWa">💬 שיתוף לוואטסאפ</button></div>';
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
