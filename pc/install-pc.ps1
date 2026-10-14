# Installs the PC half of the monitor queue on a customer's computer (14.10.2026).
# No admin: everything lives under the user's own profile, and the minute task is
# registered for the current user only. Run through install-pc.cmd (one click).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dst = Join-Path $env:LOCALAPPDATA 'MonitorPc'
$Task = 'MonitorPcPull'

function Step($s) { Write-Host ''; Write-Host ('== ' + $s) -ForegroundColor Cyan }
function Ok($s) { Write-Host ('   ' + $s) -ForegroundColor Green }
function Bad($s) { Write-Host ('   ' + $s) -ForegroundColor Red }

Step 'מחפש את Claude Code במחשב הזה'
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $Src 'config.json') | ConvertFrom-Json
function Report($step) {
  try { Invoke-WebRequest -UseBasicParsing -Uri ($cfg.url.TrimEnd('/') + '/ping?step=' + [uri]::EscapeDataString($step)) -Headers @{ 'X-Pc-Key' = $cfg.key } -TimeoutSec 20 | Out-Null } catch {}
}
trap { Report ('crash: ' + $_.Exception.Message + ' line ' + $_.InvocationInfo.ScriptLineNumber); Bad ('Error: ' + $_.Exception.Message); exit 1 }
Report ('start ' + $env:COMPUTERNAME + ' user ' + $env:USERNAME + ' ps ' + $PSVersionTable.PSVersion)
$cands = @()
if ($cfg.claude) { $cands += $cfg.claude }
$cands += (Join-Path $env:USERPROFILE '.local\bin\claude.exe')
$cands += (Join-Path $env:LOCALAPPDATA 'Programs\claude\claude.exe')
$cands += (Join-Path $env:APPDATA 'npm\claude.cmd')
$g = Get-Command claude.exe, claude.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
if ($g) { $cands += $g.Source }
$found = $null
foreach ($c in $cands) { if ($c -and (Test-Path $c)) { $found = $c; break } }
if (-not $found) {
  $hits = Get-ChildItem -Path $env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA -Recurse -Depth 5 -Include 'claude.exe', 'claude.cmd' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hits) { $found = $hits.FullName }
}
if (-not $found) {
  Report 'claude not found'
  Bad 'לא נמצא claude.exe. איפה הוא מותקן? אפשר למצוא עם: where claude'
  $found = Read-Host 'הנתיב המלא של claude.exe'
  if (-not (Test-Path $found)) { Bad 'אין קובץ כזה. עוצר.'; exit 1 }
}
Ok ('נמצא: ' + $found); Report ('claude ' + $found)

Step 'מעתיק את הקבצים'
New-Item -ItemType Directory -Force $Dst | Out-Null
foreach ($f in 'pc-pull.ps1', 'run-hidden.vbs', 'README.txt') { Copy-Item (Join-Path $Src $f) (Join-Path $Dst $f) -Force }
$cfg | Add-Member -NotePropertyName claude -NotePropertyValue $found -Force
[IO.File]::WriteAllText((Join-Path $Dst 'config.json'), ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Ok $Dst

Step 'בודק את החיבור לשרת'
try {
  $r = Invoke-WebRequest -UseBasicParsing -Method GET -Uri ($cfg.url.TrimEnd("/") + "/ping") -Headers @{ 'X-Pc-Key' = $cfg.key } -TimeoutSec 30
  if ($r.StatusCode -eq 200) { Ok ('השרת עונה (' + $r.StatusCode + ')') } else { Bad ('תשובה לא צפויה: ' + $r.StatusCode) }
} catch {
  Bad ('השרת לא ענה: ' + $_.Exception.Message); Bad 'בלי חיבור לשרת אין מה להמשיך. לבדוק אינטרנט או חסימה של המחשוב.'; exit 1
}

# 14.10, Rinat's PC: schtasks (and claude.exe) wrote "ERROR: Access is denied." to stderr, and under 'Stop'
# PowerShell 5.1 turns native stderr into a terminating error, so the trap ended the install
# before the startup loop below, which needs no task at all, was ever tried. From here on
# every native call is judged by its exit code and output, not by stderr.
$ErrorActionPreference = 'Continue'
Step 'בודק ש Claude Code מחובר לחשבון'
try {
  $out = & $found -p --output-format text --model haiku 'ענה במילה אחת: מוכן' 2>&1 | Out-String
  Report ('claude says: ' + $out.Trim())
  if ($out -match 'מוכן|ready|Ready') { Ok 'Claude Code עונה' } else { Bad ('Claude Code ענה משהו אחר: ' + $out.Trim().Substring(0, [Math]::Min(200, $out.Trim().Length))) }
} catch { Bad ('Claude Code לא רץ: ' + $_.Exception.Message) }

Step 'בודק איזה מנוי Claude מחובר כאן'
# 14.10, Itzik: "תבדוק גם אם יש לה מנוי מתקדם". Only the plan and tier fields, never a token.
try {
  $cf = Join-Path $env:USERPROFILE '.claude\.credentials.json'
  $plan = 'no credentials file'
  if (Test-Path $cf) {
    $c = (Get-Content -Raw -Encoding UTF8 $cf | ConvertFrom-Json).claudeAiOauth
    $plan = 'plan=' + $c.subscriptionType + ' tier=' + $c.rateLimitTier + ' scopes=' + (($c.scopes) -join ',')
  }
  if ($env:ANTHROPIC_API_KEY) { $plan += ' api-key-env=yes' }
  $st = & $found -p --output-format json --model haiku 'ok' 2>&1 | Out-String
  try { $sj = $st.Substring($st.IndexOf('{')) | ConvertFrom-Json; $plan += ' model=' + (($sj.modelUsage.PSObject.Properties | Select-Object -First 1).Name) + ' cost=' + $sj.total_cost_usd } catch {}
  Ok $plan; Report ('subscription ' + $plan)
} catch { Report ('subscription check failed: ' + $_.Exception.Message) }

Step 'רושם בדיקה כל דקה ברקע'
# 14.10, Rinat's PC: the task was made, but the run every minute never reached the server
# (wscript is often blocked on company machines). So each way is tried in turn, and a way
# counts only when pc-pull.ps1 really ran: it writes last-run.txt at its very start.
$pull = Join-Path $Dst 'pc-pull.ps1'
$stamp = Join-Path $Dst 'last-run.txt'
$ps = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ' + $pull
$ways = @()
if (Test-Path "$env:WINDIR\System32\conhost.exe") { $ways += @{ name = 'conhost'; tr = 'conhost.exe --headless ' + $ps } }
$ways += @{ name = 'wscript'; tr = 'wscript.exe ' + (Join-Path $Dst 'run-hidden.vbs') + ' ' + $ps }
$ways += @{ name = 'powershell'; tr = $ps }
function Ran($since) { (Test-Path $stamp) -and ((Get-Item $stamp).LastWriteTime -gt $since) }
$works = $null
foreach ($w in $ways) {
  $o = & schtasks.exe /Create /F /SC MINUTE /MO 1 /TN $Task /TR $w.tr 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Report ('schtasks ' + $w.name + ' create failed: ' + $o.Trim()); continue }
  $since = Get-Date
  & schtasks.exe /Run /TN $Task | Out-Null
  for ($i = 0; $i -lt 20 -and -not (Ran $since); $i++) { Start-Sleep -Seconds 1 }
  if (Ran $since) { $works = $w.name; break }
  # A run already in progress (a long task) means the task works; /Run is ignored then.
  $busy = & schtasks.exe /Query /TN $Task /FO LIST 2>&1 | Select-String 'Running' 
  if ($busy -and (Test-Path $stamp)) { $works = $w.name + ' (already running a task)'; break }
  $q = & schtasks.exe /Query /TN $Task /V /FO LIST 2>&1 | Select-String 'Last Result|Status' | Out-String
  Report ('schtasks ' + $w.name + ' did not run: ' + ($q -replace '\s+', ' ').Trim())
}
if ($works) {
  Ok ('בדיקה כל דקה פועלת (' + $works + ')'); Report ('runs every minute via ' + $works)
} else {
  & schtasks.exe /Delete /F /TN $Task 2>&1 | Out-Null
  # No scheduled task runs here: a hidden loop that starts now and with every login.
  $startup = [Environment]::GetFolderPath('Startup')
  $cmd = Join-Path $startup 'MonitorPc.cmd'
  [IO.File]::WriteAllText($cmd, ('@start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $pull + '" -Loop' + "`r`n"), (New-Object Text.ASCIIEncoding))
  $since = Get-Date
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', $pull, '-Loop')
  for ($i = 0; $i -lt 20 -and -not (Ran $since); $i++) { Start-Sleep -Seconds 1 }
  if (Ran $since) { Ok 'בדיקה כל דקה פועלת (לולאה ברקע)'; Report 'runs every minute via startup loop' }
  else { Bad 'הבדיקה כל דקה לא הצליחה לרוץ במחשב הזה.'; Report 'nothing runs every minute'; exit 1 }
}
Report 'installed'
Ok 'מותקן. מעכשיו המוניטור יכול לשלוח למחשב הזה משימות, והתשובות חוזרות לצ׳אט לבד.'
Ok ('יומן: ' + (Join-Path $Dst 'pc-pull.log'))
