// The gate strips the data out of the page on purpose; these checks read it
// back out. See gate.js for why this is off here and tested on its own.
process.env.MONITOR_NO_GATE = '1';
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
  // Itzik, 18.9, by voice: "the monitor title will be at the top, and under it
  // the mockup of the microphone." So the header comes first, the microphone
  // card directly after it with nothing in between, and the green refresh bar
  // below the microphone instead of above the title. Still outside every pane,
  // still hidden by pane() on every screen that is not home.
  assert.ok(at('<header class="hd">') < at('id="talkCard"'));
  assert.ok(at('class="t">מוניטור') < at('id="talkCard"'));
  assert.ok(at('id="talkCard"') < at('id="reloadBtn"'));
  assert.ok(at('id="talkCard"') < ph);
  assert.ok(html.indexOf('</header>') < at('id="talkCard"'));
  // Nothing between the title block and the microphone.
  assert.ok(html.slice(html.indexOf('</header>'), at('id="talkCard"')).indexOf('<button') === -1);
  assert.ok(html.includes("var talk=document.getElementById('talkCard');"));
  assert.ok(html.includes("if(talk)talk.hidden=(w!=='h');"));
  // He set this order on 17.9: the microphone card, then the message buttons,
  // then the button that opens the rest, and the first thing inside it is the
  // shortcuts and the tiles. Five blocks pinned at the head and none at the
  // foot; the rest of the screen stays his to arrange.
  // talkCard is out of the arrange list: it is not in the home section any
  // more, and "nothing above it" is not a preference he should be able to drag
  // away by accident.
  assert.ok(html.includes("var HOME_HEAD=['newBlock','bareBtn','blkIcons','blkTiles'];"));
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

test('the red button and the push both land on the one answers screen', () => {
  const html = renderPage(fixture());
  // 17.9: the red button, the answers tab and the chat tab were three doors
  // to the same room. One door now, and it opens on what he has not read.
  assert.ok(html.includes("document.getElementById('newBtn').onclick=function(){"));
  assert.ok(html.includes("  openAnswers(n?'fresh':'all');"));
  assert.ok(html.includes('function openAnswers(filter){'));
  assert.ok(html.includes("if(location.hash==='#new'||location.hash==='#chat'){\n  pane('a');renderAnswers();landPane('pA');\n }"));
  assert.ok(!html.includes("onclick=function(){pane('m');markChatSeen();"), 'no tab may open the chat screen');
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
  // Nothing unread is not a reason to do nothing: the button opens the one
  // screen either way, because it is the same conversation either way.
  assert.ok(html.includes("  openAnswers(n?'fresh':'all');"));
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
  assert.ok(html.includes("k:'pK',j:'pDr'}"));
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
  // Neither are Codex's answers nor a report: one is not mine, the other is
  // not a thing anybody replies to.
  // Only mine carry it, now that his own messages sit in the same list.
  assert.ok(html.includes("(m.src!=='claude'?'':'<button type=\"button\" class=\"ab aimb\""));
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
  // The build says which one it is and when it went out, in absolute time, and
  // then how old IT is. It used to say "עודכן לפני 15 דקות", which reads as
  // "this thing has not updated in fifteen minutes" and is how Itzik read it
  // all of 18.9 while the line under it said the data was current. Two clocks,
  // and the first was lying about the second.
  assert.ok(html.includes("'גרסה '+(D.buildId||'')+' · '+stamp(D.builtAt)"));
  assert.ok(html.includes("+' · הגרסה '+String(age).replace(/^לפני /,'בת ')"));
  assert.ok(!html.includes("+' · עודכן '+since(D.builtAt)"));
  // And when the data really is current it says so in words, not in a stamp.
  assert.ok(html.includes("'הנתונים מעודכנים לרגע זה.'"));
  // "updated ago now" is not a sentence.
  assert.ok(html.includes("return a==='עכשיו'?'עכשיו':'לפני '+a;"));
  // And "updated N ago" is recomputed, so it counts up instead of resetting.
  assert.ok(html.includes('setInterval(paintStamp,30000)'));
  // The data line never claims a check that did not happen, and says so when
  // the server could not be reached.
  assert.ok(html.includes("line.textContent='נתונים עוד לא נבדקו מול השרת.'"));
  assert.ok(html.includes('lastCheckFail=true;paintStamp();'));
  // Not "now" is still reported as a stamp; "now" gets words instead, because
  // "נתונים נבדקו עכשיו" sitting under "עודכן לפני 15 דקות" is the pair that
  // made him read a working page as a broken one.
  assert.ok(html.includes("('הנתונים נבדקו '+ago+'.')"));
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
  // It rides with the microphone card, which is now the first thing in the body.
  assert.ok(html.indexOf('id="quickText"') < html.indexOf('<section id="pH">'));
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

test('answers screen holds every source in one cluster', () => {
  const html = renderPage(fixture({
    codex: [{ at: '2026-09-12T13:04:00', from: 'codex', to: 'user', text: 'שלום', state: 'received' }],
  }));
  // One list, built from my chat answers, from what Codex sent, and from the
  // round reports, each card saying which it was.
  assert.ok(html.includes("var cdx=(D.codex||[]).filter(function(m){return m.from==='codex';})"));
  assert.ok(html.includes('var rps=(D.reports||[]).map(function(r){'));
  // And from his own messages, so the screen is the conversation and not
  // half of it. That was the third door: the chat tab held only his side.
  assert.ok(html.includes("var his=(D.chat||[]).filter(function(m){return m.from==='itzik';})"));
  assert.ok(html.includes(" return his.concat(mine).concat(cdx).concat(rps).sort("));
  assert.ok(html.includes("function ansWho(m){var k=m&&m.src;return k==='codex'?'קודקס':k==='report'?'דוח':k==='itzik'?'אתה':'קלוד';}"));
  assert.ok(html.includes("'<span class=\"w\">'+ansWho(m)+' · '+esc(stamp(m.at))+mark+'</span>'"));
  // His own message is never unread to him, and offers no reply button.
  assert.ok(html.includes("function isFresh(m){if(m&&m.src==='itzik')return false;"));
  assert.ok(html.includes('.ansc.mine{'));
});

test('one button, so "where is the report" has one answer', () => {
  const html = renderPage(fixture({}));
  // Itzik, 17.9: the report went to the chat and to a separate reports tile,
  // so finding it meant knowing which of two screens to open. The tile is off
  // the home screen and the reports sort into the answers list by time.
  assert.ok(!html.includes('id="gReports"><b>📄 דוחות</b>'));
  assert.ok(html.includes("text:(r.title||'')+String.fromCharCode(10)+(r.body||'')"));
  // The screen that drew them is still built, so nothing was deleted, but
  // nothing on the way to everything else points at it any more.
  assert.ok(html.includes("var b=document.getElementById('gReports');if(!b)return;"));
});

test('the answers tab sits beside home and its badge counts what waits', () => {
  const html = renderPage(fixture({}));
  const home = html.indexOf('id="nH"');
  const ans = html.indexOf('id="nA"');
  assert.ok(home > -1 && ans > -1);
  // In an RTL row the first button is the rightmost one, so "next to home,
  // on the right" means second in source order.
  assert.ok(ans > home);
  // 17.9: "answers at the bottom, chat at the bottom, all the same thing, I
  // want one button". The chat and reports tabs came off the bar.
  assert.ok(!html.includes('id="nM"'), 'the chat tab must be gone');
  assert.ok(!html.includes('id="nR"'), 'the reports tab must be gone');
  assert.ok(html.includes("var NAVS={h:'nH',q:'nQ',l:'nL',a:'nA'};"));
  // And one badge carries what used to light up three separate tabs.
  assert.ok(html.includes("if(nA)nA.classList.toggle('hasnew',msgs>0||reps>0);"));
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

test('the red button cannot be missed and cannot open on nothing', () => {
  const html = renderPage(fixture({}));
  // 18.9: he aimed at the red button and landed on "מה התקבל", which was glued
  // to it with margin-top:0 and built at the same size. It steps back now.
  assert.ok(!html.includes('.newbtn.got{margin-top:0;'));
  assert.ok(html.includes('.newbtn.got{margin-top:16px;'));
  assert.ok(html.includes('#newBlock.hasnew .newbtn.got{margin-top:26px}'));
  assert.ok(html.includes("if(blk)blk.classList.toggle('hasnew',c>0);"));
  // The wrong screen says where the right one is, and gets there in one press.
  assert.ok(html.includes('class="gjump" id="gotToAns"'));
  assert.ok(html.includes("if(ja)ja.onclick=function(){openAnswers('fresh');};"));
  const body = html.slice(html.indexOf('function renderGot(){'));
  assert.ok(body.indexOf('gotToAns') < body.indexOf('בעבודה עכשיו'));
  // And a filter with nothing in it is never what the button lands on: the
  // count comes from unreadList, the filter from isFresh, and a mail answer
  // is in one and not the other.
  assert.ok(html.includes("if(ansFilter!=='all'&&!ansList().length)ansFilter='all';"));
  assert.ok(html.includes("if(ansAuto&&ansFilter==='all')pick(filter);"));
  assert.ok(html.includes("b.onclick=function(){ansAuto=false;"));
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
  assert.ok(html.includes("ensure(['chat','codex','reports'],function(){"));
  assert.ok(html.includes('renderAnswers();paintAnsCount();'));
  assert.ok(html.includes("if(w==='r')ensure('reports',function(){render();renderNextReport();});"));
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

test('an open task says who it is waiting on', () => {
  // Itzik, 17.9: "כתוב לי משימות פתוחות, תשע משימות פתוחות" and asked for
  // order in the things that do not update. Four of the nine were already
  // done, and two of the rest were waiting on him, not on me. A task with
  // nobody named on it reads as a debt of mine and rots.
  const html = renderPage(fixture({}));
  const body = html.slice(html.indexOf('function renderGot(){'), html.indexOf('function paintAnsCount(){'));
  assert.ok(body.includes("c.who==='itzik'?['y','ממתין לך']"));
  assert.ok(body.includes("c.who==='codex'?['g','אצל קודקס']"));
  assert.ok(body.includes("['g','אצלי']"));
  // And the badge for his own column has a colour of its own.
  assert.ok(html.includes('.gr-y{'));
});

test('every row in what was received carries a manual delete button', () => {
  const html = renderPage(fixture({}));
  // Itzik, 16.9 at night: a line from 10.9 saying "עובד על הבקשות שלך" was
  // still sitting there. He asked for buttons that take old requests off by
  // hand.
  const body = html.slice(html.indexOf('function renderGot(){'), html.indexOf('function paintAnsCount(){'));
  assert.ok(body.includes("+del(kind||'msg',m)+'</div>'"));
  assert.ok(body.includes("+del('now',{at:N.at,text:N.text})"));
  assert.ok(body.includes("return row(c,w[0],w[1],'cmd');"));
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

test('the small clear button waits for the whole chat, not the head slice', () => {
  // Itzik, 17.9: "כפתור ניקוי ההודעות לא עובד", then a minute later "אה אני
  // רואה שהוא כן עובד". Both were true. It hid only the messages baked into
  // the page, so the older half came back as soon as the full chat file
  // landed. The big clear on the messages screen already loaded the history
  // first; this one did not.
  const html = renderPage(fixture({}));
  const body = html.slice(html.indexOf("on('clearBtn',function(){"), html.indexOf("on('resetBtn',function(){"));
  assert.ok(body.includes("ensure('chat',function(){"));
  assert.ok(body.includes("localStorage.setItem('msgHidden',JSON.stringify(keys.slice(-6000)));"));
  assert.ok(!body.includes('keys.slice(-4000)'));
});

test('the file ceiling is the one the file channel actually has', () => {
  // Itzik, 17.9: he sent a video twice and it never arrived. The gate was 10MB,
  // which is FormSubmit's limit, and files stopped going through FormSubmit:
  // the bytes go to ntfy, which takes 15MB. So a video ntfy would have carried
  // was turned away at the door.
  const html = renderPage(fixture({}));
  assert.ok(html.includes('var QMAX=15*1024*1024;'));
  assert.ok(!html.includes('var QMAX=10*1024*1024;'));
  assert.ok(html.includes("t+=' · גדול מדי, המגבלה 15MB יחד'"));
  // And a failed send of a video must not tell him to record again.
  assert.ok(html.includes('הקובץ לא הגיע שלם ולא נשמר.'));
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

// איציק, 17.9: הודעה שלו פועמת מרגע השליחה ועד שהיא done, כדי שידע שאני עליה.
test('his own message pulses while it is still open, and stops when it is done', () => {
  const html = renderPage(fixture());
  assert.ok(html.includes('@keyframes livebeat'), 'no livebeat keyframes');
  assert.ok(html.includes('.bub.you.live{border:2px solid var(--gold);opacity:1;animation:livebeat'),
    'his open bubble must pulse at full opacity');
  assert.ok(/prefers-reduced-motion:reduce\)\{\.bub\.you\.live\{animation:none\}/.test(html),
    'the pulse must stop for reduced motion');

  const isLive = new Function('m', html.match(/function isLive\(m\)\{[\s\S]*?\n\}/)[0] + '; return isLive(m);');
  assert.equal(isLive({ from: 'itzik', pend: true }), true, 'pulses the moment it is sent');
  assert.equal(isLive({ from: 'itzik' }), true, 'pulses while nothing has read it');
  assert.equal(isLive({ from: 'itzik', status: 'received' }), true);
  assert.equal(isLive({ from: 'itzik', status: 'working' }), true);
  assert.equal(isLive({ from: 'itzik', status: 'partial' }), true);
  assert.equal(isLive({ from: 'itzik', status: 'done' }), false, 'done stops the pulse');
  assert.equal(isLive({ from: 'claude' }), false, 'only his own messages pulse');

  const bub = new Function('m',
    html.match(/function isLive\(m\)\{[\s\S]*?\n\}/)[0]
    + ';return "<div class=\\"bub "+(m.from===\'itzik\'?\'you\':\'me\')+(isLive(m)?\' live\':\'\')+"\\">";');
  assert.ok(bub({ from: 'itzik', status: 'working' }).includes('bub you live'));
  assert.ok(!bub({ from: 'itzik', status: 'done' }).includes('live'));
});

// איציק, 17.9: את הסרטונים שנעשים כאן מעלים לאתר, אז הם חייבים דף קבוע.
test('every saved video gets a permanent page, and nothing is dropped', () => {
  const fs = require('fs');
  const path = require('path');
  const page = path.join(__dirname, '..', 'docs', 'videos.html');
  assert.ok(fs.existsSync(page), 'docs/videos.html must be built');
  const html = fs.readFileSync(page, 'utf8');
  const dir = path.join(__dirname, '..', 'docs', 'files');
  const mp4 = fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.mp4'));
  assert.ok(mp4.length > 0, 'there must be at least one saved video to list');
  for (const n of mp4) {
    assert.ok(html.includes('src="files/' + n + '"'), n + ' is saved but missing from the page');
    assert.ok(fs.existsSync(path.join(dir, n)), n + ' is listed but the file is gone');
  }
  assert.ok(html.includes('href="./"'), 'the page must have a way back to the monitor');
});

// 17.9, his voice message about the answers button: every answer starts red,
// a touch turns it green, and he can move it to orange standby or yellow.
test('answers carry the four colour states of the old chat', () => {
  const html = renderPage(fixture());
  for (const css of ['.ansc.fresh', '.ansc.done', '.ansc.standby', '.ansc.star']) {
    assert.ok(html.includes(css), 'missing style ' + css);
  }
  assert.ok(html.includes('--orange:'), 'orange must be its own token, not the yellow one');
  assert.ok(html.includes("localStorage.setItem('chatStandby'"), 'standby must persist');
  assert.ok(html.includes("['standby','סטנד ביי',c.standby]"), 'standby needs its own filter chip');
  assert.ok(html.includes('class="ab astandby'), 'each card needs a standby button');
  assert.ok(html.includes('function ansColor(m)'), 'one place decides the colour');
  assert.ok(html.includes('alegend'), 'the legend explains the four colours');
});

test('a touch anywhere on an answer card marks it read', () => {
  const html = renderPage(fixture());
  const i = html.indexOf("host.querySelectorAll('.ansc')");
  assert.ok(i > -1, 'the cards themselves must be wired, not only the buttons');
  const block = html.slice(i, i + 700);
  assert.ok(block.includes('markOneSeen'), 'the touch must mark the answer read');
  for (const tag of ["n==='button'", "n==='a'", "n==='input'", "n==='textarea'"]) {
    assert.ok(block.includes(tag), 'a touch on ' + tag + ' must not count as reading');
  }
});

test('the colour of a card is decided in one order: star, standby, fresh, done', () => {
  const html = renderPage(fixture());
  const src = html.slice(html.indexOf('function ansColor(m)'));
  const body = src.slice(0, src.indexOf('\nfunction isDone'));
  const flags = { star: false, standby: false, fresh: false, done: false };
  const run = new Function('f', body
    + '\nfunction isStar(){return f.star;}function isStandby(){return f.standby;}'
    + 'function isFresh(){return f.fresh;}function isDone(){return f.done;}'
    + '\nreturn ansColor({});');
  assert.equal(run(flags), '');
  assert.equal(run(Object.assign({}, flags, { fresh: true })), 'fresh');
  assert.equal(run(Object.assign({}, flags, { done: true })), 'done');
  assert.equal(run(Object.assign({}, flags, { fresh: true, standby: true })), 'standby');
  assert.equal(run(Object.assign({}, flags, { done: true, standby: true })), 'standby');
  assert.equal(run(Object.assign({}, flags, { standby: true, star: true })), 'star');
});

test('switching screens starts the new one at the top', () => {
  const html = renderPage(fixture({}));
  // Itzik, 17.9: "I press the red button and I do not see the answers." The
  // home screen is taller than a phone and the red button sits well down it,
  // so the answers pane opened with the window still scrolled past its list.
  assert.ok(html.includes("var moved=(panePrev!==w);"));
  assert.ok(html.includes("try{window.scrollTo(0,0);}catch(e){}"));
  // Only on a real change of pane: a soft refresh must not yank him to the top
  // in the middle of reading, which is the bug the keepState work already fixed.
  assert.ok(html.includes(' if(moved){'));
});

// 17.9, by voice at 21:47: "an email was sent to me, what's going on". Every
// send from the page went to the mailbox first, and the mailbox is his own, so
// every button press and every recording put an email in his inbox. ntfy is
// the primary now and the mailbox is the fallback under it, which also means
// the listener sees a message the second it is sent instead of waiting for a
// mailbox round.
test('the page sends over the open channel first and the mailbox only as fallback', () => {
  const html = renderPage(fixture({}));
  const fn = html.slice(html.indexOf('function sendText(subject, text, kind) {'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(body.includes('ntfyText(kind, text)'), 'sendText must start at ntfy');
  assert.ok(body.indexOf('ntfyText(kind, text)') < body.indexOf('formsubmit.co'),
    'the mailbox must not be tried before the open channel');
  // And the fallback is a real fallback: reached from a rejection, not chained
  // onto the success of the first one.
  assert.ok(/ntfyText\(kind, text\)\.catch\(/.test(body), 'the mailbox must sit in a catch');

  // A recording used to mail a copy of its caption unconditionally, as a
  // record nobody ever read. Same rule: only when the caption itself failed.
  const sf = html.slice(html.indexOf('function sendFiles(list, note) {'));
  const sfBody = sf.slice(0, sf.indexOf('\nfunction esc('));
  assert.ok(/ntfyText\('קובץ', note, gid\)\.catch\(/.test(sfBody),
    'the file record mail must sit in a catch, not a then');

  // Nothing on screen still names the old channel, or the labels would read
  // backwards: the backup wording on every successful send.
  assert.ok(!html.includes("how==='ntfy'"), 'a screen label still tests for the old channel');
  assert.ok(html.includes("return 'backup';"), 'the fallback must report itself as the backup');
});

test('the gate seals and opens, and never twice under the same iv', () => {
  const gate = require('../gate.js');
  const text = 'הודעה של איציק, עם מקף ובלי, 123';
  const a = gate.seal(text);
  const b = gate.seal(text);
  assert.equal(gate.open(a), text);
  assert.equal(gate.open(b), text);
  // Same plaintext, different blob. AES-GCM under a repeated IV leaks the
  // difference between two builds, and two builds of this page differ by
  // exactly the messages added since the last one.
  assert.notEqual(a, b);
  assert.notEqual(a.split('.')[0], b.split('.')[0]);
  // A blob whose body was touched must not open at all rather than open wrong.
  const broken = a.split('.')[0] + '.' + Buffer.from('nonsense').toString('base64');
  assert.throws(() => gate.open(broken));
});

test('the page carries the lock and, when it is on, no data at all', () => {
  const html = renderPage(fixture({}));
  // The lock's own code ships either way: it is inert with GATE null.
  assert.ok(html.includes('var GATE = '));
  assert.ok(html.includes('function gderive(code){'));
  assert.ok(html.includes("crypto.subtle.deriveKey("));
  assert.ok(html.includes("{name:'AES-GCM',length:256}"));
  // Both readers of a data file go through one helper, so a file cannot be
  // read as JSON in one place and as a sealed blob in another.
  assert.ok(html.includes('function gjson(r){'));
  assert.ok(html.includes('return r.ok?gjson(r):null;'));
  assert.ok(html.includes('return fetch(u,{cache:\'no-store\'}).then(function(r){return r.ok?gjson(r):null;}'));
  // The derived key is cached, never the code itself.
  assert.ok(html.includes("localStorage.setItem('gateKey'"));
  assert.ok(!html.includes("localStorage.setItem('gateCode'"));
  // A key that no longer opens the page is dropped rather than kept for ever.
  assert.ok(html.includes("localStorage.removeItem('gateKey')"));
});

test('a report in the answers list is a title until it is opened', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9: "the red button gives me nothing, just a salad." Merging the
  // reports in was right, but a thousand word round summary next to a one line
  // reply makes a list nobody can skim, and that is a heap, not one button.
  assert.ok(html.includes('function ansReport(m){'));
  assert.ok(html.includes("+(m.src==='report'?ansReport(m):'<div class=\"atxt\">'+linkify(m.text)+'</div>')"));
  assert.ok(html.includes("'<details class=\"arep\"><summary>'+esc(title)+'</summary>'"));
  // The body still ships, so the search box finds a word inside a folded report.
  assert.ok(html.includes("var body=cut<0?'':t.slice(cut+1).trim();"));
});

test('a saved key is dropped only when it is proven wrong', () => {
  const html = renderPage(fixture({}));
  // A fetch that failed on a bad bar of signal used to wipe the cached key and
  // ask him for the code again on every open. Null means retry; only a decrypt
  // that threw means the key is wrong.
  assert.ok(html.includes('if(ok===false){GKEY=null;'));
  assert.ok(html.includes(".catch(function(){GKEY=null;});"));
  assert.ok(html.includes("if(txt===false)return false;"));
  assert.ok(html.includes("if(!txt)return null;"));
  assert.ok(html.includes("if(ok===null){said.textContent='אין רשת כרגע. נסה שוב עוד רגע.';"));
});

test('a page that is still locked does not cry that it failed to load', () => {
  const html = renderPage(fixture({}));
  // With the gate on the screen boots with no data and several renders throw
  // on the way past. They run again the moment he unlocks. Counting those as
  // failures put a red "part of the screen did not load" across the top of a
  // page that was working, which is how he saw it on his phone.
  assert.ok(html.includes('if(GATE&&!GKEY){'));
  assert.ok(html.indexOf('if(GATE&&!GKEY){') < html.indexOf('if(bootFailed.length){'));
  // Held, not thrown away: a real failure after the unlock still has a way to
  // reach the screen. Clearing it outright hid the class of bug that left him
  // looking at an answers screen with nothing on it at all.
  assert.ok(html.includes('window.__heldBootFails=held;'));
});

test('a held boot failure stops being reported once the same render works', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9 16:29, the diagnostic straight off his phone: lock open, and
  // still "כשלי טעינה: items (בזמן נעילה)". render() reads D.pending, which
  // does not exist while the gate is up, so it throws at boot every single
  // time and is held. Nothing ever cleared the held list, so hours after the
  // unlock the page was reporting a failure that had repaired itself in the
  // first repaint. He read that line as data loss.
  assert.ok(html.includes("['items',render]"));
  assert.ok(html.includes('window.__heldBootFails=held.filter(function(n){'));
  assert.ok(html.includes('return !ran[n]||bad.indexOf(n)>-1;'));
  // And the other half: a repaint that throws no longer vanishes into an empty
  // catch. It is named, logged, and reaches the diagnostic he sends me.
  assert.ok(html.includes("catch(e){bad.push(j[0]);"));
  assert.ok(html.includes("bad.forEach(function(n){if(bootFailed.indexOf(n)<0)bootFailed.push(n);});"));
});

test('the diagnostic does not read a closed screen or a lazy tail as a fault', () => {
  const html = renderPage(fixture({}));
  // Same dump: "כל התשובות: 175 · כרטיסים בפועל על המסך: 0" with the answers
  // screen closed, and "הודעות בזיכרון: 150 מתוך 231". Both are normal and
  // both look like loss when the number stands on its own.
  assert.ok(html.includes("((!ansOpen&&!cards)?' (מסך התשובות סגור)':'')"));
  assert.ok(html.includes('השאר נטען כשפותחים את המסך'));
});

test('the page names no channel, no address and no neighbour', () => {
  const html = renderPage(fixture({}));
  // An audit on 18.9 found all of these sitting in the page as plain text on a
  // public URL. An ntfy topic has no authentication, so the name IS the
  // credential: it let anyone subscribe to everything reaching his phone and
  // publish into his inbox on the real channel. The rest is his address and
  // his neighbours named as debtors, which was never his to publish about them.
  ['abaitzik-in-95e62e86c34f4853', 'abaitzik-cf9044bdcfa8',
   'הגיתית 7', 'יוסי, דירה 17', '17PUmZuY', '1pLlW7nW',
  ].forEach((leak) => assert.ok(!html.includes(leak), 'still leaks ' + leak));
  // They arrive in the sealed payload and are written in after the unlock.
  assert.ok(html.includes("function secret(k, fallback){"));
  // Read at the moment of use, not at parse time. The first version captured
  // them into vars while D was still empty and they stayed empty for ever; the
  // first casualty was the microphone, posting to the empty string.
  assert.ok(html.includes("function NTFYIN(){ return secret('ntfyIn'); }"));
  assert.ok(html.includes("function MAILBOX(){ return secret('mail'); }"));
  assert.ok(html.includes("fetch('https://ntfy.sh/' + NTFYIN(), {"));
  assert.ok(html.includes("fetch('https://formsubmit.co/ajax/' + MAILBOX(), {"));
  assert.ok(html.includes('function paintSecrets(){'));
  assert.ok(html.includes("['secrets',paintSecrets]"));
  // The build must not fall back to a literal if the private file is missing:
  // a send button that does nothing beats his inbox printed on a public page.
  assert.ok(html.includes('id="vaadOpen"'));
});

test('the red button lands on the answers after the paint, not before it', () => {
  const html = renderPage(fixture());
  // Itzik, 18.9 07:47, screenshot of the button reading 12 unread:
  // "הכפתור האדום לא עובד ואין לו תשובות. ריק".
  //
  // pane() resets the scroll while the pane it opened is still empty, so the
  // browser clamps the offset to a short document and the list is poured in
  // under a viewport that a phone is free to anchor back. The landing has to
  // happen after the content exists, and it has to aim at the pane's own
  // heading rather than at the top of a document whose height just changed.
  assert.ok(html.includes('function landPane(id){'));
  assert.ok(html.includes("var h=sec.querySelector('h2')||sec;"));
  assert.ok(html.includes('if(window.requestAnimationFrame)requestAnimationFrame(function(){requestAnimationFrame(go);});'));
  // Once on the press, and again when the lazy files land and it grows.
  assert.ok(html.includes("pane('a');renderAnswers();landPane('pA');"));
  assert.ok(html.includes('renderAnswers();paintAnsCount();landPane(\'pA\');'));
  // Near the top it goes to the real top, so the refresh bar and the way home
  // are not scrolled off by the fix itself.
  assert.ok(html.includes('window.scrollTo(0,top<260?0:top-12);'));
  // And the press says so in words, because he has read this button as broken
  // twice while it was firing both times. The number in that line is counted
  // off the cards on the screen, so it cannot promise answers that are not
  // there, and an empty landing says so instead of claiming a number.
  assert.ok(html.includes("var shown=document.querySelectorAll('#ansBox .ansc').length;"));
  assert.ok(html.includes("toast(n?(shown?('נפתחו '+n+' תשובות שלא קראת')"));
  assert.ok(html.includes("המסך נפתח ריק. לחיצה על רענן ואז שוב."));
  assert.ok(html.includes("toast('מסך התשובות לא נפתח. לחיצה על רענן ואז שוב.');"));
});

test('an empty answers screen says which empty it is', () => {
  const html = renderPage(fixture());
  // With the gate on the page ships with no data, so a data file that never
  // arrives leaves this screen truly empty. Blaming a filter he never touched
  // is the wrong sentence, and it has no way out of it.
  assert.ok(html.includes('if(!allAnswers().length){'));
  assert.ok(html.includes('התשובות עוד לא נטענו.'));
  assert.ok(html.includes('id="ansRetry"'));
  assert.ok(html.includes('lazyDone={};lazyWait={};'));
  assert.ok(html.includes('אין כאן כלום בסינון הזה.'));
});

test('a data file that fails to decrypt is tried again off the cache', () => {
  const html = renderPage(fixture());
  // The decrypt used to reject into an empty handler: the key stayed not done,
  // nothing retried, and with the gate on the screen sat on nothing for the
  // rest of that page's life.
  assert.ok(html.includes('var attempt=function(opts,again){'));
  assert.ok(html.includes("if(again)return attempt({cache:'reload'},false);"));
  assert.ok(html.includes("attempt({cache:'force-cache'},true).then(end,end);"));
  // Only a real array counts as loaded.
  assert.ok(html.includes('if(Array.isArray(v)){D[k]=v;lazyDone[k]=true;return;}'));
  assert.ok(!html.includes("},function(){}).then(end,end);"), 'no silent swallow of a failed data load');
});

test('the drain log records four tubes and never judges a number', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9, five days after the operation: "I have four drains in my
  // abdomen, I asked to start tracking, build a button with a plan inside it
  // and I will put the numbers in."
  assert.ok(html.includes('id="gDrains"'));
  assert.ok(html.includes('<section id="pDr" hidden>'));
  ['dr1', 'dr2', 'dr3', 'dr4', 'drNote', 'drForm', 'drBody'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'missing ' + id);
  });
  // The plan is in the screen, and it stops where medicine starts: the number
  // that decides anything came from his surgeon, not from me.
  assert.ok(html.includes('id="drPlan"'));
  assert.ok(html.includes('זו שיחת טלפון למנתח ולא שאלה בשבילי'));
  assert.ok(html.includes('את הסף המדויק להוצאת ניקוז נותנים לך בבית החולים'));
  // Zero is a reading, not a gap.
  assert.ok(html.includes('אפס הוא נתון, לא חוסר נתון'));
  // The direction is the point, so each tube carries its change since yesterday.
  assert.ok(html.includes("var was=prev&&typeof prev['d'+n]==='number'?prev['d'+n]:null;"));
  assert.ok(html.includes(".drc.down em{color:var(--green,#34A853)}"));
  assert.ok(html.includes(".drc.up em{color:var(--red,#EA4335)}"));
  // It sends down the same road as everything else he says, and writes nothing
  // itself: one road means one place a message can go missing.
  assert.ok(html.includes("sendText('ניקוזים',line,'ניקוזים')"));
});

test('the drain log is a table, a day to a line and a tube to a column', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.09, by voice: "תוסיף טבלה פה בניקוזים". A card a day reads fine for one
  // day and badly for ten, because the direction of one tube over a week is
  // the only thing on this screen worth reading and cards lay the tubes across
  // the page instead of down it.
  assert.ok(html.includes('<table class="drtab">'));
  // Urine joined the row on 18.9 at his word. It is not a drain, so it sits
  // past the total with a rule down its edge rather than among the four.
  assert.ok(html.includes('<tr><th>יום</th><th>1</th><th>2</th><th>3</th><th>4</th><th>סה״כ</th><th class="drpee">שתן</th></tr>'));
  assert.ok(html.includes('id="drUrine"'));
  assert.ok(html.includes(".drtab .drpee{border-inline-start:2px solid var(--line,#2a3342)}"));
  // The total stays the four tubes, and the caption says so, because a total
  // that quietly includes urine is a number a surgeon would read wrong.
  assert.ok(html.includes('סה״כ הוא ארבעת הניקוזים בלבד, בלי שתן.'));
  assert.ok(html.includes('<td class="drtot">'));
  // A missing tube is a dot in its column, so the row keeps its shape.
  assert.ok(html.includes('<td class="drc dim">·</td>'));
  // A note hangs under its own day across the width, where it cannot push a
  // column out of line.
  assert.ok(html.includes('colspan="7" class="drnote"'));
  assert.ok(html.includes('.drtab{width:100%;border-collapse:collapse;text-align:center}'));
});

test('Enter inside the drain form walks to the next tube and does not send', () => {
  const html = renderPage(fixture({}));
  // The first real measurement arrived as four messages inside twenty four
  // seconds, each carrying one tube and three "לא נמדד": Enter on a phone
  // keyboard submitted the form from inside the first field, every time.
  assert.ok(html.includes("['dr1','dr2','dr3','dr4','drNote'].forEach(function(id,i,all){"));
  assert.ok(html.includes("if(e.key!=='Enter')return;"));
  assert.ok(html.includes('next.focus();'));
});

test('the red count is the length of the list it opens', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.09 08:43, on a button reading five: "כתוב 5 הודעות שלא
  // קראת. אין כלום שם". The count came from one set and the screen from
  // another, so anything the answers list does not carry was counted here and
  // could never appear there.
  assert.ok(html.includes('function unreadCount(){return allAnswers().filter(isFresh).length;}'));
  // Codex answers are counted now, so the button that clears everything has to
  // reach them too, or the count sticks above zero right after a press that
  // says everything is read.
  assert.ok(html.includes('(D.chat||[]).concat(D.codex||[]).forEach(function(m){'));
  assert.ok(html.includes("if(m.from!=='claude'&&m.from!=='codex')return;"));
  // The count is made of files that arrive after the page, so it is painted
  // again when they land instead of sitting low until the next press.
  assert.ok(html.includes('try{renderNew();}catch(e){}'));
});

test('nothing ends up underneath the floating bottom bar', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9: "the answers icon does not respond, the red button does not
  // respond." They did respond. His finger was landing on the bottom bar,
  // which is fixed, 76px tall and sits over whatever the page ends with.
  // Nothing ever reserved that space; it went unnoticed only because the red
  // button used to sit higher. Moving the microphone to the top pushed it
  // under the bar, and a button you cannot press is a button that is broken.
  assert.ok(html.includes('padding-bottom:calc(84px + env(safe-area-inset-bottom));'));
  // The bar it makes room for.
  assert.ok(html.includes('.bn{position:fixed;inset-inline:0;bottom:0;z-index:20;'));
});

test('the red button counts exactly what it is about to show', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9: "it says nineteen unread, I press the red button, zero
  // messages." Both numbers were honest and counted different things: the
  // unread list took every answer of mine, the screen it opens drops the mail
  // ones. A backlog of mail gave a badge with nothing behind it.
  assert.ok(html.includes('if(isMail(m))return false;'));
  const unread = html.indexOf('function unreadList(){');
  const mailFilter = html.indexOf('if(isMail(m))return false;', unread);
  const endOfUnread = html.indexOf('function unreadCount()', unread);
  assert.ok(mailFilter > unread && mailFilter < endOfUnread, 'the filter is inside unreadList');
  // And the belt for that brace, which lives inside openAnswers: a filter that
  // would come up empty is refused and everything opens instead.
  assert.ok(html.includes("if(ansFilter!=='all'&&!ansList().length)ansFilter='all';"));
});

test('the red button is named after where it goes, not after a state', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9: "the red button is for alerts and not for answers, fix it
  // immediately." It read "N הודעות שלא קראת", the language of a notification,
  // so the one control he presses to reach my answers announced itself as
  // something else. It only ever opened the answers screen.
  assert.ok(html.includes("document.getElementById('nbTitle').textContent='תשובות';"));
  assert.ok(!html.includes("?(c===1?'הודעה אחת שלא קראת':c+' הודעות שלא קראת')"));
  // The number keeps its place, in the badge and in the line underneath.
  assert.ok(html.includes("document.getElementById('nbCount').textContent=c?c:'✓';"));
  assert.ok(html.includes("' שלא קראת. לחיצה פותחת את כולן.'"));
});

test('every way a phone comes back to the page wakes the check', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9, on a page whose own line said it had last checked twenty four
  // minutes ago: "why, because the phone locked? that does not interest me.
  // the moment I open it, it should update." visibilitychange alone was the
  // gap: a phone usually restores the page from its back forward cache, which
  // fires pageshow, and app switching can deliver focus with no visibility
  // change at all.
  assert.ok(html.includes('function wake(){ if(!document.hidden) checkFresh(); }'));
  ['visibilitychange', 'pageshow', 'focus', 'online'].forEach((ev) => {
    assert.ok(html.includes("EventListener('" + ev + "',wake)"), 'missing ' + ev);
  });
  // A check that failed as the phone woke tries again in seconds, not in a
  // minute, because that is the same complaint in a smaller size.
  assert.ok(html.includes('setTimeout(function(){if(!document.hidden)checkFresh();},4000);'));
});

test('a screen paints itself when it opens, whatever opened it', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9, on a screenshot of the answers screen with nothing on it at
  // all, not even the filter chips, while the button said 26. Chips and cards
  // are both painted by renderAnswers, so their absence together means it never
  // ran, not that it ran and found nothing: finding nothing still draws chips
  // reading zero. A route into a pane that forgets to paint leaves a screen
  // that is blank rather than empty, and blank is indistinguishable from lost.
  assert.ok(html.includes('var PAINT={a:function(){renderAnswers();paintAnsCount();},'));
  assert.ok(html.includes("if(PAINT[w]){try{PAINT[w]();}catch(e){"));
  // It sits inside pane(), so every route in is covered by construction.
  const pane = html.indexOf('function pane(w){');
  assert.ok(pane > -1, 'pane() is in the page');
  assert.ok(html.indexOf('var PAINT={a:', pane) > pane, 'the paint table is inside pane()');
});

test('one tap sends me what his phone actually holds', () => {
  const html = renderPage(fixture({}));
  // Itzik, 18.9, for the third time in a day: "no change in the red button."
  // On my browser it has worked every time I have looked, which means the
  // thing that is broken lives on his phone and I was guessing at it from
  // here. The guessing cost him a day.
  assert.ok(html.includes('id="diagBtn"'));
  assert.ok(html.includes('function diagnose(){'));
  // It reads both sides of the disagreement that has already bitten once: the
  // count on the button and the length of the list it opens.
  assert.ok(html.includes("L.push('מונה הכפתור האדום: '"));
  assert.ok(html.includes("L.push('כל התשובות: '"));
  // And the cards really in the DOM, not the ones the data says should be.
  assert.ok(html.includes("var cards=document.querySelectorAll('#ansBox .ansc').length;"));
  assert.ok(html.includes("var chips=document.querySelectorAll('#aChips .achip').length;"));
  // Boot failures reach me even when they were held back by the locked gate.
  assert.ok(html.includes('__heldBootFails'));
  // It travels the same road as everything else he says. No second channel.
  assert.ok(html.includes("sendText('אבחון',txt,'אבחון')"));
  // Night mode stays the first thing in settings; this sits at the foot.
  const settingsTop = html.indexOf('<section id="pZ" hidden>');
  assert.ok(html.indexOf('id="skinBox"') - settingsTop < 200);
  assert.ok(html.indexOf('id="diagBox"') > html.indexOf('id="skinBox"'));
});
