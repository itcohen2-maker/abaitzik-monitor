'use strict';
/*
  22.11.2026: keeps a helper process of the listener alive. The booking agent (lib/book-agent-proc.js) runs as its OWN process,
  started by the tenant's listener with the same user, so the listener's synchronous work (spawnSync, a sync wait for a lock)
  can never make the public booking page time out. It is restarted with a growing delay when it dies, and stopped with the listener.
  An exit with code 0 means "nothing to do here" (no socket folder yet, bookings off) and is not restarted.

  supervise({ spawn, log, delays }) -> { stop(), child() }   spawn() returns a child process (or anything with on('exit') and kill()).
*/
function supervise(o) {
  const delays = o.delays || [1000, 2000, 5000, 10000, 30000, 60000];
  const log = o.log || (() => {});
  let child = null, stopped = false, fails = 0, timer = null;
  function start() {
    if (stopped) return;
    const t0 = Date.now();
    try { child = o.spawn(); } catch (e) { child = null; log('!! תורים: הסוכן לא הופעל: ' + e.message); fails++; timer = setTimeout(start, delays[Math.min(fails - 1, delays.length - 1)]); if (timer.unref) timer.unref(); return; }
    child.on('exit', (code) => {
      child = null;
      if (stopped || code === 0) return;
      fails = Date.now() - t0 > 60000 ? 1 : fails + 1; // a long run before the crash starts the backoff over
      const d = delays[Math.min(fails - 1, delays.length - 1)];
      log('!! תורים: הסוכן נעצר (קוד ' + code + '), עולה שוב בעוד ' + Math.round(d / 1000) + ' שניות');
      timer = setTimeout(start, d); if (timer.unref) timer.unref();
    });
    child.on('error', () => { /* the exit event follows */ });
  }
  start();
  return { stop() { stopped = true; clearTimeout(timer); if (child) { try { child.kill(); } catch (e) { /* gone */ } } }, child: () => child };
}
module.exports = { supervise };
