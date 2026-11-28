#!/bin/bash
# 17.11.2026, Itzik: "ברגע שאתה מנתק מוניטור לבקשתי אתה צריך גם לחשוב איפה עוד אפשר לנתק אותו".
# Disconnects a real customer's monitor from EVERY place, keeping his data (remove-trial.sh deletes; this does not).
#   bash setup/disconnect-tenant.sh pablo
# Run as root. Undo notes go to /root/disconnected/<id>/README.
set -uo pipefail
ID="${1:-}"
[[ "$ID" =~ ^[a-z0-9-]{2,30}$ ]] && [ "$ID" != abaitzik ] || { echo "usage: disconnect-tenant.sh <tenant id>"; exit 2; }
REPO=/home/monitor/abaitzik-monitor; D=/root/disconnected/$ID; mkdir -p "$D"
echo $(( $(date +%s) + 1800 )) > /run/monitor-maintenance-until
# 1. every systemd unit of his (services, timers, paths, drop-ins)
cd /etc/systemd/system
for u in $(ls | grep -E "(-|^)$ID([-.]|$)"); do
  [[ "$u" =~ \.(service|timer|path)$ ]] && systemctl disable --now "$u" >/dev/null 2>&1
  mv "$u" "$D/" && echo "$u" >> "$D/units.txt"
done
systemctl daemon-reload
# 2. keepalive and root cron
sed -i "/-$ID\.\(service\|timer\)|/s/^\([^#]\)/# disconnected $(date +%F) \1/" /usr/local/bin/monitor-keepalive.sh
crontab -l > "$D/crontab.bak" 2>/dev/null; crontab -l 2>/dev/null | grep -v -- "$ID" | crontab -
# 3. billing off, no block
P=/srv/monitor-changes/$ID.pay.json
[ -f "$P" ] && cp -a "$P" "$D/" && python3 - "$P" <<'PY'
import json,sys;p=sys.argv[1];d=json.load(open(p));d['on']=False;d.pop('block',None);d['offNote']='disconnected (setup/disconnect-tenant.sh)';json.dump(d,open(p,'w'),ensure_ascii=False,indent=1)
PY
# 4. instance flags
I=/home/$ID/$ID-monitor/instance.json
if [ -f "$I" ]; then chattr -i "$I" 2>/dev/null; cp -a "$I" "$D/"; python3 - "$I" <<'PY'
import json,sys;p=sys.argv[1];d=json.load(open(p));d['paused']=True;d['disconnected']=True;json.dump(d,open(p,'w'),ensure_ascii=False,indent=1)
PY
chattr +i "$I" 2>/dev/null; fi
# 5. Itzik's lists: monitors screen, health, guard, fast chat, visits, calendar and mail pull, ads, WhatsApp line, setup intake
mkdir -p $REPO/data/tenants/disconnected; chown monitor:monitor $REPO/data/tenants/disconnected
sudo -u monitor node -e '
const fs=require("fs"),id=process.argv[1],R=process.argv[2]+"/data/";
const rd=(f,d)=>{try{return JSON.parse(fs.readFileSync(R+f,"utf8"))}catch(e){return d}}, wr=(f,o)=>fs.writeFileSync(R+f,JSON.stringify(o,null,1));
const said=[];
try{fs.renameSync(R+"tenants/tenants/"+id+".json",R+"tenants/disconnected/"+id+".json");said.push("tenants")}catch(e){}
for(const f of ["fastchat/tenants.json","visits/keys.json"]){const j=rd(f,null);if(j&&j[id]){fs.writeFileSync(R+"tenants/disconnected/"+id+"."+f.replace("/","-"),JSON.stringify(j[id]));delete j[id];wr(f,j);said.push(f)}}
let setupTok="";
for(const f of ["cal/sources.json","ads/sources.json"]){const s=rd(f,null);if(Array.isArray(s)){const me=s.filter(x=>x&&(x.name===id||x.tenant===id));if(me.length){if(me[0].setup)setupTok=me[0].setup;wr(f,s.filter(x=>!me.includes(x)));said.push(f)}}}
const w=rd("wa-tenants.json",{});for(const k of Object.keys(w))if(w[k]&&w[k].tenant===id){delete w[k];said.push("wa "+k.slice(0,5))}wr("wa-tenants.json",w);
const m=rd("setup-intake/map.json",{});for(const k of Object.keys(m))if(m[k]===id){m[k]="-";said.push("intake map")}if(setupTok&&m[setupTok]!=="-"){m[setupTok]="-";said.push("intake map")}wr("setup-intake/map.json",m);
console.log("lists: "+said.join(", "));' "$ID" "$REPO"
# 6. his page: a short "disconnected" notice (410) instead of the monitor
HOST=$(python3 -c "import json;print(json.load(open('$REPO/data/tenants/disconnected/$ID.json')).get('host',''))" 2>/dev/null)
if [ -n "$HOST" ] && grep -q "^$HOST {" /etc/caddy/Caddyfile; then
  cp -a /etc/caddy/Caddyfile "$D/Caddyfile.bak"
  python3 - "$HOST" <<'PY'
import sys
host=sys.argv[1];p='/etc/caddy/Caddyfile';L=open(p).read().split('\n');out=[];skip=False
for l in L:
    if l.startswith(host+' {'):
        skip=True
        out+= [host+' {','\theader Content-Type "text/html; charset=utf-8"',
               '\theader Strict-Transport-Security "max-age=31536000"',
               '\theader X-Frame-Options "DENY"',
               '\theader X-Content-Type-Options "nosniff"',
               '\theader Referrer-Policy "no-referrer"',
               '\theader Content-Security-Policy "default-src \x27none\x27; style-src \x27unsafe-inline\x27; frame-ancestors \x27none\x27"',
               '\trespond "<!doctype html><html lang=he dir=rtl><meta charset=utf-8><meta name=viewport content=\'width=device-width,initial-scale=1\'><title>המוניטור מנותק</title><body style=\'font-family:Heebo,Arial,sans-serif;text-align:center;padding:80px 20px;font-size:22px\'>המוניטור הזה מנותק. תודה רבה.</body></html>" 410','}']
        continue
    if skip:
        if l=='}': skip=False
        continue
    out.append(l)
open(p,'w').write('\n'.join(out))
PY
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then bash /home/monitor/abaitzik-monitor/setup/safe-caddy-reload.sh --allow "$ID"; echo "page: $HOST 410"; else cp -a "$D/Caddyfile.bak" /etc/caddy/Caddyfile; echo "caddy did not validate, restored"; fi
fi
cat > "$D/README" <<TXT
$ID disconnected $(date -u +%FT%TZ). Data kept in /home/$ID.
Undo: mv $D/*.service $D/*.timer $D/*.path (and .d dirs) back to /etc/systemd/system, daemon-reload, enable --now;
move $REPO/data/tenants/disconnected/$ID.json back to data/tenants/tenants/; restore Caddyfile.bak (caddy reload, not systemctl);
remove paused/disconnected from instance.json; re-add wa-tenants, cal/sources, fastchat, visits keys from the backups here.
TXT
rm -f /run/monitor-maintenance-until
echo "$ID disconnected"
