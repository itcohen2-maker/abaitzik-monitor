/*
  Messages handed to the PC count as answered.

  7.10, Itzik on "המחשב מוסיף את זה עכשיו. תוך כמה דקות יגיע כאן אישור.":
  "מה אני צריך הודעה כזאת פה? סתם מיותר". When the PC is on, its own answer
  arrives a minute later, so the server session now writes nothing and the
  queued task (data/pc/pc, its re pointing at his message) is the proof that
  he will be answered. If the PC fails, pc-task.js fail writes that reply.
*/
const fs = require('fs');
const path = require('path');
const inst = require('./instance.js');

const DIR = path.join(inst.dataPath, 'pc', 'pc');

module.exports = function pcHanded() {
  const out = new Set();
  let files = [];
  try { files = fs.readdirSync(DIR); } catch (e) { return out; }
  files.filter((f) => f.endsWith('.json')).forEach((f) => {
    try {
      const t = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      if (t && t.re && !t.test && t.status !== 'failed') out.add(t.re);
    } catch (e) {}
  });
  return out;
};
