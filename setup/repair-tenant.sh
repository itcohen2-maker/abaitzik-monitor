#!/bin/bash
# 6.10.2026. A tenant clone whose branch tracks the public code remote pulls Itzik's
# published docs/ into its own page every time its listener publishes. Ilay's clone
# tracks a private "origin" that does not exist, so that pull fails harmlessly; the
# clones made by new-tenant.sh before this fix tracked "code" and did not.
#   bash setup/repair-tenant.sh <id> <user>
set -euo pipefail
ID=$1; U=$2; DIR=/home/$U/$ID-monitor
cd "$DIR"
g() { sudo -H -u "$U" git "$@"; }
g rebase --abort 2>/dev/null || true
g remote get-url origin >/dev/null 2>&1 || g remote add origin "git@github.com:itcohen2-maker/$ID-monitor.git"
g remote set-url --push code no-push-allowed
g config branch.main.remote origin
g config branch.main.merge refs/heads/main
g fetch -q code
g checkout code/main -- . ':(exclude)docs' ':(exclude)instance.json' ':(exclude)CLAUDE.md'
sudo -H -u "$U" rm -rf docs
sudo -H -u "$U" node build.js | tail -1
chmod -R o+rX docs
g add -A . >/dev/null 2>&1 || true
g commit -q -m "repair: own page, private origin" || true
echo "title: $(grep -o '<title>[^<]*</title>' docs/index.html)"
g remote -v | head -4
g config --get-regexp 'branch.main'
