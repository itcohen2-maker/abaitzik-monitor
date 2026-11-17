#!/bin/bash
# 17.11.2026: the public demo monitor (demo.m.it-solution.co.il, it-solution.co.il/demo).
# Static only: no listener, no worker, no Claude token, no git. Run as root (monitor-demo.timer, nightly).
#  1. the code: Itzik's committed HEAD, without docs/ promo/ tests/ (git archive, no history on disk);
#  2. the data: lib/demo-data.js writes the invented barbershop with today's dates;
#  3. the page: MONITOR_NO_GATE build as the demo user, with instance.json publicDemo: true.
# instance.json and data/ under /home/demo/app are kept between runs. Log: /var/log/monitor-demo.log
set -euo pipefail
SRC=/home/monitor/abaitzik-monitor
APP=/home/demo/app
NEW=$(mktemp -d /home/demo/.app-new-XXXX)
cd "$SRC"
git archive HEAD | tar -x -C "$NEW" --exclude=docs --exclude=promo --exclude=tests --exclude=instance.json --exclude=data
# the code is replaced, instance.json and data stay
find "$APP" -mindepth 1 -maxdepth 1 ! -name instance.json ! -name data ! -name docs -exec rm -rf {} +
cp -a "$NEW"/. "$APP"/
rm -rf "$NEW"
chown -R demo:demo "$APP"
# mktemp made the copy 700 and cp -a carried it over: Caddy could not read the page (17.11)
chmod 711 "$APP"; setfacl -m u:caddy:x "$APP" 2>/dev/null || true
cd "$APP"
sudo -u demo -H node lib/demo-data.js data
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
  "s/(?<!\\p{Hebrew})([בלמוהכ])(?:$NAMES_PRE)(?!\\p{Hebrew})/\${1}לקוח/g; s/(?<!\\p{Hebrew})(?:$NAMES_HE)(?!\\p{Hebrew})/לקוח/g; s/(['\"])שי, /\$1/g; s/shai/cx/gi; s/\\b(?:$NAMES_EN)\\b/cx/gi" {} +
# Never publish anything of Itzik's. On a hit the page is replaced by a short notice, and the run fails.
HIT=$(find "$APP/docs" -type f \( -name '*.html' -o -name '*.json' -o -name '*.js' \) -exec perl -CSD -Mutf8 -ne \
  "print \"\$ARGV: \$&\\n\" if /(?<!\\p{Hebrew})[בלמוהכ]?(?:$NAMES_PRE)(?!\\p{Hebrew})|(?<!\\p{Hebrew})(?:$NAMES_HE|יצחק כהן)(?!\\p{Hebrew})|shai|\\b(?:$NAMES_EN)\\b|\\@gmail\\.com|\\/(?:f|p|r)\\/[a-f0-9]{16,}/i" {} + | head -5)
if [ -n "$HIT" ]; then
  echo "$HIT"
  printf '<!doctype html><meta charset="utf-8"><title>הדגמה</title><p style="font-family:sans-serif;text-align:center;margin-top:20vh">ההדגמה מתעדכנת, נסו שוב בעוד כמה דקות.</p>' > "$APP/docs/index.html"
  echo "!! leak check failed, page replaced"; exit 1
fi
# The page as a visitor gets it. 17.11: a permissions slip served nothing and no one knew. One alert per failed run
# (at most two a day, the timer runs twice).
CODE=$(curl -s -o /tmp/demo-check.html -w '%{http_code}' https://demo.m.it-solution.co.il/ || true)
if [ "$CODE" != 200 ] || ! grep -q PUBLIC_DEMO /tmp/demo-check.html; then
  echo "!! live check failed: $CODE"
  cd "$SRC" && sudo -u monitor -H node notify.js "מוניטור ההדגמה לא עולה" "demo.m.it-solution.co.il החזיר $CODE אחרי הבנייה. יומן: /var/log/monitor-demo.log" || true
  exit 1
fi
echo "$(date -Is) built"
