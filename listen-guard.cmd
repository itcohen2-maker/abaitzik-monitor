@echo off
rem שומר המאזין. כבוי מ-25.9.2026.
rem
rem המאזין עבר לשרת בענן, monitor-listen.service על 178.105.63.97, והוא רץ שם
rem גם כשהמחשב הזה כבוי. שני מאזינים על אותו ערוץ היו מעבדים כל הודעה פעמיים
rem ושולחים לאיציק שני אישורי קבלה, ולכן השומר הזה לא מרים יותר כלום.
rem
rem אם צריך להחזיר את המאזין למחשב, למשל אם השרת נפל, מחזירים את הלולאה
rem מההיסטוריה של הקובץ. קודם לעצור את השירות בשרת.
cd /d "%~dp0"
echo [%date% %time%] guard disabled, listener runs on the cloud server >> "data\status\listen.log"
exit /b 0
