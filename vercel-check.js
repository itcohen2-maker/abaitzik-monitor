'use strict';
/*
  10.11.2026, Itzik: "always check in Vercel that you are not creating too much history. This is also part of
  the manager's job." Every deploy keeps a full copy for 30 days, and the free team has 10GB (it filled up on
  31.10). This counts the deployments of each live project and sends the numbers to the server, where the
  manager (lib/manager.js, vercelItem) shows one line and warns when a project keeps too many or deploys too
  often. Read only: it never deletes anything. Runs on Itzik's PC (the only place Vercel is logged in),
  scheduled task AbaItzikVercelCheck, every day 07:10 (setup-vercel-check.ps1).
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SSH_KEY = 'C:/Users/User/.ssh/monitor_server';
const SERVER = 'root@178.105.63.97';
const SERVER_FILE = '/home/monitor/abaitzik-monitor/data/status/vercel-history.json';
const PROJECTS = ['abaitzik-tech', 'itzik-site', 'shachar', 'ner', 'pegasus', 'card', 'bubot-theatre'];
const win = process.platform === 'win32';

function page(project, until) {
  const ep = '/v6/deployments?app=' + project + '&limit=100' + (until ? '&until=' + until : '');
  const out = execFileSync(win ? 'npx.cmd' : 'npx', ['--yes', 'vercel', 'api', win ? '"' + ep + '"' : ep],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: win });
  return JSON.parse(out.slice(out.indexOf('{')));
}

function count(project) {
  let all = [], until = '';
  for (let i = 0; i < 10; i++) {
    const j = page(project, until);
    all = all.concat(j.deployments || []);
    if (j.pagination && j.pagination.next) until = j.pagination.next; else break;
  }
  if (!all.length) return null;
  const now = Date.now();
  return {
    name: project, count: all.length,
    prod: all.filter((x) => x.target === 'production').length,
    last24: all.filter((x) => now - x.created < 864e5).length,
    oldest: new Date(Math.min(...all.map((x) => x.created))).toISOString().slice(0, 10),
  };
}

const res = { at: new Date().toISOString(), projects: [], errors: [] };
for (const p of PROJECTS) {
  try { const c = count(p); if (c) res.projects.push(c); } catch (e) { res.errors.push(p + ': ' + String(e.message || e).split('\n')[0].slice(0, 120)); }
}
res.projects.sort((a, b) => b.count - a.count);
console.log(JSON.stringify(res, null, 1));

if (process.argv.includes('--dry')) process.exit(0);
const tmp = path.join(os.tmpdir(), 'vercel-history.json');
fs.writeFileSync(tmp, JSON.stringify(res, null, 1));
execFileSync('scp', ['-i', SSH_KEY, '-o', 'BatchMode=yes', tmp, SERVER + ':' + SERVER_FILE], { stdio: 'pipe' });
execFileSync('ssh', ['-i', SSH_KEY, '-o', 'BatchMode=yes', SERVER, 'chown monitor:monitor ' + SERVER_FILE], { stdio: 'pipe' });
console.log('sent to the server');
