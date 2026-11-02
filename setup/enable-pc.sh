#!/bin/bash
# Wire a customer's own computer to their monitor (14.10.2026). Run as root:
#   bash setup/enable-pc.sh <id>        (id = the suffix of monitor-listen-<id>.service)
# Safe to run again: it keeps the key it already gave (pass --rotate for a new one).
#
# Itzik, at Rinat's computer: "המוניטור והקלוד שלי יהיו המוח והקלוד שלה רק יעבוד".
# What it does:
#   a 32 hex pcKey in <dir>/data/keys.json (the computer's own key, lib/pc-api.js),
#   a restart of monitor-upload-<id> so its routes /up/v1/<name>/pc/* come alive,
#   the ready to install folder for that computer in <dir>/data/files-private/pc/
#   (the scripts from pc/ plus a config.json with the url and the key), zipped as
#   files/<name>-pc.zip in the customer's private files, and a rebuild of the page.
# The key is also written to /root/tenant-codes/<id>-pc.txt. It never goes in a chat.
set -euo pipefail
ID="${1:?usage: enable-pc.sh <id> [--rotate]}"
[[ "$ID" =~ ^[a-z0-9_-]{1,32}$ ]] || { echo "bad id"; exit 1; }
ROTATE=0; [[ "${2:-}" == "--rotate" ]] && ROTATE=1
LISTEN=/etc/systemd/system/monitor-listen-$ID.service
[ -f "$LISTEN" ] || { echo "no $LISTEN"; exit 1; }
DIR=$(grep -h '^WorkingDirectory=' "$LISTEN" | cut -d= -f2)
U=$(grep -h '^User=' "$LISTEN" | cut -d= -f2)
UNIT=monitor-upload-$ID.service
[ -f /etc/systemd/system/$UNIT ] || { echo "no $UNIT: run setup/enable-upload.sh $ID first"; exit 1; }

NAME=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]+'/instance.json'))['name'])" "$DIR")
HOST=$(python3 -c "import json,sys;from urllib.parse import urlparse;i=json.load(open(sys.argv[1]+'/instance.json'));print(urlparse(i.get('origin') or i['publicUrl']).netloc)" "$DIR")

KEY=$(python3 - "$DIR" "$ROTATE" <<'EOF'
import json, os, secrets, sys
d, rotate = sys.argv[1], sys.argv[2] == '1'
kp = os.path.join(d, 'data', 'keys.json')
k = json.load(open(kp, encoding='utf8'))
if rotate or len(str(k.get('pcKey', ''))) < 32:
    k['pcKey'] = secrets.token_hex(16)
    st = os.stat(kp)
    json.dump(k, open(kp, 'w', encoding='utf8'), ensure_ascii=False)
    os.chown(kp, st.st_uid, st.st_gid); os.chmod(kp, 0o600)
print(k['pcKey'])
EOF
)
mkdir -p /root/tenant-codes; chmod 700 /root/tenant-codes
printf '%s\n' "$KEY" > /root/tenant-codes/$ID-pc.txt; chmod 600 /root/tenant-codes/$ID-pc.txt

systemctl restart $UNIT
sleep 1

# the install folder for that computer, in the customer's private files
PRIV="$DIR/data/files-private"
OUT="$PRIV/pc"
rm -rf "$OUT"; mkdir -p "$OUT"
cp "$DIR"/pc/pc-pull.ps1 "$DIR"/pc/install-pc.cmd "$DIR"/pc/install-pc.ps1 "$DIR"/pc/run-hidden.vbs "$DIR"/pc/README.txt "$OUT"/
python3 - "$OUT/config.json" "$HOST" "$NAME" "$KEY" <<'EOF'
import json, sys
out, host, name, key = sys.argv[1:5]
json.dump({'url': 'https://%s/up/v1/%s/pc' % (host, name), 'key': key, 'name': name, 'model': 'haiku'},
          open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
EOF
(cd "$PRIV" && rm -f "$NAME-pc.zip" && python3 -c "
import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2])" "$NAME-pc" "$OUT")
chown -R "$U":"$U" "$PRIV/pc" "$PRIV/$NAME-pc.zip"
chmod 600 "$PRIV/$NAME-pc.zip"; chmod -R go-rwx "$PRIV/pc"
(cd "$DIR" && sudo -u "$U" node build.js | tail -1)

# the route answers only with the key: 401 without it means it is alive
echo "route: $(curl -s -o /dev/null -w '%{http_code}' https://$HOST/up/v1/$NAME/pc/ping) without key (401 is right)"
echo "key: $(curl -s -o /dev/null -w '%{http_code}' -H "X-Pc-Key: $KEY" https://$HOST/up/v1/$NAME/pc/ping) with key (200 is right, nothing claimed)"
echo "done: $ID, the install zip is files/$NAME-pc.zip in the customer's private files; key in /root/tenant-codes/$ID-pc.txt"
