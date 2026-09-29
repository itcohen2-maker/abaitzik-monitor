# Candle stories for candletimes.com, rendered on the server without an image model:
# a night gradient, two candles with a flickering flame, white text with a dark shadow.
# Usage: python3 video/ner_stories.py <outdir>   (writes one mp4 per story and language)
import math, os, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
FONT_HE = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
FONT_EN = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
URL = 'candletimes.com'
OPEN = {'he': 'הייתי חייב להחזיר לעם ישראל על כל התמיכה שנתתם לי',
        'en': 'I owed something back to the Jewish people, for all the support you gave me'}
CLOSE = {'he': 'הכנתי את זה', 'en': 'I made this'}
# the closing line fills the whole screen, as Itzik asked (29.9)
BIG = {'he': 'לכל יהודי העולם באשר הם', 'en': 'For every Jew in the world, wherever you are'}

STORIES = {
    '1-thursday': {
        'he': ['השבת הזאת היא גם שמיני עצרת ושמחת תורה',
               'באתר רואים מתי מדליקים, בדיוק במקום שבו אתם נמצאים',
               'מאיזו עיר אתם מדליקים השבת?'],
        'en': ['This Shabbat is also Shemini Atzeret',
               'The site shows candle lighting for exactly where you are, from your phone',
               'Which city are you lighting in this Shabbat?'],
    },
    '2-friday-morning': {
        'he': ['היום הושענא רבה, ובערב מדליקים לשבת ולחג',
               'הברכה המלאה מחכה באתר, בחמש עשרה שפות',
               'באיזו שפה אמרו את הברכה אצלכם בבית?'],
        'en': ['Today is Hoshana Rabbah. Tonight we light for Shabbat and Yom Tov',
               'The full blessing is on the site, in 15 languages',
               'What language was the blessing said in at your home?'],
    },
    '3-friday-evening': {
        'he': ['ובמוצאי השבת והחג: הבדלה',
               'באתר הנוסח המלא, גם ספרד וגם אשכנז',
               'מי עושה אצלכם הבדלה בבית?'],
        'en': ['Outside Israel there is a second lighting this week',
               'Saturday night, after nightfall, from an existing flame. The site shows both times for your city',
               'Are you lighting both nights this week?'],
    },
}


def beats(lang, mid):
    # (text, seconds, size)
    return [(OPEN[lang], 4.2, 74), (mid[0], 3.6, 78), (mid[1], 4.2, 70),
            (CLOSE[lang], 1.8, 90), (BIG[lang], 3.8, 0), (URL, 2.8, 96), (mid[2], 4.0, 80)]


def background():
    img = Image.new('RGB', (W, H))
    px = img.load()
    top, mid, bot = (15, 26, 58), (11, 19, 48), (7, 11, 26)
    for y in range(H):
        t = y / H
        a, b, u = (top, mid, t / .58) if t < .58 else (mid, bot, (t - .58) / .42)
        c = tuple(int(a[i] + (b[i] - a[i]) * u) for i in range(3))
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    # table edge and two candle bodies
    d.rectangle([0, 1640, W, H], fill=(22, 16, 14))
    d.rectangle([0, 1636, W, 1644], fill=(60, 40, 28))
    for cx in (400, 680):
        d.rounded_rectangle([cx - 38, 1270, cx + 38, 1640], 10, fill=(238, 232, 220))
        d.rectangle([cx - 38, 1270, cx - 22, 1640], fill=(214, 206, 192))
        d.line([cx, 1238, cx, 1272], fill=(40, 30, 24), width=5)
        d.rounded_rectangle([cx - 62, 1610, cx + 62, 1650], 8, fill=(170, 140, 80))
    return img


def glow_layer(strength, shift=0):
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    for cx in (400, 680):
        cx += shift
        d.ellipse([cx - 260, 1190 - 260, cx + 260, 1190 + 260], fill=(245, 166, 35, int(95 * strength)))
    return g.filter(ImageFilter.GaussianBlur(120))


def wind(t, seed):
    # a soft breeze: slow gusts plus a small fast tremble, in pixels of tip displacement
    gust = .6 + .4 * math.sin(t * .7 + seed * .5)
    return gust * (22 * math.sin(t * 1.3 + seed * .4) + 9 * math.sin(t * 2.9 + seed)) + 3 * math.sin(t * 13 + seed * 3)


def flame(d, cx, t, seed):
    f = 1 + .08 * math.sin(t * 11 + seed) + .05 * math.sin(t * 23 + seed * 2)
    lean = wind(t, seed)
    h = 96 * f * (1 - .12 * min(1, abs(lean) / 30))
    w = 26 * (1 + .06 * math.sin(t * 9 + seed))
    base = 1236

    def shape(scale_w, scale_h):
        right, left = [], []
        for i in range(41):
            a = math.pi * i / 40
            u = (1 - math.cos(a)) / 2          # 0 at the wick, 1 at the tip
            y = base - h * scale_h * u
            off = lean * scale_h * u ** 1.6    # the tip bends, the base stays on the wick
            r = w * scale_w * math.sin(a) ** .8
            right.append((cx + off + r, y)); left.append((cx + off - r, y))
        return right + left[::-1]

    d.polygon(shape(1, 1), fill=(255, 196, 80, 255))
    d.polygon(shape(.5, .6), fill=(255, 245, 210, 255))


def wrap(text, font, lang, maxw):
    words, lines, cur = text.split(), [], ''
    kw = {'direction': 'rtl', 'language': 'he'} if lang == 'he' else {}
    for w_ in words:
        test = (cur + ' ' + w_).strip()
        if font.getlength(test, **kw) <= maxw or not cur:
            cur = test
        else:
            lines.append(cur); cur = w_
    lines.append(cur)
    return lines, kw


def fit(text, lang, maxw, maxh):
    # size 0 means: the largest size that fills the screen
    face = FONT_HE if lang == 'he' else FONT_EN
    for size in range(320, 60, -6):
        lines, _ = wrap(text, ImageFont.truetype(face, size), lang, maxw)
        if len(lines) * size * 1.2 <= maxh:
            if max(ImageFont.truetype(face, size).getlength(w_) for w_ in text.split()) <= maxw:
                return size
    return 60


def text_layer(text, size, lang):
    big = size == 0
    if big:
        size = fit(text, lang, 1000, 1700)
    font = ImageFont.truetype(FONT_HE if lang == 'he' and text != URL else FONT_EN, size)
    lines, kw = wrap(text, font, lang if text != URL else 'en', 1000 if big else 900)
    if text == URL:
        kw = {}
    lh = int(size * (1.2 if big else 1.35))
    total = lh * len(lines)
    y0 = (960 if big else 720) - total // 2
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fg = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ds, df = ImageDraw.Draw(shadow), ImageDraw.Draw(fg)
    for i, ln in enumerate(lines):
        lw = font.getlength(ln, **kw)
        x, y = (W - lw) / 2, y0 + i * lh
        ds.text((x + 4, y + 6), ln, font=font, fill=(0, 0, 0, 240 if big else 230), **kw)
        df.text((x, y), ln, font=font, fill=(255, 255, 255, 255), **kw)
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    return Image.alpha_composite(shadow, fg)


def render(name, lang, mid, outdir):
    bg = background().convert('RGBA')
    shifts = (-12, 0, 12)
    glows = {(k, sh): glow_layer(.75 + .25 * k / 7, sh) for k in range(8) for sh in shifts}
    bs = beats(lang, mid)
    layers = [text_layer(t, s, lang) for t, _, s in bs]
    total = sum(b[1] for b in bs)
    out = os.path.join(outdir, f'ner-shabbat-{name}-{lang}.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium',
                          '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                         stdin=subprocess.PIPE)
    starts, acc = [], 0
    for b in bs:
        starts.append(acc); acc += b[1]
    for fi in range(int(total * FPS)):
        t = fi / FPS
        k = int((3.5 + 3.5 * math.sin(t * 7) * math.sin(t * 2.3)) + .5)
        sh = min(shifts, key=lambda v: abs(v - wind(t, .85) * .5))
        frame = Image.alpha_composite(bg, glows[(max(0, min(7, k)), sh)])
        d = ImageDraw.Draw(frame)
        flame(d, 400, t, 0.0); flame(d, 680, t, 1.7)
        for i, (s, (_, dur, _)) in enumerate(zip(starts, bs)):
            if s - .4 <= t < s + dur:
                a = min(1, (t - s + .4) / .5, (s + dur - t) / .4) if i < len(bs) - 1 else min(1, (t - s + .4) / .5)
                if a > 0:
                    lay = layers[i] if a >= 1 else Image.eval(layers[i].getchannel('A'), lambda v: int(v * a))
                    if a < 1:
                        tmp = layers[i].copy(); tmp.putalpha(lay); lay = tmp
                    frame = Image.alpha_composite(frame, lay)
        p.stdin.write(frame.convert('RGB').tobytes())
    p.stdin.close(); p.wait()
    return out


if __name__ == '__main__':
    outdir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(outdir, exist_ok=True)
    only = sys.argv[2:]
    for name, langs in STORIES.items():
        for lang, mid in langs.items():
            if only and f'{name}-{lang}' not in only:
                continue
            print(render(name, lang, mid, outdir), flush=True)
