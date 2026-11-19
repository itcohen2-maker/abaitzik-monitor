#!/bin/bash
# 19.11.2026, Itzik: "שכל מה שאנחנו עושים ועובד לא יישבר בזמן שאנחנו מעדכנים משהו חדש".
# On 8.11 a rewrite of one customer's block in the Caddyfile dropped Itzik's own upload route, and nobody
# knew for eleven days. Every change to /etc/caddy/Caddyfile now loads through here:
#   1. the route check (monitor-guard/route-check.js) runs on the live server, before;
#   2. caddy validate, then caddy reload (not systemctl: that fails on this server, status=226/NAMESPACE);
#   3. the route check runs again. Anything that worked before and fails now puts back the last config
#      that passed (/etc/caddy/Caddyfile.last-good), reloads it, and pushes to Itzik. Exit 1.
#   When nothing broke, the new file becomes the last good one. Exit 0.
# Usage: bash setup/safe-caddy-reload.sh [--allow <word>]   (--allow: failures that mention <word> are expected,
#        e.g. the id of a monitor being disconnected)
set -u
CF=/etc/caddy/Caddyfile
GOOD=/etc/caddy/Caddyfile.last-good
RC=/home/monitor/monitor-guard/route-check.js
REPO=/home/monitor/abaitzik-monitor
ALLOW=""
[ "${1:-}" = "--allow" ] && ALLOW="${2:-}"

fails() { node "$RC" --json --no-push 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const f of JSON.parse(s).fails)console.log(f)}catch(e){}})'; }

if ! caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
  echo "caddy validate נכשל, לא נטען כלום"; exit 1
fi
BEFORE=$(fails)
caddy reload --config "$CF" --adapter caddyfile >/dev/null 2>&1 || { echo "caddy reload נכשל"; exit 1; }
sleep 3
AFTER=$(fails)
NEW=$(comm -13 <(printf '%s\n' "$BEFORE" | sort -u) <(printf '%s\n' "$AFTER" | sort -u) | grep -v '^$')
[ -n "$ALLOW" ] && NEW=$(printf '%s\n' "$NEW" | grep -v -F -- "$ALLOW")
if [ -n "$NEW" ]; then
  echo "השינוי שבר דברים שעבדו:"; echo "$NEW"
  if [ -f "$GOOD" ]; then
    cp -a "$CF" "$CF.rejected-$(date +%Y%m%d-%H%M%S)"
    cp -a "$GOOD" "$CF"
    caddy reload --config "$CF" --adapter caddyfile >/dev/null 2>&1
    echo "הוחזרה ההגדרה האחרונה שעבדה ($GOOD)"
    MSG="השינוי בהגדרות השרת בוטל לבד. מה שנשבר: $NEW"
  else
    MSG="השינוי בהגדרות השרת שבר דברים ואין גרסה טובה לחזור אליה: $NEW"
  fi
  [ -n "${NO_PUSH:-}" ] || (cd "$REPO" && runuser -u monitor -- node notify.js --urgent "שער השרת עצר שינוי" "$MSG" >/dev/null 2>&1)
  exit 1
fi
cp -a "$CF" "$GOOD"
echo "נטען, שום דבר שעבד לא נשבר"
exit 0
