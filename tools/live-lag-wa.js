// 25.11.2026, Itzik on WhatsApp: "update me every 10 minutes on the fix". One-off: reads the
// watchdog's live-check.json (never fetches the live site), sends one line to his WhatsApp,
// and stops for good once the site has caught up or after three hours.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const st = path.join(root, 'data/status/live-lag-wa.json');
const s = (() => { try { return JSON.parse(fs.readFileSync(st, 'utf8')); } catch (e) { return {}; } })();
if (s.done) process.exit(0);
const now = Date.now();
if (!s.start) s.start = now;
const c = JSON.parse(fs.readFileSync(path.join(root, 'data/status/live-check.json'), 'utf8'));
const hm = (iso) => new Date(iso).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
let text;
if (c.ok) { text = '✅ האתר החי התעדכן, הגרסה שלו מ ' + hm(c.live) + '. התקלה נסגרה ואין עוד עדכונים.'; s.done = true; }
else if (now - s.start > 3 * 3600000) { text = 'עדיין תקוע אחרי שלוש שעות, הגרסה החיה מ ' + hm(c.live) + '. עוצר את העדכונים כל 10 דקות, והמנהל ממשיך לטפל.'; s.done = true; }
else text = '🔧 עדכון תיקון: האתר החי עדיין על הגרסה מ ' + hm(c.live) + ', האחרונה שנבנתה מ ' + hm(c.local) + '. ההודעות שלך נקלטות כרגיל. ממך לא צריך כלום.';
const inst = require(path.join(root, 'lib/instance.js'));
require(path.join(root, 'lib/wa-out.js')).sendOwner(inst.dataPath, text, { kind: 'alert' })
  .then((r) => console.log(new Date().toISOString() + ' wa ' + r.via + ' ' + (s.done ? 'done' : 'open')), (e) => console.log('wa failed ' + e.message))
  .finally(() => fs.writeFileSync(st, JSON.stringify(s)));
