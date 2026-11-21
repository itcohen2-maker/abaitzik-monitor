#!/usr/bin/env python3
# Builds one file that wires a computer to the monitor queue as a Claude worker (14.11.2026,
# Itzik: the bank PC also works for Lolos). Like build-bank-installer.py: a .cmd whose
# PowerShell part carries pc-pull.ps1, install-pc.ps1, run-hidden.vbs, README.txt, config.json
# and, optionally, a CLAUDE.md that the worker reads on every run (copied to MonitorWork).
# Usage (as root, in the monitor's dir):
#   python3 setup/build-pc-installer.py <out.zip> <url> <key> <name> [<CLAUDE.md>] [--model haiku]
import base64, json, sys, zipfile
args = [a for a in sys.argv[1:]]
model = 'haiku'
if '--model' in args:
  i = args.index('--model'); model = args[i + 1]; del args[i:i + 2]
out, url, key, name = args[:4]
brief = args[4] if len(args) > 4 else None
def b64(b): return base64.b64encode(b).decode()
cfg = json.dumps({'url': url, 'key': key, 'name': name, 'model': model}, ensure_ascii=False, indent=1).encode('utf-8')
emb = {f: b64(open('pc/' + f, 'rb').read()) for f in ('pc-pull.ps1', 'install-pc.ps1', 'run-hidden.vbs', 'README.txt')}
emb['config.json'] = b64(cfg)
if brief: emb['CLAUDE.md'] = b64(open(brief, 'rb').read())
head = '\r\n'.join([
  '@echo off',
  'chcp 65001 >nul',
  'title Monitor PC Setup',
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"$s=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8); $i=$s.IndexOf('#PS'+'START'); iex $s.Substring($i)\"",
  'echo.',
  'pause',
  'exit /b',
  '#PSSTART',
  '',
])
ps = r'''
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'MonitorPcSetup'
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($k in $Embedded.Keys) { [IO.File]::WriteAllBytes((Join-Path $dir $k), [Convert]::FromBase64String($Embedded[$k])) }
if ($Embedded.ContainsKey('CLAUDE.md')) {
  $work = Join-Path $env:USERPROFILE 'MonitorWork'
  New-Item -ItemType Directory -Force $work | Out-Null
  Copy-Item (Join-Path $dir 'CLAUDE.md') (Join-Path $work 'CLAUDE.md') -Force
  Write-Host ('Brief saved: ' + (Join-Path $work 'CLAUDE.md')) -ForegroundColor Green
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'install-pc.ps1')
if ($LASTEXITCODE -eq 0) { Write-Host 'Install finished.' -ForegroundColor Green } else { Write-Host 'Install did not finish. The monitor server already knows what failed.' -ForegroundColor Red }
'''
body = '$Embedded = @{\r\n' + ''.join("  '%s' = '%s'\r\n" % (k, v) for k, v in emb.items()) + '}\r\n' + ps.replace('\r\n', '\n').replace('\n', '\r\n')
data = (head + body).encode('utf-8')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
  z.writestr('Lolos-Setup.cmd' if name and 'lolos' in out.lower() else 'Monitor-PC-Setup.cmd', data)
print('built', out, len(data), 'bytes')
