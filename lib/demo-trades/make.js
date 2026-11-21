'use strict';
/*
  21.11.2026: one maker for the trade demos (beauty, consult, photo). A demo is a spec of invented data; this
  writes it in the monitor's file formats, with dates relative to today, as lib/demo-data.js does for its own.
  spec: {
    BIZ {name, owner, sub, city}, mail, about [lines for the chat], brief [lines of the morning report],
    CLIENTS [{id, name, status, terms, note}],
    TODAY, TOMORROW [[hh:mm, minutes, clientId, what, where]],
    REMINDERS [[plusDays, hh:mm, text]]      "head: rest", today's ones are on the day ring
    DEBTORS [[name, amount, days]], QUOTES [{no, client, subject, items, terms, ago, signed}],
    TASKS [[plusDays, text]], MEETINGS [{d, hh, title, client, people, summary, decisions, tasksMe, tasksClient, next}]
  }
  Every name, phone and mail in a spec is invented.
*/
const fs = require('fs');
const path = require('path');
const { ilDay, at, iso, pastIso, addMin, writeJson } = require('../demo-data.js');

const shekel = (n) => Number(n).toLocaleString('he-IL') + ' ₪';
const sum = (q) => q.items.reduce((a, [, n, p]) => a + n * p, 0);

function make(S) {
  const cname = (id) => { const c = S.CLIENTS.find((x) => x.id === id); return c ? c.name : ''; };
  function events(now) {
    const ev = [];
    // 21.11.2026: a demo with appointments (S.seedBookings) has its events written from the bookings (syncEvents), not by hand
    if (S.seedBookings) return ev;
    const add = (day, list) => (list || []).forEach(([t, len, cid, what, where], i) => ev.push({
      id: 'e' + day + '-' + i, start: at(now, day, t), end: at(now, day, addMin(t, len)),
      title: what + ': ' + cname(cid), where: where || '', attendees: [], clientId: cid || '',
    }));
    add(0, S.TODAY); add(1, S.TOMORROW);
    return ev;
  }
  const brief = () => S.brief.join('\n');
  function context(now) {
    now = now || Date.now();
    const l = ['העסק: ' + S.BIZ.name + ', ' + S.BIZ.sub + '. הבעלים: ' + S.BIZ.owner + '.'].concat(S.about || []);
    const line = ([t, , c, w, where]) => t + ' ' + w + (where ? ', ' + where : '') + (c ? ' (' + cname(c) + ')' : '');
    l.push('היום (' + ilDay(now, 0) + '): ' + (S.TODAY || []).map(line).join('; ') + '.');
    if ((S.TOMORROW || []).length) l.push('מחר: ' + S.TOMORROW.map(line).join('; ') + '.');
    l.push('לקוחות: ' + S.CLIENTS.map((c) => c.name + ' (' + c.status + (c.terms ? ', ' + c.terms : '') + '): ' + c.note).join(' | '));
    if ((S.DEBTORS || []).length) l.push('תשלומים פתוחים: ' + S.DEBTORS.map(([n, a, d]) => n + ' ' + shekel(a) + ', ' + d + ' ימים').join('; ') + '. תזכורות בשם המשרד מוכנות לשליחה.');
    if ((S.QUOTES || []).length) l.push('הצעות מחיר: ' + S.QUOTES.map((q) => q.no + ' ' + q.client + ', ' + q.subject + ', ' + shekel(sum(q)) + ' לפני מע״מ, ' + (q.signed ? 'נחתמה' : 'נשלחה לפני ' + q.ago + ' ימים ועוד לא נחתמה')).join('; ') + '.');
    if ((S.REMINDERS || []).length) l.push('תזכורות: ' + S.REMINDERS.map(([d, hh, t]) => (d === 0 ? 'היום' : 'מחר') + ' ' + hh + ' ' + t).join(' | '));
    if ((S.TASKS || []).length) l.push('משימות: ' + S.TASKS.map(([d, t]) => (d === 0 ? 'היום' : d === 1 ? 'מחר' : 'בעוד יומיים') + ': ' + t).join(' | '));
    if ((S.MEETINGS || []).length) l.push('סיכומי פגישות מוקלטות: ' + S.MEETINGS.map((m) => m.title + ': ' + m.summary + ' החלטות: ' + m.decisions.join(', ') + '. המשימות שלי: ' + m.tasksMe.join(', ') + '. הבא: ' + m.next).join(' | '));
    return l.join('\n');
  }
  function seed(dataPath, now) {
    now = now || Date.now();
    const W = (rel, o) => writeJson(path.join(dataPath, rel), o);
    for (const d of ['biz/biz', 'tasks/tasks', 'reminders/reminders', 'reports/reports', 'chat/chat', 'routines', 'sendlist/sendlist', 'notes', 'ads', 'rivhit', 'bookings'])
      fs.rmSync(path.join(dataPath, d), { recursive: true, force: true });
    W('biz-home/clients.json', S.CLIENTS.map((c) => Object.assign({ biz: '', emails: [], domains: [], aliases: [] }, c)));
    W('biz-home/events.json', events(now));
    // 21.11.2026: S.seedBookings(dataPath, now) writes data/bookings and then the events from them (lib/bookings.js)
    const nb = S.seedBookings ? S.seedBookings(dataPath, now) : 0;
    W('biz-home/meetings.json', (S.MEETINGS || []).map((m, i) => ({ id: 'mdemo' + i, src: 'fireflies', title: m.title, at: iso(now, m.d, m.hh), clientId: '', client: m.client,
      people: m.people, summary: m.summary, decisions: m.decisions, tasksClient: m.tasksClient || [], tasksMe: m.tasksMe, next: m.next, keywords: [] })));
    W('biz-home/mail.json', []);
    W('biz-home/quotes.json', (S.QUOTES || []).map((q, i) => ({ id: 'q' + (i + 1), at: new Date(now - q.ago * 864e5).toISOString(), no: q.no, client: q.client,
      subject: q.subject, items: q.items, terms: q.terms, valid: '30 יום', notes: q.signed ? 'נחתמה דיגיטלית' : 'נשלחה לחתימה דיגיטלית', signed: !!q.signed })));
    const D = S.DEBTORS || [];
    W('money/money.json', { at: pastIso(now, 0, '07:00'), cash: S.cash || 18400, debt: D.reduce((a, x) => a + x[1], 0), late: D.filter((x) => x[2] > 30).reduce((a, x) => a + x[1], 0),
      forecast90: [], anomalies: [], debtors: D });
    if ((S.MEETINGS || []).length) W('keys.json', { firefliesKey: 'demo-not-a-real-key' });
    const got = new Date(now - 20 * 864e5).toISOString();
    W('conn/setup.json', { tok: 'de00de00de00de00de00', steps: [{ id: 'google', icon: '📧', title: 'גוגל: מייל, יומן ודרייב', oauth: { provider: 'google' } }],
      state: { google: { got, revokedAt: '', who: S.mail } }, ready: { google: true } });
    W('conn/wa.json', { phone: '972500000123', via: 'shared' });
    W('conn/partner.json', { pageName: S.BIZ.name });
    W('status/features.json', { wa: true, money: true });
    (S.TASKS || []).forEach(([d, text], i) => W('tasks/tasks/demo-' + i + '.json', { id: 'demo-t' + i, day: ilDay(now, d), text, n: i + 1 }));
    (S.REMINDERS || []).forEach(([d, hh, text], i) => W('reminders/reminders/demo-r' + i + '.json', { at: new Date(now).toISOString(), due: iso(now, d, hh), text }));
    W('reports/reports/demo-brief.json', { at: pastIso(now, 0, '06:30'), title: 'דוח בוקר', body: brief() });
    const q1 = pastIso(now, 0, '06:45'), a1 = pastIso(now, 0, '06:46');
    W('chat/chat/demo-q1.json', { at: q1, from: 'itzik', id: 'demo-q1', text: 'מה יש לי היום?', status: 'done', ackAt: q1 });
    W('chat/chat/demo-a1.json', { at: a1, from: 'claude', re: 'demo-q1', text: brief() });
    return { clients: S.CLIENTS.length, events: events(now).length, bookings: nb, quotes: (S.QUOTES || []).length, debts: D.length };
  }
  return { BIZ: S.BIZ, seed, context, brief };
}

module.exports = { make };
