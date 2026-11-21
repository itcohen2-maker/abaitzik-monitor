'use strict';
/*
  13.11.2026: "מה המצב" on WhatsApp was sent to a session like any other message. The
  session sometimes ended with exit 0 and no answer, and the worker put it back in the
  queue ("הוחזרו לתור"). A status question is answered here, in code, from what the bridge
  knows, so no model has to decide to answer it.
*/
const ASK = /^\s*(?:וואטסאפ\s*)?מה המצב\s*[?!.؟]*\s*$/;

function isStatusAsk(t) { return ASK.test(String(t || '')); }

function hm(ms) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

// lastOwnAt: when the monitor last sent him a message (0 if none is on record).
// waiting: how many of his questions still wait for an answer.
function statusReply({ lastOwnAt, waiting }) {
  const n = Number(waiting) || 0;
  const last = lastOwnAt
    ? 'ההודעה האחרונה שיצאה ממני אליך: ' + hm(lastOwnAt) + ' שעון ישראל.'
    : 'לא מצאתי הודעה שיצאה ממני אליך.';
  return ['הוואטסאפ פעיל. השירות רץ עכשיו.', last, 'בקשות שעדיין מחכות לתשובה: ' + n + '.'].join('\n');
}

module.exports = { isStatusAsk, statusReply, hm };
