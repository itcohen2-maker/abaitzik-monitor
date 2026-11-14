# Installs the bank agent (bank-agent.ps1) on a customer's computer, 14.11.2026. No Claude,
# no admin: everything lives in the user's own profile, and the minute run is the user's own.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Src = if ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { '' }
$Dst = Join-Path $env:LOCALAPPDATA 'MonitorBank'
$Task = 'MonitorBank'
function Step($s) { Write-Host ''; Write-Host ('== ' + $s) -ForegroundColor Cyan }
function Ok($s) { Write-Host ('   ' + $s) -ForegroundColor Green }
function Bad($s) { Write-Host ('   ' + $s) -ForegroundColor Red }
# 14.11, Itzik's screen: the console printed the Hebrew reversed. The console speaks English, and
# what the customer must read comes in a Windows message box, which shows Hebrew right to left.
Add-Type -AssemblyName PresentationFramework
function Tell($he, $ok) {
  $icon = if ($ok) { [System.Windows.MessageBoxImage]::Information } else { [System.Windows.MessageBoxImage]::Warning }
  [void][System.Windows.MessageBox]::Show($he, 'חיבור הבנק', [System.Windows.MessageBoxButton]::OK, $icon, [System.Windows.MessageBoxResult]::OK, [System.Windows.MessageBoxOptions]::RtlReading)
}
# 14.11: the customer's file is one Bank-Setup.cmd with everything inside ($Embedded, base64,
# written by setup/build-bank-installer.py), so it works even when double clicked inside the zip.
# Itzik's first try: two files named install-bank, and nothing happened.
function Payload($n) { if ($Embedded) { return [Convert]::FromBase64String($Embedded[$n]) } else { return [IO.File]::ReadAllBytes((Join-Path $Src $n)) } }
$cfg = [Text.Encoding]::UTF8.GetString((Payload 'config.json')).TrimStart([char]0xFEFF) | ConvertFrom-Json
function Report($step) {
  try { Invoke-WebRequest -UseBasicParsing -Uri ($cfg.url.TrimEnd('/') + '/ping?step=' + [uri]::EscapeDataString('bank: ' + $step)) -Headers @{ 'X-Pc-Key' = $cfg.key } -TimeoutSec 20 | Out-Null } catch {}
}

Step 'Checking the connection to the monitor'
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri ($cfg.url.TrimEnd('/') + '/ping') -Headers @{ 'X-Pc-Key' = $cfg.key } -TimeoutSec 30
  Ok ('Monitor answers (' + $r.StatusCode + ')')
} catch { Bad ('No answer: ' + $_.Exception.Message); Tell ('אין חיבור למוניטור.' + [Environment]::NewLine + 'צריך לבדוק שיש אינטרנט, ולהריץ שוב.') $false; exit 1 }
Report ('start ' + $env:COMPUTERNAME)

Step 'Looking for Chrome'
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Ok $chrome; Report ('browser ' + $chrome) } else { Bad 'Chrome not found'; Report 'no browser'; Tell ('לא נמצא דפדפן כרום במחשב.' + [Environment]::NewLine + 'צריך להתקין את Google Chrome, ואז להריץ שוב.') $false; exit 1 }

Step 'Copying the files'
New-Item -ItemType Directory -Force $Dst | Out-Null
foreach ($f in 'bank-agent.ps1', 'run-hidden.vbs', 'config.json') { [IO.File]::WriteAllBytes((Join-Path $Dst $f), (Payload $f)) }
Ok $Dst

Step 'Starting the check every minute'
$agent = Join-Path $Dst 'bank-agent.ps1'
$stamp = Join-Path $Dst 'last-run.txt'
Remove-Item $stamp -Force -ErrorAction SilentlyContinue
$ps = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $agent + '"'
$ways = @()
if (Test-Path "$env:WINDIR\System32\conhost.exe") { $ways += @{ name = 'conhost'; tr = 'conhost.exe --headless ' + $ps } }
$ways += @{ name = 'wscript'; tr = 'wscript.exe "' + (Join-Path $Dst 'run-hidden.vbs') + '" ' + $ps }
$ways += @{ name = 'powershell'; tr = $ps }
$works = $null
foreach ($w in $ways) {
  $o = & schtasks.exe /Create /F /SC MINUTE /MO 1 /TN $Task /TR $w.tr 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Report ('schtasks ' + $w.name + ' failed: ' + $o.Trim()); continue }
  $since = Get-Date
  & schtasks.exe /Run /TN $Task 2>&1 | Out-Null
  for ($i = 0; $i -lt 25 -and -not ((Test-Path $stamp) -and (Get-Item $stamp).LastWriteTime -gt $since); $i++) { Start-Sleep -Seconds 1 }
  if ((Test-Path $stamp) -and (Get-Item $stamp).LastWriteTime -gt $since) { $works = $w.name; break }
  Report ('schtasks ' + $w.name + ' did not run')
}
if (-not $works) {
  & schtasks.exe /Delete /F /TN $Task 2>&1 | Out-Null
  $cmdLine = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $agent + '" -Loop'
  try { New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'MonitorBank' -Value $cmdLine -PropertyType String -Force -ErrorAction Stop | Out-Null; Report 'run key set' } catch { Report ('run key failed: ' + $_.Exception.Message) }
  $since = Get-Date
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', $agent, '-Loop') | Out-Null
  for ($i = 0; $i -lt 30 -and -not ((Test-Path $stamp) -and (Get-Item $stamp).LastWriteTime -gt $since); $i++) { Start-Sleep -Seconds 1 }
  if ((Test-Path $stamp) -and (Get-Item $stamp).LastWriteTime -gt $since) { $works = 'loop' }
}
if ($works) {
  Ok ('Running (' + $works + ')'); Report ('installed via ' + $works)
  Ok 'Installed.'
  Tell ('✓ חיבור הבנק מותקן.' + [Environment]::NewLine + [Environment]::NewLine + 'מעכשיו כותבים למוניטור בוואטסאפ: בנק' + [Environment]::NewLine + 'ייפתח כאן חלון של הבנק. מתחברים בו בעצמך, והשאר קורה לבד.') $true
} else { Bad 'Nothing runs'; Report 'nothing runs'; Tell ('ההתקנה לא הצליחה להפעיל את הבדיקה ברקע במחשב הזה.' + [Environment]::NewLine + 'צריך לשלוח צילום של המסך הזה.') $false; exit 1 }
