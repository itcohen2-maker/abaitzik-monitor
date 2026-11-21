#!/usr/bin/env node
/*
  15.11.2026, Itzik: "בוא נעשה חיבור שיוכל להתחבר גם אם המחשב כבוי".
  Reads Lolos's Google Drive (100lolos, read only) straight from the server, so an invoice, receipt or
  delivery note that Rivhit already produced is found and attached even when both PCs are off.
  The connection: setup page data/setup/285ba8df9b14606b1698 (step "google", scope drive.readonly).
  Every Rivhit document is in the backup folder: גיבוי ריווחית PDF/<year>/<type>/<type> <number> <dd.mm.yyyy>.pdf

  node lolos-drive.js status                      is it connected, and as whom
  node lolos-drive.js find <number|text> [--get]  search the backup by number (023393 or 23393) or by any words in the name;
                                                  --get copies the best match to data/files-private/ and prints files/<name>
*/
const fs = require('fs'), path = require('path'), https = require('https');
const oauth = require('./lib/oauth.js');
const TOK = '285ba8df9b14606b1698', STEP = 'google';
const DATA = path.join(__dirname, 'data');

function saved() {
  try { return JSON.parse(JSON.parse(fs.readFileSync(path.join(DATA, 'setup', TOK + '.secrets.json'), 'utf8'))[STEP].value); } catch (e) { return null; }
}
function get(url, access, raw) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { Authorization: 'Bearer ' + access } }, (r) => {
      const b = []; r.on('data', (c) => b.push(c)); r.on('end', () => {
        const buf = Buffer.concat(b);
        if (r.statusCode !== 200) return rej(new Error('drive ' + r.statusCode + ' ' + buf.toString('utf8').slice(0, 200)));
        res(raw ? buf : JSON.parse(buf.toString('utf8')));
      });
    }).on('error', rej);
  });
}
async function access() {
  const s = saved();
  if (!s) throw new Error('הדרייב של לולוס עוד לא מחובר: https://form.it-solution.co.il/s/' + TOK);
  const c = await oauth.check(s);
  if (!c.ok) throw new Error('החיבור לדרייב של לולוס ' + (c.revoked ? 'בוטל' : 'נכשל (' + c.error + ')') + ', לחבר מחדש: https://form.it-solution.co.il/s/' + TOK);
  return c.access;
}
const API = 'https://www.googleapis.com/drive/v3/files';
async function search(q, a) {
  const u = API + '?' + new URLSearchParams({ q: q + " and trashed = false and mimeType != 'application/vnd.google-apps.folder'", pageSize: '20',
    fields: 'files(id,name,size,modifiedTime,parents)', orderBy: 'modifiedTime desc', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  return (await get(u, a)).files || [];
}
async function find(term, a) {
  const t = String(term).trim();
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  if (/^\d+$/.test(t)) {
    const n = t.replace(/^0+/, '');
    // the backup names hold the number without its leading zero, between spaces
    const hits = await search("name contains '" + esc(n) + "'", a);
    return hits.filter((f) => new RegExp('(^|[^0-9])0*' + n + '([^0-9]|$)').test(f.name));
  }
  const words = t.split(/\s+/).filter(Boolean).map((w) => "name contains '" + esc(w) + "'");
  return search(words.join(' and '), a);
}
function safeName(f) {
  const base = f.name.replace(/\.pdf$/i, '');
  const num = (base.match(/\d{4,}/) || [''])[0];
  const kind = /זיכוי/.test(base) ? 'credit' : /קבלה/.test(base) && /חשבונית/.test(base) ? 'invoice-receipt' : /קבלה/.test(base) ? 'receipt' : /משלוח/.test(base) ? 'delivery' : /חשבונית/.test(base) ? 'invoice' : 'lolos';
  return 'lolos-' + kind + (num ? '-' + num : '-' + f.id.slice(0, 8)) + path.extname(f.name).toLowerCase();
}

(async () => {
  const [cmd, term] = process.argv.slice(2);
  try {
    if (cmd === 'status') {
      const s = saved();
      if (!s) { console.log('לא מחובר. דף החיבור: https://form.it-solution.co.il/s/' + TOK); process.exit(2); }
      await access(); console.log('מחובר, ' + (s.who || '') + ', קריאה בלבד'); return;
    }
    if (cmd === 'find' && term) {
      const a = await access();
      const hits = await find(term, a);
      if (!hits.length) { console.log('לא נמצא בדרייב של לולוס: ' + term); process.exit(3); }
      hits.slice(0, 8).forEach((f) => console.log(f.name + ' | ' + Math.round((+f.size || 0) / 1024) + 'KB | ' + f.modifiedTime.slice(0, 10) + ' | ' + f.id));
      if (process.argv.includes('--get')) {
        const f = hits[0], name = safeName(f);
        const buf = await get(API + '/' + f.id + '?alt=media&supportsAllDrives=true', a, true);
        const out = path.join(DATA, 'files-private', name);
        fs.writeFileSync(out, buf);
        console.log('files/' + name);
      }
      return;
    }
    console.log('node lolos-drive.js status | find <number|text> [--get]');
  } catch (e) { console.log(e.message); process.exit(1); }
})();
