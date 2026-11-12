'use strict';
/*
  12.11.2026, Itzik: "בכל המוניטורים תשים חיבורים, ומי שעדיין לא יתחבר לוואטסאפ תהבהב לו את המסך."
  The blinking WhatsApp card on a customer's home: shown when the 🔌 wa row is offered and not connected,
  hidden when connected, when wa is off (no row), and in Itzik's own monitor. Runs the real waCard() from the built page.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.MONITOR_NO_GATE = '1';
const { renderPage } = require('../build.js');
const CONN = require('../lib/connections.js');

const html = renderPage({ now: null, openCmds: [], builtAt: '2026-11-12T10:00:00.000Z', counts: { pending: 0, replied: 0, today: 0, leads: 0 },
  choices: [], food: [], pending: [], replied: [], contacts: [], reports: [], chat: [] });
const m = html.match(/function waPending\(\)[\s\S]*?\/\/waCard end/);

function run(rows) {
  const el = { hidden: true, innerHTML: '' };
  const document = { getElementById: (id) => (id === 'waCard' ? el : null) };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
  new Function('D', 'document', 'esc', m[0] + '\nwaCard();')({ conn: { rows } }, document, esc);
  return el;
}
const LINK = 'https://wa.me/972500000000?text=abc';

test('the card and its blink are in the built page', () => {
  assert.ok(m, 'waCard missing');
  assert.ok(html.includes('id="waCard" hidden'));
  assert.ok(html.includes('#waCard::before{') && /#waCard::before\{[^}]*animation:alertfade 3\.4s/.test(html), 'must use the shared alertfade');
  assert.ok(!html.includes('waglow'), 'no glow, no pulse (10.11)');
  assert.ok(html.includes('#waCard::before{animation:none;opacity:.55}'), 'reduced motion fallback missing');
  assert.ok(html.includes("on=connNone()||!!waPending();}catch(e){}\n ['gConn','icConn'].forEach(function(id){var t=document.getElementById(id);if(t){t.classList.toggle('connAlert',on)"), 'the 🔌 tile and icon must blink too (12.11: connAlert)');
  assert.ok(html.includes('.ic.connAlert .c{animation:connFlash'), 'a clear flash, not the soft fade');
});

test('shown when wa is on and not connected, with the quick connect link', () => {
  const el = run([{ id: 'wa', on: false, link: LINK }]);
  assert.strictEqual(el.hidden, false);
  assert.ok(el.innerHTML.includes('חבר את הוואטסאפ שלך למוניטור'));
  assert.ok(el.innerHTML.includes('href="' + LINK.replace(/[?]/g, '?') + '"'));
});

test('hidden when connected, when wa is off (no row), when locked, and without a link', () => {
  assert.strictEqual(run([{ id: 'wa', on: true, link: '' }]).hidden, true);
  assert.strictEqual(run([{ id: 'g', on: false }]).hidden, true);
  assert.strictEqual(run([{ id: 'wa', on: false, locked: true, link: LINK }]).hidden, true);
  assert.strictEqual(run([{ id: 'wa', on: false }]).hidden, true);
});

test('from the real list(): offered, then gone once connected; Itzik own never shows it', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wacard-'));
  const fw = (rel, o) => { const f = path.join(d, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o)); };
  fw('conn/source.json', { setup: 'abcdef0123456789' });
  fw('fc-key.txt', 'ab12cd34ef56ab12cd34ef56ab12cd34');
  const rows = (name, F) => CONN.list(d, name, F, null, 'pro').rows;
  const wa = (name, F) => rows(name, F).filter((x) => x.id === 'wa')[0];
  assert.ok(wa('t1a2b3c', { wa: true }) && wa('t1a2b3c', { wa: true }).link && !wa('t1a2b3c', { wa: true }).on);
  assert.strictEqual(run(rows('t1a2b3c', { wa: true })).hidden, false);
  assert.strictEqual(wa('t1a2b3c', {}), undefined, 'wa off: no row');
  assert.strictEqual(run(rows('t1a2b3c', {})).hidden, true);
  fw('conn/wa.json', { phone: '972501234567', via: 'shared' });
  assert.strictEqual(run(rows('t1a2b3c', { wa: true })).hidden, true, 'connected');
  assert.strictEqual(run(rows('abaitzik', {})).hidden, true, 'Itzik own');
});
