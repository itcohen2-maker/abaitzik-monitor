#!/bin/bash
# 6.10.2026. The two timers that keep Home Style's screens fresh. Run as root.
#  hs:   07:30 Jerusalem, brief + Excel + page.
#  roni: the page is rebuilt every 30 minutes from the same shared table.
set -euo pipefail
HARD="NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX"
cat > /etc/systemd/system/monitor-ship-daily.service <<EOF2
[Unit]
Description=Home Style shipments: brief, Excel, page
[Service]
User=hs
Group=hs
Environment=HOME=/home/hs
WorkingDirectory=/home/hs/homestyle-monitor
$HARD
ReadWritePaths=/home/hs /srv/homestyle
Type=oneshot
ExecStart=/bin/sh tools/ship-daily.sh
StandardOutput=append:/var/log/monitor-ship-hs.log
StandardError=append:/var/log/monitor-ship-hs.log
EOF2
cat > /etc/systemd/system/monitor-ship-daily.timer <<EOF2
[Unit]
Description=Home Style daily brief
[Timer]
OnCalendar=*-*-* 07:30:00 Asia/Jerusalem
Persistent=true
[Install]
WantedBy=timers.target
EOF2
cat > /etc/systemd/system/monitor-shipbuild-roni.service <<EOF2
[Unit]
Description=Roni page from the shared shipments table
[Service]
User=roni
Group=roni
Environment=HOME=/home/roni
WorkingDirectory=/home/roni/roni-monitor
$HARD
ReadWritePaths=/home/roni
Type=oneshot
ExecStart=/bin/sh -c 'node build.js | tail -1 && chmod -R o+rX docs'
StandardOutput=append:/var/log/monitor-ship-roni.log
StandardError=append:/var/log/monitor-ship-roni.log
EOF2
cat > /etc/systemd/system/monitor-shipbuild-roni.timer <<EOF2
[Unit]
Description=Roni page every 30 minutes
[Timer]
OnBootSec=3min
OnUnitActiveSec=30min
[Install]
WantedBy=timers.target
EOF2
for f in /var/log/monitor-ship-hs.log /var/log/monitor-ship-roni.log; do touch $f; done
chown hs:hs /var/log/monitor-ship-hs.log; chown roni:roni /var/log/monitor-ship-roni.log
chmod 640 /var/log/monitor-ship-hs.log /var/log/monitor-ship-roni.log
systemctl daemon-reload
systemctl enable --now monitor-ship-daily.timer monitor-shipbuild-roni.timer
systemctl list-timers | grep -E "ship"
