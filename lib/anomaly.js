'use strict';
/*
  Things money.js tells Itzik about. Pure functions, no files, no network.

  24.10.2026, Stage 4 of the money work. Three rules, nothing else:
  - a bank charge bigger than 2.5 times the median of the earlier charges to
    the same payee (needs at least two earlier charges to compare with);
  - a charge to a payee never seen before, over 1000 shekels;
  - a debtor's invoice unpaid more than 30 days past its due day (the invoice
    date when there is no due date).

  Each anomaly is {key, t, sub}. `key` is stable across runs so money.js can
  tell a new one from one already sent. `t` and `sub` are Hebrew text, written
  without dashes.
*/

const DAY = 24 * 3600 * 1000;
const RATIO = 2.5;
const NEW_PAYEE_MIN = 1000;
const OVERDUE_DAYS = 30;

function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function payeeKey(p) {
  return String(p || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function shekel(n) {
  return Math.round(n).toLocaleString('en-US') + ' ש״ח';
}

// 2026-10-01 becomes 1.10.2026, so the Hebrew text carries no dash.
function dmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Number(m[3]) + '.' + Number(m[2]) + '.' + m[1] : String(iso || '');
}

/*
  movements: [{date: 'YYYY-MM-DD', payee, amount}], a charge is amount < 0.
  Walks the history in date order, so each charge is judged only against the
  charges that came before it.
*/
function chargeAnomalies(movements, opts) {
  const ratio = opts && opts.ratio ? opts.ratio : RATIO;
  const newMin = opts && opts.newMin ? opts.newMin : NEW_PAYEE_MIN;
  const rows = (movements || [])
    .filter((m) => m && Number(m.amount) < 0 && isFinite(Date.parse(m.date)))
    .map((m) => ({ key: payeeKey(m.payee), name: String(m.payee || '').trim(), date: String(m.date), a: -Number(m.amount) }))
    .filter((m) => m.key)
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const seen = Object.create(null);
  const out = [];
  rows.forEach((r) => {
    const earlier = seen[r.key] || [];
    if (earlier.length >= 2) {
      const med = median(earlier);
      if (med > 0 && r.a > ratio * med) {
        out.push({
          key: 'charge:' + r.key + ':' + r.date + ':' + Math.round(r.a),
          t: 'חיוב חריג: ' + r.name,
          sub: 'חויבת ב ' + shekel(r.a) + ' בתאריך ' + dmy(r.date) + ', ואילו החיובים הקודמים לספק הזה עמדו בחציון על ' + shekel(med) + '.',
        });
      }
    } else if (earlier.length === 0 && r.a > newMin) {
      out.push({
        key: 'newpayee:' + r.key + ':' + r.date,
        t: 'ספק חדש: ' + r.name,
        sub: 'חיוב ראשון מהספק הזה, ' + shekel(r.a) + ' בתאריך ' + dmy(r.date) + '.',
      });
    }
    seen[r.key] = earlier.concat([r.a]);
  });
  return out;
}

/*
  debtors: [{name, inv:[{n, date, due?, left}]}], today: epoch ms.
  An invoice is overdue when it has something left and more than OVERDUE_DAYS
  have passed since its due day (the invoice date when there is no due day).
*/
function overdueAnomalies(debtors, today) {
  const out = [];
  (debtors || []).forEach((d) => {
    (d && Array.isArray(d.inv) ? d.inv : []).forEach((inv) => {
      const left = Number(inv && inv.left);
      const base = Date.parse(inv && (inv.due || inv.date));
      if (!(left > 0) || !isFinite(base)) return;
      const days = Math.floor((today - base) / DAY);
      if (days > OVERDUE_DAYS) {
        const n = String(inv.n || '');
        out.push({
          key: 'overdue:' + String(d.name || '') + ':' + n,
          t: 'חוב באיחור: ' + String(d.name || ''),
          sub: (n ? 'חשבונית ' + n + ', ' : '') + 'פתוח ' + shekel(left) + ', באיחור של ' + days + ' ימים.',
        });
      }
    });
  });
  return out;
}

// The anomalies not yet sent, in the order given. `seenKeys` is an array of keys.
function fresh(list, seenKeys) {
  const seen = new Set(seenKeys || []);
  return (list || []).filter((a) => a && !seen.has(a.key));
}

module.exports = { chargeAnomalies, overdueAnomalies, fresh, RATIO, NEW_PAYEE_MIN, OVERDUE_DAYS };
