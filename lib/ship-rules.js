'use strict';
/*
  The shipment rules, as one pure function.

  6.10.2026, Home Style. Rinat B is in charge of the orders; Yael keeps the
  Excel file by hand all day. These are the rules Itzik wrote down from the
  meeting, and what each one means for a row:

    NO_SHO      a shipment arrives within two weeks and has no customs file
                number. The customs file comes from SHO, so none means nobody
                has contacted the agent. The most important alert.
    NO_BOOKING  the booking is not confirmed and the departure is close: ten
                days for suppliers in China, five for suppliers in India.
                Past the departure date it is red.
    ETD_SLIP    the departure is more than three weeks after the date that was
                asked for. Rinat, Yael and Roni are told.
    ETA_PASSED  the arrival date has passed and the row is still not in stock.

  An order that starts with 7 belongs to Shufersal. Home Style only receives
  updates on it, so it never goes red: its alerts are marked "track".
  A row with neither a departure nor an arrival date is an order that was not
  approved yet ("באוויר"), and is not an error.

  No clock, no file and no network in here: the rows, the day and the supplier
  table come in as arguments, so the tests can run it on the real file with
  any day they like.
*/
const DAY = 86400000;
const SLIP_DAYS = 21;
const SHO_WINDOW = 14;
const DEFAULT_BOOKING_DAYS = 10;

const CLOSED_RE = /^(במלאי|הזמנה מבוטלת|יתרת הסחורה)/;
// The goods have left, so a booking is no longer in question.
const SAILED = ['goods on board', 'משוחרר', 'בשחרור', 'שלחתי ניירת', 'נשלחה ניירת ללקוחה', 'ממתין ל bl מתוקן'];
// A deliberate hold, a cancellation or a postponed season: not an alert.
const PAUSED_RE = /(לא לאשר בוקינג|מבקש לבטל|בקרת איכות|מבוטלת)/;

function ts(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
}
function days(a, b) { return Math.round((a - b) / DAY); }

function norm(s) { return String(s == null ? '' : s).trim(); }
function isClosed(row) { return CLOSED_RE.test(norm(row.status)); }
function isSailed(row) { return SAILED.includes(norm(row.status).toLowerCase()); }
function isBooked(row) { return /^booking confirm/i.test(norm(row.status)) || isSailed(row); }
function isPaused(row) { return PAUSED_RE.test(norm(row.status)); }
function isShufersal(row) { return /^7/.test(norm(row.po)); }

function bookingDays(row, suppliers) {
  const s = suppliers && suppliers[norm(row.supplier).toUpperCase()];
  return s && Number.isFinite(s.days) ? s.days : DEFAULT_BOOKING_DAYS;
}

function evaluate(rows, todayIso, suppliers) {
  const today = ts(todayIso);
  const out = [];
  const add = (row, code, level, text, action) => {
    out.push({
      id: row.id, po: row.po, supplier: row.supplier, product: row.product,
      code, level: isShufersal(row) ? 'track' : level, text, action,
      eta: row.eta || '', etd: row.etd || '', retd: row.retd || '', container: row.container || '',
    });
  };
  for (const row of rows || []) {
    if (isClosed(row) || isPaused(row)) continue;
    const etd = ts(row.etd), eta = ts(row.eta), retd = ts(row.retd);
    if (etd == null && eta == null) continue;

    if (eta != null && eta < today) {
      add(row, 'ETA_PASSED', 'red',
        'תאריך ההגעה עבר לפני ' + days(today, eta) + ' ימים והשורה לא במלאי',
        'לבדוק אם הסחורה הגיעה ולעדכן סטטוס, ואם לא, לבדוק איפה היא');
    }
    if (eta != null && eta >= today && days(eta, today) <= SHO_WINDOW && !norm(row.customs)) {
      add(row, 'NO_SHO', 'red',
        'מגיע בעוד ' + days(eta, today) + ' ימים ואין מספר תיק עמילות, כלומר לא בוצעה פנייה לסוכן',
        'לפנות ל SHO ולבקש מספר תיק עמילות');
    }
    if (etd != null && !isBooked(row)) {
      const n = bookingDays(row, suppliers);
      if (etd < today) {
        add(row, 'NO_BOOKING', 'red',
          'תאריך היציאה עבר לפני ' + days(today, etd) + ' ימים ואין בוקינג מאושר',
          'לבדוק מול הספק אם הבוקינג קיים או שהתאריך זז');
      } else if (days(etd, today) <= n) {
        add(row, 'NO_BOOKING', 'amber',
          'יוצא בעוד ' + days(etd, today) + ' ימים ואין בוקינג מאושר',
          'לבקש מהספק בוקינג, הוא מודיע בדרך כלל ' + n + ' ימים מראש');
      }
    }
    if (etd != null && retd != null && etd >= today && !isSailed(row) && days(etd, retd) > SLIP_DAYS) {
      add(row, 'ETD_SLIP', 'amber',
        'היציאה זזה ' + days(etd, retd) + ' ימים מהתאריך שביקשנו',
        'ליצור קשר עם הספק ולעדכן את רינת, יעל ורוני');
    }
  }
  const rank = { red: 0, amber: 1, track: 2 };
  out.sort((a, b) => rank[a.level] - rank[b.level] || String(a.eta || a.etd).localeCompare(String(b.eta || b.etd)) || String(a.po).localeCompare(String(b.po)));
  return out;
}

// What the top of the screen and the morning report count.
function summary(rows, alerts, todayIso) {
  const today = ts(todayIso);
  const open = (rows || []).filter((r) => !isClosed(r) && !isPaused(r));
  const worst = new Map();
  const rank = { red: 0, amber: 1, track: 2 };
  for (const a of alerts) {
    const k = a.id;
    if (!worst.has(k) || rank[a.level] < rank[worst.get(k)]) worst.set(k, a.level);
  }
  const c = { red: 0, amber: 0, track: 0 };
  for (const l of worst.values()) c[l]++;
  const week = open.filter((r) => { const e = ts(r.eta); return e != null && e >= today && days(e, today) <= 7; });
  let money = 0;
  for (const r of open) { const n = Number(r.amount); if (Number.isFinite(n)) money += n; }
  return {
    open: open.length, red: c.red, amber: c.amber, track: c.track,
    green: Math.max(0, open.length - c.red - c.amber - c.track),
    arrivingThisWeek: week.length, openMoney: Math.round(money),
  };
}

// Weekly: which suppliers slip, and which orders moved.
function insights(rows) {
  const by = {};
  for (const r of rows || []) {
    const a = ts(r.etd), b = ts(r.retd);
    if (a == null || b == null) continue;
    // Shari and SHARI are one supplier: the file has both spellings.
    const name = norm(r.supplier) || '?';
    const k = name.toUpperCase();
    const x = by[k] || (by[k] = { supplier: name, n: 0, sum: 0, over: 0 });
    const d = days(a, b);
    x.n++; x.sum += d; if (d > SLIP_DAYS) x.over++;
  }
  return Object.values(by).filter((x) => x.n >= 2)
    .map((x) => ({ supplier: x.supplier, orders: x.n, avgSlipDays: Math.round(x.sum / x.n), overThreeWeeks: x.over }))
    .sort((p, q) => q.avgSlipDays - p.avgSlipDays);
}

/*
  "טיפלתי" from the phone. handled.json maps "<id>|<code>" to {id, code, at, by}.
  An alert is hidden only while the same row still raises the same code, and
  for seven days at most: a new code, or a week gone by, brings it back, so
  nothing marked by mistake disappears for good.
*/
const HANDLED_DAYS = 7;
function handledKey(a) { return a.id + '|' + a.code; }
function applyHandled(alerts, handled, todayIso) {
  if (!handled || typeof handled !== 'object') return alerts;
  const today = ts(todayIso);
  return alerts.filter((a) => {
    const h = handled[handledKey(a)];
    if (!h || h.code !== a.code) return true;
    const then = ts(h.at);
    if (then == null || today == null) return true;
    return days(today, then) > HANDLED_DAYS;
  });
}

module.exports = { evaluate, summary, insights, applyHandled, handledKey, HANDLED_DAYS, isClosed, isPaused, isSailed, isBooked, isShufersal, SLIP_DAYS, SHO_WINDOW };
