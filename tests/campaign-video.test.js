'use strict';
// 19.11.2026: the campaign video is an ad (texts from the customer's answers), and it is checked frame by frame
// against every question and answer before it is delivered. tools/campaign-join.js and tools/campaign-frames.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const J = require('../tools/campaign-join.js');
const F = require('../tools/campaign-frames.js');

test('clean removes dashes and emoji, keeps Hebrew, digits and ₪', () => {
  assert.strictEqual(J.clean('קנקן — שקוף 🍷 ב-99 ₪'), 'קנקן שקוף ב 99 ₪');
  assert.strictEqual(J.clean('עיצוב־ייחודי ✨\n'), 'עיצוב ייחודי');
  assert.strictEqual(J.clean(null), '');
});

test('rtl wraps Hebrew lines in an explicit right to left embedding, leaves Latin alone', () => {
  assert.strictEqual(J.rtl('מפוספסת!'), '‫מפוספסת!‬');
  assert.strictEqual(J.rtl('IT Solution'), 'IT Solution');
});

test('wrap and fit keep lines short and at most the allowed count', () => {
  assert.deepStrictEqual(J.wrap('אחת שתיים שלוש', 9), ['אחת שתיים', 'שלוש']);
  const f = J.fit('מילה '.repeat(40), 74, 3, 50);
  assert.ok(f.lines.length <= 3 && f.fs >= 50);
  const short = J.fit('קנקן שקוף', 88, 3, 56);
  assert.deepStrictEqual(short, { fs: 88, lines: ['קנקן שקוף'] });
  assert.deepStrictEqual(J.balanced('קנקן שקוף וכוס מפוספסת', 18), ['קנקן שקוף', 'וכוס מפוספסת'], 'no word left alone');
  const one = J.fit('קנקן שקוף וכוס מפוספסת', 88, 3, 56);
  assert.strictEqual(one.lines.length, 1, 'one line when it fits at a slightly smaller size');
  assert.ok(one.fs < 88 && one.fs >= 75);
});

test('the photo sits between the text bands, never under them', () => {
  const top = J.blockTop('קנקן שקוף וכוס מפוספסת'), bottom = J.blockBottom('קנקן שקוף בעיצוב ייחודי');
  const b = J.photoBox(top, bottom);
  assert.ok(b.y >= top.band.y + top.band.h);
  assert.ok(b.y + b.h <= bottom.band.y);
  assert.deepStrictEqual(J.photoBox(null, null), { y: 120, h: 1680 });
});

test('parseArgs: old calls still work, texts come from flags or a file', () => {
  const o = J.parseArgs(['out.mp4', '--audio', 's.mp3', '--vol', '0.3', 'a.mov', 'b.jpg']);
  assert.deepStrictEqual([o.audio, o.vol, o.photo, o.ins, o.hasEnd], ['s.mp3', 0.3, 3, ['a.mov', 'b.jpg'], false]);
  const t = J.parseArgs(['o.mp4', '--title', 'קנקן — שקוף', '--captions', '["עיצוב ייחודי",""]', '--end', 'לפרטים: וואטסאפ', 'a.jpg', 'b.jpg']);
  assert.deepStrictEqual([t.title, t.captions, t.end, t.photo, t.hasEnd], ['קנקן שקוף', ['עיצוב ייחודי', ''], 'לפרטים: וואטסאפ', 4, true]);
  assert.strictEqual(J.parseArgs(['o.mp4', '--photo', '5', '--title', 'x', 'a.jpg']).photo, 5);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-'));
  fs.writeFileSync(path.join(d, 't.json'), JSON.stringify({ title: 'כוס ״מפוספסת״', captions: ['א'], brand: 'חנות' }));
  const f = J.parseArgs(['o.mp4', '--texts', path.join(d, 't.json'), 'a.jpg']);
  assert.deepStrictEqual([f.title, f.captions, f.brand, f.hasEnd], ['כוס ״מפוספסת״', ['א'], 'חנות', true]);
  assert.throws(() => J.parseArgs(['o.mp4', '--captions', 'not json', 'a.jpg']), /JSON array/);
  assert.throws(() => J.parseArgs(['o.mp4', '--bogus', 'a.jpg']), /unknown option/);
  assert.throws(() => J.parseArgs(['o.mov', 'a.jpg']), /usage/);
  assert.throws(() => J.parseArgs(['o.mp4']), /no input/);
});

test('every text block stays inside the Reels safe zone, even long ones', () => {
  const long = 'טקסט ארוך מאוד שחוזר על עצמו '.repeat(6);
  for (const b of [J.blockTop(long), J.blockBottom(long), J.blockEnd({ offer: long, end: long, brand: long }), J.blockEnd({ end: 'לפרטים ולהזמנה: הודעה בוואטסאפ' })]) {
    assert.ok(b.band.y >= J.SAFE_TOP, 'band top ' + b.band.y);
    assert.ok(b.band.y + b.band.h <= J.SAFE_BOTTOM, 'band bottom ' + (b.band.y + b.band.h));
    b.lines.forEach((l) => assert.ok(l.y >= J.SAFE_TOP && l.y + l.fs * 1.3 <= J.SAFE_BOTTOM));
  }
});

const MSG = 'קמפיין: לפי התיאור | קנקן שקוף וכוס מפוספסת, רוצה למכור אותם\nמה העסק שלך עושה בדיוק? חנות מוצרים לבית ולמטבח\n'
  + 'איך לקוחות יכולים לפנות אליך? וואטסאפ\nמה המסר המרכזי? קנייה נוחה מהבית | סדר הקבצים: 1. a.jpg, 2. b.jpg | לחבר הכול לסרטון אחד\n(קובץ: a.jpg)';

test('parseMessage reads the description, every question and answer, the order and notes', () => {
  const m = F.parseMessage(MSG);
  assert.strictEqual(m.kind, 'לפי התיאור');
  assert.strictEqual(m.description, 'קנקן שקוף וכוס מפוספסת, רוצה למכור אותם');
  assert.deepStrictEqual(m.qa.map((x) => x.a), ['חנות מוצרים לבית ולמטבח', 'וואטסאפ', 'קנייה נוחה מהבית']);
  assert.strictEqual(m.qa[1].q, 'איך לקוחות יכולים לפנות אליך?');
  assert.strictEqual(m.order, '1. a.jpg, 2. b.jpg');
  assert.deepStrictEqual(m.notes, ['לחבר הכול לסרטון אחד']);
});

test('the checklist starts all pending and --verify passes only when everything is pass', () => {
  const clips = { clips: [{ n: 1, kind: 'photo', file: 'a.jpg', start: 0, end: 4, title: 'כותרת', caption: 'כיתוב' }], end: { start: 4, end: 7, offer: '', cta: 'וואטסאפ', brand: '' } };
  const c = F.skeleton('v.mp4', F.parseMessage(MSG), clips, '/tmp/x');
  assert.strictEqual(c.items.length, 6);
  assert.deepStrictEqual(c.frames.map((f) => f.clip), [1, 'end']);
  assert.ok(c.frames[0].at > 1.15 && c.frames[0].at < 4, 'after the caption fades in');
  assert.ok(F.verify(c).length > 0);
  c.items.forEach((x) => { x.status = 'pass'; x.show = 'כן'; });
  c.frames.forEach((f) => { f.status = 'pass'; });
  assert.ok(F.verify(c).some((b) => /overall/.test(b)));
  c.status = 'pass';
  assert.deepStrictEqual(F.verify(c), []);
  c.items[0].show = ''; c.items[0].why = '';
  assert.ok(F.verify(c).some((b) => /neither show nor why/.test(b)));
});

test('the font ships with the repo, and lib/campaign.js makes the texts and the check mandatory', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'fonts', 'Heebo-Bold.ttf')));
  const lines = require('../lib/campaign.js').promptLines().join('\n');
  assert.ok(/--texts/.test(lines) && /campaign-frames\.js/.test(lines) && /--verify/.test(lines));
  assert.ok(/לא ממציאים/.test(lines));
});

test('a real render: one photo with texts gives a 1080x1920 video, clips.json, frames and a checklist', { timeout: 240000 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-'));
  const img = path.join(d, 'p.png');
  assert.strictEqual(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3366aa:s=120x160:d=1', '-frames:v', '1', img]).status, 0);
  const out = path.join(d, 'campaign-t.mp4');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'campaign-join.js'), out, '--photo', '1', '--title', 'כותרת!', '--caption', 'כיתוב', '--end', 'לפרטים: וואטסאפ', img], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', out], { encoding: 'utf8' });
  const j = JSON.parse(p.stdout);
  assert.strictEqual(j.streams.find((s) => s.width).width, 1080);
  assert.strictEqual(j.streams.find((s) => s.height).height, 1920);
  assert.ok(Math.abs(Number(j.format.duration) - 4) < 0.3, 'one second photo plus a 3 second end card');
  const clips = JSON.parse(fs.readFileSync(out.replace('.mp4', '.clips.json'), 'utf8'));
  assert.strictEqual(clips.clips[0].caption, 'כיתוב');
  assert.strictEqual(clips.end.cta, 'לפרטים: וואטסאפ');
  fs.writeFileSync(path.join(d, 'm.txt'), MSG);
  const fr = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'campaign-frames.js'), out, '--msg', path.join(d, 'm.txt')], { encoding: 'utf8' });
  assert.strictEqual(fr.status, 0, fr.stderr);
  const check = JSON.parse(fs.readFileSync(out.replace('.mp4', '.check.json'), 'utf8'));
  check.frames.forEach((f) => assert.ok(fs.statSync(f.png).size > 1000));
  const v = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'campaign-frames.js'), '--verify', out.replace('.mp4', '.check.json')], { encoding: 'utf8' });
  assert.strictEqual(v.status, 1, 'a fresh checklist is not ready');
});
