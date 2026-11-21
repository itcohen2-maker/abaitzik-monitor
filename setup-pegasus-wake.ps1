# פגסוס כל 10 דקות, בלי חלון. מחליף את הטיימר שהיה בתוך סשן ומת איתו.
# כשפגסוס עובד, או כשהפעלה קודמת עוד רצה, הריצה מדלגת בלי קלוד ובלי טוקנים.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$a = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument "`"$here\run-hidden.vbs`" C:\Progra~1\nodejs\node.exe pegasus-wake.js" `
  -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) `
  -RepetitionInterval (New-TimeSpan -Minutes 10)
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName 'AbaItzikPegasusWake' -Action $a -Trigger $t -Settings $s -Force | Out-Null

Write-Output 'done'
