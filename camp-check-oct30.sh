#!/bin/bash
# 27.10.2026, Itzik: "שים בדיקה קבועה במוניטור בתזכורת ואז לא תשכח". One-shot on 30.10.2026 09:05: queue the 3 day campaign check for the PC.
[ "$(date +%Y)" = "2026" ] || exit 0
cd /home/monitor/abaitzik-monitor || exit 1
node pc-task.js add --re campaign-check "בדיקת 3 ימים לקמפיין ITsolution דף חדש 27.10 (campaign 52556959006764, act_191762840889782), קריאה בלבד. בכרום (Profile 4) במנהל המודעות, דרך adsmanager-graph עם window.__accessToken: לכל המודעות הפעילות בקמפיין (מ 28.10 בלילה 12 מודעות חדשות ששמן מתחיל ב חדש 28.10, refs story-a, story-b, card-mail, card-pay, card-nocourse, card-cal; ואם הישנות עוד רצות גם הן) הוצאה, חשיפות, קליקים לקישור, עלות לקליק ולידים מאז 27.10; ולידים באתר לפי ref. לא לשנות כלום בקמפיין. לענות לאיציק בעברית בלי מקפים: טבלה קצרה, איזו מודעה הכי חלשה, והמלצה לכבות את החלשות. לשלוח את אותו סיכום גם במייל ל itcohen2@gmail.com. החלפה רק אחרי שהוא מאשר."
