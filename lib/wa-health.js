'use strict';
/*
  16.11.2026, Itzik: "בדיקה של הוואטסאפ היא מתקינה לכל המוניטורים. אנחנו לא יכולים להרשות לעצמנו שמשהו יישבר בדרך."
  That morning answers to tasks written in the page's chat box stayed on the page and never reached his WhatsApp,
  and nothing noticed. This check reads only what the bridge itself recorded (data/status/wa-bridge.json, the
  chat folders and /var/log/monitor-wa.log). It never sends a test message, to him or to a customer.

  Every WhatsApp number goes through Itzik's bridge, so one check on his monitor covers every monitor:
  his own number (allow[0] in data/wa.json) and every customer in data/wa-tenants.json.

  What counts as broken:
   1. the bridge service is not running;
   2. a missed answer: a question from WhatsApp or from the page chat box (first line וואטסאפ or שיחה) in the
      last 24 hours, answered by claude more than 15 minutes ago, and the answer never went out. For a customer
      only questions written after his WhatsApp was connected (map[phone].at), as Itzik asked the same day;
   3. failures in the bridge log in the last 8 hours: a send that failed and was not sent later, a message Meta
      reports as failed (with its reason, e.g. 131042 payment), a reminder or customer send not delivered.
*/
const fs = require('fs');
const path = require('path');

const KINDS = ['וואטסאפ', 'שיחה'];
const DAY = 24 * 3600e3;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

// The questions and claude's answers in one chat folder, within the window.
function missedIn(dir, sentKey, sent, from, now) {
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { return { n: 0, err: true }; }
  const qs = new Map(), ans = [];
  files.forEach(function (f) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return; }
    if (!j) return;
    const at = Date.parse(j.at || '');
    if (!(at > now - DAY)) return;
    if (j.from === 'itzik' && j.id && KINDS.indexOf(String(j.text || '').split('\n')[0].trim()) > -1 && at >= from) qs.set(j.id, j);
    else if (j.from === 'claude' && j.re && j.text) ans.push({ f, at, re: j.re, text: j.text });
  });
  const missed = ans.filter(a => qs.has(a.re) && now - a.at > 15 * 60e3 && !sent[sentKey(a.f)]);
  return { n: missed.length, q: qs.size, items: missed.map(a => ({ re: a.re, at: a.at })), first: missed[0] ? String(qs.get(missed[0].re).text || '').split('\n').slice(1).join(' ').slice(0, 60) : '' };
}

// Failures in the log lines of the last 8 hours. A failed send that went out later is not a failure.
function logFailures(lines, now) {
  const since = now - 8 * 3600e3, out = new Set(), fails = [];
  lines.forEach(function (l) {
    const at = Date.parse(l.slice(0, 24));
    if (!(at >= since)) return;
    const rest = l.slice(25);
    let m;
    if ((m = /^out (\S+)/.exec(rest))) out.add(m[1]);
    else if ((m = /^send failed (\S+?):/.exec(rest))) fails.push({ file: m[1], why: 'שליחה נכשלה' });
    else if ((m = /^status failed \S+ (\d+) (.*)$/.exec(rest))) fails.push({ why: 'מטא דחתה הודעה: ' + m[1] + ' ' + m[2].slice(0, 60) });
    else if (/not delivered|^wa push failed|^tenant send failed|^tenant out failed|^!! /.test(rest)) fails.push({ why: rest.slice(0, 80) });
  });
  return fails.filter(x => !x.file || !out.has(x.file));
}

function check(o) {
  const now = o.now || Date.now();
  const data = o.dataPath;
  const st = readJson(path.join(data, 'status', 'wa-bridge.json'), {}) || {};
  const sent = st.sent || {};
  const cfg = readJson(path.join(data, 'wa.json'), {}) || {};
  const map = readJson(path.join(data, 'wa-tenants.json'), {}) || {};
  const monitors = [];
  const own = String((cfg.allow || [])[0] || '');
  if (own) {
    const r = missedIn(path.join(data, 'chat', 'chat'), f => f, sent, 0, now);
    monitors.push({ name: 'abaitzik', missed: r.n, first: r.first, items: r.items || [], to: own });
  }
  Object.keys(map).forEach(function (phone) {
    const t = map[phone]; if (!t || !t.tenant || !t.dir) return;
    const from = Date.parse(t.at || '') || now;
    const r = missedIn(path.join(t.dir, 'data', 'chat', 'chat'), f => t.tenant + '/' + f, sent, from, now);
    monitors.push({ name: t.tenant, missed: r.n, first: r.first, unreadable: !!r.err, items: r.items || [], to: phone, tenant: t.tenant, dir: t.dir });
  });
  let lines = [];
  try { lines = (o.logText !== undefined ? o.logText : fs.readFileSync(o.logPath || '/var/log/monitor-wa.log', 'utf8').slice(-400000)).split('\n'); } catch (e) { lines = null; }
  const fails = lines ? logFailures(lines, now) : [];
  const active = typeof o.isActive === 'function' ? o.isActive() : true;
  return { at: new Date(now).toISOString(), active, monitors, fails, logRead: !!lines };
}

function isActive() {
  try { return require('child_process').execFileSync('systemctl', ['is-active', 'monitor-wa'], { encoding: 'utf8', timeout: 5000 }).trim() === 'active'; } catch (e) { return false; }
}

// A short list of what is broken, empty when all is well. Shared by the manager's line and the watcher.
function problems(h) {
  if (!h) return [];
  const p = [];
  if (!h.active) p.push('הגשר לוואטסאפ לא רץ, שום הודעה לא נכנסת ולא יוצאת');
  if (h.logRead === false) p.push('לא הצלחתי לקרוא את היומן של הגשר');
  (h.monitors || []).forEach(function (m) {
    if (m.unreadable) p.push(m.name + ': אין גישה לתיקיית ההודעות');
    if (m.missed) p.push(m.name + ': ' + (m.missed === 1 ? 'תשובה אחת לא יצאה' : m.missed + ' תשובות לא יצאו') + ' לוואטסאפ' + (m.first ? ' ("' + m.first + '")' : ''));
  });
  if ((h.fails || []).length) p.push((h.fails.length === 1 ? 'תקלה אחת' : h.fails.length + ' תקלות') + ' ביומן ב 8 שעות: ' + h.fails[0].why);
  return p;
}

/*
  16.11.2026, Itzik: "אם יש התראה על תקלה, אל תשלח לי הודעה, אלא אם כן ב 10 דקות או ב 5 דקות הקרובות לא הצלחת לתקן."
  What can be fixed here is fixed at once, before anyone is told:
   - the bridge is down: restart it (sudo -n, the one command allowed in /etc/sudoers.d/monitor-wa-health);
   - an answer that did not go out: put its question back on the bridge's waiting list, with page: true so it goes
     through sendOwner (template outside the 24 hours); the bridge sends it within 5 seconds. Each answer is put
     back at most 3 times (state.tries), so a send that keeps failing does not loop.
  A failure Meta reports (payment, an undeliverable number) has no fix here; it waits out the grace and is reported.
*/
function repair(h, o) {
  const done = [];
  const data = o.dataPath, tries = o.tries || {};
  if (h && !h.active) {
    try { (o.restart || defaultRestart)(); done.push('הגשר הופעל מחדש'); } catch (e) { done.push('הפעלה מחדש של הגשר נכשלה: ' + String(e.message).slice(0, 80)); }
  }
  const back = [];
  (h && h.monitors || []).forEach(function (m) {
    (m.items || []).forEach(function (it) {
      const k = (m.tenant || 'own') + '/' + it.re;
      if ((tries[k] || 0) >= 3) return;
      tries[k] = (tries[k] || 0) + 1;
      const p = { to: m.to, at: it.at - 30e3, name: '', page: true };
      if (m.tenant) { p.tenant = m.tenant; p.dir = m.dir; }
      back.push([it.re, p]);
    });
  });
  if (back.length) {
    const sp = path.join(data, 'status', 'wa-bridge.json');
    const st = readJson(sp, null);
    if (st) {
      st.pending = st.pending || {};
      back.forEach(function (b) { st.pending[b[0]] = b[1]; });
      fs.writeFileSync(sp + '.wah', JSON.stringify(st)); fs.renameSync(sp + '.wah', sp);
      done.push(back.length === 1 ? 'תשובה אחת הוחזרה לשליחה' : back.length + ' תשובות הוחזרו לשליחה');
    }
  }
  return done;
}
function defaultRestart() {
  require('child_process').execFileSync('sudo', ['-n', '/usr/bin/systemctl', 'restart', 'monitor-wa'], { timeout: 30000 });
}

module.exports = { check, isActive, problems, logFailures, missedIn, repair };
