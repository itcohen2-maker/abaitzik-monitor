/*
  Messages handed to the PC count as answered.

  7.10, Itzik on "המחשב מוסיף את זה עכשיו. תוך כמה דקות יגיע כאן אישור.":
  "מה אני צריך הודעה כזאת פה? סתם מיותר". When the PC is on, its own answer
  arrives a minute later, so the server session now writes nothing and the
  queued task (data/pc/pc, its re pointing at his message) is the proof that
  he will be answered. If the PC fails, pc-task.js fail writes that reply.

  20.11.2026: one PC task can answer several of his messages (one shopping run
  for two voice notes). Its re is the first; alsoRe holds the rest, so each one
  counts as handed and no session takes it again.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const DIR = path.join(inst.dataPath, 'pc', 'pc');

// The ids a list of PC task records hands to the PC (failed or test tasks count for none).
function handedIds(tasks) {
  const out = new Set();
  (tasks || []).forEach((t) => {
    if (!t || t.test || t.status === 'failed') return;
    if (t.re) out.add(t.re);
    (Array.isArray(t.alsoRe) ? t.alsoRe : []).forEach((id) => { if (id) out.add(id); });
  });
  return out;
}

module.exports = function pcHanded() {
  const tasks = [];
  let files = [];
  try { files = fs.readdirSync(DIR); } catch (e) { return new Set(); }
  files.filter((f) => f.endsWith('.json')).forEach((f) => {
    try { tasks.push(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))); } catch (e) {}
  });
  return handedIds(tasks);
};
module.exports.handedIds = handedIds;
