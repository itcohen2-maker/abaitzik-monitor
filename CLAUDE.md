# Facts every session here needs

- **Tasks that need Itzik's real browser or his desktop apps (see the two below) cannot be done by
  a session on the server at all, ever** — the server has no browser and never will. Since 1.10.2026
  they are not sent back to him either. The server session marks them for the PC:
  `node pc-task.js add --re <his message id> "<the full task>"`, tells him in one line that the PC
  will do it by itself as soon as it is on, and stops. `pc-pull.js` on the PC (scheduled task
  `AbaItzikPcPull`, every minute, hidden) claims it over ssh, runs a Claude session there with his
  Chrome, and sends the answer back with `pc-task.js done`, which writes it in his thread and pushes.
  The queue is `data/pc/pc/` on the server; `node pc-task.js list` shows it. Telling him to open
  `CLAUDE.cmd` is now only for a task he wants to watch live.

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

- **The improvements reviewer:** `review.js`, timer `monitor-review.timer` every morning 05:30 Israel. A read only
  Claude session that returns up to six improvements from a new customer's point of view into `data/better/better/`,
  shown first on the "💡 רעיונות" screen. Log: `/var/log/monitor-review.log`.

- **The candle times site, candletimes.com (1.10.2026):** all work on it happens in `/home/monitor/ner-site`, a clone
  of the private repo `itcohen2-maker/ner-site` (branch master), not in this repo. It deploys by git push: change,
  `node check.mjs`, `node build-pages.mjs` only when times changed, `git commit`, `git push origin master`, and
  Vercel builds production from the push. Plain git is right there (push.js is only for this repo). The server holds
  only a deploy key for that one repo (`~/.ssh/ner`, host alias `github-ner`); there is no Vercel or GitHub account
  token here, on purpose, so deployment status is checked from the PC (`npx vercel ls ner`). Check the live site once,
  never in a loop: polling it got this IP family blocked by Vercel before. Until Itzik adds the repo to the Vercel
  GitHub app (one click on his side, pending since 1.10), a push only updates the repo and the PC's `deploy.sh` still
  publishes. Never commit `.sendkey`, `.vapid.json`, `.env.local` or `.vercel/`.
