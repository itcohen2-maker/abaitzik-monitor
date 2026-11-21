#!/bin/bash
# 30.10.2026, Itzik (ntfy-dcqPJr68BY4G): "תפקידך זה לעורר אותו ולבדוק כל הזמן שהוא ממשיך". Code only, no model:
# fetches the candletimes repo every morning 09:00 Israel. If nothing new reached its master for 3 days, one push. Ends 5.12.
[ "$(date +%Y)" = "2026" ] || exit 0
[ "$(date +%Y%m%d)" -lt 20261205 ] || exit 0
NER=/home/monitor/ner-site
ST=/home/monitor/abaitzik-monitor/data/status/ner-plan.state
timeout 60 git -C "$NER" fetch -q origin master || exit 0
NOW=$(date +%s)
HEAD=$(git -C "$NER" rev-parse origin/master)
OLD=$(sed -n 1p "$ST" 2>/dev/null)
SEEN=$(sed -n 2p "$ST" 2>/dev/null); SEEN=${SEEN:-$NOW}
if [ "$HEAD" != "$OLD" ]; then
  printf '%s\n%s\n' "$HEAD" "$NOW" > "$ST"
  exit 0
fi
[ $((NOW - SEEN)) -ge 259200 ] || exit 0
cd /home/monitor/abaitzik-monitor && node notify.js "נרות: שלושה ימים בלי שינוי באתר" "לא עלה שום שינוי לאתר candletimes מאז $(date -d @$SEEN +%d.%m). אם העבודה נעצרה, כדאי לבדוק."
printf '%s\n%s\n' "$HEAD" "$NOW" > "$ST"
