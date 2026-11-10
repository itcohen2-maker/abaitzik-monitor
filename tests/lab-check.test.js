'use strict';
// 10.11.2026: tests for lib/lab-check.js. Every name here is invented.
const { test } = require('node:test');
const assert = require('node:assert');
const lc = require('../lib/lab-check.js');

function note(no, date, rows, sub) {
  const head = 'CTI Creative Team Instruments  קריאטיב טים אינסטרומנטס בע"מ\nמספר:' + no + '\nתאריך:' + date + '\n';
  const body = rows.map((r, i) => {
    const [total, unit, qty, desc, item] = r;
    return `   ${total}   ${unit}   ${qty}      ${desc}      ${item} ${i + 1}`;
  }).join('\n');
  return head + body + '\n  ' + sub + '   סה"כ ללא מע"מ:    77.00\n';
}
const T = '‫';

test('teeth: a range follows the arch across the midline', () => {
  assert.deepEqual(lc.expandTeeth(['13-27']).teeth, [13, 12, 11, 21, 22, 23, 24, 25, 26, 27]);
  assert.deepEqual(lc.expandTeeth(['31-42']).teeth, [31, 41, 42]);
  assert.deepEqual(lc.expandTeeth(['24-26', '14', '13']).teeth, [24, 25, 26, 14, 13]);
  assert.deepEqual(lc.expandTeeth(['46', '45']).teeth, [46, 45]);
  assert.equal(lc.expandTeeth(['13-37']).ok, false);
});

test('a line is parsed into work type, patient and teeth, add-ons attach above', () => {
  const doc = lc.parseCti(note('09/000001', '03/11/2026', [
    ['180.00', '90.00', '2.00', 'כתר זמני מוברג אלמוני דוד 46 45', 34],
    ['550.00', '550.00', '1.00', 'כתר זירקוניה מוברג ללא T BASE פלונית רחל 25', 64],
    ['70.00', '70.00', '1.00', 't base', 5],
    ['2,500.00', '500.00', '5.00', '44 34 31-42      כתר זירקוניה בדויה שרה', 74],
  ], '3,300.00'));
  assert.equal(doc.no, '09/000001');
  assert.equal(doc.date, '2026-11-03');
  assert.equal(doc.lines.length, 4);
  assert.equal(doc.lines[0].patient, 'אלמוני דוד');
  assert.equal(doc.lines[0].work, 'כתר זמני מוברג');
  assert.deepEqual(doc.lines[0].teeth, [46, 45]);
  assert.equal(doc.lines[1].work, 'כתר זירקוניה מוברג ללא T BASE');
  assert.equal(doc.lines[2].addon, true);
  assert.equal(doc.lines[2].patient, 'פלונית רחל');
  assert.deepEqual(doc.lines[3].teeth, [44, 34, 31, 41, 42]);
  assert.equal(doc.lines[3].qtyMismatch, undefined);
  assert.equal(doc.unparsed.length, 0);
});

test('same patient, tooth and work type is a duplicate; another work type is not', () => {
  const a = lc.parseCti(note('09/000001', '03/10/2026', [['500.00', '500.00', '1.00', 'כתר זירקוניה אלמוני דוד 36', 74]], '500.00'));
  const b = lc.parseCti(note('09/000002', '03/11/2026', [
    ['500.00', '500.00', '1.00', 'כתר זירקוניה דוד אלמוני 36', 74],   // same everything, name order swapped
    ['80.00', '80.00', '1.00', 'כתר זמני בחריטה אלמוני דוד 36', 3],   // same tooth, other work
    ['500.00', '500.00', '1.00', 'כתר זירקוניה פלונית רחל 36', 74],    // other patient
  ], '1,080.00'));
  const d = lc.findDuplicates(b, [a]);
  assert.equal(d.length, 1);
  assert.equal(d[0].tooth, 36);
  assert.equal(d[0].before[0].doc, '09/000001');
});

test('a duplicate inside one note is found', () => {
  const a = lc.parseCti(note('09/000003', '03/11/2026', [
    ['500.00', '500.00', '1.00', 'כתר זירקוניה אלמוני דוד 14', 74],
    ['500.00', '500.00', '1.00', 'כתר זירקוניה אלמוני דוד 14', 74],
  ], '1,000.00'));
  const d = lc.findDuplicates(a, []);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].now, [1, 2]);
});

test('report: no dashes, no duplicates wording, totals check, bidi marks are ignored', () => {
  const a = lc.parseDoc(T + note('09/000004', '03/11/2026', [
    ['800.00', '80.00', '10.00', 'כתר זמני בחריטה אלמוני דוד 13-27', 3],
  ], '800.00'));
  const rep = lc.buildReport(a, lc.findDuplicates(a, []), Date.parse('2026-11-10T10:00:00Z'));
  assert.match(rep.at, /^2026-11-10T1\d:00:00\+02:00$/);
  assert.match(rep.body, /לא נמצאו כפילויות/);
  assert.match(rep.body, /הסכום תואם/);
  assert.match(rep.body, /^מעבדה: קריאטיב טים אינסטרומנטס/);
  assert.doesNotMatch(rep.body + rep.title, /[-‐-―]/);
});

test('totals mismatch and unreadable numbering are reported, never silently dropped', () => {
  const text = note('09/000005', '03/11/2026', [['100.00', '100.00', '1.00', 'כתר זירקוניה אלמוני דוד 14', 74]], '999.00')
    .replace(/ 1\n/, ' 2\n');
  const doc = lc.parseDoc(text);
  const rep = lc.buildReport(doc, [], Date.now());
  assert.match(rep.body, /לא תואם/);
  assert.match(rep.body, /שורה 1: לא נקראה/);
});

test('an unknown lab is marked as read with the general template', () => {
  const doc = lc.parseDoc('מעבדת הדמיה\n');
  const rep = lc.buildReport(doc, [], Date.now());
  assert.equal(doc.fallback, true);
  assert.match(rep.body, /לא נקראה אף שורה/);
});
