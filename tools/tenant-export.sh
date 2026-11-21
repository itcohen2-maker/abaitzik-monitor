#!/bin/bash
# 10.11.2026, agreement audit (service agreement 7.5: "the business can ask for a copy of its data
# within 14 days of the end"). Usage, as root: tenant-export.sh <id>
# Makes one archive of the customer's data in /var/backups/tenants-export (root only) and prints
# the path. The copy reaches the customer through his own files tile, by the monitor owner.
set -eu
id="${1:?usage: tenant-export.sh <id>}"
d=$(ls -d /home/*/"$id"-monitor 2>/dev/null | head -1)
[ -n "$d" ] && [ -d "$d/data" ] || { echo "no such customer: $id"; exit 2; }
out=/var/backups/tenants-export
install -d -m 700 "$out"
f="$out/$id-$(date +%Y%m%d).tgz"
tar -czf "$f" -C "$d" data
chmod 600 "$f"
echo "$f"
