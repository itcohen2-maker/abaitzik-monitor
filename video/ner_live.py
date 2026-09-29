# Live candle stories (29.9): Itzik did not see the flames move in the first cut, where they
# were small flat shapes under the text. Here two big candles fill the lower half and every
# flame is drawn per pixel: a flickering teardrop that sways, a blue root, a hot core, a halo
# that breathes with it, light on the wax, and embers drifting up. Text sits above the flames.
# Usage: python3 video/ner_live.py <outdir> [1-thursday-he ...]
import math, os, random, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
import ner_stories as base

W, H, FPS = base.W, base.H, base.FPS
CANDLES = [(360, 1180, 0.0), (720, 1180, 1.9)]   # x, wick y, phase
FH, FW = 330, 46                                 # flame height and half width in pixels
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def noise(t, seed, rates):
    return sum(math.sin(t * r + seed * (i + 1.3)) / (i + 1) for i, r in enumerate(rates))


def background():
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    top, bot = np.array([20, 12, 10], np.float32), np.array([6, 4, 4], np.float32)
    img = top * (1 - y[..., None]) + bot * y[..., None]
    img = np.repeat(img, W, axis=1)
    # table
    img[1760:] = [26, 17, 12]
    img[1756:1762] = [70, 46, 30]
    return img


def candle_body(img):
    for cx, wy, _ in CANDLES:
        x = XX[wy + 20:1760, cx - 75:cx + 75] - cx
        shade = np.clip(1 - (x / 75) ** 2, 0, 1) ** .35          # round body
        wax = np.array([238, 228, 212], np.float32)
        img[wy + 20:1760, cx - 75:cx + 75] = wax * (.35 + .65 * shade[..., None])
        # the rim of melted wax around the wick
        img[wy + 14:wy + 26, cx - 75:cx + 75] = [250, 240, 222]
        img[wy - 18:wy + 18, cx - 3:cx + 3] = [30, 22, 18]      # wick
    return img


def flame_field(cx, wy, t, ph):
    # sway: slow drift plus quick shivers, bending more toward the tip
    lean = 26 * noise(t, ph, (0.9, 2.1, 3.7)) + 6 * math.sin(t * 17 + ph * 4)
    hgt = FH * (1 + .07 * noise(t, ph + 3, (8.3, 13.1, 21.7)))
    wid = FW * (1 + .05 * noise(t, ph + 5, (7.1, 11.3)))
    x0, x1, y0, y1 = cx - 150, cx + 150, int(wy - hgt * 1.1), wy + 30
    ys, xs = YY[y0:y1, x0:x1], XX[y0:y1, x0:x1]
    v = (wy + 8 - ys) / hgt                                        # 0 at the wick, 1 at the tip
    vc = np.clip(v, 0, 1)
    # the flame body ripples as it rises
    ripple = 7 * vc ** 1.5 * np.sin(vc * 9 - t * 14 + ph)
    center = cx + lean * vc ** 1.8 + ripple
    prof = np.where(v < 0, 0, np.sqrt(np.clip(v * 4, 0, 1)) * np.clip(1 - vc, 0, 1) ** .75 * 1.25)
    r = wid * prof + 1e-3
    d = np.abs(xs - center) / r
    inside = np.clip(1 - d, 0, 1) * (v > -.02) * (v < 1)
    return (y0, y1, x0, x1), inside, vc, lean


def render_frame(bg, t, embers):
    img = bg.copy()
    glow = np.zeros((H, W), np.float32)
    col = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    total_lean, bright = 0, 0
    for cx, wy, ph in CANDLES:
        (y0, y1, x0, x1), a, vc, lean = flame_field(cx, wy, t, ph)
        total_lean += lean
        b = .85 + .15 * noise(t, ph + 7, (9.7, 15.3))
        bright += b
        # colour by depth into the flame and height: red edge, orange, yellow, white core, blue root
        core = np.clip((a - .45) / .4, 0, 1)
        c = np.stack([255 * np.ones_like(a), 120 + 115 * np.clip(a * 1.6, 0, 1), 40 + 200 * core], -1)
        c = c * (1 - .25 * vc[..., None] ** 2)
        blue = np.clip(1 - vc / .18, 0, 1) * np.clip(1 - a * 1.4, 0, 1)
        c = c * (1 - blue[..., None]) + np.array([90, 130, 255]) * blue[..., None]
        al = np.clip(a * 2.2, 0, 1) ** 1.2 * b
        al *= np.clip((1 - vc) * 6, 0, 1)                            # soft tip
        col[y0:y1, x0:x1] = c
        alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], al)
        glow[y0:y1, x0:x1] += al * b
    bright /= len(CANDLES)
    # halo: blur the flame mask at low resolution, strong and wide
    small = Image.fromarray((np.clip(glow, 0, 1) * 255).astype(np.uint8)).resize((W // 8, H // 8), Image.BILINEAR)
    halo_w = np.asarray(small.filter(ImageFilter.GaussianBlur(28)).resize((W, H), Image.BILINEAR), np.float32) / 255
    halo_n = np.asarray(small.filter(ImageFilter.GaussianBlur(5)).resize((W, H), Image.BILINEAR), np.float32) / 255
    halo = (halo_w * 9 + halo_n * 2.2) * bright
    img = img + halo[..., None] * np.array([255, 150, 50], np.float32) * .9
    # light on the wax near the top, flickering with the flame
    for cx, wy, ph in CANDLES:
        yy = YY[wy:wy + 260, cx - 75:cx + 75]
        warm = np.exp(-(yy - wy) / 90)[..., None] * np.array([60, 30, 0], np.float32) * bright
        img[wy:wy + 260, cx - 75:cx + 75] += warm
    img = img * (1 - alpha[..., None]) + col * alpha[..., None]
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')
    # embers drifting up with the breeze
    d = ImageDraw.Draw(out)
    for e in embers:
        age = (t - e['t0']) % e['life']
        u = age / e['life']
        x = e['x'] + total_lean * .8 * u + 18 * math.sin(age * 2 + e['ph'])
        y = e['y'] - e['vy'] * age
        a = int(220 * math.sin(math.pi * u))
        rr = e['r']
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 190, 90, a))
    return out


def make_embers():
    rnd = random.Random(29)
    return [{'x': rnd.choice(CANDLES)[0] + rnd.uniform(-30, 30), 'y': 1180 - FH * .9,
             'vy': rnd.uniform(40, 90), 'life': rnd.uniform(3, 6), 't0': rnd.uniform(0, 6),
             'ph': rnd.uniform(0, 6), 'r': rnd.uniform(1.5, 3.2)} for _ in range(14)]


def text_layer(text, size, lang):
    # same look as the first cut, but kept in the upper half so the flames stay clear
    lay = base.text_layer(text, size, lang)
    bbox = lay.getbbox()
    if not bbox:
        return lay
    top_limit = 760 - 40
    if bbox[3] > top_limit:
        box_h = bbox[3] - bbox[1]
        if box_h > top_limit - 60:
            scale = (top_limit - 60) / box_h
            crop = lay.crop(bbox)
            crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
            lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            lay.alpha_composite(crop, ((W - crop.width) // 2, 60))
        else:
            moved = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            moved.alpha_composite(lay.crop(bbox), (bbox[0], max(80, top_limit - box_h - (top_limit - box_h) // 2)))
            lay = moved
    return lay


def render(name, lang, mid, outdir):
    bg = candle_body(background())
    embers = make_embers()
    bs = base.beats(lang, mid)
    layers = [text_layer(t, s, lang) for t, _, s in bs]
    total = sum(b[1] for b in bs)
    out = os.path.join(outdir, f'ner-live-{name}-{lang}.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium',
                          '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                         stdin=subprocess.PIPE)
    starts, acc = [], 0
    for b in bs:
        starts.append(acc); acc += b[1]
    for fi in range(int(total * FPS)):
        t = fi / FPS
        frame = render_frame(bg, t, embers)
        for i, (s, (_, dur, _)) in enumerate(zip(starts, bs)):
            if s - .4 <= t < s + dur:
                a = min(1, (t - s + .4) / .5, (s + dur - t) / .4) if i < len(bs) - 1 else min(1, (t - s + .4) / .5)
                if a > 0:
                    lay = layers[i]
                    if a < 1:
                        lay = lay.copy(); lay.putalpha(Image.eval(layers[i].getchannel('A'), lambda v: int(v * a)))
                    frame = Image.alpha_composite(frame, lay)
        p.stdin.write(frame.convert('RGB').tobytes())
    p.stdin.close(); p.wait()
    return out


if __name__ == '__main__':
    outdir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(outdir, exist_ok=True)
    only = sys.argv[2:]
    if only == ['still']:
        bg = candle_body(background()); em = make_embers()
        for k, t in enumerate((0.0, 0.4, 1.1, 2.3)):
            render_frame(bg, t, em).convert('RGB').save(os.path.join(outdir, f'still{k}.png'))
        sys.exit()
    for name in ('1-thursday', '2-friday-morning'):
        for lang, mid in base.STORIES[name].items():
            if only and f'{name}-{lang}' not in only:
                continue
            print(render(name, lang, mid, outdir), flush=True)
