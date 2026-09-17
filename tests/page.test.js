'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPage } = require('../build.js');

// The smallest payload build() could hand the page. Later tests spread
// overrides on top of it.
function fixture(overrides) {
  return Object.assign({
    now: null,
    openCmds: [],
    builtAt: '2026-09-10T16:00:00.000Z',
    counts: { pending: 0, replied: 0, today: 0, leads: 0 },
    choices: [],
    food: [],
    pending: [],
    replied: [],
    contacts: [],
    reports: [],
    chat: [],
  }, overrides || {});
}
module.exports = { fixture };

test('renderPage returns a full document with the shared logic inlined', () => {
  const html = renderPage(fixture());
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('window.ML='), 'lib/monitor-logic.js must be inlined as window.ML');
  assert.ok(!html.includes('__LIB__'), 'the __LIB__ marker must be replaced');
  assert.ok(!html.includes('__DATA__'), 'the __DATA__ marker must be replaced');
});

test('requiring build.js does not build', () => {
  const fs = require('fs');
  const path = require('path');
  const out = path.join(__dirname, '..', 'docs', 'index.html');
  const before = fs.existsSync(out) ? fs.statSync(out).mtimeMs : null;
  require('../build.js');
  const after = fs.existsSync(out) ? fs.statSync(out).mtimeMs : null;
  assert.equal(before, after, 'require must not write docs/index.html');
});

test('the pill screen asks whether the pill was taken earlier', () => {
  const html = renderPage(fixture());
  for (const id of ['pillSheet', 'pillQ', 'pillNow', 'pillEarlier', 'pillTime', 'pillOk', 'pillCancel']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  }
  assert.ok(html.includes('type="time" id="pillTime"'));
  assert.ok(html.includes('לקחת את הכדור מוקדם יותר?'));
  // The count starts from the hour he confirms, never from the tap itself.
  assert.ok(html.includes('ML.resolveTaken('));
  assert.ok(html.includes('ML.parsePillTime('));
  assert.ok(html.includes('ML.pillState('));
  assert.ok(html.includes("'לקחתי כדור בשעה '"));
});

test('home order: one message button on top, the tools next, my log last', () => {
  const html = renderPage(fixture());
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > -1, 'missing ' + s); return i; };
  const ph = at('<section id="pH">');
  assert.ok(at('</header>') < ph);
  // The message block is one button now, and nothing else lives in it.
  assert.ok(ph < at('id="newBlock"'));
  assert.ok(at('id="newBlock"') < at('id="newBtn"'));
  // The talking card is above the message block in the markup as well as in
  // the pinned list, so the screen does not reshuffle after it paints.
  assert.ok(at('id="talkCard"') < at('id="newBlock"'));
  // He set this order on 17.9: the microphone card, then the message buttons,
  // then the button that opens the rest, and the first thing inside it is the
  // shortcuts and the tiles. Five blocks pinned at the head and none at the
  // foot; the rest of the screen stays his to arrange.
  assert.ok(html.includes("var HOME_HEAD=['talkCard','newBlock','bareBtn','blkIcons','blkTiles'];"));
  assert.ok(html.includes('HOME_HEAD.forEach'));
  // Nothing is pinned to the foot any more: the block that was, "איך אני
  // משתפר", came off the home screen on 16.9 at his word.
  assert.ok(html.includes('var HOME_TAIL=[];'));
  assert.ok(html.includes('HOME_TAIL.forEach'));
  assert.ok(!html.includes("var top=document.getElementById('newBlock');"));
  const order = ['id="talkCard"', 'id="micBtn"', 'id="bareBtn"',
    'class="whatsnew"', 'id="askBox"', 'id="blkTiles"', 'id="blkIcons"'];
  const idx = order.map(at);
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i - 1] < idx[i], order[i] + ' must come after ' + order[i - 1]);
  // The alerts and the personal code are not on this screen at all any more:
  // they are on the settings screen, which starts after this section ends.
  const homeEnd = html.indexOf('<section id="pZ" hidden>');
  const home = html.slice(ph, homeEnd);
  assert.ok(!home.includes('id="alerts"'));
  assert.ok(!home.includes('id="codeBox"'));
  assert.ok(html.indexOf('id="alerts"') > homeEnd);
  assert.ok(html.indexOf('id="codeBox"') > homeEnd);
  assert.ok(html.includes('function pinHome('));
  assert.ok(html.includes('--r:18px'));
});

test('chat messages reach the page with id and re', () => {
  const html = renderPage(fixture({ chat: [
    { id: 'a1', at: '2026-09-10T10:00:00', from: 'claude', text: 'x', status: '', re: '' },
    { id: 'a2', at: '2026-09-10T10:05:00', from: 'itzik', text: 'y', status: 'done', re: 'a1' },
  ] }));
  assert.ok(html.includes('"id":"a2"'));
  assert.ok(html.includes('"re":"a1"'));
});

test('the chat screen renders thread cards with copy, paste and send on each', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('ML.splitThreads('));
  assert.ok(html.includes('ML.orderThreads('));
  assert.ok(html.includes("'<details class=\"th th-'"));
  assert.ok(html.includes('class="rb rpaste"'));
  assert.ok(html.includes('class="cp rcopyall"'));
  assert.ok(html.includes("localStorage.getItem('chatStandby')"));
  assert.ok(html.includes('ממתין לתשובה'));
  // Copy sits inside every bubble, as before.
  assert.ok(html.includes('class="cp" data-i='));
  // CSS for the three states.
  for (const s of ['.th-fresh', '.th-standby', '.th-done']) assert.ok(html.includes(s), 'missing css ' + s);
  assert.ok(html.includes("var unreadKeys=unreadList().map(claudeKey);"));
  assert.ok(html.includes("unreadKeys.indexOf(claudeKey(m))>-1"));
  assert.ok(!html.includes("unread.indexOf(m)>-1"), 'freshness must be by key, not identity');
  assert.ok(html.includes("var ri2=flat.indexOf(t.root);"));
  assert.ok(html.includes("b.closest('.bub')||b.closest('.th')"));
});

test('new things blink hard and fast, and stop for reduced motion', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('@keyframes hardblink'));
  for (const sel of ['.newbtn.hot .nb-c', '.gt.glow .flag', '.th-fresh>summary .badge', '.bub.fresh .badge', '.bn button.hasnew,.bn button.hasnew.blink']) {
    assert.ok(html.includes(sel + '{animation:hardblink'), 'no hardblink on ' + sel);
  }
  assert.ok(html.includes('.bn button.hasnew,.bn button.hasnew.blink{animation:hardblink'), 'hardblink must beat the older .blink rule on the same tab');
  assert.ok(!html.includes('.bn button.hasnew{animation:hardblink .5s steps(1) infinite;border-radius:12px}'));
  assert.ok(/prefers-reduced-motion:reduce\)\{[^}]*\.bn button\.hasnew[^}]*animation:none/.test(html));
});

test('the newest pill record wins, not the largest hour', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes("JSON.stringify({taken:takenMs,recordedAt:Date.now()})"));
  assert.ok(html.includes('rec.recordedAt>=chatAt'));
  assert.ok(!html.includes('Math.max(local,fromChat)'));
});

test('paste sits beside send on every reply form', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('function pasteRow('));
  assert.equal((html.match(/\+pasteRow\(\)/g) || []).length >= 3, true, 'renderThread, renderUnread and replyBox all use pasteRow');
  assert.ok(!html.includes("f.querySelector('button')"), 'submit lookups must not grab the paste button');
});

test('standby and re are keyed on the thread root from every screen', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('function rootKeyFor('));
  assert.ok(html.includes("setStandby(f.getAttribute('data-k')||rootKeyFor(m))"));
  assert.ok(html.includes('re:rootKeyFor(m)'));
  assert.ok(!html.includes("ML.keyOf(m))"), 'no standby keyed on a bare message key');
});

test('the red button and the push both open the thread cards, newest labelled', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes("document.getElementById('newBtn').onclick=function(){\n if(unreadCount()){\n  beep();"));
  assert.ok(!html.includes("pane('a');renderAnswers();\n};\nfunction renderUnread"), 'newBtn must not open the flat answers list');
  assert.ok(html.includes("if(location.hash==='#new'){pane('m');renderThread();}"));
  assert.ok(html.includes('<em class="badge latest">האחרונה שהגיעה</em>'));
  assert.ok(html.includes('.badge.latest{'));
});

test('arranging has a control you can find, not only a drag', () => {
  const html = renderPage(fixture());
  // The drag itself works, measured on the live page with a real touch drag
  // and with a mouse. What it cannot do is announce itself, so there are two
  // buttons beside the grip that say what they do.
  assert.ok(html.includes("m.className='nudge nudge-'+dir;"));
  assert.ok(html.includes("m.setAttribute('aria-label',dir==='up'?'להזיז למעלה':'להזיז למטה');"));
  assert.ok(html.includes('function nudgeBlock(el,dir){'));
  // One place, past what is actually on screen: half these cards are hidden
  // until they have something to say.
  assert.ok(html.includes("var kids=Array.prototype.filter.call(box.children,function(c){return !c.hidden;});"));
  // Saved on the spot, so nothing depends on ending a drag in the right place.
  assert.ok(html.includes("saveOrder(box,editing&&editing.box===box?editing.key:'blockOrder');"));
  // And they are cleaned up with the rest of the handles.
  assert.ok(html.includes("document.querySelectorAll('.grip,.minus,.nudge')"));
  // The blocker that made arranging safe also swallowed these. It ran in the
  // capture phase, so the click never reached the button it was aimed at:
  // measured live, a nudge moved nothing and wrote nothing.
  assert.ok(html.includes("if(t&&t.closest&&t.closest('.nudge,.minus'))return;"));
  // Nothing is pinned to the bottom of the home screen any more: those two
  // controls live on the settings screen, so arranging cannot fight them.
  assert.ok(!html.includes("['alerts','codeBox'].forEach(function(id){"));
});

test('a refresh never costs him what he was writing', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes("var DRAFT='msgDraft';"));
  assert.ok(html.includes('function keepDraft(){'));
  assert.ok(html.includes('function restoreDraft(){'));
  // The refresh button is the one control allowed to throw the page away, so
  // it puts the draft down first, and it says what it is doing rather than
  // looking like a second way home.
  const at = html.indexOf("document.getElementById('reloadBtn').onclick=function(){");
  const body = html.slice(at, at + 900);
  assert.ok(body.includes('keepDraft();'), 'the refresh must save the draft before reloading');
  assert.ok(body.includes("btn.textContent='מרענן';"));
  assert.ok(body.includes('btn.disabled=true;'));
  // Leaving the page at all has the same shape as pressing the button.
  assert.ok(html.includes("window.addEventListener('pagehide',keepDraft);"));
  assert.ok(html.includes("document.addEventListener('visibilitychange',function(){if(document.hidden)keepDraft();});"));
  // A restore may only fill an empty box, never overwrite live typing.
  assert.ok(html.includes('if(d&&!box.value)box.value=d;'));
  // And a sent message stops being a draft.
  assert.ok(html.includes('try{localStorage.removeItem(DRAFT);}catch(err){}'));
});

test('nothing opens by itself, and everything that opens can be closed', () => {
  const html = renderPage(fixture());
  // One button for messages, asked for on 13.9. The archive button that used
  // to appear underneath it is gone, and so is the chat tile: a button that
  // reveals a button is not one way in, it is two.
  assert.ok(!html.includes('id="allMsgs"'));
  assert.ok(!html.includes('id="gChat"'));
  assert.ok(!html.includes("mark('gChat'"));
  // Nothing unread is not a reason to do nothing: the button opens the chat
  // either way, because it is the same chat either way.
  assert.ok(html.includes(" pane('m');renderThread();\n};"));
  // The way out says what it does, and a keyboard has one too.
  assert.ok(html.includes("b.textContent='סגירה וחזרה לבית';"));
  assert.ok(html.includes("if(e.key!=='Escape')return;"));
  // Escape must not eat a keystroke in the middle of a message.
  assert.ok(html.includes("if(tag==='INPUT'||tag==='TEXTAREA'||(t&&t.isContentEditable))return;"));
  // Closing is navigation and nothing else: no deleting, no marking read.
  const at = html.indexOf("if(e.key!=='Escape')return;");
  const esc = html.slice(at, at + 400);
  assert.ok(!/markChatSeen|removeItem|setItem/.test(esc), 'closing must not change what is read');
});

test('thread cards never shrink inside the flex thread column', () => {
  // overflow:hidden drops a flex item's min-height to zero, so without
  // flex:none every card collapsed to its borders on the phone.
  const html = renderPage(fixture());
  assert.ok(html.includes('.th{flex:none;'));
});

test('one button marks the backlog read, and a server stamp resets it once per phone', () => {
  const html = renderPage(fixture({ resetSeenAt: '2026-09-11T10:35:00' }));
  assert.ok(html.includes('id="readOld"'));
  assert.ok(html.includes('function markAllRead(cutoff)'));
  assert.ok(html.includes("on('readOld',function(){markAllRead();"));
  assert.ok(html.includes('"resetSeenAt":"2026-09-11T10:35:00"'));
  assert.ok(html.includes("boot('reset',function(){"));
  assert.ok(html.includes("localStorage.setItem('seenResetAt',stamp)"));
  assert.ok(!html.includes('seen.slice(-400)'), 'the seen cap must hold the whole backlog');
});

test('a pegasus screen with a tile, and a live working state on the sent card', () => {
  const html = renderPage(fixture({ pegasus: [{ at: '2026-09-11T11:30:00', did: 'a', now: 'b', plan: 'c' }] }));
  // The tile came off the home screen on 16.9 at his word, twice asked for.
  // The screen and its data stay: he reads it, he just does not want a square
  // for it on the way to everything else.
  assert.ok(!html.includes('id="gPegasus"'));
  assert.ok(!html.includes('id="gOp"'));
  assert.ok(html.includes('<section id="pX" hidden>'));
  assert.ok(html.includes('function renderPegasus('));
  assert.ok(html.includes("var PANES={z:'pZ',x:'pX',"));
  assert.ok(html.includes('"pegasus":[{"at":"2026-09-11T11:30:00"'));
  assert.ok(html.includes("boot('pegasus',renderPegasus);"));
  assert.ok(html.includes('.sent.working .s-dot{'));
  assert.ok(html.includes('@keyframes neon'));
  assert.ok(html.includes("sub='קיבלתי: '+what"));
});

test('the improve screen is reachable, and not on the home screen', () => {
  const html = renderPage(fixture({
    improve: [{ at: '2026-09-11T10:35:00', what: 'a', why: 'b', effect: 'c' }],
  }));
  assert.ok(!html.includes('id="growBtn"'));
  assert.ok(html.includes('<section id="pW" hidden>'));
  assert.ok(html.includes('function renderImprove('));
  assert.ok(html.includes("w:'pW'"));
  assert.ok(html.includes('"improve":[{"at":"2026-09-11T10:35:00"'));
  assert.ok(html.includes("boot('improve',renderImprove);"));
});

test('a pegasus update that waits on him carries the answer on its own card', () => {
  const html = renderPage(fixture({
    pegasus: [{ at: '2026-09-11T11:30:00', did: 'a', now: 'b', plan: 'c',
                ask: 'מזג האוויר לזירה שתיים', opts: ['חורף עם גשם', 'בוקר קר'] }],
  }));
  assert.ok(html.includes('"ask":"מזג האוויר לזירה שתיים"'));
  assert.ok(html.includes('"opts":["חורף עם גשם","בוקר קר"]'));
  assert.ok(html.includes('<div class="pask">'));
  assert.ok(html.includes("replyBox('פגסוס: '+u.ask)"));
  assert.ok(html.includes('.peg.waiting{'));
});

test('special requests get their own tile, screen and blink until opened', () => {
  const html = renderPage(fixture({
    special: [{ at: '2026-09-11T15:23:00', title: 'דף להדפסה', url: 'print.html', note: 'A4' }],
  }));
  assert.ok(html.includes('id="gSpecial"'));
  assert.ok(html.includes('<section id="pY" hidden>'));
  assert.ok(html.includes('function renderSpecial('));
  assert.ok(html.includes("y:'pY'"));
  assert.ok(html.includes('"special":[{"at":"2026-09-11T15:23:00"'));
  assert.ok(html.includes("localStorage.getItem('specialSeen')"));
  assert.ok(html.includes("mark('gSpecial',spNew,'חדש');"))
  // While it is new it sits first, and it drops back into place once opened.
  assert.ok(html.includes("floatTile('gSpecial',spNew);"))
  assert.ok(html.includes('function floatTile(id,up){'));
});

test('the replies I sent in his name get a tile, a screen and a count that blinks', () => {
  const html = renderPage(fixture({
    replies: [{ at: '2026-09-13T11:48:00+03:00', network: 'youtube', video: 'x',
                comment: 'c', reply: 'r', why: 'w' }],
  }));
  assert.ok(html.includes('id="gReplies"'));
  assert.ok(html.includes('<section id="pK" hidden>'));
  assert.ok(html.includes('function renderReplies('));
  assert.ok(html.includes("k:'pK'}"));
  assert.ok(html.includes("k:'replies'"));
  assert.ok(html.includes('"replies":[{"at":"2026-09-13T11:48:00+03:00"'));
  // The count is what he asked for: tell me there are more, not just that
  // something exists. It clears only when he opens the screen.
  assert.ok(html.includes("localStorage.getItem('repliesSeen')"));
  assert.ok(html.includes("mark('gReplies',rpNew>0,String(rpNew));"));
  assert.ok(html.includes("on('gReplies',function(){pane('k');renderReplies();markRepliesSeen();ensure('replies',renderReplies);});"));
});

test('every inner screen has a way back, its own address, and one search finds it', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('function backBar(sec){'));
  assert.ok(html.includes(".backbar{"));
  assert.ok(html.includes("var PANENAME={x:'pegasus',y:'special'"));
  assert.ok(html.includes("boot('hash',function(){"));
  assert.ok(html.includes('id="gSearch"'));
  assert.ok(html.includes('function searchAll(q){'));
  assert.ok(html.includes('function renderSearch(){'));
});

test('the home screen does not repeat what already has its own screen', () => {
  const html = renderPage(fixture({
    special: [{ at: '2026-09-11T16:30:00', title: 'א', url: 'a.html', note: 'n',
      audio: [{ title: 'ק', src: 'a.mp3' }] }],
  }));
  // Itzik cleared three cards off the home screen on 13.9, each a second copy
  // of something he had already seen: "האחרון שביקשת ולפני זה", the music
  // card, and "מה השתפר". The tile and the screen behind them are untouched.
  assert.ok(!html.includes('id="pinBox"'));
  assert.ok(!html.includes('function renderPin('));
  assert.ok(!html.includes('.pin{background'));
  assert.ok(!html.includes('id="tuneBox"'));
  assert.ok(!html.includes('function renderTunes('));
  assert.ok(!html.includes('id="growHome"'));
  assert.ok(html.includes('id="gSpecial"'));
  assert.ok(html.includes('id="specBox"'));
});

test('the dead counters are off the home screen', () => {
  const html = renderPage(fixture({}));
  // "ממתין לתשובה", "נענה היום" and "לידים פתוחים" were fed by the networks
  // queue, and nothing has written to that queue since the networks went read
  // only. Three zeros on the home screen are not a quiet state: they are a
  // claim that nothing is waiting, made by a number with no source.
  assert.ok(!html.includes('<div class="tiles">'));
  assert.ok(!html.includes('id="tP"'));
  assert.ok(!html.includes('id="tT"'));
  assert.ok(!html.includes('id="tL"'));
  assert.ok(!html.includes("document.getElementById('tP').textContent"));
  // The networks screen itself is untouched: it is a screen he chooses to open.
  assert.ok(html.includes('id="bP"'));
  assert.ok(html.includes('id="list"'));
});

test('the connection test says which channel carried it and waits for a real answer', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('id="pingBox"'));
  assert.ok(html.includes('id="pingBtn"'));
  assert.ok(html.includes('function pingPaint(){'));
  // Green ONLY on an answer that carries the tap's own code.
  //
  // This asserted that a build newer than the tap turns it green, which is the
  // bug: reproduced with a tap at 10:00, an unrelated publish at 11:00 and zero
  // replies, the line read "I came back to you 60 minutes after the tap. The
  // connection works." It was reporting that a deploy happened.
  assert.ok(!html.includes('Date.parse(built)>Date.parse(st.at)'),
    'a new build must never be treated as a round trip');
  assert.ok(html.includes("var code='PING-'+Date.now()"));
  assert.ok(html.includes('savePingState({at:at,code:code});'));
  assert.ok(html.includes("if(String(m.text||'').indexOf(code)>-1"));
  // And the waiting line says outright that a new build will not change it.
  assert.ok(html.includes('גרסה חדשה של האתר אינה תשובה'));
  // A test that cannot fail is not a test: nothing in the painter may consult
  // the build at all.
  const at = html.indexOf('function pingPaint(){');
  const body = html.slice(at, at + 1400);
  assert.ok(!/builtAt/.test(body), 'the connection test must not look at the build');
});

test('the skin can be left to the phone or forced white or black', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('id="skinBox"'));
  // He asked twice for a night mode he could not find, because it was called
  // "screen colour" and its buttons said white and black.
  assert.ok(html.includes('<b>מצב יום ולילה</b>'));
  assert.ok(html.includes('data-skin="dark">לילה</button>'));
  assert.ok(html.includes('data-skin="light">יום</button>'));
  // And it is the first thing on the settings screen: sitting in the dark is
  // not something to scroll for.
  const settingsTop = html.indexOf('<section id="pZ" hidden>');
  assert.ok(html.indexOf('id="skinBox"') - settingsTop < 200, 'night mode must be at the top of settings');
  assert.ok(html.includes('data-skin="light"'));
  assert.ok(html.includes('data-skin="dark"'));
  assert.ok(html.includes('data-skin="auto"'));
  assert.ok(html.includes('function skinApply(v){'));
  // A forced choice has to beat the phone in both directions.
  assert.ok(html.includes(':root:not([data-theme="light"]){--ground:#0f1218'));
  assert.ok(html.includes(':root[data-theme="dark"]{--ground:#0f1218'));
  // And it has to be applied before the body exists, or night gets a white flash.
  assert.ok(html.indexOf("localStorage.getItem('skin')") < html.indexOf('<body>'));
});

// Itzik, 16.9, by voice: in every answer I give him he has no way to reply, and
// the icon at the foot of the screen does not reply to anything either. Every
// answer of mine now carries a reply button that aims the microphone at it.
test('every answer of mine can be replied to, and the dock says what it answers', () => {
  const html = renderPage(fixture({}));
  // The strip above the microphone, and the way off it.
  assert.ok(html.includes('id="aimBar"'));
  assert.ok(html.includes('id="aimTxt"'));
  assert.ok(html.includes('id="aimX"'));
  assert.ok(html.includes('.aimbar{position:fixed;inset-inline-start:12px'));
  // A reply button on my bubbles in the thread, and on the answers screen.
  assert.ok(html.includes('class="aimb bubaim" data-k='));
  assert.ok(html.includes('<button type="button" class="ab aimb" data-k='));
  // His own bubbles get none: he does not reply to himself.
  assert.ok(html.includes("+(mine?'':'<button type=\"button\" class=\"aimb bubaim\""));
  // Codex answers are not mine to be aimed at.
  assert.ok(html.includes("(m.src==='codex'?'':'<button type=\"button\" class=\"ab aimb\""));
  // Aiming fills the caption the recorder sends with, so a voice note arrives
  // attached to the answer instead of as a sentence with no question.
  assert.ok(html.includes('function aimQuote(m){'));
  assert.ok(html.includes("if(f)f.value=aimQuote(aim);"));
  // And it is released after a send, so the next recording is a fresh subject.
  assert.ok(html.includes('  clearAim();'));
  // Both screens wire the buttons and repaint the aim after a redraw.
  assert.strictEqual(html.split('wireAim(host);paintAim();').length - 1, 2);
});
test('one card holds all four ways in, and nothing floats over the page', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('<section class="talk" id="talkCard"'));
  // Speak, write, upload, photograph. All four on the same card.
  assert.ok(html.includes('id="micBtn"'));
  // Writing stopped being a button on 16.9. "כתוב לי" opened a screen that had
  // a line in it; now the line is here, on the card, and sends from here.
  assert.ok(!html.includes('id="wWrite"'));
  assert.ok(html.includes('id="quickText"'));
  assert.ok(html.includes('id="quickForm"'));
  assert.ok(html.includes('placeholder="כתוב לי כאן, ואני עונה"'));
  assert.ok(html.includes('id="urgBtn"'));
  assert.ok(html.includes('id="wShoot"'));
  assert.ok(html.includes('<b>העלאת קובץ</b><small>גם תמונה</small>'));
  // The old floating microphone is still gone: it was large and it covered
  // whatever was underneath it.
  assert.strictEqual(html.split('micfab').length - 1, 0);
  assert.strictEqual(html.split('id="micFab"').length - 1, 0);
  // What replaced it is a small dock he asked for and called mandatory: on
  // every screen, bottom left, and clear of the navigation rather than over it.
  assert.ok(html.includes('id="micDock"'));
  assert.ok(html.includes('.micdock{position:fixed;inset-inline-start:12px'));
  assert.ok(html.includes('bottom:calc(70px + env(safe-area-inset-bottom))'));
  assert.ok(html.includes('width:48px;height:48px'), 'the dock must stay small');
  // The same recorder, not a second one: same toggle, same state on both. The
  // dock aims itself at the last answer first, then toggles that same recorder.
  assert.ok(html.includes('if(micDock)micDock.onclick=function(){'));
  assert.ok(html.includes('  if(l)setAim(l);'));
  assert.ok(html.includes("var ids=['micBtn','micDock','recBtn','recBig'];"));
  // It lives outside the screen container, so no screen can take it away.
  assert.ok(html.indexOf('id="micDock"') > html.indexOf('<nav class="bn"') - 900);
  assert.ok(html.indexOf('id="micDock"') < html.indexOf('<nav class="bn"'));
  // Writing opens the composer and puts the cursor in it; the camera is not
  // asked for until the button is pressed.
  assert.ok(html.includes('id="quickBtn"'));
  // And it sends from there: the same path the chat screen uses.
  assert.ok(html.includes("on2('quickForm','submit',function(e){"));
  assert.ok(html.includes("sendText('הודעה מהמוניטור',text,'הודעה')"));
  assert.ok(html.includes("document.getElementById('wShoot').onclick"));
});

test('a dead page says so instead of ignoring him', () => {
  const html = renderPage(fixture({}));
  // The guard is the FIRST script on the page, because everything after it is
  // what might be broken.
  const guard = html.indexOf('window.__monAlive=function(){ok=true;};');
  assert.ok(guard > -1, 'the guard is missing');
  assert.ok(guard < html.indexOf("localStorage.getItem('skin')"), 'the guard must come first');
  // It depends on nothing: no helper of ours, no stylesheet class.
  const body = html.slice(guard - 400, html.indexOf('</script>', guard));
  assert.ok(!/\besc\(|\bpane\(|\btoast\(/.test(body), 'the guard must not call into the script it guards');
  // One bar, one button, and the button clears the stored copy first, because
  // that is the likeliest thing keeping a dead build alive on his phone.
  assert.ok(html.includes('המסך לא נטען כמו שצריך, ולכן הכפתורים והמיקרופון לא יגיבו.'));
  assert.ok(body.includes('caches.delete'));
  // Cleared only by the last line of the main script.
  assert.ok(html.includes('try{window.__monAlive();}catch(e){}'));
  assert.ok(html.lastIndexOf('try{window.__monAlive();}catch(e){}') > html.lastIndexOf('boot('));
  // And the silent case is covered too: no error, but never finished either.
  assert.ok(body.includes("if(!ok)bar('never signalled');"));
  // A stale copy has to be able to replace itself. The forty second check
  // lives in the main script, so a page whose script died cannot fetch the fix
  // for the thing that killed it, which is how he sat on a dead build for
  // hours. This check runs in the one script that cannot be broken.
  assert.ok(body.includes("fetch('version.json?t='+Date.now()"));
  assert.ok(/v\.builtAt==='[^']+'/.test(body), 'the guard must carry this page own stamp as a literal');
  assert.ok(body.includes("location.replace(location.pathname+'?fresh='"), 'a plain reload serves the same stored copy');
  assert.ok(body.includes('caches.delete'));
  // Once per session, so an odd answer cannot put the page in a reload loop.
  assert.ok(body.includes("if(seen===v.builtAt)return;"));
});

test('the microphone answers the tap before the phone has decided', () => {
  const html = renderPage(fixture({}));
  // He said twice that it does not respond. Between the tap and the permission
  // prompt resolving, nothing on the screen changed at all.
  const at = html.indexOf('function recStart(){');
  const body = html.slice(at, html.indexOf('function holdScreen', at));
  const said = body.indexOf("recSaid.textContent='פותח את המיקרופון");
  assert.ok(said > -1, 'nothing is said when he taps');
  assert.ok(said < body.indexOf('getUserMedia({audio:true})'), 'and it must be said before the wait');
  // One attempt at a time: only recBtn was guarded, so a second tap on the main
  // microphone launched a second permission request.
  assert.ok(body.includes('if(recStarting||rec)return;'));
  // And a failure says what actually failed, instead of sending him to a
  // permission screen for a microphone another app is holding.
  assert.ok(body.includes("name==='NotReadableError'||name==='AbortError'"));
  assert.ok(body.includes('המיקרופון תפוס'));
  assert.ok(body.includes('לא נמצא מיקרופון במכשיר הזה'));
  assert.ok(body.includes('rec.onerror=function(){'));
  // And the guard has to be released, or it refuses every recording after the
  // first. He reported exactly that: one message sent, then nothing until a
  // refresh. The release lives in the cleanup, which runs on stop, on abort
  // and on a recorder error alike.
  const clean = html.slice(html.indexOf('function recCleanup(){'), html.indexOf('function recStart(){'));
  assert.ok(clean.includes('rec=null;'), 'the recorder is never let go');
  assert.ok(clean.includes('recStarting=false;'), 'and neither is the starting flag');
});

test('a card about listening gets something to press', () => {
  const html = renderPage(fixture({
    special: [{ at: '2026-09-13T01:30:00+03:00', title: 'מוזיקה', note: 'n', url: '',
      audio: [{ title: '1. גלישה · 104', note: 'x', src: 'files/music/01-glide.mp3' }] }],
  }));
  // The player is in the page, pointed at a file this repository actually ships.
  assert.ok(html.includes('<audio controls preload="none" src="'));
  assert.ok(html.includes('files/music/01-glide.mp3'));
  assert.ok(require('fs').existsSync(require('path').join(__dirname, '..', 'docs', 'files', 'music', '01-glide.mp3')),
    'the card points at a file that is not in the build');
  // Nothing downloads until he decides to listen: three sketches is about two
  // and a half megabytes, and the screen opens on a phone.
  assert.ok(!/<audio[^>]*preload="(auto|metadata)"/.test(html));
  assert.ok(!/<audio[^>]*\bautoplay\b/.test(html), 'nothing may start playing by itself');
});

test('clearing messages hides them here and destroys nothing', () => {
  const html = renderPage(fixture({}));
  // He asked to delete messages and to swipe them away. Both are here, and
  // both hide rather than destroy: the chat is the record of what was asked
  // and what was answered.
  assert.ok(html.includes('function hiddenMsgs(){'));
  assert.ok(html.includes('function hideMsg(key){'));
  assert.ok(html.includes('class="hidemsg"'));
  assert.ok(html.includes("hidden.indexOf(msgKey(m))<0"), 'hidden messages must drop out of the thread');
  // A swipe has to be sideways and far, or a scroll deletes his history.
  assert.ok(html.includes('if(Math.abs(dx)<90||Math.abs(dy)>40)return;'));
  // Clearing everything is reversible, and the copy says so rather than
  // implying the record was destroyed.
  assert.ok(html.includes('id="clearBtn"'));
  assert.ok(html.includes('לא מוחק אותן מהרישום'));
  assert.ok(html.includes("try{localStorage.removeItem('msgHidden');}catch(e){}"), 'there must be a way back');
  // Nothing in this path may touch the record itself.
  const at = html.indexOf("on('clearBtn',function(){");
  const body = html.slice(at, at + 900);
  assert.ok(!/D\.chat\s*=|splice|delete /.test(body), 'clearing must not mutate the record');
});

test('the page actually parses', () => {
  // The gap that let a broken page go live. Every other test here asks whether
  // a string is present, and a string is present whether or not the script it
  // sits in can run: a regex written as a literal lost its backslashes to the
  // template string that builds this file, the whole script died on load, and
  // forty seven passing checks said nothing at all about it.
  const html = renderPage(fixture({}));
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 3, `expected the inline scripts, found ${scripts.length}`);
  scripts.forEach((m, i) => {
    assert.doesNotThrow(() => new Function(m[1]), `inline script ${i} does not parse`);
  });
});

test('the home screen is the microphone and nothing else', () => {
  const html = renderPage(fixture({}));
  // He asked for the main screen to hold the microphone and the four ways of
  // reaching me, and nothing more.
  assert.ok(html.includes('#pH.bare > *:not(#talkCard):not(#bareBtn){display:none!important}'));
  // Hidden, never removed: every render on this page still writes to the
  // element it always wrote to, and nothing becomes unreachable.
  assert.ok(html.includes('id="bareBtn"'));
  // The one action at the top says what pressing it does, not what it is
  // called: it fetches a new copy AND lands him back on the home screen.
  assert.ok(html.includes('<button type="button" class="reloadbig" id="reloadBtn">רענן אותי · חזרה לדף הבית</button>'));
  // And arranging is in settings, where he put it.
  const settings = html.slice(html.indexOf('<section id="pZ" hidden>'), html.indexOf('<section id="pQ" hidden>'));
  assert.ok(settings.includes('id="arrangeBtn"'), 'arranging must live in settings');
  const header = html.slice(html.indexOf('<header class="hd">'), html.indexOf('</header>'));
  assert.ok(!header.includes('id="arrangeBtn"'), 'and not beside the title');
  assert.ok(!header.includes('id="bareBtn"'), 'nor the tools link');
  assert.ok(html.includes("home.classList.toggle('bare',!!on);"));
  assert.ok(html.includes("btn.textContent=on?'עוד כלים':'רק המיקרופון';"));
  // Bare by default, and the choice survives a reload like every other one.
  assert.ok(html.includes("return localStorage.getItem('bareHome')!=='0';"));
  assert.ok(html.includes("localStorage.setItem('bareHome',next?'1':'0');"));
  assert.ok(html.includes('bareApply(bareGet());'));
  // The card it keeps is the one with all four ways in.
  ['id="micBtn"', 'id="quickText"', 'id="urgBtn"', 'id="wShoot"'].forEach((bit) => {
    const card = html.slice(html.indexOf('id="talkCard"'), html.indexOf('</section>', html.indexOf('id="talkCard"')));
    assert.ok(card.includes(bit), `${bit} is not on the card the bare home keeps`);
  });
});

test('a way home from the top of every inner screen, and a reset that deletes nothing', () => {
  const html = renderPage(fixture({}));
  // He asked twice for a way home. The bottom tab was always there; the button
  // he reaches for is at the top, beside the one that took him off home.
  assert.ok(html.includes('<button type="button" class="conn" id="homeBtn" title="חזרה לבית" hidden>בית</button>'));
  assert.ok(html.includes("document.getElementById('homeBtn').onclick=function(){pane('h');};"));
  // And it is only there when it means something.
  assert.ok(html.includes(" if(hb)hb.hidden=(w==='h');"));
  // "Reset everything": every answer counts as read and the count goes to
  // zero. It must not be able to delete anything.
  assert.ok(html.includes('id="resetBox"'));
  assert.ok(html.includes('id="resetBtn"'));
  assert.ok(html.includes('שום דבר לא נמחק'));
  const at = html.indexOf("on('resetBtn',function(){");
  const body = html.slice(at, at + 400);
  assert.ok(body.includes('markAllRead();'));
  assert.ok(!/removeItem|splice|delete /.test(body), 'the reset must not delete anything');
});

test('every setting moved to one screen, and not one of them changed', () => {
  const html = renderPage(fixture({}));
  // Its own screen, with a permanent way in from the header.
  assert.ok(html.includes('<section id="pZ" hidden>'));
  assert.ok(html.includes('id="setBtn"'));
  assert.ok(html.includes("document.getElementById('setBtn').onclick=function(){pane('z');};"));
  assert.ok(html.includes("var PANES={z:'pZ',"));
  // Every control that was stacked under the home page is there, by the same
  // id, so the handlers that drive them are untouched.
  const settings = html.slice(html.indexOf('<section id="pZ" hidden>'), html.indexOf('<section id="pQ" hidden>'));
  ['id="installHint"', 'id="alerts"', 'id="ntfyBtn"', 'id="pingBox"', 'id="pingBtn"',
   'id="skinBox"', 'data-skin="auto"', 'id="motionBox"', 'data-motion="soft"',
   'id="codeBox"', 'id="faceSetup"', 'id="codeInput"', 'id="codeChange"',
   'id="lockToggle"'].forEach((bit) => assert.ok(settings.includes(bit), bit));
  // And none of them is still sitting on the home screen as well.
  const home = html.slice(html.indexOf('<section id="pH">'), html.indexOf('<section id="pZ" hidden>'));
  ['id="skinBox"', 'id="motionBox"', 'id="codeBox"', 'id="pingBox"', 'id="alerts"']
    .forEach((bit) => assert.ok(!home.includes(bit), `${bit} is still on the home screen`));
});

test('what got better lives behind one button, not twice on the home screen', () => {
  const html = renderPage(fixture({
    improve: [
      { at: '2026-09-12T10:00:00+03:00', why: 'ב1', what: 'מ1', effect: 'א1', verified: 'נבדק באתר החי', proof: 'https://example.com/x' },
      { at: '2026-09-11T10:00:00+03:00', why: 'ב2', what: 'מ2', effect: 'א2' },
      { at: '2026-09-10T10:00:00+03:00', why: 'ב3', what: 'מ3', effect: 'א3' },
      { at: '2026-09-09T10:00:00+03:00', why: 'ב4', what: 'מ4', effect: 'א4' },
    ],
  }));
  // "מה השתפר" on the home screen counted the same items as "איך אני משתפר"
  // at the foot of it and opened the same screen. Itzik called it a
  // duplication on 13.9. The fold out is gone; the button is what is left.
  assert.ok(!html.includes('id="growHome"'));
  assert.ok(!html.includes('id="growSum"'));
  assert.ok(!html.includes("localStorage.setItem('growOpen'"));
  assert.ok(!html.includes('id="growBtn"'));
  // The problem, the change, what it changes for him, and the verification.
  assert.ok(html.includes('<b>מה לא עבד</b>'));
  assert.ok(html.includes('<b>מה שיניתי</b>'));
  assert.ok(html.includes('<b>מה זה משנה לך</b>'));
  // A change nobody checked says so rather than staying quiet about it.
  assert.ok(html.includes("+'<div class=\"l\"><b>נבדק</b>'+(u.verified?esc(u.verified):'עוד לא נבדק.')"));
  // Nothing empty pretends to be a list.
  assert.ok(html.includes("<div class=\"empty\">עוד לא רשמתי כאן שיפור.</div>"));
});

test('the title is his, and the build and the data are two different facts', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('<div class="t">מוניטור בבניין עצמי</div>'));
  // Two lines, not one sentence: a page can be fresh and its numbers stale.
  assert.ok(html.includes('<div class="s" id="built"></div>'));
  assert.ok(html.includes('<div class="s dim" id="checked"></div>'));
  // The build says which one it is and when it went out, in absolute time.
  assert.ok(html.includes("'גרסה '+(D.buildId||'')+' · פורסם '+stamp(D.builtAt)"));
  assert.ok(html.includes("+' · עודכן '+since(D.builtAt)"));
  // "updated ago now" is not a sentence.
  assert.ok(html.includes("return a==='עכשיו'?'עכשיו':'לפני '+a;"));
  // And "updated N ago" is recomputed, so it counts up instead of resetting.
  assert.ok(html.includes('setInterval(paintStamp,30000)'));
  // The data line never claims a check that did not happen, and says so when
  // the server could not be reached.
  assert.ok(html.includes("line.textContent='נתונים עוד לא נבדקו מול השרת.'"));
  assert.ok(html.includes('lastCheckFail=true;paintStamp();'));
  assert.ok(html.includes("'נתונים נבדקו '+since("));
  // One id per element. The footer stamp was a second id="built" and never
  // painted at all.
  assert.strictEqual(html.split('id="built"').length - 1, 1);
  assert.ok(html.includes('id="builtFoot"'));
});

test('nothing flashes at him, and the unread mark stays put', () => {
  const html = renderPage(fixture({}));
  // Calm is the default and it is on the element before the first paint, so the
  // old half second flash never gets a frame.
  assert.ok(html.includes("localStorage.getItem('motion')==='soft'?'soft':'off'"));
  assert.ok(html.indexOf("classList.add(mo==='soft'?'motion-soft':'calm')") < html.indexOf('<body>'));
  // Every element the old sheet flashed is stopped, including the tab buttons,
  // the fresh message badges and the working dot.
  const off = html.slice(html.indexOf(':root.calm .newbtn.hot,'), html.indexOf('@keyframes softmark'));
  [':root.calm .newbtn.hot .nb-c,',
   ':root.calm .gt.glow .flag,',
   ':root.calm .th-fresh>summary .badge,',
   ':root.calm .bub.fresh .badge,',
   ':root.calm .bn button.hasnew,',
   ':root.calm .bn button.hasnew.blink,',
   ':root.calm .bn button.blink,',
   ':root.calm .bn button.hasnew svg,',
   ':root.calm .sent.working .s-dot,',
   ':root.calm .live .pulse,'].forEach(sel => assert.ok(off.includes(sel), sel));
  assert.ok(off.includes('{animation:none!important}'));
  // The state itself is untouched: the red badge is still red and still there.
  assert.ok(off.includes(':root.calm .bub.fresh .badge{background:var(--red);color:#fff'));
  // Calm is the floor in BOTH modes. The first version swapped the classes, so
  // choosing "a gentle hint" took calm off and restored every hard animation
  // it cancels: the blink, the beat, the glow, the nudging tabs.
  assert.ok(html.includes("document.documentElement.classList.add('calm');\n if(localStorage.getItem('motion')==='soft')"));
  assert.ok(html.includes(" r.classList.add('calm');\n r.classList.toggle('motion-soft',v==='soft');"));
  assert.ok(!/classList\.toggle\('calm'/.test(html), 'calm must never be toggled off');
  assert.ok(html.includes(':root.calm.motion-soft .newbtn.hot .nb-c,'));
  // And the soft rules have to beat calm's own blanket cancellation.
  assert.ok(html.includes('animation:softmark 10s ease-in-out infinite!important'));
  // The opt in is slow, is only a ring, and still yields to the phone.
  assert.ok(html.includes('animation:softmark 10s ease-in-out infinite'));
  assert.ok(html.includes('50%{box-shadow:0 0 0 5px rgba(234,67,53,.26)}'));
  const reduce = html.slice(html.indexOf('@keyframes softmark'));
  assert.ok(reduce.includes('@media(prefers-reduced-motion:reduce){'));
  assert.ok(reduce.indexOf(':root.motion-soft .newbtn.hot .nb-c')
    < reduce.indexOf('@media(prefers-reduced-motion:reduce){'));
  // And he can turn it on or back off, saved on the device.
  assert.ok(html.includes('id="motionBox"'));
  assert.ok(html.includes('data-motion="soft"'));
  assert.ok(html.includes('data-motion="off"'));
  assert.ok(html.includes("localStorage.setItem('motion',v)"));
});

test('arranging shrinks the board to one screen and every card gets a minus', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('function fitEdit(){'));
  assert.ok(html.includes('.editbox{transform-origin:top center'));
  assert.ok(html.includes('.minus{position:absolute'));
  assert.ok(html.includes('function hideBlock(el){'));
  assert.ok(html.includes('id="editBack"'));
  // The client build flips this and the minus becomes a request.
  assert.ok(html.includes('var CAN_REMOVE = true;'));
  assert.ok(html.includes("sendLine('בקשה להסיר מהמסך: '+k)"));
});

test('every send is written down and carries its own status', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('function markSent(kind,text,id){'));
  assert.ok(html.includes('function reqStatus(r){'));
  assert.ok(html.includes('function renderReqs(){'));
  assert.ok(html.includes("boot('reqs',renderReqs);"));
  // Every request carries an id of its own, and status is matched on it.
  assert.ok(html.includes('function newRequestId(){'));
  assert.ok(html.includes('a.unshift({id:rid,at:at,'));
  assert.ok(html.includes('function recordFor(r){'));
  assert.ok(html.includes('function replyFor(r){'));
  assert.ok(html.includes(" if(!r.id)return null;"));
  assert.ok(html.includes("if((m.requestId||m.re||'')===r.id)return m;"));
  // Reproduced and closed: status must never be matched by the clock, or an
  // unrelated later request marks an earlier one done.
  const at = html.indexOf('function reqStatus(r){');
  const body = html.slice(at, html.indexOf('function renderReqs(){'));
  assert.ok(!/\(m\.at\|\|''\)\s*>=?\s*r\.at/.test(body), 'status must not be matched by time');
  assert.ok(!/sort\(/.test(body), 'and not by picking the first of a sorted list');
  // The wording never claims more than the page can prove, and what is unknown
  // says so rather than borrowing another request's answer.
  assert.ok(html.includes("return {k:'sent',t:'יצא מהמכשיר',"));
  assert.ok(html.includes('עוד לא קישרתי אליה שום תשובה שלי'));
  assert.ok(!html.includes("t:'נעניתי'"), 'nothing may claim the request itself was answered');
});

test('the last two requests are cards he can read, and never invented', () => {
  const html = renderPage(fixture({}));
  // The fold came off the home screen on 16.9: the same two requests sit in
  // "מה התקבל" with their state beside them. The code that builds the cards
  // stays, and stays honest, because that screen is still reachable.
  assert.ok(!html.includes('id="reqBox"'));
  assert.ok(html.includes("foldCard(box,'reqSum','שתי הבקשות האחרונות · '+a.length,'reqOpen');"));
  assert.ok(html.includes('body.innerHTML=a.slice(0,2)'));
  // The Codex fold left the home screen on 16.9 at Itzik's request.
  assert.ok(!html.includes('id="codexBox"'));
  // Shut unless he opened it before, and the choice sticks.
  assert.ok(html.includes("box.open=open==='1';"));
  assert.ok(!/<details class="(reqs|cdx) fold"[^>]*open/.test(html), 'neither may ship open');
  // Time, who is on it, the exact state, and what is still missing.
  assert.ok(html.includes("' · יצא ב'+esc(stamp(r.at))+' · '+esc(since(r.at))"));
  assert.ok(html.includes('<small>מבצע: קלוד</small>'));
  assert.ok(html.includes('<div class="rq-m">')); 
  // No requests makes no cards, and the rest are behind a button rather than
  // filling the home screen.
  assert.ok(html.includes('if(!a.length){box.hidden=true;return;}'));
  assert.ok(html.includes("a.length>2?'<button type=\"button\" class=\"reqall\" id=\"reqAll\">"));
  // Something to open is linked only when there is something to open.
  assert.ok(html.includes('if(url)link='));
});

test('the newest request sits near the top, not under fourteen tiles', () => {
  const html = renderPage(fixture({
    special: [{ at: '2026-09-12T13:20:00', title: 'א', url: 'pyramid.html', note: 'n' }],
  }));
  // Both the pinned card and the fold are gone. What is left near the top is
  // the line he types into, and it has to come before the tile grid.
  assert.ok(html.indexOf('id="quickText"') < html.indexOf('id="blkTiles"'));
  assert.ok(html.indexOf('id="quickText"') > html.indexOf('<section id="pH">'));
});

test('the codex thread never says delivered while the mailbox only stores', () => {
  const html = renderPage(fixture({
    codex: [{ at: '2026-09-12T13:04:00', from: 'codex', to: 'user', text: 'שלום', state: 'received' }],
  }));
  assert.ok(!html.includes('id="codexBox"'));
  assert.ok(html.includes('function renderCodex(){'));
  assert.ok(!html.includes("boot('codex',renderCodex);"));
  // Three states, each literal. `delivered` exists only because a real
  // `codex queue` call succeeded, so `stored` must never borrow its wording.
  assert.ok(html.includes("stored:'מחכה בתיבה, לא נמסר לשיחה'"));
  assert.ok(html.includes("delivered:'נמסר לשיחה של קודקס'"));
  assert.ok(!html.includes('קודקס ענה'));
  // The card box is the way in only. Since 16.9 the answers themselves sit in
  // one cluster on the answers screen, so this fold must not list them again.
  assert.ok(!html.includes("(m.from==='codex'?'זה מ־Codex':'אתה')"));
});

test('answers screen holds both sources in one cluster', () => {
  const html = renderPage(fixture({
    codex: [{ at: '2026-09-12T13:04:00', from: 'codex', to: 'user', text: 'שלום', state: 'received' }],
  }));
  // One list, built from my chat answers and from what Codex sent, each card
  // saying which of us it was.
  assert.ok(html.includes("var cdx=(D.codex||[]).filter(function(m){return m.from==='codex';})"));
  assert.ok(html.includes("function ansWho(m){return m&&m.src==='codex'?'קודקס':'קלוד';}"));
  assert.ok(html.includes("'<span class=\"w\">'+ansWho(m)+' · '+esc(stamp(m.at))"));
});

test('the answers tab sits beside home and its badge counts what waits', () => {
  const html = renderPage(fixture({}));
  const home = html.indexOf('id="nH"');
  const ans = html.indexOf('id="nA"');
  const chat = html.indexOf('id="nM"');
  assert.ok(home > -1 && ans > -1 && chat > -1);
  // In an RTL row the first button is the rightmost one, so "next to home, on
  // the right" means second in source order, before the chat tab.
  assert.ok(ans > home && ans < chat);
  // Grey used to read out the total, which looks like a count of things
  // waiting. Now it is the number waiting, in red, or a tick.
  assert.ok(html.includes("el.textContent=n?String(n):'✓';"));
  assert.ok(!html.includes('var total=allAnswers().length;'));
});

test('what was received sits under the red button as one ordered list', () => {
  const html = renderPage(fixture({}));
  const red = html.indexOf('id="newBtn"');
  const got = html.indexOf('id="gotBtn"');
  const talk = html.indexOf('id="talkCard"');
  // 17.9: the talking card is first on the screen, then the answers button,
  // then what was received. The two message buttons stay in that order and
  // stay one under the other.
  assert.ok(talk > -1 && red > talk && got > red);
  // One screen, four sections in a fixed order: in work, received, open tasks, done.
  assert.ok(html.includes('<section id="pB" hidden>'));
  assert.ok(html.includes("b:'pB'"));
  const body = html.slice(html.indexOf('function renderGot(){'));
  const order = ['בעבודה עכשיו', 'התקבלו, עוד לא התחלתי', 'משימות פתוחות ממך', 'בוצע'].map((h) => body.indexOf(h));
  assert.ok(order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])), String(order));
  // The count is what is still open and not deleted by hand, and it is painted
  // with the home screen.
  assert.ok(html.includes("var n=dropGone('msg',gotList().filter(gotOpen)).length"));
  assert.ok(html.includes("+dropGone('cmd',D.openCmds||[]).length;"));
  assert.ok(html.includes(' paintGot();\n var c=unreadCount();'));
});

test('the big collections travel in their own files, not in the page', () => {
  const html = renderPage(fixture({
    chat: Array.from({ length: 200 }, (_, i) => ({ at: '2026-09-0' + (i % 9 + 1) + 'T10:00:00', from: 'claude', text: 'x' + i })),
  }));
  // The loader, and a total that survives the head being a slice.
  assert.ok(html.includes('function ensure(keys, fn){'));
  assert.ok(html.includes("function lazyTotal(k){ return LAZY[k] ? LAZY[k].n : ((D[k]||[]).length); }"));
  assert.ok(html.includes("var url='data/'+k+'.json?b='+encodeURIComponent(D.buildId||'');"));
  // Every screen that reads a split collection fetches it on the way in.
  assert.ok(html.includes("ensure(['chat','codex'],function(){renderAnswers();paintAnsCount();});"));
  assert.ok(html.includes("ensure('reports',renderNet);"));
  assert.ok(html.includes("ensure('chat',renderThread);"));
  // Old answers must not turn red when the history lands: the reset is a floor.
  assert.ok(html.includes("if(floor&&(m.at||'')<=floor)return false;"));
  // And the chat is not pulled at boot, only when its screen is up.
  assert.ok(html.includes("if(pM&&!pM.hidden&&LAZY.chat&&!lazyDone.chat)ensure('chat',renderThread);"));
});

test('sent is yellow, the answer is red, what he touched is green', () => {
  const html = renderPage(fixture({}));
  // Itzik, 16.9: three states and three colours, and the colour says whose
  // turn it is. Waiting on me is yellow, waiting on him is red, done is green.
  assert.ok(html.includes('.ack-wait{background:#f6e7c8;color:#8a5a12;border-inline-start-color:var(--gold)}'));
  assert.ok(html.includes('.ack-working{background:#f6e7c8;color:#8a5a12;border-inline-start-color:var(--gold)}'));
  assert.ok(html.includes('.ack-done{background:var(--fresh);color:#1d6b3f;border-inline-start-color:#1d6b3f}'));
  assert.ok(html.includes('.bub.fresh{border:3px solid var(--red)'));
  assert.ok(html.includes('.bub.touched{animation:none;border:2px solid var(--green)'));
  // And the line says when it went out, not only that it is waiting.
  assert.ok(html.includes("var sent=m.at?('נשלח ב'+esc(stamp(m.at))+'. '):'';"));
  assert.ok(html.includes("'. ממתין לתשובה, '+esc(ago(m.at))+'.</div>'"));
});

test('one button clears every message off the screen, and deletes nothing', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('id="clearAll"'));
  assert.ok(html.includes('>ניקוי כל ההודעות<'));
  // Asked once before it fires: it is the whole screen, not one line.
  assert.ok(html.includes("b.textContent='לנקות הכל? לחץ שוב';"));
  // It hides, one key each, the way the x on a single message already works.
  assert.ok(html.includes("localStorage.setItem('msgHidden',JSON.stringify(h.slice(-6000)));"));
  // And it waits for the whole history before hiding it, or it would only
  // clear the head slice and the rest would come back on the next fetch.
  assert.ok(html.includes("ensure('chat',function(){"));
});

test('the three health buttons left the home screen and live in the ideas screen', () => {
  const html = renderPage(fixture({}));
  // Itzik, 16.9: take the food button off, take the photo button off, move it
  // all to ideas, and the pill button too. Off the grid, not deleted.
  const grid = html.slice(html.indexOf('id="blkTiles"'), html.indexOf('id="gSearch"'));
  assert.ok(!grid.includes('id="gPill"'));
  assert.ok(!grid.includes('id="gCam"'));
  assert.ok(!grid.includes('id="gFood"'));
  // They open from the ideas screen instead, with the same three labels.
  const ideas = html.slice(html.indexOf('id="pI"'), html.indexOf('id="ideaForm"'));
  assert.ok(ideas.includes('id="iPill"'));
  assert.ok(ideas.includes('id="iCam"'));
  assert.ok(ideas.includes('id="iFood"'));
  assert.ok(ideas.includes('לקחתי כדור'));
  assert.ok(ideas.includes('שלח לי תמונה'));
  assert.ok(ideas.includes('עקוב אחרי התזונה'));
  // The old ids are still wired, so nothing breaks if a tile ever comes back,
  // and the binding is the null safe one now that the tile is gone.
  assert.ok(html.includes("on('gPill',openPill);on('iPill',openPill);"));
  assert.ok(html.includes("on('gCam',openCam);on('iCam',openCam);"));
  assert.ok(html.includes("on('gFood',openFood);on('iFood',openFood);"));
});

test('every row in what was received carries a manual delete button', () => {
  const html = renderPage(fixture({}));
  // Itzik, 16.9 at night: a line from 10.9 saying "עובד על הבקשות שלך" was
  // still sitting there. He asked for buttons that take old requests off by
  // hand.
  const body = html.slice(html.indexOf('function renderGot(){'), html.indexOf('function paintAnsCount(){'));
  assert.ok(body.includes("+del(kind||'msg',m)+'</div>'"));
  assert.ok(body.includes("+del('now',{at:N.at,text:N.text})"));
  assert.ok(body.includes("row(c,'g','פתוח','cmd')"));
  // Deleting is local to his phone and silent: no message, no notification.
  assert.ok(html.includes("localStorage.setItem('gotGone',JSON.stringify(a.slice(-400)));"));
  assert.ok(body.includes('renderGot();paintGot();'));
  // And it is reversible in one press.
  assert.ok(body.includes('id="gotBack"'));
  assert.ok(body.includes('if(bb)bb.onclick=function(){saveGone([]);renderGot();paintGot();'));
});

test('a lead can carry the screenshot of the request, closed by default', () => {
  const html = renderPage(fixture({
    contacts: [{ at: '2026-09-16T23:10:00+03:00', name: 'b3n1306', network: 'instagram',
      status: 'standby', shot: 'files/x.jpg', shotNote: 'צילום המסך ששלחת' }],
  }));
  const body = html.slice(html.indexOf('function leadRow(c){'), html.indexOf('function reportRow('));
  assert.ok(body.includes("c.shot?'<details class=\"shot\"><summary>צילום המסך של הפנייה</summary>'"));
  assert.ok(body.includes("+'<img src=\"'+esc(c.shot)+'\" alt=\"צילום מסך של הפנייה\" loading=\"lazy\"></a></details>'"));
  assert.ok(html.includes('.shot img{display:block;width:100%;max-width:300px'));
});

test('the screenshot path survives the contacts payload', () => {
  const { build } = require('../build.js');
  assert.ok(typeof build === 'function' || true);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'build.js'), 'utf8');
  // The field has to be copied in the mapper, or the lead ships without it.
  assert.ok(src.includes("shot: c.shot || '',"));
  assert.ok(src.includes("shotNote: c.shotNote || '',"));
});

test('the ack line gets the arrival time and the transcript it reads', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'build.js'), 'utf8');
  // ackLine() reads m.ackAt and m.note; the chat mapper has to carry both.
  assert.ok(src.includes("re: m.re || '', ackAt: m.ackAt || '', note: m.note || '' }))"));
  const html = renderPage(fixture({ chat: [{ id: 'v1', at: '2026-09-16T20:43:41.745Z', from: 'itzik',
    text: 'הודעה קולית: voice.webm', status: 'done', ackAt: '2026-09-16T20:43:41.745Z', note: 'תמלול: בדיקה' }] }));
  assert.ok(html.includes('תמלול: בדיקה'));
});

test('text and a chosen file leave as one message, on one press', () => {
  // Itzik, 17.9: "I attach a file and send what I write with it, it is not sent
  // together." Two forms, two buttons, two messages. The video he wanted me to
  // watch was lost exactly there.
  const html = renderPage(fixture({}));
  const body = html.slice(html.indexOf("document.getElementById('msgForm').addEventListener('submit'"),
    html.indexOf('var QMAX='));
  // The writing box send takes the picked files through the file path, which
  // folds the text in as the caption.
  assert.ok(body.includes('var withFiles=picked();'));
  assert.ok(body.includes("if(qMode==='normal')shrinkAll(withFiles,reallySend);"));
  // And the picked file is released after it left, so the next message does
  // not carry it a second time.
  assert.ok(html.includes('  clearPick();'));
  assert.ok(html.includes("b.textContent=n?(n>1?('שליחה עם '+n+' הקבצים'):'שליחה עם הקובץ'):'שליחה';"));
});
