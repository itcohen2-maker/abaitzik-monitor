'use strict';
/*
  Sends a notification to Itzik, through whichever channel is still standing.

  Usage: node notify.js "title" "message"
         node notify.js --budget          what is left today, and what is queued
         node notify.js --drain           retry whatever could not go out

  This used to post straight to ntfy and ignore the answer. On 13.9 that meant
  the daily quota ran out in complete silence and he found out by asking why
  the monitor had died. Everything now goes through lib/notify-channels.js,
  which counts what it spends, believes a service that says no, falls over to
  the next channel, and queues a message it cannot deliver rather than
  dropping it.

  What this cannot do is invent a channel. When the output says every channel
  is blocked, the message is on the queue and Itzik has not been told: say so
  out loud instead of assuming it arrived.
*/
const ch = require('./lib/notify-channels.js');

function line(b) {
  return Object.keys(b).map(function (k) {
    const c = b[k];
    const state = c.blockedUntil
      ? 'חסום עד ' + new Date(c.blockedUntil).toLocaleTimeString('he-IL')
      : (c.left + ' נותרו')
    return c.label + ': ' + c.used + '/' + c.cap + '  ' + state;
  }).join('\n');
}

(async () => {
  const args = process.argv.slice(2);

  if (args.includes('--budget')) {
    console.log(line(ch.budget()));
    console.log('בתור: ' + ch.queueLength());
    return;
  }
  if (args.includes('--drain')) {
    const r = await ch.drain();
    console.log('נשלחו ' + r.sent + ', נשארו ' + r.left);
    return;
  }

  const rest = args.filter(a => !a.startsWith('--'));
  const title = rest[0] || 'עדכון מהמוניטור';
  const body = rest.slice(1).join(' ') || title;

  const r = await ch.notify(title, body);
  if (r.ok) {
    console.log('נשלח דרך ' + r.channel);
  } else {
    console.log('!! לא נשלח לאף ערוץ. ההודעה בתור ותנוסה שוב.');
    console.log('!! ' + r.tried.join(' | '));
    // The third channel is not reachable from node: it is the Gmail connector,
    // which only exists inside a running Claude session. Proven working on
    // 13.9 while both of these were refusing. When this line prints, a session
    // should send the message itself rather than assume Itzik was told.
    console.log('!! ערוץ שלישי: מחבר Gmail דרך סשן קלוד. עובד, ולא תלוי בשני האלה.');
    process.exitCode = 2;
  }
})();
