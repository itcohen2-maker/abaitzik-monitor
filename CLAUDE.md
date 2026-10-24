# Facts every session here needs

- **Tasks that need Itzik's real browser or his desktop apps (see the two below) cannot be done by
  a session on the server at all, ever** — the server has no browser and never will. Since 1.10.2026
  they are not sent back to him either. The server session marks them for the PC:
  `node pc-task.js add --re <his message id> "<the full task>"`. If the PC is on it writes him nothing
  (the PC's own answer is the only one, 7.10); if it is off, one line that it will run once the PC is on. `pc-pull.js` on the PC (scheduled task
  `AbaItzikPcPull`, every minute, hidden) claims it over ssh, runs a Claude session there with his
  Chrome, and sends the answer back with `pc-task.js done`, which writes it in his thread and pushes.
  The queue is `data/pc/pc/` on the server; `node pc-task.js list` shows it. Telling him to open
  `CLAUDE.cmd` is now only for a task he wants to watch live.

- **Big file uploads (11.10.2026):** a file over 15MB from the phone goes straight to our server, not ntfy.
  `upload.js` (unit `monitor-upload.service`, 127.0.0.1:8791, user monitor) behind `https://ilay.abaitzik.com/up/*`
  (Caddy, see setup/monitor-upload-caddy.txt); protocol and limits in lib/upload-server.js. Needs the personal code
  (data/owner-code.txt) in every call; up to 4GB, refuses under 10GB free, 20GB quota, 48h partials and 7 day
  finished files are deleted (Itzik, 21.10.2026: keep room on the server) (staging /var/lib/monitor-upload, finished files land in data/inbox). The service leaves
  data/uploads/ready/<id>.json; the listener turns it into the chat line in pollUploads (from itzik, status working,
  files [name]). The page enables it through `uploadUrl` in instance.json; an instance without it keeps the ntfy path.
  Log /var/log/monitor-upload.log; keepalive and watchdog watch the unit. A customer instance needs its own unit
  as its own user, this one can only write Itzik's folder.
  Customers (11.10.2026): `bash setup/enable-upload.sh <id>` as root gives one its own unit
  monitor-upload-<id> (its own user, port 8792 up), an 8 digit upKey in its keys.json that its page signs with,
  uploadUrl, and a /up/v1/<name>/* route in its Caddy block. new-tenant.sh runs it for every new customer.

- **Shopping list:** the Google Doc "קניות", owned by Jenny Cohen and shared with itcohen2.
  https://docs.google.com/document/d/1A2tvet0ucYNDoDclswaVDybuL8bir3OAerRzXtDUEPU/edit
  The home screen tile "🛒 קניות" (`gShopList`) opens it. Items are added one per line at the end,
  nothing is deleted. Editing needs a browser signed in as itcohen2, which exists only on Itzik's PC,
  never the server — see the rule above.

- **Rivhit and Lolos (30.9.2026):** `data/rivhit/rivhit/` now holds the debtors report: one `d31-*.json` per
  customer (kind debt, `inv` = the open invoices behind the total) and `d31-sum.json`. Built from Rivhit card
  balances plus the 2025 and 2026 invoice exports; manpower firms (Orbit, Ram Sky, Gamma Hod) left out by his
  request. The 12.9 records are in `data/_archive/`. September bank deposits were all covered by receipts. Rivhit
  is a Windows desktop app on Itzik's PC only, so issuing receipts or invoices happens from the PC session, never
  the server; see the rule above.
  **Every cheque he sends (12.10.2026) goes into the report**: a `c-<customer>-<YYYYMMDD>.json` there, kind `cheque`,
  with `no` (cheque number), `bank`, `amount`, `name`, `date`, `at` (deposit day); take it off the debtors. When it is
  deposited set `"got":"<date>"` and it moves to "צ׳קים שנגבו" with its number and amount. Never delete one.

- **The improvements reviewer:** `review.js`, timer `monitor-review.timer` every morning 05:30 Israel. A read only
  Claude session that returns up to six improvements from a new customer's point of view into `data/better/better/`,
  shown first on the "💡 רעיונות" screen. Log: `/var/log/monitor-review.log`.
  When an idea he took ("רוצה את זה") is built, or turns out already built, set `"built":"<ISO>"` in its file: it then
  shows as done at the bottom and the reviewer is told not to bring it again (12.10, "כל זמן אותם רעיונות").
  Nothing for Rinat B's Home Style monitor (shipments, orders, suppliers): no approval to develop there (12.10).

- **The tool radar (11.10.2026):** `radar.js`, timer `monitor-radar.timer` every Sunday 08:00 Israel. A Claude session
  with WebSearch and WebFetch only finds up to five new open source tools that fit Rinat, the reels, the monitor or new
  clients, and writes them to `data/better/better/` with `by: "radar"` and a link `u`; the ideas screen marks them
  🔭 with an "לפתוח את הכלי" link. Nothing is installed. `--dry` prints only. Log: `/var/log/monitor-radar.log`.

- **The morning brief (5.10.2026):** `daily-brief.js`, timer `monitor-brief.timer` every day 07:00 Israel. Reads the
  last 24 hours of mail (tools/mail-search.py, read only), the chat and the reports, and a Claude session with no
  tools writes one report to `data/reports/reports/*-morning-brief.json`, shown on the "תשובות" screen, plus a push.
  `--dry` prints without saving. Log: `/var/log/monitor-brief.log`.

- **The candle times site, candletimes.com (1.10.2026):** all work on it happens in `/home/monitor/ner-site`, a clone
  of the private repo `itcohen2-maker/ner-site` (branch master), not in this repo. It deploys by git push: change,
  `node check.mjs`, `node build-pages.mjs` only when times changed, `git commit`, `git push origin master`, and
  Vercel builds production from the push. Plain git is right there (push.js is only for this repo). The server holds
  only a deploy key for that one repo (`~/.ssh/ner`, host alias `github-ner`); there is no Vercel or GitHub account
  token here, on purpose, so deployment status is checked from the PC (`npx vercel ls ner`). Check the live site once,
  never in a loop: polling it got this IP family blocked by Vercel before. Until Itzik adds the repo to the Vercel
  GitHub app (one click on his side, pending since 1.10), a push only updates the repo and the PC's `deploy.sh` still
  publishes. Never commit `.sendkey`, `.vapid.json`, `.env.local` or `.vercel/`.

- **Every new home tile gets the red waving hand (Itzik, 10.10.2026).** Write the tile button with `data-new="1"`
  and the `newTiles` boot gives it `taskblink` (the hand) on each device until he first opens it. He asked for this
  for anything new he opens; do not ship a new tile without it.

- **"📅 מה יש לי היום" (11.10.2026):** the home tile shows today's appointments (`data/appts`), reminders due today and
  tasks of today plus earlier unticked ones (`data/tasks/tasks`, `{"id","day":"YYYY-MM-DD","text","n"}`), and tomorrow's
  appointments. A message "משימה להיום, <day> (<YYYY-MM-DD>): <text>" or "משימה ליום <day> (<YYYY-MM-DD>): <text>" (13.10, the box has a day picker) comes from its add box: write it as a task file for that date.

- **A new appointment (13.10.2026):** the form on the "🏥 תורים עתידיים" screen sends "תור חדש: <what>, <DD.MM.YYYY> (<YYYY-MM-DD>)
  בשעה HH:MM | בלי שעה[, מקום: <where>]". Write it as `data/appts/appts/<YYYYMMDD>-<slug>.json` with `id` ("a" + the name),
  `at`, `when` (ISO with +03:00; with no hour use 09:00 and `"noTime":true`), `what`, `where`. Then push and answer one line.
- **Deleting an appointment (20.10.2026):** the 🗑️ button on the appointments screen sends "מחיקת תור: <id> (<what>, <date>)". Delete data/appts/appts/<file whose id matches>.json (an explicit request, so deleting is allowed), push, answer one line.
- **Editing an appointment (24.10.2026):** the ✏️ button on the appointments screen fills the form; sending it sends "עדכון תור: <id> | <what>, <DD.MM.YYYY> (<YYYY-MM-DD>) בשעה HH:MM[, מקום: <where>]". Overwrite the same data/appts/appts/<file whose id matches>.json with the new details (keep its id), push, answer one line.
- **Deleting a task (24.10.2026):** the 🗑 button next to a task (on the tasks screen and in מה יש לי היום) sends "מחיקת משימה: <id> (<text>)". Delete data/tasks/tasks/<file whose id matches>.json (an explicit request, so deleting is allowed), push, answer one line.

- **"העסק שלי", the small business CRM (12.10.2026), only when `instance.json` has `"biz": true`:** a message (text or
  voice) about a lead, a customer, a payment received or an expense is written as one record file in `data/biz/biz/`,
  named `biz-<yyyymmddhhmmss>-<4 random>.json`, with the fields `id`, `kind` (lead, customer, income, expense), `name`,
  `phone`, `status` (חדש, בשיחה, הצעה, נסגר, אבד), `amount` (a number, shekels), `note`, `next`, `nextAt` (ISO date or ""),
  `at` and `updatedAt`. If a record with the same name or phone already exists, update that file instead of making a
  second one, and set `updatedAt`. Then `node push.js`. A message titled "עדכון עסק" is an update to the record named in
  it. A question like "מה הכי דחוף" is answered from `require('./lib/biz.js').summary(load(require('./lib/instance.js').dataPath))` and the
  records themselves: names and numbers, the way an advisor would, not a general statement.

- **Hebrew read aloud, Phonikud (11.10.2026):** `node say.js "<text>" [name]` makes an mp3 in the private files and
  prints `files/<name>.mp3`; put that link in the answer and the monitor plays it. A message "תקריא לי: <text>" asks
  for exactly this. Installed in `/home/monitor/tts` (venv, models, `say.py`), about 9 seconds and 900MB RAM per run,
  so one at a time. License is non commercial: Itzik's own use only, never in a paid client deliverable.

- **New monitor default (24.10.2026, Itzik):** every new monitor (setup/new-tenant.sh) gets two sample tiles "לדוגמה, אתה יכול לשים פה מה שאתה רוצה" (instance `samples: true`), the candle site as a round icon (`circles`), and three empty round places (`emptyCircles: 3`, "ריק"). Itzik's own copy has none of it, and the tile "רעיונות לתוכן" is removed from his page.
- **Chords for a song (17.10.2026):** "תוציא לי אקורדים" means one printable PDF page of the song's tab4u page. Do not
  search and answer "not found", do not retype lyrics, do not send him to the site. Server: find the tab4u song URL
  (WebSearch "tab4u <song> <singer>"), then `node pc-task.js add --re <id> "node tools/print-chords.mjs <url> <out.pdf>"
  and upload the PDF to data/files-private on the server`. The script prints the site's own page (its print view, two
  columns); it runs only on the PC. One answer with the `files/<name>.pdf` link, nothing before it but the ack.

- **His son's name is written איליי** (Itzik, 25.9 and again 12.10.2026): never אילי, עילאי or אלי, in any
  answer, mail or document, server or PC.

- **"⏰ שעון מעורר" (12.10.2026):** the home tile runs his iPhone shortcut "שעון מעורר" with the picked time (a real alarm; `clock-alarm://` is invalid in Safari, setup steps are in the sheet), or sends the message
  "שעון מעורר HH:MM[: text]". For that message run `node alarm.js "HH:MM" "<text or שעון מעורר>"` (Israel time, a time
  already passed means tomorrow; ntfy rings it at priority 5), add it to `data/appts` only if he asks, and answer one line.

- **The subscribers' Drive folder (13.10.2026):** `drive.js` (rclone at ~/bin/rclone, remote `subs`) works in a separate
  Google account, never itcohen2: folder "מנויים", one subfolder per subscriber shared only with them
  (`node drive.js share <name> <email>`, then `put`/`get`/`ls`). Nothing private of Itzik's goes there. Dropped 13.10: Itzik prefers no Google; subscribers get files through the "📁 הקבצים שלי" tile on our server instead. Earlier: Itzik asked
  "do we need this?" and the answer was not yet, only when a subscriber who works in Google asks; then he opens the Gmail account, a PC task runs `rclone authorize "drive"` signed in as it and the server runs
  `node drive.js setup '<token>'`. `node drive.js status` says whether it is connected.

- **Quiet hours (13.10.2026):** inside the window (default 22:00 to 07:00 Israel, `data/status/quiet.json`) every
  notification is kept, not sent, and the listener sends one summary push when it ends (lib/quiet.js). Reminders and
  the alarm still ring; anything that must ring at night goes `node notify.js --urgent "t" "m"`. He changes it in
  Settings, box "שעות שקטות"; the listener applies the line "שעות שקטות HH:MM עד HH:MM" / "שעות שקטות כבוי" itself.

- **Every update blinks, in every monitor (Itzik, 13.10.2026).** A new tile gets `data-new="1"` (the hand, fast blink).
  Something new placed inside an existing tile gets a bumped `data-upd="<date-slug>"` on that tile button; the `updTiles`
  boot gives it `updblink`, a slow soft pulse (2.6s), until he opens it once. "Not a strong blink. An update is a slow,
  gentle blink." No deliverable goes into an existing tile without bumping its `data-upd`. Applies to every tenant.
  When a site's address (or anything a tile links to) changes, update the tile's link in the same step (Itzik, 15.10.2026).

- **Iron rule (Itzik, 14.10.2026, after paying another $100 in one day):** plan on the high model, execute only on
  the cheap one, in every monitor and every session. On a customer's monitor the server only passes text; all
  execution runs on the customer's computer and account (worker.js planFirst + allow list, pc-pull.js haiku). A
  session working here hands its own legwork, polling and checks to a Haiku agent, never runs them itself.
  **Quota hold (14.10.2026):** a customer without its own token stops at 80 percent of Itzik's five hour or weekly
  window, or at its daily cap (lib/quota-hold.js, worker.js quotaHold), files "חסימת מכסה: ..." as a manager request
  and tells the customer once; it resumes only on his approval, which writes a pass until the window resets.
- **Help inside a note (18.10.2026):** a message that starts "🤖 עזרה בפתק [note:<id>]" (earlier "✍️ פתק לתסריט")
  comes from the button "🤖 אני המוניטור, כאן כדי לעזור לך בפתק" in a note, in every monitor. It carries the request
  ("הבקשה:") and the whole note ("הפתק:"). Do what was asked (write a script with him, finish an idea, fix the
  wording; for a reel use the hebrew-reel-script skill, his voice, no dashes), write the result to a file, then
  `node note-write.js <id> <text.txt> <note.txt>` (note.txt = the note text from the message, used only if the note
  has not synced yet) and `node push.js "note: help"`. It goes under "🤖 מהמוניטור" in that same note, replacing
  an earlier answer there. For "תסדר לי את הפתק" use `--whole`: the text replaces the whole note, so keep every
  idea of his, only in order. The open note on the phone shows it on the next refresh. Answer in the chat in one
  line and say where: "כתבתי בפתק <first line>". Questions go in that line, not in the note. A follow up from the
  same note works on what is already there. The person's notes are theirs: never send them anywhere else.

- **The lecture text (22.10.2026):** the Google Doc "כנגד כל הסיכויים, המלל המלא לעריכה" is the source of the lecture words. On the PC, lec-watch.js (task AbaItzikLecWatch, every 10 minutes) syncs any edit in it into work/lec14/text.html and practice.html and runs publish.sh, with no Claude. So a change to the words is made in the Doc first; a change made only in practice.html is undone by the next sync. Slides (images, order) are still changed in practice.html by hand.

- **A claim is checked against the disk (Itzik, 22.10.2026):** when a session closes, worker.js (lib/claim-check.js) holds every answer that says השלמתי, עדכנתי, הוספתי, תיקנתי and the like against what changed since the session began. Nothing changed outside docs/ and the chat: a correction is written under it and his message opens again once. So change the file, push, check the live page, and only then write that it is done.
  A tile that shows private files gets `data-files="a.png,b.txt"`; build.js adds the newest file time to its data-upd, so it blinks by itself when one changes.

- **Error messages only after verifying (Itzik, 17.10.2026, iron rule):** never send Itzik or a customer an error message until you have checked again, at the source or on the live page, that it really fails. A passing glitch is fixed or retried once quietly. A real error says what was tried and the next step.

- **Bank file, "קובץ בנק" (24.10.2026):** the tile "🏦 חיבור הבנק" (`gBank`) is hidden on a customer's page until `data/status/features.json` has `{"bank":true}`, which the worker writes only after Itzik approves the customer's request "בקשה לפתוח חיבור בנק" (lib/features.js, lib/change-requests.js applyApproved). A message or file whose subject or caption starts with "קובץ בנק" is the customer's movements file: read it (xlsx, csv, pdf or screenshot) and write one report as `data/reports/reports/<YYYYMMDD-HHMM>-bank.json` with `{"at": ISO with +03:00, "title", "body"}`, the same shape as every other report (a .md file there is never shown). `body` is plain text with line breaks, no markdown tables, no dashes of any kind (write "עד" for ranges), Hebrew, in this order: the period and the bottom line (income, expenses, balance at the end), income by source, expenses by category, recurring charges and standing orders (mark one that is new this month), anything unusual (a double charge, an odd fee, a large or one time transfer). Check that the totals add up before writing. Answer one line: "הדוח מוכן במסך התשובות: <title>". Read only: never any action at a bank, no login, no payment. If the customer sends a password or an SMS code, do not store it or repeat it anywhere, delete that message text from the chat file, and warn once, in one line, that it is never needed. If a screenshot of a bank screen arrives under this subject with no file, answer where to click on that screen (the verified path is in the sheet: Hapoalim, tab עו״ש, dates, the Excel icon top left); when it is a bank not yet listed in "הדרכה לחיבור הבנק במוניטור.md" in the actions folder, add its exact path there.

- **Approval inbox, "מחכה לך" (24.10.2026):** before any send (an email or a message to someone), pay, delete, or identity change (name, profile, password, login), write one doc to `data/choices/choices/<YYYYMMDD-HHMM>-<slug>.json`: `{"type":"approve","at":"<ISO +03:00>","question":"<what, one line>","preview":"<draft text, optional>","why":"<optional>","kind":"send|pay|delete|identity","expires":"<ISO, optional>"}`. Then carry on with the rest of the task, and act on that one item only after the line "אישור:" arrives. "אישור עם תיקון:" carries his edited text; "לא עכשיו:" means not now. Blocked kinds are never requested: transfer (money moving), dm-cold (a DM to someone who did not write first), friend (add or accept), whatsapp-other (WhatsApp to anyone but himself). lib/approvals.js is the rule; build.js shows only the four approval kinds, and an expired doc is dropped.
