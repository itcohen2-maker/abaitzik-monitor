'use strict';
/*
  23.11.2026, Itzik, about a new monitor lead (t1e9dd5): "תעדכן אותי בכל מה שקשור לליד החדש הזה".
  Follows the customers listed in data/status/lead-watch.json (["t1e9dd5"]) and sends Itzik one WhatsApp
  message (notify.js --lead) per run with everything new: he entered the monitor, what he asked (with the
  transcription of a voice note), what the monitor answered, a quote, a connection, a change in his plan.
  A monitor answer that corrects itself ("תיקון:") is marked ⚠️. Runs as root (customer folders are his own
  user's), every 5 minutes from cron, so there is at most one message per 5 minutes per customer.
  The first run of a customer only takes a snapshot, it never floods with the past.
  Usage: node lead-watch.js [--dry]     add or remove a customer: edit data/status/lead-watch.json
*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const LIST = path.join(DATA, 'status', 'lead-watch.json');
const STATE = path.join(DATA, 'status', 'lead-watch-state.json');
const DRY = process.argv.includes('--dry');

const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const hm = (t) => new Date(t).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function snapshot(id) {
  const dir = '/home/' + id + '/' + id + '-monitor';
  const inst = rd(path.join(dir, 'instance.json'), {});
  const d = path.join(dir, 'data');
  const chatDir = path.join(d, 'chat', 'chat');
  const chat = ls(chatDir).filter((f) => f.endsWith('.json')).sort();
  const visits = (rd(path.join(DATA, 'visits', id + '.json'), {}).sessions || []);
  const quotes = rd(path.join(d, 'biz-home', 'quotes.json'), []);
  const conn = ls(path.join(d, 'conn')).sort();
  const plan = rd('/srv/monitor-changes/' + id + '.plan.json', {});
  return { name: String(inst.owner || inst.pageTitle || id).replace(/^המוניטור של /, ''), chatDir, chat, visits, quotes: Array.isArray(quotes) ? quotes : [], conn, plan: plan.plan || '' };
}

function events(prev, cur) {
  const ev = [];
  const seenS = new Set((prev.sids || []));
  cur.visits.filter((s) => !seenS.has(s.sid)).forEach((s) => ev.push({ at: s.start, line: '👀 נכנס למוניטור (' + (s.dev === 'phone' ? 'טלפון' : s.dev || 'מחשב') + ')' }));
  const seenC = new Set(prev.chat || []);
  cur.chat.filter((f) => !seenC.has(f)).forEach((f) => {
    const m = rd(path.join(cur.chatDir, f), null);
    if (!m || m.mergedInto) return;
    const at = Date.parse(m.at) || 0;
    if (m.from === 'claude') {
      const fix = /^תיקון:/.test(String(m.text || ''));
      ev.push({ at, line: (fix ? '⚠️ המוניטור תיקן את עצמו: ' : '🤖 המוניטור ענה: ') + cut(m.text, 220) });
    } else {
      const tr = /תמלול:\s*(.+)/.exec(String(m.note || ''));
      const txt = tr ? '🎙️ ' + tr[1].replace(/\s*\(.*\)\s*$/, '') : String(m.text || '').replace(/^וואטסאפ\n/, '').replace(/^הודעה קולית מהמוניטור\s*/, '').replace(/^🎙️ הודעה קולית מוואטסאפ:\s*/, '🎙️ ');
      ev.push({ at, line: '💬 ' + (m.via === 'wa-bridge' ? 'כתב בוואטסאפ: ' : 'כתב במוניטור: ') + cut(txt, 220) });
    }
  });
  const seenQ = new Set(prev.qids || []);
  cur.quotes.filter((q) => !seenQ.has(q.id)).forEach((q) => {
    const sum = (q.items || []).reduce((a, it) => a + (Number(it[1]) || 0) * (Number(it[2]) || 0), 0) * (1 - (Number(q.disc) || 0) / 100);
    ev.push({ at: Date.parse(q.at) || 0, line: '🧾 הצעת מחיר ' + (q.no || '') + ' ל' + cut(q.client, 30) + ': ' + cut(q.subject, 60) + ', ' + Math.round(sum).toLocaleString('he-IL') + ' ₪ לפני מע״מ' });
  });
  const seenK = new Set(prev.conn || []);
  cur.conn.filter((c) => !seenK.has(c)).forEach((c) => ev.push({ at: Date.now(), line: '🔌 חיבור חדש: ' + c.replace(/\.json$/, '') }));
  if (prev.plan !== undefined && cur.plan !== prev.plan) ev.push({ at: Date.now(), line: '💳 המסלול השתנה: ' + (prev.plan || 'אין') + ' ← ' + (cur.plan || 'אין') });
  return ev.sort((a, b) => a.at - b.at);
}

function main() {
  const ids = rd(LIST, []);
  const state = rd(STATE, {});
  ids.forEach((id) => {
    const cur = snapshot(id);
    const prev = state[id];
    const keep = { sids: cur.visits.map((s) => s.sid), chat: cur.chat, qids: cur.quotes.map((q) => q.id), conn: cur.conn, plan: cur.plan };
    if (!prev) { state[id] = keep; console.log(id + ': snapshot'); return; }
    const ev = events(prev, cur);
    if (ev.length) {
      const body = ev.slice(0, 15).map((e) => (e.at ? hm(e.at) + ' ' : '') + e.line).join('\n') + (ev.length > 15 ? '\nועוד ' + (ev.length - 15) : '');
      console.log(id + ':\n' + body);
      if (!DRY) {
        const r = spawnSync('sudo', ['-u', 'monitor', 'env', 'HOME=/home/monitor', 'node', 'notify.js', '📍 ' + cur.name, body, '--lead'], { cwd: ROOT, timeout: 60000, encoding: 'utf8' });
        // notify.js queues what it could not deliver and retries it itself, so a failed push is never sent again from here
        // (23.11: the phone push was blocked, the WhatsApp copy went out, and this repeated it every 5 minutes).
        console.log(id + ': ' + (/whatsapp copy: \w/.test(String(r.stdout)) ? 'sent on WhatsApp' : r.status === 0 ? 'sent' : 'queued by notify.js'));
      }
    }
    if (!DRY) state[id] = keep;
  });
  if (!DRY) { fs.writeFileSync(STATE, JSON.stringify(state)); spawnSync('chown', ['monitor:monitor', STATE]); }
}
main();
