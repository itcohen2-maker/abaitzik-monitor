'use strict';
/*
  16.11.2026, Itzik: "תכניס לעבודת המנהל שתמיד יחפש ליד. המנהל יכול לעבור על התגובות ברשת ולחפש ליד".
  lead-scan.js reads the ITsolution page and social-dm.js the private messages of "אבא איציק". Nobody read the public
  comments on Instagram abaitzik and on the Facebook page "אבא איציק", where people write "פרטים", "כמה עולה", "מוניטור".

  Every 15 minutes (cron, user monitor) this asks Meta, READ ONLY, for the comments on the latest posts of both, and a
  comment that asks for something (lib/lead-intent.js, rules, no model: a stranger's words never reach a session)
  becomes one lead in data/biz/biz (lib/leads.js addFound), with one urgent push and a 📋 לטיפול item.
  Nothing is ever posted, liked, answered or sent: Itzik answers himself (Instagram comments are blocked since 8.9,
  and nobody who did not write first is ever contacted).
  The first run only records what is there. State: data/status/comment-leads.json (the manager reads it).
  --dry prints what it would add and writes nothing.
*/
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const inst = require('./lib/instance.js');
const leads = require('./lib/leads.js');
const intent = require('./lib/lead-intent.js');

const PAGE = '1225985557254712';
const IG = '17841439995081131';
const G = 'https://graph.facebook.com/v23.0/';
const HOME = process.env.HOME || '/home/monitor';
const DRY = process.argv.includes('--dry');
const STATE = path.join(inst.dataPath, 'status', 'comment-leads.json');

function get(url) {
  return new Promise((res) => {
    https.get(url, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res({ error: { message: 'bad json' } }); } }); })
      .on('error', (e) => res({ error: { message: e.message } }));
  });
}
const clean = (s) => String(s || '').replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const at = new Date().toISOString();
  let st = null; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* first run */ }
  const first = !st;
  const seen = new Set((st && st.seen) || []);
  const out = { at, ok: false, scanned: 0, asked: 0, added: 0, errs: [], today: (st && st.day === at.slice(0, 10)) ? st.today || { scanned: 0, added: 0 } : { scanned: 0, added: 0 } };

  let ut = ''; try { ut = fs.readFileSync(path.join(HOME, '.ig-token-abaitzik'), 'utf8').replace(/[^A-Za-z0-9]/g, ''); } catch (e) { /* none */ }
  let pt = '';
  if (ut) { const pj = await get(G + PAGE + '?fields=access_token&access_token=' + ut); pt = pj.access_token || ''; if (!pt) out.errs.push('page token: ' + ((pj.error && pj.error.message) || '?')); }
  else out.errs.push('no token');

  const found = [];
  if (pt) {
    const ig = await get(G + IG + '/media?fields=id,permalink,timestamp,comments.limit(50){id,text,username,timestamp}&limit=15&access_token=' + pt);
    if (ig.error) out.errs.push('instagram: ' + ig.error.message);
    (ig.data || []).forEach((m) => ((m.comments && m.comments.data) || []).forEach((c) => {
      out.scanned++;
      if (!c.id || seen.has('ig:' + c.id)) return;
      seen.add('ig:' + c.id);
      if (c.username === 'abaitzik' || !intent.isLead(c.text)) return;
      out.asked++;
      found.push({ src: 'igc-own', key: 'igc-own:' + c.id, name: '@' + clean(c.username || 'מגיב'), text: clean(c.text), at: c.timestamp, link: m.permalink || '' });
    }));
    const fb = await get(G + PAGE + '/posts?fields=id,permalink_url,comments.limit(50){id,message,from,created_time}&limit=15&access_token=' + pt);
    if (fb.error) out.errs.push('facebook: ' + fb.error.message);
    (fb.data || []).forEach((p) => ((p.comments && p.comments.data) || []).forEach((c) => {
      out.scanned++;
      if (!c.id || seen.has('fb:' + c.id)) return;
      seen.add('fb:' + c.id);
      if ((c.from && c.from.id === PAGE) || !intent.isLead(c.message)) return;
      out.asked++;
      found.push({ src: 'fbc-own', key: 'fbc-own:' + c.id, name: clean((c.from && c.from.name) || 'מגיב בפייסבוק'), text: clean(c.message), at: c.created_time, link: p.permalink_url || '' });
    }));
  }
  out.ok = !!pt && !out.errs.length;
  out.today.scanned += out.scanned;
  console.log(at + ' scanned ' + out.scanned + ', asking ' + out.asked + (first ? ' (first run, recorded only)' : '') + (out.errs.length ? ' | !! ' + out.errs.join(' | ') : ''));
  if (DRY) { found.forEach((f) => console.log('would add: ' + f.src + ' · ' + f.name + ': ' + f.text.slice(0, 90))); return; }

  const added = [];
  if (!first) found.forEach((f) => { const n = leads.addFound(inst.dataPath, f); if (n) added.push(n); });
  out.added = added.length; out.today.added += added.length;
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ at, ok: out.ok, errs: out.errs, scanned: out.scanned, asked: out.asked, added: out.added, day: at.slice(0, 10), today: out.today, seen: [...seen].slice(-5000) }, null, 1), { encoding: 'utf8', mode: 0o600 });
  if (!added.length) return;
  added.forEach((n) => {
    const where = leads.SOURCES[n.source] || n.source;
    try { require('./lib/handle.js').add(inst.dataPath, { key: 'lead:' + n.id, kind: 'lead', who: n.name, title: 'ליד חדש (' + where + '), לחזור אליו', link: 'biz', at: n.at, bizId: n.id }); }
    catch (e) { console.log('!! handle: ' + e.message); }
    try { execFileSync(process.execPath, ['notify.js', '--lead', '🔔 ליד חדש: ' + n.name, where + ': "' + String(n.last || '').slice(0, 120) + '". באריח 🔔 לידים.'], { cwd: __dirname, stdio: 'ignore', timeout: 60000 }); }
    catch (e) { console.log('!! notify: ' + e.message); }
  });
  try { execFileSync(process.execPath, ['push.js', 'leads: comments ' + added.length + ' new'], { cwd: __dirname, stdio: 'inherit', timeout: 300000 }); }
  catch (e) { console.log('!! push: ' + e.message); }
})();
