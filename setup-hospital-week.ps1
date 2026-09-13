# משבית את שנת הלילה לשבוע בית החולים, ומחזיר את ההשכמה.
#
# 13.9.2026 בלילה. איציק נכנס לבית החולים והמוניטור הוא קו התקשורת שלו.
# המשימה AbaItzikNightSleep מרדימה את המחשב ב-01:00, ומשימת ההשכמה של
# 06:00 כבר לא קיימת. כלומר הלילה הוא היה נרדם ולא קם, ושבוע של הודעות
# היה יושב על השרת בלי שאף אחד קולט. הקלטה קולית נמחקת שם אחרי שלוש
# שעות, אז זה לא עיכוב אלא אובדן.
#
# מה שזה עושה: מכבה את ההרדמה, ומחזיר השכמה יומית כרשת ביטחון למקרה
# שהמחשב נרדם מסיבה אחרת.
#
# להחזיר אחרי שהוא חוזר:  Enable-ScheduledTask -TaskName AbaItzikNightSleep
$ErrorActionPreference = 'Stop'

Disable-ScheduledTask -TaskName 'AbaItzikNightSleep' | Out-Null
Write-Host 'AbaItzikNightSleep disabled.'

# ההשכמה: הפעולה זניחה, מה שמעיר הוא הדגל WakeToRun.
$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c exit'
$t = New-ScheduledTaskTrigger -Daily -At 06:00
$s = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries `
     -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AbaItzikMorningWake' -Action $a -Trigger $t `
  -Settings $s -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Host 'AbaItzikMorningWake restored for 06:00.'

powercfg -setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg -SETACTIVE SCHEME_CURRENT
Write-Host 'Timers may wake the machine.'
