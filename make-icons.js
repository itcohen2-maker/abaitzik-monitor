'use strict';
/*
  The home-screen icon, drawn without any image library.

  Itzik, 17.9, by voice: "design me a modern logo for the monitor, for my
  icon". The old one was a teal square with a white ring, drawn one pixel at a
  time with no smoothing, so every curve on it had a staircase along its edge
  and at 180px on a phone that is what you see first.

  This draws the same way, straight to RGBA PNG through zlib, with two things
  added: coverage is sampled four times across and four times down inside every
  pixel, so an edge lands as a soft step instead of a staircase, and shapes are
  built from distance to a line or a circle rather than from a pixel test, so a
  stroke has round ends and an even weight wherever it turns.

  node make-icons.js            writes the chosen mark into docs/icons
  node make-icons.js --options  also writes every candidate, large, for him
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Distance from a point to a segment. Everything with a round end is drawn
// from this: a stroke is simply every point closer to the line than half its
// weight, which is also why a corner never thins out.
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len = vx * vx + vy * vy;
  let t = len ? (wx * vx + wy * vy) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
// A stroke that narrows as it goes, which is the only honest way to draw the
// tail of a speech bubble: a round ended stick reads as a handle.
function coneDist(px, py, ax, ay, bx, by, r0, r1) {
  const vx = bx - ax, vy = by - ay;
  const len = vx * vx + vy * vy;
  let t = len ? ((px - ax) * vx + (py - ay) * vy) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const d = Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  return d - (r0 + (r1 - r0) * t);
}
function polyDist(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    d = Math.min(d, segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
}
// Distance to the edge of a rounded rectangle, negative inside.
function roundRectDist(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return out + Math.min(Math.max(qx, qy), 0) - r;
}

const SAMPLES = 4;
/*
  One mark, drawn at any size. `layers` is asked, for a point in a 0..1 square,
  how far that point is from the shape. Negative is inside. The sampler turns
  those distances into coverage, so the same description gives a clean 180 and
  a clean 512 without a second drawing.
*/
function draw(size, mark) {
  const step = 1 / (SAMPLES * size);
  return png(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const u = (x + (sx + 0.5) / SAMPLES) / size;
        const v = (y + (sy + 0.5) / SAMPLES) / size;
        const c = mark(u, v, step);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
      }
    }
    const n = SAMPLES * SAMPLES;
    if (!a) return [0, 0, 0, 0];
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(255 * a / n)];
  });
}

// The plate every mark sits on: the site's own teal, deepening downwards.
const TOP = [26, 122, 105], BOT = [10, 63, 55];
function plate(u, v) {
  return [
    Math.round(TOP[0] + (BOT[0] - TOP[0]) * v),
    Math.round(TOP[1] + (BOT[1] - TOP[1]) * v),
    Math.round(TOP[2] + (BOT[2] - TOP[2]) * v),
  ];
}
function over(u, v, strokes, cuts) {
  // Outside the plate there is nothing at all, so the rounded corners stay
  // transparent instead of being cut out of a square.
  const plateD = roundRectDist(u, v, 0, 0, 1, 1, 0.235);
  if (plateD > 0.004) return [0, 0, 0, 0];
  const base = plate(u, v);
  const edge = Math.min(1, Math.max(0, -plateD / 0.004));
  let ink = 0;
  for (const d of strokes) ink = Math.max(ink, Math.min(1, Math.max(0, (0.004 - d) / 0.004)));
  // A hole in the mark, so a shape can be filled and still read as an outline.
  // Without this a bubble had to be drawn as a stroke, and its tail crossed the
  // body and left a notch where the two strokes met.
  for (const d of (cuts || [])) ink = Math.min(ink, Math.min(1, Math.max(0, (d - 0.004) / 0.004)));
  const c = [
    Math.round(base[0] + (255 - base[0]) * ink),
    Math.round(base[1] + (255 - base[1]) * ink),
    Math.round(base[2] + (255 - base[2]) * ink),
  ];
  return [c[0], c[1], c[2], edge];
}

/*
  The candidates. Each one is a sentence about what this thing is.

  pulse   the line is alive and it is his
  bubble  it is a conversation, and it is waiting for him
  bars    something is being watched, and it is rising
  ring    what he has now, redrawn smoothly, so nothing is forced on him
*/
const MARKS = {
  pulse(u, v) {
    const w = 0.085;
    const line = polyDist(u, v, [
      [0.16, 0.52], [0.33, 0.52], [0.40, 0.30], [0.50, 0.72], [0.59, 0.46], [0.66, 0.52], [0.84, 0.52],
    ]) - w / 2;
    return over(u, v, [line]);
  },
  bubble(u, v) {
    // Body and tail are one filled shape, so there is no seam where they meet.
    const body = roundRectDist(u, v, 0.17, 0.20, 0.83, 0.64, 0.15);
    const tail = coneDist(u, v, 0.30, 0.52, 0.34, 0.83, 0.085, 0.012);
    const dots = [0.34, 0.5, 0.66].map((cx) => Math.hypot(u - cx, v - 0.42) - 0.052);
    return over(u, v, [Math.min(body, tail)], dots);
  },
  bars(u, v) {
    const w = 0.095;
    const bar = (cx, top) => segDist(u, v, cx, top, cx, 0.76) - w / 2;
    return over(u, v, [bar(0.28, 0.58), bar(0.5, 0.44), bar(0.72, 0.28)]);
  },
  ring(u, v) {
    const r = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.205) - 0.038;
    const dot = Math.hypot(u - 0.5, v - 0.5) - 0.062;
    return over(u, v, [r, dot]);
  },
};

/*
  What is installed on his home screen. It stays the ring he already has until
  he picks something else: the icon is how he finds this thing on his phone,
  and changing it under him is not mine to do. He is choosing from
  docs/icons/choose.html; when he says a name, this line changes and nothing
  else does.
*/
const CHOSEN = process.env.MONITOR_ICON || 'ring';
const out = path.join(__dirname, 'docs', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const s of [180, 192, 512]) {
  fs.writeFileSync(path.join(out, `icon-${s}.png`), draw(s, MARKS[CHOSEN]));
}
console.log('icons written: ' + CHOSEN);

if (process.argv.includes('--options')) {
  const gal = path.join(__dirname, 'docs', 'icons', 'options');
  fs.mkdirSync(gal, { recursive: true });
  for (const k of Object.keys(MARKS)) {
    fs.writeFileSync(path.join(gal, k + '.png'), draw(384, MARKS[k]));
  }
  console.log('options written: ' + Object.keys(MARKS).join(', '));
}
