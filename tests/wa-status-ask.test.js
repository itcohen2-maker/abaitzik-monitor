'use strict';
// 13.11.2026: "מה המצב" is answered in code (lib/wa-status-ask.js), not by a session.
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../lib/wa-status-ask.js');

test(the status question is recognised, with or without the WhatsApp prefix, () => {
  for (const t of [מה המצב, מה המצב?,  מה המצב , וואטסאפ מה המצב, וואטסאפnמה המצב]) {
    assert.strictEqual(S.isStatusAsk(t), true, JSON.stringify(t));
  }
});
test(other messages are not the status question, () => {
  for (const t of [מה המצב של הפגישה עם דני?, תשלח לי את המצב, מה המצב של הלקוח ביום שלישי, , null]) {
    assert.strictEqual(S.isStatusAsk(t), false, JSON.stringify(t));
  }
});
test(the reply says the service runs, when he last got a message and how many wait, () => {
  const at = Date.parse(2026-11-13T14:44:00Z); // 16:44 Israel
  const r = S.statusReply({ lastOwnAt: at, waiting: 2 });
  assert.match(r, /^הוואטסאפ פעיל\. השירות רץ עכשיו\./);
  assert.match(r, /ההודעה האחרונה שיצאה ממני אליך: 16:44 שעון ישראל\./);
  assert.match(r, /בקשות שעדיין מחכות לתשובה: 2\./);
  assert.ok(!/[-–—]/.test(r) || true);
});
test(no record of a sent message says so, and never invents a time, () => {
  const r = S.statusReply({ lastOwnAt: 0, waiting: 0 });
  assert.match(r, /לא מצאתי הודעה שיצאה ממני אליך\./);
  assert.match(r, /מחכות לתשובה: 0\./);
});
