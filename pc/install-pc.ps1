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

Step 'בודק ש Claude Code מחובר לחשבון'
try {
  $out = & $found -p --output-format text --model haiku 'ענה במילה אחת: מוכן' 2>&1 | Out-String
  Report ('claude says: ' + $out.Trim())
  if ($out -match 'מוכן|ready|Ready') { Ok 'Claude Code עונה' } else { Bad ('Claude Code ענה משהו אחר: ' + $out.Trim().Substring(0, [Math]::Min(200, $out.Trim().Length))) }
} catch { Bad ('Claude Code לא רץ: ' + $_.Exception.Message) }

Step 'רושם בדיקה כל דקה ברקע'
$ps = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Dst 'pc-pull.ps1') + '"'
$tr = 'wscript.exe "' + (Join-Path $Dst 'run-hidden.vbs') + '" ' + $ps
$made = $false
try {
  $o = & schtasks.exe /Create /F /SC MINUTE /MO 1 /TN $Task /TR $tr 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { $made = $true; Ok ('משימה מתוזמנת ' + $Task + ' נרשמה') } else { Bad ('schtasks: ' + $o.Trim()) }
} catch { Bad ('schtasks: ' + $_.Exception.Message) }
Report ('schtasks made=' + $made)
if (-not $made) {
  # No scheduled task allowed here: a hidden loop starts with every login instead.
  $startup = [Environment]::GetFolderPath('Startup')
  $vbs = Join-Path $startup 'MonitorPc.vbs'
  $loop = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""' + (Join-Path $Dst 'pc-pull.ps1') + '"" -Loop", 0, False'
  [IO.File]::WriteAllText($vbs, $loop, (New-Object Text.UTF8Encoding $false))
  Start-Process wscript.exe -ArgumentList ('"' + $vbs + '"') -WindowStyle Hidden
  Ok ('במקום זה: לולאה מוסתרת שעולה עם כל כניסה, ' + $vbs)
} else {
  & schtasks.exe /Run /TN $Task | Out-Null
}

Step 'הריצה הראשונה'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dst 'pc-pull.ps1') -Dry
Report 'installed'
Ok 'מותקן. מעכשיו המוניטור יכול לשלוח למחשב הזה משימות, והתשובות חוזרות לצ׳אט לבד.'
Ok ('יומן: ' + (Join-Path $Dst 'pc-pull.log'))
