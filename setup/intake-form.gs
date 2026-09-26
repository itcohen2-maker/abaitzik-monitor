/**
 * בונה את טופס האפיון להקמת מוניטור אישי.
 * להריץ פעם אחת. בסוף ההרצה, ב"יומן ההרצה" יופיעו שני קישורים:
 * הקישור לשליחה למי שממלא, והקישור לעריכה.
 */
function buildIntakeForm() {
  var f = FormApp.create('שאלון אפיון, הקמת מוניטור אישי');
  f.setDescription(
    'ארבעים ושש שאלות, בערך חמש דקות.\n\n' +
    'אין תשובות נכונות או שגויות. מה שלא בטוח, אפשר לדלג ונשלים בשיחה.\n\n' +
    'המוניטור נבנה לפי התשובות: אילו מסכים יופיעו, מה יוצג בכל אחד, מתי מגיעות ' +
    'התראות ובאיזה טון. שני אנשים שעונים אחרת מקבלים שתי מערכות שונות.'
  );
  f.setProgressBar(true);
  f.setCollectEmail(false);

  f.addTextItem().setTitle('איך קוראים לך?').setRequired(true);
  f.addTextItem().setTitle('טלפון או מייל לחזרה').setRequired(true);

  f.addSectionHeaderItem().setTitle('החלק הראשון, מי אתה ומה אתה עושה');
  f.addMultipleChoiceItem().setTitle('מה מתאר הכי טוב את מה שאתה עושה ביום יום?').setChoiceValues(['עסק עצמאי שלי', 'מלווה ובונה מותגים ללקוחות', 'עובד שכיר', 'לומד', 'כמה דברים במקביל']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('כמה זמן אתה בתחום הזה?').setChoiceValues(['פחות משנה', 'שנה עד שלוש', 'שלוש עד חמש', 'יותר מחמש']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה עובד לבד או עם אנשים?').setChoiceValues(['לבד לגמרי', 'עם שותף', 'יש לי צוות', 'נעזר בפרילנסרים']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מאיפה מגיעים אליך הלקוחות היום?').setChoiceValues(['המלצות', 'רשתות חברתיות', 'פרסום ממומן', 'אתר', 'עוד לא ברור לי']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('כמה לקוחות פעילים יש לך עכשיו?').setChoiceValues(['אין עדיין', 'אחד עד שלושה', 'ארבעה עד עשרה', 'יותר מעשרה']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה הדבר שהכי גוזל לך זמן?').setChoiceValues(['לקוחות ותיאום', 'יצירת תוכן', 'כספים וחשבוניות', 'למידה והתעדכנות', 'רדיפה אחרי אנשים']).showOtherOption(true);

  f.addSectionHeaderItem().setTitle('החלק השני, איך העבודה שלך נראית');
  f.addMultipleChoiceItem().setTitle('איך אתה עוקב היום אחרי מה שצריך לעשות?').setChoiceValues(['בראש', 'פתקים ונייר', 'אפליקציה', 'אקסל', 'וואטסאפ לעצמי']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה הכי נופל לך בין הכיסאות?').setChoiceValues(['לחזור לאנשים', 'דדליינים', 'גבייה', 'מעקב אחרי מה שכבר נעשה', 'רעיונות שנשכחים']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('באיזו שעה ביום אתה הכי פרודוקטיבי?').setChoiceValues(['בוקר מוקדם', 'לפני הצהריים', 'אחר הצהריים', 'ערב', 'לילה']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('כמה ימים בשבוע אתה עובד?').setChoiceValues(['פחות מארבעה', 'ארבעה עד חמישה', 'שישה', 'כל השבוע']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה עובד בעיקר מול מחשב או מול טלפון?').setChoiceValues(['מחשב', 'טלפון', 'שניהם באותה מידה']).showOtherOption(true);
  // 26.9: the setup steps differ per device (connecting the computer, the
  // phone app). These two answers become computer and phone in instance.json.
  f.addMultipleChoiceItem().setTitle('איזה מחשב יש לך?').setChoiceValues(['מק (אפל)', 'ווינדוס', 'אין לי מחשב']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('איזה טלפון יש לך?').setChoiceValues(['אייפון', 'אנדרואיד (סמסונג, שיאומי וכו׳)']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('כשאתה מקבל משימה חדשה, מה קורה בפועל?').setChoiceValues(['רושם מיד', 'זוכר ומטפל', 'רושם אבל לא חוזר', 'תלוי במצב רוח']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה עושה לך יום טוב בעבודה?').setChoiceValues(['סגרתי לקוח', 'סיימתי משהו שנתקע', 'יצרתי משהו יפה', 'לא כיביתי שרפות']).showOtherOption(true);

  f.addSectionHeaderItem().setTitle('החלק השלישי, לקוחות ומותגים');
  f.addMultipleChoiceItem().setTitle('אתה מנהל מותג של לקוח מההתחלה או נכנס לקיים?').setChoiceValues(['מההתחלה', 'לקיים', 'שניהם']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה אתה מספק ללקוח בפועל?').setChoiceValues(['אסטרטגיה', 'תוכן שוטף', 'עיצוב וזהות', 'ליווי אישי', 'הכל יחד']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('כמה זמן נמשך ליווי טיפוסי?').setChoiceValues(['חד פעמי', 'חודש עד שלושה', 'חצי שנה', 'מתמשך ללא סוף']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('איך אתה מתעד מה סוכם עם לקוח?').setChoiceValues(['בכתב במסמך', 'בהודעות', 'בראש', 'חוזה מסודר']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה הכי מתסכל אצל לקוחות?').setChoiceValues(['לא מחזירים תשובה', 'משנים כיוון', 'לא משלמים בזמן', 'לא מבינים מה עשיתי']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה שומר את החומרים של כל לקוח במקום מסודר?').setChoiceValues(['כן, לכל אחד תיקייה', 'הכל ביחד', 'מפוזר', 'לא שומר']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('היית רוצה שהמערכת תזכיר לך לחזור ללקוח שנעלם?').setChoiceValues(['כן, חשוב מאוד', 'כן, לפעמים', 'לא צריך']).showOtherOption(true);

  f.addSectionHeaderItem().setTitle('החלק הרביעי, תוכן ורשתות');
  f.addMultipleChoiceItem().setTitle('באילו רשתות אתה פעיל?').setChoiceValues(['אינסטגרם', 'טיקטוק', 'פייסבוק', 'יוטיוב', 'לינקדאין', 'כמה מהן']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('כל כמה זמן אתה מעלה תוכן?').setChoiceValues(['כל יום', 'כמה פעמים בשבוע', 'פעם בשבוע', 'כשבא לי']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה הכי קשה בתוכן?').setChoiceValues(['לחשוב על רעיון', 'לכתוב', 'לצלם ולערוך', 'להתמיד', 'לדעת אם זה עבד']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה עובד עם לוח תוכן מראש?').setChoiceValues(['כן, מתוכנן', 'חלקית', 'ממש לא']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מי כותב את הטקסטים?').setChoiceValues(['אני', 'הלקוח', 'מישהו אחר', 'תלוי']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('היית רוצה שהמערכת תכין לך רעיונות מראש?').setChoiceValues(['כן, הרבה', 'כן, מעט', 'מעדיף לחשוב לבד']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה מודד אצלך הצלחה בתוכן?').setChoiceValues(['צפיות', 'תגובות והודעות', 'עוקבים חדשים', 'לקוחות שהגיעו', 'לא מודד']).showOtherOption(true);

  f.addSectionHeaderItem().setTitle('החלק החמישי, כסף וניירת');
  f.addMultipleChoiceItem().setTitle('איך אתה מוציא חשבוניות?').setChoiceValues(['תוכנה', 'רואה חשבון', 'ידני', 'עוד לא הוצאתי']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה יודע בכל רגע כמה חייבים לך?').setChoiceValues(['כן, מדויק', 'בערך', 'ממש לא']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה קורה כשלקוח לא משלם בזמן?').setChoiceValues(['מזכיר מיד', 'מחכה ומתבייש', 'תלוי בלקוח', 'לא קרה']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('היית רוצה מסך של כסף במערכת?').setChoiceValues(['כן, חשוב', 'אולי בהמשך', 'לא, מספיק לי מה שיש']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה שומר קבלות והוצאות באופן מסודר?').setChoiceValues(['כן', 'חלקית', 'לא']).showOtherOption(true);

  f.addSectionHeaderItem().setTitle('החלק השישי, איך נוח לך לעבוד מול המערכת');
  f.addMultipleChoiceItem().setTitle('איך תעדיף לכתוב למערכת?').setChoiceValues(['להקליד', 'להקליט קול', 'לצלם מסך', 'הכל לפי מצב']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('כמה עדכונים היית רוצה לקבל ביום?').setChoiceValues(['אחד מרוכז', 'שניים שלושה', 'בכל פעם שקורה משהו', 'כמה שפחות']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('באיזו שעה נוח לקבל עדכון יומי?').setChoiceValues(['בוקר', 'צהריים', 'ערב', 'לפני השינה']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה רוצה התראות לטלפון?').setChoiceValues(['כן, על הכל', 'רק על דחוף', 'לא, אני אכנס לבד']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה יגרום לך להפסיק להשתמש במערכת?').setChoiceValues(['יותר מדי הודעות', 'מסובך מדי', 'לא רלוונטי לי', 'לוקח לי זמן במקום לחסוך']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('אתה מעדיף תשובות קצרות או מפורטות?').setChoiceValues(['קצרות מאוד', 'קצרות עם אפשרות להרחיב', 'מפורטות']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה הטון שמתאים לך?').setChoiceValues(['ענייני ויבש', 'חברי', 'ישיר בלי לרכך', 'תלוי בנושא']).showOtherOption(true);

  f.addSectionHeaderItem().setTitle('החלק השביעי, אתה');
  f.addMultipleChoiceItem().setTitle('מה אתה עושה כשאתה לא עובד?').setChoiceValues(['ספורט', 'מוזיקה', 'גיימינג', 'לצאת עם חברים', 'לנוח']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('יש לך משהו שאתה לומד עכשיו?').setChoiceValues(['כן, בקורס', 'כן, לבד', 'רוצה אבל לא מתחיל', 'לא']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה הדבר שהכי היית רוצה לשפר בעצמך בעבודה?').setChoiceValues(['סדר', 'התמדה', 'ביטחון מול לקוחות', 'תמחור', 'איזון עם החיים']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('מה מלחיץ אותך הכי הרבה?').setChoiceValues(['לא לעמוד בזמנים', 'לאבד לקוח', 'לא להספיק הכל', 'כסף', 'לא מלחיץ אותי']).showOtherOption(true);
  f.addMultipleChoiceItem().setTitle('איפה אתה רואה את עצמך בעוד שנה?').setChoiceValues(['אותו דבר אבל מסודר', 'יותר לקוחות', 'צוות', 'תחום אחר', 'לא יודע']).showOtherOption(true);
  f.addParagraphTextItem().setTitle('מה היית רוצה שהמערכת תעשה בשבילך שאף אחד לא עושה היום?');
  f.addParagraphTextItem().setTitle('יש משהו שלא שאלנו ואתה חושב שחשוב שנדע?');

  Logger.log('קישור לשליחה: ' + f.getPublishedUrl());
  Logger.log('קישור לעריכה: ' + f.getEditUrl());
}

/**
 * The two device questions, for the form that already exists. Run once in the
 * owner's Apps Script against the live form; buildIntakeForm above has them too.
 */
function addDeviceQuestions() {
  var f = FormApp.openById('1gpZQJLada9TffcVMvNozAkQ_d_VS62a6DwYOM-yR8p0');
  var items = f.getItems(), at = -1;
  for (var i = 0; i < items.length; i++) if (items[i].getTitle() === 'אתה עובד בעיקר מול מחשב או מול טלפון?') at = i;
  var a = f.addMultipleChoiceItem().setTitle('איזה מחשב יש לך?').setChoiceValues(['מק (אפל)', 'ווינדוס', 'אין לי מחשב']).showOtherOption(true);
  var b = f.addMultipleChoiceItem().setTitle('איזה טלפון יש לך?').setChoiceValues(['אייפון', 'אנדרואיד (סמסונג, שיאומי וכו׳)']).showOtherOption(true);
  if (at >= 0) { f.moveItem(a.getIndex(), at + 1); f.moveItem(b.getIndex(), at + 2); }
  Logger.log('added at ' + (at + 1));
}
