#!/bin/bash
# 6.10.2026. The two timers that keep Home Style's screens fresh. Run as root.
#  hs:   07:30 Jerusalem, brief + Excel + page.
#  roni, hs, yael: each page is rebuilt every 30 minutes from the same shared table.
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
# Every Home Style page is rebuilt every 30 minutes from the shared table, so a
# "טיפלתי" marked on one phone reaches the others within half an hour.
# Users: roni (read only), hs and yael (both mark). Run again after a new one.
# The two writers (hs, yael) may replace files in the table folder; the group, which
# is how Roni reads, stays read only. Not chmod g+w: that would let Roni write.
# The default entries keep each new file (handled.json) readable to the group only.
W="u:hs:rwx"; id yael >/dev/null 2>&1 && W="$W,u:yael:rwx"
setfacl -m "$W" /srv/homestyle/shipments
setfacl -d -m "u::rw,g::r,o::-,${W//rwx/rw}" /srv/homestyle/shipments
for U in roni hs yael; do
  id "$U" >/dev/null 2>&1 || continue
  D=$(ls -d /home/$U/*-monitor | head -1)
  RW=/home/$U; [ "$U" = roni ] || RW="/home/$U /srv/homestyle"
  cat > /etc/systemd/system/monitor-shipbuild-$U.service <<EOF2
[Unit]
Description=$U page from the shared shipments table
[Service]
User=$U
Group=$U
Environment=HOME=/home/$U
WorkingDirectory=$D
$HARD
ReadWritePaths=$RW
Type=oneshot
ExecStart=/bin/sh -c 'node build.js | tail -1 && chmod -R o+rX docs'
StandardOutput=append:/var/log/monitor-ship-$U.log
StandardError=append:/var/log/monitor-ship-$U.log
EOF2
  cat > /etc/systemd/system/monitor-shipbuild-$U.timer <<EOF2
[Unit]
Description=$U page every 30 minutes
[Timer]
OnBootSec=3min
OnUnitActiveSec=30min
[Install]
WantedBy=timers.target
EOF2
  touch /var/log/monitor-ship-$U.log; chown $U:$U /var/log/monitor-ship-$U.log; chmod 640 /var/log/monitor-ship-$U.log
  systemctl daemon-reload
  systemctl enable --now monitor-shipbuild-$U.timer
done
systemctl daemon-reload
systemctl enable --now monitor-ship-daily.timer
systemctl list-timers | grep -E "ship"
