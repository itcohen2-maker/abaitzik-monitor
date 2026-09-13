# מצב לילה: שינה בלילה, התעוררות בבוקר.
# שינה ולא כיבוי, כי שינה שומרת את הזיכרון ולכן הטרמינל וכרום
# ממשיכים לחיות. כיבוי היה הורג את שניהם ואף אחד לא היה מרים אותם.
$ErrorActionPreference = 'Stop'

# מאפשר לטיימר להעיר את המחשב. בלעדיו משימת ההערה לא תרוץ בכלל.
powercfg -setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg -setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg -SETACTIVE SCHEME_CURRENT

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sleeper = Join-Path $here 'sleep-now.ps1'

$a1 = New-ScheduledTaskAction -Execute 'powershell.exe' `
      -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $sleeper + '"')
$t1 = New-ScheduledTaskTrigger -Daily -At 23:00
$s1 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikNightSleep' -Action $a1 -Trigger $t1 -Settings $s1 -Force | Out-Null

# ההערה: הפעולה עצמה זניחה, מה שמעיר הוא הדגל WakeToRun
$a2 = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c exit'
$t2 = New-ScheduledTaskTrigger -Daily -At 06:55
$s2 = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikMorningWake' -Action $a2 -Trigger $t2 -Settings $s2 `
  -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Write-Output 'done'
