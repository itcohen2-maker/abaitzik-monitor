'use strict';
/*
  23.11.2026: the language layer of the monitor. A monitor whose instance.json says "lang": "ru" shows its whole page in
  simple Russian, left to right. Every other monitor is not touched: apply() hands the page back unchanged unless the
  language is "ru" and the dictionary is used only then.

  Why a dictionary and not a rewrite of the code: the page is built from ~4,100 lines of build.js and ~158 files in lib/,
  with Hebrew written inline. Instead of editing them, the BUILT page is walked once and every Hebrew string is replaced
  from lib/i18n/<lang>.json, a map {hebrew: russian}. Three places hold Hebrew in a built page:

    1. HTML text nodes and the attributes that are shown (title, aria-label, placeholder, alt, label, data-label, data-txt);
    2. string literals inside inline <script> code (a hand written lexer: strings, comments, regex literals, templates);
    3. Hebrew inside HTML that sits in a JS literal ('<div class="x">...</div>'): the unit is the Hebrew run between tags.

  The unit of translation is the trimmed text (leading and trailing spaces and line breaks are kept as they were), so a
  piece such as ' הודעות' of 'נשלחו ' + n + ' הודעות' is translated on its own. A literal that is not in the dictionary as a
  whole is tried phrase by phrase, longest known phrase first.

  What is NEVER translated (lib/i18n/exclude.json, built by tools/i18n-build-exclude.js, and the context rules below):
    - command lines that the page sends to the monitor channel and that the server parses in Hebrew (prefix list);
    - any literal inside a call of sendText/send/... (the function list in exclude.json);
    - literals that are compared with data or used as a lookup key: next to === !== == != , after "case", as the first
      argument of indexOf/includes/test/split/replace/getAttribute/..., inside an array that gets .indexOf/.includes,
      object keys, obj['key'], 'x' in obj. If such a literal is excluded once, the same text is excluded in the whole
      page, so a label and its comparison never drift apart;
    - regex literals, comments, and the inlined data payload (var D = {...});
    - anything in the "exact" list of exclude.json.

  The same walk serves extract(): the list of Hebrew strings a translator has to give a Russian text for.
*/
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'i18n');
const HEB = /[\u0590-\u05ff]/;
const HEB_LETTER = /[\u05d0-\u05ea]/;

// ---------- the files ----------
const fileCache = new Map();
function readJson(file, fallback) {
  let st; try { st = fs.statSync(file); } catch (e) { return fallback; }
  const c = fileCache.get(file);
  if (c && c.mtime === st.mtimeMs) return c.val;
  let val = fallback;
  try { val = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { val = fallback; }
  fileCache.set(file, { mtime: st.mtimeMs, val });
  return val;
}
// {hebrew: foreign}. A missing or broken file is an empty map, never an error.
function load(lang) {
  lang = String(lang || '');
  if (!/^[a-z]{2,3}$/.test(lang)) return {};
  const raw = readJson(path.join(DIR, lang + '.json'), {});
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of Object.keys(raw)) if (k && typeof raw[k] === 'string' && raw[k] !== '') out[k] = raw[k];
  }
  return out;
}

const DEFAULT_SEND = ['sendText', 'send', 'sendCmd', 'sendLine', 'sendRaw', 'sendTask', 'sendNote', 'sendMsg'];
const DEFAULT_PATTERN = ['indexOf', 'lastIndexOf', 'includes', 'startsWith', 'endsWith', 'test', 'exec', 'match', 'matchAll', 'search', 'split',
  'replace', 'replaceAll', 'RegExp', 'getItem', 'setItem', 'removeItem', 'getAttribute', 'setAttribute', 'hasAttribute', 'removeAttribute', 'querySelector',
  'querySelectorAll', 'getElementById', 'closest', 'matches', 'hasOwnProperty', 'has', 'get', 'set', 'delete', 'add', 'remove', 'toggle', 'contains', 'getElementsByClassName'];
function normSet(a) { return new Set((Array.isArray(a) ? a : []).map(String)); }
function loadExclude(over) {
  const j = over || readJson(path.join(DIR, 'exclude.json'), {});
  return {
    allow: new Set((Array.isArray(j.allow) ? j.allow : []).map((s) => norm(String(s)))),
    ctxAllow: new Set((Array.isArray(j.ctxAllow) ? j.ctxAllow : []).map((s) => norm(String(s)))),// reviewed strings that are translated although a comparison or lookup uses the same text
    exact: new Set((Array.isArray(j.exact) ? j.exact : []).map((s) => norm(String(s)))),
    prefixes: (Array.isArray(j.prefixes) ? j.prefixes : []).map((s) => norm(String(s))).filter(Boolean),
    sendFns: new Set(Array.isArray(j.sendFns) ? j.sendFns.map(String) : DEFAULT_SEND),
    patternFns: new Set(Array.isArray(j.patternFns) ? j.patternFns.map(String) : DEFAULT_PATTERN),
  };
}

// ---------- small text helpers ----------
function norm(s) { return String(s).replace(/[\s\u00a0]+/g, ' ').trim(); }
function edges(s) {
  const m = /^([\s\u00a0]*)([\s\S]*?)([\s\u00a0]*)$/.exec(s);
  return { lead: m[1], core: m[2], trail: m[3] };
}
function escText(s) { return s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;'); }
function escAttr(s, q) { let r = s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;'); r = q === "'" ? r.replace(/'/g, '&#39;') : r.replace(/"/g, '&quot;'); return r; }

function decodeJs(raw) {
  if (raw.indexOf('\\') < 0) return raw;
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[0-7]{1,3}|\r\n|\n|[\s\S])/g, (m, e) => {
    if (e[0] === 'u') return e[1] === '{' ? String.fromCodePoint(parseInt(e.slice(2, -1), 16)) : String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    if (e === '\n' || e === '\r\n') return '';
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' }[e] || e;
  });
}
function encodeJs(s, q) {
  return s.replace(/\\/g, '\\\\').split(q).join('\\' + q).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\/(script|!--)/gi, '<\\/$1');
}

// ---------- the JS lexer ----------
const KW_RE_BEFORE = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const KW_NOT_CALL = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'in', 'of', 'new', 'with', 'do', 'else', 'case', 'delete', 'void', 'throw', 'yield', 'await']);
const CMP_OPS = new Set(['===', '!==', '==', '!=']);
function regexAllowed(last) {
  if (!last) return true;
  if (last.k === 'num' || last.k === 'str' || last.k === 're' || last.k === 'tpl' || last.k === 'raw') return false;
  if (last.k === 'id') return KW_RE_BEFORE.has(last.v);
  if (last.k === 'p') return !(last.v === ')' || last.v === ']');
  return true;
}
// the inlined data payload of an ungated build: `var D = {"files":...}, NET = ..., CAT = ..., tab = 'pending'`. Never touched.
function payloadSpan(code) {
  const a = code.indexOf('var D = {"');
  if (a < 0) return null;
  const s = a + 8, e = code.indexOf(", tab = 'pending'", s);
  return e < 0 ? null : [s, e];
}
function lex(code) {
  const toks = [], n = code.length;
  let i = 0, last = null;
  const push = (k, v, extra) => { const t = { k, v }; if (extra) Object.assign(t, extra); toks.push(t); if (k !== 'ws' && k !== 'cm') last = t; return t; };
  const span = payloadSpan(code);
  const skipStr = (j) => { const q = code[j]; j++; while (j < n && code[j] !== q && code[j] !== '\n') { if (code[j] === '\\') j++; j++; } return j + 1; };
  const skipBraces = (j) => {
    let d = 1;
    while (j < n && d) {
      const ch = code[j];
      if (ch === '"' || ch === "'") { j = skipStr(j); continue; }
      if (ch === '`') { j = skipTpl(j); continue; }
      if (ch === '{') d++; else if (ch === '}') d--;
      j++;
    }
    return j;
  };
  const skipTpl = (j) => {
    j++;
    while (j < n) {
      const ch = code[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '`') return j + 1;
      if (ch === '$' && code[j + 1] === '{') { j = skipBraces(j + 2); continue; }
      j++;
    }
    return n;
  };
  while (i < n) {
    if (span && i === span[0]) { push('raw', code.slice(span[0], span[1])); i = span[1]; continue; }
    const c = code[i];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\u00a0' || c === '\u2028' || c === '\u2029' || c === '\ufeff') {
      let j = i + 1; while (j < n && /[ \n\t\r\u00a0\u2028\u2029\ufeff]/.test(code[j])) j++;
      push('ws', code.slice(i, j)); i = j; continue;
    }
    if (c === '/' && code[i + 1] === '/') { let j = code.indexOf('\n', i); if (j < 0) j = n; push('cm', code.slice(i, j)); i = j; continue; }
    if (c === '/' && code[i + 1] === '*') { let j = code.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; push('cm', code.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && code[j] !== c && code[j] !== '\n') { if (code[j] === '\\') j++; j++; }
      if (code[j] === c) { push('str', code.slice(i + 1, j), { q: c }); i = j + 1; } else { push('p', c); i++; }
      continue;
    }
    if (c === '`') { const j = skipTpl(i); push('tpl', code.slice(i, j)); i = j; continue; }
    if (c === '/' && regexAllowed(last)) {
      let j = i + 1, cls = false, ok = false;
      while (j < n) {
        const ch = code[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') break;
        if (cls) { if (ch === ']') cls = false; } else if (ch === '[') cls = true; else if (ch === '/') { ok = true; break; }
        j++;
      }
      if (ok) { j++; while (j < n && /[a-z]/i.test(code[j])) j++; push('re', code.slice(i, j)); i = j; continue; }
    }
    if (/[0-9]/.test(c)) { let j = i + 1; while (j < n && /[0-9a-zA-Z_.]/.test(code[j])) j++; push('num', code.slice(i, j)); i = j; continue; }
    if (/[A-Za-z_$]/.test(c) || c > '\u007f') { let j = i + 1; while (j < n && (/[\w$]/.test(code[j]) || code[j] > '\u007f')) j++; push('id', code.slice(i, j)); i = j; continue; }
    const three = code.substr(i, 3), two = code.substr(i, 2);
    if (three === '===' || three === '!==') { push('p', three); i += 3; continue; }
    if (two === '==' || two === '!=') { push('p', two); i += 2; continue; }
    push('p', c); i++;
  }
  return toks;
}

// Marks every string token that must stay as it is: t.ex = reason. Sends/compare/lookup contexts, see the header.
function analyze(toks, ex) {
  const sig = [], kept = [];
  // a comment /*keep*/ right before a string, or before a bracket group, keeps every string of it as it is (a line that the page
  // sends and the server parses, built from literals that are also shown on the page)
  for (let i = 0, mark = false; i < toks.length; i++) {
    if (toks[i].k === 'cm') mark = /^\/\*\s*keep\s*\*\/$/.test(toks[i].v);
    else if (toks[i].k !== 'ws') { sig.push(i); kept.push(mark); mark = false; }
  }
  const stack = [];
  const T = (si) => (si >= 0 && si < sig.length ? toks[sig[si]] : null);
  const isP = (t, v) => t && t.k === 'p' && t.v === v;
  for (let si = 0; si < sig.length; si++) {
    const t = toks[sig[si]];
    if (t.k === 'p') {
      const v = t.v;
      if (v === '(') {
        const p = T(si - 1);
        const fn = p && p.k === 'id' && !KW_NOT_CALL.has(p.v) ? p.v : '';
        stack.push({ t: '(', fn, arg: 0, keep: kept[si] });
      } else if (v === '[') {
        const p = T(si - 1);
        const sub = !!p && ((p.k === 'id' && !KW_RE_BEFORE.has(p.v)) || isP(p, ')') || isP(p, ']') || p.k === 'str');
        stack.push({ t: '[', sub, strs: [], keep: kept[si] });
      } else if (v === '{') stack.push({ t: '{', keep: kept[si] });
      else if (v === ')' || v === ']' || v === '}') {
        const want = v === ')' ? '(' : v === ']' ? '[' : '{';
        let k = stack.length - 1;
        while (k >= 0 && stack[k].t !== want) k--;
        if (k >= 0) {
          const f = stack[k]; stack.length = k;
          if (f.t === '[' && f.strs.length) {
            const a = T(si + 1), b = T(si + 2);
            if (isP(a, '.') && b && b.k === 'id' && ['indexOf', 'includes', 'some', 'lastIndexOf', 'findIndex'].indexOf(b.v) >= 0) f.strs.forEach((s) => { if (!s.ex) s.ex = 'array-compare'; });
          }
        }
      } else if (v === ',') {
        const top = stack[stack.length - 1];
        if (top && top.t === '(') top.arg++;
      }
      continue;
    }
    if (t.k !== 'str') continue;
    for (let k = 0; k < stack.length; k++) if (stack[k].t === '[') stack[k].strs.push(t);
    const top = stack[stack.length - 1], prev = T(si - 1), next = T(si + 1);
    let reason = null;
    if (kept[si] || stack.some((f) => f.keep)) reason = 'keep';
    for (let k = 0; k < stack.length && !reason; k++) if (stack[k].t === '(' && ex.sendFns.has(stack[k].fn)) reason = 'send';
    if (!reason && top && top.t === '(' && top.arg === 0 && ex.patternFns.has(top.fn)) reason = 'pattern';
    if (!reason && ((prev && prev.k === 'p' && CMP_OPS.has(prev.v)) || (next && next.k === 'p' && CMP_OPS.has(next.v)) || (prev && prev.k === 'id' && prev.v === 'case'))) reason = 'compare';
    if (!reason && isP(next, ':') && top && top.t === '{' && prev && (isP(prev, '{') || isP(prev, ','))) reason = 'key';
    if (!reason && top && top.t === '[' && top.sub && isP(prev, '[') && isP(next, ']')) reason = 'subscript';
    if (!reason && next && next.k === 'id' && next.v === 'in') reason = 'in';
    if (reason) t.ex = reason;
  }
}

// ---------- CSS: left/right ----------
const SW = (s) => (s === 'right' ? 'left' : 'right');
function mirrorCss(s) {
  if (!/(left|right)/.test(s)) return s;
  return s
    .replace(/(text-align\s*:\s*)(right|left)\b/g, (m, a, b) => a + (b === 'right' ? 'start' : 'end'))
    .replace(/(float\s*:\s*)(right|left)\b/g, (m, a, b) => a + SW(b))
    .replace(/(transform-origin\s*:\s*)(right|left)\b/g, (m, a, b) => a + SW(b))
    .replace(/\b(margin|padding|border)-(left|right)\b/g, (m, a, b) => a + '-' + SW(b))
    .replace(/\b(border-(?:top|bottom))-(left|right)-radius\b/g, (m, a, b) => a + '-' + SW(b) + '-radius')
    .replace(/(^|[;{\s"'])(left|right)(\s*:\s*)(?=-?[\d.]+(?:px|rem|em)\b|0(?![\d%.]))/g, (m, a, b, c) => a + SW(b) + c);
}
const LTR_SHEET = '<style id="i18n-ltr">html[lang="ru"],html[lang="ru"] body,html[lang="ru"] *:not([dir="auto"]){direction:ltr!important}html[lang="ru"] input,html[lang="ru"] textarea{text-align:start}</style>';

// ---------- the walker ----------
const TR_ATTRS = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label', 'data-label', 'data-txt']);
function makeState(opts) {
  opts = opts || {};
  const map = opts.map || load(opts.lang || 'ru');
  const st = {
    mode: opts.mode || 'apply', map, ex: loadExclude(opts.exclude),
    admin: typeof opts.admin === 'string' ? opts.admin : '',
    found: new Map(), skipped: new Map(), ctx: new Set(), pass: 2,
    index: null,
    // phrase level replacement inside a longer literal: on, except for a page that embeds the business's own data (the booking page)
    phrases: opts.phrases !== false,
  };
  st.size = Object.keys(map).length;
  return st;
}
function phraseIndex(st) {
  if (st.index) return st.index;
  const by = new Map();
  for (const k of Object.keys(st.map)) {
    if (k.length < 2 || !HEB.test(k) || k.indexOf(' ') < 0) continue; // only phrases of two words or more: a single word would also hit names of people and businesses
    const h = k.slice(0, 2);
    if (!by.has(h)) by.set(h, []);
    by.get(h).push(k);
  }
  for (const a of by.values()) a.sort((x, y) => y.length - x.length);
  st.index = by;
  return by;
}
function excludedText(st, core) {
  const c = norm(core);
  if (st.ex.allow.has(c)) return null;
  if (st.ex.exact.has(c)) return 'exact';
  const c2 = c.replace(/^משימה /, '');
  for (const p of st.ex.prefixes) {
    for (const x of [c, c2]) {
      if (x.startsWith(p) && (x.length === p.length || !HEB_LETTER.test(x[p.length]))) return 'prefix';
    }
  }
  return null;
}
const fillAdmin = (st, s) => s.replace(/\{admin\}/g, st.admin || '');
function lookup(st, core) {
  const m = st.map;
  if (Object.prototype.hasOwnProperty.call(m, core)) return m[core];
  const n = norm(core);
  if (n !== core && Object.prototype.hasOwnProperty.call(m, n)) return m[n];
  return undefined;
}
// one trimmed text. where: 'text' | 'attr:<name>' | 'script'. Returns the new text (with the old edges).
function trText(st, text, where) {
  if (!HEB.test(text)) return text;
  if (where === 'script') { const am = /^["']?\s*[\w:-]+=["']/.exec(text); if (am) return am[0] + trText(st, text.slice(am[0].length), where); }
  const e = edges(text);
  const key = where === 'script' ? e.core : norm(e.core);
  const why = excludedText(st, e.core);
  if (why) { if (st.pass === 2) st.skipped.set(norm(e.core), why); return text; }
  if (st.ctx.has(norm(e.core)) && where === 'script') { if (st.pass === 2) st.skipped.set(norm(e.core), 'context'); return text; }
  if (st.pass === 2 && st.mode === 'extract') { if (!st.found.has(key)) st.found.set(key, where); return text; }
  const r = lookup(st, key);
  if (r !== undefined) return e.lead + fillAdmin(st, r) + e.trail;
  if (st.pass === 2 && st.phrases && st.size) {
    const ph = phrases(st, e.core);
    if (ph !== e.core) return e.lead + ph + e.trail;
  }
  return text;
}
// phrase level: known pieces inside a longer text, longest first, on word edges
function phrases(st, s) {
  const by = phraseIndex(st);
  let out = '', i = 0, changed = false;
  while (i < s.length) {
    const ch = s[i];
    if (HEB_LETTER.test(ch) && (i === 0 || !HEB_LETTER.test(s[i - 1]))) {
      const cands = by.get(s.substr(i, 2));
      let hit = null;
      if (cands) for (const k of cands) {
        if (s.startsWith(k, i) && (i + k.length === s.length || !HEB_LETTER.test(s[i + k.length]))) { hit = k; break; }
      }
      if (hit) { out += fillAdmin(st, st.map[hit]); i += hit.length; changed = true; continue; }
    }
    out += ch; i++;
  }
  return changed ? out : s;
}
// HTML that lives inside a JS literal: text between tags and the shown attributes. A fragment may start or end inside a tag.
function trHtmlLit(st, dec) {
  return dec.split(/(<[^<>]*>?|^[^<>]*>)/).map((part, idx) => {
    if (idx % 2 === 0) return part ? trTextEsc(st, part) : part;
    return trTagText(st, part);
  }).join('');
}
function trTextEsc(st, text) {
  const r = trText(st, text, 'script');
  return r === text ? text : r.replace(/&(?!#?\w+;)/g, '&amp;').replace(/<(?![/!a-zA-Z])/g, '&lt;');
}
function trTagText(st, tag, docLevel) {
  if (!HEB.test(tag) && !(docLevel && /\sstyle\s*=/i.test(tag))) return tag;
  return tag.replace(/([^\s"'<>\/=]+)(\s*=\s*)("([^"]*)"|'([^']*)'|[^\s"'>]+)/g, (m, name, eq, val, dq, sq) => {
    const ln = name.toLowerCase();
    const q = dq !== undefined ? '"' : sq !== undefined ? "'" : '';
    const v = dq !== undefined ? dq : sq !== undefined ? sq : val;
    if (ln === 'style' && docLevel) { const mv = mirrorCss(v); return mv === v ? m : name + eq + q + mv + q; }
    if (!HEB.test(v)) return m;
    if (TR_ATTRS.has(ln)) {
      const r = trText(st, v, 'attr:' + ln);
      return r === v ? m : name + eq + (q || '"') + escAttr(r, q || '"') + (q || '"');
    }
    return m;
  });
}
function processScript(st, code) {
  const toks = lex(code);
  analyze(toks, st.ex);
  if (st.pass === 1) {
    for (const t of toks) if (t.k === 'str' && t.ex && t.ex !== 'send' && t.ex !== 'keep' && HEB.test(t.v) && !st.ex.ctxAllow.has(norm(decodeJs(t.v)))) st.ctx.add(norm(decodeJs(t.v)));
    return code;
  }
  let out = '';
  for (const t of toks) {
    if (t.k !== 'str') { out += t.v; continue; }
    out += trStr(st, t);
  }
  return out;
}
function trStr(st, t) {
  const q = t.q, raw = t.v;
  const dec = decodeJs(raw);
  // CSS written inside a literal is mirrored (apply only); such a literal is written back in the plain escaped form
  const mir = st.mode === 'apply' && st.pass === 2 && /left|right/.test(dec) ? mirrorCss(dec) : dec;
  const same = mir === dec;
  if (!HEB.test(mir)) return same ? q + raw + q : q + encodeJs(mir, q) + q;
  if (t.ex) { if (st.pass === 2) st.skipped.set(norm(dec), t.ex); return same ? q + raw + q : q + encodeJs(mir, q) + q; }
  const r = /<[a-zA-Z\/!]|^[^<>]*>/.test(mir) ? trHtmlLit(st, mir) : trText(st, mir, 'script');
  if (st.mode === 'extract' || r === dec) return q + raw + q;
  return q + encodeJs(r, q) + q;
}
function processStyle(st, css) {
  let out = css;
  if (st.pass === 2 && st.mode === 'apply') out = mirrorCss(out);
  if (HEB.test(out)) {
    out = out.replace(/(content\s*:\s*)(["'])([^"'\n]*[\u0590-\u05ff][^"'\n]*)\2/g, (m, a, q, v) => a + q + trText(st, v, 'style') + q);
  }
  return out;
}
const JS_TYPES = /^$|^(text\/javascript|application\/javascript|module|text\/ecmascript)$/i;
function processHtml(st, html) {
  let out = '', i = 0;
  const n = html.length;
  while (i < n) {
    const j = html.indexOf('<', i);
    if (j < 0) { out += textNode(st, html.slice(i)); break; }
    if (j > i) out += textNode(st, html.slice(i, j));
    if (html.startsWith('<!--', j)) { let k = html.indexOf('-->', j + 4); k = k < 0 ? n : k + 3; out += html.slice(j, k); i = k; continue; }
    const mt = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(j, j + 40));
    if (!mt) { out += '<'; i = j + 1; continue; }
    // the end of the opening tag, quotes respected
    let k = j + mt[0].length, q = '';
    while (k < n) { const ch = html[k]; if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') break; k++; }
    if (k >= n) { out += html.slice(j); break; }
    const tag = html.slice(j, k + 1), name = mt[1].toLowerCase();
    let nt = trTagText(st, tag, true);
    if (name === 'meta' && HEB.test(tag) && /\bname\s*=\s*["'](description|application-name|apple-mobile-web-app-title)["']/i.test(tag)) {
      // <meta name="description" content="...">: the content is shown in link previews
      nt = nt.replace(/(\bcontent\s*=\s*)(["'])([^"']*)\2/i, (m, a, qq, v) => { const r = trText(st, v, 'attr:content'); return r === v ? m : a + qq + escAttr(r, qq) + qq; });
    }
    out += nt;
    i = k + 1;
    if (name === 'script' || name === 'style' || name === 'textarea' || name === 'pre') {
      const closeRe = new RegExp('</' + name + '\\b', 'i');
      const rest = html.slice(i), cm = closeRe.exec(rest);
      const end = cm ? i + cm.index : n;
      const body = html.slice(i, end);
      if (name === 'script') {
        const ty = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(tag);
        const hasSrc = /\bsrc\s*=/i.test(tag);
        out += !hasSrc && (!ty || JS_TYPES.test(ty[1])) ? processScript(st, body) : body;
      } else if (name === 'style') out += processStyle(st, body);
      else out += body;
      i = end;
    }
  }
  return out;
}
function textNode(st, text) {
  if (!HEB.test(text)) return text;
  const r = trText(st, text, 'text');
  return r === text ? text : escText(r);
}

// ---------- public API ----------
function direction(html) {
  return html
    .replace(/lang=(\\?)"he"/g, 'lang=$1"ru"')
    .replace(/dir=(\\?)"rtl"/g, 'dir=$1"ltr"')
    .replace(/direction\s*:\s*rtl/g, 'direction:ltr')
    .replace(/(['"])he-IL\1/g, '$1ru-RU$1')
    .replace(/\.localeCompare\(([^,()]+(?:\([^()]*\))?),\s*(['"])he\2\)/g, '.localeCompare($1, $2ru$2)');
}
// the same rewrite, but never inside the inlined data payload (var D = {...}): that is data, and build.js cuts it out of the page again to make codeId
function outsidePayload(html, fn) {
  const a = html.indexOf('var D = {"');
  if (a < 0) return fn(html);
  const s = a + 8, e = html.indexOf(", tab = 'pending'", s);
  if (e < 0) return fn(html);
  return fn(html.slice(0, s)) + html.slice(s, e) + fn(html.slice(e));
}
function fonts(html) { return html.replace(/\bHeebo\b/g, 'Rubik'); }

/*
  apply(html, lang, opts) -> html. Identity unless lang is 'ru'.
  opts: { map, exclude, admin, report }  (map and exclude replace the files, for tests)
  opts.report, when given, receives { skipped: [[he, reason]] }.
*/
function apply(html, lang, opts) {
  if (lang !== 'ru' || typeof html !== 'string') return html;
  opts = opts || {};
  const st = makeState({ lang, map: opts.map, exclude: opts.exclude, admin: opts.admin, mode: 'apply', phrases: opts.phrases });
  let h = outsidePayload(html, direction);
  st.pass = 1; processHtml(st, h);
  st.pass = 2;
  h = processHtml(st, h);
  h = outsidePayload(h, fonts);
  if (/<\/head>/i.test(h)) h = h.replace(/<\/head>/i, () => LTR_SHEET + '</head>');
  else if (/<body/i.test(h)) h = h.replace(/<body/i, () => LTR_SHEET + '<body');
  if (opts.report) opts.report.skipped = [...st.skipped.entries()];
  return h;
}
/*
  extract(html, opts) -> the distinct Hebrew strings of a built page that need a translation (sorted).
  extractDetailed(html) -> { strings: [{he, where}], skipped: [{he, reason}] }
*/
function extractDetailed(html, opts) {
  opts = opts || {};
  const st = makeState({ lang: 'ru', map: {}, exclude: opts.exclude, mode: 'extract' });
  let h = outsidePayload(String(html), direction);
  st.pass = 1; processHtml(st, h);
  st.pass = 2; processHtml(st, h);
  const strings = [...st.found.entries()].map(([he, where]) => ({ he, where })).sort((a, b) => (a.he < b.he ? -1 : a.he > b.he ? 1 : 0));
  const skipped = [...st.skipped.entries()].map(([he, reason]) => ({ he, reason })).sort((a, b) => (a.he < b.he ? -1 : 1));
  return { strings, skipped };
}
function extract(html, opts) { return extractDetailed(html, opts).strings.map((s) => s.he); }
// the Hebrew units of one string literal of server code (HTML in it is split into the text between tags and the shown attributes)
function literalUnits(text, opts) {
  const st = makeState({ lang: 'ru', map: {}, exclude: opts && opts.exclude, mode: 'extract' });
  st.pass = 2;
  if (/<[a-zA-Z/!]|^[^<>]*>/.test(text)) trHtmlLit(st, text); else trText(st, text, 'script');
  return [...st.found.keys()];
}
// true when a text is one the server parses (a command prefix or a listed whole string): never translated
function isExcluded(text, opts) { return !!excludedText(makeState({ lang: 'ru', map: {}, exclude: opts && opts.exclude }), String(text)); }
// a fixed server side text (a report line, a push title, a short answer): the whole text, else line by line, else phrase by phrase.
// Identity unless lang is 'ru'.
function t(lang, text, opts) {
  if (lang !== 'ru' || typeof text !== 'string' || !HEB.test(text)) return text;
  const st = makeState({ lang, map: opts && opts.map, exclude: opts && opts.exclude, mode: 'apply', admin: opts && opts.admin });
  const e = edges(text), r = lookup(st, norm(e.core));
  if (r !== undefined) return e.lead + fillAdmin(st, r) + e.trail;
  if (!st.size) return text;
  // a text with several lines or sentences: line by line, then phrases
  return text.split('\n').map((ln) => { const le = edges(ln); const rr = lookup(st, norm(le.core)); return rr !== undefined ? le.lead + fillAdmin(st, rr) + le.trail : phrases(st, ln); }).join('\n');
}
// the instruction that makes the monitor's own answers Russian: lines for the top of a session prompt (worker.js, lib/fast-chat.js).
// Empty for every language but 'ru', so nothing else changes.
const PROMPT_LINES = {
  ru: [
    'שפת הבעלים של המוניטור הזה היא רוסית. כל תשובה אליו, כל טקסט שמוצג לו במוניטור וכל הודעה שאתה מכין עבורו או עבור הלקוחות שלו נכתבים',
    'ברוסית פשוטה, ברורה וקצרה, בלי ז׳רגון ובלי משפטים ארוכים (Простой, понятный русский, коротко). גם כשהוא כותב בעברית או באנגלית תענה ברוסית.',
    'שמות, מספרים, שעות, כתובות וקישורים נשארים בדיוק כמו שהם. את האיות של שמות עסקים ולקוחות לא מתרגמים.',
    'יוצאות מן הכלל שורות פקודה שהשרת מפענח בעצמו בעברית (שורה שמתחילה במילת פקודה בעברית כמו "משימה:", "אישור תור לקוחה:", "בקשה ממנהל:"):',
    'את המילה הראשונה ואת מבנה השורה משאירים בעברית, כי בלי זה השרת לא מזהה אותה.',
    'הכלל הזה גובר על כל הנחיה בהמשך שאומרת לענות בעברית, "בעברית פשוטה", "עברית של יום יום" או "בעברית מדוברת": בכל מקום כזה עונים ברוסית פשוטה.',
    '',
  ],
};
function promptLines(lang) { return (PROMPT_LINES[lang] || []).slice(); }

module.exports = { load, apply, extract, extractDetailed, isExcluded, literalUnits, t, promptLines, mirrorCss, lex, analyze, decodeJs, encodeJs, loadExclude, HEB, DIR };
