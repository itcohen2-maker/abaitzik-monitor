@echo off
rem שומר המאזין. מפעיל אותו, וכשהוא נופל מרים אותו שוב אחרי חמש שניות.
rem בלי זה, נפילה אחת מחזירה אותנו למצב שבו הודעות של איציק יושבות בערוץ
rem ואף אחד לא יודע. היומן נשמר כדי שיהיה מה לקרוא אחרי נפילה.
cd /d "%~dp0"
:loop
echo [%date% %time%] starting listener >> "data\status\listen.log"
node listen.js >> "data\status\listen.log" 2>&1
echo [%date% %time%] listener exited, restarting >> "data\status\listen.log"
timeout /t 5 /nobreak > nul
goto loop
