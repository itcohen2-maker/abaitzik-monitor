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
# 14.10: proof for the installer (and for us) that a scheduled run really started.
try { Set-Content -Path (Join-Path $Here 'last-run.txt') -Value (Get-Date).ToString('s') -Encoding ASCII } catch {}

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
    'אתה מבצע בלבד. המוניטור בשרת חשב, תכנן והחליט; אתה מקבל פקודות יבשות ומבצע אותן בדיוק כפי שנכתבו, צעד אחרי צעד.',
    'לא מחליטים כאן שום דבר: לא עיצוב, לא בחירה בין אפשרויות, לא שיפורים, לא צעדים נוספים שלא נכתבו.',
    'אם צעד לא ברור או אי אפשר לבצע אותו כפי שנכתב, עוצרים ומחזירים בדיוק מה נתקע. לא ממציאים פתרון.',
    'אל תבקש אישור: תבצע את מה שנכתב עד הסוף ותאמת שהתוצר קיים.',
    '',
    'ההודעה המקורית של הלקוח:',
    [string]$t.message,
    '',
    'המשימה כפי שהשרת ניסח אותה:',
    [string]$t.task,
    '',
    'חשוב:',
    '  - עובדים על עותק. קובץ מקור בכונן או בתיקייה לא משנים ולא מוחקים; תוצר חדש נשמר ליד המקור או בתיקייה MonitorWork בפרופיל.',
    ('  - קבצים מהמוניטור שהמשימה מזכירה כבר הורדו לתיקייה הזאת, בשם המקורי: ' + (Join-Path $Work ('in-' + $t.id))),
    ('  - כל תוצר שהלקוח צריך לקבל (תמונה, PDF, קובץ AI או PSD, מצגת) שומרים גם בתיקייה הזאת: ' + (Join-Path $Work ('out-' + $t.id))),
    '    כל קובץ שם עולה למוניטור לבד אחרי שתסיים, ומופיע ללקוח עם תמונה וכפתור הורדה. שם קובץ בעברית פשוטה שאומר מה זה.',
    '    תמונה לתצוגה: גם JPG או PNG, לא רק AI או PSD, כדי שהלקוח יראה את התוצאה בלי לפתוח תוכנה.',
    '  - אל תפתח דפדפן ואל תשלח כלום לאף אחד. לא מיילים, לא הודעות.',
    '  - התשובה פשוטה מאוד: משפט אחד מה עשית, ושאלה אחת אם צריך החלטה. בלי נתיבים ובלי שמות טכניים.',
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
  if ($Dry) { $r = Call 'GET' 'ping' $null; Say ('dry: השרת ענה ' + $r.code); return }
  # 14.10: every 20 minutes, the subscription meter of the account signed in here
  # (plan, 5 hour window, week), read with the local login and sent to the server.
  # Only percentages and reset times leave this computer, never the token.
  $subMark = Join-Path $Here 'sub-last.txt'
  if (-not (Test-Path $subMark) -or ((Get-Date) - (Get-Item $subMark).LastWriteTime).TotalMinutes -gt 20) {
    Set-Content -Path $subMark -Value (Get-Date).ToString('s') -Encoding ASCII
    try {
      $cf = Join-Path $env:USERPROFILE '.claude\.credentials.json'
      $o = (Get-Content -Raw -Encoding UTF8 $cf | ConvertFrom-Json).claudeAiOauth
      $u = Invoke-RestMethod -Uri 'https://api.anthropic.com/api/oauth/usage' -Headers @{ Authorization = ('Bearer ' + $o.accessToken); 'anthropic-beta' = 'oauth-2025-04-20' } -TimeoutSec 20
      $w = { param($x) if ($x) { @{ pct = $x.utilization; resets = $x.resets_at } } else { $null } }
      $snap = @{ plan = [string]$o.subscriptionType; tier = [string]$o.rateLimitTier; five = (& $w $u.five_hour); week = (& $w $u.seven_day);
        weekOpus = (& $w $u.seven_day_opus); extra = [bool]($u.extra_usage -and $u.extra_usage.is_enabled) }
      Call 'POST' 'sub' ($snap | ConvertTo-Json -Compress -Depth 4) | Out-Null
    } catch { Say ('!! מכסת המנוי: ' + $_.Exception.Message); Call 'GET' ('ping?step=' + [uri]::EscapeDataString('sub error: ' + $_.Exception.Message)) $null | Out-Null }
  }
  # 14.10: once an hour, take the newest copy of this script from the server.
  # The new copy runs from the next minute on; a copy that does not parse is not taken.
  $mark = Join-Path $Here 'self-check.txt'
  if (-not (Test-Path $mark) -or ((Get-Date) - (Get-Item $mark).LastWriteTime).TotalMinutes -gt 60) {
    Set-Content -Path $mark -Value (Get-Date).ToString('s') -Encoding ASCII
    try {
      $tmp = Join-Path $Here 'pc-pull.new'
      Invoke-WebRequest -UseBasicParsing -Uri ($Cfg.url.TrimEnd('/') + '/self') -Headers @{ 'X-Pc-Key' = $Cfg.key } -OutFile $tmp -TimeoutSec 60
      $me = $MyInvocation.PSCommandPath; if (-not $me) { $me = Join-Path $Here 'pc-pull.ps1' }
      if ((Get-FileHash $tmp).Hash -ne (Get-FileHash (Join-Path $Here 'pc-pull.ps1')).Hash) {
        $errs = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($tmp, [ref]$null, [ref]$errs)
        if ($errs.Count -eq 0) { Copy-Item $tmp (Join-Path $Here 'pc-pull.ps1') -Force; Say 'עודכן מהשרת'; Call 'GET' ('ping?step=' + [uri]::EscapeDataString('self-updated')) $null | Out-Null; $script:updated = $true }
      }
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    } catch { Say ('!! עדכון עצמי: ' + $_.Exception.Message) }
  }
  $r = Call 'GET' 'next' $null
  if ($r.code -eq 204) { return }
  if ($r.code -ne 200) {
    Say ('!! השרת לא ענה: ' + $r.code + ' ' + $r.text)
    # 14.10: a next call that fails is reported once per hour, so a loop that pings and then
    # goes quiet (Rinat's PC, 10:50) can be told apart from a loop that died.
    if (-not $script:nextErrAt -or ((Get-Date) - $script:nextErrAt).TotalMinutes -gt 60) {
      $script:nextErrAt = Get-Date
      try { Call 'GET' ('ping?step=' + [uri]::EscapeDataString('next failed: ' + $r.code + ' ' + [string]$r.text)) $null | Out-Null } catch {}
    }
    return
  }
  $t = $r.text | ConvertFrom-Json
  if ($Dry) { Say ('יש משימה (dry, לא מבצע): ' + $t.id); return }
  Set-Content -Path $Lock -Value $t.id -Encoding UTF8
  try {
    Say ('מתחיל משימה ' + $t.id + ': ' + ([string]$t.task).Substring(0, [Math]::Min(80, ([string]$t.task).Length)))
    # 14.10: monitor files the task names are downloaded first, into in-<id>,
    # so the dry steps can say "the file in the in folder" and it is there.
    $inDir = Join-Path $Work ('in-' + $t.id)
    $l = Call 'GET' 'list' $null
    if ($l.code -eq 200) {
      $all = ([string]$t.task + "`n" + [string]$t.message) -replace '%20', ' '
      foreach ($n in ($l.text | ConvertFrom-Json)) {
        if ($all.IndexOf($n) -lt 0) { continue }
        New-Item -ItemType Directory -Force $inDir | Out-Null
        $dst = Join-Path $inDir (Split-Path $n -Leaf)
        try {
          Invoke-WebRequest -UseBasicParsing -Uri ($Cfg.url.TrimEnd('/') + '/get?name=' + [uri]::EscapeDataString($n)) -Headers @{ 'X-Pc-Key' = $Cfg.key } -OutFile $dst -TimeoutSec 900
          Say ('ירד מהמוניטור: ' + $n)
        } catch { Say ('!! לא ירד: ' + $n + ' ' + $_.Exception.Message) }
      }
    }
    $res = RunClaude $t
    if ($res.usage) {
      $u = Call 'POST' ('usage/' + $t.id) ($res.usage | ConvertTo-Json -Compress -Depth 5)
      if ($u.code -ne 200) { Say ('!! הצריכה לא נרשמה: ' + $u.code + ' ' + $u.text) }
    }
    # 14.10: every file in out-<id> goes up to the monitor; its files/... line is added
    # to the answer, and the page shows it as a picture with a download button.
    $outDir = Join-Path $Work ('out-' + $t.id)
    $links = @()
    if (Test-Path $outDir) {
      foreach ($f in (Get-ChildItem -Path $outDir -File -Recurse | Where-Object { $_.Length -le 300MB })) {
        $u = $Cfg.url.TrimEnd('/') + '/file/' + $t.id + '?name=' + [uri]::EscapeDataString($f.Name)
        try {
          $r2 = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $u -Headers @{ 'X-Pc-Key' = $Cfg.key } -InFile $f.FullName -ContentType 'application/octet-stream' -TimeoutSec 900
          $l = if ($r2.Content -is [string]) { $r2.Content } else { [Text.Encoding]::UTF8.GetString($r2.Content) }
          $links += $l.Trim(); Say ('עלה: ' + $f.Name)
        } catch { Say ('!! לא עלה: ' + $f.Name + ' ' + $_.Exception.Message) }
      }
    }
    # 14.10: a collection of hundreds of files would be hundreds of buttons. Over 12,
    # the answer names the first 6 and says how many went up; all of them are on the server.
    if ($links.Count -gt 12) { $n = $links.Count; $links = @($links[0..5]) + @('הועלו ' + $n + ' קבצים למוניטור.') }
    if ($links.Count -gt 0) {
      if ($res.ok) { $res.text = $res.text + "`n" + ($links -join "`n") }
      else { $res = @{ ok = $true; text = ('הקבצים מוכנים.' + "`n" + ($links -join "`n")); usage = $res.usage } }
    }
    # 15.10, Rinat: a session that listed 1,000 files in its answer made a 76KB "done" the
    # server refused, and the task hung. The answer is a few lines; anything longer is cut here too.
    if ($res.ok -and $res.text.Length -gt 12000) { $res.text = $res.text.Substring(0, 12000) + "`n(התשובה קוצרה)" }
    if ($res.ok) {
      $d = Call 'POST' ('done/' + $t.id) $res.text
      Say ($(if ($d.code -eq 200) { 'הוחזר לשרת: ' } else { '!! ההחזרה נכשלה (' + $d.code + '): ' }) + $t.id + ' ' + $d.text)
    } else {
      $f = Call 'POST' ('fail/' + $t.id) $res.why
      Say ('!! ' + $t.id + ' נכשל (' + $f.text + '): ' + $res.why)
    }
  } finally { Remove-Item $Lock -Force -ErrorAction SilentlyContinue }
}

if ($Loop) {
  # 14.10: one loop per machine. A second install stops the loop before it, and the
  # server hears that a loop started, so "the computer is not connected" is never a guess.
  $pidFile = Join-Path $Here 'loop.pid'
  try {
    $old = [int](Get-Content $pidFile -ErrorAction Stop)
    if ($old -ne $PID) { $op = Get-Process -Id $old -ErrorAction SilentlyContinue; if ($op -and $op.ProcessName -match 'powershell') { Stop-Process -Id $old -Force } }
  } catch {}
  try { Set-Content -Path $pidFile -Value $PID -Encoding ASCII } catch {}
  try { Call 'GET' ('ping?step=' + [uri]::EscapeDataString('loop started pid ' + $PID + ' on ' + $env:COMPUTERNAME)) $null | Out-Null } catch {}
  $polls = 0
  while ($true) {
    try { One } catch { Say ('!! ' + $_.Exception.Message); try { Call 'GET' ('ping?step=' + [uri]::EscapeDataString('loop error: ' + $_.Exception.Message)) $null | Out-Null } catch {} }
    # 15.10: the functions of a running loop are the old ones even after the file changed
    # (Rinat's loop from 14.10 never saw a fix). A fresh copy starts a new loop, which
    # stops this one through loop.pid, and this one ends.
    if ($script:updated) {
      Say 'מפעיל מחדש עם הגרסה החדשה'
      try { Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Here 'pc-pull.ps1'), '-Loop') | Out-Null } catch { Say ('!! ההפעלה מחדש נכשלה: ' + $_.Exception.Message) }
      Start-Sleep -Seconds 5
      exit 0
    }
    $polls++
    # the first poll and then one an hour say "alive", so the server log shows the loop is up
    if ($polls -eq 1 -or ($polls % 60) -eq 0) { try { Call 'GET' ('ping?step=' + [uri]::EscapeDataString('loop alive, poll ' + $polls)) $null | Out-Null } catch {} }
    Start-Sleep -Seconds 60
  }
}
else { try { One } catch { Say ('!! ' + $_.Exception.Message); try { Call 'GET' ('ping?step=' + [uri]::EscapeDataString('pull error: ' + $_.Exception.Message)) $null | Out-Null } catch {}; exit 1 } }
