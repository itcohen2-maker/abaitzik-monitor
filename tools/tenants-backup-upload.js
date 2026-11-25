#!/usr/bin/env node
'use strict';
// 25.11.2026: node backup-upload.js <file.enc> <tenant> <keep>
// Uploads one encrypted tenant backup to Itzik's Drive (גיבויי שרת/<tenant>), checks the size Drive reports,
// then keeps only the newest <keep> copies there. Exit 0 only when the upload is verified.
const path = require('path');
const d = require('/home/monitor/abaitzik-monitor/lib/my-drive.js');
(async () => {
  const [file, tenant, keep] = process.argv.slice(2);
  const parts = ['גיבויי שרת', tenant];
  await d.putFile(file, path.basename(file), parts);
  const all = await d.listIn(parts, '20');
  for (const f of all.slice(Number(keep) || 2)) await d.remove(f.id);
  console.log('uploaded ' + tenant + ' ' + path.basename(file));
})().catch((e) => { console.error(e.message); process.exit(1); });
