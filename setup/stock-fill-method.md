# מילוי מלאי: סטטוסי וואטסאפ ונרות (candle.times)

הוראות לסשן Claude שרץ ללא השגחה פעם ביום. המטרה: כל יום, 7 הימים הקרובים (בלי שבת) מלאים בשני התורים.
נכתב 11.11.2026. הכללים האדומים: ראו skills/abaitzik-onboarding. בלי מקפים בשום טקסט שמתפרסם (שם ה׳ בכתיב חב״ד הוא היוצא מן הכלל),
בלי אימוג׳י לב, לעולם לא לפרסם לוואטסאפ או לרשת, לא לשלוח הודעות לאנשים. תהליכים נהרגים לפי PID בלבד. רינדור כבד אחד בכל פעם (זיכרון המחשב צר).

## 0. מה חסר
בשרת (ssh -i C:/Users/User/.ssh/monitor_server root@178.105.63.97), במאגר /home/monitor/abaitzik-monitor:

    sudo -u monitor node stock-check.js --dry

השורות st (סטטוסים) ו nr (נרות) כוללות "חסרים: ..." עם התאריכים. "היום" ועד היום+6, בלי שבת (lib/stock.js, needed()). פריט נספר כמוכן אם יש לו date בטווח.
נרות: נספרים רק פריטים בלי posted/failed/rejected/hold. מרחיבים לפחות עד היום+7 כדי לא לרוץ על הקצה.
אם נתקעת באמצע rebase בשרת (.git/rebase-merge): `sudo -u monitor env GIT_EDITOR=true git rebase --continue`.
במחשב: `cd C:\Users\User\abaitzik-monitor; git pull --rebase` לפני כל עבודה. קומיט רק של הקבצים שלך (יש item.json לא קשור, לא נוגעים).

## 1. סטטוסי וואטסאפ
קבצים: `docs/status/queue.json` (רשימת {date, name, topic, file, caption}), מדיה ב `docs/status/media/`. העותק החי הוא במאגר בשרת, מגיע אליו ב git pull.
סבב (איציק, 11.11): ראשון שחר, שני האתר, שלישי המוניטור, רביעי אתר או מוניטור, חמישי המוניטור, שישי נרות, שבת כלום.
שחר מושהה מאז 7.11 ועד שאיציק יאמר שהשדרוג גמור: לא מקדמים אותו, ימי ראשון ושליש שחר מוחלפים באתר או במוניטור לסירוגין. לא להחליט בשמו: אם יש צורך, לכתוב לו שורה בדוח.
כל יום סרטון חדש לגמרי ותמונות שמעולם לא שימשו (לא פתיחה ולא סיום). אין למחזר.

### סרטון אתר או מוניטור (מנוע תמונות)
תיקייה: `C:\Users\User\clip\week_stories\wa_status`
1. בוחרים 2 תמונות לאורך (פורטרט) שלא שימשו: `python -c` שמשווה את מזהי px בכל `plan.json*` ובתיקייה `cand` מול `pexels.json` ו `px_a.json` (שדה id, alt). מורידים:
   `curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" -o cand/px<ID>.jpg "https://images.pexels.com/photos/<ID>/pexels-photo-<ID>.jpeg?auto=compress&cs=tinysrgb&h=2600"` (בלי User-Agent יש 403). נגמר המאגר: להוסיף חיפושים ל pexels.json.
2. מוסיפים ערך ל `plan.json` (גיבוי קודם: cp plan.json plan.json.bak-DDMM). שם: `wa-site-DDMM` או `wa-monitor-DDMM`. מבנה: music (gymno1_laucke.flac או gymno3_laucke.flac), mstart, dim_end 0.45, ושני shots, כל אחד {file, d:6.6/6.4, cx, cy, lines:[[טקסט, גודל, y, serif|sans|bold]], shade:true}, השני עם end:true. אורך הפתיחה: 2 שורות ב y 300 ו 450; הסיום ב y 640, 760, 880 עם הכתובת בגופן bold 100. אסור לחזור על קובץ תמונה בין שני סרטונים.
3. `python build.py <שם>` (כ 40 שניות לסרטון, אחד בכל פעם) יוצר `<שם>.mp4` 1080x1920, כ 12 שניות.
4. בדיקה: `ffprobe -v error -show_entries stream=codec_name,width,height,duration -of csv=p=0 <שם>.mp4` (h264 ו aac, 1080x1920) ושלוש תמונות: `ffmpeg -y -i f.mp4 -vf "select='eq(n,40)+eq(n,150)+eq(n,270)',scale=270:-1,tile=3x1" -frames:v 1 -vsync 0 f.jpg`, ולהסתכל עליהן (Read): טקסט קריא, בלי חיתוך, התמונה שונה מקודמותיה.
5. מעתיקים ל `docs/status/media/monitor-DDMM.mp4` או `site-DDMM.mp4` (שם חדש; אם מחליפים קובץ בשם קיים מוסיפים ?v= ב file).
6. מוסיפים ל queue.json (indent 2, utf8, ensure_ascii=False). topic: "האתר" או "המוניטור" או "נרות".
   כיתוב אתר: משפט קצר בקולו של איציק + `https://abaitzik.com/?utm_source=wa_status&utm_campaign=siteDDMM`.
   כיתוב מוניטור: `... פתרון מיידי, סדר מופתי.\nרוצה כזה לעסק שלך? https://it-solution.co.il/?utm_source=wa_status&utm_medium=status&utm_campaign=monitorDDMM`.
   בדיקת מקפים: אין "-", "–", "—" בטקסט (מחוץ לכתובות).
7. נרות בשישי: כרטיס "שבת שלום", כיתוב `https://candletimes.com/card/?utm_source=wa_status`, סרטון נרות דומה ל `candle-1311.mp4` (טקסט על רקע כהה חם, 17.5 שניות).

דוגמאות אחרונות לעיון: monitor-1711 וגם site-1811 (מנוע תמונות), site-lectures-1611, monitor-1211, candle-1311 (סרטוני טקסט פשוטים).

## 2. נרות (candle.times)
תור חי: `/home/monitor/ner-queue.json` בשרת (ner-post.js מפרסם לבד כל 10 דקות לפי date ו time, מדלג על שבת וחג). מראה: `docs/ner/queue.json`. מדיה: `docs/ner/media/*.mp4` ב git (אינסטגרם מביא משם מ GitHub Pages).
פריט: `{name, date, time ("20:00", בשישי "09:00"), kind: post|story, lang: he|en, city, file: "media/<name>.mp4", caption, approved: true, approvedBy: "itzik-DD.MM-auto"}`. סטורי עם caption ריק. 2 פוסטים ו 2 סטוריז ביום (עברית ואנגלית), אין שבת וחג (ראשון עד שישי), עיר ודמות חדשות בכל פעם, שם בצורת `post-he-mon-1611`.
איציק (7.11): הנרות עולים לבד, לכן approved: true.

### יצירת מדיה
מקור: `C:\Users\User\clip\week_stories\w1116` (השבוע שנבנה ב 10.11, ללא קשר לתאריך), אותה שיטה לשבוע הבא. הקבצים: `plan.py`, `find*.py` (בחירת תמונות עיר מויקישיתוף, נחלת הכלל), `copy.json` (לכל פריט: date, time, music, mstart, seg: שלושה קטעים עם שורות טקסט, city), `build.py` (רינדור), `run_all.sh` ו `run_rest.sh` (הרצה רציפה, פריט אחד בכל פעם), `qadd.py` (בונה את כיתובי התור מ copy.json ומוזיקה מ `free1021/music/music.json`), `items-final.json` (תוצאה).
סדר: להעתיק את התיקייה לשם w<DDMM> חדש, לעדכן copy.json לשבוע חדש עם ערים שלא שימשו (הרשימה ב `ner-posted.json` בשרת ובתור), להריץ find ו build, ואז qadd.py.
כיתוב עברית: משפט על האתר + "הלינק בביו: candletimes.com" + האשטגים + "תמונות: ויקישיתוף, נחלת הכלל. מוזיקה: ... Kevin MacLeod (incompetech.com), רישיון". אנגלית כנ"ל. חובה לשמור את קרדיט המוזיקה. בלי מקפים בכיתוב (הכתובת incompetech.com מותרת).
רינדור כבד: להריץ במחשב אחד בכל פעם, או בשרת עם `nice -n 10`. אם הפקודה נופלת ב "fork: Resource temporarily unavailable", לחכות ולהריץ שוב את מה שחסר בלבד.
הערה: בשבוע 16 עד 22.11 המדיה נבנתה כולה ב 10.11 אבל לא נכנסה לתור (נמצאה ב 11.11). נכנסו רק 16 עד 18.11. אם 19 עד 22.11 עדיין לא בתור, מכניסים אותם מ `w1116/items-final.json` (אחרי בדיקה, ראו למטה) ולא בונים מחדש. התאריכים 19.11 עד 22.11 זמינים: 4 פריטים לכל יום, שישי 09:00.

### בדיקות לפני הכנסה
לכל קובץ: ffprobe (h264, aac, 1080x1920, 14 עד 18 שניות) ושלוש תמונות (Read). הקובץ חייב להיות בשרת ב docs/ner/media (דרך git push ואז pull בשרת).
לא להוסיף פריט שכבר בתור או ב `ner-posted.json` (לפי name וגם לפי עיר באותו שבוע).

### הכנסה לתור (אטומית, בלי מירוץ עם ה cron)
    scp items.json root@SERVER:/tmp/add.json
    sudo -u monitor cp /home/monitor/ner-queue.json /home/monitor/ner-queue.bak-DATE-fill.json
    python3 (כ monitor): טוען את התור, מוסיף פריטים שאין להם name, ממיין לפי (date, time), כותב ל ner-queue.json.tmp ו os.replace.
    sudo -u monitor bash -c 'set -a; . /etc/monitor.env; set +a; HOME=/home/monitor TZ=Asia/Jerusalem node ner-post.js --mirror'
ה --mirror כותב את docs/ner/queue.json ודוחף. אם כתוב "פרסום קודם עוד רץ" זה תקין, זה ידחף עם הבא.

## 3. מסירה
במחשב: git add רק את `docs/status/queue.json`, המדיה החדשה, וקבצי הנרות שיצרת (מדיה ב docs/ner/media); הודעת קומיט מסתיימת ב

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01GfEuP3o6cAWnF4bT9r5mCR

(לשנות את מזהה הסשן לסשן הנוכחי), `git pull --rebase`, `git push`. אחר כך בשרת `sudo -u monitor git pull --rebase`.
אימות סופי: `sudo -u monitor node stock-check.js --dry`, שורות st ו nr בלי "חסרים". אם נשאר חסר, לכתוב מה ולמה בדוח (data/reports/reports) ולא לנחש.

## 4. מתי לעצור ולא להחליט
- לא מקדמים את שחר ללא אמירה מפורשת של איציק.
- פריט עם hold או rejected בתור: לא לגעת.
- תקלת רינדור חוזרת, או אין תמונות חדשות: לדווח, לא למחזר תמונה או סרטון ישן.
