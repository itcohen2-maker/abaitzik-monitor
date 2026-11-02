# Three worlds for the monitor: newspaper, notebook, radio

Itzik, 26.10.2026: "I want these three to be different kinds of monitor in settings. Remove the
six that were there, keep the three new ones plus what exists now, and plan all of it."
He saw them at docs/new-look.html and liked all three.

## The goal

The settings box "עיצוב" offers four choices, on every monitor (his and every customer's):

| n | name | what it is |
|---|------|------------|
| 1 | הרגיל | today's look, unchanged, no rules of its own |
| 7 | עיתון | a Hebrew morning newspaper: newsprint, black ink, one red |
| 8 | פנקס | an office notebook: ruled paper, red margin, side tabs, marker, stamp |
| 9 | רדיו | an old bakelite radio: a glowing dial, lamps, a knob, a row of keys |

Skins 3, 4, 5 and 6 are deleted. New numbers, 7 to 9, so a phone that still holds "3" from
before can never land on a world by mistake: it falls back to 1.

## What does not change

- The DOM of the home screen. Every id, button and handler stays as it is. The worlds are CSS
  plus one small layout script that only runs while a world is active. Skin 1 gets no new
  rule at all: whoever stays on 1 sees exactly today's page.
- Blinking rules: `data-new` (fast, the hand) and `data-upd` (slow) work in every world, each
  world draws them in its own language (see below).
- Money stays folded and private (memory money-private-back-always): in every world the money
  tiles sit in a closed group "💰 הכסף שלי" that opens only on a tap and is closed every time
  the page opens.
- A way back on every screen. The worlds restyle `backBar`, they never remove it.
- The order he set by hand (the tidy and swap boxes) is kept inside each group.

## The structure every world shares

Today the home screen is 18 round icons (`#blkIcons .ic`) and about 30 big tiles
(`#blkTiles .gt`), 48 places in one heap. In a world they are laid out like this:

1. **On top, only what changed.** A tile with an unopened `data-new` or `data-upd` is moved
   into a top block "התעדכן". Once opened it goes back to its group.
2. **Five fixed groups**, set by a new attribute `data-grp` on every tile in build.js:
   - `net` רשתות ותוכן: ניטור רשתות, הרילים שלי, רילים עתידיים, מה בצלחת, candle.times, נרות, משפטים מנצחים
   - `work` לקוחות ועבודה: רינת, אלון, איליי, הום סטייל, טום ממליץ, העסק שלי, מוניטורים אחרים, דודי בשר
   - `day` יומן ובריאות: מה יש לי היום, תורים עתידיים, תזכורות, שעון מעורר, אחרי הניתוח השני, תעודת נכה, בחירות
   - `proj` אתרים ופרויקטים: האתר, האתר שלי, דפי נחיתה, צ׳אט באתר, פגסוס, סלינדה, הרצאה, תיאטרון, סוף התורה
   - `home` בית ומסמכים: ועד הבית, הקבצים שלי, דרייב, קניות, מצלמות, מסמכים לעורך הדין, מתכונים, כניסות
   - `money` הכסף שלי (folded): הנהלת חשבונות, ישראכרט, חשבוניות, מכירת לולוס
   A tile with no `data-grp` (a customer's own tile, a tile added later) goes to a last group
   "עוד", so nothing ever disappears.
3. The top area of the page (greeting, the unread block, the send box, the mic) is restyled,
   not rebuilt.

## Each world

**7 עיתון.** Masthead "המוניטור" in Frank Ruhl Libre 900 between double rules, date line under
it. The unread count is the lead headline ("18 תשובות מחכות לך"). The "התעדכן" block is three
columns with rules between them. The groups are "מדורים": a heading with a double rule and
then index lines, name, dotted leader, status on the left. The send box is "מכתבים למערכת",
the mic a red round button. The bottom nav is a text strip between double rules. New = red
status text; update = a small red dot before the name. Night: "מהדורת לילה", off white ink on
near black newsprint, the red stays.

**8 פנקס.** A ruled sheet (32px lines) with a red margin, rings on the edge, colored tabs on the
side that jump to each group. The unread count is marked in yellow marker. Each tile is one
written line with a hand drawn box; the "התעדכן" lines get a red stamp "חדש", an opened one a
green tick. Group headings in Amatic SC. The mic is a round rubber stamp. Night: the same
sheet under a desk lamp, dim warm paper, darker lines.

**9 רדיו.** A bakelite case. The unread count glows amber in the dial window (VT323), with a
tuning scale and needle. A speaker grille. Each tile is a lamp with its name: lit amber when it
has something new, dark when not. Groups are rows on the panel with an engraved label. The mic
is a ridged knob. The bottom nav is a row of piano keys, the current one pressed. Night: the
case goes dark walnut, the dial and lamps glow brighter.

All three: icons stay the tiles' own SVG and emoji where the world keeps them; the radio and the
notebook hide the round colour badges (`.c`), the newspaper hides them too. Contrast at least
4.5:1 for body text, touch targets at least 44px, `prefers-reduced-motion` respected.

## Steps (each one is a commit, `npm test` green before push)

1. **Remove skins 3 to 6.** lib/skins-ui.js: DESIGNS becomes 1 only for the moment, NIGHT,
   NIGHT_EXTRA, the skin 3 to 6 rules and DZ_META entries go. Early script and `dzGet` accept
   only 1, 7, 8, 9. tests/skins-ui.test.js updated. Delete docs/home-designs.html (the old
   preview of the six) and anything that links to it.
2. **Groups.** build.js: add `data-grp` to every `.ic` and `.gt` on the home screen, per the
   table above. A test checks every home tile has one of the six values or is a customer's.
3. **The world layout script** (new file lib/worlds-ui.js, `head`/`css`/`js` like skins-ui):
   when `data-skin` is 7, 8 or 9, build the "התעדכן" block and the group sections by moving the
   existing nodes (no clones, so every handler keeps working); when it changes back to 1, put
   every node back in its original place (remember the original parent and next sibling).
   Money group folded, closed on every load. Tests: switching 1 to 7 to 1 restores the exact
   original order; money group is closed after boot.
4. **World 7 עיתון** CSS, day and night.
5. **World 8 פנקס** CSS, day and night.
6. **World 9 רדיו** CSS, day and night.
7. **The picker.** Four buttons, each with a tiny drawing of its world instead of a colour
   swatch; text "ארבעה סוגי מוניטור. הבחירה נשמרת במכשיר הזה בלבד."
8. **Every monitor.** Run the build for every tenant (setup/new-tenant.sh already uses the same
   build.js), check one customer page loads in each world.
9. **Check live** (not in the code): each world at phone width on the live page, day and night,
   home screen, one inner screen (backBar), settings. Screenshots go to the monitor report.
   The "עיצוב" tile in settings gets a bumped `data-upd` so it blinks once.

## Who does what

Planned here (Opus). Steps 1 to 8 run on Haiku agents, one agent per step, in order (they
touch the same files). Step 9, the live check, is done by the planning session itself before
anything is reported as done.

## Open points to bring to Itzik only if they come up

- A tile whose group is unclear: put it in "עוד" and list it in the report, do not guess.
- If moving the nodes breaks a screen that reads tile positions (the tidy box, the swap box),
  disable those two boxes while a world is active and say so in one line.
