'use strict';
/*
  4.11.2026, Itzik: "שתי טפסים אני צריך לשלוח לו. תעשה לי את שתיהם באדום, וברגע שאני שולח
  אותם הם הופכים להיות במצב המתנה כתום". The two forms Shai fills, read from the form
  state files, for the IT Solution tab: opened, how many answered, finished.
*/
const fs = require('fs');
const path = require('path');
const FORMS = [
  // 4.11, Itzik: first the quote and the service agreement to sign, then the forms.
  { k: 'sign', kind: 'sign', tok: 'a9cf9d55064a85b58583' },
  { k: 'form3', kind: 'forms', tok: '15939da3cf0776f57992' },
  { k: 'setup', kind: 'setup', tok: 'f3d4f77d1278a2a5efdc' },
];
function rj(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function filled(v) { return Array.isArray(v) ? v.length > 0 : (v != null && String(v).trim() !== ''); }
function state(root) {
  const o = {};
  FORMS.forEach((f) => {
    const dir = path.join(root, 'data', f.kind);
    const d = rj(path.join(dir, f.tok + '.def.json')) || {};
    const s = rj(path.join(dir, f.tok + '.json')) || {};
    let n = 0, of = 0;
    if (f.kind === 'sign') {
      o[f.k] = { opened: s.openedAt || '', done: s.signedAt || '', n: 0, of: 0, sign: 1 }; return;
    }
    if (f.kind === 'forms') {
      const qs = (d.questions || []).filter((q) => q.id !== 'notes');
      const a = s.answers || {};
      of = qs.length; n = qs.filter((q) => filled(a[q.id])).length;
    } else {
      const st = d.steps || [];
      const x = s.steps || {};
      of = st.length; n = st.filter((t) => { const y = x[t.id] || {}; return !!(y.got || y.done || y.choice); }).length;
    }
    o[f.k] = { opened: s.openedAt || '', done: s.submittedAt || s.finishedAt || '', n, of };
  });
  return o;
}
module.exports = { state };
