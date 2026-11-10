'use strict';
// 10.11.2026: lib/setup-intake.js, a returned setup form is pulled into the customer's monitor.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SI = require('../lib/setup-intake.js');
const H = require('../lib/handle.js');

const TOK = 'aaaabbbbccccdddd1111';
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const DEF = { client: 'ד״ר בדיקה', steps: [
  { id: 'google', title: 'גוגל', oauth: { provider: 'google' } },
  { id: 'ms', title: 'מיקרוסופט', oauth: { provider: 'microsoft' } },
  { id: 'lab', title: 'דוח מעבדה חודשי', upload: { label: 'x' } },
  { id: 'labs', title: 'המעבדות', ask: { label: 'x' } },
  { id: 'labmail', title: 'מאיזה מייל', ask: { label: 'x' } },
  { id: 'pay', title: 'איך מחושב התשלום', choose: { q: 'x', options: ['א', 'ב'] } },
  { id: 'sheet', title: 'דף עבודה', upload: { label: 'x' } },
] };

function world(over) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-'));
  const data = path.join(root, 'data'), tdir = path.join(root, 'tenant');
  fs.mkdirSync(path.join(tdir, 'data'), { recursive: true });
  const fd = path.join(data, 'setup', TOK + '-files');
  fs.mkdirSync(path.join(fd, 'lab'), { recursive: true }); fs.mkdirSync(path.join(fd, 'sheet'), { recursive: true });
  fs.writeFileSync(path.join(fd, 'lab', '1-a.pdf'), 'lab one');
  fs.writeFileSync(path.join(fd, 'sheet', '2-b.jpg'), 'img');
  wj(path.join(data, 'setup', TOK + '.def.json'), DEF);
  wj(path.join(data, 'setup', TOK + '.json'), Object.assign({ finishedAt: '2026-11-10T15:00:00.000Z', steps: {
    google: { got: 'x', who: 'a@b' }, ms: { got: 'x', who: 'c@d' },
    lab: { files: [{ name: 'a.pdf', file: '1-a.pdf' }] }, sheet: { files: [{ name: 'b.jpg', file: '2-b.jpg' }] },
    labs: { text: 'ניו דנט\nקריאטיב' }, pay: { choice: 'א' },
  } }, over || {}));
  wj(path.join(data, 'setup', TOK + '.secrets.json'), {
    google: { value: JSON.stringify({ provider: 'google', refresh_token: 'r', scope: 'x gmail.readonly gmail.compose' }) },
    ms: { value: JSON.stringify({ provider: 'microsoft', refresh_token: 'r', scope: 'openid User.Read Calendars.ReadWrite' }) },
  });
  wj(path.join(data, 'tenants', 'tenants', 'dr.json'), { id: 'dr', dir: tdir, user: 'dr' });
  wj(path.join(data, 'setup-intake', 'map.json'), { [TOK]: 'dr' });
  fs.writeFileSync(path.join(tdir, 'data', 'profile.md'), '# ד״ר\n\n- שורה');
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd].concat(args || []));
    if (cmd === 'pdftotext') return '';
    if (/tenant-config$/.test(cmd)) fs.copyFileSync(args[2], path.join(tdir, 'data', 'profile.md'));
    return '';
  };
  return { root, data, tdir, calls, run: (extra) => SI.sweep(Object.assign({ data, exec, noOwn: true, direct: true, log: () => {}, repo: root }, extra || {})) };
}

test('mergeProfile: appended once, then replaced in place, and removed when empty', () => {
  const a = SI.mergeProfile('# x\n- y', SI.START + '\nא\n' + SI.END);
  assert.ok(a.includes('# x') && a.includes('\nא\n'));
  const b = SI.mergeProfile(a, SI.START + '\nב\n' + SI.END);
  assert.strictEqual(b.split(SI.START).length, 2);
  assert.ok(b.includes('\nב\n') && !b.includes('\nא\n') && b.includes('- y'));
  assert.strictEqual(SI.mergeProfile(b, '').includes(SI.START), false);
});

test('answerLines: text and choices only, no secrets, no dashes, multi line on one line', () => {
  const l = SI.answerLines(DEF, { steps: { labs: { text: 'א\nב' }, pay: { choice: 'ג-ד' }, google: { got: 'x' } } });
  assert.deepStrictEqual(l, ['- המעבדות: א; ב', '- איך מחושב התשלום: ג-ד']);
});

test('missingOf: empty text and empty uploads, and the key follows the set', () => {
  const m = SI.missingOf(DEF, { steps: { labs: { text: 'x' }, lab: { files: [{}] } } });
  assert.deepStrictEqual(m.map((x) => x.id), ['labmail', 'sheet']);
  assert.notStrictEqual(SI.missingKey('t', m), SI.missingKey('t', m.slice(1)));
  assert.strictEqual(SI.missingKey('t', m), SI.missingKey('t', m.slice().reverse()));
});

test('a finished form is pulled in once: source, files, profile, one missing item, one chat line', () => {
  const w = world();
  w.run();
  const src = rj(path.join(w.data, 'cal', 'sources.json'));
  assert.strictEqual(src.length, 1);
  assert.deepStrictEqual([src[0].name, src[0].step, src[0].mail, src[0].tenant, src[0].msStep], ['dr', 'google', true, true, 'ms']);
  assert.ok(fs.existsSync(path.join(w.tdir, 'data', 'files-private', 'setup', 'lab', '1-a.pdf')));
  assert.ok(fs.existsSync(path.join(w.tdir, 'data', 'files-private', 'setup', 'sheet', '2-b.jpg')));
  const prof = fs.readFileSync(path.join(w.tdir, 'data', 'profile.md'), 'utf8');
  assert.ok(prof.includes('ניו דנט; קריאטיב') && prof.includes('- שורה'));
  const open = H.open(w.data);
  assert.strictEqual(open.length, 1);
  assert.strictEqual(open[0].kind, 'setup-missing');
  assert.ok(/חסרות תשובות בטופס: מאיזה מייל/.test(open[0].title) && open[0].link === 'tenants');
  const chat = fs.readdirSync(path.join(w.data, 'chat', 'chat'));
  assert.strictEqual(chat.length, 1);
  assert.ok(!/[-‐–—]/.test(rj(path.join(w.data, 'chat', 'chat', chat[0])).text.replace(/\d{4}-\d{2}/g, '')));
  assert.ok(w.calls.some((c) => c.includes('lab-check.js')), 'the lab note was checked');
  assert.ok(w.calls.some((c) => c.includes('build.js')) || w.calls.some((c) => /tenant-config/.test(c[0])), 'the page was rebuilt');
});

test('a second round changes nothing: no copy, no lab run, no item, no chat line, no rebuild', () => {
  const w = world();
  w.run();
  const before = w.calls.length;
  w.run();
  assert.strictEqual(w.calls.length, before);
  assert.strictEqual(H.all(w.data).length, 1);
  assert.strictEqual(fs.readdirSync(path.join(w.data, 'chat', 'chat')).length, 1);
  assert.strictEqual(rj(path.join(w.data, 'cal', 'sources.json')).length, 1);
});

test('a lab note already stored in the tenant files is not run again', () => {
  const w = world();
  fs.mkdirSync(path.join(w.tdir, 'data', 'files-private', 'lab'), { recursive: true });
  fs.writeFileSync(path.join(w.tdir, 'data', 'files-private', 'lab', 'old.pdf'), 'lab one');
  w.run();
  assert.ok(!w.calls.some((c) => c.includes('lab-check.js')));
});

test('answering what was missing closes the item; a changed set opens a new one and closes the old', () => {
  const w = world();
  w.run();
  const sf = path.join(w.data, 'setup', TOK + '.json');
  const s = rj(sf); s.steps.labmail = { text: 'office@x' }; wj(sf, s);
  w.run();
  assert.strictEqual(H.open(w.data).length, 0);
  assert.strictEqual(H.all(w.data).length, 1);
  assert.strictEqual(H.all(w.data)[0].done, true);
});

test('a form finished before the cut off date, or not finished, is not pulled (connections only)', () => {
  const w = world({ finishedAt: '2026-11-01T10:00:00.000Z' });
  w.run();
  assert.ok(!fs.existsSync(path.join(w.tdir, 'data', 'files-private', 'setup')));
  assert.strictEqual(H.all(w.data).length, 0);
  assert.strictEqual(rj(path.join(w.data, 'cal', 'sources.json')).length, 1);
});

test('a token with no tenant is reported, not guessed; "-" marks a form that is no customer', () => {
  const w = world();
  wj(path.join(w.data, 'setup-intake', 'map.json'), {});
  let s = w.run();
  assert.strictEqual(s.tokens[TOK].unmapped, true);
  assert.ok(!fs.existsSync(path.join(w.data, 'cal', 'sources.json')));
  wj(path.join(w.data, 'setup-intake', 'map.json'), { [TOK]: '-' });
  s = w.run();
  assert.strictEqual(s.tokens[TOK], undefined);
});

test('dry run writes nothing', () => {
  const w = world();
  w.run({ dry: true });
  assert.ok(!fs.existsSync(path.join(w.data, 'cal', 'sources.json')));
  assert.ok(!fs.existsSync(path.join(w.tdir, 'data', 'files-private')));
  assert.strictEqual(H.all(w.data).length, 0);
  assert.strictEqual(w.calls.filter((c) => c[0] !== 'pdftotext').length, 0);
});

test('msScopes tells calendar from mail; managerLines has no dashes and shows what is missing', () => {
  const w = world();
  const s = w.run();
  assert.deepStrictEqual([s.tokens[TOK].ms.cal, s.tokens[TOK].ms.mail], [true, false]);
  const lines = SI.managerLines(s, Date.now());
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0].st, 'warn');
  assert.ok(/מאיזה מייל/.test(lines[0].sub));
  assert.ok(!/[-‐–—]/.test(lines[0].t + lines[0].sub));
  assert.deepStrictEqual(SI.managerLines(null, Date.now()), []);
});
