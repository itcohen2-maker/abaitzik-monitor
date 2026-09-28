#!/bin/bash
# Keepalive for the monitor services. Itzik, 28.9: a session stopped every
# service at 23:18 for a git history rewrite, its restart was blocked, and the
# monitor was deaf until 05:04. Nothing on the server brought it back.
#
# Every two minutes, as root: any monitor unit that has been down for ten
# minutes is started again and Itzik is told once. A session that needs the
# services off on purpose writes an epoch into /run/monitor-maintenance-until;
# it is honoured for at most 30 minutes, so a forgotten flag cannot keep the
# monitor off for the night.
set -u
STATE=/var/lib/monitor-keepalive
LOG=/var/log/monitor-keepalive.log
mkdir -p "$STATE"
now=$(date +%s)
until=$(cat /run/monitor-maintenance-until 2>/dev/null || echo 0)
if [ "$until" -gt "$now" ] && [ $((until - now)) -le 1800 ]; then exit 0; fi

# unit|instance dir that owns it (for the alert)
UNITS="monitor-listen.service|/home/monitor/abaitzik-monitor
monitor-worker.timer|/home/monitor/abaitzik-monitor
monitor-watchdog.timer|/home/monitor/abaitzik-monitor
monitor-tenants.timer|/home/monitor/abaitzik-monitor
monitor-tenants-sync.timer|/home/monitor/abaitzik-monitor
monitor-listen-ily.service|/home/monitor/ily-monitor
monitor-worker-ily.timer|/home/monitor/ily-monitor
monitor-watchdog-ily.timer|/home/monitor/ily-monitor"

restarted=""
while IFS='|' read -r unit dir; do
  [ -z "$unit" ] && continue
  systemctl cat "$unit" >/dev/null 2>&1 || continue
  f="$STATE/$unit.down"
  if systemctl is-active --quiet "$unit"; then rm -f "$f"; continue; fi
  [ -f "$f" ] || echo "$now" > "$f"
  since=$(cat "$f")
  if [ $((now - since)) -ge 600 ]; then
    systemctl start "$unit" && rm -f "$f"
    echo "$(date '+%F %T')  started $unit (down $(( (now - since) / 60 )) min)" >> "$LOG"
    restarted="$restarted $unit"
  fi
done <<< "$UNITS"

if [ -n "$restarted" ]; then
  cd /home/monitor/abaitzik-monitor && sudo -u monitor node notify.js "המוניטור הופעל מחדש" "שירותים שהיו כבויים יותר מעשר דקות הופעלו מחדש אוטומטית:$restarted" >> "$LOG" 2>&1
fi
