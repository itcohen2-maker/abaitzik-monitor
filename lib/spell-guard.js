'use strict';
/*
  4.11.2026, Itzik: "למה אתה לא עושה איות ובודק איות לפני שאתה מעלה דברים שלי לרשת?
  כל דבר שעולה לרשת צריך לעבור בדיקה של שומר עם איות מעכשיו."
  It started from a letter whose Gmail preview read "שחרכאן": two lines of the design with no
  space between them. So HTML is read the way a mail preview reads it, tags dropped and nothing
  added, and words glued that way are caught too.

  Hebrew words only, through hunspell he_IL (apt: hunspell hunspell-he). Names and brand words
  that the dictionary does not know go in data/spell-allow.txt, one per line.

    node lib/spell-guard.js <file|->        prints unknown words, exit 1 when there are any
    require('./lib/spell-guard').check(text, { html: true }) -> ['word', ...]
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALLOW_FILE = path.join(__dirname, '..', 'data', 'spell-allow.txt');

function allowList(extra) {
  let words = [];
  try { words = fs.readFileSync(ALLOW_FILE, 'utf8').split('\n'); } catch (e) { /* none yet */ }
  return new Set(words.concat(extra || []).map((w) => w.trim()).filter(Boolean));
}

// What a mail client shows as the preview: tags gone, nothing put in their place, entities read.
function previewText(html) {
  return String(html)
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function hebrewWords(text) {
  // Gershayim and geresh stay inside a word (מע״מ, צ׳אט).
  return String(text).match(/[א-ת][א-ת׳״"']*[א-ת׳]?/g) || [];
}

function check(text, opt) {
  opt = opt || {};
  const src = opt.html ? previewText(text) : String(text);
  // Abbreviations (מד״א, ער״ן, צ׳אט) are skipped: hunspell splits them on the mark and reports the halves.
  const words = [...new Set(hebrewWords(src).map((w) => w.replace(/["'׳״]+$/, '')))].filter((w) => !/["'׳״]/.test(w));
  if (!words.length) return [];
  let out;
  try {
    out = execFileSync('hunspell', ['-d', 'he_IL', '-l'], { input: words.join('\n'), encoding: 'utf8' });
  } catch (e) {
    throw new Error('spell-guard: hunspell he_IL is missing (apt install hunspell hunspell-he)');
  }
  const allow = allowList(opt.allow);
  return [...new Set(out.split('\n').map((w) => w.trim()).filter((w) => w && !allow.has(w)))];
}

module.exports = { check, previewText, hebrewWords, ALLOW_FILE };

if (require.main === module) {
  const f = process.argv[2] || '-';
  const text = fs.readFileSync(f === '-' ? 0 : f, 'utf8');
  const bad = check(text, { html: /<[a-z][^>]*>/i.test(text) });
  if (bad.length) { console.log('איות: ' + bad.join(', ')); process.exit(1); }
  console.log('איות תקין');
}
