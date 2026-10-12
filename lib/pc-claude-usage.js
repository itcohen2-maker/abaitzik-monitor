'use strict';
/*
  12.10: what Claude Code sessions on this PC used, per Israel day.

  The weekly meter counts everything on Itzik's account: the monitors (which
  log their own cost to usage.jsonl) and the sessions he opens on the PC, which
  log nothing. Their transcripts under ~/.claude/projects carry the token counts
  of every reply, so this sums them for the last 8 days. Dollars are an estimate
  at list price per million tokens (input; output is 5x, cache write 1.25x,
  cache read 0.1x), the same yardstick as the monitors' numbers, not a bill.
  A reply can be written more than once in a transcript, so each message id is
  counted once.
*/
const fs = require('fs');
const path = require('path');

const IN = { haiku: 1, sonnet: 3, opus: 5 };
const rate = (model) => /haiku/.test(model) ? IN.haiku : /sonnet/.test(model) ? IN.sonnet : IN.opus;
const ilDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);

function files(dir, since, out) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, since, out);
    else if (e.name.endsWith('.jsonl')) { try { if (fs.statSync(p).mtimeMs >= since) out.push(p); } catch (x) {} }
  }
  return out;
}

function pcUsage(root, now) {
  const t = now || Date.now();
  const since = t - 8 * 864e5;
  const seen = new Set();
  const days = {};
  for (const f of files(root, since, [])) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const line of text.split('\n')) {
      if (!line.includes('"usage"')) continue;
      let d;
      try { d = JSON.parse(line); } catch (e) { continue; }
      const m = d.message;
      if (!m || !m.usage || !d.timestamp) continue;
      const at = Date.parse(d.timestamp);
      if (!(at >= since)) continue;
      const key = (m.id || '') + ':' + (d.requestId || '');
      if (m.id && seen.has(key)) continue;
      seen.add(key);
      const u = m.usage;
      const tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      const usd = rate(String(m.model || '')) / 1e6 * ((u.input_tokens || 0) + 5 * (u.output_tokens || 0)
        + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0));
      const day = ilDay(new Date(at));
      const x = days[day] || (days[day] = { usd: 0, tok: 0 });
      x.usd += usd; x.tok += tok;
    }
  }
  for (const k of Object.keys(days)) days[k].usd = Math.round(days[k].usd * 100) / 100;
  return days;
}

module.exports = { pcUsage };
