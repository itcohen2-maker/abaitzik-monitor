#!/usr/bin/env node
'use strict';
/*
  25.11.2026, Itzik: "אני לא יכול להסתמך על המחשב שלי... כל דבר שאתה יכול להעביר דרך השרת עם ה-API, אנחנו נעשה".
  Itzik's own Google Drive (itcohen2@gmail.com) straight from the server, with no computer in between.
  The connection: setup page /s/<token>, the token in data/my-drive-token.txt (not in git, this repo is public),
  step "google", scope drive.file: the server sees only the files and folders it created itself, never the rest
  of his Drive. A folder path is created on first use and its id kept in data/my-drive-folders.json.

  node lib/my-drive.js status                   connected or not, and as whom
  node lib/my-drive.js put <file> <a/b/c>       upload a file into that folder path (created if missing)
  require: put(buf, name, ['a','b']) -> { id, size, link }, folder(['a','b']) -> id, ready() -> bool
*/
const fs = require('fs');
const path = require('path');
const oauth = require('./oauth.js');

const DATA = process.env.MY_DRIVE_DATA || path.join(__dirname, '..', 'data');
const STEP = 'google';
const API = 'https://www.googleapis.com/drive/v3/files';
const UP = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';

function tok() { try { return fs.readFileSync(path.join(DATA, 'my-drive-token.txt'), 'utf8').trim(); } catch (e) { return ''; } }
function link() { return 'https://form.it-solution.co.il/s/' + tok(); }
function saved() {
  const t = tok(); if (!/^[a-f0-9]{20}$/.test(t)) return null;
  try { return JSON.parse(JSON.parse(fs.readFileSync(path.join(DATA, 'setup', t + '.secrets.json'), 'utf8'))[STEP].value); } catch (e) { return null; }
}
function ready() { return !!saved(); }

let cached = { access: '', until: 0 };
async function access() {
  if (cached.access && Date.now() < cached.until) return cached.access;
  const s = saved();
  if (!s) throw new Error('הדרייב שלך עוד לא מחובר לשרת: ' + link());
  const c = await oauth.check(s);
  if (!c.ok) throw new Error('החיבור לדרייב ' + (c.revoked ? 'בוטל' : 'נכשל (' + c.error + ')') + ', לחבר מחדש: ' + link());
  cached = { access: c.access, until: Date.now() + 45 * 60e3 };
  return c.access;
}

async function call(method, url, body, headers) {
  const a = await access();
  const r = await fetch(url, { method, body, headers: Object.assign({ Authorization: 'Bearer ' + a }, headers || {}), signal: AbortSignal.timeout(180000) });
  const t = await r.text();
  if (!r.ok) throw new Error('drive ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : {};
}
const qEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function folderMap() { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'my-drive-folders.json'), 'utf8')); } catch (e) { return {}; } }
function saveFolderMap(m) { fs.writeFileSync(path.join(DATA, 'my-drive-folders.json'), JSON.stringify(m, null, 1)); }

/** The id of a folder path under My Drive, created when missing. */
async function folder(parts) {
  const m = folderMap();
  let parent = 'root', key = '';
  for (const name of parts) {
    key = key ? key + '/' + name : name;
    let id = m[key];
    if (id) {
      try { const f = await call('GET', API + '/' + id + '?fields=id,trashed'); if (f.trashed) id = ''; } catch (e) { id = ''; }
    }
    if (!id) {
      const q = "name = '" + qEsc(name) + "' and '" + parent + "' in parents and mimeType = '" + FOLDER + "' and trashed = false";
      const found = await call('GET', API + '?' + new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' }));
      id = found.files && found.files[0] ? found.files[0].id : '';
      if (!id) id = (await call('POST', API + '?fields=id', JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }), { 'Content-Type': 'application/json' })).id;
      m[key] = id; saveFolderMap(m);
    }
    parent = id;
  }
  return parent;
}

/** Upload a buffer. Resolves only when Drive reports the same size back. */
async function put(buf, name, parts, mime) {
  const parent = await folder(parts);
  const b = 'rd' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [parent] });
  const body = Buffer.concat([
    Buffer.from('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: ' + (mime || 'application/octet-stream') + '\r\n\r\n'),
    buf, Buffer.from('\r\n--' + b + '--'),
  ]);
  const f = await call('POST', UP + '?uploadType=multipart&fields=id,size,name,webViewLink', body, { 'Content-Type': 'multipart/related; boundary=' + b });
  if (Number(f.size) !== buf.length) throw new Error('drive size ' + f.size + ' != ' + buf.length);
  return { id: f.id, size: Number(f.size), link: f.webViewLink };
}

/** Upload a big file from disk in 16MB pieces (resumable). Resolves only when Drive reports the same size back. */
async function putFile(file, name, parts) {
  const parent = await folder(parts);
  const size = fs.statSync(file).size;
  const a = await access();
  const init = await fetch(UP + '?uploadType=resumable&fields=id,size,name', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + a, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size) },
    body: JSON.stringify({ name, parents: [parent] }), signal: AbortSignal.timeout(60000),
  });
  const session = init.headers.get('location');
  if (!init.ok || !session) throw new Error('drive init ' + init.status);
  const CH = 16 * 1024 * 1024, fd = fs.openSync(file, 'r');
  try {
    let off = 0, res = null;
    while (off < size) {
      const n = Math.min(CH, size - off), buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, off);
      let ok = false;
      for (let t = 0; t < 5 && !ok; t++) {
        try {
          const r = await fetch(session, { method: 'PUT', body: buf, signal: AbortSignal.timeout(300000),
            headers: { 'Content-Length': String(n), 'Content-Range': 'bytes ' + off + '-' + (off + n - 1) + '/' + size } });
          if (r.status === 308) ok = true;
          else if (r.ok) { res = JSON.parse(await r.text()); ok = true; }
          else if (r.status < 500 && r.status !== 429) throw Object.assign(new Error('drive put ' + r.status), { fatal: true });
        } catch (e) { if (e.fatal || t === 4) throw e; await new Promise((z) => setTimeout(z, 3000 * (t + 1))); }
      }
      off += n;
    }
    if (!res || Number(res.size) !== size) throw new Error('drive size ' + (res && res.size) + ' != ' + size);
    return { id: res.id, size };
  } finally { fs.closeSync(fd); }
}

/** Files this app made in a folder path whose name starts with prefix, newest name first. */
async function listIn(parts, prefix) {
  const parent = await folder(parts);
  const q = "'" + parent + "' in parents and trashed = false and name contains '" + qEsc(prefix) + "'";
  const r = await call('GET', API + '?' + new URLSearchParams({ q, fields: 'files(id,name,size)', pageSize: '200' }));
  return (r.files || []).filter((f) => f.name.startsWith(prefix)).sort((x, y) => (x.name < y.name ? 1 : -1));
}
async function remove(id) { await call('DELETE', API + '/' + id); }

async function status() {
  if (!ready()) return { ok: false, why: 'לא מחובר', link: link() };
  const a = await access();
  const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + a } });
  const j = await r.json();
  return { ok: r.ok, email: j.user && j.user.emailAddress };
}

module.exports = { ready, access, folder, put, putFile, listIn, remove, status, link };

if (require.main === module) {
  (async () => {
    const [cmd, a, b] = process.argv.slice(2);
    if (cmd === 'status') console.log(JSON.stringify(await status()));
    else if (cmd === 'put') console.log(JSON.stringify(await put(fs.readFileSync(a), path.basename(a), String(b || '').split('/').filter(Boolean))));
    else if (cmd === 'putfile') console.log(JSON.stringify(await putFile(a, path.basename(a), String(b || '').split('/').filter(Boolean))));
    else console.log('node lib/my-drive.js status | put <file> <a/b/c> | putfile <file> <a/b/c>');
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
