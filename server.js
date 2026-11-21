'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const pacing = require('./lib/pacing');

const PORT = process.env.PORT || 4173;
const PUBLIC = path.join(__dirname, 'public');

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function summary() {
  const state = store.load();
  const items = Object.values(state.items);
  const pending = items.filter((i) => !i.repliedAt && !i.skipped);
  const byNetwork = {};

  for (const net of ['facebook', 'instagram', 'tiktok', 'youtube']) {
    const mine = items.filter((i) => i.network === net);
    byNetwork[net] = {
      total: mine.length,
      pending: mine.filter((i) => !i.repliedAt && !i.skipped).length,
      replied: mine.filter((i) => i.repliedAt).length,
      repliesLeft: pacing.remaining(state, net, 'replies'),
      likesLeft: pacing.remaining(state, net, 'likes'),
      repliesToday: pacing.usedToday(state, net, 'replies'),
      likesToday: pacing.usedToday(state, net, 'likes'),
    };
  }

  const recent = items
    .filter((i) => i.repliedAt)
    .sort((a, b) => (a.repliedAt < b.repliedAt ? 1 : -1))
    .slice(0, 40);

  return {
    updatedAt: state.updatedAt,
    quietHours: pacing.isQuietHours(),
    commands: state.commands,
    counts: {
      total: items.length,
      pending: pending.length,
      replied: items.filter((i) => i.repliedAt).length,
      skipped: items.filter((i) => i.skipped).length,
    },
    byNetwork,
    pending: pending.slice(0, 100),
    recent,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/state' && req.method === 'GET') {
    return json(res, 200, summary());
  }

  if (url.pathname === '/api/command' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, 400, { error: 'bad json' });
    }
    const text = String(body.text || '').trim();
    if (!text) return json(res, 400, { error: 'empty' });
    const state = store.load();
    state.commands.unshift({
      text,
      at: new Date().toISOString(),
      done: false,
    });
    state.commands = state.commands.slice(0, 50);
    store.save(state);
    return json(res, 200, { ok: true, commands: state.commands });
  }

  if (url.pathname === '/api/skip' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const state = store.load();
    const it = state.items[body.key];
    if (!it) return json(res, 404, { error: 'not found' });
    it.skipped = true;
    it.skipReason = body.reason || 'דילוג ידני';
    store.save(state);
    return json(res, 200, { ok: true });
  }

  // static
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    const ext = path.extname(full);
    const type =
      ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
      : ext === '.css' ? 'text/css; charset=utf-8'
      : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[monitor] http://127.0.0.1:${PORT}`);
});
