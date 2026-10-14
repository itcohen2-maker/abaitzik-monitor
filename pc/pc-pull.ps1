# The computer half of the PC queue for a customer (14.10.2026). PowerShell 5.1 only:
# no node, no ssh, no admin, nothing installed beyond Claude Code itself.
#
# Itzik, at Rinat's computer: "המוניטור והקלוד שלי יהיו המוח והקלוד שלה רק יעבוד".
# The monitor on the server plans and answers her; what needs this machine
# (Illustrator, Photoshop, her files) is marked there with pc-task.js, and this
# script, every minute from a scheduled task, asks the server over HTTPS
# (lib/pc-api.js), runs the customer's own Claude Code here on her own account,
# and sends the answer back to the same thread. Most minutes it is one small
# request that finds nothing and exits: no Claude, no tokens.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File pc-pull.ps1 [-Loop] [-Dry]
#   -Loop   keep running, once a minute (the fallback when no scheduled task could be made)
#   -Dry    report a waiting task without claiming or running it
param([switch]$Loop, [switch]$Dry)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $Here 'config.json') | ConvertFrom-Json
$Log = Join-Path $Here 'pc-pull.log'
$Lock = Join-Path $Here 'running.lock'
$Work = Join-Path $env:USERPROFILE 'MonitorWork'
$MaxMinutes = 30

function Say($line) {
  $l = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ' + $line
  try { Add-Content -Path $Log -Value $l -Encoding UTF8 } catch {}
  Write-Output $l
}
function Find-Claude() {
  if ($Cfg.claude -and (Test-Path $Cfg.claude)) { return $Cfg.claude }
  $c = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
  if (Test-Path $c) { return $c }
  # an npm install has claude.ps1, claude.cmd and claude; only the .cmd can be started directly
  $g = Get-Command claude.exe, claude.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($g) { return $g.Source }
  throw 'claude.exe not found'
}
function Call($method, $p, $body) {
  $h = @{ 'X-Pc-Key' = $Cfg.key }
  $u = $Cfg.url.TrimEnd('/') + '/' + $p
  try {
    if ($body -ne $null) {
      $r = Invoke-WebRequest -UseBasicParsing -Method $method -Uri $u -Headers $h -TimeoutSec 60 `
        -ContentType 'text/plain; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes([string]$body))
    } else {
      $r = Invoke-WebRequest -UseBasicParsing -Method $method -Uri $u -Headers $h -TimeoutSec 60
    }
    $text = ''
    if ($r.Content -is [string]) { $text = $r.Content }
    elseif ($r.Content) { $text = [Text.Encoding]::UTF8.GetString($r.Content) }
    return @{ code = [int]$r.StatusCode; text = $text }
  } catch {
    $code = -1; $text = $_.Exception.Message
    if ($_.Exception.Response) { try { $code = [int]$_.Exception.Response.StatusCode } catch {} }
    return @{ code = $code; text = $text }
  }
}
function Prompt($t) {
  $owner = $Cfg.name
  @(
    'זו הרצה אוטומטית במחשב של הלקוח, בלי אדם מול המסך. אין למי לשאול שאלות.',
    'המוניטור בשרת קיבל הודעה מהלקוח וסימן שהיא צריכה את המחשב הזה (קבצים כאן, אילוסטרייטור, פוטושופ, תוכנה שמותקנת כאן).',
    'אל תבקש אישור ואל תציע: תבצע עד הסוף ותאמת שהתוצר קיים.',
    '',
    'ההודעה המקורית של הלקוח:',
    [string]$t.message,
    '',
    'המשימה כפי שהשרת ניסח אותה:',
    [string]$t.task,
    '',
    'חשוב:',
    '  - עובדים על עותק. קובץ מקור בכונן או בתיקייה לא משנים ולא מוחקים; תוצר חדש נשמר ליד המקור או בתיקייה MonitorWork בפרופיל.',
    '  - קובץ שהפקת נשאר במחשב הזה. בתשובה כתוב במילים פשוטות איפה הוא (איזו תיקייה, איזה שם), כדי שהלקוח ימצא אותו.',
    '  - אל תפתח דפדפן ואל תשלח כלום לאף אחד. לא מיילים, לא הודעות, לא העלאות.',
    '  - בלי מקפים ובלי אימוג׳י בתשובה.',
    '',
    'בסוף, הדבר האחרון שאתה מדפיס: התשובה ללקוח, בין שתי השורות האלה בדיוק:',
    '<<<ANSWER',
    '(עד חמש שורות קצרות, עברית של יום יום, המשפט הראשון הוא התוצאה, בלי שמות טכניים)',
    'ANSWER>>>',
    'אם לא הצלחת, כתוב בתוך הסימנים מה נתקע ומה הלקוח צריך לעשות.'
  ) -join "`n"
}
function RunClaude($t) {
  $exe = Find-Claude
  New-Item -ItemType Directory -Force $Work | Out-Null
  $pf = Join-Path $Here ('prompt-' + $t.id + '.txt')
  [IO.File]::WriteAllText($pf, (Prompt $t), (New-Object Text.UTF8Encoding $false))
  $model = if ($Cfg.model) { $Cfg.model } else { 'haiku' }
  $modes = @('--dangerously-skip-permissions', '--permission-mode acceptEdits')
  foreach ($mode in $modes) {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $cl = '-p --output-format json --model ' + $model + ' ' + $mode
    if ($exe -like '*.exe') { $psi.FileName = $exe; $psi.Arguments = $cl }
    else { $psi.FileName = 'cmd.exe'; $psi.Arguments = '/d /s /c ""' + $exe + '" ' + $cl + '"' }
    $psi.WorkingDirectory = $Work
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $p = [Diagnostics.Process]::Start($psi)
    $inp = New-Object IO.StreamWriter($p.StandardInput.BaseStream, (New-Object Text.UTF8Encoding $false))
    $inp.Write([IO.File]::ReadAllText($pf, [Text.Encoding]::UTF8)); $inp.Close()
    $outTask = $p.StandardOutput.ReadToEndAsync(); $errTask = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($MaxMinutes * 60 * 1000)) {
      Say ('!! ' + $MaxMinutes + ' דקות עברו, עוצר ' + $t.id)
      try { $p.Kill() } catch {}
      Remove-Item $pf -ErrorAction SilentlyContinue
      return @{ ok = $false; why = 'הסשן במחשב רץ יותר מ ' + $MaxMinutes + ' דקות ונעצר' }
    }
    $out = $outTask.Result; $err = $errTask.Result
    if ($p.ExitCode -ne 0 -and ($err + $out) -match 'permission|bypass' -and $mode -eq $modes[0]) {
      Say ('המצב ' + $mode + ' נדחה כאן, מנסה שוב עם ' + $modes[1]); continue
    }
    Remove-Item $pf -ErrorAction SilentlyContinue
    $text = $out; $usage = $null
    try {
      $j = $out.Substring($out.IndexOf('{'), $out.LastIndexOf('}') - $out.IndexOf('{') + 1) | ConvertFrom-Json
      $models = @{}
      if ($j.modelUsage) { foreach ($m in $j.modelUsage.PSObject.Properties) {
        $u = $m.Value; $models[$m.Name] = @{ in = [int]$u.inputTokens; out = [int]$u.outputTokens; cr = [int]$u.cacheReadInputTokens; cw = [int]$u.cacheCreationInputTokens; usd = [math]::Round([double]$u.costUSD, 4) } } }
      $usage = @{ usd = [math]::Round([double]$j.total_cost_usd, 4); turns = [int]$j.num_turns; ms = [int]$j.duration_ms; sub = 0; models = $models }
      $text = [string]$j.result
    } catch {}
    $m = [regex]::Matches($text, '<<<ANSWER\s*([\s\S]*?)\s*ANSWER>>>')
    if ($m.Count -gt 0) { return @{ ok = $true; text = $m[$m.Count - 1].Groups[1].Value.Trim(); usage = $usage } }
    $tail = (($text + ' ' + $err).Trim())
    if ($tail.Length -gt 300) { $tail = $tail.Substring($tail.Length - 300) }
    return @{ ok = $false; why = ('קוד ' + $p.ExitCode + ', בלי תשובה. ' + $tail); usage = $usage }
  }
}
function One() {
  # One session at a time on this computer. A lock older than the session limit is stale.
  if (Test-Path $Lock) {
    $age = (Get-Date) - (Get-Item $Lock).LastWriteTime
    if ($age.TotalMinutes -lt ($MaxMinutes + 2)) { return }
    Remove-Item $Lock -Force -ErrorAction SilentlyContinue
  }
  $r = Call 'GET' 'next' $null
  if ($r.code -eq 204) { return }
  if ($r.code -ne 200) { Say ('!! השרת לא ענה: ' + $r.code + ' ' + $r.text); return }
  $t = $r.text | ConvertFrom-Json
  if ($Dry) { Say ('יש משימה (dry, לא מבצע): ' + $t.id); return }
  Set-Content -Path $Lock -Value $t.id -Encoding UTF8
  try {
    Say ('מתחיל משימה ' + $t.id + ': ' + ([string]$t.task).Substring(0, [Math]::Min(80, ([string]$t.task).Length)))
    $res = RunClaude $t
    if ($res.usage) {
      $u = Call 'POST' ('usage/' + $t.id) ($res.usage | ConvertTo-Json -Compress -Depth 5)
      if ($u.code -ne 200) { Say ('!! הצריכה לא נרשמה: ' + $u.code + ' ' + $u.text) }
    }
    if ($res.ok) {
      $d = Call 'POST' ('done/' + $t.id) $res.text
      Say ($(if ($d.code -eq 200) { 'הוחזר לשרת: ' } else { '!! ההחזרה נכשלה (' + $d.code + '): ' }) + $t.id + ' ' + $d.text)
    } else {
      $f = Call 'POST' ('fail/' + $t.id) $res.why
      Say ('!! ' + $t.id + ' נכשל (' + $f.text + '): ' + $res.why)
    }
  } finally { Remove-Item $Lock -Force -ErrorAction SilentlyContinue }
}

if ($Loop) { while ($true) { try { One } catch { Say ('!! ' + $_.Exception.Message) }; Start-Sleep -Seconds 60 } }
else { try { One } catch { Say ('!! ' + $_.Exception.Message); exit 1 } }
