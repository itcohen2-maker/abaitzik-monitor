# היסטוריית הפריסות בוורסל למנהל: כל יום ב 07:10, קריאה בלבד ושליחה לשרת.
# רק במחשב של איציק, כי רק כאן ורסל מחובר.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $here 'run-hidden.vbs') + '" node vercel-check.js') -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Daily -At 07:10
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikVercelCheck' -Action $a -Trigger $t -Settings $s -Force | Out-Null
Write-Output 'done'
