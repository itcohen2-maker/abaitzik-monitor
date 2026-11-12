#!/bin/bash
# 12.11.2026, Itzik: a customer connects his own WhatsApp number from 🔌 (Kapso). wa-bridge.js leaves
# data/kapso/pending/<tenant>.json {tenantId, phoneId, display, at, hook} when Kapso says the number is connected.
# This wires it to his monitor. Run as root by monitor-wa-kapso.timer every minute (setup/monitor-wa-kapso.*).
#
# Per pending file:
#   1. the per number webhook is registered (wa-bridge does it; here again if it failed);
#   2. the owner's phone is found: the tenant's own data/wa.json, Itzik's data/wa-tenants.json (the number the
#      customer writes from), the signup queue record. Not found: the file stays, logged, nothing is half done;
#   3. setup/wa-tenant.sh <tenant> <phoneId> <owner> <port> (a free port from 8811 up, routes and ports checked);
#   4. his data/wa.json gets kapsoKey, kapsoSecret, kapsoDisplay (never printed), his bridge restarts, his page is
#      rebuilt so 🔌 shows the number as connected;
#   5. the file moves to data/kapso/done/. Idempotent: running it again changes nothing.
# Secrets never go to the log or the command line.
set -uo pipefail
R=/home/monitor/abaitzik-monitor
D=$R/data
P=$D/kapso/pending
DONE=$D/kapso/done
LOG=/var/log/monitor-wa-kapso.log
exec 9>/run/wa-kapso-provision.lock
flock -n 9 || exit 0
log() { echo "$(date -Is) $*" >> "$LOG"; }
cd "$R" || exit 1
# 12.11.2026, Itzik: the quick connect (lib/wa-quick-provision.js): data/wa-tenants-pending/<tenant>.json left by wa-bridge.js
# when a customer sent his code or wrote "ניתוק". Maps the number, writes his status, rebuilds his page, pushes, confirms.
node "$R/lib/wa-quick-provision.js" >> "$LOG" 2>&1 || log "quick connect provisioning failed"
[ -d "$P" ] || exit 0

# jget <file> <a.b.c>
jget() { node -e 'try{const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((a,k)=>a&&a[k],o);process.stdout.write(v==null?"":String(v))}catch(e){}' "$1" "$2"; }

# Marks an error on the pending file (and tells Itzik once, on the 10th failure in a row).
fail() {
  local f=$1 why=$2
  log "$(basename "$f"): $why"
  node -e '
const fs=require("fs"),f=process.argv[1];let o={};try{o=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){process.exit(0)}
o.tries=(o.tries||0)+1;o.err=process.argv[2];fs.writeFileSync(f,JSON.stringify(o,null,1),{mode:0o600});
process.stdout.write(String(o.tries))' "$f" "$why" > /tmp/wa-kapso-tries.$$ 2>/dev/null
  if [ "$(cat /tmp/wa-kapso-tries.$$ 2>/dev/null)" = "10" ]; then
    sudo -u monitor node "$R/notify.js" "💬 חיבור וואטסאפ תקוע" "החיבור של $(basename "$f" .json) לא הושלם: $why" >/dev/null 2>&1
  fi
  rm -f /tmp/wa-kapso-tries.$$
}

# The owner's WhatsApp number (972...) for a tenant, empty when none is known.
owner_of() {
  node -e '
const fs=require("fs"),path=require("path");
const T=process.argv[1],D=process.argv[2];
const rd=(f)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return null}};
const norm=(p)=>{let d=String(p||"").replace(/\D/g,"");if(/^05\d{8}$/.test(d))d="972"+d.slice(1);return /^9725\d{8}$/.test(d)?d:""};
const rec=rd(path.join(D,"tenants","tenants",T+".json"))||{};
const c=[];
const w=rd(path.join(rec.dir||"/nonexistent","data","wa.json"))||{};
c.push(w.owner,(w.allow||[])[0]);
const wt=rd(path.join(D,"wa-tenants.json"))||{};
Object.keys(wt).forEach((k)=>{if(wt[k]&&wt[k].tenant===T)c.push(k)});
const q=rd(path.join(D,"signup","queue",T+".json"))||{};
c.push(rec.ownerPhone,rec.phone,q.phone);
for(const x of c){const n=norm(x);if(n){process.stdout.write(n);break}}' "$1" "$D"
}

# A free port from 8811 up: not a route of Itzik's bridge, not listening.
free_port() {
  node -e '
const fs=require("fs"),cp=require("child_process");
let used=new Set();
try{const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));Object.values(m.routes||{}).forEach((r)=>used.add(Number(r.port)))}catch(e){}
try{cp.execSync("ss -ltnH",{encoding:"utf8"}).split("\n").forEach((l)=>{const m=l.match(/:(\d+)\s/);if(m)used.add(Number(m[1]))})}catch(e){}
let p=8811;while(used.has(p))p++;process.stdout.write(String(p))' "$D/wa.json"
}

for f in "$P"/*.json; do
  [ -e "$f" ] || continue
  # wa-bridge is still busy with it (registering the webhook): give it a minute
  [ $(( $(date +%s) - $(stat -c %Y "$f") )) -lt 45 ] && continue
  T=$(jget "$f" tenantId); PID=$(jget "$f" phoneId); DISP=$(jget "$f" display)
  [[ "$T" =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]] && [[ "$PID" =~ ^[0-9]{5,25}$ ]] || { fail "$f" "bad pending file"; continue; }
  REC=$D/tenants/tenants/$T.json
  [ -f "$REC" ] || { fail "$f" "no tenant record"; continue; }
  U=$(jget "$REC" user); TD=$(jget "$REC" dir)
  [ -n "$U" ] && [ -d "$TD" ] || { fail "$f" "tenant user or dir missing"; continue; }

  if [ "$(jget "$f" hook)" != ok ]; then
    if sudo -u monitor node "$R/lib/kapso.js" hook "$PID" >/dev/null 2>&1; then
      node -e 'const fs=require("fs"),f=process.argv[1];const o=JSON.parse(fs.readFileSync(f,"utf8"));o.hook="ok";fs.writeFileSync(f,JSON.stringify(o,null,1),{mode:0o600})' "$f"
    else fail "$f" "per number webhook not registered"; continue; fi
  fi

  ROUTED=$(node -e 'try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((m.routes&&m.routes[process.argv[2]])?"1":"")}catch(e){}' "$D/wa.json" "$PID")
  if [ -z "$ROUTED" ]; then
    OWNER=$(owner_of "$T")
    [ -n "$OWNER" ] || { fail "$f" "owner phone not found (data/wa-tenants.json, signup queue, his wa.json)"; continue; }
    PORT=$(free_port)
    if ! bash "$R/setup/wa-tenant.sh" "$T" "$PID" "$OWNER" "$PORT" >> "$LOG" 2>&1; then fail "$f" "wa-tenant.sh failed"; continue; fi
  fi

  # Kapso instead of a Meta token. Secrets are read here and written to the tenant's file, never echoed.
  node -e '
const fs=require("fs");
const [D,TD,DISP]=[process.argv[1],process.argv[2],process.argv[3]];
const k=JSON.parse(fs.readFileSync(D+"/kapso.json","utf8")),m=JSON.parse(fs.readFileSync(D+"/wa.json","utf8"));
if(!k.apiKey||!m.kapsoSecret)throw new Error("kapso key or secret missing");
const f=TD+"/data/wa.json";const t=JSON.parse(fs.readFileSync(f,"utf8"));
t.kapsoKey=k.apiKey;t.kapsoSecret=m.kapsoSecret;if(DISP)t.kapsoDisplay=DISP;if(!t.token)t.token="";
fs.writeFileSync(f+".tmp",JSON.stringify(t,null,1),{mode:0o600});fs.renameSync(f+".tmp",f)' "$D" "$TD" "$DISP" 2>>"$LOG" \
    || { fail "$f" "could not write kapso keys"; continue; }
  chown "$U:$U" "$TD/data/wa.json"; chmod 600 "$TD/data/wa.json"
  systemctl restart "monitor-wa-$T.service" >> "$LOG" 2>&1 || { fail "$f" "bridge restart failed"; continue; }

  # the 🔌 row shows the number as connected on the next build; best effort, the worker rebuilds anyway
  ( cd "$TD" && timeout 300 sudo -H -u "$U" node build.js >> "$LOG" 2>&1 ) || log "$T: page rebuild failed, it follows with the next build"

  mkdir -p "$DONE"
  node -e 'const fs=require("fs"),[f,to]=[process.argv[1],process.argv[2]];const o=JSON.parse(fs.readFileSync(f,"utf8"));o.doneAt=new Date().toISOString();delete o.err;fs.writeFileSync(to,JSON.stringify(o,null,1),{mode:0o600});fs.unlinkSync(f)' "$f" "$DONE/$T.json"
  chown monitor:monitor "$DONE/$T.json"
  log "$T: connected, number $PID"
  sudo -u monitor node "$R/notify.js" "💬 וואטסאפ מחובר" "הוואטסאפ של $(jget "$REC" title) מחובר למוניטור שלו" >/dev/null 2>&1
done
exit 0
