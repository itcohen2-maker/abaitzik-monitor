# 22.10, Itzik: "אם אני משנה את קובץ המלל של ההרצאה, אתה משנה את זה אוטומטית גם ל PDF אימון?"
# Takes the Google Doc for editing, exported as text, and carries its paragraphs into
# text.html and practice.html. Only the paragraphs that changed are touched; the slide
# images and captions in practice.html stay where they are. Plain code, no Claude.
#   python lecsync.py <doc.txt>          prints what would change
#   python lecsync.py <doc.txt> --apply  writes both files (backups *_before_sync.html)
import sys, re, html, difflib, shutil

P = re.compile(r'<p([^>]*)>(.*?)</p>', re.S)


def plain(inner):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', inner))).strip()


def norm(s):
    return re.sub(r'\s+', ' ', s.replace('‏', '').replace('‎', '')).strip()


def doc_paras(path):
    t = open(path, encoding='utf-8-sig').read()
    return [norm(l) for l in t.splitlines() if norm(l)]


def sync(path, new, apply):
    src = open(path, encoding='utf-8').read()
    ps = list(P.finditer(src))
    old = [norm(plain(m.group(2))) for m in ps]
    ops = [o for o in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes() if o[0] != 'equal']
    if not ops:
        return 0
    edits = []  # (start, end, text) on src
    for tag, i1, i2, j1, j2 in ops:
        for k in range(i1, i2):
            print(f'  {path} -: {old[k][:90]}')
        for k in range(j1, j2):
            print(f'  {path} +: {new[k][:90]}')
        olds, news = ps[i1:i2], [html.escape(x, quote=False) for x in new[j1:j2]]
        for m, n in zip(olds, news):
            edits.append((m.start(), m.end(), f'<p{m.group(1)}>{n}</p>'))
        for m in olds[len(news):]:
            end = m.end() + (1 if src[m.end():m.end() + 1] == '\n' else 0)
            edits.append((m.start(), end, ''))
        extra = news[len(olds):]
        if extra:
            add = ''.join(f'\n<p>{n}</p>' for n in extra)
            if olds:
                at = olds[-1].end()
            elif i1 > 0:
                at = ps[i1 - 1].end()
            else:
                at, add = ps[0].start(), ''.join(f'<p>{n}</p>\n' for n in extra)
            edits.append((at, at, add))
    if apply:
        shutil.copy(path, path.replace('.html', '_before_sync.html'))
        for s, e, t in sorted(edits, key=lambda x: (x[0], x[1]), reverse=True):
            src = src[:s] + t + src[e:]
        open(path, 'w', encoding='utf-8').write(src)
    return len(ops)


if __name__ == '__main__':
    new = doc_paras(sys.argv[1])
    apply = '--apply' in sys.argv
    n = sum(sync(f, new, apply) for f in ('text.html', 'practice.html'))
    print('changes:', n)
