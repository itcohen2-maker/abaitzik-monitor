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
cd "$APP"
sudo -u demo -H node lib/demo-data.js data
sudo -u demo -H env MONITOR_NO_GATE=1 node build.js 2>&1 | tail -1
# Shared code carries owner only links with private tokens (forms /f/, pages /p/, partner /r/). A customer's page is
# sealed, this one is public, so every such token is cut from the built files.
find "$APP/docs" -type f \( -name '*.html' -o -name '*.json' -o -name '*.js' \) -exec sed -i -E 's#(it-solution\.co\.il|abaitzik\.com)/(f|p|r)/[A-Za-z0-9]{12,}#\1/\2/x#g' {} +
# Never publish anything of Itzik's. On a hit the page is replaced by a short notice, and the run fails.
if grep -r -q -i -E "itcohen2|hagitit|@gmail\.com|לולוס|פגסוס|(f|p|r)/[a-f0-9]{16,}" "$APP/docs"; then
  grep -r -o -i -E ".{0,40}(itcohen2|hagitit|@gmail\.com|לולוס|פגסוס|(f|p|r)/[a-f0-9]{16,}).{0,20}" "$APP/docs" | head -5
  printf '<!doctype html><meta charset="utf-8"><title>הדגמה</title><p style="font-family:sans-serif;text-align:center;margin-top:20vh">ההדגמה מתעדכנת, נסו שוב בעוד כמה דקות.</p>' > "$APP/docs/index.html"
  echo "!! leak check failed, page replaced"; exit 1
fi
echo "$(date -Is) built"
