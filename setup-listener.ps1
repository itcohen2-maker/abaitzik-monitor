# המאזין: רץ תמיד, ומתרומם לבד.
#
# עד 13.9 שום דבר במחשב לא נגע בערוץ הגיבוי. הדף שלח ל-ntfy, ntfy החזיק,
# וההודעה הגיעה למחשב רק כשסשן קלוד הקליד node inbox.js. שש הודעות קוליות
# של איציק חיכו שם, הוותיקה תשעים ושבע דקות. זה מה שהמשימה הזאת מבטלת.
#
# הרצה: powershell -ExecutionPolicy Bypass -File setup-listener.ps1
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node).Source
$log  = Join-Path $here 'data\status\listen.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

# cmd עוטף את ההרצה רק כדי להסיט את הפלט ליומן. בלי חלון, בלי מסך.
$cmd = '/c ""' + $node + '" "' + (Join-Path $here 'listen.js') + '" >> "' + $log + '" 2>&1"'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory $here

# שני טריגרים: בכניסה למערכת, ועוד אחד שמנסה מדי חמש דקות. השני הוא הרשת
# הביטחונית: אם התהליך נפל, המשימה תרים אותו בלי שאף אחד ישים לב.
$t1 = New-ScheduledTaskTrigger -AtLogOn
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date) `
      -RepetitionInterval (New-TimeSpan -Minutes 5)

# IgnoreNew: אם הוא כבר רץ, אל תפתח עוד אחד. ExecutionTimeLimit 0: לרוץ בלי
# הגבלת זמן, כי זה בדיוק התפקיד.
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
       -StartWhenAvailable -MultipleInstances IgnoreNew `
       -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 99 `
       -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName 'AbaItzikListener' -Action $action `
  -Trigger $t1, $t2 -Settings $set -Force | Out-Null

Start-ScheduledTask -TaskName 'AbaItzikListener'
Write-Host 'AbaItzikListener registered and started.'
