# משימות מהשרת למחשב: בדיקה כל דקה, בלי חלון.
# רוב הדקות זו קריאת ssh אחת שלא מוצאת כלום, בלי קלוד ובלי טוקנים.
# כשהשרת סימן משימה, pc-pull.js מריץ סשן כאן ומחזיר את התשובה לשרשור.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$a = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument "`"$here\run-hidden.vbs`" C:\Progra~1\nodejs\node.exe pc-pull.js" `
  -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 1)
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName 'AbaItzikPcPull' -Action $a -Trigger $t -Settings $s -Force | Out-Null

Write-Output 'done'
