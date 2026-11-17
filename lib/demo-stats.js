'use strict';
/*
  17.11.2026: what the public demo monitor did (lib/demo-chat.js counters and question log), as one report a day in
  Itzik's 📄 דוחות: "📊 מוניטור ההדגמה <day>". Rewritten in place on every run (setup/demo-build.sh, 00:20 and 12:20),
  so the day has one report, not two. Numbers and questions only; addresses are hashed and never shown.
    node lib/demo-stats.js [dataPath]
*/
const fs = require('fs');
const path = require('path');

function dayIL(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }
function rj(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }

function body(dataPath, now) {
  const st = rj(path.join(dataPath, 'demo-chat', 'state.json'), { days: {} }) || { days: {} };
  const days = st.days || {};
  const today = dayIL(now), yest = dayIL(now - 864e5);
  const week = Object.keys(days).filter((d) => d > dayIL(now - 7 * 864e5));
  const sum = (list, k) => list.reduce((n, d) => n + ((days[d] && days[d][k]) || 0), 0);
  const line = (label, list) => label + ': ' + sum(list, 'visits') + ' כניסות, ' + sum(list, 'questions') + ' שאלות, ' + sum(list, 'wa') + ' לחצו על וואטסאפ';
  const refs = {};
  week.forEach((d) => Object.entries((days[d] && days[d].refs) || {}).forEach(([r, v]) => {
    refs[r] = refs[r] || { visits: 0, questions: 0, wa: 0 };
    ['visits', 'questions', 'wa'].forEach((k) => { refs[r][k] += v[k] || 0; });
  }));
  const L = ['מוניטור ההדגמה (it-solution.co.il/demo), מתעדכן פעמיים ביום.', '',
    line('היום', [today]), line('אתמול', [yest]), line('7 ימים', week), ''];
  const rk = Object.keys(refs).sort((a, b) => refs[b].visits - refs[a].visits);
  if (rk.length) { L.push('לפי מקור, 7 ימים:'); rk.forEach((r) => L.push('• ' + r + ': ' + refs[r].visits + ' כניסות, ' + refs[r].questions + ' שאלות, ' + refs[r].wa + ' וואטסאפ')); L.push(''); }
  const qs = [];
  [yest, today].forEach((d) => {
    try { fs.readFileSync(path.join(dataPath, 'demo-chat', 'log', d + '.jsonl'), 'utf8').trim().split('\n').forEach((l) => { try { qs.push(JSON.parse(l)); } catch (e) { /* a torn line */ } }); } catch (e) { /* none that day */ }
  });
  if (qs.length) {
    L.push('השאלות האחרונות שנשאלו:');
    qs.slice(-10).reverse().forEach((x) => L.push('• ' + new Date(x.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) + ' (' + x.ref + ') ' + String(x.q || '').slice(0, 140)));
  } else L.push('עוד לא נשאלו שאלות.');
  return L.join('\n');
}

function write(dataPath, now) {
  now = now || Date.now();
  const d = dayIL(now);
  const f = path.join(dataPath, 'reports', 'reports', d.replace(/-/g, '') + '-demo-stats.json');
  const o = { at: new Date(now).toISOString(), title: '📊 מוניטור ההדגמה ' + d.slice(8) + '.' + Number(d.slice(5, 7)), body: body(dataPath, now) };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f);
  return f;
}

module.exports = { body, write };
if (require.main === module) console.log(write(process.argv[2] || path.join(__dirname, '..', 'data')));
