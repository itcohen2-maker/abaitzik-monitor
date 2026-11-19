'use strict';
/*
  10.11.2026, Itzik: "לחבר סרטונים" in the campaign sheet. Joins videos and photos, in the order given, into one
  vertical clip (1080x1920), and optionally mixes one sound softly under it. Local ffmpeg only, nothing leaves the machine.

  19.11.2026, Itzik: "סרטון עלוב, 3 תמונות בלי שום כתובית, ושום דבר מהשאלות לא מומש". So a campaign video is now an ad:
  each photo sits on a blurred fill of itself (no black bars) with a slow zoom, a headline on the first clip, one caption
  per clip on a rounded band, and an inviting end card (soft cream card, product thumbnails, the call to action, the
  contact line on a green WhatsApp pill, the offer and the name only if the customer gave them). The texts come from the
  customer's own answers (lib/campaign.js says how); the tool only lays them out. Heebo Bold (fonts/), Hebrew via fribidi.
  What the draft says to crop is applied here too: per photo "crops" and "hide" (see below), in the photo's own pixels.

    node tools/campaign-join.js <out.mp4> [--audio <file>] [--vol 0.25] [--photo 4]
         [--title "<headline>"] [--captions '<json array, one per clip, "" for none>'] [--caption "<text>"]...
         [--offer "<price or offer>"] [--end "<call to action>"] [--contact "<how to reach>"] [--brand "<name>"]
         [--texts <file.json>] <in1> <in2> ...

  --texts reads {"title","captions":[],"offer","end","contact","brand","crops":[],"hide":[]} from a file (safer than
  shell quoting with ׳ or "). crops[i] = [x,y,w,h] keeps only that box of input i; hide[i] = [[x,y,w,h],...] covers
  those boxes with the strip right above each (soft edges), for a distraction a crop would cut the product to remove.
  Both in pixels of the photo as it is shown (after its EXIF rotation), hide before crop. null for none.
  A photo becomes a clip of --photo seconds (default 3, or 4 when there is any text). A video keeps its own sound, or
  gets silence if it has none. The end card (3 seconds) is added only when --offer, --end, --contact or --brand is given.
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
const USAGE = 'usage: node tools/campaign-join.js <out.mp4> [--audio f] [--vol 0.25] [--photo 3] [--title t] [--captions json] [--offer t] [--end t] [--contact t] [--brand t] [--texts f.json] in1 in2 ...';

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
// (frames, 19.11.2026); 0.5 and 900 of the 1080px keep a margin for the band's padding. One line if it fits at down to
// 85% of fs; otherwise balanced lines (no word left alone), shrinking towards minFs only when needed.
const TEXT_W = 900;
const perLine = (size) => Math.max(6, Math.floor(TEXT_W / (size * 0.5)));
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
// Estimated drawn width of a line (Hebrew Heebo Bold ~0.48 em a character; 0.5 errs wide).
const textW = (t, fs) => Math.round(String(t).length * fs * 0.5);

const box4 = (v) => Array.isArray(v) && v.length === 4 && v.every((n) => Number.isFinite(Number(n)) && Number(n) >= 0) ? v.map((n) => Math.round(Number(n))) : null;

function parseArgs(argv) {
  const args = argv.slice();
  const o = { out: args.shift(), audio: '', vol: 0.25, photo: 0, title: '', captions: [], offer: '', end: '', contact: '', brand: '', crops: [], hide: [], ins: [] };
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
    else if (k === '--contact') o.contact = clean(args[++i]);
    else if (k === '--brand') o.brand = clean(args[++i]);
    else if (k === '--texts') {
      const f = args[++i];
      let j;
      try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error('--texts: cannot read JSON from ' + f); }
      if (j.title != null) o.title = clean(j.title);
      if (Array.isArray(j.captions)) o.captions = j.captions.map(clean);
      for (const key of ['offer', 'end', 'contact', 'brand']) if (j[key] != null) o[key] = clean(j[key]);
      if (Array.isArray(j.crops)) o.crops = j.crops.map(box4);
      if (Array.isArray(j.hide)) o.hide = j.hide.map((l) => (Array.isArray(l) ? l.map(box4).filter(Boolean) : []));
    }
    else if (/^--/.test(k)) throw new Error('unknown option ' + k);
    else o.ins.push(k);
  }
  if (!o.ins.length) throw new Error('no input files');
  const anyText = !!(o.title || o.captions.some(Boolean) || o.offer || o.end || o.contact || o.brand);
  if (!o.photo) o.photo = anyText ? 4 : 3;
  o.hasEnd = !!(o.offer || o.end || o.contact || o.brand);
  return o;
}

// Where each text block goes, on a rounded band just wide enough for it. Title: from the top of the safe zone.
// Caption: ending at the bottom of the safe zone. Every y is inside 250..1570.
const PADY = 26, PADX = 56;
function band(lines, y0, lh) {
  const w = Math.min(W - 40, Math.max(360, Math.max(...lines.map((l) => textW(l.t, l.fs))) + PADX * 2));
  return { x: Math.round((W - w) / 2), y: y0, w, h: PADY * 2 + lines.length * lh };
}
function blockTop(text) {
  const f = fit(text, 88, 3, 56), lh = Math.round(f.fs * 1.32);
  const y0 = SAFE_TOP + 10;
  const lines = f.lines.map((t, k) => ({ t, fs: f.fs, y: y0 + PADY + k * lh, color: 'white' }));
  return { band: band(lines, y0, lh), lines };
}
function blockBottom(text) {
  const f = fit(text, 74, 3, 50), lh = Math.round(f.fs * 1.32);
  const h = PADY * 2 + f.lines.length * lh, y0 = SAFE_BOTTOM - 10 - h;
  const lines = f.lines.map((t, k) => ({ t, fs: f.fs, y: y0 + PADY + k * lh, color: 'white' }));
  return { band: band(lines, y0, lh), lines };
}

// The end card: up to three product thumbnails on top, then the offer, the call to action, the contact pill
// (WhatsApp green when it says וואטסאפ) and the name. Returns the layout; renderEnd draws it once into a PNG.
const INK = '0x2B2118', GOLD = '0x9A5B12', WA = '0x1DA851', SUB = '0x6B5B4B';
function blockEnd(o, nThumbs) {
  const n = Math.min(3, nThumbs || 0);
  const thumbs = [];
  let y = SAFE_TOP + 40;
  if (n) {
    const gap = 36, tw = n === 1 ? 520 : Math.floor((W - 2 * 90 - gap * (n - 1)) / n), th = Math.round(tw * (n === 1 ? 1.2 : 1.3));
    const x0 = Math.round((W - (tw * n + gap * (n - 1))) / 2);
    for (let i = 0; i < n; i++) thumbs.push({ x: x0 + i * (tw + gap), y, w: tw, h: th });
    y += th + 60;
  }
  const lines = [];
  let pill = null;
  const add = (text, fs, maxLines, minFs, color) => {
    const f = fit(text, fs, maxLines, minFs), lh = Math.round(f.fs * 1.3);
    f.lines.forEach((t) => { lines.push({ t, fs: f.fs, y, color }); y += lh; });
    y += 22;
  };
  if (o.offer) add(o.offer, 84, 2, 56, GOLD);
  if (o.end) add(o.end, 96, 2, 60, INK);
  if (o.contact) {
    const f = fit(o.contact, 64, 1, 44), ph = Math.round(f.fs * 1.9), pw = Math.min(W - 120, textW(f.lines[0] || '', f.fs) + 140);
    pill = { x: Math.round((W - pw) / 2), y: y + 6, w: pw, h: ph, color: /וואטסאפ|ווטסאפ|whatsapp/i.test(o.contact) ? WA : INK };
    lines.push({ t: f.lines[0] || '', fs: f.fs, y: pill.y + Math.round((ph - f.fs * 1.32) / 2), color: 'white' });
    y = pill.y + ph + 34;
  }
  if (o.brand) add(o.brand, 56, 2, 42, SUB);
  // Room to spare: centre the whole card in the safe zone (19.11: it sat at the top with half the screen empty).
  const top0 = thumbs.length ? thumbs[0].y : (lines.length ? lines[0].y : SAFE_TOP + 40);
  const spare = SAFE_BOTTOM - y - (top0 - SAFE_TOP);
  if (spare > 0) {
    const s = Math.floor(spare / 2);
    thumbs.forEach((t) => { t.y += s; });
    lines.forEach((l) => { l.y += s; });
    if (pill) pill.y += s;
    y += s;
  }
  // Too tall for the safe zone (long texts and three photos): shrink the photos and move everything up.
  const over = y - SAFE_BOTTOM;
  if (over > 0 && thumbs.length) {
    const k = Math.max(0.4, (thumbs[0].h - over) / thumbs[0].h);
    const nh = Math.round(thumbs[0].h * k), d = thumbs[0].h - nh, nw = Math.round(thumbs[0].w * k), gap = 36;
    const x0 = Math.round((W - (nw * thumbs.length + gap * (thumbs.length - 1))) / 2);
    thumbs.forEach((t, i) => { t.h = nh; t.w = nw; t.x = x0 + i * (nw + gap); });
    lines.forEach((l) => { l.y -= d; });
    if (pill) pill.y -= d;
    y -= d;
  }
  return { thumbs, lines, pill, bottom: y };
}

// The area for the photo or video: below the title band (or from y 120) and above the caption band (or to 1800).
function photoBox(top, bottom) {
  const y = top ? top.band.y + top.band.h + 24 : 120;
  const yEnd = bottom ? bottom.band.y - 24 : 1800;
  return { y, h: Math.max(400, yEnd - y) };
}

// A rounded rectangle alpha for geq (r = corner radius, a = 0..255).
function roundAlpha(r, a) {
  return "a='if(lte(pow(max(max(" + r + '-X,X-(W-1-' + r + ')),0),2)+pow(max(max(' + r + '-Y,Y-(H-1-' + r + ')),0),2),' + (r * r) + '),' + a + ",0)'";
}

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', f], { encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout); return { audio: (j.streams || []).some((s) => s.codec_type === 'audio'), dur: Number((j.format || {}).duration) || 0 }; }
  catch (e) { return { audio: false, dur: 0 }; }
}
// The size of a photo as ffmpeg decodes it (after the EXIF rotation, which ffprobe does not report for JPEG).
function decodedSize(f) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-hide_banner', '-i', f, '-frames:v', '1', '-vf', 'showinfo', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = String(r.stderr || '').match(/\bs:(\d+)x(\d+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

function ff(args, what) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y'].concat(args), { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('ffmpeg failed (' + what + '): ' + String(r.stderr || '').slice(-800));
}

// A photo is cleaned once (hide boxes filled, crop applied) and scaled down to 1440x2560 at most, so the clip and
// the end card use the same picture and ffmpeg does not decode a 24MP JPEG for every frame.
// A hide box is covered with the strip of the same size right above it (below it when there is no room above), with
// soft edges, except on a side that touches the photo's edge. delogo was tried first (19.11.2026) and left a dark
// smear when the object touched the edge, because it interpolates from the box's border, which was the object itself.
function hidePlan(b, sz) {
  const x = Math.max(0, Math.min(b[0], sz.w - 8)), y = Math.max(0, Math.min(b[1], sz.h - 8));
  const w = Math.max(8, Math.min(b[2], sz.w - x)), h = Math.max(8, Math.min(b[3], sz.h - y));
  const sy = y - h >= 0 ? y - h : Math.min(sz.h - h, y + h);
  const F = Math.max(8, Math.round(Math.min(w, h) * 0.15));
  const sides = [];
  if (x > 0) sides.push('X');
  if (x + w < sz.w) sides.push('(W-1-X)');
  if (y > 0) sides.push('Y');
  if (y + h < sz.h) sides.push('(H-1-Y)');
  const d = sides.length ? sides.reduce((acc, s) => (acc ? 'min(' + acc + ',' + s + ')' : s), '') : String(F);
  return { x, y, w, h, sy, alpha: "a='255*min(1," + d + '/' + F + ")'" };
}
function prepPhoto(f, crop, hide, out) {
  const fc = [];
  let cur = '0:v';
  if ((hide && hide.length) || crop) {
    const sz = decodedSize(f);
    if (!sz) throw new Error('cannot read the size of ' + f);
    (hide || []).forEach((b, k) => {
      const p = hidePlan(b, sz);
      fc.push('[' + cur + ']split=2[m' + k + '][s' + k + ']');
      fc.push('[s' + k + ']crop=' + p.w + ':' + p.h + ':' + p.x + ':' + p.sy + ",format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':" + p.alpha + '[p' + k + ']');
      fc.push('[m' + k + '][p' + k + ']overlay=' + p.x + ':' + p.y + '[h' + k + ']');
      cur = 'h' + k;
    });
    if (crop) {
      const x = Math.min(crop[0], sz.w - 16), y = Math.min(crop[1], sz.h - 16);
      fc.push('[' + cur + ']crop=' + Math.max(16, Math.min(crop[2], sz.w - x)) + ':' + Math.max(16, Math.min(crop[3], sz.h - y)) + ':' + x + ':' + y + '[cr]');
      cur = 'cr';
    }
  }
  fc.push('[' + cur + "]scale='min(1440,iw)':'min(2560,ih)':force_original_aspect_ratio=decrease,setsar=1[po]");
  ff(['-i', f, '-filter_complex', fc.join(';'), '-map', '[po]', '-frames:v', '1', out], 'prepare ' + path.basename(f));
  return out;
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  const die = (m) => { console.error(m); process.exit(1); };
  o.ins.forEach((f) => { if (!fs.existsSync(f)) die('missing: ' + f); });
  if (o.audio && !fs.existsSync(o.audio)) die('missing audio: ' + o.audio);
  if (!fs.existsSync(FONT)) die('missing font: ' + FONT);

  // Text files, the font and the prepared pictures go into a temp folder, so no path in a filter needs escaping.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cjoin-'));
  try { run(o, tmp); } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); die(e.message); }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(o.out);
}

function run(o, tmp) {
  const font = path.join(tmp, 'f.ttf');
  fs.copyFileSync(FONT, font);
  let nText = 0;
  const drawLines = (lines, delay) => lines.map((l) => {
    const tf = path.join(tmp, 't' + (nText++) + '.txt');
    fs.writeFileSync(tf, rtl(l.t));
    return 'drawtext=fontfile=' + font + ':textfile=' + tf + ':expansion=none:text_shaping=1:fontsize=' + l.fs
      + ':fontcolor=' + l.color + ':x=(w-text_w)/2:y=' + l.y + ':y_align=font'
      + (delay == null ? '' : ":alpha='min(1,max(0,(t-" + delay + ")/0.35))'");
  });

  const isImg = o.ins.map((f) => IMG.test(f));
  const src = o.ins.map((f, i) => (isImg[i] ? prepPhoto(f, o.crops[i], o.hide[i], path.join(tmp, 'p' + i + '.png')) : f));

  const a = ['-v', 'error', '-y'];
  const fc = [];
  const clips = [];
  let total = 0, nIn = 0;
  const input = (args) => { a.push.apply(a, args); return nIn++; };
  const bgChain = (from, tag, dark) => '[' + from + ']scale=216:384:force_original_aspect_ratio=increase,crop=216:384,boxblur=8:2,scale=' + W + ':' + H
    + ',eq=brightness=' + dark + ':saturation=0.85,setsar=1[' + tag + ']';
  // A rounded semi transparent band, drawn once into a PNG and laid over the clip with the text fading in.
  let nBand = 0;
  const bandPng = (b, color, alpha, r) => {
    const p = path.join(tmp, 'b' + (nBand++) + '.png');
    ff(['-f', 'lavfi', '-i', 'color=c=' + color + ':s=' + b.w + 'x' + b.h, '-frames:v', '1', '-vf',
      'format=rgba,geq=r=\'r(X,Y)\':g=\'g(X,Y)\':b=\'b(X,Y)\':' + roundAlpha(r, alpha), p], 'band');
    return p;
  };

  o.ins.forEach((f, i) => {
    const vi = isImg[i] ? input(['-loop', '1', '-framerate', String(FPS), '-t', String(o.photo), '-i', src[i]]) : input(['-i', src[i]]);
    const info = isImg[i] ? { audio: false, dur: o.photo } : probe(f);
    const cap = o.captions[i] || '';
    const top = i === 0 && o.title ? blockTop(o.title) : null;
    const bottom = cap ? blockBottom(cap) : null;
    fc.push('[' + vi + ':v]setsar=1,split=2[b' + i + '][f' + i + ']');
    fc.push(bgChain('b' + i, 'bg' + i, -0.16));
    // The product sits in the space between the text bands, so no band covers it (19.11: the caption hid the base).
    const box = photoBox(top, bottom);
    fc.push('[f' + i + ']scale=' + W + ':' + box.h + ':force_original_aspect_ratio=decrease,setsar=1[fg' + i + ']');
    const n = Math.round(info.dur * FPS);
    const motion = isImg[i]
      ? ',scale=' + (W * 2) + ':' + (H * 2) + ",zoompan=z='1+0.05*on/" + n + "':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=" + W + 'x' + H + ':fps=' + FPS
      : ',fps=' + FPS;
    let cur = 'c' + i + '_0';
    fc.push('[bg' + i + '][fg' + i + ']overlay=(W-w)/2:' + box.y + '+(' + box.h + '-h)/2' + motion + ',setsar=1,format=yuv420p[' + cur + ']');
    const blocks = [];
    if (top) blocks.push({ b: top, delay: 0.2 });
    if (bottom) blocks.push({ b: bottom, delay: top ? 0.8 : 0.3 });
    blocks.forEach((bl, k) => {
      const bi = input(['-loop', '1', '-framerate', String(FPS), '-t', String(info.dur), '-i', bandPng(bl.b.band, 'black', 150, 28)]);
      const next = 'c' + i + '_' + (k + 1);
      fc.push('[' + bi + ':v]format=rgba,fade=t=in:st=' + bl.delay + ':d=0.35:alpha=1[bd' + i + '_' + k + ']');
      fc.push('[' + cur + '][bd' + i + '_' + k + ']overlay=' + bl.b.band.x + ':' + bl.b.band.y + ':format=auto,'
        + drawLines(bl.b.lines, bl.delay).join(',') + '[' + next + ']');
      cur = next;
    });
    fc.push('[' + cur + ']format=yuv420p[v' + i + ']');
    if (info.audio) fc.push('[' + vi + ':a]aresample=44100,aformat=channel_layouts=stereo[a' + i + ']');
    else fc.push('anullsrc=r=44100:cl=stereo,atrim=duration=' + info.dur.toFixed(2) + '[a' + i + ']');
    clips.push({ n: i + 1, file: path.basename(f), kind: isImg[i] ? 'photo' : 'video', start: +total.toFixed(2), end: +(total + info.dur).toFixed(2),
      title: top ? o.title : '', caption: cap, crop: o.crops[i] || null, hide: (o.hide[i] || []).length ? o.hide[i] : null,
      lines: [].concat(top ? top.lines : [], bottom ? bottom.lines : []).map((l) => ({ t: l.t, y: l.y, fs: l.fs })) });
    total += info.dur;
  });

  let count = o.ins.length;
  let endInfo = null;
  if (o.hasEnd) {
    const photos = src.filter((_, i) => isImg[i]).slice(0, 3);
    const lay = blockEnd(o, photos.length);
    const png = path.join(tmp, 'end.png');
    const ea = ['-f', 'lavfi', '-i', 'color=c=white:s=' + W + 'x' + H];
    const efc = ["[0:v]format=rgb24,geq=r='252-(252-236)*Y/H':g='247-(247-224)*Y/H':b='240-(240-204)*Y/H',format=rgba[e0]"];
    let cur = 'e0';
    lay.thumbs.forEach((t, k) => {
      ea.push('-i', photos[k]);
      // A white framed, rounded photo card, cropped to fill its box.
      efc.push('[' + (k + 1) + ':v]scale=' + (t.w - 20) + ':' + (t.h - 20) + ':force_original_aspect_ratio=increase,crop=' + (t.w - 20) + ':' + (t.h - 20)
        + ',pad=' + t.w + ':' + t.h + ':10:10:white,format=rgba,geq=r=\'r(X,Y)\':g=\'g(X,Y)\':b=\'b(X,Y)\':' + roundAlpha(26, 255) + '[t' + k + ']');
      efc.push('[' + cur + '][t' + k + ']overlay=' + t.x + ':' + t.y + '[e' + (k + 1) + ']');
      cur = 'e' + (k + 1);
    });
    if (lay.pill) {
      const p = lay.pill;
      efc.push('color=c=' + p.color + ':s=' + p.w + 'x' + p.h + ",format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':" + roundAlpha(Math.floor(p.h / 2), 255) + '[pill]');
      efc.push('[' + cur + '][pill]overlay=' + p.x + ':' + p.y + '[ep]');
      cur = 'ep';
    }
    efc.push('[' + cur + ']' + drawLines(lay.lines, null).join(',') + ',format=rgb24[eo]');
    ff(ea.concat(['-filter_complex', efc.join(';'), '-map', '[eo]', '-frames:v', '1', png]), 'end card');
    const ei = input(['-loop', '1', '-framerate', String(FPS), '-t', String(END_DUR), '-i', png]);
    fc.push('[' + ei + ':v]setsar=1,fps=' + FPS + ',format=yuv420p,fade=t=in:st=0:d=0.4[v' + count + ']');
    fc.push('anullsrc=r=44100:cl=stereo,atrim=duration=' + END_DUR + '[a' + count + ']');
    endInfo = { start: +total.toFixed(2), end: +(total + END_DUR).toFixed(2), offer: o.offer, cta: o.end, contact: o.contact, brand: o.brand,
      thumbs: lay.thumbs.length, lines: lay.lines.map((l) => ({ t: l.t, y: l.y, fs: l.fs })) };
    total += END_DUR;
    count++;
  }
  fc.push(Array.from({ length: count }, (_, i) => '[v' + i + '][a' + i + ']').join('') + 'concat=n=' + count + ':v=1:a=1[vj][aj]');
  let amap = '[aj]';
  if (o.audio) {
    const idx = input(['-stream_loop', '-1', '-i', o.audio]);
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
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + String(r.stderr || '').slice(-800));
  fs.writeFileSync(o.out.replace(/\.mp4$/i, '.clips.json'), JSON.stringify({ video: path.basename(o.out), total: +total.toFixed(2), clips, end: endInfo }, null, 1));
}

module.exports = { clean, rtl, wrap, balanced, fit, textW, photoBox, hidePlan, parseArgs, blockTop, blockBottom, blockEnd, roundAlpha, SAFE_TOP, SAFE_BOTTOM };
if (require.main === module) main();
