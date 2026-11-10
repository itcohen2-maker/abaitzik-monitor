'use strict';
/*
  10.11.2026, Itzik: "לחבר סרטונים" in the campaign sheet. Joins videos and photos, in the order given, into one
  vertical clip (1080x1920), and optionally mixes one sound softly under it. Local ffmpeg only, nothing leaves the machine.

    node tools/campaign-join.js <out.mp4> [--audio <file>] [--vol 0.25] [--photo 3] <in1> <in2> ...

  A photo becomes a clip of --photo seconds (default 3). A video keeps its own sound, or gets silence if it has none.
  The sound under it (--audio) fades in and out and sits at --vol (default 0.25). Prints the output path.
*/
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IMG = /\.(jpe?g|png|webp|heic|gif|bmp)$/i;
function die(m) { console.error(m); process.exit(1); }

const args = process.argv.slice(2);
const out = args.shift();
if (!out || !/\.mp4$/i.test(out)) die('usage: node tools/campaign-join.js <out.mp4> [--audio f] [--vol 0.25] [--photo 3] in1 in2 ...');
let audio = '', vol = 0.25, photo = 3;
const ins = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--audio') audio = args[++i];
  else if (args[i] === '--vol') vol = Math.max(0.05, Math.min(1, Number(args[++i]) || 0.25));
  else if (args[i] === '--photo') photo = Math.max(1, Math.min(10, Number(args[++i]) || 3));
  else ins.push(args[i]);
}
if (!ins.length) die('no input files');
ins.forEach((f) => { if (!fs.existsSync(f)) die('missing: ' + f); });
if (audio && !fs.existsSync(audio)) die('missing audio: ' + audio);

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', f], { encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout); return { audio: (j.streams || []).some((s) => s.codec_type === 'audio'), dur: Number((j.format || {}).duration) || 0 }; }
  catch (e) { return { audio: false, dur: 0 }; }
}

const a = ['-v', 'error', '-y'];
const fc = [];
let total = 0;
ins.forEach((f, i) => {
  const isImg = IMG.test(f);
  if (isImg) a.push('-loop', '1', '-t', String(photo), '-i', f);
  else a.push('-i', f);
  const info = isImg ? { audio: false, dur: photo } : probe(f);
  total += info.dur;
  fc.push('[' + i + ':v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v' + i + ']');
  if (info.audio) fc.push('[' + i + ':a]aresample=44100,aformat=channel_layouts=stereo[a' + i + ']');
  else fc.push('anullsrc=r=44100:cl=stereo,atrim=duration=' + info.dur.toFixed(2) + '[a' + i + ']');
});
fc.push(ins.map((_, i) => '[v' + i + '][a' + i + ']').join('') + 'concat=n=' + ins.length + ':v=1:a=1[vj][aj]');
let amap = '[aj]';
if (audio) {
  a.push('-stream_loop', '-1', '-i', audio);
  const k = ins.length;
  const fade = Math.min(2, Math.max(0.5, total / 6)).toFixed(2);
  fc.push('[' + k + ':a]aresample=44100,aformat=channel_layouts=stereo,volume=' + vol + ',atrim=duration=' + total.toFixed(2)
    + ',afade=t=in:d=' + fade + ',afade=t=out:st=' + Math.max(0, total - Number(fade)).toFixed(2) + ':d=' + fade + '[m]');
  fc.push('[aj][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]');
  amap = '[am]';
}
a.push('-filter_complex', fc.join(';'), '-map', '[vj]', '-map', amap, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const r = spawnSync('ffmpeg', a, { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) die('ffmpeg failed: ' + String(r.stderr || '').slice(-600));
console.log(out);
