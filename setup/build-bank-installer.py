#!/usr/bin/env python3
# Builds the one file a customer runs: Bank-Setup.cmd, with bank-agent.ps1, run-hidden.vbs and
# config.json inside (14.11.2026). Usage (as root, in the monitor's dir):
#   python3 setup/build-bank-installer.py <out.zip> <url> <key> <name>
# The batch part runs PowerShell on the rest of the same file; nothing else is needed next to it.
import base64, json, sys, zipfile, io
out, url, key, name = sys.argv[1:5]
def b64(b): return base64.b64encode(b).decode()
cfg = json.dumps({'url': url, 'key': key, 'name': name}, ensure_ascii=False, indent=1).encode('utf-8')
emb = {
  'bank-agent.ps1': b64(open('pc/bank-agent.ps1', 'rb').read()),
  'run-hidden.vbs': b64(open('pc/run-hidden.vbs', 'rb').read()),
  'config.json': b64(cfg),
}
ps = open('pc/install-bank.ps1', encoding='utf-8-sig').read()
head = '\r\n'.join([
  '@echo off',
  'chcp 65001 >nul',
  'title Bank Setup',
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"$s=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8); $i=$s.IndexOf('#PS'+'START'); iex $s.Substring($i)\"",
  'if errorlevel 1 pause',
  'exit /b',
  '#PSSTART',
  '',
])
body = '$Embedded = @{\r\n' + ''.join("  '%s' = '%s'\r\n" % (k, v) for k, v in emb.items()) + '}\r\n' + ps.replace('\r\n', '\n').replace('\n', '\r\n')
data = (head + body).encode('utf-8')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
  z.writestr('Bank-Setup.cmd', data)
print('built', out, len(data), 'bytes')
