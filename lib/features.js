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

const KNOWN = ['bank'];
const file = (dataPath) => path.join(dataPath, 'status', 'features.json');

function read(dataPath) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(file(dataPath), 'utf8')); } catch (e) { /* none yet: all off */ }
  const out = {};
  KNOWN.forEach((k) => { out[k] = !!(j && j[k] === true); });
  return out;
}

function enable(dataPath, name) {
  if (KNOWN.indexOf(name) < 0) throw new Error('unknown feature ' + name);
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
}
`;

module.exports = { KNOWN, read, enable, js };
