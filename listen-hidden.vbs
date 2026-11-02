' מפעיל את השומר בלי חלון. זה מה שיושב בתיקיית ההפעלה של ווינדוס,
' כי רישום משימה מתוזמנת דורש הרשאת מנהל וזאת לא הייתה לי.
Set s = CreateObject("WScript.Shell")
s.Run """" & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\listen-guard.cmd""", 0, False
