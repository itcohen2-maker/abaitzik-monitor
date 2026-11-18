#!/bin/bash
# 18.11.2026, Itzik: a trial monitor gets the payment message after 7 days (worker.js trialEnd).
# If it did not move to a paid package within one more day, the monitor is deleted (remove-trial.sh).
# Runs every hour from root cron. Ids in /root/trial-keep.txt are never deleted (t015ca3 is Rinat, his sister).
# Itzik gets a WhatsApp when a trial ends (deleted tomorrow) and when one is deleted.
set -uo pipefail
REPO=/home/monitor/abaitzik-monitor
STATE=/root/trial-expire.state; touch "$STATE"
KEEP=/root/trial-keep.txt; touch "$KEEP"
now=$(date +%s)
tell() { sudo -u monitor node -e 'require("./lib/wa-out.js").sendOwner("data", process.argv[1], {kind:"tasks"}).catch(()=>{})' "$1" >/dev/null 2>&1 || true; }
cd "$REPO" || exit 1
for f in /srv/monitor-changes/t??????.plan.json; do
  [ -f "$f" ] || continue
  id=$(basename "$f" .plan.json)
  [[ "$id" =~ ^t[a-f0-9]{6}$ ]] || continue
  plan=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("plan",""))' "$f" 2>/dev/null)
  [ "$plan" = "trial" ] || continue
  grep -q "\"family\": *true" "$f" && continue
  grep -qx "$id" "$KEEP" && continue
  start=$(python3 -c 'import json,sys,datetime;print(int(datetime.datetime.fromisoformat(json.load(open(sys.argv[1]))["start"].replace("Z","+00:00")).timestamp()))' "$f" 2>/dev/null) || continue
  [ -n "$start" ] || continue
  name=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("name",""))' "data/signup/queue/$id.json" 2>/dev/null)
  if [ "$now" -ge $((start + 8*86400)) ]; then
    out=$(bash setup/remove-trial.sh "$id" 2>&1 | tail -1)
    echo "$(date -Is) $id $out" >> /var/log/trial-expire.log
    case "$out" in *removed) tell "🗑️ המוניטור של ${name:-$id} נמחק: עבר שבוע ניסיון ויום אחרי דרישת התשלום, ולא שילם." ;; esac
  elif [ "$now" -ge $((start + 7*86400)) ] && ! grep -qx "warned $id" "$STATE"; then
    echo "warned $id" >> "$STATE"
    when=$(TZ=Asia/Jerusalem date -d "@$((start + 8*86400))" "+%d.%m בשעה %H:%M")
    tell "⏳ שבוע הניסיון של ${name:-$id} הסתיים והוא קיבל דרישת תשלום. אם לא ישלם, המוניטור יימחק ב $when. כדי לשמור אותו, כתוב לי."
  fi
done
