#!/bin/bash
# 3.11.2026: Fireflies meetings into a customer's "🎙️ סיכומי פגישות" (fireflies-pull.js, lib/biz-home.js).
# Usage, as root: bash setup/enable-fireflies.sh <id>
# Makes monitor-fireflies-<id>.service and .timer (every 30 minutes, as the customer's own user,
# hardened like the other units of setup/new-tenant.sh). Safe to run again. With no firefliesKey in
# the customer's data/keys.json the round leaves quietly, so it can be enabled before the key arrives.
set -euo pipefail
ID="${1:?usage: enable-fireflies.sh <id>}"
[[ "$ID" =~ ^[a-z0-9-]+$ ]] || { echo "bad id"; exit 1; }
U="$ID"; DIR="/home/$U/$ID-monitor"
[ -d "$DIR" ] || { echo "no $DIR"; exit 1; }
cat > /etc/systemd/system/monitor-fireflies-$ID.service <<EOF
[Unit]
Description=$ID meetings from Fireflies
After=network-online.target
[Service]
User=$U
Group=$U
Environment=HOME=/home/$U
WorkingDirectory=$DIR
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/home/$U
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
Type=oneshot
TimeoutStartSec=300
ExecStart=/usr/bin/node fireflies-pull.js
StandardOutput=append:/var/log/monitor-fireflies-$ID.log
StandardError=append:/var/log/monitor-fireflies-$ID.log
EOF
cat > /etc/systemd/system/monitor-fireflies-$ID.timer <<EOF
[Unit]
Description=$ID Fireflies every 30 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=30min
[Install]
WantedBy=timers.target
EOF
touch /var/log/monitor-fireflies-$ID.log
systemctl daemon-reload
systemctl enable --now monitor-fireflies-$ID.timer
echo "monitor-fireflies-$ID.timer: $(systemctl is-active monitor-fireflies-$ID.timer)"
