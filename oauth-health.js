'use strict';
/*
  5.11.2026: once a day, is every Google and Meta connection made on a setup page
  still alive? (lib/oauth.js check). A connection the client cut, or a password
  change that killed it, turns the card back to "connect again" on the client's
  setup page and tells Itzik once, with the link to send the client.
  A passing failure (network, provider down) is retried the next day, quietly:
  error messages only after verifying.

  node oauth-health.js          check all
  node oauth-health.js --dry    print only, change nothing
  Timer: monitor-oauth-health.timer, every day 07:40 Israel. Log /var/log/monitor-oauth-health.log.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const oa = require('./lib/oauth.js');
const DIR = process.env.SETUP_DIR || path.join(__dirname, 'data', 'setup');
const NAME = { google: 'גוגל', meta: 'פייסבוק' };

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJson(f, o) { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(f + '.tmp', f); }

async function run(opts) {
  opts = opts || {};
  const say = opts.notify || ((t, m) => execFileSync(process.execPath, [path.join(__dirname, 'notify.js'), t, m], { cwd: __dirname, timeout: 60000 }));
  const out = [];
  let files = []; try { files = fs.readdirSync(DIR).filter((f) => /^[a-f0-9]{16,40}\.secrets\.json$/.test(f)); } catch (e) { return out; }
  for (const f of files) {
    const tok = f.split('.')[0];
    const sec = readJson(path.join(DIR, f), {});
    const def = readJson(path.join(DIR, tok + '.def.json'), null);
    for (const id of Object.keys(sec)) {
      let saved; try { saved = JSON.parse(sec[id].value); } catch (e) { continue; }
      if (!saved || (saved.provider !== 'google' && saved.provider !== 'meta')) continue;
      let r; try { r = await oa.check(saved); } catch (e) { r = { ok: false, revoked: false, error: e.message }; }
      out.push({ tok, id, provider: saved.provider, ok: r.ok, revoked: !!r.revoked, error: r.error || '' });
      if (r.ok || !r.revoked || opts.dry) continue;
      const sf = path.join(DIR, tok + '.json');
      const s = readJson(sf, { steps: {} }); s.steps = s.steps || {};
      const x = s.steps[id] = s.steps[id] || {};
      if (!x.got) continue; // already marked
      delete x.got; x.oaErr = 'revoked'; x.revokedAt = new Date().toISOString();
      writeJson(sf, s);
      const client = (def && def.client) || tok.slice(0, 6);
      try { say('🔌 חיבור נותק', client + ': החיבור ל' + NAME[saved.provider] + ' נותק (' + (saved.who || '') + '). לשלוח לו את דף ההקמה לחיבור מחדש: https://form.it-solution.co.il/s/' + tok + '#' + id); } catch (e) {}
    }
  }
  return out;
}

module.exports = { run };

if (require.main === module) {
  const dry = process.argv.includes('--dry');
  run({ dry }).then((out) => {
    const at = new Date().toISOString();
    if (!out.length) console.log(at + ' no oauth connections');
    out.forEach((o) => console.log(at + ' ' + o.tok.slice(0, 6) + ' ' + o.id + ' ' + o.provider + ' ' + (o.ok ? 'ok' : (o.revoked ? 'REVOKED' : 'fail ' + o.error))));
  }, (e) => { console.error(e.message); process.exit(1); });
}
