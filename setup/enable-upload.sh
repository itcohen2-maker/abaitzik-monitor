#!/bin/bash
# Big file uploads for one customer's monitor (11.10.2026). Run as root:
#   bash setup/enable-upload.sh <id>        (id = the suffix of monitor-listen-<id>.service)
# new-tenant.sh calls it for every new customer, so nobody has to ask for it.
# Safe to run again: it keeps the port and the key it already gave.
#
# What it does, each customer apart from the others:
#   an 8 digit upKey in <dir>/data/keys.json (sealed in the page, signs uploads),
#   uploadUrl in the immutable instance.json, its own unit monitor-upload-<id>
#   as the customer's own user (it can write only that customer's data and its
#   own staging folder), a /up route in that customer's Caddy block, keepalive,
#   and a rebuild of the page. Itzik's own service (monitor-upload, 8791) is
#   not touched.
set -euo pipefail
ID="${1:?usage: enable-upload.sh <id>}"
[[ "$ID" =~ ^[a-z0-9_-]{1,32}$ ]] || { echo "bad id"; exit 1; }
LISTEN=/etc/systemd/system/monitor-listen-$ID.service
[ -f "$LISTEN" ] || { echo "no $LISTEN"; exit 1; }
DIR=$(grep -h '^WorkingDirectory=' "$LISTEN" | cut -d= -f2)
U=$(grep -h '^User=' "$LISTEN" | cut -d= -f2)
UNIT=monitor-upload-$ID.service
CODE=/home/monitor/abaitzik-monitor

# the port: keep the one this customer has, else the first free from 8792
if [ -f /etc/systemd/system/$UNIT ]; then
  PORT=$(grep -o 'UPLOAD_PORT=[0-9]*' /etc/systemd/system/$UNIT | cut -d= -f2)
else
  PORT=8792
  while grep -qs "UPLOAD_PORT=$PORT\b" /etc/systemd/system/monitor-upload-*.service || ss -ltn | grep -q "127.0.0.1:$PORT "; do PORT=$((PORT+1)); done
fi

# the key and the url (instance.json is immutable; unlock, write, lock again)
HOST=$(python3 - "$DIR" "$ID" <<'EOF'
import json, os, secrets, sys
d, tid = sys.argv[1], sys.argv[2]
kp = os.path.join(d, 'data', 'keys.json')
k = json.load(open(kp, encoding='utf8'))
if not str(k.get('upKey', '')).isdigit():
    k['upKey'] = '%08d' % secrets.randbelow(10**8)
    st = os.stat(kp)
    json.dump(k, open(kp, 'w', encoding='utf8'), ensure_ascii=False)
    os.chown(kp, st.st_uid, st.st_gid); os.chmod(kp, 0o600)
inst = json.load(open(os.path.join(d, 'instance.json'), encoding='utf8'))
from urllib.parse import urlparse
print(urlparse(inst.get('origin') or inst['publicUrl']).netloc)
EOF
)
NAME=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]+'/instance.json'))['name'])" "$DIR")
URL="https://$HOST/up/v1/$NAME/uploads"
chattr -i "$DIR/instance.json"
python3 - "$DIR/instance.json" "$URL" <<'EOF'
import json, sys
p, url = sys.argv[1], sys.argv[2]
d = json.load(open(p, encoding='utf8'))
d['uploadUrl'] = url
json.dump(d, open(p, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
EOF
chown "$U":"$U" "$DIR/instance.json"; chattr +i "$DIR/instance.json"

# the unit, as the customer's own user
touch /var/log/monitor-upload-$ID.log; chown "$U":"$U" /var/log/monitor-upload-$ID.log; chmod 640 /var/log/monitor-upload-$ID.log
cat > /etc/systemd/system/$UNIT <<EOF
[Unit]
Description=big file uploads, $ID
After=network-online.target

[Service]
User=$U
Group=$U
Environment=HOME=/home/$U
Environment=UPLOAD_PORT=$PORT
Environment=UPLOAD_ROOT=/var/lib/monitor-upload-$ID
Type=simple
WorkingDirectory=$DIR
StateDirectory=monitor-upload-$ID
StateDirectoryMode=0700
ExecStart=/usr/bin/node upload.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$DIR/data /var/lib/monitor-upload-$ID
PrivateTmp=true
StandardOutput=append:/var/log/monitor-upload-$ID.log
StandardError=append:/var/log/monitor-upload-$ID.log

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now $UNIT
systemctl restart $UNIT

# the route, first in this customer's block, so it wins over the page and @hidden.
# On ilay.abaitzik.com Itzik's own /up/* is already there: the customer's path
# is the narrower /up/v1/<name>/* and is put above it.
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-upload-$ID
python3 - "$HOST" "$NAME" "$PORT" <<'EOF'
import sys
host, name, port = sys.argv[1], sys.argv[2], sys.argv[3]
p = '/etc/caddy/Caddyfile'
lines = open(p, encoding='utf8').read().split('\n')
route = '/up/v1/%s/*' % name
start = next(i for i, l in enumerate(lines) if l.strip() == host + ' {')
end = next(i for i in range(start + 1, len(lines)) if lines[i] == '}')
block = '\n'.join(lines[start:end])
if route not in block:
    lines[start + 1:start + 1] = ['\t# big file uploads, setup/enable-upload.sh', '\thandle %s {' % route,
                                  '\t\treverse_proxy 127.0.0.1:%s' % port, '\t}']
open(p, 'w', encoding='utf8').write('\n'.join(lines))
EOF
if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl reload caddy
else cp /etc/caddy/Caddyfile.bak-upload-$ID /etc/caddy/Caddyfile; echo "caddy rejected the route, restored"; exit 1; fi

# keepalive, then the page with the new url and key
K=/usr/local/bin/monitor-keepalive.sh
grep -q "$UNIT" $K || sed -i -E 's#^(monitor-upload\.service\|[^"]*)$#\1\n'"$UNIT"'|'"$DIR"'#' $K
grep -q "$UNIT" $K || echo "note: add $UNIT to $K by hand"
(cd "$DIR" && sudo -u "$U" node build.js | tail -1)

sleep 2
echo "health: $(curl -s https://$HOST/up/v1/health)"
echo "done: $ID on 127.0.0.1:$PORT, $URL"
