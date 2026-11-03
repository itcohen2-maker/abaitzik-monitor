'use strict';
// Shachar tile (31.10.2026): the invite handler in lib/shachar.js and the page docs/shachar/index.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sh = require('../lib/shachar.js');

function setup(opts) {
  opts = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shachar-'));
  const secretFile = path.join(dir, 'secret');
  if (opts.secret !== null) fs.writeFileSync(secretFile, (opts.secret || 'sekret') + '\n');
  const calls = [], notes = [];
  const state = { status: opts.status || 200, waitlist: opts.waitlist || [], apiInvites: opts.apiInvites || [], mailStatus: 200 };
  const mailFile = path.join(dir, 'mail-token');
  if (opts.mailToken) fs.writeFileSync(mailFile, opts.mailToken);
  const deps = {
    dir, secretFile, mailTokenFile: mailFile, rebuilt: 0,
    now: () => new Date('2026-10-31T10:00:00Z'),
    ownerCodeOk: (t) => String(t).includes('קוד 1234'),
    notify: (t, m) => notes.push([t, m]),
    rebuild: () => { deps.rebuilt++; },
    fetch: async (url, init) => {
      calls.push({ url, init });
      const ok = state.status >= 200 && state.status < 300;
      if (String(url).startsWith('https://api.forwardemail.net')) return { ok: state.mailStatus < 300, status: state.mailStatus, json: async () => ({}) };
      const body = url.endsWith('/api/admin/invite') && init.method === 'GET' ? { invites: state.apiInvites } : state.waitlist;
      return { ok, status: state.status, json: async () => body };
    },
  };
  return { dir, deps, calls, notes, state };
}
const msg = (title, obj) => ({ title, message: JSON.stringify(obj) });

test('an invalid email is rejected: no call, no state, no notify', async () => {
  const t = setup();
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', null, 'x@y.com,z@y.com']) {
    const r = await sh.route(msg('shachar-invite', { email: bad, code: '1234' }), t.deps);
    assert.equal(r.reason, 'bad-email');
  }
  assert.equal(t.calls.length, 0);
  assert.equal(t.notes.length, 0);
  assert.equal(sh.load(t.dir).invites.length, 0);
});

test('a message without the owner code changes nothing', async () => {
  const t = setup();
  assert.equal((await sh.route(msg('shachar-invite', { email: 'a@b.co', code: '9999' }), t.deps)).reason, 'code');
  assert.equal((await sh.route({ title: 'shachar-invite', message: 'not json' }, t.deps)).reason, 'code');
  assert.equal(t.calls.length, 0);
  assert.equal(sh.load(t.dir).invites.length, 0);
});

test('a missing secret file: the invite is kept pending and Itzik is notified', async () => {
  const t = setup({ secret: null });
  const r = await sh.route(msg('shachar-invite', { email: 'A@B.co', note: 'חבר', code: '1234' }), t.deps);
  assert.equal(r.reason, 'no-secret');
  assert.equal(t.calls.length, 0);
  assert.equal(t.notes.length, 1);
  const s = sh.load(t.dir);
  assert.deepEqual(s.invites.map((x) => [x.email, x.status, x.note]), [['a@b.co', 'pending', 'חבר']]);
  assert.equal(t.deps.rebuilt, 1);
  const r2 = await sh.route(msg('shachar-refresh', { code: '1234' }), t.deps);
  assert.equal(r2.reason, 'no-secret');
  assert.equal(t.notes.length, 2);
});

test('a good invite posts with the bearer secret and becomes invited', async () => {
  const t = setup({ waitlist: [{ email: 'W@x.com', created_at: '2026-10-01T00:00:00Z', invited: false }] });
  const r = await sh.route(msg('shachar-invite', { email: ' Dana@X.com ', note: 'n', code: '1234' }), t.deps);
  assert.equal(r.ok, true);
  const post = t.calls[0];
  assert.equal(post.url, 'https://shachar.abaitzik.com/api/admin/invite');
  assert.equal(post.init.method, 'POST');
  assert.equal(post.init.headers.authorization, 'Bearer sekret');
  assert.deepEqual(JSON.parse(post.init.body), { email: 'dana@x.com', note: 'n' });
  assert.equal(t.calls[1].url, 'https://shachar.abaitzik.com/api/admin/invite');
  assert.equal(t.calls[1].init.method, 'GET');
  assert.equal(t.calls[2].url, 'https://shachar.abaitzik.com/api/admin/waitlist');
  const s = sh.load(t.dir);
  assert.equal(s.invites[0].status, 'invited');
  assert.equal(s.waitlist[0].email, 'w@x.com');
  assert.ok(s.waitlistAt);
  assert.equal(t.notes.length, 0);
  assert.equal(fs.statSync(path.join(t.dir, 'shachar', 'state.json')).isFile(), true);
});

test('endpoint not deployed (404): pending, retried by the next invite', async () => {
  const t = setup({ status: 404 });
  const r = await sh.route(msg('shachar-invite', { email: 'a@b.co', code: '1234' }), t.deps);
  assert.equal(r.ok, false);
  assert.equal(sh.load(t.dir).invites[0].status, 'pending');
  assert.equal(t.notes.length, 0);
  t.state.status = 200;
  await sh.route(msg('shachar-invite', { email: 'c@d.co', code: '1234' }), t.deps);
  const s = sh.load(t.dir);
  assert.deepEqual(s.invites.map((x) => x.status), ['invited', 'invited']);
});

test('a network error is also pending, and a manual retry of the same email works', async () => {
  const t = setup();
  const good = t.deps.fetch;
  t.deps.fetch = async () => { throw new Error('offline'); };
  await sh.route(msg('shachar-invite', { email: 'a@b.co', code: '1234' }), t.deps);
  assert.equal(sh.load(t.dir).invites[0].status, 'pending');
  t.deps.fetch = good;
  await sh.route(msg('shachar-invite', { email: 'a@b.co', code: '1234' }), t.deps);
  const s = sh.load(t.dir);
  assert.equal(s.invites.length, 1);
  assert.equal(s.invites[0].status, 'invited');
});

test('refresh loads the waitlist and retries pending invites', async () => {
  const t = setup({ status: 404 });
  await sh.route(msg('shachar-invite', { email: 'a@b.co', code: '1234' }), t.deps);
  t.state.status = 200;
  t.state.waitlist = [{ email: 'Z@x.com', created_at: '2026-10-02T00:00:00Z', invited: true }, { email: 'bad', created_at: 'x' }];
  const r = await sh.route(msg('shachar-refresh', { code: '1234' }), t.deps);
  assert.equal(r.ok, true);
  const s = sh.load(t.dir);
  assert.deepEqual(s.waitlist.map((x) => [x.email, x.invited]), [['z@x.com', true]]);
  assert.equal(s.invites[0].status, 'invited');
});

test('state drift: invites made straight through the API show up as invited on refresh', async () => {
  const t = setup({
    waitlist: [{ email: 'ilayco10@gmail.com', created_at: '2026-10-31T23:12:42Z', invited: true }],
    apiInvites: [{ email: 'ilayco10@gmail.com', invited_at: '2026-11-01T12:20:00Z', note: null }, { email: 'Hagitit7@gmail.com', invited_at: '2026-10-31T22:38:00Z', note: 'n' }],
  });
  const r = await sh.route(msg('shachar-refresh', { code: '1234' }), t.deps);
  assert.equal(r.ok, true);
  const s = sh.load(t.dir);
  assert.deepEqual(s.invites.map((x) => [x.email, x.status]), [['ilayco10@gmail.com', 'invited'], ['hagitit7@gmail.com', 'invited']]);
  assert.equal(s.invites[0].letterAt, undefined);
  assert.equal(t.calls.filter((c) => c.url.includes('forwardemail')).length, 0);
});

test('a pending local invite that the API already knows becomes invited', async () => {
  const t = setup({ status: 404 });
  await sh.route(msg('shachar-invite', { email: 'a@b.co', code: '1234' }), t.deps);
  t.state.status = 200;
  t.state.apiInvites = [{ email: 'a@b.co', invited_at: '2026-11-01T00:00:00Z' }];
  await sh.route(msg('shachar-refresh', { code: '1234' }), t.deps);
  assert.equal(sh.load(t.dir).invites[0].status, 'invited');
});

test('one tap with a mail token: invited and the letter is delivered from shachar@abaitzik.com', async () => {
  const t = setup({ mailToken: 'tok123' });
  const letter = { subject: 'הזמנה לנסות את שחר', body: 'היי,\nהכניסה: https://shachar.abaitzik.com' };
  const r = await sh.route(msg('shachar-invite', { email: 'Dana@X.com', letter, code: '1234' }), t.deps);
  assert.equal(r.ok, true);
  assert.equal(r.letter, 'sent');
  const mail = t.calls.find((c) => c.url.startsWith('https://api.forwardemail.net/v1/emails'));
  assert.ok(mail);
  assert.equal(mail.init.headers.authorization, 'Basic ' + Buffer.from('tok123:').toString('base64'));
  const b = JSON.parse(mail.init.body);
  assert.equal(b.to, 'dana@x.com');
  assert.match(b.from, /shachar@abaitzik\.com/);
  assert.equal(b.subject, letter.subject);
  assert.ok(b.text.startsWith(letter.body) && b.text.includes("login?email=dana%40x.com"));
  assert.match(b.html, /dir="rtl"/);
  const s = sh.load(t.dir);
  assert.equal(s.mailAuto, true);
  assert.equal(s.invites[0].letterMode, 'sent');
  assert.ok(s.invites[0].letterAt);
  assert.equal(s.invites[0].letterReq, undefined);
  // 1.11, Itzik: never a second letter to the same tester, even when he taps again.
  await sh.route(msg('shachar-invite', { email: 'dana@x.com', letter, code: '1234' }), t.deps);
  assert.equal(t.calls.filter((c) => c.url.includes('forwardemail')).length, 1);
  assert.equal(sh.load(t.dir).invites.length, 1);
});

test('a mail server error keeps the approval and is retried on refresh', async () => {
  const t = setup({ mailToken: 'tok' });
  t.state.mailStatus = 503;
  const letter = { subject: 's', body: 'b' };
  await sh.route(msg('shachar-invite', { email: 'a@b.co', letter, code: '1234' }), t.deps);
  let s = sh.load(t.dir);
  assert.equal(s.invites[0].status, 'invited');
  assert.equal(s.invites[0].letterErr, 'http-503');
  assert.ok(s.invites[0].letterReq);
  t.state.mailStatus = 200;
  await sh.route(msg('shachar-refresh', { code: '1234' }), t.deps);
  s = sh.load(t.dir);
  assert.equal(s.invites[0].letterMode, 'sent');
  assert.equal(s.invites[0].letterErr, undefined);
});

test('no mail token: nothing is mailed; the Gmail draft is recorded when the page opened it', async () => {
  const t = setup();
  const r = await sh.route(msg('shachar-invite', { email: 'a@b.co', letter: { subject: 's', body: 'b', draft: true }, code: '1234' }), t.deps);
  assert.equal(r.letter, 'draft');
  assert.equal(t.calls.filter((c) => c.url.includes('forwardemail')).length, 0);
  const s = sh.load(t.dir);
  assert.equal(s.mailAuto, false);
  assert.equal(s.invites[0].letterMode, 'draft');
  // A server side send was asked for but there is no token: approval stays, Itzik is told.
  const r2 = await sh.route(msg('shachar-invite', { email: 'c@d.co', letter: { subject: 's', body: 'b' }, code: '1234' }), t.deps);
  assert.equal(r2.ok, true);
  assert.equal(r2.letter, 'no-token');
  assert.equal(t.notes.length, 1);
});

test('the page: back button, big link, the exact invite text, no dashes in visible copy', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'shachar', 'index.html'), 'utf8');
  assert.match(html, /href="\.\.\/index\.html"/);
  assert.match(html, /href="https:\/\/shachar\.abaitzik\.com"[^>]*>לפתוח את שחר</);
  assert.match(html, /מי הצטרף, לפי סדר ההרשמה/);
  assert.match(html, /הזמנה ידנית, לא חובה/);
  // 3.11, Itzik: "אני לא מאשר יותר ידני". The page says entry is open and automatic, first.
  assert.match(html, /פתוח עכשיו, הכניסה אוטומטית/);
  assert.ok(html.indexOf('פתוח עכשיו, הכניסה אוטומטית') < html.indexOf('מי הצטרף, לפי סדר ההרשמה'));
  assert.ok(!html.includes('בהרצה סגורה'));
  assert.match(html, /שחר מוכן נשלח ✓/);
  assert.match(html, /נכנס ✓/);
  assert.match(html, /להזמין ולשלוח מכתב/);
  assert.match(html, /לשלוח שוב את המכתב/);
  assert.match(html, /המכתב נשלח ✓/);
  assert.match(html, /הוזמן ✓/);
  // 1.11, Itzik: the waitlist comes first, oldest signup first, and only invitations on the page.
  assert.ok(html.indexOf('מי הצטרף, לפי סדר ההרשמה') < html.indexOf('הזמנה ידנית, לא חובה'));
  assert.ok(!/id="(motion|voice|posts|logos)"/.test(html));
  assert.ok(html.includes('value="הזמנה לנסות את שחר"'));
  const body = [
    'הי,',
    '',
    'בתקופות מאתגרות כולנו מחפשים משהו שירים אותנו, ידחוף קדימה וייתן עוגן קטן. אז בניתי אותו. קוראים לו שחר.',
    '',
    'שחר הוא בינה מלאכותית, לא בן אדם. אפשר לכתוב לו בכל רגע: כשקשה וגם כשיש הצלחה קטנה.',
    '',
    'בכל בוקר שחר שולח לך דחיפה קטנה כדי להתחיל את היום ברגל ימין. אפשר לכתוב לו תמיד, והוא כאן בשבילך.',
    '',
    'פתחתי את המערכת הזו קודם כל לכמה אנשים קרובים. אשמח שתנסו, תספרו לי מה עובד לכם ומה פחות.',
    '',
    'הכניסה: https://shachar.abaitzik.com',
    'נכנסים עם כתובת המייל הזאת, או עם Google.',
    'יאללה, מחכה לשמוע,',
    'אבא איציק',
  ].join('\n');
  assert.ok(html.includes('>' + body + '</textarea>'));
  // Hebrew visible text never carries a dash or hyphen next to Hebrew letters.
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.equal(/[‐-―־]/.test(visible), false);
  assert.equal(/[֐-׿]\s*-|-\s*[֐-׿]/.test(visible), false);
});

test('the built monitor page opens the Shachar page from inside העסק שלי and from its own home tile', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
  assert.match(html, /id="gShachar"/);
  assert.match(html, /data-bz="shachar"/);
  assert.match(html, /shachar\/index\.html/);
  // 3.11: the home tile tells the current state, not the old waitlist wording.
  assert.match(html, /id="gShachar"[^>]*data-upd="sh-[^"]+"/);
  assert.match(html, /id="gShachar"[\s\S]{0,400}<small>פתוח עכשיו/);
  assert.ok(!/רשימת ההמתנה של שחר/.test(html));
});

// 3.11, Itzik: no manual approval. A waitlist email is invited and gets the welcome letter on the next refresh.
test('auto invite: a new waitlist email is invited and the welcome letter goes out with the login button', async () => {
  const t = setup({ mailToken: 'tok', waitlist: [{ email: 'new@x.co', created_at: '2026-11-03T08:00:00Z', invited: false }] });
  const r = await sh.handleRefresh(t.deps);
  assert.equal(r.ok, true);
  const post = t.calls.find((c) => c.init.method === 'POST' && c.url.endsWith('/api/admin/invite'));
  assert.ok(post, 'invite posted');
  assert.equal(JSON.parse(post.init.body).email, 'new@x.co');
  const mail = t.calls.find((c) => String(c.url).startsWith('https://api.forwardemail.net'));
  assert.ok(mail, 'letter sent');
  const m = JSON.parse(mail.init.body);
  assert.equal(m.to, 'new@x.co');
  assert.equal(m.subject, sh.AUTO_LETTER.subject);
  assert.ok(m.html.includes('https://shachar.abaitzik.com/login?email=new%40x.co'));
  assert.ok(m.html.includes('להיכנס לשחר'));
  assert.ok(m.text.includes('login?email=new%40x.co'));
  const rec = sh.load(t.dir).invites[0];
  assert.equal(rec.status, 'invited');
  assert.equal(rec.letterMode, 'sent');
  assert.equal(rec.auto, true);
});

test('auto invite: someone already invited is not mailed again', async () => {
  const t = setup({ mailToken: 'tok', waitlist: [{ email: 'old@x.co', created_at: '2026-11-01T08:00:00Z', invited: true }] });
  await sh.handleRefresh(t.deps);
  assert.equal(t.calls.filter((c) => c.init.method === 'POST').length, 0);
  await sh.handleRefresh(t.deps);
  assert.equal(t.calls.filter((c) => c.init.method === 'POST').length, 0);
});

test('auto invite: a second refresh does not send the letter twice', async () => {
  const t = setup({ mailToken: 'tok', waitlist: [{ email: 'new@x.co', created_at: '2026-11-03T08:00:00Z', invited: false }] });
  await sh.handleRefresh(t.deps);
  await sh.handleRefresh(t.deps);
  assert.equal(t.calls.filter((c) => String(c.url).startsWith('https://api.forwardemail.net')).length, 1);
});

test('auto invite: more than 25 in a day stops, the rest wait and Itzik is told once', async () => {
  const wl = Array.from({ length: 30 }, (_, i) => ({ email: 'p' + i + '@x.co', created_at: '2026-11-03T08:00:00Z', invited: false }));
  const t = setup({ mailToken: 'tok', waitlist: wl });
  await sh.handleRefresh(t.deps);
  assert.equal(t.calls.filter((c) => c.init.method === 'POST' && c.url.endsWith('/api/admin/invite')).length, 25);
  assert.equal(t.notes.filter((n) => /עצרתי/.test(n[0])).length, 1);
  await sh.handleRefresh(t.deps);
  assert.equal(t.notes.filter((n) => /עצרתי/.test(n[0])).length, 1);
});

// 3.11: who could not get in gets one "ready" mail, only once Supabase lets new people sign up.
function readySetup(open) {
  const t = setup({ mailToken: 'tok', apiInvites: [{ email: 'hagit@x.co' }, { email: 'itcohen2@gmail.com' }] });
  const inner = t.deps.fetch;
  t.deps.fetch = async (url, init) => {
    if (String(url).includes('/auth/v1/settings')) { t.calls.push({ url, init: init || {} }); return { ok: true, status: 200, json: async () => ({ disable_signup: !open }) }; }
    if (String(url).endsWith('/api/admin/login-wait')) { t.calls.push({ url, init }); return { ok: true, status: 200, json: async () => [{ email: 'wait@x.co' }] }; }
    return inner(url, init);
  };
  return t;
}
const readyMails = (t) => t.calls.filter((c) => String(c.url).startsWith('https://api.forwardemail.net') && JSON.parse(c.init.body).subject === sh.READY_LETTER.subject);

test('ready letters: nothing goes out while sign up is closed', async () => {
  const t = readySetup(false);
  await sh.handleRefresh(t.deps);
  assert.equal(readyMails(t).length, 0);
});

test('ready letters: once open, the waiting and the invited get one mail each, never Itzik, never twice', async () => {
  const t = readySetup(true);
  await sh.handleRefresh(t.deps);
  const to = readyMails(t).map((c) => JSON.parse(c.init.body).to).sort();
  assert.deepEqual(to, ['hagit@x.co', 'wait@x.co']);
  assert.ok(JSON.parse(readyMails(t)[0].init.body).html.includes('login?email='));
  await sh.handleRefresh(t.deps);
  assert.equal(readyMails(t).length, 2);
});
