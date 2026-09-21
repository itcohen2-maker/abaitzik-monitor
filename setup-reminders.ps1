# תזכורות לתאריך: remind.js רץ כל בוקר ב-09:00 ושולח את מה שהגיע זמנו.
# רוב הימים אין כלום ולא יוצאת אף הודעה. תזכורת נשלחת פעם אחת בלבד.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node).Source

$a = New-ScheduledTaskAction -Execute $node -Argument 'remind.js' -WorkingDirectory $here
$t = New-ScheduledTaskTrigger -Daily -At 09:00
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikReminders' -Action $a -Trigger $t -Settings $s -Force | Out-Null

Write-Output 'done'
