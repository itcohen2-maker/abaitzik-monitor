/*
  Codex's two reproductions, run against the page that was actually built.

  Both bugs were of the same kind: the screen told him something it could not
  know. A request marked done because a different request was done, and a
  connection test that went green on a deploy. Both survived a full test suite,
  because both suites asserted the broken behaviour as the specification.

  The first version of this file printed "fixed" or "STILL BROKEN" and exited
  zero either way, which is the same fault one level up: a check that cannot
  fail is not a check. Codex proved it by mutating reqStatus to return done and
  watching this file print STILL BROKEN and pass. Every verdict below is an
  assertion now, and the file exits non-zero when one of them is wrong.
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', 'docs', 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const main = blocks.map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
assert.ok(main && main.length > 1000, 'could not find the page script');

function slice(from, to) {
  const a = main.indexOf(from);
  const b = main.indexOf(to);
  assert.ok(a > -1, `missing ${from}`);
  assert.ok(b > a, `missing ${to}`);
  return main.slice(a, b);
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('P0-1 an unrelated later request cannot mark an earlier one done', () => {
  const ctx = { D: { chat: [] } };
  vm.createContext(ctx);
  vm.runInContext(slice('function recordFor(r){', 'function renderReqs(){'), ctx);
  const A = { id: 'rA', at: '2026-09-12T10:00:00+03:00', kind: 'text', text: 'בקשה א' };

  // Exactly Codex's fixture: request A at 10:00, an unrelated request B at
  // 11:00 marked done, and nothing at all answered about A.
  ctx.D.chat = [{
    id: 'm1', at: '2026-09-12T11:00:00+03:00', from: 'itzik',
    status: 'done', requestId: 'rB', text: 'בקשה אחרת',
  }];
  const borrowed = vm.runInContext(`reqStatus(${JSON.stringify(A)})`, ctx);
  assert.strictEqual(borrowed.k, 'sent',
    `request A reported "${borrowed.k}" from an unrelated request B`);
  assert.strictEqual(borrowed.t, 'יצא מהמכשיר');
  assert.strictEqual(borrowed.reply, null, 'and it must not borrow a reply either');

  // A record that really is about A still does its job, or the fix would just
  // be a screen that never says anything.
  ctx.D.chat.push({
    id: 'm2', at: '2026-09-12T12:00:00+03:00', from: 'itzik',
    status: 'done', requestId: 'rA', text: 'זו א',
  });
  const matched = vm.runInContext(`reqStatus(${JSON.stringify(A)})`, ctx);
  assert.strictEqual(matched.k, 'done', 'a record carrying rA must still mark A done');

  // And a request with no id of its own cannot be matched by anything.
  const old = { at: '2026-09-12T10:00:00+03:00', kind: 'text', text: 'בקשה ישנה' };
  assert.strictEqual(vm.runInContext(`reqStatus(${JSON.stringify(old)})`, ctx).k, 'sent');
});

check('P0-2 a new build is not a round trip', () => {
  const source = slice('function pingPaint(){', 'function pingBind(){');
  // Nothing in the painter may consult the build at all: that is the bug.
  assert.ok(!/builtAt/.test(source), 'pingPaint still looks at the build');

  const run = (chat) => {
    let said = '';
    const classes = [];
    const ctx = {
      D: { builtAt: '2026-09-12T11:00:00+03:00', chat },
      pingState: () => ({ at: '2026-09-12T10:00:00+03:00', code: 'PING-ABC123' }),
      pingSay: (t) => { said = t; },
      since: () => 'לפני שעה',
      ago: () => 'שעה',
      document: {
        getElementById: () => ({
          classList: { add: (c) => classes.push(`+${c}`), remove: (c) => classes.push(`-${c}`) },
        }),
      },
    };
    vm.createContext(ctx);
    vm.runInContext(`${source}\npingPaint();`, ctx);
    return { said, classes };
  };

  // Codex's fixture: tap at 10:00, an unrelated publish at 11:00, zero replies.
  const deployOnly = run([]);
  assert.ok(!/החיבור עובד/.test(deployOnly.said),
    `a deploy alone reported a working connection: ${deployOnly.said}`);
  assert.ok(deployOnly.classes.includes('-ok'), 'and it must not be green');
  assert.ok(/גרסה חדשה של האתר אינה תשובה/.test(deployOnly.said),
    'the waiting line must say a new build will not change it');

  // A reply that does not carry the code is still not an answer.
  const wrongCode = run([{ id: 'x', at: '2026-09-12T10:05:00+03:00', from: 'claude', text: 'שלום' }]);
  assert.ok(!/החיבור עובד/.test(wrongCode.said), 'any reply must not count, only the coded one');

  // The real echo does turn it green, or the test could never pass at all.
  const echoed = run([{ id: 'x', at: '2026-09-12T10:05:00+03:00', from: 'claude', text: 'חזרתי. PING-ABC123' }]);
  assert.ok(/החיבור עובד/.test(echoed.said), `a real echo failed to pass: ${echoed.said}`);
  assert.ok(echoed.classes.includes('+ok'), 'and it must be green');
});

let failed = 0;
for (const { name, fn } of checks) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (error) { failed += 1; console.log(`  FAIL ${name}\n       ${error.message}`); }
}
console.log(`${checks.length - failed}/${checks.length} truth checks passed`);
if (failed) process.exitCode = 1;
