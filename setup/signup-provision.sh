#!/bin/bash
# 11.11.2026, Itzik: "בן אדם נרשם, מקבל קוד במייל ונכנס". Opens a trial monitor for every verified signup
# (data/signup/queue/<id>.json, state queued, written by wa-bridge.js /api/signup/verify).
# Run as root by monitor-signup.timer every minute. At most 5 a day; the rest wait and Itzik is told.
#   bash setup/signup-provision.sh            one pass over the queue
# Each one: setup/new-tenant.sh (the customers' API key, never Itzik's subscription), host <id>.m.it-solution.co.il
# (wildcard DNS to this server), the trial package (40 actions, 7 days), then the mail "המוניטור שלך מוכן" with
# the link and the code, from info@it-solution.co.il. Log: /var/log/monitor-signup.log
set -uo pipefail
REPO=/home/monitor/abaitzik-monitor
Q=$REPO/data/signup/queue
LOG=/var/log/monitor-signup.log
MAXDAY=5
exec 9>/run/monitor-signup.lock; flock -n 9 || exit 0
cd "$REPO" || exit 1
[ -d "$Q" ] || exit 0
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
field() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j[process.argv[2]]||""))' "$1" "$2"; }
setf() { sudo -u monitor node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f,"utf8"));j[process.argv[2]]=process.argv[3];j.updatedAt=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(j,null,1))' "$1" "$2" "$3"; }
today=$(TZ=Asia/Jerusalem date +%F)
done_today=$(grep -c "^$today.* ready " "$LOG.days" 2>/dev/null || true); done_today=${done_today:-0}

for f in "$Q"/t*.json; do
  [ -f "$f" ] || continue
  [ "$(field "$f" state)" = queued ] || continue
  ID=$(field "$f" id); NAME=$(field "$f" name); PHONE=$(field "$f" phone); EMAIL=$(field "$f" email)
  [[ "$ID" =~ ^t[a-f0-9]{6}$ ]] || { setf "$f" state bad; log "$f bad id"; continue; }
  if [ "$done_today" -ge "$MAXDAY" ]; then
    [ "$(field "$f" told)" = 1 ] || { setf "$f" told 1; sudo -u monitor node "$REPO/notify.js" "הרשמה ממתינה" "יותר מ $MAXDAY הרשמות היום. $NAME ממתין לפתיחה מחר." >/dev/null 2>&1; }
    continue
  fi
  HOST="$ID.m.it-solution.co.il"
  setf "$f" state building
  log "$ID building for $(echo "$EMAIL" | sed 's/^\(..\).*@/\1***@/')"
  PROF=$(mktemp); printf '# %s\n\nמוניטור ניסיון שנפתח בהרשמה עצמאית באתר IT Solution.\nטלפון: %s\nמייל: %s\n' "$NAME" "$PHONE" "$EMAIL" > "$PROF"
  if ! bash "$REPO/setup/new-tenant.sh" "$ID" "$ID" "$HOST" "$NAME" "המוניטור של $NAME" "שלום $NAME, ברוך הבא למוניטור. שבוע הניסיון שלך התחיל." "" "$PROF" >> "$LOG" 2>&1; then
    rm -f "$PROF"; setf "$f" state failed; log "$ID new-tenant failed"
    sudo -u monitor node "$REPO/notify.js" "פתיחת מוניטור נכשלה" "ההרשמה של $NAME לא נפתחה. יומן: /var/log/monitor-signup.log" >/dev/null 2>&1
    continue
  fi
  rm -f "$PROF"
  # 11.11.2026, Itzik: the page promises "CRM מובנה", so every trial gets "💼 העסק שלי" (leads, customers, money).
  IJ="/home/$ID/$ID-monitor/instance.json"
  if [ -f "$IJ" ]; then
    WASI=0; lsattr -d "$IJ" 2>/dev/null | cut -d' ' -f1 | grep -q i && { WASI=1; chattr -i "$IJ"; }
    node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f,"utf8"));if(!j.biz)j.biz={name:process.argv[2],sub:"העסק שלי"};fs.writeFileSync(f,JSON.stringify(j,null,1))' "$IJ" "$NAME" || log "$ID biz on failed"
    [ "$WASI" = 1 ] && chattr +i "$IJ"
  fi
  # The trial package, counted from now.
  printf '{"plan":"trial","start":"%s","month":"%s","extra":0,"applied":[],"history":[{"at":"%s","kind":"start","plan":"trial","note":"self signup"}]}\n' \
    "$(date -u +%FT%TZ)" "$(TZ=Asia/Jerusalem date +%Y-%m)" "$(date -u +%FT%TZ)" > "/srv/monitor-changes/$ID.plan.json"
  chown monitor:monitor "/srv/monitor-changes/$ID.plan.json"; chmod 644 "/srv/monitor-changes/$ID.plan.json"
  CODE=$(cut -d' ' -f1 "/root/tenant-codes/$ID.txt")
  # The ready mail, from info@ (SMTP settings in /etc/monitor.env). The code goes only into the mail, never the log.
  if ( set -a; . /etc/monitor.env; set +a; cd "$REPO" && node -e '
    const M=require("./lib/mailer.js"),[to,name,url,pass]=process.argv.slice(1);
    M.send("data",Object.assign({to},M.readyMail(name,url,pass))).then(r=>{if(!r.ok){console.error(r.error);process.exit(1)}});' \
    "$EMAIL" "$NAME" "https://$HOST/" "$CODE" ); then
    setf "$f" state ready; setf "$f" host "$HOST"
    echo "$today $ID ready " >> "$LOG.days"; done_today=$((done_today+1))
    log "$ID ready, mail sent"
    sudo -u monitor node -e 'require("./lib/handle.js").complete({key:"signup-ready-"+process.argv[1],kind:"lead",who:process.argv[2],title:"המוניטור שלו נפתח ונשלח אליו במייל ("+process.argv[3]+"). שבוע ניסיון, 40 פעולות.",link:"biz"})' "$ID" "$NAME" "$HOST" 2>>"$LOG" || true
  else
    setf "$f" state mailfail; log "$ID built, mail failed"
    sudo -u monitor node "$REPO/notify.js" "מייל לא יצא" "המוניטור של $NAME נפתח, אבל המייל עם הקישור לא יצא. הקוד ב /root/tenant-codes/$ID.txt" >/dev/null 2>&1
  fi
done

# 11.11.2026: the connections page and the questionnaire welcome of every ready trial (signup-personalize.js).
node "$REPO/signup-personalize.js" >> "$LOG" 2>&1 || log "personalize failed"

# 12.11.2026, Itzik: the trial week mails (not opened, not back for two days, the last day). trial-nudge.js, once each.
( set -a; . /etc/monitor.env; set +a; cd "$REPO" && node trial-nudge.js ) >> "$LOG" 2>&1 || log "nudge failed"
