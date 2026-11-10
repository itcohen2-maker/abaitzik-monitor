#!/bin/bash
# 10.11.2026, agreement audit (security annex 5.1, "the data is backed up regularly").
# Until now the server had no recurring backup of the customers' own data: only a one time
# script from 11.10 that left out Alon, Pablo and Shai. This runs every night as root and keeps
# 14 days per customer in /var/backups/tenants (root only, mode 700, files 600).
# Installed to /usr/local/sbin (owned by root, never run from a folder a customer user can write).
set -u
B=/var/backups/tenants
install -d -m 700 "$B"
stamp=$(date +%Y%m%d)
fail=0
for d in /home/*/*-monitor; do
  [ -d "$d/data" ] || continue
  n=$(basename "$d"); n=${n%-monitor}
  install -d -m 700 "$B/$n"
  if tar -czf "$B/$n/$stamp.tgz.part" -C "$d" data 2>/dev/null; then
    chmod 600 "$B/$n/$stamp.tgz.part"
    mv "$B/$n/$stamp.tgz.part" "$B/$n/$stamp.tgz"
  else
    rm -f "$B/$n/$stamp.tgz.part"; echo "backup failed: $n"; fail=1
  fi
  # 14 days only: the agreement promises deletion, so old copies do not pile up.
  ls -1t "$B/$n"/*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
done
if [ "$fail" = 0 ]; then date -Is > "$B/last-ok"; else date -Is > "$B/last-failed"; exit 1; fi
