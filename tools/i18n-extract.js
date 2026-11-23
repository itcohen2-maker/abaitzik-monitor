'use strict';
/*
  23.11.2026: the list of Hebrew strings a translator has to give a Russian text for (lib/i18n/he-strings.json), and the chunk files that
  are handed out to translators.

      node tools/i18n-extract.js --page /tmp/x/docs/index.html [--page other.html ...] [--out lib/i18n/he-strings.json] [--chunks /tmp/ru-chunks --n 6]

  Sources, all through lib/i18n.js extract (so the same exclusions apply as at build time):
    1. every --page: a built page (docs/index.html, 404.html, ...) of a monitor, built with MONITOR_NO_GATE=1;
    2. the public booking page, rendered with lib/book-page.js on the demo request (lib/book-demo.js): the page of a business and the
       page of one client's own booking. The business's own data on it (its name, its services) is left out;
    3. the fixed texts of the diary that the server writes itself (lib/book-page.js, lib/book-health.js, lib/bookings-handler.js,
       lib/book-links.js, lib/bookings-remind.js): every string literal of those files with Hebrew in it, outside regexes and comments.
  Output: [{he, where}] sorted and distinct, he = the trimmed text. Chunks: the same list as arrays of plain Hebrew strings,
  cut into --n contiguous pieces of about the same size, so each translator gets neighbouring words.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const I = require('../lib/i18n.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pages = args.reduce((a, x, i) => (x === '--page' ? a.concat(args[i + 1]) : a), []);
const OUT = opt('--out', path.join(ROOT, 'lib', 'i18n', 'he-strings.json'));
const N = +opt('--n', '6');
const CH = opt('--chunks', '');

const HEB = /[֐-׿]/;
const ex = I.loadExclude();
const found = new Map(); // he -> Set(where)
const add = (he, where) => { he = String(he).trim(); if ((he.match(/[א-ת]/g) || []).length < 2) return; if (!found.has(he)) found.set(he, new Set()); found.get(he).add(where); };

(async () => {
  for (const p of pages) {
    for (const s of I.extractDetailed(fs.readFileSync(p, 'utf8')).strings) add(s.he, 'page:' + s.where.replace(/^attr:.*/, 'attr'));
  }
  // 2. the booking pages of the demo
  const BP = require('../lib/book-page.js'), demo = require('../lib/book-demo.js');
  const api = BP.create({ DATA: os.tmpdir(), sockPath: () => '', log() {}, demo });
  const own = new Set();
  try {
    const info = await demo.request({ op: 'info', tenant: 'demo-beauty' });
    if (info && info.name) own.add(String(info.name));
    (info && info.services || []).forEach((s) => own.add(String(s.name)));
    const r1 = await api.handle({ method: 'GET', path: '/b/' + BP.DEMO_LINK, query: {}, ip: '9.9.9.9' });
    const r2 = await api.handle({ method: 'GET', path: '/b/a/' + BP.DEMO_LINK + '.' + BP.DEMO_TOK, query: {}, ip: '9.9.9.8' });
    for (const [r, tag] of [[r1, 'book page'], [r2, 'book own page']]) {
      if (!r || r.status !== 200) throw new Error('booking page ' + tag + ' status ' + (r && r.status));
      for (const s of I.extractDetailed(r.body).strings) if (!own.has(s.he) && !/^הקליניקה של/.test(s.he)) add(s.he, 'book:' + s.where.replace(/^attr:.*/, 'attr'));
    }
  } finally { api.stop(); try { fs.rmSync(demo.dir(), { recursive: true, force: true }); } catch (e) { /* none */ } }
  // 3. the fixed texts the server writes itself
  for (const f of ['lib/book-page.js', 'lib/book-health.js', 'lib/bookings-handler.js', 'lib/book-links.js', 'lib/bookings-remind.js', 'lib/book-core.js']) {
    for (const t of I.lex(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
      if (t.k !== 'str' || !HEB.test(t.v)) continue;
      const s = I.decodeJs(t.v);
      // the Hebrew of a command (a regex alternative inside a string), a path or a log line is not for the translators
      if (/^[\s\S]*\(\?:/.test(s) || /\\s|\\d/.test(s)) continue;
      for (const u of I.literalUnits(s)) add(u, 'server:' + f);
    }
  }
  const strings = [...found.entries()].filter(([he]) => !ex.exact.has(he.replace(/\s+/g, ' ')))
    .map(([he, w]) => ({ he, where: [...w].sort().slice(0, 3).join(', ') }))
    .sort((a, b) => (a.he < b.he ? -1 : a.he > b.he ? 1 : 0));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(strings, null, 1) + '\n', 'utf8');
  console.log('strings', strings.length, '->', OUT);
  if (CH) {
    fs.mkdirSync(CH, { recursive: true });
    const total = strings.reduce((n, s) => n + s.he.length + 20, 0);
    let k = 0, acc = 0, cur = [];
    const chunks = [];
    for (const s of strings) {
      cur.push(s.he); acc += s.he.length + 20;
      if (acc >= total / N * (chunks.length + 1) && chunks.length < N - 1) { chunks.push(cur); cur = []; }
    }
    chunks.push(cur);
    chunks.forEach((c, i) => { const f = path.join(CH, 'chunk-' + (i + 1) + '.json'); fs.writeFileSync(f, JSON.stringify(c, null, 1) + '\n', 'utf8'); fs.chmodSync(f, 0o644); k += c.length; console.log(path.basename(f), c.length); });
    try { fs.chmodSync(CH, 0o755); } catch (e) { /* none */ }
    console.log('chunked', k);
  }
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
