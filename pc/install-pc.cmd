@echo off
chcp 65001 >nul
title המוניטור: חיבור המחשב
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-pc.ps1"
if errorlevel 1 (echo. & echo ההתקנה לא הושלמה. אפשר לצלם את המסך ולשלוח למוניטור.)
echo.
pause
