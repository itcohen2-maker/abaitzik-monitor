#!/bin/bash
# 12.10: a customer's own Claude key, sent from its monitor (listen.js ownToken),
# replaces Itzik's in /etc/<id>.env. Run as root by monitor-owntoken@<id>.path.
# Tests the key first; a key that does not answer is dropped and the old one stays.
#   bash setup/apply-own-token.sh <id>
set -uo pipefail
id="${1:-}"; [[ "$id" =~ ^[a-z0-9-]+$ ]] || exit 2
rec="/home/monitor/abaitzik-monitor/data/tenants/tenants/$id.json"
dir=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).dir||"")' "$rec")
user=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).user||"")' "$rec")
src="$dir/data/status/own-token.txt"; env="/etc/$id.env"
[ -f "$src" ] || exit 0
key=$(tr -d ' \r\n' < "$src"); rm -f "$src"
say() {
  local at; at=$(date -u +%Y-%m-%dT%H:%M:%S.000Z); local st; st=$(date -u +%Y%m%d-%H%M%S)
  sudo -u "$user" node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({at:process.argv[2],from:"claude",text:process.argv[3],status:"done"},null,1))' \
    "$dir/data/chat/chat/$st-claude-owntoken-done.json" "$at" "$1"
}
[[ "$key" =~ ^sk-ant-oat[0-9A-Za-z_-]{20,}$ ]] || { say "המפתח שנשלח לא נראה כמו מפתח של Claude. כדאי להעתיק אותו שוב, כולו, ולשלוח מחדש."; exit 0; }
out=$(cd /tmp && sudo -u "$user" env HOME="/home/$user" CLAUDE_CODE_OAUTH_TOKEN="$key" timeout 120 claude -p --model haiku "ענה במילה אחת: תקין" 2>&1 | tail -1)
if ! echo "$out" | grep -q "תקין"; then
  say "המפתח לא עבד, והמוניטור ממשיך כמו קודם. כדאי לבדוק שהחשבון של העבודה כולל את Claude Code, ליצור מפתח חדש ולשלוח שוב."
  echo "$(date -u +%FT%T) $id key rejected: ${out:0:120}" >> /var/log/monitor-owntoken.log; exit 0
fi
mkdir -p /root/tenant-tokens && chmod 700 /root/tenant-tokens
cp -a "$env" "/root/tenant-tokens/$id.env.bak-$(date +%Y%m%d%H%M)"
if grep -q '^CLAUDE_CODE_OAUTH_TOKEN=' "$env"; then sed -i "s|^CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=$key|" "$env"; else echo "CLAUDE_CODE_OAUTH_TOKEN=$key" >> "$env"; fi
date -u +%FT%TZ > "/root/tenant-tokens/$id.own"
# usage-watch.js (root) reads this to show the row as on the customer's own account.
mkdir -p /srv/monitor-changes && date -u +%FT%TZ > "/srv/monitor-changes/$id.own" && chmod 644 "/srv/monitor-changes/$id.own"
say "המוניטור מחובר עכשיו לחשבון שלך. מעכשיו כל העבודה כאן רצה על המנוי שלך."
echo "$(date -u +%FT%T) $id own key applied" >> /var/log/monitor-owntoken.log
