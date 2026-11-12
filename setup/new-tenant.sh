#!/bin/bash
# New customer monitor on this server, hardened. 6.10.2026, Home Style.
#
#   bash setup/new-tenant.sh <id> <user> <host> <owner> <title> <welcome> <screens-csv> <profile-file> [shipments-dir] [ro|rw] [home-tile]
#   bash setup/new-tenant.sh --from-intake <instance.json> <id> <user> <host> <profile-file> [shipments-dir] [ro|rw] [home-tile]
#
# --from-intake (24.10.2026): owner, title, welcome and screens come from the proposal that
# setup/intake-to-instance.js wrote from the questionnaire; computer, phone, biz, profile and
# intakeNotes are copied into instance.json too. The positional form above is unchanged.
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
INTAKE=""
if [ "${1:-}" = "--from-intake" ]; then
  INTAKE=$2
  [ -f "$INTAKE" ] || { echo "אין קובץ הקליטה: $INTAKE"; exit 1; }
  shift 2
  ID=$1; U=$2; HOST=$3; PROFILE=$4; SHIP=${5:-}; RO=${6:-}; HOMETILE=${7:-}
  # node -e, not jq: node is on the server and this repository has no jq use.
  intake() { node -e 'const i=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2]==="screens"?(Array.isArray(i.screens)?i.screens.join(","):""):(i[process.argv[2]]||"");process.stdout.write(String(v))' "$INTAKE" "$1"; }
  OWNER=$(intake owner); TITLE=$(intake pageTitle); WELCOME=$(intake welcome); SCREENS=$(intake screens)
  TIER=$(node -e 'const i=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((i.profile&&i.profile.suggestedTier)||"")' "$INTAKE")
else
  ID=$1; U=$2; HOST=$3; OWNER=$4; TITLE=$5; WELCOME=$6; SCREENS=$7; PROFILE=$8; SHIP=${9:-}; RO=${10:-}; HOMETILE=${11:-}
fi
[ "$RO" = rw ] && RO=""
DIR=/home/$U/$ID-monitor
PUB=https://github.com/itcohen2-maker/abaitzik-monitor.git
TEN=/home/monitor/abaitzik-monitor/data/tenants/tenants
echo $(( $(date +%s) + 900 )) > /run/monitor-maintenance-until

id "$U" >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin "$U"
# A shared table is read through its group (homestyle). 6.10: Roni's was added by hand and the
# next customer would have had no access at all.
[ -n "$SHIP" ] && usermod -aG "$(stat -c %G "$(dirname "$SHIP")")" "$U"
# 12.11 security: other customers cannot pass through; only Caddy (docs) and the owner instance can.
chmod 711 /home/$U; setfacl -m u:caddy:x,u:monitor:x /home/$U; chmod o-rwx /home/$U
# Shallow: a full clone carried 3.4G of Itzik's history into every customer and filled the disk (7.10).
[ -d "$DIR" ] || sudo -H -u "$U" git clone -q --depth 1 "$PUB" "$DIR"
cd "$DIR"
sudo -H -u "$U" git remote rename origin code 2>/dev/null || true
# The branch must track a private "origin" that does not exist (as Ilay's does), never the public
# code remote: the listener runs `pull --rebase -X theirs` and would pull Itzik's published docs/
# over the customer's page, and could push the customer's docs into the public repository.
sudo -H -u "$U" git remote get-url origin >/dev/null 2>&1 || sudo -H -u "$U" git remote add origin "git@github.com:itcohen2-maker/$ID-monitor.git"
sudo -H -u "$U" git remote set-url --push code no-push-allowed
sudo -H -u "$U" git config branch.main.remote origin
sudo -H -u "$U" git config branch.main.merge refs/heads/main
chmod 711 "$DIR"; setfacl -m u:caddy:x,u:monitor:x "$DIR"; chmod o-rwx "$DIR"
sudo -H -u "$U" rm -rf docs
sudo -H -u "$U" mkdir -p data/chat data/reports data/tasks data/reminders data/inbox data/status data/files-private
chmod 751 data; chmod 755 data/status
for d in chat reports tasks reminders inbox; do sudo -H -u "$U" mkdir -p data/$d/$d; chmod 750 data/$d data/$d/$d; done
chmod 750 data/files-private
sudo -H -u "$U" git config user.email "$ID@abaitzik.local"; sudo -H -u "$U" git config user.name "$ID monitor"

# instance.json, keys, passphrase, profile
python3 - "$ID" "$HOST" "$OWNER" "$TITLE" "$WELCOME" "$SCREENS" "$SHIP" "$DIR" "$U" "$HOMETILE" "$INTAKE" <<'PY'
import json, os, secrets, sys, base64, pwd, grp
ID, HOST, OWNER, TITLE, WELCOME, SCREENS, SHIP, DIR, U, HOMETILE = sys.argv[1:11]
INTAKE = sys.argv[11] if len(sys.argv) > 11 else ""
uid, gid = pwd.getpwnam(U).pw_uid, pwd.getpwnam(U).pw_gid
def put(path, text, mode):
    with open(path, 'w', encoding='utf-8') as f: f.write(text)
    os.chmod(path, mode); os.chown(path, uid, gid)
inst = {"name": ID, "owner": OWNER, "publicUrl": "https://%s/" % HOST, "basePath": "/", "origin": "https://%s" % HOST,
        "mailbox": "", "dataDir": "data", "taskPrefix": ID, "pageTitle": TITLE, "appTitle": "המוניטור",
        "screens": [s for s in SCREENS.split(",") if s], "chromeProfile": "none", "memoryDir": None, "driveFolder": "",
        "computer": None, "phone": None, "welcome": WELCOME}
if SHIP: inst["shipmentsDir"] = SHIP
# 24.10, Itzik: every new monitor starts with sample tiles and three empty round places. 10.11, Itzik: no candle icon in customer monitors, only his own.
inst["samples"] = True
inst["circles"] = []
inst["emptyCircles"] = 3
if HOMETILE: inst["homeTile"] = HOMETILE
if INTAKE:
    # 24.10: the rest of the proposal. Name, owner, title, welcome and screens came from the arguments above.
    src = json.load(open(INTAKE, encoding="utf-8"))
    for k in ("computer", "phone", "biz", "profile", "intakeNotes"):
        if k in src: inst[k] = src[k]
put(DIR + "/instance.json", json.dumps(inst, ensure_ascii=False, indent=1), 0o644)
keys = {"_why": "נושאי ntfy הם סיסמה. לא נכנסים לגיט.", "ntfyIn": "%s-in-%s" % (ID, secrets.token_hex(16)),
        "ntfyLive": "%s-live-%s" % (ID, secrets.token_hex(16)), "ntfyOut": "%s-out-%s" % (ID, secrets.token_hex(16)), "mail": "", "sealMsgs": True}
put(DIR + "/data/keys.json", json.dumps(keys, ensure_ascii=False), 0o600)
# 10.11.2026, annex 4.1: phone alerts carry no names or content (lib/notify-channels.js genericAlerts).
put(DIR + "/data/status/generic-alerts", "1\n", 0o644)
# 12.11.2026, Itzik: "בכל המוניטורים תשים חיבורים", WhatsApp quick connect is on for every new customer (lib/features.js).
put(DIR + "/data/status/features.json", json.dumps({"wa": True}), 0o644)
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

# the Claude key: the answering worker only. 11.11.2026, Itzik: "שום מנוי של מוניטור לא נוגע במנוי שלי".
# A new monitor starts on the customers' API key (CUSTOMER_API_KEY), never on Itzik's subscription token.
# A key of its own can replace it later (setup/tenant-api-key.sh).
CK=$(grep "^CUSTOMER_API_KEY=" /etc/monitor.env | cut -d= -f2-)
[ -n "$CK" ] || { echo "אין CUSTOMER_API_KEY ב /etc/monitor.env, עוצר"; exit 1; }
echo "ANTHROPIC_API_KEY=$CK" > /etc/$U.env
chown root:"$U" /etc/$U.env; chmod 640 /etc/$U.env
mkdir -p /srv/monitor-changes /root/tenant-tokens
date -u +%FT%TZ > "/srv/monitor-changes/$ID.own"; chmod 644 "/srv/monitor-changes/$ID.own"
date -u +%FT%TZ > "/root/tenant-tokens/$ID.own"

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
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://ntfy.sh https://wa.abaitzik.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
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

# Itzik, 11.10: every customer gets big file uploads from day one, without asking.
bash "$(dirname "$0")/enable-upload.sh" "$ID" || echo "העלאת קבצים גדולים לא הופעלה, להריץ setup/enable-upload.sh $ID"
if [ -n "${TIER:-}" ]; then echo "הקליטה מציעה פרופיל $TIER: cat setup/profiles/$TIER.env >> /etc/$ID.env (אחרי setup/apply-own-token.sh)"; fi
# 11.11.2026, Itzik: the three trainings (sales, business, personal) and the notes app are installed by default in every
# monitor. Notes are in TENANT_ALWAYS; the trainings need the customer's fast chat key (data/fastchat/tenants.json + its fc-key.txt).
fk=$(cd /home/monitor/abaitzik-monitor && sudo -u monitor node -e "
const fs=require('fs'),c=require('crypto'),f='data/fastchat/tenants.json';let t={};try{t=JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){}
if(!t['$ID'])t['$ID']={key:c.randomBytes(16).toString('hex'),dir:'$DIR',business:''};fs.writeFileSync(f,JSON.stringify(t,null,1));process.stdout.write(t['$ID'].key)") && printf '%s' "$fk" > "$DIR/data/fc-key.txt" && chown "$U:$U" "$DIR/data/fc-key.txt" && chmod 600 "$DIR/data/fc-key.txt" || echo "NEXT (11.11): fast chat key for $ID failed, the trainings stay hidden"
# 11.11.2026: every customer's visits show on Itzik's 👀 tile (lib/visits.js). Its page host must be in ORIGINS in wa-bridge.js.
vk=$(cd /home/monitor/abaitzik-monitor && sudo -u monitor node -e "console.log(require('./lib/visits.js').newKey('data','$ID'))") && printf '%s' "$vk" > "$DIR/data/status/visit-key.txt" && chown "$U:$U" "$DIR/data/status/visit-key.txt" && chmod 600 "$DIR/data/status/visit-key.txt"
grep -q "https://$HOST'" /home/monitor/abaitzik-monitor/wa-bridge.js || echo "NEXT (11.11): add https://$HOST to ORIGINS in wa-bridge.js, then restart monitor-wa"
echo "NEXT (11.11): own API key monitor-$ID in the Console -> /root/tenant-tokens/$ID.apikey -> bash setup/tenant-api-key.sh $ID; package -> /srv/monitor-changes/$ID.plan.json"
# 11.11.2026, Itzik: "לקוח חדש שעכשיו יסלוק ויחכה 3 דקות, יהיה לו מוניטור שיעבוד 100%". Before "סיום" the new monitor is
# tested as its own user: a sample voice note is transcribed, the visit key matches, the page answers. A failure is repaired
# and tested again; what still fails is printed here and lands in 📋 לטיפול.
node "$(dirname "$0")/../tenant-check.js" --new "$ID" || echo "NEXT (11.11): the new monitor $ID did not pass tenant-check.js, see above"
echo "סיום: $ID"
