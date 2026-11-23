'use strict';
/*
  23.11.2026: builds lib/i18n/exclude.json, the list of Hebrew strings that the language layer (lib/i18n.js) must never
  translate, because the monitor channel parses them in Hebrew. Run it again whenever a new command is added:

      node tools/i18n-build-exclude.js          (writes lib/i18n/exclude.json)
      node tools/i18n-build-exclude.js --check  (prints what it would write, writes nothing)

  Where the lists come from (all read from the code, nothing is typed by hand except MANUAL below):
    1. prefixes: every regex literal that starts with ^ and holds Hebrew, in the files that parse inbound text (listen.js,
       worker.js, wa-bridge.js, the handlers, bookings, demo-acts, fireflies-key, fast-chat ... see FILES). The Hebrew words
       of such a regex (alternatives, groups) are the command words: BOOKING_LINE of listen.js, LINE of
       lib/bookings-handler.js, and so on.
    2. prefixes: the literals the page passes to sendText(subject, text, kind): the subject, the kind and the first literal
       of the text (up to its first colon). These are the lines that reach the channel.
    3. sendFns: sendText, send, ... and every function of build.js or lib/*.js whose body calls sendText( directly. Every
       literal inside a call of such a function is left alone by lib/i18n.js.
    4. MANUAL: the few words that no regex shows (kinds), kept here with the reason.
  "allow" and "exact" are kept from the old file: allow lists strings that are translated although they match a prefix,
  exact lists whole strings that are never translated.
*/
const fs = require('fs');
const path = require('path');
const I = require('../lib/i18n.js');

const ROOT = path.join(__dirname, '..');
const HEB = /[֐-׿]/;
// the files that parse inbound text
// The parsers of the lines that the PAGE sends. Not listed on purpose: fast-chat.js, wa-bridge.js, wa-quick.js, plan.js, bank-flow.js and the like,
// which parse what the owner types or says in free words (those words are not page text); bookings.js (weekday names of its date parser).
const TRUSTED = ['listen.js', 'lib/bookings-handler.js', 'lib/fireflies-key.js'];
const FILES = TRUSTED.concat(['worker.js', 'lib/demo-acts.js', 'lib/monitor-logic.js', 'lib/sendlist.js']);
// prefixes that no regex shows
const MANUAL = [['בקשה ממנהל', 'listen.js: asks the manager'], ['ליד חדש', 'listen.js saveManualLead'], ['פרויקט', 'lib/monitor-logic.js: the project lines (build.js builds txt with it before sending)']];
// whole strings that are channel words (sendText kinds, the word that prefixes most lines). As a prefix they would also hit
// ordinary sentences that begin with the same word, so they are exact only.
const MANUAL_EXACT = ['משימה', 'בקשת שינוי', 'עדכון עסק'];

function norm(s) { return String(s).replace(/[\s ]+/g, ' ').trim(); }
// the tokens of a file; the client scripts of lib/*-ui.js sit inside template literals, so those are lexed too (as the page will have them:
// a doubled backslash of the template is one backslash in the page)
function lexDeep(code, depth) {
  const out = [];
  for (const t of I.lex(code)) {
    if (t.k === 'tpl' && depth < 3) out.push(...lexDeep(t.v.slice(1, -1).replace(/\\\\/g, '\\'), depth + 1));
    else out.push(t);
  }
  return out;
}
function tokens(file) { try { return lexDeep(fs.readFileSync(path.join(ROOT, file), 'utf8'), 0); } catch (e) { return []; } }

// The words a line must START with to match an anchored regex: after ^, optional \s*, optional groups such as (?:משימה\s+)?,
// either a group of alternatives or plain letters up to the first regex symbol. Words later in the line (parameters) are not leads.
function leads(src) {
  src = src.replace(/^\^/, '');
  for (let guard = 0; guard < 6; guard++) {
    const before = src;
    src = src.replace(/^\\s[*+]/, '').replace(/^\(\?:[^()]*\)\?/, '');
    if (src === before) break;
  }
  let body = src;
  if (/^\(\?:/.test(src)) {
    // the first group, up to its closing bracket (one level of nesting is enough for these regexes)
    let d = 0, k = 0;
    for (; k < src.length; k++) { if (src[k] === '\\') { k++; continue; } if (src[k] === '(') d++; else if (src[k] === ')') { d--; if (d === 0) break; } }
    body = src.slice(3, k);
  } else if (/^\((?!\?)/.test(src)) body = src.slice(1, src.indexOf(')'));
  const out = [];
  const alts = body === src && !/^\(/.test(src) ? [src] : body.split('|');
  for (let alt of alts) {
    alt = alt.replace(/\(\?:[^()]*\)\?/g, '').replace(/\\s[*+]/g, ' ').replace(/^[:：\s]+/, '');
    const m = /^[^\\()[\]*+?{}$.^]*/.exec(alt);
    const lead = norm(m ? m[0] : '');
    if (lead.length >= 2 && HEB.test(lead)) out.push(lead);
  }
  return out;
}

const prefixes = new Map(); // phrase -> where
const add = (p, where) => { p = norm(p); if (p.length >= 2 && HEB.test(p) && !prefixes.has(p)) prefixes.set(p, where); };

// 1. the anchored regexes of the inbound parsers
for (const f of FILES) {
  for (const t of tokens(f)) {
    if (t.k !== 're' || !/^\/\^/.test(t.v) || !HEB.test(t.v)) continue;
    for (const lead of leads(t.v.slice(1, t.v.lastIndexOf('/')))) {
      // outside the trusted parsers a lone word is too common to block (it may be a label of the page): only phrases and lines with a colon
      if (TRUSTED.indexOf(f) < 0 && !/[: ]/.test(lead)) continue;
      add(lead, f + ' regex');
    }
  }
}
// 2 and 3. the calls of sendText(...) everywhere, and the functions that call it
const sendFns = new Set(['sendText', 'send', 'sendCmd', 'sendLine', 'sendRaw', 'sendTask', 'sendNote', 'sendMsg']);
const calls = new Map(); // function name -> the names it calls
const all = ['build.js'].concat(fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => /\.js$/.test(f) && f !== 'i18n.js').map((f) => 'lib/' + f));
for (const f of all) {
  const toks = tokens(f).filter((t) => t.k !== 'ws' && t.k !== 'cm');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === 'id' && t.v === 'sendText' && toks[i + 1] && toks[i + 1].v === '(' && !(toks[i - 1] && toks[i - 1].v === 'function')) {
      // the subject, the first literal of the text, the kind
      let depth = 0, arg = 0;
      const first = [false, false, false];
      for (let j = i + 1; j < toks.length; j++) {
        const u = toks[j];
        if (u.k === 'p' && (u.v === '(' || u.v === '[' || u.v === '{')) depth++;
        else if (u.k === 'p' && (u.v === ')' || u.v === ']' || u.v === '}')) { depth--; if (depth === 0) break; }
        else if (u.k === 'p' && u.v === ',' && depth === 1) arg++;
        else if (u.k === 'str' && HEB.test(u.v) && arg === 1 && !first[arg]) {
          // the text of the line: its first literal up to the first colon, when it has one (the subject and the kind are only
          // ever passed inside the call, which lib/i18n.js leaves alone anyway)
          first[arg] = true;
          const s = I.decodeJs(u.v), c = s.indexOf(':');
          if (c > 0) add(s.slice(0, c + 1), f + ' sendText text');
        }
      }
    }
    if (t.k === 'id' && t.v === 'function' && toks[i + 1] && toks[i + 1].k === 'id' && toks[i + 2] && toks[i + 2].v === '(') {
      const name = toks[i + 1].v;
      let j = i + 2, d = 0;
      while (j < toks.length && !(toks[j].v === '{' && d === 0)) { if (toks[j].v === '(') d++; else if (toks[j].v === ')') d--; j++; }
      let b = 0;
      for (let k = j; k < toks.length; k++) {
        if (toks[k].k === 'p' && toks[k].v === '{') b++;
        else if (toks[k].k === 'p' && toks[k].v === '}') { b--; if (b === 0) break; }
        if (toks[k].k === 'id' && toks[k + 1] && toks[k + 1].v === '(' && toks[k - 1] && toks[k - 1].v !== 'function') { if (!calls.has(name)) calls.set(name, new Set()); calls.get(name).add(toks[k].v); }
      }
    }
  }
}
// the functions that carry a line to the channel without calling sendText themselves (transport and chains), and the demo's fake channel
for (const n of ['ntfyText', 'sendOrHold', 'chain', 'demoAct', 'demoSay']) sendFns.add(n);
// a function that calls sendText, ntfyText or sendOrHold directly passes its arguments on (one level only: following every call would reach generic names like add, get or render)
for (const [name, called] of calls) if (['sendText', 'ntfyText', 'sendOrHold'].some((c) => called.has(c)) && !['page', 'js', 'onClick'].includes(name)) sendFns.add(name); // generic names (a client script wrapper, an export, an event helper), not senders
for (const [w, why] of MANUAL) add(w, 'manual: ' + why);

const out = path.join(ROOT, 'lib', 'i18n', 'exclude.json');
let allow = [], exact = [], ctxAllow = [];
try { const old = JSON.parse(fs.readFileSync(out, 'utf8')); allow = old.allow || []; exact = old.exact || []; ctxAllow = old.ctxAllow || []; } catch (e) { /* first run */ }
// words that a parser regex starts with but that are also plain labels of the page (a file, a source, remove, disconnect): translated
for (const w of ['קובץ', 'מקור:', 'הסר', 'הסרה', 'ניתוק']) if (allow.indexOf(w) < 0) allow.push(w);
allow.sort();
for (const w of MANUAL_EXACT) if (exact.indexOf(w) < 0) exact.push(w);
exact.sort();
for (const w of allow) prefixes.delete(w);
const res = {
  _how: 'Built by tools/i18n-build-exclude.js from the anchored regexes of the inbound parsers, the sendText calls and the functions that call it. Do not edit prefixes or sendFns by hand: edit the tool (MANUAL) or add to exact / allow.',
  prefixes: [...prefixes.keys()].sort(),
  prefixSources: Object.fromEntries([...prefixes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  sendFns: [...sendFns].sort(),
  patternFns: [...I.loadExclude({}).patternFns].sort(),
  exact,
  allow,
  ctxAllow,
};
if (process.argv.includes('--check')) console.log(JSON.stringify(res, null, 1));
else { fs.writeFileSync(out, JSON.stringify(res, null, 1) + '\n', 'utf8'); console.log('prefixes', res.prefixes.length, 'sendFns', res.sendFns.length, '->', out); }
