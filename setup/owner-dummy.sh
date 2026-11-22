#!/bin/bash
# 22.11.2026, Itzik: "אמרנו בשביל להחליף לי את הלוק החדש שאני צריך קודם כל לעבוד על מוניטור דמה שהוא תואם את המוניטור שלי
# ורק אחרי שאני רואה שאין תקיעות אנחנו נעביר". The dummy of his own monitor, in the new look.
#  1. the code: main as it is now (what his own page runs), without docs/ promo/ tests/ (git archive, no history);
#  2. the data: a copy of his data/ as it is now, with data/keys.json. 22.11.2026, Itzik: "ניסיתי להכנס למוניטור וכלום לא עובד":
#     without the keys the page had no channel and no owner code, so nothing answered. Now it is his monitor in every way,
#     and what he sends from the dummy reaches his real queue, like a second device;
#  3. the page: his own instance.json plus ownerLook: true and the dummy's address, sealed with his own passphrase
#     (gate-params.json), exactly like his page. Static: no listener, no timers, no git, never pushed to GitHub.
# Run as root: bash setup/owner-dummy.sh   (again any time, to refresh the copy). Address: owner-dummy.host
set -euo pipefail
SRC=/home/monitor/abaitzik-monitor
APP=/srv/owner-dummy
HOST=$(cat "$SRC/setup/owner-dummy.host" 2>/dev/null || echo "")
[ -n "$HOST" ] || { echo "אין כתובת ב setup/owner-dummy.host"; exit 1; }
mkdir -p "$APP"
NEW=$(mktemp -d /srv/.owner-dummy-new-XXXX)
cd "$SRC"
runuser -u monitor -- git -c safe.directory="$SRC" archive HEAD | tar -x -C "$NEW" --exclude=docs --exclude=promo --exclude=tests --exclude=instance.json --exclude=data
find "$APP" -mindepth 1 -maxdepth 1 ! -name docs ! -name data -exec rm -rf {} +
cp -a "$NEW"/. "$APP"/
rm -rf "$NEW"
cp -p "$SRC/gate-params.json" "$SRC/gate-key.txt" "$APP/"
mkdir -p "$APP/data"
rsync -a --delete "$SRC/data/" "$APP/data/"
node -e 'const fs=require("fs"),[src,dst,host]=process.argv.slice(1);const j=JSON.parse(fs.readFileSync(src,"utf8"));
j.ownerLook=true;j.publicUrl="https://"+host+"/";j.basePath="/";j.origin="https://"+host;j.uploadUrl="";
fs.writeFileSync(dst,JSON.stringify(j,null,1));' "$SRC/instance.json" "$APP/instance.json" "$HOST"
chown -R monitor:monitor "$APP"
chmod 711 "$APP"
cd "$APP"
rm -f "$APP/docs/manifest.webmanifest"
sudo -u monitor -H node build.js 2>&1 | tail -2
# what his page serves from git (videos, the candle site, pages) and the build does not write: hard links, no extra space
runuser -u monitor -- git -c safe.directory="$SRC" -C "$SRC" ls-files docs | cut -d/ -f2 | sort -u | while read -r d; do
  [ -n "$d" ] && [ ! -e "$APP/docs/$d" ] && [ -e "$SRC/docs/$d" ] && cp -al "$SRC/docs/$d" "$APP/docs/$d"
done
chmod -R o+rX "$APP/docs"
du -sh "$APP" | cut -f1
