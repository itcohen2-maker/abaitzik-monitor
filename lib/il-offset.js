'use strict';
/*
  16.11.2026, Itzik: "ביקשתי להכין הצעת מחיר והוא מתעלם ממני". He was answered twice, but the
  prompts said "ISO עם +03:00" all year, so in winter every answer was stamped an hour before
  the question it answered and sat under it, out of sight. Israel's real offset for a moment:
  +02:00 in winter, +03:00 in summer.
*/
function ilOffset(d) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset' })
      .formatToParts(d || new Date()).find((x) => x.type === 'timeZoneName');
    const m = /GMT([+-])(\d{1,2})/.exec(p ? p.value : '');
    if (m) return m[1] + m[2].padStart(2, '0') + ':00';
  } catch (e) { /* an old Node without shortOffset */ }
  return '+02:00';
}
module.exports = { ilOffset };
