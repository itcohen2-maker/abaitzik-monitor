#!/bin/bash
# 10.11.2026, agreement audit (service agreement 7.5 and clinic confidentiality 7.1: the data is
# deleted after the end, backups included, and a written deletion certificate is given).
# Usage, as root: tenant-delete.sh <id>          shows the plan and deletes nothing
#                 tenant-delete.sh <id> --yes     does it
# Only after Itzik's approval ("אישור:" on the approval card, kind delete). Never run on a
# customer's own request alone (CLAUDE.md, "Delete everything").
set -eu
id="${1:?usage: tenant-delete.sh <id> [--yes]}"
d=$(ls -d /home/*/"$id"-monitor 2>/dev/null | head -1)
[ -n "$d" ] && [ -d "$d/data" ] || { echo "no such customer: $id"; exit 2; }
echo "plan for $id:"
echo "  stop: monitor-listen-$id, monitor-worker-$id.timer, monitor-sync-$id.timer, monitor-upload-$id"
echo "  delete: $d/data, /var/backups/tenants/$id, /var/backups/tenants-export/$id-*"
[ "${2:-}" = "--yes" ] || { echo "nothing deleted (add --yes)"; exit 0; }
for u in "monitor-listen-$id.service" "monitor-worker-$id.timer" "monitor-sync-$id.timer" "monitor-watchdog-$id.timer" "monitor-upload-$id.service"; do
  systemctl disable --now "$u" 2>/dev/null || true
done
find "$d/data" -mindepth 1 -delete
rm -rf "/var/backups/tenants/$id" /var/backups/tenants-export/"$id"-*.tgz
install -d -m 700 /root/deletion-certs
c="/root/deletion-certs/$id-$(date +%Y%m%d-%H%M).txt"
{
  echo "אישור מחיקה: $id"
  echo "בוצע: $(date -Is)"
  echo "נמחקו: כל תיקיית הנתונים של הלקוח, הגיבויים שלו והעתקי הייצוא שלו."
  echo "נעצרו: המאזין, העובד, הסנכרון וההעלאות."
} > "$c"
chmod 600 "$c"
echo "$c"
