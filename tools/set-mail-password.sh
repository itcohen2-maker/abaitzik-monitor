#!/bin/bash
# Itzik runs this himself to give the server sessions read-only access to his mail.
# ssh -t -i C:\Users\User\.ssh\monitor_server root@178.105.63.97 bash /home/monitor/abaitzik-monitor/tools/set-mail-password.sh
read -r -p "סיסמת האפליקציה (16 אותיות): " P
P="${P// /}"
umask 027
printf 'GMAIL_USER=itcohen2@gmail.com\nGMAIL_APP_PASSWORD=%s\n' "$P" > /etc/monitor-mail.env
chown root:monitor /etc/monitor-mail.env
chmod 640 /etc/monitor-mail.env
clear
echo "נשמר. בודק..."
sudo -u monitor python3 /home/monitor/abaitzik-monitor/tools/mail-search.py --days 2 --limit 2 && echo "עובד."
