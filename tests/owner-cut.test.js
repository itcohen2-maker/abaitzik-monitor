'use strict';
/*
  A customer's page carries nothing of Itzik's.

  25.9: Ilay opened a monitor full of his father's Pegasus, candles, networks
  and Drive folders, because the first version hid Itzik's tiles by id and the
  round icons had none. These pin the cut that replaced it, on build.js's own
  cutFor, against the markers the page template actually carries.
*/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
// cutFor and its tile catalog, lifted out of build.js as they are written.
const start = src.indexOf('const TENANT_TILES = {');
const end = src.indexOf('const PAGE = `');
const mod = new Function(src.slice(start, end) + '; return { cutFor, tenantTiles };')();

const PAGE = '<section id="pH"><!--ITZIK:BEGIN--><div id="blkIcons"><a href="https://pegasusgame.vercel.app">פגסוס</a></div>'
  + '<div class="grid" id="blkTiles"><button id="gMail"></button><button id="gTasks"></button></div><!--ITZIK:END-->'
  + '<!--TENANT:BEGIN--><div class="grid" id="blkTiles"><button id="gTasks"></button></div><!--TENANT:END--></section>'
  + '<!--ITZIK:BEGIN--><section id="pD"><a href="https://drive.google.com/drive/u/0/folders/SECRET">דרייב</a></section><!--ITZIK:END-->';

test("Itzik's copy keeps his blocks and drops the customer's", () => {
  const out = mod.cutFor({ name: 'abaitzik' }, PAGE);
  assert.ok(out.includes('pegasusgame') && out.includes('SECRET') && out.includes('id="gMail"'));
  assert.equal(out.split('id="blkTiles"').length - 1, 1);
  assert.ok(!/ITZIK:|TENANT:/.test(out));
});

test("a customer's copy has none of Itzik's links, folders or tiles", () => {
  const out = mod.cutFor({ name: 'ily' }, PAGE);
  assert.ok(!out.includes('pegasusgame'));
  assert.ok(!out.includes('SECRET'));
  assert.ok(!out.includes('פגסוס') && !out.includes('דרייב'));
  assert.equal(out.split('id="blkTiles"').length - 1, 1);
  assert.ok(!/ITZIK:|TENANT:/.test(out));
});

test('a cut block leaves hidden stand ins so the script finds its ids, but never twice', () => {
  const out = mod.cutFor({ name: 'ily' }, PAGE);
  // gMail and pD were cut: stand ins exist, hidden, so getElementById is not null.
  assert.ok(/<i id="gMail" hidden><\/i>/.test(out));
  assert.ok(/<i id="pD" hidden><\/i>/.test(out));
  assert.ok(out.includes('display:none!important'));
  // gTasks is the customer's own tile: no stand in may shadow it.
  assert.equal(out.split('id="gTasks"').length - 1, 1);
});

test('the markers are really in the page template, around the blocks that matter', () => {
  // Counted inside the template only: cutFor's own regexes spell them too.
  const page = src.slice(src.indexOf('const PAGE = `'));
  assert.ok(page.split('<!--ITZIK:BEGIN-->').length - 1 >= 20);
  assert.equal(page.split('<!--ITZIK:BEGIN-->').length, page.split('<!--ITZIK:END-->').length);
  assert.equal(page.split('<!--TENANT:BEGIN-->').length - 1, 1);
  // The cut runs before slim(), which strips comments and the markers with them.
  assert.ok(src.includes('slim(cutFor(inst, renderPage(payload)))'));
});

test('the customer tiles come from his screens list, in his order', () => {
  const html = mod.tenantTiles({ screens: ['gPlan', 'gTasks', 'nope'] });
  assert.ok(html.indexOf('id="gPlan"') < html.indexOf('id="gTasks"'));
  assert.ok(!html.includes('nope'));
});

/*
  25.9 evening: the markup was clean, and the script still carried Pegasus,
  the candle site's visits, the building committee, the pills, Salinda and
  his landing pages. The whole page is built here the way the server builds a
  customer's, and nothing of Itzik's may be anywhere in its source.
*/
test("a customer's built page, script included, has no word of Itzik's", () => {
  const os = require('os');
  const { execFileSync } = require('child_process');
  const root = path.join(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-cut-'));
  for (const f of ['build.js', 'gate.js']) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.cpSync(path.join(root, 'lib'), path.join(dir, 'lib'), { recursive: true });
  if (fs.existsSync(path.join(root, 'public'))) fs.cpSync(path.join(root, 'public'), path.join(dir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'gate-key.txt'), '482913');
  fs.writeFileSync(path.join(dir, 'instance.json'), JSON.stringify({
    name: 'ily', owner: 'איליי', pageTitle: 'המוניטור של איליי', appTitle: 'המוניטור',
    publicUrl: 'https://ilay.example/', basePath: '/', origin: 'https://ilay.example',
    screens: ['gCIdeas', 'gPlan', 'gRemind', 'gTasks', 'gNotes'], chromeProfile: 'none', memoryDir: null,
  }));
  execFileSync(process.execPath, ['build.js'], { cwd: dir, env: { ...process.env, ABAITZIK_INSTANCE_FILE: '' }, stdio: 'pipe' });
  const out = fs.readFileSync(path.join(dir, 'docs', 'index.html'), 'utf8');
  const words = ['פגסוס', 'pegasusgame', 'candletimes', 'סלינדה', 'salinda', 'ועד הבית', 'ריווחית',
    'כדור', 'ניתוח', 'abaitzik.com', 'instagram.com/abaitzik', 'gezer', 'גזר', 'drive.google', 'לולוס',
    'איציק, ', 'נרות'];
  const found = words.filter((w) => out.includes(w));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(found, []);
});
