# דוח הרשתות היומי: כל יום ב-07:00, עוקבים בכל רשת וצפיות בסטורי.
# רק במחשב של איציק, כי צריך את הדפדפן המחובר שלו. בשרת אין דפדפן.
# net-daily.js מחזיק חותם ליום, אז ריצה כפולה לא עושה כלום.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $here 'run-hidden.vbs') + '" node net-daily.js') -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Daily -At 07:00
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikNetDaily' -Action $a -Trigger $t -Settings $s -Force | Out-Null

Write-Output 'done'
