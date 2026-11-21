'use strict';
// Small WaveSpeed driver: submit a job, poll until done, download the output.
// curl on purpose - urllib and fetch both get connection resets on this box.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KEY = process.env.WAVESPEED_API_KEY;
const BASE = 'https://api.wavespeed.ai/api/v3';

function sleep(sec) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sec * 1000);
}

function curl(args) {
  for (let i = 0; i < 5; i++) {
    try { return execFileSync('curl', ['-sS', '--max-time', '120', ...args], { encoding: 'utf8' }); }
    catch (e) { if (i === 4) throw e; sleep(5); }
  }
}

// Raw UTF-8 in a Windows command line arrives as question marks, and a Hebrew
// prompt that arrives mangled comes back as an empty clip. So the body goes
// through a file, escaped down to pure ascii.
function asciiJson(body) {
  return JSON.stringify(body).replace(/[^\x20-\x7e]/g,
    c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function submit(model, body) {
  const tmp = path.join(os.tmpdir(), 'ws-body-' + Date.now() + '.json');
  fs.writeFileSync(tmp, asciiJson(body), 'ascii');
  const out = curl(['-X', 'POST', BASE + '/' + model,
    '-H', 'Authorization: Bearer ' + KEY, '-H', 'Content-Type: application/json',
    '--data-binary', '@' + tmp]);
  fs.unlinkSync(tmp);
  const j = JSON.parse(out);
  if (!j.data || !j.data.id) throw new Error('submit failed: ' + out.slice(0, 400));
  return j.data.id;
}

function poll(id, tries = 180) {
  for (let i = 0; i < tries; i++) {
    const out = curl([BASE + '/predictions/' + id + '/result', '-H', 'Authorization: Bearer ' + KEY]);
    let j; try { j = JSON.parse(out); } catch { j = null; }
    const st = j && j.data && j.data.status;
    if (st === 'completed') return j.data.outputs[0];
    if (st === 'failed') throw new Error('job failed: ' + out.slice(0, 400));
    sleep(5);
  }
  throw new Error('timeout on ' + id);
}

function download(url, dest, min = 10240) {
  for (let i = 0; i < 5; i++) {
    try {
      execFileSync('curl', ['-sS', '-L', '--max-time', '300', '-o', dest, url], { stdio: 'ignore' });
      if (fs.existsSync(dest) && fs.statSync(dest).size > min) return dest;
    } catch {}
    sleep(5);
  }
  throw new Error('download failed: ' + url);
}

module.exports = { submit, poll, download, sleep, asciiJson };
