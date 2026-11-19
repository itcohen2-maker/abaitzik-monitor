'use strict';
/*
  10.11.2026, Itzik: "לחבר סרטונים" in the campaign sheet. Joins videos and photos, in the order given, into one
  vertical clip (1080x1920), and optionally mixes one sound softly under it. Local ffmpeg only, nothing leaves the machine.

  19.11.2026, Itzik: "סרטון עלוב, 3 תמונות בלי שום כתובית, ושום דבר מהשאלות לא מומש". So a campaign video is now an ad:
  each photo sits on a blurred fill of itself (no black bars) with a slow zoom, a headline on the first clip, one caption
  per clip, and an end card with the offer, the call to action and the business name. All texts come from the customer's
  own answers (lib/campaign.js says how); the tool only lays them out. Heebo Bold (fonts/), Hebrew through fribidi.

    node tools/campaign-join.js <out.mp4> [--audio <file>] [--vol 0.25] [--photo 4]
         [--title "<headline>"] [--captions '<json array, one per clip, "" for none>'] [--caption "<text>"]...
         [--offer "<price or offer>"] [--end "<call to action>"] [--brand "<business name>"] [--texts <file.json>]
         <in1> <in2> ...

  --texts reads {"title","captions":[],"offer","end","brand"} from a file (safer than shell quoting with ׳ or ").
  A photo becomes a clip of --photo seconds (default 3, or 4 when there is any text). A video keeps its own sound, or
  gets silence if it has none. The end card (3 seconds) is added only when --offer, --end or --brand is given.
  Texts: dashes and emoji are removed, long lines are wrapped and shrunk, and nothing is drawn in the top 250px or the
  bottom 350px (Reels UI). Beside the video it writes <out>.clips.json (what is where, for tools/campaign-frames.js).
  Prints the output path.
*/
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IMG = /\.(jpe?g|png|webp|heic|gif|bmp)$/i;
const W = 1080, H = 1920, SAFE_TOP = 250, SAFE_BOTTOM = H - 350, END_DUR = 3, FPS = 30;
const FONT = path.join(__dirname, '..', 'fonts', 'Heebo-Bold.ttf');
const USAGE = 'usage: node tools/campaign-join.js <out.mp4> [--audio f] [--vol 0.25] [--photo 3] [--title t] [--captions json] [--offer t] [--end t] [--brand t] [--texts f.json] in1 in2 ...';

// No dashes (Itzik's writing rule) and no emoji (Heebo has none; they render as boxes).
function clean(s) {
  return String(s == null ? '' : s)
    .replace(/[‍︎️⃣]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[‐-―−־-]+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// drawtext runs fribidi with a left to right paragraph, so "מפוספסת!" came out with the ! on the right and "2 ב 99 ₪"
// with the 2 on the left (checked on frames 19.11.2026). An explicit right to left embedding (RLE ... PDF) fixes both.
function rtl(s) { return /[֐-׿]/.test(s) ? '‫' + s + '‬' : s; }

// Word wrap to at most maxChars a line (a single longer word keeps its own line).
function wrap(s, maxChars) {
  const words = clean(s).split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Fit a text into at most maxLines lines. Heebo Bold Hebrew measured about 0.48 of the font size per character
// (frames, 19.11.2026); 0.5 and 940 of the 1080px keep a margin. One line if it fits at down to 85% of fs; otherwise
// balanced lines (no single word left alone on the last line), shrinking towards minFs only when needed.
const perLine = (size) => Math.max(6, Math.floor(940 / (size * 0.5)));
function balanced(s, max) {
  const lines = wrap(s, max);
  if (lines.length < 2) return lines;
  const len = clean(s).length;
  for (let t = Math.ceil(len / lines.length); t < max; t++) {
    const b = wrap(s, t);
    if (b.length === lines.length) return b;
  }
  return lines;
}
function fit(s, fs, maxLines, minFs) {
  const len = clean(s).length;
  for (let size = fs; size >= Math.round(fs * 0.85); size -= 2) {
    if (len <= perLine(size)) return { fs: size, lines: [clean(s)].filter(Boolean) };
  }
  for (let size = fs; size >= minFs; size = Math.round(size * 0.9)) {
    const lines = balanced(s, perLine(size));
    if (lines.length <= maxLines) return { fs: size, lines };
  }
  return { fs: minFs, lines: balanced(s, perLine(minFs)).slice(0, maxLines) };
}

function parseArgs(argv) {
  const args = argv.slice();
  const o = { out: args.shift(), audio: '', vol: 0.25, photo: 0, title: '', captions: [], offer: '', end: '', brand: '', ins: [] };
  if (!o.out || !/\.mp4$/i.test(o.out)) throw new Error(USAGE);
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (k === '--audio') o.audio = args[++i];
    else if (k === '--vol') o.vol = Math.max(0.05, Math.min(1, Number(args[++i]) || 0.25));
    else if (k === '--photo') o.photo = Math.max(1, Math.min(10, Number(args[++i]) || 3));
    else if (k === '--title') o.title = clean(args[++i]);
    else if (k === '--caption') o.captions.push(clean(args[++i]));
    else if (k === '--captions') {
      let v;
      try { v = JSON.parse(args[++i]); } catch (e) { throw new Error('--captions must be a JSON array of strings'); }
      if (!Array.isArray(v)) throw new Error('--captions must be a JSON array of strings');
      o.captions = v.map(clean);
    }
    else if (k === '--offer') o.offer = clean(args[++i]);
    else if (k === '--end') o.end = clean(args[++i]);
    else if (k === '--brand') o.brand = clean(args[++i]);
    else if (k === '--texts') {
      const f = args[++i];
      let j;
      try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error('--texts: cannot read JSON from ' + f); }
      if (j.title != null) o.title = clean(j.title);
      if (Array.isArray(j.captions)) o.captions = j.captions.map(clean);
      if (j.offer != null) o.offer = clean(j.offer);
      if (j.end != null) o.end = clean(j.end);
      if (j.brand != null) o.brand = clean(j.brand);
    }
    else if (/^--/.test(k)) throw new Error('unknown option ' + k);
    else o.ins.push(k);
  }
  if (!o.ins.length) throw new Error('no input files');
  const anyText = !!(o.title || o.captions.some(Boolean) || o.offer || o.end || o.brand);
  if (!o.photo) o.photo = anyText ? 4 : 3;
  o.hasEnd = !!(o.offer || o.end || o.brand);
  return o;
}

// Where each text block goes. Title: a band from the top of the safe zone. Caption: a band ending at the bottom
// of the safe zone. End card: offer, call to action and name, centred. Every y is inside 250..1570.
const PAD = 30;
function blockTop(text) {
  const f = fit(text, 88, 3, 56), lh = Math.round(f.fs * 1.32);
  const y0 = SAFE_TOP + 10;
  return { band: { y: y0, h: PAD * 2 + f.lines.length * lh }, lines: f.lines.map((t, k) => ({ t, fs: f.fs, y: y0 + PAD + k * lh, color: 'white' })) };
}
function blockBottom(text) {
  const f = fit(text, 74, 3, 50), lh = Math.round(f.fs * 1.32);
  const h = PAD * 2 + f.lines.length * lh, y0 = SAFE_BOTTOM - 10 - h;
  return { band: { y: y0, h }, lines: f.lines.map((t, k) => ({ t, fs: f.fs, y: y0 + PAD + k * lh, color: 'white' })) };
}
function blockEnd(o) {
  const parts = [];
  if (o.offer) parts.push({ f: fit(o.offer, 90, 3, 56), color: '0xFFD54A' });
  if (o.end) parts.push({ f: fit(o.end, 74, 3, 50), color: 'white' });
  if (o.brand) parts.push({ f: fit(o.brand, 60, 2, 44), color: '0xE6E6E6' });
  const GAP = 44;
  let total = 0;
  parts.forEach((p, i) => { p.lh = Math.round(p.f.fs * 1.32); total += p.f.lines.length * p.lh + (i ? GAP : 0); });
  let y = Math.round(H / 2 - total / 2) - 40;
  const lines = [];
  parts.forEach((p, i) => {
    if (i) y += GAP;
    p.f.lines.forEach((t) => { lines.push({ t, fs: p.f.fs, y, color: p.color }); y += p.lh; });
  });
  const y0 = lines.length ? lines[0].y - 70 : H / 2;
  return { band: { y: y0, h: (y - y0) + 70 }, lines };
}

// The area for the photo or video: below the title band (or from y 120) and above the caption band (or to 1800).
function photoBox(top, bottom) {
  const y = top ? top.band.y + top.band.h + 24 : 120;
  const yEnd = bottom ? bottom.band.y - 24 : 1800;
  return { y, h: Math.max(400, yEnd - y) };
}

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', f], { encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout); return { audio: (j.streams || []).some((s) => s.codec_type === 'audio'), dur: Number((j.format || {}).duration) || 0 }; }
  catch (e) { return { audio: false, dur: 0 }; }
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  const die = (m) => { console.error(m); process.exit(1); };
  o.ins.forEach((f) => { if (!fs.existsSync(f)) die('missing: ' + f); });
  if (o.audio && !fs.existsSync(o.audio)) die('missing audio: ' + o.audio);
  if (!fs.existsSync(FONT)) die('missing font: ' + FONT);

  // Text files and the font go into a temp folder, so no path in the filter needs escaping.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cjoin-'));
  const font = path.join(tmp, 'f.ttf');
  fs.copyFileSync(FONT, font);
  let nText = 0;
  const textFilters = (block, delay) => {
    if (!block || !block.lines.length) return [];
    const out = ['drawbox=x=0:y=' + block.band.y + ':w=iw:h=' + block.band.h + ':color=black@0.55:t=fill'];
    block.lines.forEach((l) => {
      const tf = path.join(tmp, 't' + (nText++) + '.txt');
      fs.writeFileSync(tf, rtl(l.t));
      out.push('drawtext=fontfile=' + font + ':textfile=' + tf + ':expansion=none:text_shaping=1:fontsize=' + l.fs
        + ':fontcolor=' + l.color + ':x=(w-text_w)/2:y=' + l.y + ':y_align=font'
        + ":alpha='min(1,max(0,(t-" + delay + ")/0.35))'");
    });
    return out;
  };

  const a = ['-v', 'error', '-y'];
  const fc = [];
  const clips = [];
  let total = 0;
  const bgChain = (src, tag) => '[' + src + ']scale=216:384:force_original_aspect_ratio=increase,crop=216:384,boxblur=8:2,scale=' + W + ':' + H
    + ',eq=brightness=-0.16:saturation=0.85,setsar=1[' + tag + ']';
  o.ins.forEach((f, i) => {
    const isImg = IMG.test(f);
    if (isImg) a.push('-loop', '1', '-framerate', String(FPS), '-t', String(o.photo), '-i', f);
    else a.push('-i', f);
    const info = isImg ? { audio: false, dur: o.photo } : probe(f);
    const cap = o.captions[i] || '';
    const top = i === 0 && o.title ? blockTop(o.title) : null;
    const bottom = cap ? blockBottom(cap) : null;
    const texts = [].concat(textFilters(top, 0.2), textFilters(bottom, top ? 0.8 : 0.3));
    fc.push('[' + i + ':v]setsar=1,split=2[b' + i + '][f' + i + ']');
    fc.push(bgChain('b' + i, 'bg' + i));
    // The product sits in the space between the text bands, so no band covers it (19.11: the caption hid the base).
    const box = photoBox(top, bottom);
    fc.push('[f' + i + ']scale=' + W + ':' + box.h + ':force_original_aspect_ratio=decrease,setsar=1[fg' + i + ']');
    const n = Math.round(info.dur * FPS);
    const motion = isImg
      ? ',scale=' + (W * 2) + ':' + (H * 2) + ",zoompan=z='1+0.05*on/" + n + "':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=" + W + 'x' + H + ':fps=' + FPS
      : ',fps=' + FPS;
    fc.push('[bg' + i + '][fg' + i + ']overlay=(W-w)/2:' + box.y + '+(' + box.h + '-h)/2' + motion + ',setsar=1,format=yuv420p'
      + (texts.length ? ',' + texts.join(',') : '') + '[v' + i + ']');
    if (info.audio) fc.push('[' + i + ':a]aresample=44100,aformat=channel_layouts=stereo[a' + i + ']');
    else fc.push('anullsrc=r=44100:cl=stereo,atrim=duration=' + info.dur.toFixed(2) + '[a' + i + ']');
    clips.push({ n: i + 1, file: path.basename(f), kind: isImg ? 'photo' : 'video', start: +total.toFixed(2), end: +(total + info.dur).toFixed(2),
      title: top ? o.title : '', caption: cap, lines: [].concat(top ? top.lines : [], bottom ? bottom.lines : []).map((l) => ({ t: l.t, y: l.y, fs: l.fs })) });
    total += info.dur;
  });
  let count = o.ins.length;
  let endInfo = null;
  if (o.hasEnd) {
    const k = o.ins.length;
    const firstImg = o.ins.find((f) => IMG.test(f));
    if (firstImg) {
      a.push('-loop', '1', '-framerate', String(FPS), '-t', String(END_DUR), '-i', firstImg);
      fc.push(bgChain(k + ':v', 'ebg').replace('eq=brightness=-0.16', 'eq=brightness=-0.3'));
    } else fc.push('color=c=0x15171c:s=' + W + 'x' + H + ':r=' + FPS + ':d=' + END_DUR + ',setsar=1[ebg]');
    const blk = blockEnd(o);
    fc.push('[ebg]fps=' + FPS + ',format=yuv420p,' + textFilters(blk, 0.2).join(',') + '[v' + k + ']');
    fc.push('anullsrc=r=44100:cl=stereo,atrim=duration=' + END_DUR + '[a' + k + ']');
    endInfo = { start: +total.toFixed(2), end: +(total + END_DUR).toFixed(2), offer: o.offer, cta: o.end, brand: o.brand, lines: blk.lines.map((l) => ({ t: l.t, y: l.y, fs: l.fs })) };
    total += END_DUR;
    count++;
  }
  fc.push(Array.from({ length: count }, (_, i) => '[v' + i + '][a' + i + ']').join('') + 'concat=n=' + count + ':v=1:a=1[vj][aj]');
  let amap = '[aj]';
  if (o.audio) {
    a.push('-stream_loop', '-1', '-i', o.audio);
    const idx = a.filter((x) => x === '-i').length - 1;
    const fade = Math.min(2, Math.max(0.5, total / 6)).toFixed(2);
    fc.push('[' + idx + ':a]aresample=44100,aformat=channel_layouts=stereo,volume=' + o.vol + ',atrim=duration=' + total.toFixed(2)
      + ',afade=t=in:d=' + fade + ',afade=t=out:st=' + Math.max(0, total - Number(fade)).toFixed(2) + ':d=' + fade + '[m]');
    fc.push('[aj][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]');
    amap = '[am]';
  }
  a.push('-filter_complex', fc.join(';'), '-map', '[vj]', '-map', amap, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', o.out);
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  const r = spawnSync('ffmpeg', a, { encoding: 'utf8', maxBuffer: 1 << 26 });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) die('ffmpeg failed: ' + String(r.stderr || '').slice(-800));
  fs.writeFileSync(o.out.replace(/\.mp4$/i, '.clips.json'), JSON.stringify({ video: path.basename(o.out), total: +total.toFixed(2), clips, end: endInfo }, null, 1));
  console.log(o.out);
}

module.exports = { clean, rtl, wrap, balanced, fit, photoBox, parseArgs, blockTop, blockBottom, blockEnd, SAFE_TOP, SAFE_BOTTOM };
if (require.main === module) main();
