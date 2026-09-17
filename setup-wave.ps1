# שעון הגלים: node wave.js כל דקה בין 07:00 ל-23:00, כל יום.
#
# הטריגר הוא יומי ולא חד פעמי בכוונה. משימה חד פעמית עם חזרה של 16 שעות
# עובדת יפה עד 23:00 ואז נגמרת בשקט, ולמחרת בבוקר אין גל ואף אחד לא מקבל
# הודעה על זה. איציק אישר את המעבר ליומי ב-17.9.
#
# wave.js עצמו מחליט אם הדקה הזאת היא שעת גל, ולכן הרצה בדקה ריקה לא
# עושה כלום ולא שולחת שום התראה. יש נעילה, אז גם הרצה כפולה בטוחה.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node).Source

$a = New-ScheduledTaskAction -Execute $node -Argument 'wave.js' -WorkingDirectory $here

# New-ScheduledTaskTrigger לא מקבל חזרה יחד עם -Daily בגרסה הזאת של
# PowerShell, ולכן בונים טריגר חד פעמי רק כדי לשאול ממנו את דפוס החזרה.
$t = New-ScheduledTaskTrigger -Daily -At 07:00
$rep = (New-ScheduledTaskTrigger -Once -At 07:00 `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration (New-TimeSpan -Hours 16)).Repetition
$t.Repetition = $rep

$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 14)

Register-ScheduledTask -TaskName 'AbaItzikWave' -Action $a -Trigger $t -Settings $s -Force | Out-Null

$info = Get-ScheduledTaskInfo -TaskName 'AbaItzikWave'
Write-Output ('done, next: ' + $info.NextRunTime)
