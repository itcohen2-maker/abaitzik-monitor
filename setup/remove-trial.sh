#!/bin/bash
# 11.11.2026: removes one self signup TRIAL monitor and everything setup/new-tenant.sh made for it.
# Only ids of the form t + 6 hex (setup/signup-provision.sh), so it can never touch a real customer (pablo, alon, ilay...).
#   bash setup/remove-trial.sh t1a2b3c
# Run as root. Never on a paying customer: a trial that paid moves to its own name first.
set -uo pipefail
ID="${1:-}"
[[ "$ID" =~ ^t[a-f0-9]{6}$ ]] || { echo "only trial ids (t + 6 hex)"; exit 2; }
REPO=/home/monitor/abaitzik-monitor
HOST="$ID.m.it-solution.co.il"
[ -f "/srv/monitor-changes/$ID.plan.json" ] && grep -q '"plan":"entry"\|"plan": "entry"\|"plan":"small"\|"plan":"medium"\|"plan":"large"' "/srv/monitor-changes/$ID.plan.json" && { echo "$ID is on a paid package, not removing"; exit 3; }
for u in listen worker watchdog sync upload; do
  for k in service timer; do systemctl disable --now "monitor-$u-$ID.$k" >/dev/null 2>&1; rm -f "/etc/systemd/system/monitor-$u-$ID.$k"; done
done
rm -rf "/etc/systemd/system/monitor-worker-$ID.service.d"
systemctl daemon-reload
# The Caddy block of this host, from its first line to the closing brace at column 0.
cp -a /etc/caddy/Caddyfile "/root/Caddyfile.bak-rm-$ID"
python3 - "$HOST" <<'PY'
import sys
host = sys.argv[1]; p = '/etc/caddy/Caddyfile'
lines = open(p).read().split('\n'); out = []; skip = False
for l in lines:
    if l.startswith(host + ' {'): skip = True; continue
    if skip:
        if l == '}': skip = False
        continue
    out.append(l)
open(p, 'w').write('\n'.join(out))
PY
caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && systemctl reload caddy || { cp -a "/root/Caddyfile.bak-rm-$ID" /etc/caddy/Caddyfile; echo "caddy did not validate, restored"; }
sed -i "/-$ID\.\(service\|timer\)|/d" /usr/local/bin/monitor-keepalive.sh
sudo -u monitor node -e '
const fs=require("fs"),id=process.argv[1];
for (const f of ["data/fastchat/tenants.json","data/visits/keys.json"]) { try { const j=JSON.parse(fs.readFileSync(f,"utf8")); if (j[id]) { delete j[id]; fs.writeFileSync(f,JSON.stringify(j,null,1)); } } catch (e) {} }
for (const f of ["data/tenants/tenants/"+id+".json","data/visits/"+id+".json"]) { try { fs.unlinkSync(f); } catch (e) {} }
// 11.11: its connections page (signup-personalize.js) and its line in sources.json
try { const sf="data/cal/sources.json", s=JSON.parse(fs.readFileSync(sf,"utf8")), me=s.find((x)=>x&&x.name===id);
  if (me) { fs.writeFileSync(sf,JSON.stringify(s.filter((x)=>x!==me),null,1)); if (/^[a-f0-9]{20}$/.test(me.setup||"")) for (const e of [".def.json",".json",".secrets.json"]) { try { fs.unlinkSync("data/setup/"+me.setup+e); } catch (e2) {} } } } catch (e) {}' "$ID" 2>/dev/null
( cd "$REPO" ) && cd "$REPO"
rm -f "/etc/$ID.env" /srv/monitor-changes/$ID.* "/root/tenant-codes/$ID.txt" /root/tenant-tokens/$ID.* /var/log/monitor-*-$ID.log
chattr -i "/home/$ID/$ID-monitor/instance.json" "/home/$ID/$ID-monitor/data/profile.md" 2>/dev/null
pkill -u "$ID" 2>/dev/null; sleep 1
userdel -r "$ID" >/dev/null 2>&1 || rm -rf "/home/$ID"
q="$REPO/data/signup/queue/$ID.json"; [ -f "$q" ] && sudo -u monitor node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f,"utf8"));j.state="removed";j.removedAt=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(j,null,1))' "$q"
echo "$ID removed"
