'use strict';
/*
  24.10.2026, Itzik: "יהיה אריח של חיבור חשבון הבנק אבל זה לא יופיע במסכים אלא אם כן
  הלקוח יבקש. והכל יהיה מוכן".

  A feature a customer can ask for. instance.json is locked on the server, so the
  switch lives in the customer's own data: data/status/features.json, {"bank":true}.
  build.js puts it in the payload (sealed with the gate on) as D.features, and the
  page shows the tile only when its flag is true. The flag is written by the worker
  once Itzik approves the request (change-requests.applyApproved), nobody else.
*/
const fs = require('fs');
const path = require('path');

// 24.10.2026: 'morning' turns on the Morning (Green Invoice) read for money.js. Off until Itzik approves.
// 24.10.2026, Itzik: 'money' shows the bank, debtors and forecast (folded on the home screen, and in
// the morning brief) only for a customer who asked. Seeing debts every morning is not calming.
// 10.11.2026: 'wa' shows the WhatsApp row in a customer's 🔌 connections, only after Meta approves (Itzik).
// 12.11.2026: 'waOwn' also offers the customer's own number (Kapso setup) next to the quick connect. Off: Kapso Pro is not paid yet.
const KNOWN = ['bank', 'morning', 'money', 'wa', 'waOwn'];
const file = (dataPath) => path.join(dataPath, 'status', 'features.json');

/*
  4.11.2026, Itzik: "לגבי הבנק, רק במוניטור שלי אני מחבר אותו לבנק. במוניטור של
  הלקוחות אני לא מחבר." So the bank is decided by whose monitor this is, not by a
  request: on in Itzik's own monitor (instance name 'abaitzik'), off in every
  customer's, whatever their features.json says. Without a name (old callers,
  tests) the file decides, as before.
*/
const OWNER = 'abaitzik';
function read(dataPath, instName) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(file(dataPath), 'utf8')); } catch (e) { /* none yet: all off */ }
  const out = {};
  KNOWN.forEach((k) => { out[k] = !!(j && j[k] === true); });
  if (instName) { out.bank = instName === OWNER; out.fastChat = true; out.conn = true; } // 7.11: Itzik, "שכל המוניטורים מקבלים" the chat and 🔌 // 7.11: fast chat only in Itzik's own monitor
  return out;
}

function enable(dataPath, name) {
  if (KNOWN.indexOf(name) < 0) throw new Error('unknown feature ' + name);
  // 4.11: a customer's bank is never switched on (see read above).
  if (name === 'bank') { try { if (require('./instance.js').name !== OWNER) return false; } catch (e) { /* no instance: tests */ } }
  const f = file(dataPath);
  let j = {};
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (e) { j = {}; }
  if (j[name] === true) return false;
  j[name] = true;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(j, null, 1), 'utf8');
  try { fs.chmodSync(f, 0o644); } catch (e) {}
  return true;
}

// Page side. Plain string for build.js. Tiles listed here are hidden until D.features says so.
const js = `
function applyFeatures(){
 var F=(typeof D==='object'&&D&&D.features)||{};
 [['gBank','bank']].forEach(function(p){
  var t=document.getElementById(p[0]);
  var mine=[];
  try{if(typeof tileStore==='function')mine=tileStore('tilesHidden',[]);}catch(e){}
  if(t)t.hidden=(F[p[1]]!==true)||mine.indexOf(p[0])>=0;
 });
 var ci=document.getElementById('icConn');if(ci)ci.style.display=F.conn===true?'':'none';
 var fr=document.getElementById('fcRow');
 if(fr){fr.hidden=F.fastChat!==true;if(!fr.hidden&&typeof fcBoot==='function')fcBoot();}
}
`;

module.exports = { KNOWN, OWNER, read, enable, js };
