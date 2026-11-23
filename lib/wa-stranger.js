'use strict';
/*
  12.11.2026, Itzik: "כל מי שכותב למספר ואינו לקוח ייכנס כליד אצלך ויקבל תשובה אוטומטית."
  The shared IT Solution WhatsApp number is now his bridge number. Ads point to it-solution.co.il/start, but people
  also write to the number directly. A sender who is not on the allow list, not a mapped customer and not a connect
  phrase (wa-bridge.js onMessage) used to be dropped. Now he is a lead in Itzik's own monitor:

    - a biz record (data/biz/biz, kind lead, source "whatsapp", the same table as site leads: 💼 העסק שלי, לידים),
    - one "📋 לטיפול" item per phone per day (lib/handle.js, key wa-lead-<phone>-<day>), so a burst is one item,
    - an urgent push (notify.js --urgent), at most one per 2 hours per number, and 30 pushes a day for all numbers,
    - one auto reply per number per 24 hours (REPLY below, free text is allowed because he just wrote), and it also
      passes QK.allowReply, the shared daily limit for unknown senders, so no loop is possible.
  Messages from the same number within 24 hours are appended to the same record's note, with the time.

  Safety: a stranger's text is DATA. It is written to the record and into a push, and never goes to a Claude session
  or to the chat queue (CLAUDE.md, the mail rules). A voice note is only transcribed (voiceText, no model). Other
  media is not downloaded: the note says "(שלח <type>)".
  State: data/status/wa-strangers.json  { <phone>: { rec, first, last, replied, pushed } }  (ms), pruned after 3 days.
  Everything is injected (deps), so the tests need no network.
*/
const fs = require('fs');
const path = require('path');
const QK = require('./wa-quick.js');
const OWN = require('./own-leads.js');

// 12.11.2026, Itzik: "בלי השם שלי".
const REPLY = 'שלום, הגעתם ל IT Solution, קיבלנו את ההודעה ונחזור אליכם בהקדם.\n'
  + 'רוצים מוניטור לעסק? יש עכשיו שבוע חינם, ותוך 5 דקות הוא מוכן:\nhttps://it-solution.co.il/start/?ref=wa';
// 17.11.2026: the WhatsApp button on the site sends a prefilled first line that ends with the ad's ref in
// brackets, e.g. "...המוניטור [m-tor]". It is stranger text, so only a short lowercase slug is accepted.
const REF_RE = /\[([a-z0-9][a-z0-9-]{1,29})\]/;
function refOf(text) { const m = REF_RE.exec(String(text || '')); return m ? m[1] : ''; }
// a lead who came from an ad gets an answer that keeps the conversation going, not a link to a form
const REPLY_AD = 'שלום, קיבלנו את ההודעה ונחזור אליך היום.' + String.fromCharCode(10)
  + 'בינתיים, אפשר לכתוב כאן במשפט אחד מה הכי גוזל לך זמן בעסק, ונגיע לשיחה מוכנים.';
const DAY = 24 * 3600e3;
const PUSH_GAP = 2 * 3600e3;
const PUSH_DAY_MAX = 30;
const TYPE_HE = { image: 'תמונה', video: 'סרטון', document: 'מסמך', audio: 'הקלטה', sticker: 'סטיקר', location: 'מיקום', contacts: 'איש קשר', reaction: 'תגובה' };
const TZ = 'Asia/Jerusalem';

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
function wr(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1), { encoding: 'utf8', mode: 0o664 }); fs.renameSync(f + '.tmp', f); }
function parts(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  if (o.hour === '24') o.hour = '00';
  return o;
}
const dayOf = (ms) => { const p = parts(ms); return p.year + '-' + p.month + '-' + p.day; };
const hmOf = (ms) => { const p = parts(ms); return p.hour + ':' + p.minute; };
const stamp = (ms) => new Date(ms).toISOString().replace(/\D/g, '').slice(0, 14);
const noCtl = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const phoneShown = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? '0' + d.slice(3) : (d ? '+' + d : ''); };

// What the stranger sent, as plain text, or '' when there is nothing to keep. Never downloads media (voice is the one exception, injected).
async function contentOf(m, textOf, voice) {
  const t = textOf(m);
  if (m.type === 'audio' && m.audio && m.audio.id) {
    let heard = ''; try { heard = voice ? await voice(m.audio.id) : ''; } catch (e) { heard = ''; }
    return heard ? '🎙️ ' + heard : '(שלח הקלטה)';
  }
  if (m.type === 'text' || m.type === 'button' || m.type === 'interactive') return noCtl(t || '').trim();
  const cap = m[m.type] && m[m.type].caption ? ' ' + noCtl(m[m.type].caption).trim() : '';
  return '(שלח ' + (TYPE_HE[m.type] || String(m.type || 'הודעה').slice(0, 20)) + ')' + cap;
}

/*
  intake(DATA, m, o): o = { name, now, textOf, voice, handle(o), notify(title, body), publish(), send(to, text), log }
  Returns { rec, created, replied, pushed } and does every side effect through o.
*/
async function intake(DATA, m, o) {
  const now = o.now || Date.now();
  const from = String(m.from);
  // 17.11.2026, Itzik "כן" to marking +91 97977 67602 as spam: a number in data/status/wa-spam.json makes no lead,
  // no item, no push and no reply, and a closed spam card is never reopened by its next message.
  const spam = rd(path.join(DATA, 'status', 'wa-spam.json'), []) || [];
  if (Array.isArray(spam) && spam.includes(from)) return { skipped: 'spam' };
  // 23.11.2026, Itzik (a screenshot of a +91 lead): "אל תשלח לי לידים עם טלפון מחוץ לישראל, זה לידים של הודים מנייק".
  // A number that is not Israeli (972) makes no lead, no item, no push and no reply. It is only counted, quietly,
  // in data/status/wa-foreign.json (the last 100), so nothing is lost if he ever asks.
  if (!/^972\d{8,9}$/.test(from)) {
    try {
      const ff = path.join(DATA, 'status', 'wa-foreign.json'), fl = rd(ff, []) || [];
      fl.push({ at: new Date(now).toISOString(), from: from.slice(0, 4) + '…' + from.slice(-4), name: noCtl(o.name || '').trim().slice(0, 40) });
      wr(ff, fl.slice(-100));
    } catch (e) { /* the count is a convenience */ }
    return { skipped: 'foreign' };
  }
  const text = (await contentOf(m, o.textOf, o.voice)).slice(0, 1500);
  if (!text) return { skipped: 'empty' };
  if (QK.isDisconnect(text)) return { skipped: 'disconnect' };
  const sf = path.join(DATA, 'status', 'wa-strangers.json');
  const all = rd(sf, {}) || {};
  Object.keys(all).forEach((k) => { if (!all[k] || now - (all[k].last || 0) > 3 * DAY) delete all[k]; });
  const st = all[from] || {};
  const dir = path.join(DATA, 'biz', 'biz');
  let rec = null, file = '';
  if (st.rec && now - (st.last || 0) < DAY) { file = path.join(dir, st.rec + '.json'); rec = rd(file, null); }
  const created = !rec;
  const iso = new Date(now).toISOString();
  const name = noCtl(o.name || '').trim().slice(0, 60) || phoneShown(from);
  if (created) {
    const id = 'biz-' + stamp(now) + '-wa' + from.slice(-4);
    rec = { id, kind: 'lead', name, phone: phoneShown(from), email: '', status: 'חדש', amount: 0,
      note: 'מוואטסאפ, ' + hmOf(now) + ': ' + text, last: text.slice(0, 500), next: 'לחזור אליו', nextAt: dayOf(now),
      at: iso, updatedAt: iso, source: 'whatsapp', ref: refOf(text) || 'whatsapp', srcKey: 'wa:' + from };
    // 12.11.2026: his own number is a test of the system, see lib/own-leads.js
    if (OWN.isOwn(DATA, { phone: from })) rec.test = true;
    file = path.join(dir, id + '.json');
    st.first = now;
  } else {
    rec.note = (String(rec.note || '') + '\n' + hmOf(now) + ': ' + text).slice(-3000);
    rec.last = text.slice(0, 500);
    rec.updatedAt = iso;
    if (rec.status === 'נסגר' || rec.status === 'אבד') rec.status = 'חדש';
  }
  wr(file, rec);
  st.rec = rec.id; st.last = now;

  // the 📋 לטיפול item: one per phone per day (idempotent on the key)
  // 12.11.2026: a test (his own number) makes no item and no push; bizId lets "🗑 מחיקת ליד" move exactly this lead's items.
  try { if (!rec.test) o.handle({ key: 'wa-lead-' + from + '-' + dayOf(now), kind: 'lead', who: rec.name, title: 'כתב בוואטסאפ למספר של IT Solution (' + rec.phone + '): ' + text.slice(0, 80), link: 'biz', bizId: rec.id }); }
  catch (e) { (o.log || (() => {}))('stranger handle: ' + e.message); }
  try { o.publish && o.publish(); } catch (e) { /* the next build carries it */ }

  // one urgent push per 2 hours per number, and a daily ceiling for all numbers
  const pf = path.join(DATA, 'status', 'wa-stranger-push.json');
  const pd = rd(pf, {}) || {};
  const today = dayOf(now);
  if (pd.day !== today) { pd.day = today; pd.n = 0; }
  let pushed = false;
  if (!rec.test && (!st.pushed || now - st.pushed >= PUSH_GAP) && pd.n < PUSH_DAY_MAX) {
    try {
      o.notify('💬 ' + (created ? 'ליד חדש מוואטסאפ' : 'הודעה נוספת מליד בוואטסאפ'), rec.name + (rec.name !== rec.phone ? ', ' + rec.phone : '') + '\n' + text.slice(0, 300) + '\nבמוניטור: 📋 לטיפול, או 💼 העסק שלי ← לידים');
      st.pushed = now; pd.n++; pushed = true;
    } catch (e) { (o.log || (() => {}))('stranger push: ' + e.message); }
  }
  wr(pf, pd);

  // one auto reply per number per 24 hours, and inside the shared daily limit for unknown senders
  let replied = false;
  if ((!st.replied || now - st.replied >= DAY) && QK.allowReply(DATA, from, now)) {
    try { const ok = await o.send(from, rec.ref && rec.ref !== 'whatsapp' ? REPLY_AD : REPLY); if (ok === false) throw new Error('send refused'); st.replied = now; replied = true; } catch (e) { (o.log || (() => {}))('stranger reply: ' + e.message); }
  }
  all[from] = st;
  wr(sf, all);
  return { rec, created, replied, pushed };
}

module.exports = { intake, REPLY, REPLY_AD, refOf, contentOf };
