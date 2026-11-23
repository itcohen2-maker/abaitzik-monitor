'use strict';
/*
  23.11.2026: the Russian side of the self signup. A signup made in Russian (the signup page sends lang:'ru', lib/signup.js
  keeps it) gets a Russian monitor (instance.json lang 'ru') and every text sent to the customer in Russian: the code
  mail, the "monitor is ready" mail, the trial week mails, the WhatsApp lines. Itzik's own alerts stay in Hebrew.
  Simple Russian, formal "вы", no dashes. Same structure, links and codes as the Hebrew texts (lib/mailer.js, lib/trial-nudge.js).
*/
const fs = require('fs');
const path = require('path');

const SIGN = '\n\nIT Solution · Бизнес-монитор';
const hello = (name) => (name && String(name).indexOf('@') < 0 ? 'Здравствуйте, ' + name + '!' : 'Здравствуйте!');

// 'ru' only when the value says so, anything else is Hebrew ('').
function norm(l) { return l === 'ru' ? 'ru' : ''; }

// The language of a customer's monitor folder: the owner's choice in Settings wins over instance.json (as lib/instance.js).
function tenantLang(dir) {
  try { const v = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'status', 'lang.json'), 'utf8')); if (v && (v.lang === 'ru' || v.lang === '')) return v.lang; } catch (e) { /* instance.json decides */ }
  try { return norm(JSON.parse(fs.readFileSync(path.join(dir, 'instance.json'), 'utf8')).lang); } catch (e) { return ''; }
}

function codeMail(name, code) {
  return {
    subject: 'Код подтверждения для регистрации: ' + code,
    text: hello(name) + '\n\nВаш код подтверждения: ' + code + '\nВведите его на странице регистрации, чтобы подтвердить почту. Код действует 15 минут.\nКогда монитор будет готов, кнопка на странице сразу откроет его, без нового кода. Также придёт письмо «Ваш монитор готов» со ссылкой, которая открывает монитор одним нажатием.\n\nЕсли вы не запрашивали код, просто проигнорируйте это письмо.' + SIGN,
  };
}

function readyMail(name, url, pass) {
  return {
    subject: 'Ваш монитор готов',
    text: hello(name) + '\n\nВаш монитор готов, и пробная неделя начинается прямо сейчас: 60 действий, а общение с монитором и тренировки без ограничений.\n\n'
      + 'Ссылка открывает монитор сразу, ничего вводить не нужно:\n' + url + '\n\n'
      + 'На другом устройстве, или если монитор попросит код, вот код входа (' + String(pass).length + ' цифр): ' + pass + '\n\nСохраните монитор сейчас, чтобы не искать это письмо каждый раз:\n\nНа iPhone: откройте ссылку в Safari, нажмите кнопку «Поделиться» (квадрат со стрелкой вверх), затем «На экран Домой». На экране появится значок, как у приложения.\nНа Android: откройте ссылку в Chrome, нажмите три точки вверху, затем «Добавить на главный экран» или «Установить приложение».\nНа компьютере: откройте ссылку и нажмите Ctrl+D (на Mac Cmd+D), и она сохранится в закладках. Чтобы создать значок на рабочем столе: в Chrome три точки, «Сохранить и поделиться», затем «Создать ярлык».\n\nПри первом открытии со значка или из закладки монитор может попросить код входа. Введите его один раз, и устройство запомнит.' + SIGN,
  };
}

const DAYS = { Sun: 'в воскресенье', Mon: 'в понедельник', Tue: 'во вторник', Wed: 'в среду', Thu: 'в четверг', Fri: 'в пятницу', Sat: 'в субботу' };
function endText(end) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(end)).forEach((x) => { p[x.type] = x.value; });
  const h = Number(p.hour) % 24;
  return DAYS[p.weekday] + ' в ' + (h < 10 ? '0' : '') + h + ':' + p.minute;
}

const CODE = 'Код входа есть в письме «Ваш монитор готов».';
const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return (m > 10 && m < 20) ? c : d === 1 ? a : (d >= 2 && d <= 4) ? b : c; };
// k: noEntry, idle, lastDay. c: as lib/trial-nudge.js mail().
function nudgeMail(k, c) {
  if (k === 'noEntry') return {
    subject: 'Ваш монитор ждёт вас',
    text: hello(c.name) + '\n\nВаш монитор готов уже несколько часов, а вы ещё не заходили.\n\n'
      + 'Ссылка: ' + c.url + '\n' + CODE + '\n\n'
      + 'Первый шаг занимает минуту: подключить Gmail. Монитор читает письма за последнюю неделю, показывает, что срочно, и готовит черновики ответов. Ничего не отправляется, пока вы не нажмёте «Отправить».' + SIGN,
  };
  if (k === 'idle') {
    const did = c.google && c.mails
      ? 'С вашего последнего визита монитор разобрал для вас ' + c.mails + ' ' + plural(c.mails, 'письмо', 'письма', 'писем') + (c.urgent ? ', из них срочных: ' + c.urgent : '') + '. Всё ждёт вас на экране 📧 Почта.'
      : c.google ? 'Монитор продолжает разбирать вашу почту, и всё новое ждёт вас на экране 📧 Почта.'
        : 'Вы ещё не подключили Gmail. Это занимает минуту, и с этого момента монитор разбирает вашу почту, показывает, что срочно, и готовит черновики ответов. Кнопка «🚀 Давайте начнём» ждёт вас вверху экрана.';
    return {
      subject: c.google && c.mails ? 'Монитор разобрал для вас ' + c.mails + ' ' + plural(c.mails, 'письмо', 'письма', 'писем') : 'Ваш монитор ждёт вас',
      text: hello(c.name) + '\n\nВы не заходили в монитор уже два дня.\n' + did + '\n\n'
        + 'До конца пробной недели осталось дней: ' + c.daysLeft + '.\n'
        + 'Ссылка: ' + c.url + '\n' + CODE + SIGN,
    };
  }
  if (k === 'lastDay') return {
    subject: 'Пробная неделя заканчивается ' + (c.endText || 'завтра'),
    text: hello(c.name) + '\n\nВаша пробная неделя в мониторе заканчивается ' + (c.endText || 'завтра') + '.'
      + (c.used ? ' Вы использовали ' + c.used + ' из ' + c.total + ' действий.' : '')
      + (c.google && c.mails ? ' За неделю монитор разобрал для вас писем: ' + c.mails + '.' : '') + '\n\n'
      + 'Чтобы продолжить без перерыва: стартовый пакет, 390 ₪ в месяц, на плитке 📦 Месячный пакет внутри монитора. Всё, что монитор узнал о вас, сохранится.\n'
      + 'Нужен пакет побольше, или есть вопрос? Просто ответьте на это письмо.\n\n'
      + 'Ссылка: ' + c.url + SIGN,
  };
  return null;
}

function waText(k, link) {
  const head = k === 'wa3' ? '💬 Пробная неделя скоро закончится, а WhatsApp всё ещё не подключён. Именно он экономит больше всего времени.'
    : k === 'wa2' ? '💬 WhatsApp всё ещё не подключён.' : '💬 WhatsApp ещё не подключён.';
  return head + '\n'
    + 'Когда он подключён, вы пишете или записываете мне голосовое оттуда, а я отвечаю, напоминаю и сообщаю вам новости там же, не открывая монитор.\n'
    + 'Нажмите на ссылку, отправьте сообщение, которое откроется, и подключение займёт 10 секунд. Ваш номер остаётся только вашим.\n'
    + link;
}

// The lines the quick WhatsApp connect answers with (lib/wa-quick-provision.js).
const WA = {
  connected: '✓ Подключено. Пишите мне сюда любую просьбу, ответ придёт сюда же. Чтобы отключиться, напишите: отключить',
  disconnected: '✓ Я отключил этот номер от монитора. Подключить снова можно в любой момент в 🔌 Подключения.',
  owner: 'Это номер владельца линии, он подключён к его монитору и не передаётся другим.',
  mapped: 'Этот номер уже подключён к другому монитору, поэтому я его не подключал. Лучше обратиться в IT Solution.',
};

// What new-tenant.sh puts in the page title and the welcome line of a Russian signup.
function tenantTexts(name) {
  return { title: 'Монитор: ' + name, welcome: 'Здравствуйте, ' + name + '! Добро пожаловать в монитор. Ваша пробная неделя началась.' };
}

module.exports = { norm, tenantLang, codeMail, readyMail, endText, nudgeMail, waText, WA, tenantTexts };
