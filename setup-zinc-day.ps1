# סיכום האבץ היומי: הודעה אחת ב-21:00, כל יום.
# הודעה אחת ביום ולא יותר. zinc-day.js מחזיק חותם ליום, אז גם אם המשימה
# רצה פעמיים לא תצא הודעה שנייה, ויום בלי אוכל רשום לא שולח כלום.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node).Source

$a = New-ScheduledTaskAction -Execute $node -Argument 'zinc-day.js' -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Daily -At 21:00
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikZincDay' -Action $a -Trigger $t -Settings $s -Force | Out-Null

Write-Output 'done'
