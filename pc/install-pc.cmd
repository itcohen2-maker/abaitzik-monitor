@echo off
rem ASCII only on purpose: cmd.exe misreads a UTF-8 batch file and closes at once (14.10, Rinat's PC).
cd /d "%~dp0"
if not exist "%~dp0config.json" (
  echo.
  echo The zip is not extracted. Right click the zip, choose Extract All, and run install-pc.cmd from the new folder.
  echo.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-pc.ps1"
echo.
if errorlevel 1 (echo Install did not finish. The monitor server already knows what failed.) else (echo Install finished.)
echo.
pause
