# App Review למטא, IT Solution Monitor (1107995065171769), חבילה מוכנה 15.11.2026

ממשיך את plans/2026-11-10-meta-review-package.md. כל הטקסטים באנגלית מיועדים להדבקה בטופס של מטא.

## מצב ב 15.11.2026 (נבדק בכרום)

- **אימות העסק** (תיק 1052359345167019): "בבדיקה". אחרי שהוא מאושר אפשר להפוך ל Tech Provider.
- **App Review:** Not submitted. אין שום פריט בהגשה.
- **Become a Tech Provider:** הכפתור פתוח בלוח הבקרה. הלחיצה פותחת חלון "Yes, I'm a Tech Provider", שכתוב בו שאי אפשר לבטל את הבחירה. זו הצהרה בשם העסק, ולכן איציק לוחץ. לא נלחץ.
- **מקרי שימוש באפליקציה:** WhatsApp, Pages, Instagram API, Capture & manage ad leads, Messenger. כל ההרשאות במצב Ready for testing.

| הרשאה | קריאות ב 30 יום | לבקש? |
|---|---|---|
| pages_show_list | 1k | כן |
| pages_read_engagement | 2.1k | כן |
| pages_read_user_content | 1 | כן |
| pages_manage_metadata | 2 | כן |
| pages_messaging | 1k | כן |
| pages_manage_ads | 1 | כן (לידים מהמודעות) |
| instagram_basic | 12 | כן |
| instagram_manage_comments | 1 | כן |
| instagram_manage_messages | 1 | כן |
| instagram_content_publish | 1 | כן |
| leads_retrieval | 0 (קריאת בדיקה נעשתה ב 15.11 לטפסי הלידים של הדף, המונה מתעדכן עד יום) | כן |
| ads_read | 915 | כן |
| business_management | 82 | כן |
| ads_management | 0 | **לא עכשיו.** אין קריאה מוצלחת, והטוקן של abaitzik לא מקבל אותה. בהגשה שנייה, אחרי שסביבת הבדיקה מוכנה |
| public_profile | 9 | ברירת מחדל |

הערה: הטוקן של abaitzik (system user של האפליקציה) מכיל 12 הרשאות, בלי ads_read, ads_management ו business_management. הקריאות שנספרו ל ads_read ו business_management הגיעו מחיבור אחר. לכן אין צורך בחיבור מחדש לפני ההגשה, חוץ מ ads_management.

## App description (paste)

IT Solution Monitor is a private business assistant for small business owners in Israel. The owner connects their own Facebook Page, Instagram professional account and ad account once, from a setup page inside the product.
The assistant reads incoming messages, comments, leads and ad results, and prepares drafts: replies to customers, post captions, and a daily ad report. Nothing is published or sent without the owner's explicit approval inside the product. Each customer's data is kept in a separate environment and is never shared between customers, sold, or used to train models. Data deletion: https://it-solution.co.il/data-deletion

## Per permission (paste)

**pages_show_list**
After the business owner logs in with Facebook Login for Business, we use pages_show_list to show the list of Pages they manage, so they can choose which Page to connect to their monitor. We only store the ID and name of the Page they selected.

**pages_read_engagement**
We use pages_read_engagement to read the posts, reactions and comment counts of the owner's connected Page, and show them in a daily activity summary in the owner's private monitor. The data is shown only to the owner of that Page.

**pages_read_user_content**
We use pages_read_user_content to read comments and ratings that people leave on the owner's Page, so the owner sees new comments in one place and gets a suggested reply. A reply is posted only after the owner clicks "Approve".

**pages_manage_metadata**
We use pages_manage_metadata to subscribe our app to the owner's Page webhooks (messages, comments, leadgen), so new messages and leads reach the owner's monitor in real time instead of polling.

**pages_messaging**
We use pages_messaging to show the owner incoming Messenger conversations of their Page and to send a reply that the owner wrote or approved. The assistant prepares a draft; nothing is sent until the owner clicks "Send". We do not send promotional or automated messages.

**pages_manage_ads**
We use pages_manage_ads together with leads_retrieval to read the lead forms attached to the owner's Page ads, so leads from those forms appear in the owner's lead list.

**leads_retrieval**
We use leads_retrieval to receive leads that people submit through the owner's Lead Ads forms and show them in the owner's lead list with a reminder to call back. Leads are visible only to the owner of the Page, and are deleted on request.

**instagram_basic**
We use instagram_basic to identify the Instagram professional account linked to the owner's Page (username, profile picture, media list), so the owner can confirm the right account is connected and see their recent posts in the monitor.

**instagram_manage_comments**
We use instagram_manage_comments to show the owner new comments on their Instagram posts and reels, with a suggested reply. The reply is published only after the owner approves it. The owner can also hide spam comments from the same screen.

**instagram_manage_messages**
We use instagram_manage_messages to show the owner Instagram Direct messages sent to their professional account, and to send the reply they wrote or approved. Nothing is sent automatically.

**instagram_content_publish**
We use instagram_content_publish to publish a post or reel that the owner prepared and approved in the monitor, at the time they chose. Every publication requires the owner's explicit "Approve and publish" click.

**ads_read**
We use ads_read to show the owner a daily report of their own ad account: spend, results, cost per lead and which ad performs best. The report is read only and visible only to the owner.

**business_management**
We use business_management only during setup, to find the Pages, Instagram accounts and ad accounts that belong to the business portfolio the owner selected, and to let the owner choose which assets to connect.

## Reviewer instructions (paste)

1. Open https://form.it-solution.co.il/s/<test page token> (a test setup page with sample data, prepared for Meta reviewers).
2. Click "Connect Facebook" and log in with the test user below. Select the test Page and the test Instagram account.
3. After connecting, the page shows a link to the test monitor. Enter the access code below.
4. In the monitor: the "Messages" tile shows Messenger and Instagram Direct conversations with a suggested reply and a "Send" button; the "Comments" tile shows comments with "Approve reply"; the "Leads" tile shows leads from the test lead form; the "Ads" tile shows the daily ad report; the "Publish" tile shows a draft post with "Approve and publish".
Test user, password and access code: in the Reviewer notes field only, never in the video.

## הסרטונים (טרם הוקלטו)

סרטון לכל קבוצה, עד 2 דקות, כתוביות באנגלית, ממשק באנגלית, ובכל אחד רואים את ההתחברות, את הפעולה ואת לחיצת האישור:
1. התחברות ובחירת דף, אינסטגרם וחשבון מודעות: pages_show_list, business_management, instagram_basic.
2. הודעות Messenger ואינסטגרם: pages_messaging, instagram_manage_messages, pages_manage_metadata.
3. תגובות בדף ובאינסטגרם: pages_read_engagement, pages_read_user_content, instagram_manage_comments.
4. לידים: leads_retrieval, pages_manage_ads (טופס בדיקה דרך Lead Ads Testing Tool).
5. דוח מודעות: ads_read.
6. פרסום פוסט: instagram_content_publish.

מה צריך לפני ההקלטה: דף הקמה באנגלית לבודקים (כמו דף ההדגמה של גוגל, f837b9adea42a6f2ceda, pageEn ב setup.js), מוניטור בדיקה עם נתונים מומצאים (לא הלקוחות האמיתיים ולא המוניטור של איציק), ו**איציק ליד המחשב במסך ההתחברות של פייסבוק** (מתן הרשאות OAuth הוא שלו).
כל סרטון נשמר בהורדות בשם meta-review-video-N-<topic>.mp4 ונשלח לאיציק לצפייה מהטלפון. לא עולה ליוטיוב ולא נכנס לטופס לפני שהוא ראה ואישר.

## מה איציק עושה, לפי הסדר

1. כשמטא מאשרת את אימות העסק: ללחוץ "Become a Tech Provider" ואז "Yes, I'm a Tech Provider" (בלוח הבקרה של האפליקציה). זו הצהרה שאי אפשר לבטל.
2. להיות ליד המחשב כ 20 דקות להקלטת ההתחברות לפייסבוק.
3. לצפות בסרטונים מהטלפון ולאשר.
4. בסוף: שאלות שימוש בנתונים (Data Handling) והצהרות בשם העסק, ולחיצה על Submit.
