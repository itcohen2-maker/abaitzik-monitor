/*
  The savings rules, one source for every session.

  Itzik, 16.10.2026: "גם רינת וכל לקוח שלנו צריך לקבל סקריפט של חסכנות. צור
  סקיל ותצרף אותו לכל מוניטור". The skill is .claude/skills/saving/SKILL.md,
  synced to every tenant checkout with the code. Sessions do not reliably open
  a skill on their own, so the rules block of that file is read here and put
  into the prompt of every worker session and every PC task.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.claude', 'skills', 'saving', 'SKILL.md');

function rules() {
  try {
    const s = fs.readFileSync(FILE, 'utf8');
    const m = /<!-- rules:start -->([\s\S]*?)<!-- rules:end -->/.exec(s);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

// Lines for a prompt: the heading and the rules, or nothing when the file is missing.
function promptLines() {
  const r = rules();
  if (!r) return [];
  return ['כלל ברזל של חיסכון (סקיל saving, חל על כל סשן):', ...r.split('\n').map((l) => '  ' + l), ''];
}

module.exports = { FILE, rules, promptLines };
