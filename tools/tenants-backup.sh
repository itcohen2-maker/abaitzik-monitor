#!/bin/bash
# 10.11.2026, agreement audit (security annex 5.1, "the data is backed up regularly").
# Until now the server had no recurring backup of the customers' own data: only a one time
# script from 11.10 that left out Alon, Pablo and Shai. This runs every night as root into
# /var/backups/tenants (root only, mode 700, files 600).
# Installed to /usr/local/sbin (owned by root, never run from a folder a customer user can write).
# Disk (Itzik, 21.10: keep room on the server): a folder under 500MB keeps 14 days, a bigger one
# keeps 2 copies, and the backup of a folder is skipped when less than 12GB is free.
set -u
B=/var/backups/tenants
install -d -m 700 "$B"
stamp=$(date +%Y%m%d)
fail=0
for d in /home/*/*-monitor; do
  [ -d "$d/data" ] || continue
  n=$(basename "$d"); n=${n%-monitor}
  # Itzik's own folder is large and has its own backup (backup.js on his PC); this is for customers.
  [ "$n" = "abaitzik" ] && continue
  free=$(df -BG --output=avail /var | tail -1 | tr -dc 0-9)
  if [ "${free:-0}" -lt 12 ]; then echo "skipped $n: only ${free}GB free"; fail=1; continue; fi
  install -d -m 700 "$B/$n"
  kb=$(du -sk "$d/data" | cut -f1)
  keep=14; [ "$kb" -gt 512000 ] && keep=2
  tar -czf "$B/$n/$stamp.tgz.part" -C "$d" data 2>/dev/null; rc=$?
  # rc 1 only means a file changed while it was being read: the archive is still good.
  if [ "$rc" -le 1 ] && [ -s "$B/$n/$stamp.tgz.part" ]; then
    chmod 600 "$B/$n/$stamp.tgz.part"
    mv "$B/$n/$stamp.tgz.part" "$B/$n/$stamp.tgz"
  else
    rm -f "$B/$n/$stamp.tgz.part"; echo "backup failed: $n"; fail=1
  fi
  # The agreement promises deletion, so old copies do not pile up.
  ls -1t "$B/$n"/*.tgz 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm -f
done
if [ "$fail" = 0 ]; then date -Is > "$B/last-ok"; else date -Is > "$B/last-failed"; exit 1; fi
