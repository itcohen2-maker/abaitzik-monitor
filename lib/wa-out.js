'use strict';
/*
  The monitor writes first on WhatsApp.

  4.11.2026, Itzik, after the comparison with Instinct: "תתחיל עם כל מה שהצענו".
  Instinct's one real edge is that it speaks first. Here that means two things
  only, so WhatsApp never turns into a pile:
    1. one message a day with what is still open (wa-daily.js),
    2. a truly urgent alert (a lead, priority 5) also lands on WhatsApp.
  Nothing else is pushed. Everything else stays an answer to something he wrote.

  The 24 hour rule: Meta lets a business send free text only within 24 hours of
  the person's last message. wa-bridge.js keeps st.lastIn[number]. Inside that
  window the message goes as text; outside it, it goes through the approved
  template (cfg.template, default monitor_update) as one line, with the text
  as the single parameter. A template message costs a few agorot; a text one
  inside the window is free.

  Only to the owner of this monitor (cfg.owner, else the first number on allow).
  Rule from 8.9: WhatsApp goes to the monitor's own owner, never to anyone else.

  Sent message ids are kept in data/status/wa-out.json { wamid: { re, text, at } },
  so a reply that quotes one of these (wa-bridge.js) knows what it continues.
*/
const fs = require('fs');
const path = require('path');
const https = require('https');

function paths(dataPath) {
  return {
    cfg: path.join(dataPath, 'wa.json'),
    bridge: path.join(dataPath, 'status', 'wa-bridge.json'),
    out: path.join(dataPath, 'status', 'wa-out.json'),
  };
}
function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

const WINDOW_MS = 23.5 * 3600e3; // a little inside Meta's 24 hours

function owner(cfg) { return String(cfg.owner || (cfg.allow || [])[0] || ''); }
function windowOpen(dataPath, to, now) {
  const st = readJson(paths(dataPath).bridge, {});
  const t = st.lastIn && st.lastIn[to];
  return !!t && (now || Date.now()) - t < WINDOW_MS;
}

// A template parameter is one line: no new lines, no tabs, no run of 4 spaces, at most 1024 chars.
function oneLine(text, max) {
  const s = String(text || '').replace(/[\r\n\t]+/g, ' · ').replace(/ {2,}/g, ' ').replace(/( · )+/g, ' · ').trim();
  const n = max || 900;
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
}

function post(cfg, body) {
  return new Promise(function (resolve, reject) {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const r = https.request({ method: 'POST', hostname: 'graph.facebook.com',
      path: '/' + (cfg.graph || 'v21.0') + '/' + cfg.phoneId + '/messages',
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json', 'Content-Length': data.length } }, function (res) {
      const ch = [];
      res.on('data', function (c) { ch.push(c); });
      res.on('end', function () {
        const txt = Buffer.concat(ch).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error('graph ' + res.statusCode + ' ' + txt.slice(0, 300)));
        let id = ''; try { id = JSON.parse(txt).messages[0].id; } catch (e) {}
        resolve(id);
      });
    });
    r.on('error', reject);
    r.setTimeout(30000, function () { r.destroy(new Error('timeout')); });
    r.end(data);
  });
}

function remember(dataPath, wamid, rec) {
  if (!wamid) return;
  const f = paths(dataPath).out;
  const j = readJson(f, {});
  j[wamid] = Object.assign({ at: Date.now() }, rec);
  const e = Object.entries(j);
  const keep = e.length > 200 ? Object.fromEntries(e.slice(-200)) : j;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(keep, null, 1));
  fs.renameSync(f + '.tmp', f);
}
function recall(dataPath, wamid) { return (readJson(paths(dataPath).out, {}))[wamid] || null; }

/*
  Send to the owner. Returns { ok, via: 'text'|'template', id } or throws with the
  real reason (never swallowed: a silent failure here is how 13.9 happened).
  opts.re: the chat id this message belongs to, so a quoted reply continues it.
*/
async function sendOwner(dataPath, text, opts) {
  const cfg = readJson(paths(dataPath).cfg, null);
  if (!cfg || !cfg.token || !cfg.phoneId) throw new Error('no WhatsApp config in this monitor');
  const to = owner(cfg);
  if (!to) throw new Error('no owner number');
  const o = opts || {};
  let id, via;
  if (windowOpen(dataPath, to, o.now)) {
    via = 'text';
    id = await post(cfg, { messaging_product: 'whatsapp', to: to, type: 'text', text: { preview_url: true, body: String(text).slice(0, 4000) } });
  } else {
    via = 'template';
    id = await post(cfg, { messaging_product: 'whatsapp', to: to, type: 'template', template: {
      name: cfg.template || 'monitor_update', language: { code: cfg.templateLang || 'he' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: oneLine(text) }] }] } });
  }
  remember(dataPath, id, { re: o.re || '', text: String(text).slice(0, 1500), kind: o.kind || '' });
  return { ok: true, via: via, id: id };
}

module.exports = { sendOwner, windowOpen, oneLine, owner, remember, recall, WINDOW_MS };
