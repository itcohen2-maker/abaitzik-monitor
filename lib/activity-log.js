'use strict';
/*
  24.10.2026: Itzik's activity log ("יומן פעולות") and the cost per answer (stage 8).
  Pure functions: build.js reads data/status/usage.jsonl (worker.js logUsage writes one line
  per session, list price in USD) and passes it in with the reports and the claude answers.
  Shown in shekels at 3.7 per dollar, always marked "בערך". Only Itzik's copy gets this
  (build.js), so a customer never sees a cost. Tested from tests/activity-log.test.js.
*/
const fs = require('fs');
const { israelDay } = require('./quota-day.js');

const USD_ILS = 3.7;
const ROWS = 50;

function ils(usd) { return Math.round(Number(usd || 0) * USD_ILS * 100) / 100; }

// The model that cost the most in that session, as a short name for the row.
function modelLabel(models) {
  let best = '', bestUsd = -1;
  for (const [m, u] of Object.entries(models || {})) {
    const usd = Number(u && u.usd) || 0;
    if (usd > bestUsd) { best = m; bestUsd = usd; }
  }
  if (/opus/i.test(best)) return 'Opus';
  if (/sonnet/i.test(best)) return 'Sonnet';
  if (/haiku/i.test(best)) return 'Haiku';
  return best;
}

// "HH:MM" and the day: "היום" when it is today, else dd.mm, both in Israel time.
function whenLabel(t, nowMs) {
  const d = new Date(t);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const day = israelDay(d);
  const today = israelDay(new Date(nowMs));
  const dayPart = day === today ? 'היום' : day.slice(8) + '.' + day.slice(5, 7);
  return dayPart + ' ' + hm;
}

function readUsage(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).reduce((out, l) => {
      try { out.push(JSON.parse(l)); } catch (e) { /* a bad line is skipped, never fatal */ }
      return out;
    }, []);
  } catch (e) { return []; }
}

/*
  usage: parsed usage.jsonl lines. reports: [{title, at}]. answers: ISO times of claude's answers.
  Returns what the page draws: today and this month in shekels (null when there is no cost data at
  all), the average cost per answered request this month, and the newest rows (last 50).
*/
function summarize(usage, reports, answers, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const today = israelDay(new Date(now));
  const month = today.slice(0, 7);
  let costToday = 0, costMonth = 0, usageLines = 0;
  const rows = [];
  for (const u of usage || []) {
    const t = Date.parse(u && u.at);
    if (isNaN(t)) continue;
    const usd = Number(u.usd) || 0;
    const day = israelDay(new Date(t));
    usageLines++;
    if (day.slice(0, 7) === month) costMonth += usd;
    if (day === today) costToday += usd;
    rows.push({ t, did: 'סשן עבודה' + (u.msgs ? ', ' + u.msgs + ' הודעות' : ''), model: modelLabel(u.models), usd });
  }
  for (const r of reports || []) {
    const t = Date.parse(r && r.at);
    if (isNaN(t)) continue;
    rows.push({ t, did: String(r.title || 'דוח'), model: '', usd: null });
  }
  const answered = (answers || []).filter((a) => {
    const t = Date.parse(a);
    return !isNaN(t) && israelDay(new Date(t)).slice(0, 7) === month;
  }).length;
  const hasCost = usageLines > 0;
  rows.sort((a, b) => b.t - a.t);
  return {
    hasCost,
    today: hasCost ? ils(costToday) : null,
    month: hasCost ? ils(costMonth) : null,
    answered,
    avg: hasCost && answered ? Math.round(costMonth / answered * USD_ILS * 100) / 100 : null,
    rows: rows.slice(0, ROWS).map((r) => ({
      when: whenLabel(r.t, now),
      did: r.did,
      model: r.model,
      cost: r.usd == null ? null : ils(r.usd),
    })),
  };
}

module.exports = { summarize, readUsage, ils, modelLabel, whenLabel, USD_ILS, ROWS };
