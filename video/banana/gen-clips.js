'use strict';
// Generates the ten background clips for the banana reel. No people in frame:
// the whole point of this cut is that nobody has to stand in front of a camera.
const path = require('path');
const fs = require('fs');
const ws = require('../ws.js');

const MODEL = 'wavespeed-ai/wan-2.2/t2v-480p-ultra-fast';
const TAIL = ', cinematic, photorealistic, shallow depth of field, slow camera movement, no text, no captions, no people';
const NEG = 'text, captions, subtitles, watermark, logo, low quality, distorted faces, people, hands with extra fingers';

const SHOTS = [
  'extreme macro of a single ripe banana lying on a plain white kitchen counter, soft morning window light, slow push in',
  'overhead shot of a hand pushing a small plate with a banana away across a wooden table, morning light',
  'a banana resting on a small digital kitchen scale on a counter, numbers on the display, shallow focus',
  'macro slow motion of banana slices falling onto a white plate, soft daylight',
  'extreme macro of the fibrous strands inside a peeled banana, texture detail, soft light',
  'slow motion of a metal bucket of water dumped onto a grey tiled floor, big splash, cold light',
  'slow motion of a thin stream of water from a kitchen tap filling a clear glass, warm light',
  'an empty quiet kitchen in the morning, steam rising from a mug on the counter, sunlight through a window',
  'two different breakfast bowls side by side on a table, one with fruit one plain, soft natural light',
  'a peeled banana on a wooden cutting board slowly rotating, warm kitchen light, shallow depth of field',
];

const out = __dirname;
const ids = SHOTS.map((s, i) => {
  const id = ws.submit(MODEL, {
    prompt: s + TAIL, negative_prompt: NEG, size: '480*832', duration: 5,
  });
  console.log('submit', i, id);
  return id;
});

ids.forEach((id, i) => {
  const dest = path.join(out, 'clip' + i + '.mp4');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10240) return;
  const url = ws.poll(id);
  ws.download(url, dest);
  console.log('done', i, fs.statSync(dest).size);
});
console.log('all clips ready');
