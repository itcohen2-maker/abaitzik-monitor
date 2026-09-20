'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ML = require('../lib/monitor-logic.js');

// 20.9.2026: his screen showed nine messages stuck on "עובד על זה" from the day
// before, all of them already answered. These tests hold the line that an
// answered message closes itself and an unanswered one keeps pulsing.

test('an answered message of his closes even if the file still says working', () => {
  const out = ML.autoClose([
    { id: 'a1', at: '2026-09-19T05:18:00Z', from: 'itzik', text: 'עשית סיבוב רשתות?', status: 'working' },
    { id: 'r1', at: '2026-09-19T06:00:00Z', from: 'claude', re: 'a1', text: 'כן' },
  ]);
  const his = out.find(m => m.id === 'a1');
  assert.equal(his.status, 'done');
  assert.equal(his.doneAt, '2026-09-19T06:00:00Z');
});

test('a message with no answer stays open', () => {
  const out = ML.autoClose([
    { id: 'a1', at: '2026-09-19T05:18:00Z', from: 'itzik', text: 'שאלה', status: 'working' },
  ]);
  assert.equal(out[0].status, 'working');
  assert.equal(out[0].doneAt, undefined);
});

test('an answer that came before his message does not close it', () => {
  const out = ML.autoClose([
    { id: 'r0', at: '2026-09-19T04:00:00Z', from: 'claude', text: 'דוח' },
    { id: 'a1', at: '2026-09-19T05:18:00Z', from: 'itzik', re: 'r0', text: 'שאלה חדשה', status: 'received' },
  ]);
  assert.equal(out.find(m => m.id === 'a1').status, 'received');
});

test('an answer deeper in the thread still closes the root question', () => {
  const out = ML.autoClose([
    { id: 'a1', at: '2026-09-19T05:18:00Z', from: 'itzik', text: 'שאלה', status: 'working' },
    { id: 'a2', at: '2026-09-19T05:20:00Z', from: 'itzik', re: 'a1', text: 'עוד פרט', status: 'working' },
    { id: 'r1', at: '2026-09-19T05:40:00Z', from: 'claude', re: 'a2', text: 'תשובה' },
  ]);
  assert.equal(out.find(m => m.id === 'a1').status, 'done');
  assert.equal(out.find(m => m.id === 'a2').status, 'done');
});

test('a doneAt already on disk is kept', () => {
  const out = ML.autoClose([
    { id: 'a1', at: '2026-09-19T05:18:00Z', from: 'itzik', text: 'שאלה', status: 'working', doneAt: '2026-09-19T05:30:00Z' },
    { id: 'r1', at: '2026-09-19T06:00:00Z', from: 'claude', re: 'a1', text: 'תשובה' },
  ]);
  assert.equal(out.find(m => m.id === 'a1').doneAt, '2026-09-19T05:30:00Z');
});
