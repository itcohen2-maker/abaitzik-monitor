#!/bin/bash
# 24.11.2026: the calls archive for a customer (calls-round.js, lib/calls-*.js). Itzik: "צריך לעשות סיכומים ומין לוח בקרה".
# Usage, as root: bash setup/enable-calls.sh <id>
# Makes data/calls/..., the webhook secret, "calls": true in instance.json, and monitor-calls-<id>.service and .timer
# (every 2 minutes, as the customer's own user, hardened like enable-fireflies.sh; his own key from /etc/<id>.env).
# Safe to run again (keeps the secret). Spec: docs/superpowers/specs/2026-11-24-calls-archive-design.md
set -euo pipefail
ID="${1:?usage: enable-calls.sh <id>}"
[[ "$ID" =~ ^[a-z0-9-]+$ ]] || { echo "bad id"; exit 1; }
U="$ID"; DIR="/home/$U/$ID-monitor"
[ -d "$DIR" ] || { echo "no $DIR"; exit 1; }
MON=/home/monitor/abaitzik-monitor
C="$DIR/data/calls"
for d in items inbox inbox/done inbox/bad; do install -d -o "$U" -g "$U" -m 0750 "$C/$d"; done
chown "$U":"$U" "$C"
# the central bridge (user monitor) reads the index and writes inbox files, like data/chat/chat
setfacl -R -m "u:monitor:rwx" "$C"
setfacl -R -d -m "u:monitor:rw,u:$U:rw" "$C"
# the webhook secret, in Itzik's folder only (an existing secret for this id is kept)
HK="$MON/data/calls-hooks.json"
SECRET=$(HK="$HK" ID="$ID" node -e '
const fs=require("fs"),c=require("crypto");let j={};try{j=JSON.parse(fs.readFileSync(process.env.HK,"utf8"))}catch(e){}
let s=Object.keys(j).find(k=>j[k]===process.env.ID);
if(!s){s=c.randomBytes(16).toString("hex");j[s]=process.env.ID;fs.writeFileSync(process.env.HK,JSON.stringify(j,null,1));}
process.stdout.write(s);')
chown monitor:monitor "$HK"; chmod 0600 "$HK"
# "calls": true in his instance.json (chattr -i / +i as signup-personalize.js does)
IJ="$DIR/instance.json"
if [ -f "$IJ" ]; then
  LK=0; lsattr -d "$IJ" 2>/dev/null | cut -d' ' -f1 | grep -q i && LK=1
  if [ "$LK" = 1 ]; then chattr -i "$IJ"; fi
  IJ="$IJ" node -e 'const fs=require("fs");const f=process.env.IJ;const j=JSON.parse(fs.readFileSync(f,"utf8"));j.calls=true;fs.writeFileSync(f,JSON.stringify(j,null,1));'
  if [ "$LK" = 1 ]; then chattr +i "$IJ"; fi
fi
cat > /etc/systemd/system/monitor-calls-$ID.service <<EOT
[Unit]
Description=$ID calls archive round
After=network-online.target
[Service]
UMask=0027
User=$U
Group=$U
Environment=HOME=/home/$U
EnvironmentFile=-/etc/$ID.env
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
ExecStart=/usr/bin/node --no-warnings calls-round.js
StandardOutput=append:/var/log/monitor-calls-$ID.log
StandardError=append:/var/log/monitor-calls-$ID.log
EOT
cat > /etc/systemd/system/monitor-calls-$ID.timer <<EOT
[Unit]
Description=$ID calls archive every 2 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOT
touch /var/log/monitor-calls-$ID.log; chown "$U":"$U" /var/log/monitor-calls-$ID.log; chmod 640 /var/log/monitor-calls-$ID.log
systemctl daemon-reload
systemctl enable --now monitor-calls-$ID.timer
echo "monitor-calls-$ID.timer: $(systemctl is-active monitor-calls-$ID.timer)"
HOST=$(ID="$ID" MON="$MON" node -e 'const fs=require("fs");try{process.stdout.write(String(JSON.parse(fs.readFileSync(process.env.MON+"/data/tenants/tenants/"+process.env.ID+".json","utf8")).host||""))}catch(e){}')
if [ -n "$HOST" ]; then echo "webhook: https://$HOST/api/calls/in/$SECRET"; else echo "webhook path: /api/calls/in/$SECRET (no host on record)"; fi
