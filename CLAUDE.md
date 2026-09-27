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

- **Rivhit and Lolos receipts:** the work so far is in `data/rivhit/rivhit/` (57 records, 12.9.2026). Where it stopped:
  Bit and PayBox payments of 61,373 NIS over two years (55 transactions, PayBox 51,971 in 48, Bit via Yoel 9,402 in 7)
  have no receipts; the list with date and amount is ready to match against who paid. Rivhit is a Windows desktop app
  (Rivhit_cloud_2024) on Itzik's PC only, so issuing receipts happens from the PC session, never the server
  — see the rule above. A session on the server answers with this state, not "I have nothing".
