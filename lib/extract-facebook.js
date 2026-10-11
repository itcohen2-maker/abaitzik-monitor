// Facebook reel comment extractor.
//
// Paste into the page context (or run through the browser tool) while a reel
// is open with its comment panel showing. Verified working 7.9.2026 on a reel
// with 5,174 comments.
//
// The trick that makes this reliable: Facebook writes the whole relationship
// into aria-label on each [role="article"] row.
//     "תגובה של X לפני Y"                 a top level comment
//     "תשובה של X לתגובה של Y לפני Z"     X answered Y's comment
// Replies are SIBLINGS of the comment they answer, not children, so counting
// nested articles finds nothing. Match on the label instead.

window.__abaitzik = {
  OWNER: 'איציק כהן',

  btns(re) {
    return [...document.querySelectorAll('[role="button"]')]
      .filter(b => re.test((b.innerText || '').trim()));
  },

  async more() {
    const b = this.btns(/^(תגובות נוספות|עוד תגובות|הצגת תגובות נוספות)/);
    b.forEach(x => x.click());
    if (b.length) await new Promise(r => setTimeout(r, 2200));
    return b.length;
  },

  async expand() {
    const b = this.btns(/^צפייה ב/);
    b.forEach(x => x.click());
    if (b.length) await new Promise(r => setTimeout(r, 1800));
    return b.length;
  },

  classify(a) {
    const l = a.getAttribute('aria-label') || '';
    let m = l.match(/^תשובה של (.+?) לתגובה של (.+?) (?:לפני (.+)|(אתמול|היום))$/);
    if (m) return { kind: 'reply', author: m[1].trim(), parentAuthor: m[2].trim(), age: (m[3] || m[4] || '').trim() };
    m = l.match(/^תגובה של (.+?) (?:לפני (.+)|(אתמול|היום))$/);
    if (m) return { kind: 'comment', author: m[1].trim(), age: (m[2] || m[3] || '').trim() };
    return null;
  },

  parse(a) {
    const perma = [...a.querySelectorAll('a')]
      .map(l => l.getAttribute('href') || '')
      .find(h => /\/reel\/.*comment_id=/.test(h)) || '';
    const id = (perma.match(/comment_id=(\d+)/) || [])[1] || '';
    const drop = new Set(['השב', 'הסתר', 'מאת המחבר', 'מחבר', '·', '']);
    const text = (a.innerText || '').split('\n')
      .map(s => s.trim())
      .filter(s => s && !drop.has(s)
        && !/^‏?\d+\s*(דקות|שעות|ימים|שבועות|שנים)/.test(s)
        && !/^\d+$/.test(s))
      .join('\n');
    const liked = !![...a.querySelectorAll('[role="button"]')]
      .find(b => (b.getAttribute('aria-label') || '') === 'הסרת לייק');
    return { id, text, liked, perma };
  },

  scan() {
    // classify() must be applied LAST: parse() also emits keys and would
    // otherwise overwrite the author with an empty string.
    const parsed = [...document.querySelectorAll('[role="article"]')]
      .map(a => {
        const c = this.classify(a);
        return c ? Object.assign({}, this.parse(a), c) : null;
      })
      .filter(Boolean);

    const answered = new Set(
      parsed.filter(p => p.kind === 'reply' && p.author === this.OWNER)
        .map(p => p.parentAuthor)
    );

    return parsed.filter(p => p.kind === 'comment').map(p => ({
      id: p.id, author: p.author, age: p.age, text: p.text,
      liked: p.liked, answered: answered.has(p.author), perma: p.perma
    }));
  },

  // Pull deeper into the thread. Each round loads one more page and opens the
  // reply threads that arrived with it.
  async harvest(rounds = 8) {
    const log = [];
    for (let i = 0; i < rounds; i++) {
      const m = await this.more();
      const e = await this.expand();
      log.push({ round: i + 1, more: m, expand: e, comments: this.scan().length });
      if (!m && !e) break;
    }
    await this.expand();
    return { log, rows: this.scan() };
  },

  // Triage for the reply bank. Most specific signal wins.
  categorize(t) {
    const s = (t || '').replace(/\s+/g, ' ');
    if (/(תרומ|לתרום|קרן|גיוס|ביט|פייבוקס|לעזור כספית)/.test(s)) return 'donation';
    if (/(איך אפשר לעזור|במה לעזור|רוצה לעזור|אפשר לעזור)/.test(s)) return 'offer_help';
    if (/(תשתה|תאכל|קנאביס|שמן|צמח|תחלוט|כורכום|דיאטה|טיפול טבעי|מרפא|סודה לשתייה|משחה)/.test(s)) return 'medical_advice';
    if (/(גם אני|בעלי|אשתי|אבא שלי|אמא שלי|אחי|אחותי|נפטר|עברתי|התמודד|חולה|אצלי|במשפחה)/.test(s)) return 'pain';
    if (/(רפואה שלמה|רפואה שלימה|בריאות|אמן|בעז|בע"ה|השם יעזור|תתחזק|החלמה)/.test(s)) return 'blessing';
    if (/(מקסים|השראה|אלוף|גיבור|מחזק|כל הכבוד|אוהב|מדהים|צדיק|יקר)/.test(s)) return 'personal';
    return 'encouragement';
  },

  // Like every top level comment that has none yet, spaced like a person.
  async likePending(max = 20) {
    const targets = [];
    for (const a of document.querySelectorAll('[role="article"]')) {
      const c = this.classify(a);
      if (!c || c.kind !== 'comment') continue;
      const btn = [...a.querySelectorAll('[role="button"]')]
        .find(b => (b.getAttribute('aria-label') || '') === 'לייק');
      if (btn) targets.push({ author: c.author, btn });
    }
    const done = [];
    for (const t of targets.slice(0, max)) {
      t.btn.click();
      done.push(t.author);
      await new Promise(r => setTimeout(r, 900 + Math.random() * 1600));
    }
    return { found: targets.length, clicked: done.length, authors: done };
  }
};
