#!/bin/bash
# 4.11.2026: a customer's own WhatsApp number on their own monitor.
#
# (12.11.2026: for a Kapso number setup/wa-kapso-provision.sh runs this by itself, no token step.)
# Run as root once the customer's number is registered in Meta (through the
# verified business portfolio) and a token that can send for it exists:
#   setup/wa-tenant.sh <tenant> <phone_number_id> <owner_phone_972...> <port>
# Then put the token in place, as that user, never on the command line:
#   Get-Clipboard | ssh root@... "sudo -u <user> python3 /home/<user>/<dir>/setup/wa-set.py token"
#
# What it does:
#   1. writes the customer's data/wa.json (600): their phoneId, their owner on allow,
#      Meta's app secret and verify token copied from Itzik's (same app, same webhook);
#   2. a service monitor-wa-<tenant> running wa-bridge.js as that user on 127.0.0.1:<port>;
#   3. a route in Itzik's data/wa.json: messages to that number go to that port only.
# Rule: each monitor speaks only with its own owner. Never two monitors on one number.
set -euo pipefail
T="$1"; PID="$2"; OWNER="$3"; PORT="$4"
REC="/home/monitor/abaitzik-monitor/data/tenants/tenants/$T.json"
[ -f "$REC" ] || { echo "no tenant $T"; exit 1; }
U=$(node -e "console.log(require('$REC').user)"); D=$(node -e "console.log(require('$REC').dir)")
MINE=/home/monitor/abaitzik-monitor/data/wa.json
node -e "
const fs=require('fs');const m=JSON.parse(fs.readFileSync('$MINE','utf8'));
const f='$D/data/wa.json';let t={};try{t=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}
Object.assign(t,{verifyToken:m.verifyToken,appSecret:m.appSecret,graph:m.graph,appId:m.appId,phoneId:'$PID',allow:['$OWNER'],owner:'$OWNER'});
if(!t.token)t.token='';
fs.writeFileSync(f,JSON.stringify(t,null,1));
m.routes=m.routes||{};m.routes['$PID']={port:Number('$PORT'),tenant:'$T'};
fs.writeFileSync('$MINE',JSON.stringify(m,null,1));"
chown "$U:$U" "$D/data/wa.json"; chmod 600 "$D/data/wa.json"
chown monitor:monitor "$MINE"; chmod 600 "$MINE"
cat > /etc/systemd/system/monitor-wa-$T.service <<UNIT
[Unit]
Description=WhatsApp bridge for $T (routed from wa-bridge of abaitzik)
After=network-online.target
[Service]
User=$U
WorkingDirectory=$D
Environment=WA_PORT=$PORT
ExecStart=/usr/bin/node wa-bridge.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/monitor-wa-$T.log
StandardError=append:/var/log/monitor-wa-$T.log
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "monitor-wa-$T.service"
systemctl restart monitor-wa.service
# 12.11.2026: a Kapso number has no Meta token on purpose (kapsoKey in the same file, put there by
# setup/wa-kapso-provision.sh); wa-bridge and lib/wa-out.js accept an empty token when kapsoKey exists.
if node -e "process.exit(JSON.parse(require('fs').readFileSync('$D/data/wa.json','utf8')).kapsoKey?0:1)" 2>/dev/null; then
  echo "ok: $T on $PORT, route $PID (Kapso, no Meta token needed)."
else
  echo "ok: $T on $PORT, route $PID. The token is still empty until wa-set.py token runs."
fi
