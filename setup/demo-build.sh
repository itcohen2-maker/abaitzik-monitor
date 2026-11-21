#!/bin/bash
# 17.11.2026: the public demo monitor (demo.m.it-solution.co.il, it-solution.co.il/demo).
# Static only: no listener, no worker, no Claude token, no git. Run as root (monitor-demo.timer, nightly).
#  1. the code: branch stable, what the button checker passed, the same version the customers run (17.11; was HEAD),
#     without docs/ promo/ tests/ (git archive, no history on disk);
#  2. the data: lib/demo-data.js writes the invented barbershop with today's dates;
#  3. the page: MONITOR_NO_GATE build as the demo user, with instance.json publicDemo: true.
# instance.json and data/ under /home/demo/app are kept between runs. Log: /var/log/monitor-demo.log
set -euo pipefail
# 18.11.2026: the security check (monitor-security) flagged /var/log/monitor-demo.log as readable by all (644). systemd appends to it, so it keeps its mode; this makes it 640 on every run.
[ -f /var/log/monitor-demo.log ] && chmod 640 /var/log/monitor-demo.log || true
SRC=/home/monitor/abaitzik-monitor
# 21.11.2026: a trade demo (lib/trades.js), "demo-build.sh gypsum": its own folder /home/demo/app-<trade>, instance demo-<trade>,
# host demo-<trade>.m.it-solution.co.il. Without an argument, the barbershop as before. REF=<ref> builds another branch (a preview).
TRADE="${1:-}"
if [ -n "$TRADE" ] && ! [[ "$TRADE" =~ ^[a-z]{2,20}$ ]]; then echo "bad trade"; exit 1; fi
REF="${REF:-origin/stable}"
NAME="demo${TRADE:+-$TRADE}"
HOST="$NAME.m.it-solution.co.il"
APP=/home/demo/app${TRADE:+-$TRADE}
mkdir -p "$APP"
[ -n "$TRADE" ] && [ ! -f "$APP/instance.json" ] && cp /home/demo/app/instance.json "$APP/instance.json"
NEW=$(mktemp -d /home/demo/.app-new-XXXX)
cd "$SRC"
# 19.11.2026: the timer runs as root and the log showed git "dubious ownership" errors on every run of the code copy
runuser -u monitor -- git -c safe.directory=/home/monitor/abaitzik-monitor fetch -q origin stable
runuser -u monitor -- git -c safe.directory=/home/monitor/abaitzik-monitor archive "$REF" | tar -x -C "$NEW" --exclude=docs --exclude=promo --exclude=tests --exclude=instance.json --exclude=data
# the code is replaced, instance.json and data stay
find "$APP" -mindepth 1 -maxdepth 1 ! -name instance.json ! -name data ! -name docs -exec rm -rf {} +
cp -a "$NEW"/. "$APP"/
rm -rf "$NEW"
chown -R demo:demo "$APP"
# mktemp made the copy 700 and cp -a carried it over: Caddy could not read the page (17.11)
chmod 711 "$APP"; setfacl -m u:caddy:x "$APP" 2>/dev/null || true
cd "$APP"
# 19.11.2026, Itzik: "שמוניטור ההדגמה ידגים הכל ... גם התוספות בתשלום". The demo's package, Medium with every add-on on
# (bank read only, accounting on Morning, 50 more signatures). Only the instance named "demo" reads this file
# (lib/plan-io.js stateOf), so the 📦 tile, the money view and the 🔌 rows show as for a customer who bought them.
# Written here as root from this repo, never by the demo's own code.
# Only once the code copied from stable has the demo of 19.11 (lib/demo-acts.js): older code would show these screens empty.
if [ -f "$APP/lib/demo-acts.js" ]; then
PLAN=/srv/monitor-changes/$NAME.plan.json
printf '{"plan":"medium","month":"%s","extra":0,"applied":[],"history":[],"addons":{"accounting":{"on":true,"at":"2026-11-01T08:00:00.000Z","software":"morning"},"bank":{"on":true,"at":"2026-11-01T08:00:00.000Z","bank":"demo","kind":"business"},"sign50":{"on":true,"at":"2026-11-01T08:00:00.000Z"}}}\n' \
  "$(TZ=Asia/Jerusalem date +%Y-%m)" > "$PLAN.tmp" && chown monitor:monitor "$PLAN.tmp" && chmod 644 "$PLAN.tmp" && mv "$PLAN.tmp" "$PLAN"
# and every screen a customer can have that the invented data fills (instance.json stays between runs; this keeps it right)
node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f,"utf8"));
j.screens=["gMyBoard","gBhCal","gBhMeet","gBhClients","gBhMail","gBhQuote","gRemind","gTasks","gCamp","gCIdeas","gShopList","gUpgrade"];
j.board=true;const t=process.argv[2];if(t){const T=require("./lib/trades.js").get(t);j.name="demo-"+t;j.trade=t;j.screens=T.screens.slice();j.board=false;const B=require("./lib/demo-trades/"+t+".js").BIZ;j.owner=B.owner;j.pageTitle="המוניטור של "+B.name;j.biz={name:B.name,sub:B.sub,phone:"03-0000000",address:"רחוב הדוגמה 1, "+B.city};j.publicUrl="https://"+T.host+"/";j.origin="https://"+T.host;}
fs.writeFileSync(f,JSON.stringify(j,null,1));' "$APP/instance.json" "$TRADE"
fi
sudo -u demo -H node lib/demo-data.js data ${TRADE:+--trade "$TRADE"}
# 21.11.2026: build.js writes the manifest only when it is missing, so a renamed demo kept its old install name
rm -f "$APP/docs/manifest.webmanifest"
sudo -u demo -H env MONITOR_NO_GATE=1 node build.js 2>&1 | tail -1
# Shared code carries owner only links with private tokens (forms /f/, pages /p/, partner /r/). A customer's page is
# sealed, this one is public, so every such token is cut from the built files.
find "$APP/docs" -type f \( -name '*.html' -o -name '*.json' -o -name '*.js' \) -exec sed -i -E 's#(it-solution\.co\.il|abaitzik\.com)/(f|p|r)/[A-Za-z0-9]{12,}#\1/\2/x#g' {} +
# The shared code also names real customers and projects (in owner only branches, regexes, comments). Each name is
# replaced by a neutral word, whole words only (Hebrew letters around it count as the same word: שחרור stays).
NAMES_HE='שי בודק|שולמן|פבלו|איליי|אילי|אלון|רינת|אמינוב|יהודה|שחר|יניב|נחמן|יואל|גיתית|לולוס|פגסוס|סלינדה|הום סטייל'
NAMES_EN='shai|bodek|pablo|shulman|ilay|ily|alon|rinat|aminov|yehuda|shachar|yaniv|nachman|lolos|pegasus|salinda|homestyle|hagitit|itcohen2?'
# Names that a Hebrew prefix letter cannot turn into another word (לשחר, בשולמן) are matched with it too; אלון is not
# (שאלון). A message that opens with "שי, " loses the name, and code ids that hold "shai" are renamed.
NAMES_PRE='שחר|שולמן|פבלו|איליי|יניב|נחמן|גיתית|לולוס|פגסוס|סלינדה'
find "$APP/docs" -type f \( -name '*.html' -o -name '*.json' -o -name '*.js' \) -exec perl -CSD -Mutf8 -pi -e \
  "s/(?<!\\p{Hebrew})([בלמוהכ])(?:$NAMES_PRE)(?!\\p{Hebrew})/\${1}לקוח/g; s/(?<!\\p{Hebrew})(?:$NAMES_HE)(?!\\p{Hebrew})/לקוח/g; s/(['\"])שי, /\$1/g; s/shai/cx/gi; s/אבא איציק/IT Solution/g; s/(?<!\p{Hebrew})([ולבהמש]{1,2})איציק(?!\p{Hebrew})/\${1} IT Solution/g; s/(?<!\p{Hebrew})(?:איציק|יצחק)(?!\p{Hebrew})/IT Solution/g; s/\\b(?:$NAMES_EN)\\b/cx/gi" {} +
# Never publish anything of Itzik's. On a hit the page is replaced by a short notice, and the run fails.
HIT=$(find "$APP/docs" -type f \( -name '*.html' -o -name '*.json' -o -name '*.js' \) -exec perl -CSD -Mutf8 -ne \
  "print \"\$ARGV: \$&\\n\" if /(?<!\\p{Hebrew})[בלמוהכ]?(?:$NAMES_PRE)(?!\\p{Hebrew})|(?<!\\p{Hebrew})(?:$NAMES_HE|יצחק|איציק)(?!\\p{Hebrew})|shai|\\b(?:$NAMES_EN)\\b|\\@gmail\\.com|\\/(?:f|p|r)\\/[a-f0-9]{16,}/i" {} + | head -5)
if [ -n "$HIT" ]; then
  echo "$HIT"
  printf '<!doctype html><meta charset="utf-8"><title>הדגמה</title><p style="font-family:sans-serif;text-align:center;margin-top:20vh">ההדגמה מתעדכנת, נסו שוב בעוד כמה דקות.</p>' > "$APP/docs/index.html"
  echo "!! leak check failed, page replaced"; exit 1
fi
# The page as a visitor gets it. 17.11: a permissions slip served nothing and no one knew. One alert per failed run
# (at most two a day, the timer runs twice).
CODE=$(curl -s -o /tmp/demo-check.html -w '%{http_code}' https://$HOST/ || true)
if [ "$CODE" != 200 ] || ! grep -q PUBLIC_DEMO /tmp/demo-check.html; then
  echo "!! live check failed: $CODE"
  cd "$SRC" && sudo -u monitor -H node notify.js "מוניטור ההדגמה לא עולה" "$HOST החזיר $CODE אחרי הבנייה. יומן: /var/log/monitor-demo.log" || true
  exit 1
fi
# 17.11: the day's numbers to Itzik's 📄 דוחות (lib/demo-stats.js), as user monitor, from his own copy
if [ -z "$TRADE" ]; then cd "$SRC" && runuser -u monitor -- node lib/demo-stats.js >/dev/null 2>&1 || echo "!! demo-stats failed"; fi
echo "$(date -Is) built"
