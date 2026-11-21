'use strict';
/*
  16.11.2026: is a public comment someone asking for something (a lead), or just a reaction?
  Rules only, no model: a stranger's words never reach a session (prompt injection, see mail-read.js).
  A comment that asks for details, a price, a meeting, a lecture, the monitor, or says it wrote in private is a lead.
  Praise, emoji and "אמן" are not.
*/
const ASK = new RegExp([
  'פרטים', 'פרטיים', 'מחיר', 'כמה (?:זה )?(?:עולה|עולים|כסף)', 'עלות', 'מעוניי[ןנ]ת?', 'מתעניי[ןנ]ת?',
  'אשמח (?:ל|ש|לשמוע|לפרטים)', 'רוצה (?:להצטרף|לשמוע|לקבוע|לדעת|לנסות|את זה|גם|פרטים)', 'רוצים (?:להצטרף|לשמוע|לקבוע|גם)',
  'איך (?:מצטרפים|נרשמים|מזמינים|אפשר|עושים את זה|מגיעים)', 'הרצא', 'להזמין', 'לקבוע', 'טלפון', 'ו?ואטסאפ', 'וואצאפ', 'צור קשר',
  'מוניטור', 'בפרטי', 'בפרטיות', 'שלחתי (?:לך )?(?:הודעה|פרטי)', 'תשלח(?:ו)? לי', 'שלח(?:ו)? לי', 'תחזור אלי', 'תחזרו אלי',
  'אפשר (?:מספר|פרטים|לדבר)', 'יש לכם', 'אתם עושים', 'מה (?:המחיר|העלות)', '\\bdm\\b', '\\binfo\\b', 'price', 'how much', 'interested',
].join('|'), 'i');

function isLead(text) {
  const t = String(text || '').trim();
  if (t.length < 3) return false;
  return ASK.test(t);
}

module.exports = { isLead };
