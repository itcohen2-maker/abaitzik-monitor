'use strict';
// 22.11.2026: the booking agent as its own process (lib/book-supervisor.js keeps it alive for the tenant's listener).
// Run from the monitor's folder as the tenant's own user: node lib/book-agent-proc.js
// MONITOR_BOOK_SOCKDIR is only for tests (another folder for the socket). Logs carry ids only, never a name or a phone.
const inst = require('./instance.js');
const ui = require('./bookings-ui.js');
const Agent = require('./book-agent.js');
let started = null;
try {
  if (inst.bookings === true && ui.enabled(inst)) started = Agent.start({ inst, dataPath: inst.dataPath, sockDir: process.env.MONITOR_BOOK_SOCKDIR || undefined, log: (l) => console.log(l) });
} catch (e) { console.error('book agent: ' + e.message); process.exit(1); }
if (!started) process.exit(0); // bookings off, or the socket folder is not made yet: nothing to do, and no restart
process.on('SIGTERM', () => { try { started.server.close(); } catch (e) { /* closed */ } process.exit(0); });
