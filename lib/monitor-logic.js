'use strict';
// Logic the page and the tests share. This file is inlined into the page at
// build time, so it must stay free of require(), DOM access and localStorage.
// In Node it is a normal module; in the browser it lands on window.ML.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else window.ML=factory();
})(function () {
  var PILL_GAP = 8 * 3600 * 1000;
  var DAY = 24 * 3600 * 1000;

  function parseHHMM(s) {
    var m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s || ''));
    if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return { h: h, m: mi };
  }

  function timeOnDay(hhmm, refMs) {
    var p = parseHHMM(hhmm);
    if (!p) return refMs;
    var d = new Date(refMs);
    d.setHours(p.h, p.m, 0, 0);
    return d.getTime();
  }

  // He reports after the fact. A time later than now cannot be today, so it
  // is read as yesterday: "לקחתי בשעה 23:30" said at 07:00 means last night.
  function resolveTaken(hhmm, nowMs) {
    if (!parseHHMM(hhmm)) return nowMs;
    var t = timeOnDay(hhmm, nowMs);
    if (t > nowMs) t -= DAY;
    return t;
  }

  function parsePillTime(text, atIso) {
    var at = Date.parse(atIso || '');
    if (isNaN(at)) return 0;
    var m = /בשעה\s+(\d{1,2}:\d{2})/.exec(String(text || ''));
    if (!m) return at;
    return resolveTaken(m[1], at);
  }

  function pillState(takenMs, nowMs, gapMs) {
    if (!takenMs) return { next: 0, left: 0, due: true };
    var gap = gapMs || PILL_GAP;
    var next = takenMs + gap;
    var left = next - nowMs;
    return { next: next, left: left, due: left <= 0 };
  }

  function keyOf(m) {
    if (!m) return '';
    if (m.id) return String(m.id);
    return (m.at || '') + '|' + String(m.text || '').slice(0, 40);
  }

  function byAt(a, b) { return (a.at || '') < (b.at || '') ? -1 : 1; }

  // One thread per root. A message with re pointing at a root joins it; a
  // message with re pointing at nothing stands alone, so a typo in re never
  // hides a message.
  function splitThreads(chat) {
    var list = (chat || []).slice().sort(byAt);
    var roots = {};
    var order = [];
    list.forEach(function (m) {
      if (m.re && roots[m.re]) return;
      var k = keyOf(m);
      roots[k] = { key: k, root: m, msgs: [m], last: m.at || '' };
      order.push(k);
    });
    list.forEach(function (m) {
      if (!m.re || !roots[m.re]) return;
      var t = roots[m.re];
      t.msgs.push(m);
      if ((m.at || '') > t.last) t.last = m.at || '';
    });
    return order.map(function (k) {
      roots[k].msgs.sort(byAt);
      return roots[k];
    });
  }

  function threadStatus(t, state) {
    var unread = (state && state.unread) || new Set();
    var standby = (state && state.standby) || {};
    var fresh = t.msgs.some(function (m) { return m.from === 'claude' && unread.has(keyOf(m)); });
    if (fresh) return 'fresh';
    var since = standby[t.key];
    if (since) {
      var answered = t.msgs.some(function (m) { return m.from === 'claude' && (m.at || '') > since; });
      if (!answered) return 'standby';
    }
    return 'done';
  }

  var RANK = { fresh: 0, standby: 1, done: 2 };
  function orderThreads(threads, state) {
    var rows = threads.map(function (t) { return { status: threadStatus(t, state), thread: t }; });
    rows.sort(function (a, b) {
      if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
      return a.thread.last < b.thread.last ? 1 : -1;
    });
    rows.forEach(function (r, i) { r.n = i + 1; });
    return rows;
  }

  return {
    version: 1,
    PILL_GAP: PILL_GAP,
    timeOnDay: timeOnDay,
    resolveTaken: resolveTaken,
    parsePillTime: parsePillTime,
    pillState: pillState,
    keyOf: keyOf,
    splitThreads: splitThreads,
    threadStatus: threadStatus,
    orderThreads: orderThreads,
  };
});
