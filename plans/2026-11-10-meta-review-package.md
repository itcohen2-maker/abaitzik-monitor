# חבילת הגשה ל Meta: אימות עסק ו App Review (10.11.2026)

מלווה את `2026-11-05-oauth-google-meta.md`. מה שאפשר להכין בלי לחכות לאישור. ההגשה עצמה של איציק, בחשבון שלו.
הטקסטים באנגלית כתובים להדבקה בטפסים של Meta (הצוות שלה קורא אנגלית). שאר המסמך בעברית.

## שלב 1: אימות עסק (Business Verification)

איפה: הגדרות העסק, אבטחה (Security Center), "התחלת אימות".

| שדה | מה להזין |
|---|---|
| שם משפטי | בדיוק כמו בתעודת עוסק מורשה: כהן יצחק (או כפי שמופיע שם). לא "IT Solution" |
| שם תצוגה / שם מסחרי | IT Solution |
| מספר עוסק | כפי שמופיע בתעודה |
| מען | כפי שמופיע בתעודה |
| אתר | https://it-solution.co.il (הדומיין חייב להיות מאומת בהגדרות העסק) |
| מסמך | העתק תעודת עוסק מורשה (PDF, מלא, קריא, לא חתוך) |
| מייל | כתובת על הדומיין (למשל שם@it-solution.co.il). לא ג׳ימייל |
| טלפון | מספר שמקבל שיחה או SMS. יש לנו את סים 052-8074881 ל SMS |

חשוב: בישראל עוסק מורשה פועל תחת שמו ובשם מסחרי. השם המשפטי הוא מה שבתעודה (כהן יצחק, כינוי "יצחק כהן"), ו IT Solution הוא שם מסחרי. אין צורך לשנות כינוי ברשות המסים.
מה ש Meta בודקת הוא שהשם בטופס זהה למסמך, ושהאתר מציג אותו עסק. נבדק 10.11: באתר it-solution.co.il, בעמוד הבית, ב `/terms` וב `/privacy`, אין שם משפטי ואין מספר עוסק.
להוסיף לתחתית האתר ולעמוד התנאים שורה אחת: "IT Solution, יצחק כהן, עוסק מורשה <המספר מהתעודה>". זה פרסום באתר ציבורי, ולכן באישור איציק.
דפים שכבר קיימים באתר (נבדק 10.11, קוד 200): `/privacy`, `/terms`, `/data-deletion`.

## שלב 2: האפליקציה

שם: IT Solution Monitor (מזהה 1107995065171769). קטגוריה: Business and pages. Facebook Login for Business עם config מסוג System-user access token.

**App description (paste):**
IT Solution Monitor is a private business assistant for small business owners in Israel. The owner connects their Facebook Page, Instagram business account and ad account once.
The assistant reads incoming messages and ad results, and prepares drafts: replies to customers, ad campaigns, post captions and a daily spend report. Nothing is published, sent or spent
without the owner's explicit approval inside the product. Each customer's data is stored in a separate environment and is never shared or used to train models.

## שלב 3: הרשאות

לכל הרשאה: מה היא עושה, סרטון (עד 2 דקות), טקסט להדבקה. בכל סרטון חייבים לראות: חיבור הלקוח (Login), הפעולה, ולחיצת אישור של הלקוח לפני כל פעולה שיוצאת החוצה.

| הרשאה | מה היא עושה אצלנו | מה רואים בסרטון |
|---|---|---|
| `pages_show_list`, `pages_read_engagement`, `pages_read_user_content` | רשימת הדפים של הלקוח, פוסטים ותגובות לקריאה | התחברות, בחירת הדף, מסך הפעילות |
| `pages_manage_metadata`, `pages_messaging` | הודעות נכנסות מהדף ותשובה מוצעת | הודעה נכנסת, טיוטת תשובה, לחיצת "לשלוח" |
| `pages_manage_posts` | פוסט בדף, מיידי או מתוזמן | טיוטת פוסט בכרטיס הקמפיינים, לחיצת אישור, הפוסט בדף |
| `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages` | תגובות והודעות באינסטגרם עם תשובה מוצעת | תגובה נכנסת, טיוטה, אישור |
| `instagram_content_publish` | פוסט וריל, עם מוזיקה מספריית אינסטגרם דרך `audio_configuration` | טיוטת ריל, בחירת אודיו מהתוצאות, אישור, הריל בחשבון |
| `ads_read` | דוח יומי: הוצאה, לידים, עלות לליד | מסך הדוח עם נתוני חשבון בדיקה |
| `ads_management` | יצירת קמפיין, קהל ותקציב מהטיוטה שהלקוח אישר | טיוטה, אישור, הקמפיין בחשבון (במצב PAUSED) |
| `leads_retrieval` | הלידים נכנסים ללקוחות ולידים במוניטור | טופס לידים, הליד במוניטור |
| `business_management` | מציאת הדפים וחשבונות המודעות בתיק העסקי | מסך הבחירה אחרי ההתחברות |

**Paste, per permission (adapt the first line):**
We use <permission> only to <action> for the business owner who connected their own account. Every action that leaves the product (a message, a post, a campaign or a spend) is shown as a draft
and requires a click on "Approve" by the owner. We do not use the data for advertising to other people, do not sell it, and do not share it between customers. The owner can disconnect at any time
from Meta's Business Integrations page, and we delete their data on request (https://it-solution.co.il/data-deletion).

## מה צריך לפני ההגשה

1. **גישה לבודקים:** סביבת בדיקה עם נתונים מומצאים וחשבון בדיקה של Meta (חשבון עסקי בדיקה, דף ואינסטגרם בדיקה). קוד כניסה לסביבה נשלח ב Reviewer notes, לא בסרטון.
2. **הכל במצב אישור:** המוניטור כבר עובד כך (`lib/approvals.js`, "מחכה לך"), וזה מה שמראים.
3. **פרסום וקמפיין בסביבת בדיקה:** קמפיין נוצר במצב PAUSED, ופוסט בדף בדיקה, כדי שלא יצא כסף או תוכן אמיתי.
4. **סרטונים:** הקלטה אחת לכל קבוצת הרשאות, עם כתוביות באנגלית.
5. **מה לא מבקשים:** `ads_management` ו `pages_manage_posts` נשלחים רק אחרי שהסביבה בנויה. הקריאה בלבד (`ads_read`, `pages_read_engagement`) אפשר להגיש קודם.

## אחרי האישור

- שמירת טוקן בקובץ 600 של כל לקוח (`tenants-health`), ולא ב ntfy או בצ׳אט.
- ב `lib/campaign.js`: להפעיל יצירת קמפיין וטיוטת פוסט לפרסום אחרי אישור הלקוח בלבד.
- Instagram Audio API: חיפוש אודיו, סינון, ורק מהתוצאות הלקוח בוחר. אל תסתמכו על תיקיית RF עד שרואים אותה בתוצאות.
