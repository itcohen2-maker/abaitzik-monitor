'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPage } = require('../build.js');
const { fixture } = require('./page.test.js');

// linkify lives inside the page script, so lift it out of the built HTML and
// run it here. That way the test reads the code he actually taps on, not a
// copy of it that can drift.
function loadLinkify() {
  const html = renderPage(fixture());
  const start = html.indexOf('function linkify(t){');
  assert.ok(start > -1, 'linkify must be present in the built page');
  const end = html.indexOf('\n}', start);
  const src = html.slice(start, end + 2);
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // eslint-disable-next-line no-new-func
  return new Function('esc', src + '; return linkify;')(esc);
}

const linkify = loadLinkify();
const URL = 'https://itcohen2-maker.github.io/abaitzik-monitor/files/banana-reel.mp4';

function hrefs(html) {
  return [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
}

test('a link on its own line does not swallow the next line', () => {
  // The 404 he hit on 17.9: the old class stopped only at a space, so the
  // href carried the newline and the first word after it.
  const html = linkify('הסרטון כאן:\n' + URL + '\nלחיצה עליו פותחת אותו בנגן.');
  assert.deepEqual(hrefs(html), [URL]);
  assert.ok(html.includes('לחיצה עליו'), 'the following text must survive');
});

test('a tab or a double space ends the address too', () => {
  assert.deepEqual(hrefs(linkify(URL + '\tאחריו')), [URL]);
  assert.deepEqual(hrefs(linkify(URL + '\r\nאחריו')), [URL]);
});

test('sentence punctuation stays out of the address', () => {
  const html = linkify('פתח את ' + URL + '.');
  assert.deepEqual(hrefs(html), [URL]);
  assert.ok(html.endsWith('.'), 'the full stop belongs to the sentence');
  assert.deepEqual(hrefs(linkify('(' + URL + ')')), [URL]);
});

test('links open outside the app and cannot reach back into it', () => {
  const html = linkify(URL);
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('text without a link is still escaped', () => {
  assert.equal(linkify('<b>לא תגית</b>'), '&lt;b&gt;לא תגית&lt;/b&gt;');
});

test('the build ships a 404 page with a way back to the monitor', () => {
  const fs = require('fs');
  const path = require('path');
  const p = path.join(__dirname, '..', 'docs', '404.html');
  assert.ok(fs.existsSync(p), 'docs/404.html must be built');
  const html = fs.readFileSync(p, 'utf8');
  assert.ok(html.includes('href="/abaitzik-monitor/"'), 'must offer the way back');
  assert.ok(html.includes('dir="rtl"'));
});

// Nineteen answers on 16.9 linked to sign photos that a later commit tidied
// away, so scrolling back in the chat was a wall of 404s. The files are cheap
// to keep and the answers are permanent; this is the guard that keeps them.
test('every file this repo ever linked to in an answer is still shipped', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const dir = path.join(root, 'data', 'chat', 'chat');
  if (!fs.existsSync(dir)) return; // data/ is not published; skip off machine
  const own = 'https://itcohen2-maker.github.io/abaitzik-monitor/';
  const missing = [];
  for (const f of fs.readdirSync(dir)) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (m.from !== 'claude') continue;
    for (const raw of String(m.text || '').match(/https?:\/\/[^\s<>"]+/g) || []) {
      const url = raw.replace(/[.,;:!?)"]+$/, '');
      if (!url.startsWith(own)) continue;
      const rel = url.slice(own.length).split('?')[0].split('#')[0];
      if (!rel || rel.endsWith('/')) continue;
      const target = path.join(root, 'docs', decodeURIComponent(rel));
      if (!fs.existsSync(target)) missing.push(f + ' -> ' + rel);
    }
  }
  assert.deepEqual(missing, [], 'answers pointing at files that no longer exist');
});
