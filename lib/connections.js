'use strict';
/*
  7.11.2026, stage 3 of the monitor site plan: the "🔌 חיבורים" screen.
  What is connected (✓) and what is not, with a one tap connect link for each, the same links the
  setup page uses (/oauth/<p>/start?t=&s=). Read at build time from the instance's own setup state
  (data/conn/source.json names the setup token). Google is also checked live every 10 minutes by
  cal-sync.js, so a dead Google token shows as "not connected" even when the setup file says got.
  The non OAuth ones (bank, accounting, WhatsApp, signatures) are listed as active or as a paid add-on.
*/
const fs = require('fs');
const path = require('path');

const BASE = 'https://form.it-solution.co.il';
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function ready(p) { try { return require('./oauth.js').ready(p); } catch (e) { return false; } }

// a step is connected when it was got after its last revoke
function isOn(s) {
  if (!s || !s.got) return false;
  return !s.revokedAt || Date.parse(s.revokedAt) < Date.parse(s.got);
}

function list(dataPath, instName, features) {
  const src = rd(path.join(dataPath, 'conn', 'source.json'));
  if (!src || !/^[a-f0-9]{8,40}$/.test(String(src.setup || ''))) return null;
  const tok = src.setup;
  const def = rd(path.join(dataPath, 'setup', tok + '.def.json')) || { steps: [] };
  const st = rd(path.join(dataPath, 'setup', tok + '.json')) || {};
  const cal = rd(path.join(dataPath, 'cal', 'status.json'));
  const steps = st.steps || {};
  const rows = [];
  (def.steps || []).forEach((d) => {
    if (!d.oauth || !d.oauth.provider) return;
    const p = d.oauth.provider;
    let on = isOn(steps[d.id]);
    if (on && p === 'google' && d.id === (src.calStep || 'google') && cal && cal.ok === false) on = false;
    const s = steps[d.id] || {};
    rows.push({
      id: d.id, icon: d.icon || '🔗', title: d.title || d.id,
      on, who: on ? String(s.who || '') : '',
      soon: !on && !ready(p),
      link: BASE + '/oauth/' + p + '/start?t=' + encodeURIComponent(tok) + '&s=' + encodeURIComponent(d.id),
    });
  });
  const F = features || {};
  const own = instName === 'abaitzik';
  rows.push({ id: 'wa', icon: '💬', title: 'וואטסאפ', on: true, who: '', fixed: true });
  rows.push({ id: 'sign', icon: '✍️', title: 'חתימה דיגיטלית', on: true, who: '', fixed: true });
  rows.push({ id: 'bank', icon: '🏦', title: 'חיבור לבנק', on: !!F.bank, who: '', fixed: true,
    paid: F.bank ? '' : 'תוספת בתשלום, בתיאום עם IT Solution' });
  rows.push({ id: 'acc', icon: '🧾', title: 'הנהלת חשבונות (ריווחית ועוד)', on: own, who: '', fixed: true,
    paid: own ? '' : 'תוספת בתשלום' });
  return { rows, at: new Date().toISOString() };
}

module.exports = { list, isOn };
