'use strict';
/*
  10.11.2026, Itzik, for Dr. Shulman's clinic: "זה הכי חשוב לו, זה יהיה בראש האריחים".
  Three tiles, the data for them is built here and sealed into the page as D.clinic:

  🧪 gLab  the dental lab reports (lab-check.js stores data/lab/<lab>-<YYYYMM>.json): each month per lab, its works,
           and every duplicate (same patient, same tooth, same kind of work) across all stored reports.
  👩‍⚕️ gFrl  the freelance doctors, a tab each: per patient what he paid, the lab cost (taken from the lab reports by
           patient name in that month unless the line has its own), and the doctor's pay = rate x paid minus lab.
           Lines come from the daily work sheet photos: data/clinic/frl/<YYYYMMDD>-<slug>.json
           {doctor, date: "YYYY-MM-DD", rows: [{patient, treatment, paid, lab?}]}.
  📦 gSup  the suppliers, each with this month's invoices found in the sorted mail (data/biz-home/mail.json, sender or
           subject has the supplier's name) and his own note and "done" from data/clinic/sup/<YYYYMM>.json
           {"<supplier>": {note, done, at}}.

  Doctors, rate and suppliers come from data/clinic/setup.json when it exists, else from the setup form answers in
  profile.md ("הרופאים הפרילנסרים:", "פרטים על החישוב:", "רשימת הספקים:"). Patient data stays in data/, never in git.
*/
const fs = require('fs');
const path = require('path');
const lc = require('./lab-check.js');

function rd(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function ls(d) { try { return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort(); } catch (e) { return []; } }
function money(n) { n = Number(n); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function cleanName(s) { return String(s || '').replace(/^\s*(ד["״׳']?ר|דוקטור|dr\.?)\s*/i, '').trim(); }

const LAB_NAMES = { cti: 'קריאטיב טים אינסטרומנטס', newdent: 'ניו דנט', smiletech: 'סמייל טק' };

// From profile.md, the block the setup intake wrote.
function fromProfile(text) {
  const line = (k) => { const m = String(text || '').match(new RegExp('^- ' + k + ':\\s*(.+)$', 'm')); return m ? m[1].trim() : ''; };
  const split = (s) => s.split(/[;,،\n]+/).map((x) => x.trim()).filter(Boolean);
  const pct = line('פרטים על החישוב').match(/(\d+(?:\.\d+)?)\s*(?:%|אחוז)/);
  return {
    doctors: split(line('הרופאים הפרילנסרים')),
    rate: pct ? Number(pct[1]) / 100 : 0.4,
    labMinus: /פחות\s+עלות\s+מעבדה|פחות\s+מעבדה/.test(line('פרטים על החישוב')) || !line('פרטים על החישוב'),
    suppliers: split(line('רשימת הספקים')),
    labs: split(line('המעבדות שאתה עובד איתן')),
  };
}

function setupOf(dataPath) {
  const prof = (() => { try { return fs.readFileSync(path.join(dataPath, 'profile.md'), 'utf8'); } catch (e) { return ''; } })();
  const p = fromProfile(prof);
  const s = rd(path.join(dataPath, 'clinic', 'setup.json'), {}) || {};
  return {
    doctors: Array.isArray(s.doctors) && s.doctors.length ? s.doctors : p.doctors,
    rate: typeof s.rate === 'number' ? s.rate : p.rate,
    labMinus: typeof s.labMinus === 'boolean' ? s.labMinus : p.labMinus,
    suppliers: Array.isArray(s.suppliers) && s.suppliers.length ? s.suppliers : p.suppliers,
    labs: p.labs,
  };
}

function labPart(dataPath) {
  const docs = [];
  const months = [];
  for (const f of ls(path.join(dataPath, 'lab'))) {
    const j = rd(path.join(dataPath, 'lab', f), null);
    if (!j || !j.docs) continue;
    let total = 0, works = 0;
    const lines = [];
    for (const [no, d0] of Object.entries(j.docs)) {
      const d = Object.assign({ no, lab: j.lab, lines: [] }, d0);
      docs.push(d);
      for (const l of d.lines || []) {
        total += Number(l.total) || 0;
        if (!l.addon) works++;
        lines.push({ doc: d.no || no, date: d.date || '', patient: l.patient || '', work: l.work || l.desc || '', teeth: l.teeth || [], total: money(l.total), addon: !!l.addon });
      }
    }
    months.push({ lab: j.lab, labName: LAB_NAMES[j.lab] || j.lab, month: j.month, docs: Object.keys(j.docs).length, works, total: money(total), lines });
  }
  // every duplicate across all stored reports, each pair once
  const byKey = new Map();
  for (const d of docs) for (const e of lc.entriesOf({ lines: (d.lines || []).map((l) => Object.assign({ teeth: [] }, l)), no: d.no, date: d.date, lab: d.lab })) {
    if (!byKey.has(e.key)) byKey.set(e.key, []);
    byKey.get(e.key).push(e);
  }
  const dups = [];
  for (const list of byKey.values()) if (list.length > 1) dups.push({ patient: list[0].patient, tooth: list[0].tooth, work: list[0].work, where: list.map((e) => ({ lab: LAB_NAMES[e.lab] || e.lab, doc: e.doc, date: e.date || '', line: e.line })) });
  months.sort((a, b) => (b.month + b.lab).localeCompare(a.month + a.lab));
  return { months, dups };
}

// lab cost per patient per month (YYYYMM), from the lab reports
function labCostIndex(lab) {
  const idx = {};
  for (const m of lab.months) for (const l of m.lines) {
    const k = m.month + '|' + lc.norm(l.patient).split(' ').sort().join(' ');
    idx[k] = money((idx[k] || 0) + (Number(l.total) || 0));
  }
  return idx;
}

function frlPart(dataPath, setup, lab) {
  const idx = labCostIndex(lab);
  const rows = [];
  const used = {}; // a patient's lab cost of a month comes off once, on his first visit that month, not on every visit
  for (const f of ls(path.join(dataPath, 'clinic', 'frl'))) {
    const j = rd(path.join(dataPath, 'clinic', 'frl', f), null);
    if (!j || !Array.isArray(j.rows)) continue;
    for (const r of j.rows) {
      const paid = money(r.paid);
      const month = String(j.date || '').slice(0, 7).replace('-', '');
      const k = month + '|' + lc.norm(r.patient).split(' ').sort().join(' ');
      const auto = used[k] ? 0 : idx[k];
      if (auto) used[k] = true;
      const labCost = typeof r.lab === 'number' ? money(r.lab) : (setup.labMinus ? money(auto || 0) : 0);
      rows.push({
        doctor: String(j.doctor || ''), date: String(j.date || ''), patient: String(r.patient || ''), treatment: String(r.treatment || ''),
        paid, lab: labCost, labFrom: typeof r.lab === 'number' ? 'sheet' : (auto ? 'lab' : ''),
        pay: money(paid * setup.rate - (setup.labMinus ? labCost : 0)), file: f,
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  // a doctor in the sheets who is not in the list still gets a tab
  const names = setup.doctors.slice();
  for (const r of rows) if (r.doctor && !names.some((n) => cleanName(n) === cleanName(r.doctor))) names.push(r.doctor);
  return { doctors: names, rate: setup.rate, labMinus: setup.labMinus, rows };
}

function supPart(dataPath, setup, now) {
  const d = new Date(now || Date.now());
  const ym = d.toISOString().slice(0, 7);
  const mail = rd(path.join(dataPath, 'biz-home', 'mail.json'), []);
  const list = Array.isArray(mail) ? mail : Object.values(mail || {});
  const state = rd(path.join(dataPath, 'clinic', 'sup', ym.replace('-', '') + '.json'), {}) || {};
  const out = setup.suppliers.map((name) => {
    const n = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
    // a short latin name (GC) must stand alone, or it is found inside every other word
    const re = new RegExp((/^[a-z0-9 ]+$/.test(n) ? '(^|[^a-z0-9])' : '') + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (/^[a-z0-9 ]+$/.test(n) ? '($|[^a-z0-9])' : ''), 'i');
    const found = list.filter((m) => m && String(m.at || '').slice(0, 7) === ym
      && (re.test(String(m.from || '')) || re.test(String(m.subject || ''))))
      .map((m) => ({ at: m.at, subject: String(m.subject || '').slice(0, 120), from: String(m.from || '').replace(/<[^>]*>/g, '').trim().slice(0, 60) }));
    const s = state[name] || {};
    return { name, found, note: String(s.note || ''), done: !!s.done, at: s.at || '' };
  });
  return { month: ym, list: out };
}

function payload(dataPath, now) {
  const setup = setupOf(dataPath);
  const lab = labPart(dataPath);
  return { lab, frl: frlPart(dataPath, setup, lab), sup: supPart(dataPath, setup, now), labs: setup.labs };
}

module.exports = { payload, fromProfile, setupOf, labPart, frlPart, supPart, labCostIndex, cleanName };
