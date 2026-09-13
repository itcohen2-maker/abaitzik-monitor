$r = @()
foreach ($n in 'AbaItzikNightSleep','AbaItzikMorningWake') {
  $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  if ($t) {
    $i = $t | Get-ScheduledTaskInfo
    $r += "$n | $($t.State) | next=$($i.NextRunTime) | wake=$($t.Settings.WakeToRun) | user=$($t.Principal.UserId)"
  } else { $r += "$n | MISSING" }
}
$r | Set-Content -Encoding utf8 'C:\Users\User\abaitzik-monitor\.tasks-check.txt'
