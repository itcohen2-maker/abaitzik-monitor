# Calls and Meetings Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every finished call (transcript from the customer's cloud PBX) and every meeting lands in a per-customer archive with a fixed summary, searchable by name, number or any word, browsable per contact, askable from the chat.

**Architecture:** Plain JSON files per call in the customer's `data/calls/items/` are the source of truth; `data/calls/index.sqlite` (node:sqlite, FTS5 trigram) is a rebuildable search index. A per-customer timer (`calls-round.js`, as the customer's own user, with his own API key) takes in new calls, summarizes them with Haiku, writes calendar tasks and reindexes. The customer's page asks the central wa-bridge (`/api/calls/*`, authenticated by his fcKey like the fast chat), which reads his index.

**Tech Stack:** Node 22.23 (CommonJS, `node:sqlite` DatabaseSync, `node:test`), systemd units, existing `lib/sales-train.js` `llm()` (claude -p), static pages built by `build.js`.

**Spec:** `docs/superpowers/specs/2026-11-24-calls-archive-design.md`

**Where:** all work is on the server, `/home/monitor/abaitzik-monitor`, as user `monitor` (`sudo -u monitor`). Tests: `sudo -u monitor HOME=/home/monitor npm test`, must end with `# fail 0`. Commit only the files of the task (`git add <files>`), never `git add -A`; push.js publishes. The SSH key: `ssh -i C:\Users\User\.ssh\monitor_server root@178.105.63.97`.

## Global Constraints

- Hebrew UI, RTL, mobile first (iPhone Safari). No dashes as punctuation in customer copy, Heebo font as the rest of the page.
- No content in logs: log lines, `usage.jsonl`, worklog and fault mails carry only call id, duration and state; never a name, number or transcript text.
- `data/calls` is not in git (tenant data is not committed) and `index.sqlite` is rebuildable from the items.
- A number in `data/calls/private.json` is never stored; adding it later moves its existing calls to `data/_deleted/<YYYYMMDD>/` and out of the index.
- No automatic deletion by age in this version.
- Summaries with model `haiku` only, via the customer's own key (`/etc/<id>.env`, ANTHROPIC_API_KEY), never Itzik's subscription.
- Calls shorter than 20 seconds or with an empty transcript are not summarized.
- Up to 3 summary attempts; after that `status: "failed"` and the call shows with transcript only.
- Tracked topics: at most 10 per customer.
- Search must find a word with a Hebrew prefix letter (ל ב ה ו ש מ כ): FTS5 `tokenize='trigram remove_diacritics 1'`. Queries under 3 characters and phone numbers also go through contacts with LIKE.
- node:sqlite prints an ExperimentalWarning: silence it (`process.removeAllListeners('warning')` before require, or `--no-warnings` in units).

## Review Focus

1. Phone formats: `050-1234567`, `+972501234567`, `972501234567`, `0501234567` are the same number everywhere (private list, contacts, search). Test in Task 1 and Task 2.
2. A summary that comes back as text around JSON, or broken JSON: parsed when possible, else counted as a failed attempt, never crashes the round. Test in Task 3.
3. The same webhook delivered twice, or the same meeting imported twice: one item. Test in Task 1.
4. A search query with FTS5 syntax characters (`"`, `*`, `-`, `(`, `NEAR`) must not throw; it is quoted. Test in Task 2.
5. One customer's key must never read another customer's archive, and the owner code must not open a customer's archive (Itzik sees no content). Test in Task 5.

---

### Task 1: The store (`lib/calls-store.js`)

**Files:**
- Create: `lib/calls-store.js`
- Test: `tests/calls-store.test.js`

**Interfaces:**
- Produces:
  - `normPhone(s) -> string` ('' when not a phone), same rule as `lib/own-leads.js` normPhone (`0` + 8 to 9 digits).
  - `intake(dataPath, call, now) -> { ok, id, dup?, skipped?: 'private'|'bad' }`. `call` = `{ kind: 'call'|'meet', provider, extId, at, durationSec, direction: 'in'|'out', number, name?, people?: [{name, email}], transcript, segments?: [{speaker, start, text}], audioUrl?, summary? }`. Writes `data/calls/items/<id>.json` with the schema of the spec (`id = c-<YYYYMMDDHHmmss>-<6 hex of sha1(provider+extId)>`, `status: transcript ? 'new' : 'waiting'`, `tries: 0`, `contactIds: []`, `topics: []`). Duplicate = same provider+extId: returns `{ok:true, dup:true}`; if the existing one is `waiting` and the new one has a transcript, fills it and sets `new`.
  - `read(dataPath, id) -> item|null`, `list(dataPath) -> item[]` (newest first), `write(dataPath, item)` (atomic tmp+rename).
  - `privateList(dataPath) -> string[]` (normalized), `setPrivate(dataPath, numbers[], now) -> { moved: n }` (purges existing calls of a newly added number to `data/_deleted/<YYYYMMDD>/`, one line per call to `data/_deleted/log.txt` with id only).
  - `remove(dataPath, id, now) -> { ok }` (same move).
  - `contacts(dataPath) -> [{ id, name, phones[], emails[] }]` built from `data/calls/contacts.json` (names the customer gave) + `data/biz-home/clients.json` + leads in `data/biz/biz/*.json`; `contactId` = `p<normPhone>` for a phone, `e<lowercase email>` for a mail.
  - `setName(dataPath, number, name) -> { ok }` writes `data/calls/contacts.json`.
  - `resolve(dataPath, item) -> item` fills `contactIds` and `name` from contacts (meetings: every person by email, else by name).

- [ ] **Step 1: Write the failing tests** in `tests/calls-store.test.js` (tmp dir per test, `node:test` + `assert`):
  - `intake writes one item and a repeat of the same provider+extId is a dup` → second call returns `dup: true`, `list().length === 1`.
  - `a waiting call is completed by a later delivery with the transcript` → status goes `waiting` → `new`, transcript filled.
  - `a private number is never stored, in any format` → `setPrivate(['050-1234567'])`, intake with `number: '+972501234567'` → `skipped: 'private'`, no file.
  - `adding a number to the private list later moves its calls to _deleted` → `moved: 2`, `list().length === 0`, `_deleted/log.txt` has the ids and no number.
  - `normPhone: 050-1234567, +972501234567, 972501234567 all give 0501234567; 'abc' gives ''`.
  - `resolve: a call from a client in clients.json gets his name and contactId p0501234567; a meeting gets every attendee by email`.
  - `remove moves the item and list no longer has it`.
- [ ] **Step 2: Run** `sudo -u monitor HOME=/home/monitor node --test tests/calls-store.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement `lib/calls-store.js`** with the interface above. Header comment with the date, Itzik's words ("צריך לעשות סיכומים ומין לוח בקרה", "חיפוש לפי שם") and the spec path, as the other lib files do.
- [ ] **Step 4: Run** the same command → `# fail 0`.
- [ ] **Step 5: Commit** `git add lib/calls-store.js tests/calls-store.test.js && git commit -m "calls archive: the store (items, private list, contacts)"`.

### Task 2: The search index (`lib/calls-index.js`)

**Files:**
- Create: `lib/calls-index.js`
- Test: `tests/calls-index.test.js`

**Interfaces:**
- Consumes: Task 1 `list`, `read`, `contacts`, `normPhone`.
- Produces:
  - `open(dataPath, { readonly }) -> DatabaseSync` on `data/calls/index.sqlite`; schema `calls(id UNINDEXED, at UNINDEXED, kind UNINDEXED, contacts UNINDEXED, topics UNINDEXED, name, number, about, body)` as FTS5 trigram, plus plain table `meta(id PRIMARY KEY, at, kind, status)` for filters and sort.
  - `upsert(dataPath, item)`, `drop(dataPath, id)`, `rebuild(dataPath) -> n`.
  - `search(dataPath, { q, from, to, kind, topic, contactId, limit = 30, offset = 0 }) -> { total, rows: [{ id, at, kind, name, number, durationSec, about, decided, tasks, topics, status, snippet }] }`, newest first. Empty q = latest calls. q of 1 to 2 chars or a phone: contacts by LIKE, then their calls. Other q: each word quoted as an FTS5 phrase (`"` doubled), joined by AND. `snippet` = up to 120 chars of body around the first hit.
  - `contactCard(dataPath, contactId) -> { contact, calls: rows[], open: [{ text, due, callId }] }` (open = tasks of the contact's calls without `done`).
  - CLI: `node lib/calls-index.js search "<q>"` prints up to 10 lines `<date> · <name> · <about> · id <id>`; `node lib/calls-index.js rebuild`.
  - `promptLines(dataPath) -> string[]` (Hebrew lines for the chat: when the customer asks about a past call or meeting, run `node lib/calls-index.js search "<words>"`, answer from what it returns and name the date and the person; never invent).
- [ ] **Step 1: Write the failing tests:**
  - `finds a word inside a prefixed word: חלון finds לחלון, מטבח finds המטבח`.
  - `a two letter name: דן finds the calls of contact דן through contacts`.
  - `a phone in any format finds the calls of that number`.
  - `FTS syntax in the query does not throw: 'מחיר"', 'a*', '(', 'NEAR' return rows or [] without error`.
  - `filters: kind meet only, from/to by date, topic`.
  - `drop removes from results; rebuild from items gives the same total`.
  - `200 synthetic calls: search under 200ms` (timing assert generous).
  - `contactCard returns the calls of the contact and the open tasks`.
- [ ] **Step 2: Run** `node --test tests/calls-index.test.js` → FAIL.
- [ ] **Step 3: Implement** as above. Silence the ExperimentalWarning before `require('node:sqlite')`. `mkdir -p data/calls`. Close the db after each call (short lived, two writers possible).
- [ ] **Step 4: Run** → `# fail 0`.
- [ ] **Step 5: Commit** `lib/calls-index.js tests/calls-index.test.js`.

### Task 3: The summary (`lib/calls-summary.js`)

**Files:**
- Create: `lib/calls-summary.js`
- Test: `tests/calls-summary.test.js`

**Interfaces:**
- Consumes: Task 1 `read`, `write`.
- Produces:
  - `SYSTEM(topics[]) -> string`: Hebrew instruction for a business call summary; output ONLY JSON `{"about": "<up to 2 short sentences>", "decided": ["..."], "tasks": [{"text": "...", "due": "YYYY-MM-DD"|""}], "topics": ["<only from the given list>"]}`; dates relative to the call date given in the input, Israel time.
  - `input(item) -> string`: call date (Israel), direction, name/number, duration, transcript (segments as `speaker: text` when present), cut to 40,000 chars.
  - `needs(item) -> boolean`: status `new` (or `failed` with tries < 3), durationSec >= 20 (meetings: no duration rule), transcript non empty.
  - `parse(text, topics[]) -> summary|null`: takes the first `{...}` block, JSON.parse, keeps only string fields, topics filtered to the list, at most 10 tasks.
  - `async summarize(dataPath, item, llm, now) -> { ok, item }`: `llm('haiku', SYSTEM(topics), input(item), 90000)`; ok → `summary`, `topics`, `status: 'summarized'`; else `tries+1`, `status: tries>=3 ? 'failed' : 'new'`. Writes the item.
  - `calTasks(dataPath, item) -> n`: each task with a due date → `data/cal/add/<callId>-<i>.json` in the format lib/meet-push.js writes (read it and mirror it exactly); same name on a rerun, so no duplicates.
  - `topics(dataPath) -> string[]`, `setTopics(dataPath, list) -> { ok, topics }` (`data/calls/topics.json`, trimmed, unique, max 10, each up to 30 chars).
- [ ] **Step 1: Write the failing tests** (fake llm returning fixed strings):
  - `parse takes JSON wrapped in text, drops topics not in the list`.
  - `broken JSON: tries goes 1, 2, then failed at 3; the round never throws`.
  - `needs: 15 second call false, empty transcript false, meeting with no duration true`.
  - `calTasks writes one file per dated task and a second run writes no new file`.
  - `setTopics keeps at most 10, unique, trimmed`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → `# fail 0`.
- [ ] **Step 5: Commit** `lib/calls-summary.js tests/calls-summary.test.js`.

### Task 4: The round and the customer's timer

**Files:**
- Create: `calls-round.js`, `setup/enable-calls.sh`
- Test: `tests/calls-round.test.js`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces:
  - `calls-round.js` (run in the customer's folder as his user): (1) each `data/calls/inbox/*.json` (written by the webhook, Task 5, or dropped by hand for tests) → `intake` with adapter `drop` (the file IS the generic call object) → file moved to `data/calls/inbox/done/`; bad file → `inbox/bad/`. (2) meetings: each entry of `data/biz-home/meetings.json` → `intake({kind:'meet', provider:'meet', extId: m.id, at: m.at, people: m.people, name: m.client||m.title, transcript: m.summary text, summary from m when present})`. (3) up to 10 items where `needs()` → `summarize` with `require('./lib/sales-train.js').llm` and `process.env` (the unit loads `/etc/<id>.env`), then `calTasks`. (4) `upsert` every changed item. Usage line to `data/status/usage.jsonl` per summary the way worker.js does (find its writer and reuse it). Exports `round(dataPath, { llm, now }) -> { taken, summarized, failed }` for tests; runs it when main. A lock file so two rounds never overlap.
  - `setup/enable-calls.sh <id>`: as enable-fireflies.sh (same hardening), `monitor-calls-<id>.service` + `.timer` every 2 minutes, `EnvironmentFile=/etc/<id>.env`, `ExecStart=/usr/bin/node --no-warnings calls-round.js`, log `/var/log/monitor-calls-<id>.log`; creates `data/calls/{items,inbox,inbox/done,inbox/bad}` owned by the customer, `setfacl -R -m u:monitor:rwx` and default ACL `d:u:monitor:rw,d:u:<id>:rw` on `data/calls` (as data/chat/chat has); a random 32 hex hook secret into Itzik's `data/calls-hooks.json` `{ <secret>: <id> }` (0600, monitor) and prints the webhook URL `https://<host>/api/calls/in/<secret>`; adds `"calls": true` to the customer's `instance.json` (chattr -i / +i as signup-personalize does). Safe to run again (keeps the secret).
- [ ] **Step 1: Write the failing tests:** `a dropped file becomes an item and moves to done`, `a bad file moves to bad`, `a meeting from meetings.json is imported once`, `the round summarizes at most 10 and calls the fake llm with haiku`, `a second concurrent round leaves at once (lock)`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → `# fail 0`; `bash -n setup/enable-calls.sh`.
- [ ] **Step 5: Commit** `calls-round.js setup/enable-calls.sh tests/calls-round.test.js`.

### Task 5: The API in wa-bridge (`lib/calls-api.js`)

**Files:**
- Create: `lib/calls-api.js`
- Modify: `wa-bridge.js` (one block right before the `/api/chat` tenant block, around line 1379, and the public webhook next to `/api/diag`)
- Test: `tests/calls-api.test.js`

**Interfaces:**
- Consumes: Tasks 1 to 3, `tenantByKey(code)` in wa-bridge (returns `{name, dir, key, ...}`).
- Produces:
  - `handle(route, body, dataPath) -> { status, json }` for routes: `search` (body: q, from, to, kind, topic, contactId, offset), `item` (id → full item incl. transcript), `contact` (contactId → contactCard), `delete` (id), `name` (number, name), `topics` (list? → set, else get), `private` (list? → setPrivate, else get), `retag` ({ days: 30, confirm }) → without confirm `{ count, estimateUsd }` (0.01 USD per call, the measured Haiku cost), with confirm marks those items `new` with `tries: 0` so the round retags them.
  - `hook(secret, body, ownerDataPath) -> { status, json }`: secret → customer id from `data/calls-hooks.json`; unknown → 404; body must have extId and at; writes `<customer dir>/data/calls/inbox/<provider>-<extId>.json` (provider default `hook`); size limit 2MB.
  - wa-bridge: `/api/calls/(search|item|contact|delete|name|topics|private|retag)` only with a customer key: `tn = tenantByKey(b.code)`; no tn → 403 and `codeFail`; the owner code alone is refused (403) so Itzik never reads content; `handle(route, b, path.join(tn.dir, 'data'))`. Public `POST /api/calls/in/<secret>` → `hook`. Neither route logs the body.
- [ ] **Step 1: Write the failing tests:** `search through handle returns rows`, `item returns the transcript`, `delete then search does not find it`, `retag without confirm gives count and estimate and changes nothing`, `hook with an unknown secret is 404 and writes nothing`, `hook writes the inbox file of the right customer only`, `a key of customer A gives A's dataPath only` (test the wa-bridge mapping function if extracted; else assert in handle that dataPath comes from the caller), `the owner code is refused on /api/calls/*` (a source test on wa-bridge.js like tests/lead-delete.test.js does: the calls block calls tenantByKey and does not accept codeOk).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, then restart the bridge as the server rules say: `echo $(( $(date +%s) + 600 )) > /run/monitor-maintenance-until; systemctl restart monitor-wa; rm -f /run/monitor-maintenance-until`.
- [ ] **Step 4: Run** → `# fail 0`; `systemctl is-active monitor-wa` → active.
- [ ] **Step 5: Commit** `lib/calls-api.js wa-bridge.js tests/calls-api.test.js`.

### Task 6: The screen 🗂️ שיחות ופגישות (`lib/calls-ui.js`)

**Files:**
- Create: `lib/calls-ui.js`
- Modify: `build.js` (tile entry next to `gBkAppts` ~line 1553: `gCalls: ['g11', '🗂️ שיחות ופגישות', 'כל שיחה, מה סוכם, וחיפוש לפי שם'];` add to screens and ids when `enabled(inst)`, as gBkAppts is at ~1356 and ~1701; include `html(inst)` next to the bookings include ~line 5090)
- Test: `tests/calls-ui.test.js`

**Interfaces:**
- Consumes: Task 5 routes through the page's existing `fcApi(path, body)` (build.js ~20600, sends D.fcKey).
- Produces: `enabled(inst) -> boolean` (`inst.calls === true`), `html(inst) -> string` (screen markup + inline script + css, '' when not enabled). No call data in the page source: everything is fetched when the screen opens.
- Screen (spec sketch): search input on top (debounce 250ms, live), chips היום / השבוע / הכל, שיחות / פגישות, and one chip per tracked topic; list rows `📞|🎙️ name · when · minutes`, `about`, first task with ✅, `#topic`; buttons תמלול מלא (opens item), ▶️ האזנה (only when audioUrl, opens it), 🗑 (in page confirm, not window.confirm). Tapping the name opens the contact card (calls + open tasks + "תן שם למספר"). "עוד" loads the next 30. A settings sheet: private numbers, tracked topics (max 10), retag 30 days with the estimate before confirm. Empty state: "עוד אין שיחות. ברגע שהמרכזייה תעביר שיחה, היא תופיע כאן עם סיכום." Failed summary row: "הסיכום לא הצליח, התמלול המלא כאן".
- [ ] **Step 1: Write the failing tests:** `enabled only with inst.calls`, `html has the search input, the chips and no data`, `build with calls true lists gCalls among the tiles` (as existing build tests do for gBkAppts; find and mirror one), `copy has no dash punctuation` (regex on ' - ' and '–').
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the full suite → `# fail 0`.
- [ ] **Step 5: Commit** `lib/calls-ui.js build.js tests/calls-ui.test.js`.

### Task 7: Ask the archive from the chat

**Files:**
- Modify: `worker.js` (prompt lines block ~line 383; allowedTools ~line 839)
- Test: `tests/calls-ui.test.js` (add) or `tests/calls-index.test.js` (add)

**Interfaces:**
- Consumes: Task 2 `promptLines`, CLI.
- Produces: when `inst.calls === true`: prompt includes `require('./lib/calls-index.js').promptLines(inst.dataPath)`, and allowedTools includes `'Bash(node lib/calls-index.js:*)'`.
- [ ] **Step 1: Failing test:** source test that worker.js adds both only under `inst.calls === true`.
- [ ] **Step 2 to 4:** run, implement, run full suite `# fail 0`.
- [ ] **Step 5: Commit** `worker.js tests/...`.

### Task 8: End to end on a test customer

**Files:** none new (fixtures under `/tmp/calls-e2e/` only).

- [ ] **Step 1:** Pick a test monitor that is not a real customer and not tde485e (Google's reviewers). Use the demo or dummy monitor if one exists (`ls /home | grep -i "demo\|dummy"`), else create one with `setup/new-tenant.sh` per its usage, marked test.
- [ ] **Step 2:** `bash setup/enable-calls.sh <id>`; check unit and timer active, ACL on data/calls.
- [ ] **Step 3:** POST 5 synthetic calls (Hebrew transcripts with לחלון, המטבח, a two letter name, one 10 second call, one private number) to the printed webhook URL with curl.
- [ ] **Step 4:** Wait for one round (≤ 2 minutes; check the log, not a loop): 4 items, 3 summarized (the 10 second one not), private one absent, a task file in data/cal/add.
- [ ] **Step 5:** API with the customer's fcKey: search חלון, מטבח, the two letter name, the phone in +972 form; owner code → 403.
- [ ] **Step 6:** Build the test monitor's page and open it in the browser (iPhone width): tile appears, search works live, contact card, delete, settings. Screenshot.
- [ ] **Step 7:** Ask the test monitor's chat "מה סיכמתי על החלון?" → an answer naming the date and person.
- [ ] **Step 8:** Full `npm test` `# fail 0`. Clean the test calls if the monitor is shared.
