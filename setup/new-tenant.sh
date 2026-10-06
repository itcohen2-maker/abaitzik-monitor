#!/bin/bash
# New customer monitor on this server, hardened. 6.10.2026, Home Style.
#
#   bash setup/new-tenant.sh <id> <user> <host> <owner> <title> <welcome> <screens-csv> <profile-file> [shipments-dir] [ro]
#
# Run as root. Everything a customer's monitor needs, and nothing it does not:
#  - its own Linux user with no login shell, home closed to the other tenants;
#  - the code is a clone of the public repository, synced every 5 minutes, and
#    the customer's own instance.json and profile are immutable (chattr +i);
#  - the page is sealed with a 14 digit passphrase under 600000 rounds, which a
#    stolen copy of the public files cannot brute force (a six digit code can);
#  - no setup endpoint: that flow resets the code to six digits;
#  - every unit runs with NoNewPrivileges, a private /tmp, a read only system
#    and write access to its own folder only; the Claude token reaches the
#    answering worker alone, not the listener or the watchdog.
# The passphrase is printed once and written to /root/tenant-codes/<id>.txt.
set -euo pipefail
ID=$1; U=$2; HOST=$3; OWNER=$4; TITLE=$5; WELCOME=$6; SCREENS=$7; PROFILE=$8; SHIP=${9:-}; RO=${10:-}
DIR=/home/$U/$ID-monitor
PUB=https://github.com/itcohen2-maker/abaitzik-monitor.git
TEN=/home/monitor/abaitzik-monitor/data/tenants/tenants
echo $(( $(date +%s) + 900 )) > /run/monitor-maintenance-until

id "$U" >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin "$U"
chmod 711 /home/$U
[ -d "$DIR" ] || sudo -H -u "$U" git clone -q "$PUB" "$DIR"
cd "$DIR"
sudo -H -u "$U" git remote rename origin code 2>/dev/null || true
# The branch must track a private "origin" that does not exist (as Ilay's does), never the public
# code remote: the listener runs `pull --rebase -X theirs` and would pull Itzik's published docs/
# over the customer's page, and could push the customer's docs into the public repository.
sudo -H -u "$U" git remote get-url origin >/dev/null 2>&1 || sudo -H -u "$U" git remote add origin "git@github.com:itcohen2-maker/$ID-monitor.git"
sudo -H -u "$U" git remote set-url --push code no-push-allowed
sudo -H -u "$U" git config branch.main.remote origin
sudo -H -u "$U" git config branch.main.merge refs/heads/main
chmod 711 "$DIR"
sudo -H -u "$U" rm -rf docs
sudo -H -u "$U" mkdir -p data/chat data/reports data/tasks data/reminders data/inbox data/status data/files-private
chmod 751 data; chmod 755 data/status
for d in chat reports tasks reminders inbox; do sudo -H -u "$U" mkdir -p data/$d/$d; chmod 750 data/$d data/$d/$d; done
chmod 750 data/files-private
sudo -H -u "$U" git config user.email "$ID@abaitzik.local"; sudo -H -u "$U" git config user.name "$ID monitor"

# instance.json, keys, passphrase, profile
python3 - "$ID" "$HOST" "$OWNER" "$TITLE" "$WELCOME" "$SCREENS" "$SHIP" "$DIR" "$U" <<'PY'
import json, os, secrets, sys, base64, pwd, grp
ID, HOST, OWNER, TITLE, WELCOME, SCREENS, SHIP, DIR, U = sys.argv[1:10]
uid, gid = pwd.getpwnam(U).pw_uid, pwd.getpwnam(U).pw_gid
def put(path, text, mode):
    with open(path, 'w', encoding='utf-8') as f: f.write(text)
    os.chmod(path, mode); os.chown(path, uid, gid)
inst = {"name": ID, "owner": OWNER, "publicUrl": "https://%s/" % HOST, "basePath": "/", "origin": "https://%s" % HOST,
        "mailbox": "", "dataDir": "data", "taskPrefix": ID, "pageTitle": TITLE, "appTitle": "המוניטור",
        "screens": [s for s in SCREENS.split(",") if s], "chromeProfile": "none", "memoryDir": None, "driveFolder": "",
        "computer": None, "phone": None, "welcome": WELCOME}
if SHIP: inst["shipmentsDir"] = SHIP
put(DIR + "/instance.json", json.dumps(inst, ensure_ascii=False, indent=1), 0o644)
keys = {"_why": "נושאי ntfy הם סיסמה. לא נכנסים לגיט.", "ntfyIn": "%s-in-%s" % (ID, secrets.token_hex(16)),
        "ntfyLive": "%s-live-%s" % (ID, secrets.token_hex(16)), "ntfyOut": "%s-out-%s" % (ID, secrets.token_hex(16)), "mail": ""}
put(DIR + "/data/keys.json", json.dumps(keys, ensure_ascii=False), 0o600)
code = "".join(str(secrets.randbelow(10)) for _ in range(14))
put(DIR + "/gate-key.txt", code + "\n", 0o600)
put(DIR + "/gate-params.json", json.dumps({"salt": base64.b64encode(secrets.token_bytes(24)).decode(), "rounds": 600000}), 0o600)
os.makedirs("/root/tenant-codes", exist_ok=True); os.chmod("/root/tenant-codes", 0o700)
with open("/root/tenant-codes/%s.txt" % ID, "w") as f: f.write("%s  https://%s/\n" % (code, HOST))
os.chmod("/root/tenant-codes/%s.txt" % ID, 0o600)
print("קוד הכניסה ל %s: %s" % (ID, code))
PY
install -o "$U" -g "$U" -m 640 "$PROFILE" data/profile.md

# first build, sealed; then readable by the web server and nothing else
sudo -H -u "$U" node build.js 2>&1 | tail -2
chmod -R o+rX docs
grep -q "gate" docs/index.html || { echo "הדף לא נעול, עוצר"; exit 1; }

# the Claude token: the answering worker only
grep "^CLAUDE_CODE_OAUTH_TOKEN=" /etc/monitor.env > /etc/$U.env
chown root:"$U" /etc/$U.env; chmod 640 /etc/$U.env

HARD="NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/home/$U
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX"
[ -n "$SHIP" ] && [ -z "$RO" ] && HARD="$HARD
ReadWritePaths=/srv/homestyle"
SU="User=$U
Group=$U
Environment=HOME=/home/$U
WorkingDirectory=$DIR"
unit() { # name, body
  printf '%s\n' "$2" > /etc/systemd/system/$1
}
unit monitor-listen-$ID.service "[Unit]
Description=monitor listener, $ID
After=network-online.target
Wants=network-online.target
[Service]
$SU
$HARD
Type=simple
ExecStart=/usr/bin/node listen.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/monitor-listen-$ID.log
StandardError=append:/var/log/monitor-listen-$ID.log
[Install]
WantedBy=multi-user.target"
unit monitor-worker-$ID.service "[Unit]
Description=monitor worker, $ID
After=network-online.target
[Service]
$SU
$HARD
EnvironmentFile=/etc/$U.env
Type=oneshot
KillMode=process
ExecStart=/usr/bin/node worker.js
StandardOutput=append:/var/log/monitor-worker-$ID.log
StandardError=append:/var/log/monitor-worker-$ID.log"
unit monitor-worker-$ID.timer "[Unit]
Description=worker every minute, $ID
[Timer]
Unit=monitor-worker-$ID.service
OnBootSec=60
OnUnitActiveSec=60
AccuracySec=5
[Install]
WantedBy=timers.target"
unit monitor-watchdog-$ID.service "[Unit]
Description=watchdog, $ID
[Service]
$SU
$HARD
Type=oneshot
Environment=WATCHDOG_WORKER_UNIT=monitor-worker-$ID
Environment=WORKER_LOG=/var/log/monitor-worker-$ID.log
Environment=WATCHDOG_LOG=/var/log/monitor-watchdog-$ID.log
ExecStart=/usr/bin/node watchdog.js
StandardOutput=append:/var/log/monitor-watchdog-$ID.log
StandardError=append:/var/log/monitor-watchdog-$ID.log"
unit monitor-watchdog-$ID.timer "[Unit]
Description=watchdog every minute, $ID
[Timer]
Unit=monitor-watchdog-$ID.service
OnBootSec=90
OnUnitActiveSec=60
[Install]
WantedBy=timers.target"
unit monitor-sync-$ID.service "[Unit]
Description=$ID pulls every fix from the public code
After=network-online.target
[Service]
$SU
$HARD
Type=oneshot
ExecStart=/usr/bin/node tenants-sync.js --self
StandardOutput=append:/var/log/monitor-sync-$ID.log
StandardError=append:/var/log/monitor-sync-$ID.log"
unit monitor-sync-$ID.timer "[Unit]
Description=$ID self sync every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target"
# The Claude CLI needs a normal /tmp and writes outside a strict sandbox: the answering worker
# gets a lighter one than the other units (6.10: with strict it died on mkdir /tmp/claude-<uid>).
mkdir -p /etc/systemd/system/monitor-worker-$ID.service.d
printf '[Service]\nPrivateTmp=no\nProtectSystem=full\n' > /etc/systemd/system/monitor-worker-$ID.service.d/claude.conf
for f in listen worker watchdog sync; do touch /var/log/monitor-$f-$ID.log; chown "$U":"$U" /var/log/monitor-$f-$ID.log; chmod 640 /var/log/monitor-$f-$ID.log; done

# the web server: security headers, no API route, nothing but docs/
cp -n /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%Y%m%d)
grep -q "^$HOST" /etc/caddy/Caddyfile || cat >> /etc/caddy/Caddyfile <<EOF

$HOST {
	header {
		Cache-Control "no-cache"
		X-Robots-Tag "noindex, nofollow"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
		Strict-Transport-Security "max-age=31536000"
		Permissions-Policy "camera=(self), microphone=(self), geolocation=()"
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://ntfy.sh; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
		-Server
	}
	@hidden path_regexp hid ^/(\.|api/|gate-|instance\.json|CLAUDE)
	handle @hidden {
		respond 404
	}
	handle {
		root * $DIR/docs
		try_files {path} {path}.html /index.html
		file_server
	}
}
EOF
caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && systemctl reload caddy

# lock the customer's own settings, register with Itzik's monitor, keep alive
chattr +i instance.json data/profile.md
sudo -u monitor node -e '
const fs=require("fs"),f=process.argv[1]+"/"+process.argv[2]+".json";
fs.mkdirSync(process.argv[1],{recursive:true});
fs.writeFileSync(f,JSON.stringify({id:process.argv[2],title:process.argv[3],dir:process.argv[4],listener:"monitor-listen-"+process.argv[2],timer:"monitor-worker-"+process.argv[2]+".timer",state:"unknown",problems:[],selfSync:true,user:process.argv[5],host:process.argv[6],requests:[]},null,1));
' "$TEN" "$ID" "$TITLE" "$DIR" "$U" "$HOST"
grep -q "monitor-listen-$ID.service" /usr/local/bin/monitor-keepalive.sh || \
  sed -i -E 's#^(monitor-watchdog-ily\.timer\|[^"]*)"#\1\nmonitor-listen-'"$ID"'.service|'"$DIR"'\nmonitor-worker-'"$ID"'.timer|'"$DIR"'\nmonitor-watchdog-'"$ID"'.timer|'"$DIR"'\nmonitor-sync-'"$ID"'.timer|'"$DIR"'"#' /usr/local/bin/monitor-keepalive.sh

systemctl daemon-reload
systemctl enable --now monitor-listen-$ID.service monitor-worker-$ID.timer monitor-watchdog-$ID.timer monitor-sync-$ID.timer
rm -f /run/monitor-maintenance-until
sleep 4
systemctl is-active monitor-listen-$ID.service monitor-worker-$ID.timer monitor-watchdog-$ID.timer monitor-sync-$ID.timer
echo "סיום: $ID"
