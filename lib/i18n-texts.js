'use strict';
/*
  23.11.2026: the Russian texts of the appointment diary that are built from pieces (a name, a service, a day, an hour). A
  dictionary of whole Hebrew strings cannot translate a sentence like 'ב' + day + ' בשעה ' + time (the Hebrew prefixes are glued to
  the words), so for an instance with lang "ru" these few sentences have their own simple Russian here, and lib/book-links.js,
  lib/bookings-remind.js, lib/book-core.js and lib/bookings-handler.js call into this file. Without lang "ru" nothing here is used.

  Names of days: JS getDay order, 0 = Sunday, like lib/bookings.js DAY_NAMES.
*/
const NOM = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const ACC = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
const SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const ddmm = (d) => d.slice(8) + '.' + d.slice(5, 7); // d = YYYY-MM-DD
const isRu = (lang) => lang === 'ru';
// "понедельник 24.11"
const dayNom = (dow, d) => NOM[dow] + ' ' + ddmm(d);
// "в понедельник 24.11"
const dayAcc = (dow, d) => ACC[dow] + ' ' + ddmm(d);
const first = (name) => String(name || '').replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')[0];

// the link the owner sends to a client: d, s, t are the optional day, service and time of the link
function linkText(o) {
  const what = (o.service ? ' на «' + o.service + '»' : '') + (o.dayAcc ? ' ' + o.dayAcc + (o.time ? ' в ' + o.time : '') : '');
  return 'Здравствуйте, ' + first(o.name) + '! Вот ссылка для записи' + what + ': ' + o.url;
}
function linkTitle(name) { return 'Ссылка для записи: ' + first(name); }
function confirmText(o) {
  const h = o.hours;
  const terms = (h > 0 ? 'Отменить или перенести запись можно не позднее чем за ' + h + ' ч. до приёма, ' : 'Запись можно отменить или перенести в любое время, ') + (o.link ? 'здесь: ' + o.link : 'через WhatsApp');
  return 'Здравствуйте, ' + first(o.name) + '! Ваша запись на «' + o.service + '» ' + o.dayAcc + ' в ' + o.time + ' (' + o.biz + ') подтверждена. ' + terms + '.' + (h > 0 && o.link ? ' После этого только через WhatsApp.' : '');
}
function confirmTitle(name) { return 'Подтверждение записи: ' + first(name); }
function cancelledText(o) {
  return 'Здравствуйте, ' + first(o.name) + '! Ваша запись на «' + o.service + '» ' + o.dayAcc + ' в ' + o.time + ' (' + o.biz + ') отменена.' + (o.url ? ' Новая запись: ' + o.url + '.' : '');
}
function cancelledTitle(name) { return 'Отмена записи: ' + first(name); }
function reminderText(o) {
  return 'Здравствуйте, ' + first(o.name) + '! Напоминаю: завтра в ' + o.time + ' у вас «' + o.service + '» (' + o.biz + '). ' + (o.link ? 'Подтвердить или изменить: ' + o.link : 'Чтобы перенести или отменить, напишите мне.');
}
const REMIND_TITLE = 'Напоминания о записях на завтра';
// the owner's evening summary
function summaryText(n, lines, remindedN) {
  return (n === 1 ? 'Завтра одна запись:' : 'Завтра записей: ' + n + ':') + '\n' + lines.join('\n')
    + (remindedN ? '\nНапоминания клиентам (' + remindedN + ') ждут в «📤 Сообщения к отправке», каждое отправляется одним нажатием.' : '');
}
function summaryWa(n) { return n === 1 ? 'Завтра одна запись. Подробности и напоминание клиенту ждут в мониторе.' : 'Завтра записей: ' + n + '. Подробности и напоминания клиентам ждут в мониторе.'; }
function lateText(lines, n) { return 'Добавлено на завтра: ' + lines.join('; ') + '. ' + (n === 1 ? 'Напоминание готово' : 'Напоминания готовы') + ' в «📤 Сообщения к отправке».'; }
const LATE_WA = 'Добавлена запись на завтра. Подробности и напоминание ждут в мониторе.';
const LATE_PUSH = '📅 Добавлена запись на завтра';

module.exports = { NOM, ACC, SHORT, isRu, dayNom, dayAcc, first, linkText, linkTitle, confirmText, confirmTitle, cancelledText, cancelledTitle, reminderText, REMIND_TITLE, summaryText, summaryWa, lateText, LATE_WA, LATE_PUSH };
