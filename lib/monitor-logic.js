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

  // Moxypen, 8.10: one extra dose at 18:00 that day, then 00:00, 08:00 and
  // 16:00 every day from the 9th. Wall clock hours, so the browser and the
  // server (run with TZ=Asia/Jerusalem) agree across the winter clock change.
  // Itzik, 14.10: "keeps blinking, stop it". The course ends then: no dose, no blink, no push.
  var MOXY_HOURS = [0, 8, 16];
  var MOXY_END = new Date(2026, 9, 14, 9, 0, 0, 0).getTime();
  function moxySlots(nowMs) {
    if (nowMs >= MOXY_END) return { last: 0, next: 0, ended: true };
    var first = new Date(2026, 9, 8, 18, 0, 0, 0).getTime();
    var last = 0, next = first;
    if (nowMs >= first) {
      last = first;
      var d = new Date(nowMs);
      for (var back = 0; back < 2 && last === first; back++) {
        var day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
        for (var i = MOXY_HOURS.length - 1; i >= 0; i--) {
          var t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), MOXY_HOURS[i]).getTime();
          if (t <= nowMs && t > first) { last = t; break; }
        }
      }
      next = 0;
      var base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      for (var k = 0; k < 2 && !next; k++) {
        for (var j = 0; j < MOXY_HOURS.length; j++) {
          var u = new Date(base.getFullYear(), base.getMonth(), base.getDate() + k, MOXY_HOURS[j]).getTime();
          if (u > nowMs && u > first) { next = u; break; }
        }
      }
    }
    return { last: last, next: next };
  }

  function keyOf(m) {
    if (!m) return '';
    if (m.id) return String(m.id);
    return (m.at || '') + '|' + String(m.text || '').slice(0, 40);
  }

  function byAt(a, b) { return (a.at || '') < (b.at || '') ? -1 : 1; }

  // Follows re upward until it reaches a message with no re (the root). A
  // broken link or a cycle stops the walk and the message keeps the last
  // id that existed, so nothing is ever dropped.
  function rootKeyOf(m, byKey) {
    var k = keyOf(m);
    var seen = {};
    var cur = m;
    while (cur && cur.re && byKey[cur.re] && !seen[cur.re]) {
      seen[cur.re] = true;
      k = cur.re;
      cur = byKey[cur.re];
    }
    return k;
  }

  // One thread per root. A message with re pointing to an existing message
  // (however deep the chain) joins that root's thread; a message with re
  // pointing at nothing stands alone, so a typo in re never hides a message.
  function splitThreads(chat) {
    var list = (chat || []).slice().sort(byAt);
    var byKey = {};
    list.forEach(function (m) { byKey[keyOf(m)] = m; });
    var roots = {};
    var order = [];
    list.forEach(function (m) {
      var rk = rootKeyOf(m, byKey);
      if (!roots[rk]) {
        var rootMsg = byKey[rk] || m;
        roots[rk] = { key: rk, root: rootMsg, msgs: [], last: '' };
        order.push(rk);
      }
      var t = roots[rk];
      t.msgs.push(m);
      if ((m.at || '') > t.last) t.last = m.at || '';
    });
    return order.map(function (k) {
      roots[k].msgs.sort(byAt);
      return roots[k];
    });
  }

  // 20.9.2026: nine of his messages sat on "עובד על זה", 60%, for a whole day,
  // because the status only ever moved when the answering session remembered to
  // move it. He saw a monitor that looks abandoned and asked how he is supposed
  // to sell that. So the screen stops trusting anyone's bookkeeping: a message
  // of his that already has an answer from me after it, in its own thread, is
  // done, whatever the file on disk says. Nothing is invented here, the answer
  // has to exist. Messages with no answer keep pulsing, which is the point.
  //
  // 4.10.2026, Itzik with a screenshot: "כפתור לא עובד מה בעבודה". Every
  // session writes a first short reply within two minutes, and that reply was
  // enough to close his message, so "in work now" stayed empty while sessions
  // were running on it. A message a live session still holds stays open.
  function autoClose(chat, busy) {
    var held = {};
    (busy || []).forEach(function (id) { held[id] = true; });
    var byKey = {};
    (chat || []).forEach(function (m) { byKey[keyOf(m)] = m; });
    var answeredAt = {};
    (chat || []).forEach(function (m) {
      if (m.from !== 'claude') return;
      var root = rootKeyOf(m, byKey);
      if (!answeredAt[root] || (m.at || '') > answeredAt[root]) answeredAt[root] = m.at || '';
    });
    return (chat || []).map(function (m) {
      if (m.from !== 'itzik' || m.status === 'done') return m;
      if (m.id && held[m.id]) return m;
      var when = answeredAt[rootKeyOf(m, byKey)];
      if (!when || when <= (m.at || '')) return m;
      var out = {};
      Object.keys(m).forEach(function (k) { out[k] = m[k]; });
      out.status = 'done';
      out.doneAt = m.doneAt || when;
      return out;
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

  // The newest report for each of the given networks, newest first, one per
  // report even if it covers several of them.
  function latestPerNet(reports, nets) {
    var sorted = reports.slice().sort(function (a, b) { return String(a.at) < String(b.at) ? 1 : -1; });
    var out = [];
    nets.forEach(function (k) {
      for (var i = 0; i < sorted.length; i++) {
        if ((sorted[i].nets || []).indexOf(k) > -1) {
          if (out.indexOf(sorted[i]) < 0) out.push(sorted[i]);
          return;
        }
      }
    });
    return out.sort(function (a, b) { return String(a.at) < String(b.at) ? 1 : -1; });
  }

  // Rinat's project sheet (14.10). A request under a topic starts with
  // "פרויקט <title> / <topic>: ". A follow-up on a result starts with
  // "הערה לשיפור על הבקשה מ<stamp>: " and belongs to that one request. The
  // server adds a kind line "פרויקט" on top and a "קוד" tail; neither is the
  // client's own text, so both are stripped here.
  var DEFAULT_TOPICS = ['מצגת', 'לוחות השראה', 'הדמיות'];
  var GENERAL_TOPIC = 'כללי';

  function projTopicOf(text) {
    var t = String(text == null ? '' : text).replace(/\r/g, '');
    t = t.replace(/^\s*פרויקט\s*\n/, '');
    t = t.replace(/\n\s*\n\s*קוד[\s\S]*$/, '').trim();
    var m = /^פרויקט\s+([^:：\n]+?)\s*[:：]\s*([\s\S]*)$/.exec(t);
    if (!m) return null;
    var head = m[1].trim();
    var body = m[2].trim();
    var project = head, topic = '';
    var k = head.lastIndexOf(' / ');
    if (k > -1) {
      project = head.slice(0, k).trim();
      topic = head.slice(k + 3).trim();
    }
    var followOf = '';
    var f = /^הערה לשיפור על הבקשה מ(\d{1,2}\.\d{1,2} \d{1,2}:\d{2})\s*[:：]\s*([\s\S]*)$/.exec(body);
    if (f) {
      followOf = f[1];
      body = f[2].trim();
    }
    return { project: project, topic: topic, body: body, followOf: followOf };
  }

  function cmpAt(a, b) {
    var x = (a && a.at) || '', y = (b && b.at) || '';
    return x < y ? -1 : (x > y ? 1 : 0);
  }

  // The board of one project, as the sheet draws it. Rows are the client's
  // requests (newest first); each carries the results Claude gave to it and
  // the follow-ups on it, oldest first, each with its own results. A follow-up
  // is matched to its request by the stamp it quotes, so a follow-up whose
  // request is not in the list is kept as a row of its own, never dropped.
  function projBoard(chat, pending, project, stampFn) {
    var proj = project || {};
    var title = String(proj.title || '');
    var fmt = typeof stampFn === 'function' ? stampFn : function (iso) { return String(iso || ''); };
    var list = [];
    var keyAt = {};
    (chat || []).forEach(function (m) {
      if (!m || m.from !== 'itzik') return;
      list.push(m);
      var p = projTopicOf(m.text);
      if (!p) return;
      var k = p.project + '|' + p.topic + '|' + p.followOf + '|' + p.body;
      (keyAt[k] = keyAt[k] || []).push(Date.parse(m.at || '') || 0);
    });
    // A message still pending is shown until the server echoes it back.
    (pending || []).forEach(function (q) {
      if (!q || !q.text) return;
      var p = projTopicOf(q.text);
      if (!p) return;
      var k = p.project + '|' + p.topic + '|' + p.followOf + '|' + p.body;
      var at = Date.parse(q.at || '') || 0;
      var echoed = (keyAt[k] || []).some(function (c) { return c >= at - 300000; });
      if (!echoed) list.push(Object.assign({}, q, { from: 'itzik', id: q.id || '', pend: true }));
    });
    var reqs = [], fus = [];
    list.slice().sort(cmpAt).forEach(function (m) {
      var p = projTopicOf(m.text);
      if (!p || p.project !== title) return;
      (p.followOf ? fus : reqs).push({ msg: m, p: p });
    });
    var claude = (chat || []).filter(function (m) { return m && m.from === 'claude'; }).sort(cmpAt);
    function resultsFor(id) {
      if (!id) return [];
      return claude.filter(function (m) { return m.re === id; });
    }

    var declared = Array.isArray(proj.topics) && proj.topics.length ? proj.topics : DEFAULT_TOPICS;
    var topics = [], byTitle = {};
    function topicFor(name, icon) {
      if (!byTitle[name]) {
        byTitle[name] = { title: name, icon: icon || '', rows: [] };
        topics.push(byTitle[name]);
      }
      return byTitle[name];
    }
    declared.forEach(function (t) {
      var name = String((typeof t === 'string' ? t : (t && (t.title || t.key))) || '').trim();
      if (!name || name === GENERAL_TOPIC) return;
      topicFor(name, t && typeof t === 'object' ? t.icon : '');
    });
    reqs.forEach(function (r) {
      var name = r.p.topic || GENERAL_TOPIC;
      if (name !== GENERAL_TOPIC) topicFor(name, '');
    });
    reqs.slice().reverse().forEach(function (r) {
      var name = r.p.topic || GENERAL_TOPIC;
      var row = { root: r.msg, results: resultsFor(r.msg.id), follows: [] };
      topicFor(name, '').rows.push(row);
    });
    var orphans = [];
    fus.forEach(function (f) {
      var name = f.p.topic || GENERAL_TOPIC;
      var host = null;
      topics.forEach(function (t) {
        if (t.title !== name) return;
        t.rows.forEach(function (row) {
          if (!host && f.p.followOf === fmt(row.root.at)) host = row;
        });
      });
      if (host) host.follows.push({ msg: f.msg, results: resultsFor(f.msg.id) });
      else orphans.push(f);
    });
    orphans.forEach(function (f) {
      var name = f.p.topic || GENERAL_TOPIC;
      topicFor(name, '').rows.push({ root: f.msg, results: resultsFor(f.msg.id), follows: [] });
    });
    // "כללי" is the place for requests with no topic, and it always comes last.
    var general = byTitle[GENERAL_TOPIC];
    if (general) {
      topics.splice(topics.indexOf(general), 1);
      topics.push(general);
    }
    topics.forEach(function (t) {
      t.rows.sort(function (a, b) { return cmpAt(b.root, a.root); });
      t.rows.forEach(function (row) { row.follows.sort(function (a, b) { return cmpAt(a.msg, b.msg); }); });
    });
    return { topics: topics };
  }

  return {
    version: 1,
    latestPerNet: latestPerNet,
    PILL_GAP: PILL_GAP,
    timeOnDay: timeOnDay,
    resolveTaken: resolveTaken,
    parsePillTime: parsePillTime,
    pillState: pillState,
    moxySlots: moxySlots,
    keyOf: keyOf,
    rootKeyOf: rootKeyOf,
    splitThreads: splitThreads,
    autoClose: autoClose,
    threadStatus: threadStatus,
    orderThreads: orderThreads,
    projTopicOf: projTopicOf,
    projBoard: projBoard,
    DEFAULT_TOPICS: DEFAULT_TOPICS,
  };
});
