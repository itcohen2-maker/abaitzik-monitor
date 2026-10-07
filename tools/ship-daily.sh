#!/bin/sh
# 6.10.2026. Home Style, once a day as the shipments user: the brief, the Excel,
# then the page, so the screen and the file are from the same minute.
set -e
cd "$(dirname "$0")/.."
# 8.10: a paused customer gets no daily run.
node -e 'process.exit(require("./lib/instance.js").paused ? 1 : 0)' || exit 0
node ship-brief.js
SHIP_DIR="$(node -e 'process.stdout.write(require("./lib/instance.js").shipmentsDir)')" \
  /opt/ship-venv/bin/python -I tools/ship-export.py data/files-private/shipments.xlsx
node build.js | tail -1
chmod -R o+rX docs
