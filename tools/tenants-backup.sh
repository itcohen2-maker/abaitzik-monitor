#!/bin/bash
# 10.11.2026, agreement audit (security annex 5.1, "the data is backed up regularly").
# 25.11.2026 (Itzik): the copies filled the server disk (3.5G) and the 12GB-free condition made the backup
# fail every night. Now each folder is packed, ENCRYPTED (AES-256, key only in /root/.tenants-backup-key and
# on Itzik's PC), uploaded to Itzik's Drive (גיבויי שרת/<tenant>), the size Drive reports is checked, and only
# then the local copy is deleted. Nothing stays in /var/backups except a failed upload waiting for the next night.
# Installed to /usr/local/sbin (owned by root, never run from a folder a customer user can write).
set -u
B=/var/backups/tenants
KEY=/root/.tenants-backup-key
UP=/usr/local/sbin/tenants-backup-upload.js
install -d -m 700 "$B"
stamp=$(date +%Y%m%d)
fail=0
[ -s "$KEY" ] || { echo "no key file"; date -Is > "$B/last-failed"; exit 1; }
for d in /home/*/*-monitor; do
  [ -d "$d/data" ] || continue
  n=$(basename "$d"); n=${n%-monitor}
  [ "$n" = "abaitzik" ] && continue
  kb=$(du -sk "$d/data" | cut -f1)
  freekb=$(df -k --output=avail /var | tail -1 | tr -dc 0-9)
  # The packed copy is at most the size of the data; keep 1GB spare on top of it.
  if [ "${freekb:-0}" -lt $((kb + 1048576)) ]; then echo "skipped $n: not enough room for $((kb/1024))MB"; fail=1; continue; fi
  install -d -m 700 "$B/$n"
  keep=14; [ "$kb" -gt 512000 ] && keep=2
  out="$B/$n/$stamp.tgz.enc"
  tar -czf - -C "$d" data 2>/dev/null | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:"$KEY" -out "$out.part"
  rc=("${PIPESTATUS[@]}")
  # tar rc 1 only means a file changed while it was being read: the archive is still good.
  if [ "${rc[0]}" -le 1 ] && [ "${rc[1]}" -eq 0 ] && [ -s "$out.part" ]; then
    mv "$out.part" "$out"; chmod 600 "$out"
  else
    rm -f "$out.part"; echo "backup failed: $n"; fail=1; continue
  fi
  # Leftovers from earlier failed uploads go up too, oldest first.
  for f in $(ls -1 "$B/$n"/*.tgz.enc 2>/dev/null | sort); do
    if node "$UP" "$f" "$n" "$keep"; then rm -f "$f"; else echo "upload failed: $n $(basename "$f")"; fail=1; fi
  done
  # Old plain copies from before 25.11 are removed once any encrypted copy is safely in Drive.
  [ "$fail" = 0 ] && rm -f "$B/$n"/*.tgz
done
if [ "$fail" = 0 ]; then date -Is > "$B/last-ok"; else date -Is > "$B/last-failed"; exit 1; fi
