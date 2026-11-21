// 17.10.2026: a chord sheet he asks for, printed as one PDF page straight from the site's own page
// (tab4u #songContentTPL, two columns). Nothing is retyped: the site's page is printed, like its print button.
// Windows PC only (his Chrome). node tools/print-chords.mjs <tab4u song url> <out.pdf>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const url = process.argv[2], out = process.argv[3];
const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=' + (process.env.TEMP || '.') + '/print-chords-prof', 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.onopen = r);
let id = 0; const wait = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } };
const call = (method, params = {}) => new Promise((r) => { wait[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
await call('Page.enable'); await call('Emulation.setDeviceMetricsOverride', { width: 800, height: 1100, deviceScaleFactor: 1, mobile: false }); await call('Page.navigate', { url }); await sleep(6000);
const r = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
  const el = document.querySelector('#songContentTPL') || [...document.querySelectorAll('div,table')].filter(e => e.innerText && e.innerText.includes('פתיחה') && e.innerText.includes('סיום')).sort((a,b)=>a.innerText.length-b.innerText.length)[0];
  if (!el) return 'none';
  const h = document.querySelector('h1');
  const box = document.createElement('div'); box.dir = 'rtl'; box.style.cssText = 'width:760px;margin:0 auto;overflow:hidden';
  box.innerHTML = '<div style="font:bold 20px Arial;margin:0 0 8px">' + (h ? h.innerText : '') + '</div>';
  box.appendChild(el.cloneNode(true));
  document.body.innerHTML = ''; document.body.appendChild(box);
  document.body.style.cssText = 'margin:0;padding:0;background:#fff';
  const s = document.createElement('style'); s.textContent = '#songContentTPL,#songContentTPL *{max-width:none !important;margin-left:0 !important;margin-right:0 !important;float:none !important;position:static !important} #songContentTPL{width:760px !important;overflow:hidden;column-count:2;column-gap:28px;column-rule:1px solid #ccc} #songContentTPL table{break-inside:avoid} *{color:#000 !important} .chords,.chord,span[class*=chord]{color:#0645ad !important;font-weight:bold}';
  document.head.appendChild(s);
  return (el.id || el.className) + ' ' + el.innerText.length;
})()` });
console.log(r.result.result.value);
const p = await call('Page.printToPDF', { printBackground: true, preferCSSPageSize: false, paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4, scale: 0.8 });
fs.writeFileSync(out, Buffer.from(p.result.data, 'base64'));


ch.kill(); process.exit(0);
