'use strict';
/*
  21.11.2026: the appointments diary of a service provider (lib/bookings.js), for the monitor's own session and for the operator.
  One JSON line on stdout. Exit code 0 = done, 2 = refused (conflict, closed, past), 1 = bad input or an error.

    node booking.js add --start "2026-11-22 10:00" --service "עיצוב גבות" --name "דנה פרץ" --phone 0501234567 [--note ..] [--minutes 20] [--src owner|link|chat]
    node booking.js move <id> --start "2026-11-22 11:00"
    node booking.js cancel <id>
    node booking.js status <id> booked|confirmed|done|noshow|cancelled
    node booking.js list [--date YYYY-MM-DD] [--from YYYY-MM-DD --to YYYY-MM-DD] [--all]
    node booking.js slots --date YYYY-MM-DD --service "<name>"
    node booking.js lapsed [--weeks 8]
    node booking.js link --to "<client name>" --day YYYY-MM-DD [--service "<name>"] [--time HH:MM]     (a prepared message in 📤, never sent from here)
    node booking.js apply "<a fixed line from the page: תור לקוחה חדש: ... | הזזת תור לקוחה: ... | ביטול תור לקוחה: ... | שעות פעילות: ... | שירות חדש: ...>"
    node booking.js config show
    node booking.js config set-hours --days 0,1,2,3,4 --hours "09:00-18:00[,19:00-21:00]"     (0 = Sunday; --closed instead of --hours)
    node booking.js config set-hours --line "ראשון 09:00 עד 18:00 | ... | שבת סגור"
    node booking.js config add-service --name "פילינג" --minutes 60 --price 380
    node booking.js config remove-service --name "פילינג"
    --data <dir> uses another data folder (tests); without it, this monitor's own (lib/instance.js dataPath).

  After a write the bookings' entries in data/biz-home/events.json are rewritten (syncEvents), so the day ring and 📅 are right
  at the next build. This script does NOT rebuild: the page is static. As with a quote, the session that ran it then runs
  node build.js and node push.js (lib/bookings.js promptLines tells it so). A booking never sends anything to a client.
*/
const B = require('./lib/bookings.js');

function out(o, code) { process.stdout.write(JSON.stringify(o) + '\n'); process.exit(code); }
// whatever goes wrong (a folder that cannot be written) is still one JSON line and exit 1, never a stack trace
process.on('uncaughtException', (e) => out({ ok: false, error: 'bad', with: [], why: String(e && e.message || e) }, 1));
function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2), v = argv[i + 1]; if (v === undefined || v.startsWith('--')) opt[k] = true; else { opt[k] = v; i++; } } else pos.push(a);
  }
  return { pos, opt };
}
const { pos, opt } = parse(process.argv.slice(2));
const dataPath = typeof opt.data === 'string' ? opt.data : require('./lib/instance.js').dataPath;
const cmd = pos[0], sub = pos[1];
const finish = (r) => {
  if (r.ok === false) out(r, r.error === 'bad' ? 1 : 2);
  if (r.booking) r.sync = B.syncEvents(dataPath);
  out(Object.assign({ ok: true }, r), 0);
};

if (cmd === 'add') {
  finish(B.add(dataPath, { start: opt.start, service: opt.service, serviceId: opt['service-id'], minutes: opt.minutes, name: opt.name, phone: opt.phone, note: opt.note, src: opt.src }));
} else if (cmd === 'move') {
  finish(B.move(dataPath, sub, opt.start));
} else if (cmd === 'cancel') {
  finish(B.cancel(dataPath, sub));
} else if (cmd === 'status') {
  finish(B.setStatus(dataPath, sub, pos[2]));
} else if (cmd === 'list') {
  const q = { includeCancelled: !!opt.all };
  if (opt.date) { q.from = opt.date; q.to = opt.date; } else { q.from = opt.from; q.to = opt.to; }
  out({ ok: true, bookings: B.list(dataPath, q) }, 0);
} else if (cmd === 'slots') {
  if (!opt.date || !opt.service) out({ ok: false, error: 'bad', with: [], why: 'need --date and --service' }, 1);
  out({ ok: true, slots: B.freeSlots(dataPath, opt.date, opt.service) }, 0);
} else if (cmd === 'lapsed') {
  out({ ok: true, lapsed: B.lapsed(dataPath, Number(opt.weeks) || 8) }, 0);
} else if (cmd === 'link') {
  // a prepared wa.me message with the link of a day / service / time, for the owner to send herself (nothing is sent from here)
  const L = require('./lib/book-links.js'), cfg = B.loadConfig(dataPath);
  const sv = opt.service ? cfg.services.find((s) => s.name === opt.service || s.id === opt.service) : null;
  if (opt.service && !sv) out({ ok: false, error: 'service', with: [] }, 2);
  const r = L.prepare(dataPath, { d: opt.day, s: sv && sv.id, t: opt.time, to: opt.to }, Date.now());
  out(r.ok ? r : Object.assign({ with: [] }, r), r.ok ? 0 : 2);
} else if (cmd === 'apply') {
  const r = B.parseRequest(pos.slice(1).join(' '));
  if (!r) out({ ok: false, error: 'bad', with: [], why: 'unknown line' }, 1);
  if (r.kind === 'add') finish(B.add(dataPath, { start: r.start, service: r.service, name: r.name, phone: r.phone, src: 'owner' }));
  else if (r.kind === 'move') finish(B.move(dataPath, r.id, r.start));
  else if (r.kind === 'cancel') finish(B.cancel(dataPath, r.id));
  else {
    const cfg = B.loadConfig(dataPath);
    if (r.kind === 'hours') cfg.hours = r.hours;
    else if (r.kind === 'service') { cfg.services = cfg.services.filter((s) => s.name !== r.name).concat([{ name: r.name, minutes: r.minutes, price: r.price }]); }
    else cfg.services = cfg.services.filter((s) => s.name !== r.name && s.id !== r.name);
    out({ ok: true, config: B.saveConfig(dataPath, cfg) }, 0);
  }
} else if (cmd === 'config') {
  const cfg = B.loadConfig(dataPath);
  if (sub === 'show') out({ ok: true, config: cfg, hoursLine: B.hoursLine(cfg) }, 0);
  if (sub === 'set-hours') {
    if (typeof opt.line === 'string') { const h = B.parseHoursLine(opt.line); if (!h) out({ ok: false, error: 'bad', with: [], why: 'hours line' }, 1); cfg.hours = h; }
    else {
      const days = String(opt.days || '').split(',').map(Number).filter((d) => d >= 0 && d <= 6);
      const ranges = opt.closed ? [] : String(opt.hours || '').split(',').map((r) => r.trim().split('-'));
      if (!days.length || (!opt.closed && !ranges.length)) out({ ok: false, error: 'bad', with: [], why: 'need --days and --hours or --closed' }, 1);
      days.forEach((d) => { cfg.hours[d] = ranges; });
    }
    const c = B.saveConfig(dataPath, cfg);
    out({ ok: true, config: c, hoursLine: B.hoursLine(c) }, 0);
  }
  if (sub === 'add-service') {
    cfg.services = cfg.services.filter((s) => s.name !== opt.name).concat([{ name: opt.name, minutes: opt.minutes, price: opt.price }]);
    const c = B.saveConfig(dataPath, cfg);
    if (!c.services.some((s) => s.name === String(opt.name))) out({ ok: false, error: 'bad', with: [], why: 'service needs --name and --minutes 5 to 600' }, 1);
    out({ ok: true, config: c }, 0);
  }
  if (sub === 'remove-service') { cfg.services = cfg.services.filter((s) => s.name !== opt.name && s.id !== opt.id); out({ ok: true, config: B.saveConfig(dataPath, cfg) }, 0); }
  out({ ok: false, error: 'bad', with: [], why: 'config show|set-hours|add-service|remove-service' }, 1);
} else {
  out({ ok: false, error: 'bad', with: [], why: 'commands: add move cancel status list slots lapsed apply config' }, 1);
}
