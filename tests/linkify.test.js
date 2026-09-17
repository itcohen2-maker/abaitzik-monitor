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
