'use strict';
/*
  11.11.2026: the read side of private messages (Messenger and Instagram) for one Facebook page,
  shared by social-dm.js (Itzik's own page) and social-dm-tenants.js (customers who turned it on).
  READ ONLY toward Meta: nothing is sent, liked or marked as read.
*/
const https = require('https');
const G = 'https://graph.facebook.com/v23.0/';
const NAME = { instagram: '📸 אינסטגרם', messenger: '💬 מסנג׳ר' };

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 60000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ error: { message: 'bad json' } }); } });
    }).on('error', (e) => resolve({ error: { message: e.message, net: true } }))
      .on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
function clean(s) { return String(s || '').replace(/[-‐‑‒–—]/g, ' ').replace(/\s+/g, ' ').trim(); }

// page: { id, token, igId?, igUser? }. seen: Set of message ids (mutated). Returns { fresh, convs, waiting, errs }.
async function scan(page, seen) {
  const fresh = []; const errs = []; let waiting = 0; let convs = 0;
  for (const plat of ['messenger', 'instagram']) {
    const j = await get(G + page.id + '/conversations?platform=' + plat + '&fields=participants,updated_time,messages.limit(5){id,message,from,created_time}&limit=15&access_token=' + encodeURIComponent(page.token));
    if (j.error) { errs.push(plat + ': ' + j.error.message); continue; }
    (j.data || []).forEach((cv) => {
      convs++;
      const msgs = (cv.messages && cv.messages.data) || [];
      const mine = (m) => !m.from || m.from.id === page.id || (page.igId && m.from.id === page.igId) || (page.igUser && m.from.username === page.igUser);
      if (msgs[0] && !mine(msgs[0])) waiting++;
      msgs.forEach((m) => {
        if (!m.id || seen.has(m.id)) return;
        seen.add(m.id);
        if (mine(m)) return;
        fresh.push({ plat, id: m.id, who: clean(m.from.name || m.from.username || 'מישהו'), text: clean(m.message) || 'שלח תמונה, סרטון או קישור', at: m.created_time });
      });
    });
  }
  return { fresh, convs, waiting, errs };
}

// One line per person per round: a burst of shared reels is one line, with the count and the last text.
function group(fresh) {
  fresh.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const by = new Map();
  fresh.forEach((f) => { const k = f.plat + '|' + f.who; const o = by.get(k) || { ...f, n: 0 }; o.n++; o.id = f.id; o.at = f.at; o.text = f.text; by.set(k, o); });
  return [...by.values()].map((f) => ({ ...f, line: NAME[f.plat] + ' · ' + f.who + ': ' + f.text.slice(0, 80) + (f.n > 1 ? ' (' + f.n + ' הודעות)' : '') }));
}

module.exports = { get, clean, scan, group, NAME, G };
