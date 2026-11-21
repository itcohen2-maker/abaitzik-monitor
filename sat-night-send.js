'use strict';
// 14.11.2026, Itzik approved both texts in chat, "רק במוצאי שבת". One run, from a systemd timer after Shabbat:
// 1. the public answer to the Instagram comment "אתם עושים במקומנו" (comment 18124762105902118, ad "שרפת קרדיטים")
// 2. one more Messenger message to Eran Ben Aroch, who did not answer since 11.11
// Each result goes to Itzik on WhatsApp. If Meta refuses the Messenger send (outside its messaging window),
// he gets the exact text to send himself. Nothing else is sent. Writes /home/monitor/sat-night-send.done so it never runs twice.
const fs = require('fs');
const path = require('path');
process.chdir('/home/monitor/abaitzik-monitor');
const DONE = '/home/monitor/sat-night-send.done';
if (fs.existsSync(DONE)) { console.log('already done'); process.exit(0); }
fs.writeFileSync(DONE, new Date().toISOString());
const G = 'https://graph.facebook.com/v23.0/';
const PAGE = '1341874565686928';
const SYS = fs.readFileSync('/home/monitor/.fb-leads-token-itsolution', 'utf8').replace(/[^A-Za-z0-9]/g, '');
const IG_COMMENT = '18124762105902118';
const IG_TEXT = 'כן, בדיוק. אנחנו ממשיכים מהמקום שבו נתקעת ומביאים את זה למוצר שעובד. שלחו לנו הודעה ונבדוק יחד.';
const ERAN_TEXT = 'היי ערן, רק מוודא שראית את ההודעה הקודמת. אם זה עדיין רלוונטי, אשמח לשמוע במה אתה צריך עזרה, או לתאם שיחה קצרה בטלפון.';
const wa = require('./lib/wa-out.js');

async function call(url, body) {
  const r = await fetch(url, body ? { method: 'POST', body: new URLSearchParams(body) } : undefined);
  return r.json();
}
function note(name, line) {
  try {
    const dir = path.join('data', 'biz', 'biz');
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f); const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (d.name !== name && d.srcKey !== name) continue;
      d.note = ((d.note || '') + ' ' + line).trim(); d.status = d.status === 'חדש' ? 'בשיחה' : d.status; d.updatedAt = new Date().toISOString();
      fs.writeFileSync(p, JSON.stringify(d, null, 2));
    }
  } catch (e) { console.log('!! note ' + e.message); }
}

(async () => {
  const out = [];
  // 1. Instagram comment
  const ig = await call(G + IG_COMMENT + '/replies', { message: IG_TEXT, access_token: SYS });
  if (ig && ig.id) { out.push('✅ אינסטגרם: ענינו לתגובה "אתם עושים במקומנו".'); note('igc:' + IG_COMMENT, 'מוצאי שבת 14.11: ענינו בתגובה: ' + IG_TEXT); }
  else out.push('⚠️ אינסטגרם: מטא לא קיבלה את התשובה (' + String((ig && ig.error && ig.error.message) || 'לא ידוע').slice(0, 120) + '). הנוסח: ' + IG_TEXT);

  // 2. Eran on Messenger
  const pt = await call(G + PAGE + '?fields=access_token&access_token=' + SYS);
  const P = pt && pt.access_token;
  let eranId = '';
  if (P) {
    const cv = await call(G + PAGE + '/conversations?platform=messenger&fields=participants&access_token=' + P);
    for (const c of (cv.data || [])) { const w = (c.participants.data || []).find((x) => x.name === 'Eran Ben Aroch'); if (w) eranId = w.id; }
  }
  let ok = false, why = '';
  if (P && eranId) {
    const r = await call(G + 'me/messages', { recipient: JSON.stringify({ id: eranId }), messaging_type: 'RESPONSE', message: JSON.stringify({ text: ERAN_TEXT }), access_token: P });
    ok = !!(r && r.message_id); why = (r && r.error && r.error.message) || '';
  } else why = 'לא נמצאה השיחה';
  if (ok) { out.push('✅ ערן: נשלחה לו עוד הודעה במסנג׳ר של הדף.'); note('Eran Ben Aroch', 'מוצאי שבת 14.11: נשלחה עוד הודעה במסנג׳ר.'); }
  else out.push('⚠️ ערן: מטא לא מאפשרת לשלוח לו עוד הודעה דרך המערכת (' + why.slice(0, 100) + '). אפשר לשלוח בעצמך מהטלפון, באפליקציה Meta Business Suite, בשיחה איתו:\n' + ERAN_TEXT);

  console.log(out.join('\n'));
  try { await wa.sendOwner('data', '🌙 מוצאי שבת, מה שאישרת:\n' + out.join('\n'), { kind: 'manager' }); } catch (e) { console.log('!! wa ' + e.message); }
  try { require('child_process').execFileSync(process.execPath, ['push.js', 'leads: saturday night replies'], { stdio: 'inherit', timeout: 300000 }); } catch (e) { /* the next round pushes */ }
})();
