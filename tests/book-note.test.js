"use strict";
// 23.11.2026, Itzik: "תבנה את השדה של הלמה". What the client writes on the booking page reaches the owner: the store, her notice,
// the sealed payload of her screen, and the card of the board. Not required; one line, no control characters, 300 at most.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const B = require("../lib/bookings.js");
const UI = require("../lib/bookings-ui.js");
const { makeCore } = require("../lib/book-core.js");
const NOW = Date.parse("2026-11-22T06:00:00Z");
const HOURS = { 0: [["09:00", "17:00"]], 1: [["09:00", "17:00"]], 2: [["09:00", "17:00"]], 3: [["09:00", "17:00"]], 4: [["09:00", "17:00"]], 5: [], 6: [] };
const mk = () => {
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), "bk-note-"));
  B.saveConfig(dp, { hours: HOURS, services: [{ id: "brows", name: "עיצוב גבות", minutes: 20, price: 80 }], slotMinutes: 15, bufferMinutes: 0 });
  B.ensureLinkToken(dp);
  return { dp, inst: { name: "t1", dataPath: dp, trade: "beauty", gender: "f", bookings: true } };
};
test("the note is kept, said to the owner and shown on her screen", async () => {
  const w = mk(), notes = [];
  const core = makeCore({ inst: w.inst, dataPath: w.dp, tenantId: "t1", now: () => NOW, notify: (t) => notes.push(t), base: "https://x.test" });
  const slot = B.freeSlots(w.dp, "2026-11-23", "brows", NOW)[0];
  const r = await core.handle({ op: "create", tenant: "t1", service: "brows", start: slot.start, name: "דנה כהן", phone: "0521234567", note: "עור רגיש,\n\u202eלפני חתונה" });
  assert.strictEqual(r.ok, true);
  const it = B.readItems(w.dp)[0];
  assert.strictEqual(it.note, "עור רגיש, לפני חתונה");
  assert.ok(notes.some((t) => /היא כתבה: "עור רגיש, לפני חתונה"/.test(t)));
  const d = UI.data(w.inst, NOW);
  assert.strictEqual(d.items[0].note, "עור רגיש, לפני חתונה");
});
test("no note: nothing extra, and a long one is cut to 300", async () => {
  const w = mk(), notes = [];
  const core = makeCore({ inst: w.inst, dataPath: w.dp, tenantId: "t1", now: () => NOW, notify: (t) => notes.push(t), base: "https://x.test" });
  const s = B.freeSlots(w.dp, "2026-11-23", "brows", NOW);
  await core.handle({ op: "create", tenant: "t1", service: "brows", start: s[0].start, name: "רוני לוי", phone: "0521234568" });
  assert.ok(!/היא כתבה/.test(notes.join(" ")));
  await core.handle({ op: "create", tenant: "t1", service: "brows", start: s[3].start, name: "מאיה בר", phone: "0521234569", note: "א".repeat(500) });
  const long = B.readItems(w.dp).find((i) => i.name === "מאיה בר");
  assert.strictEqual(long.note.length, 300);
});
test("the page sends it and the board card shows it", () => {
  const page = fs.readFileSync(path.join(__dirname, "../lib/book-page.js"), "utf8");
  assert.ok(/id="nt" maxlength="300"/.test(page) && /note: \(document\.getElementById\(.nt.\)/.test(page) && /note: cap\(b\.note, 300\)/.test(page));
  assert.ok(/מה כתבה/.test(UI.page.toString()));
});
