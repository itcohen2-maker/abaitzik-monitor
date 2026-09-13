
  $a2 = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c exit'
  $t2 = New-ScheduledTaskTrigger -Daily -At 06:55
  $s2 = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  $p2 = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  try { Register-ScheduledTask -TaskName 'AbaItzikMorningWake' -Action $a2 -Trigger $t2 -Settings $s2 -Principal $p2 -Force | Out-Null; 'ok' }
  catch { 'ERR: ' + $_.Exception.Message }

