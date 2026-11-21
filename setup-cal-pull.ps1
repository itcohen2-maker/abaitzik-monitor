# היומן למנהל: כל יום ב 07:15 ושוב ב 12:45, קריאה בלבד מיומן גוגל ושליחה לשרת.
# רק במחשב של איציק, כי רק כאן יש חיבור ליומן.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $here 'run-hidden.vbs') + '" node cal-pull.js') -WorkingDirectory $here
$t = @((New-ScheduledTaskTrigger -Daily -At 07:15), (New-ScheduledTaskTrigger -Daily -At 12:45))
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikCalPull' -Action $a -Trigger $t -Settings $s -Force | Out-Null
Write-Output 'done'
