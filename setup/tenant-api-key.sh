#!/bin/bash
# 11.11.2026, Itzik: "make a key for every monitor that connects from now on".
# Every customer's monitor runs on its own API key from Itzik's Claude Console
# (named monitor-<id>, never expires), not on his subscription. The key is created
# on the PC (Chrome, platform.claude.com/settings/keys) and copied to
# /root/tenant-tokens/<id>.apikey; this script (root) tests it as the customer's
# user, swaps it into /etc/<id>.env and marks the customer as on its own account,
# so the five hour and weekly guard of Itzik's subscription no longer applies.
# The monthly package (lib/plan.js) still counts and warns.
#   bash setup/tenant-api-key.sh <id>
set -uo pipefail
id="${1:-}"; [[ "$id" =~ ^[a-z0-9-]+$ ]] || { echo "usage: $0 <id>"; exit 2; }
src="/root/tenant-tokens/$id.apikey"; env="/etc/$id.env"
[ -f "$src" ] || { echo "no key at $src"; exit 2; }
[ -f "$env" ] || { echo "no $env"; exit 2; }
rec="/home/monitor/abaitzik-monitor/data/tenants/tenants/$id.json"
user=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).user||"")' "$rec")
[ -n "$user" ] || { echo "no user in $rec"; exit 2; }
chmod 600 "$src"
key=$(tr -d ' \r\n' < "$src")
[[ "$key" =~ ^sk-ant-[A-Za-z0-9_-]{40,}$ ]] || { echo "not a Claude key"; exit 3; }
out=$(cd /tmp && sudo -u "$user" env -u CLAUDE_CODE_OAUTH_TOKEN HOME="/home/$user" ANTHROPIC_API_KEY="$key" timeout 120 claude -p --model haiku "ענה במילה אחת: תקין" 2>&1 | tail -1)
echo "$out" | grep -q "תקין" || { echo "key test failed: ${out:0:120}"; exit 3; }
cp -a "$env" "/root/tenant-tokens/$id.env.bak-$(date +%Y%m%d%H%M)"
sed -i '/^CLAUDE_CODE_OAUTH_TOKEN=/d;/^ANTHROPIC_API_KEY=/d' "$env"
echo "ANTHROPIC_API_KEY=$key" >> "$env"
date -u +%FT%TZ > "/root/tenant-tokens/$id.own"
mkdir -p /srv/monitor-changes && date -u +%FT%TZ > "/srv/monitor-changes/$id.own" && chmod 644 "/srv/monitor-changes/$id.own"
systemctl restart "monitor-listen-$id.service"
echo "$id: on its own API key ($(systemctl is-active monitor-listen-$id.service))"
