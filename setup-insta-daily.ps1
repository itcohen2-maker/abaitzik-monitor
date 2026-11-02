# דוח האינסטגרם היומי: כל יום ב-07:30, 7 הימים האחרונים מתוך הפרופיל המחובר.
# רק במחשב של איציק, כי צריך את הדפדפן המחובר שלו. בשרת אין דפדפן.
# insta-daily.js מחזיק חותם ליום, אז ריצה כפולה לא עושה כלום.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $here 'run-hidden.vbs') + '" node insta-daily.js') -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Daily -At 07:30
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikInstaDaily' -Action $a -Trigger $t -Settings $s -Force | Out-Null

Write-Output 'done'
