'use strict';
/*
  12.11.2026, Itzik: "תיתן לי אפשרות חוץ מטופל גם למחוק אותו, כי הליד שנכנס זה אני הייתי, הוא לא נחשב."
  The page (📋 לטיפול, the new lead card, the leads table) sends "🗑 מחיקת ליד: <bizId>" after its own in page confirm.
  The listener applies it here, with no model and silently, like "✓ טופל". Nothing is erased: the lead's biz record,
  every 📋 לטיפול item made for it, and (for a site lead) its chat message move to data/_deleted/<YYYYMMDD>/, and one
  line goes to data/_deleted/log.txt. The lead's source key is remembered (data/status/lead-deleted-keys.json) so a
  scanner that sees the same comment again does not bring it back.
*/
const fs = require('fs');
const path = require('path');

const ID_RE = /^biz-[A-Za-z0-9_-]{4,70}$/;
const TZ = 'Asia/Jerusalem';

// "🗑 מחיקת ליד: <id>" (the page adds a "משימה" kind line and the code line before this reaches us) -> { id } | null
function parse(text) {
  const m = /^\s*(?:משימה)?\s*🗑️?\s*מחיקת ליד\s*[:：]\s*(\S+)\s*$/.exec(String(text || '').replace(/\n\s*קוד[^\n]*$/, ''));
  return m && ID_RE.test(m[1]) ? { id: m[1] } : null;
}

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
function dayStamp(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return o.year + o.month + o.day;
}
function list(dir) { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) { return []; } }

// Move, never delete. A name already taken in the destination gets a counter, so nothing is overwritten.
function moveTo(src, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const base = path.basename(src).replace(/\.json$/, '');
  let dest = path.join(destDir, base + '.json'), n = 1;
  while (fs.existsSync(dest)) dest = path.join(destDir, base + '-' + (++n) + '.json');
  try { fs.renameSync(src, dest); } catch (e) { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
  return dest;
}

// Does this 📋 לטיפול item belong to the lead? Exact by bizId when the item has one (recorded since 12.11.2026),
// otherwise by the lead id inside its key, link or title, or by the key the item was made with for this kind of lead.
function refersTo(item, rec, id) {
  if (item.bizId) return item.bizId === id;
  if ([item.key, item.link, item.title].some((s) => String(s == null ? '' : s).indexOf(id) >= 0)) return true;
  if (rec) {
    if (rec.at && item.key === 'lead:' + rec.at) return true;
    if (/^wa:/.test(String(rec.srcKey || '')) && String(item.key || '').startsWith('wa-lead-' + rec.srcKey.slice(3) + '-')) return true;
  }
  return false;
}

function tombFile(dataPath) { return path.join(dataPath, 'status', 'lead-deleted-keys.json'); }
function isGone(dataPath, key) { return !!key && (readJson(tombFile(dataPath), {}).keys || []).indexOf(String(key)) >= 0; }
function remember(dataPath, key) {
  if (!key) return;
  const o = readJson(tombFile(dataPath), {}); o.keys = (o.keys || []).filter((k) => k !== key); o.keys.push(String(key));
  o.keys = o.keys.slice(-500);
  fs.mkdirSync(path.dirname(tombFile(dataPath)), { recursive: true });
  fs.writeFileSync(tombFile(dataPath), JSON.stringify(o, null, 1), 'utf8');
}

// apply(dataPath, id, now) -> { ok, moved: [{kind, file}], name }. ok is false only when nothing at all was found.
function apply(dataPath, id, now) {
  if (!ID_RE.test(String(id || ''))) return { ok: false, moved: [], reply: 'מזהה ליד לא תקין.' };
  const ms = now || Date.now();
  const dest = path.join(dataPath, '_deleted', dayStamp(ms));
  const moved = [];
  const bizDir = path.join(dataPath, 'biz', 'biz');
  let rec = null, recFile = '';
  for (const f of list(bizDir)) {
    if (f === id + '.json') { recFile = f; rec = readJson(path.join(bizDir, f), null); break; }
    const r = readJson(path.join(bizDir, f), null);
    if (r && r.id === id) { recFile = f; rec = r; break; }
  }
  const hdir = path.join(dataPath, 'handle', 'handle');
  list(hdir).forEach((f) => {
    const it = readJson(path.join(hdir, f), null);
    if (it && it.id && refersTo(it, rec, id)) { moveTo(path.join(hdir, f), dest); moved.push({ kind: 'handle', file: f }); }
  });
  // a site lead is also a chat message (heldWhy lead, the same `at`): it feeds the "יש ליד שהגיע" tile and the counts
  if (rec && rec.at && /-site$/.test(id)) {
    const cdir = path.join(dataPath, 'chat', 'chat');
    list(cdir).forEach((f) => {
      const m = readJson(path.join(cdir, f), null);
      if (m && m.heldWhy === 'lead' && m.at === rec.at) { moveTo(path.join(cdir, f), dest); moved.push({ kind: 'chat', file: f }); }
    });
  }
  if (recFile) {
    moveTo(path.join(bizDir, recFile), dest); moved.push({ kind: 'biz', file: recFile });
    remember(dataPath, rec && rec.srcKey);
  }
  if (moved.length) {
    try {
      fs.appendFileSync(path.join(dataPath, '_deleted', 'log.txt'),
        new Date(ms).toISOString() + ' ליד ' + id + (rec && rec.name ? ' (' + String(rec.name).replace(/\s+/g, ' ').slice(0, 40) + ')' : '')
        + ' הועבר ל ' + dayStamp(ms) + ': ' + moved.map((x) => x.kind).join(', ') + '\n', 'utf8');
    } catch (e) { /* the log is a courtesy */ }
  }
  return { ok: moved.length > 0, moved, name: rec ? rec.name : '', reply: moved.length ? 'הליד הועבר לארכיון.' : 'לא מצאתי את הליד, אולי כבר נמחק.' };
}

module.exports = { ID_RE, parse, apply, refersTo, isGone };
