#!/bin/bash
# 28.9.2026, Itzik: "הפרדה מוחלטת". Finishes moving Ilay's monitor to its own
# Linux user (ily). Already done before this: the user, the move of the folder
# to /home/ily/ily-monitor, permissions, the unit files, the self sync timer.
# Itzik runs this himself, as root:
#   ssh -t -i C:\Users\User\.ssh\monitor_server root@178.105.63.97 bash /home/monitor/abaitzik-monitor/setup/separate-ily.sh
set -e
echo $(( $(date +%s) + 1800 )) > /run/monitor-maintenance-until

# 1. The page ilay.abaitzik.com is served from the new place.
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-20260928
sed -i "s#/home/monitor/ily-monitor#/home/ily/ily-monitor#g" /etc/caddy/Caddyfile
systemctl reload caddy

# 2. The keepalive watches the new place, and the self sync timer.
sed -i "s#/home/monitor/ily-monitor#/home/ily/ily-monitor#g" /usr/local/bin/monitor-keepalive.sh
grep -q "monitor-sync-ily.timer" /usr/local/bin/monitor-keepalive.sh || \
  sed -i "s#^monitor-watchdog-ily.timer|/home/ily/ily-monitor\"#monitor-watchdog-ily.timer|/home/ily/ily-monitor\nmonitor-sync-ily.timer|/home/ily/ily-monitor\"#" /usr/local/bin/monitor-keepalive.sh

# 3. Itzik's health check finds Ilay in the new place, and no longer syncs into it.
T=/home/monitor/abaitzik-monitor/data/tenants/tenants/ily.json
sudo -u monitor node -e "const f='$T',fs=require('fs'),t=JSON.parse(fs.readFileSync(f));t.dir='/home/ily/ily-monitor';t.selfSync=true;t.user='ily';fs.writeFileSync(f,JSON.stringify(t,null,1))"

# 4. Claude for Ilay's answers. Until Ilay signs in with his own account, his
#    answers run on Itzik's Claude subscription (Itzik pays for this server).
grep "^CLAUDE_CODE_OAUTH_TOKEN=" /etc/monitor.env > /etc/ily.env
chown root:ily /etc/ily.env; chmod 640 /etc/ily.env
for u in monitor-worker-ily monitor-watchdog-ily monitor-listen-ily; do
  grep -q "^EnvironmentFile=" /etc/systemd/system/$u.service || \
    sed -i "s#^\[Service\]#[Service]\nEnvironmentFile=/etc/ily.env#" /etc/systemd/system/$u.service
done

# 5. Nothing of Itzik's is reachable from Ilay's user.
chmod 750 /home/monitor

# 6. Start everything and show it.
systemctl daemon-reload
systemctl start monitor-listen-ily monitor-browser-ily monitor-setup-ily
systemctl enable --now monitor-worker-ily.timer monitor-watchdog-ily.timer monitor-sync-ily.timer
rm -f /run/monitor-maintenance-until
sleep 5
systemctl is-active monitor-listen-ily monitor-worker-ily.timer monitor-watchdog-ily.timer monitor-sync-ily.timer monitor-browser-ily monitor-setup-ily
echo "ily cannot read Itzik's mail password:"; sudo -u ily cat /etc/monitor-mail.env >/dev/null 2>&1 && echo "PROBLEM" || echo "ok, blocked"
echo "ily cannot enter Itzik's folder:"; sudo -u ily ls /home/monitor/abaitzik-monitor >/dev/null 2>&1 && echo "PROBLEM" || echo "ok, blocked"
echo "סיום."
