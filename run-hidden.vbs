' Runs a command with no window. Scheduled tasks call this instead of cmd.exe
' directly, because a console task flashes a window on Itzik's screen every run.
' Usage: wscript.exe run-hidden.vbs <command line>
Dim args, i, cmd
Set args = WScript.Arguments
For i = 0 To args.Count - 1
  If i > 0 Then cmd = cmd & " "
  cmd = cmd & args(i)
Next
Set s = CreateObject("WScript.Shell")
s.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit s.Run("cmd.exe /c " & cmd, 0, True)
