# התראת סוללה: בדיקה כל 2 דקות, הודעה רק כשמשהו משתנה.
# battery.js מחזיק מצב ב-data/battery.json, אז גם 720 ריצות ביום שולחות
# רק כמה הודעות: החוט נותק, מתחת ל-20, מתחת ל-10, החוט חזר.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$a = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument "`"$here\run-hidden.vbs`" C:\Progra~1\nodejs\node.exe battery.js" `
  -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 2)
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'AbaItzikBattery' -Action $a -Trigger $t -Settings $s -Force | Out-Null

Write-Output 'done'
