/*
  The lessons that cost something, one source for every session.

  Itzik, 17.10.2026: "תעלה לשרת כל תובנה שאתה חושב שבעתיד יעשה לי צרות, גם ללקוחות
  שלי". The skill is .claude/skills/lessons/SKILL.md, synced to every tenant with the
  code. Like lib/saving.js, its rules block is read here and put into the prompt of
  every worker session and every PC task, since sessions do not open skills on their own.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.claude', 'skills', 'lessons', 'SKILL.md');

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
  return ['לקחים שכבר עשו צרות (סקיל lessons, חל על כל סשן):', ...r.split('\n').map((l) => '  ' + l), ''];
}

module.exports = { FILE, rules, promptLines };
