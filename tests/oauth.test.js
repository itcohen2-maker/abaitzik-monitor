'use strict';
/*
  5.11.2026, "Connect with Google / Facebook" (lib/oauth.js, setup.js, oauth-health.js).
  What must never happen: a callback accepted with a forged or old state, a token
  saved to the wrong setup page, a token shown back on the page, or a dead
  connection still painted green.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-'));
process.env.SETUP_DIR = path.join(tmp, 'setup');
process.env.OAUTH_APP_FILE = path.join(tmp, 'oauth-app.json');
fs.mkdirSync(process.env.SETUP_DIR);
fs.writeFileSync(process.env.OAUTH_APP_FILE, JSON.stringify({
  stateKey: 'k'.repeat(64),
  google: { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'gsecret' },
  meta: { appId: '111', appSecret: 'msecret', configId: '222' },
}));
const TOK = 'abcdef0123456789abcd';
fs.writeFileSync(path.join(process.env.SETUP_DIR, TOK + '.def.json'), JSON.stringify({
  client: 'לקוח בדיקה', title: 't', hello: 'h',
  steps: [{ id: 'g', icon: '📧', title: 'גוגל', text: 'x', oauth: { provider: 'google', scopes: ['gmail', 'calendar'] } },
    { id: 'fb', icon: '📘', title: 'פייסבוק', text: 'x', oauth: { provider: 'meta' } }],
}));
const oa = require('../lib/oauth.js');
const setup = require('../setup.js');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
function after(fn) { require('node:test').after(fn); }

function res() {
  const r = { code: 0, headers: {}, body: '' };
  r.writeHead = (c, h) => { r.code = c; Object.assign(r.headers, h || {}); };
  r.end = (b) => { r.body = b || ''; };
  return r;
}
function stateOf(url) { return new URL(url).searchParams.get('state'); }
function mockFetch(map) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    const k = Object.keys(map).find((x) => String(url).indexOf(x) > -1);
    return { ok: true, json: async () => (k ? (typeof map[k] === 'function' ? map[k](url, opts) : map[k]) : {}) };
  };
  return calls;
}

test('the state is signed: a changed byte, another key or another provider is refused', () => {
  const s = oa.sign({ p: 'google', t: TOK, s: 'g', n: 'n', exp: Date.now() + 60000 }, 'key1');
  assert.ok(oa.verify(s, 'key1', 'google'));
  assert.equal(oa.verify(s, 'key2', 'google'), null);
  assert.equal(oa.verify(s, 'key1', 'meta'), null);
  assert.equal(oa.verify(s.slice(0, -2) + (s.slice(-2) === 'AA' ? 'AB' : 'AA'), 'key1', 'google'), null);
  assert.equal(oa.verify('', 'key1', 'google'), null);
  assert.equal(oa.verify(s, '', 'google'), null);
});

test('an old state is refused', () => {
  const s = oa.sign({ p: 'google', t: TOK, s: 'g', n: 'n', exp: 1000 }, 'key1');
  assert.equal(oa.verify(s, 'key1', 'google', 2000), null);
});

test('google start: offline, consent, PKCE, our redirect, the card scopes', () => {
  const r = oa.startUrl('google', TOK, 'g', ['gmail', 'calendar']);
  const u = new URL(r.url);
  assert.equal(u.host, 'accounts.google.com');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://form.it-solution.co.il/oauth/google/callback');
  const sc = u.searchParams.get('scope').split(' ');
  assert.ok(sc.includes('https://www.googleapis.com/auth/gmail.readonly'));
  assert.ok(sc.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.ok(!sc.some((x) => /mail\.google\.com|gmail\.modify|gmail\.send/.test(x)), 'never full mail access');
});

test('meta start uses the Login for Business configuration', () => {
  const u = new URL(oa.startUrl('meta', TOK, 'fb').url);
  assert.equal(u.host, 'www.facebook.com');
  assert.equal(u.searchParams.get('config_id'), '222');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://form.it-solution.co.il/oauth/meta/callback');
});

test('the page shows a connect button per provider and no token', () => {
  const r = res(); setup.servePage(TOK, r);
  assert.equal(r.code, 200);
  assert.ok(r.body.includes('/oauth/google/start?t=' + TOK + '&amp;s=g'));
  assert.ok(r.body.includes('/oauth/meta/start?t=' + TOK + '&amp;s=fb'));
  assert.ok(r.body.includes('התחברות עם גוגל'));
});

test('start for an unknown page or a step of another provider is 404', () => {
  let r = res(); setup.oauthStart('google', new URLSearchParams({ t: '0000000000000000', s: 'g' }), r); assert.equal(r.code, 404);
  r = res(); setup.oauthStart('meta', new URLSearchParams({ t: TOK, s: 'g' }), r); assert.equal(r.code, 404);
  r = res(); setup.oauthStart('google', new URLSearchParams({ t: TOK, s: 'g' }), r); assert.equal(r.code, 302);
  assert.ok(r.headers.Location.startsWith('https://accounts.google.com/'));
});

test('google callback saves the refresh token for that page only, marks the card, tells the monitor', async () => {
  const st = stateOf(oa.startUrl('google', TOK, 'g', ['gmail']).url);
  const idt = 'x.' + Buffer.from(JSON.stringify({ email: 'client@gmail.com' })).toString('base64url') + '.y';
  const calls = mockFetch({ 'oauth2.googleapis.com/token': { access_token: 'AT', refresh_token: 'RT1', id_token: idt, scope: 's' } });
  const said = []; const r = res();
  await setup.oauthCallback('google', new URLSearchParams({ state: st, code: 'C' }), r, (k, t) => said.push(t));
  assert.equal(r.code, 302); assert.equal(r.headers.Location, '/s/' + TOK + '#g');
  assert.ok(String(calls[0].opts.body).includes('code_verifier='), 'PKCE verifier sent');
  const sec = JSON.parse(fs.readFileSync(path.join(process.env.SETUP_DIR, TOK + '.secrets.json'), 'utf8'));
  assert.equal(JSON.parse(sec.g.value).refresh_token, 'RT1');
  const s = JSON.parse(fs.readFileSync(path.join(process.env.SETUP_DIR, TOK + '.json'), 'utf8'));
  assert.ok(s.steps.g.got); assert.equal(s.steps.g.who, 'client@gmail.com');
  assert.ok(said[0].includes('גוגל חובר') && !said[0].includes('RT1'));
  const p = res(); setup.servePage(TOK, p);
  assert.ok(!p.body.includes('RT1') && !p.body.includes('AT"'), 'no token on the page');
  assert.ok(p.body.includes('✓ מחובר (client@gmail.com)'));
});

test('the same state cannot be used twice', async () => {
  const st = stateOf(oa.startUrl('google', TOK, 'g').url);
  mockFetch({ 'oauth2.googleapis.com/token': { access_token: 'AT', refresh_token: 'RT2' } });
  assert.equal((await oa.callback('google', new URLSearchParams({ state: st, code: 'C' }))).ok, true);
  const again = await oa.callback('google', new URLSearchParams({ state: st, code: 'C' }));
  assert.equal(again.ok, false); assert.equal(again.error, 'state');
});

test('a forged state never reaches the token endpoint', async () => {
  const calls = mockFetch({});
  const r = res();
  await setup.oauthCallback('google', new URLSearchParams({ state: 'abc.def', code: 'C' }), r, () => {});
  assert.equal(r.code, 400); assert.equal(calls.length, 0);
});

test('cancel on the consent screen leaves a message, not a green card', async () => {
  const st = stateOf(oa.startUrl('meta', TOK, 'fb').url);
  const r = res();
  await setup.oauthCallback('meta', new URLSearchParams({ state: st, error: 'access_denied' }), r, () => {});
  const s = JSON.parse(fs.readFileSync(path.join(process.env.SETUP_DIR, TOK + '.json'), 'utf8'));
  assert.equal(s.steps.fb.oaErr, 'denied'); assert.ok(!s.steps.fb.got);
});

test('meta callback keeps the token and lists the pages with their instagram', async () => {
  const st = stateOf(oa.startUrl('meta', TOK, 'fb').url);
  mockFetch({
    '/oauth/access_token': { access_token: 'SYS' },
    '/me/accounts': { data: [{ id: '9', name: 'הדף שלי', access_token: 'PT', instagram_business_account: { id: '7', username: 'mybiz' } }] },
    '/me?fields=id,name': { id: '5', name: 'Client' },
  });
  const said = []; const r = res();
  await setup.oauthCallback('meta', new URLSearchParams({ state: st, code: 'C' }), r, (k, t) => said.push(t));
  const sec = JSON.parse(fs.readFileSync(path.join(process.env.SETUP_DIR, TOK + '.secrets.json'), 'utf8'));
  const v = JSON.parse(sec.fb.value);
  assert.equal(v.token, 'SYS'); assert.equal(v.pages[0].token, 'PT');
  assert.ok(said[0].includes('הדף שלי + @mybiz'));
  assert.ok(!said[0].includes('SYS') && !said[0].includes('PT,'));
});

test('a revoked google connection turns the card back and tells Itzik once', async () => {
  mockFetch({ 'oauth2.googleapis.com/token': { error: 'invalid_grant' } });
  const told = [];
  const health = require('../oauth-health.js');
  const out = await health.run({ notify: (t, m) => told.push(m) });
  assert.ok(out.find((o) => o.id === 'g' && o.revoked));
  const s = JSON.parse(fs.readFileSync(path.join(process.env.SETUP_DIR, TOK + '.json'), 'utf8'));
  assert.ok(!s.steps.g.got); assert.equal(s.steps.g.oaErr, 'revoked');
  assert.equal(told.length, 1); assert.ok(told[0].includes('/s/' + TOK + '#g'));
  await health.run({ notify: (t, m) => told.push(m) });
  assert.equal(told.length, 1, 'not twice');
});

test('a passing failure changes nothing', async () => {
  const st = stateOf(oa.startUrl('google', TOK, 'g').url);
  mockFetch({ 'oauth2.googleapis.com/token': { access_token: 'AT', refresh_token: 'RT3' } });
  await setup.oauthCallback('google', new URLSearchParams({ state: st, code: 'C' }), res(), () => {});
  mockFetch({ 'oauth2.googleapis.com/token': { error: 'temporarily_unavailable' } });
  const told = [];
  await require('../oauth-health.js').run({ notify: (t, m) => told.push(m) });
  const s = JSON.parse(fs.readFileSync(path.join(process.env.SETUP_DIR, TOK + '.json'), 'utf8'));
  assert.ok(s.steps.g.got); assert.equal(told.length, 0);
});

test('gmail query is read only shaped and formatted like mail-search.py', () => {
  const g = require('../lib/gmail-api.js');
  assert.equal(g.query({ text: 'חשבונית', from: 'a@b.c', days: 7 }), 'חשבונית from:a@b.c newer_than:7d');
  const line = g.format([{ id: 'x1', when: '05.11.2026 09:30', from: 'A <a@b.c>', subject: 'S', snippet: 'n' }]).split('\n')[0];
  assert.match(line, /^\[(\w+)\] (\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}) \| (.*)$/);
});
