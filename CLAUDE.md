# Facts every session here needs

- **Tasks that need Itzik's real browser or his desktop apps (see the two below) cannot be done by
  a session on the server at all, ever** — the server has no browser and never will (that's by
  design, see `worker.js`, "25.9: the worker also runs on the cloud server now, which has no
  browser"). Sending the request through the monitor chat again, asking for a link, or re-explaining
  the limitation wastes his time and has already happened in a loop once (27.9, six messages over 90
  minutes before landing on this). The one thing that actually works: he double-clicks
  `CLAUDE.cmd` on his desktop, which opens a real Claude Code session on his own PC with his browser
  attached, and asks it directly there. A session on the server's only job for these is to say that
  in one line and stop — not investigate, not retry, not ask for anything else.

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
