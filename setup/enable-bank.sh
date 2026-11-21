#!/bin/bash
# The bank connection for a customer's monitor (14.11.2026). Run as root:
#   bash setup/enable-bank.sh <id> <bank> [private|business]     (id = suffix of monitor-listen-<id>.service)
#   bank: hapoalim (the only one the program reads today), leumi, discount, mizrahi, ...
#
# What it does:
#   data/bank/config.json { bank, kind }, the bank the customer told us at onboarding;
#   a pcKey with pcName "bank" in keys.json (his computer's key for /up/v1/<name>/pc, lib/pc-api.js);
#   ACLs so the WhatsApp bridge (user monitor) can queue his "בנק" (data/pc/pc, data/bank, the heartbeat);
#   Bank-Setup.cmd in a zip (setup/build-bank-installer.py) in his private files, and a private link
#   /p/<20 hex>.zip that deletes itself after 48 hours. Itzik sends the link; the customer double clicks.
# A monitor whose computer already runs Claude tasks (pcKey without pcName bank) is refused:
# one key per monitor today. The key is also in /root/tenant-codes/<id>-bank.txt, never in a chat.
set -euo pipefail
ID="${1:?usage: enable-bank.sh <id> <bank> [private|business]}"
BANK="${2:?usage: enable-bank.sh <id> <bank> [private|business]}"
KIND="${3:-private}"
[[ "$ID" =~ ^[a-z0-9_-]{1,32}$ ]] || { echo "bad id"; exit 1; }
[[ "$BANK" =~ ^[a-z0-9-]{2,24}$ ]] || { echo "bad bank"; exit 1; }
[[ "$KIND" =~ ^(private|business)$ ]] || { echo "kind: private or business"; exit 1; }
CODE=/home/monitor/abaitzik-monitor
LISTEN=/etc/systemd/system/monitor-listen-$ID.service
[ -f "$LISTEN" ] || { echo "no $LISTEN"; exit 1; }
DIR=$(grep -h '^WorkingDirectory=' "$LISTEN" | cut -d= -f2)
U=$(grep -h '^User=' "$LISTEN" | cut -d= -f2)
UNIT=monitor-upload-$ID.service
[ -f /etc/systemd/system/$UNIT ] || { echo "no $UNIT: run setup/enable-upload.sh $ID first"; exit 1; }
NAME=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]+'/instance.json'))['name'])" "$DIR")
HOST=$(python3 -c "import json,sys;from urllib.parse import urlparse;i=json.load(open(sys.argv[1]+'/instance.json'));print(urlparse(i.get('origin') or i['publicUrl']).netloc)" "$DIR")
SUP=$(cd "$CODE" && node -e "const b=require('./lib/bank-flow.js');console.log(b.BANKS[process.argv[1]]?(b.supported(process.argv[1],process.argv[2])?'yes':'named'):'unknown')" "$BANK" "$KIND")
[ "$SUP" = unknown ] && { echo "unknown bank $BANK (lib/bank-flow.js BANKS)"; exit 1; }
[ "$SUP" = named ] && echo "note: $BANK $KIND is not read by the program yet; the customer will be told to send the Excel file meanwhile."

KEY=$(python3 - "$DIR" <<'EOF'
import json, os, secrets, sys
d = sys.argv[1]
kp = os.path.join(d, 'data', 'keys.json')
k = json.load(open(kp, encoding='utf8'))
if len(str(k.get('pcKey', ''))) >= 32 and k.get('pcName') != 'bank':
    sys.exit('this monitor already has a computer for Claude tasks (pcKey without pcName bank); one key per monitor today')
if len(str(k.get('pcKey', ''))) < 32:
    k['pcKey'] = secrets.token_hex(16)
k['pcName'] = 'bank'
st = os.stat(kp)
json.dump(k, open(kp, 'w', encoding='utf8'), ensure_ascii=False)
os.chown(kp, st.st_uid, st.st_gid); os.chmod(kp, 0o600)
print(k['pcKey'])
EOF
)
mkdir -p /root/tenant-codes; chmod 700 /root/tenant-codes
printf '%s\n' "$KEY" > /root/tenant-codes/$ID-bank.txt; chmod 600 /root/tenant-codes/$ID-bank.txt

# the bank choice, and the folders the bridge writes in
D="$DIR/data"
sudo -u "$U" mkdir -p "$D/bank" "$D/pc/pc" "$D/status"
python3 - "$D/bank/config.json" "$BANK" "$KIND" <<'EOF'
import json, sys
json.dump({'bank': sys.argv[2], 'kind': sys.argv[3]}, open(sys.argv[1], 'w', encoding='utf8'))
EOF
chown "$U":"$U" "$D/bank/config.json"; chmod 640 "$D/bank/config.json"
# the bridge (monitor) reaches data, queues in pc/pc, keeps data/bank/session.json; new files stay
# writable for both (default ACLs); the customer's own bank data (data/bank/bank) is created 700 by him.
setfacl -m u:monitor:x "$(dirname "$DIR")" "$DIR" "$D"
setfacl -m u:monitor:rwx,d:u:monitor:rwx,d:u:"$U":rwx "$D/pc" "$D/pc/pc" "$D/bank"
setfacl -m u:monitor:r "$D/bank/config.json"
SEEN="$D/status/pc-seen-bank.json"
[ -f "$SEEN" ] || { echo '{"at":"1970-01-01T00:00:00.000Z"}' > "$SEEN"; chown "$U":"$U" "$SEEN"; }
setfacl -m u:monitor:x "$D/status"; setfacl -m u:monitor:r "$SEEN"

systemctl restart $UNIT
sleep 2

# the one file the customer runs, and a private link to it for 48 hours
PRIV="$D/files-private"
ZIP="$PRIV/$NAME-bank.zip"
(cd "$CODE" && python3 setup/build-bank-installer.py "$ZIP" "https://$HOST/up/v1/$NAME/pc" "$KEY" "$NAME")
chown "$U":"$U" "$ZIP"; chmod 600 "$ZIP"
T=$(node -e "console.log(require('crypto').randomBytes(10).toString('hex'))")
cp "$ZIP" /srv/private-pages/p/$T.zip; chmod 644 /srv/private-pages/p/$T.zip
echo "$T.zip  bank installer for $ID ($BANK $KIND), deleted after 48h $(date +%F)" >> /root/private-pages.txt
systemd-run --quiet --on-active=48h --unit="bank-link-$T" /bin/rm -f /srv/private-pages/p/$T.zip || echo "note: delete /srv/private-pages/p/$T.zip by hand"

echo "route: $(curl -s -o /dev/null -w '%{http_code}' https://$HOST/up/v1/$NAME/pc/ping) without key (401 is right)"
echo "key:   $(curl -s -o /dev/null -w '%{http_code}' -H "X-Pc-Key: $KEY" https://$HOST/up/v1/$NAME/pc/ping) with key (200 is right)"
echo "link:  $(curl -s -o /dev/null -w '%{http_code}' https://form.it-solution.co.il/p/$T.zip) https://form.it-solution.co.il/p/$T.zip"
echo "done: $ID $BANK $KIND. Send the link; the customer double clicks Bank-Setup, then writes בנק on WhatsApp."
