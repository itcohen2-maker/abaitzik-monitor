'use strict';
// 17.10, Itzik: "כן תעביר אותה לסונט. אלא אם כן היא צריכה תלת מימד או משהו שמצריך מודל
// מתאים יותר". A monitor whose /etc/<id>.env sets MONITOR_PLAN_MODEL plans on that model
// (Rinat: Sonnet, about 40% cheaper than Opus at list price). A batch that asks for 3D,
// a render, a design or anything visual is planned on MONITOR_PLAN_HEAVY (Opus by
// default), because a weak plan there costs a whole wasted run on her computer.
const HEAVY = /תלת|3d|הדמי|רנדר|render|blender|עיצו|מעצב|מצג|psd|פוטושופ|photoshop|אילוסטרייטור|illustrator|ויזואל|סקיצ|הדפס|טקסטיל|קולקצי|לוגו|פלטה|גוון|תמונ|צילום/i;

function isHeavy(text) {
  return HEAVY.test(String(text || ''));
}

function pick(text, env) {
  const e = env || process.env;
  const heavy = e.MONITOR_PLAN_HEAVY || 'claude-opus-5-5';
  const base = e.MONITOR_PLAN_MODEL || 'claude-opus-5-5';
  return isHeavy(text) ? heavy : base;
}

module.exports = { isHeavy, pick };
