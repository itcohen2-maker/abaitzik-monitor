#!/bin/bash
# 22.11.2026: one time per monitor that has bookings, as root:   setup/enable-bookings.sh [--check] <tenant id>
# What the booking agent of the tenant (lib/book-agent.js, its own process started by the tenant's listener) needs:
#   1. /var/lib/monitor-book/<tenant>/   the only place of its socket s.sock (root's parent 0711; the tenant's own folder 0700; an ACL entry
#                                        lets user monitor, the bridge, traverse it and a default entry gives it rw on the socket)
#   2. a systemd drop-in  /etc/systemd/system/monitor-listen-<tenant>.service.d/bookings.conf   with  ReadWritePaths=/var/lib/monitor-book/<tenant>
#      (the tenant's unit is ProtectSystem=strict with ReadWritePaths=/home/<tenant> only, so without this the socket cannot be created)
# It touches nothing inside the tenant's home, refuses (changing nothing) when a path is a link or its real path is not exactly the
# expected one, is idempotent, and does NOT restart the listener: it prints the command. --check only reports what it would do.
# New tenants (setup/new-tenant.sh) get  ReadWritePaths=-/var/lib/monitor-book/<tenant>  in their unit from the start (the dash makes a
# missing folder harmless), so for them this script only has to make the folder.
# MONITOR_BOOK_ROOT, MONITOR_ETC, MONITOR_NO_SYSTEMCTL and MONITOR_BOOK_NOPRIV are for a rehearsal in a temp folder (the tests).
set -euo pipefail
CHECK=0
if [ "${1:-}" = "--check" ]; then CHECK=1; shift; fi
U="${1:-}"
ROOT="${MONITOR_BOOK_ROOT:-/var/lib/monitor-book}"
ETC="${MONITOR_ETC:-/etc}"
refuse() { echo "refused: $1" >&2; exit 1; }
[[ "$U" =~ ^[a-z0-9-]{1,32}$ ]] || { echo "usage: $0 [--check] <tenant id>" >&2; exit 1; }
id "$U" >/dev/null 2>&1 || refuse "no such user $U"
UNIT="monitor-listen-$U.service"
UF="$ETC/systemd/system/$UNIT"
[ -f "$UF" ] && [ ! -L "$UF" ] || refuse "no unit $UNIT in $ETC/systemd/system"
DROPDIR="$UF.d"
DROP="$DROPDIR/bookings.conf"
D="$ROOT/$U"
WANT="[Service]
ReadWritePaths=$D"
# every check comes before the first change, and the parent is checked before anything is created
PARENT="$(dirname "$ROOT")"
[ "$(realpath "$PARENT")" = "$PARENT" ] || refuse "$PARENT is not its own real path"
[ ! -L "$ROOT" ] || refuse "$ROOT is a link"
if [ -e "$ROOT" ]; then [ -d "$ROOT" ] && [ "$(realpath "$ROOT")" = "$ROOT" ] || refuse "$ROOT is not its own real directory"; fi
[ ! -L "$D" ] || refuse "$D is a link"
if [ -e "$D" ]; then [ -d "$D" ] || refuse "$D is not a directory"; fi
[ ! -L "$DROPDIR" ] || refuse "$DROPDIR is a link"
[ ! -L "$DROP" ] || refuse "$DROP is a link"
if [ -e "$DROPDIR" ]; then [ -d "$DROPDIR" ] || refuse "$DROPDIR is not a directory"; fi
SAME=0
if [ -f "$DROP" ] && [ "$(cat "$DROP")" = "$WANT" ]; then SAME=1; fi
if [ "$CHECK" = 1 ]; then
  echo "check: tenant $U, unit $UNIT found"
  if [ -d "$D" ]; then echo "check: $D exists, would set owner $U:$U mode 0700 and the ACL for user monitor"; else echo "check: would create $D (owner $U:$U, mode 0700, ACL for user monitor)"; fi
  if [ "$SAME" = 1 ]; then echo "check: $DROP is already right, nothing to write"; else echo "check: would write $DROP with ReadWritePaths=$D and run systemctl daemon-reload"; fi
  echo "check: would NOT restart the listener; afterwards: systemctl restart $UNIT"
  exit 0
fi
mkdir -p "$ROOT"
[ "$(realpath "$ROOT")" = "$ROOT" ] || refuse "$ROOT is not its own real path"
if [ -z "${MONITOR_BOOK_NOPRIV:-}" ]; then chown root:root "$ROOT"; chmod 0711 "$ROOT"; fi
[ -e "$D" ] || mkdir "$D"
# checked again after the mkdir, so a swap in between changes nothing
[ ! -L "$D" ] && [ "$(realpath "$D")" = "$D" ] || refuse "$D is not its own real path"
if [ -z "${MONITOR_BOOK_NOPRIV:-}" ]; then
  chown -h "$U:$U" "$D"; chmod 0700 "$D"
  setfacl -m u:monitor:rx "$D"
  setfacl -d -m u:monitor:rw "$D"
fi
if [ "$SAME" = 1 ]; then
  echo "unchanged: $DROP"
else
  mkdir -p "$DROPDIR"
  TMP="$(mktemp "$DROPDIR/.bookings.XXXXXX")"
  printf '%s\n' "$WANT" > "$TMP"
  chmod 0644 "$TMP"
  mv -f "$TMP" "$DROP"
  echo "written: $DROP"
  if [ -z "${MONITOR_NO_SYSTEMCTL:-}" ]; then systemctl daemon-reload; echo "systemctl daemon-reload done"; fi
fi
echo "ok: $D is ready for the booking agent of $U"
echo "the listener is NOT restarted here. When you are ready:  systemctl restart $UNIT"
