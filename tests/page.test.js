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

test('home order: what is unread first, and the utilities off this screen', () => {
  const html = renderPage(fixture());
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > -1, 'missing ' + s); return i; };
  const ph = at('<section id="pH">');
  assert.ok(at('</header>') < ph);
  // The unread button and the archive button are one block, and it is the
  // first thing in the section.
  assert.ok(ph < at('id="newBlock"'));
  assert.ok(at('id="newBlock"') < at('id="newBtn"'));
  assert.ok(at('id="newBtn"') < at('id="allMsgs"'));
  assert.ok(html.includes("var top=document.getElementById('newBlock');"));
  // Then the one place he talks to me, then everything else.
  const order = ['id="newBlock"', 'id="talkCard"', 'id="micBtn"', 'id="reqBox"', 'id="growHome"',
    'class="whatsnew"', 'class="tiles"', 'id="askBox"', 'id="blkTiles"', 'id="blkIcons"'];
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
  assert.ok(body.includes("btn.textContent='טוען מחדש';"));
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
  // With nothing unread the big button no longer throws the whole archive on
  // screen. It reveals the one button that does, which is his to press.
  assert.ok(html.includes('<button type="button" id="allMsgs" class="allmsgs" hidden>כל ההודעות</button>'));
  assert.ok(html.includes(" var all=document.getElementById('allMsgs');\n if(all)all.hidden=!all.hidden;"));
  assert.ok(html.includes("if(allBtn)allBtn.onclick=function(){pane('m');renderThread();};"));
  // And it goes away again the moment the button has real unread messages to
  // open, so there are never two ways in competing on the same screen.
  assert.ok(html.includes(" if(all&&c)all.hidden=true;"));
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
  assert.ok(html.includes('id="gPegasus"'));
  assert.ok(html.includes('<section id="pX" hidden>'));
  assert.ok(html.includes('function renderPegasus('));
  assert.ok(html.includes("var PANES={z:'pZ',x:'pX',"));
  assert.ok(html.includes('"pegasus":[{"at":"2026-09-11T11:30:00"'));
  assert.ok(html.includes("boot('pegasus',renderPegasus);"));
  assert.ok(html.includes('.sent.working .s-dot{'));
  assert.ok(html.includes('@keyframes neon'));
  assert.ok(html.includes("sub='קיבלתי: '+what"));
});

test('the improve screen sits behind a big button under the microphone', () => {
  const html = renderPage(fixture({
    improve: [{ at: '2026-09-11T10:35:00', what: 'a', why: 'b', effect: 'c' }],
  }));
  assert.ok(html.includes('id="growBtn"'));
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
  assert.ok(html.includes("y:'pY'}"));
  assert.ok(html.includes('"special":[{"at":"2026-09-11T15:23:00"'));
  assert.ok(html.includes("localStorage.getItem('specialSeen')"));
  assert.ok(html.includes("mark('gSpecial',spNew,'חדש');"))
  // While it is new it sits first, and it drops back into place once opened.
  assert.ok(html.includes("floatTile('gSpecial',spNew);"))
  assert.ok(html.includes('function floatTile(id,up){'));
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

test('the last things he asked for are pinned on the home screen', () => {
  const html = renderPage(fixture({
    special: [{ at: '2026-09-11T16:30:00', title: 'א', url: 'a.html', note: 'n' }],
  }));
  assert.ok(html.includes('id="pinBox"'));
  assert.ok(html.includes('function renderPin('));
  assert.ok(html.includes("boot('pin',renderPin);"));
  assert.ok(html.includes('.pin{background'));
});

test('the first two tiles count his own waiting messages and my answers today', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('function myPending(){'));
  assert.ok(html.includes('function answeredToday(){'));
  assert.ok(html.includes("document.getElementById('tP').textContent=myPending();"));
  assert.ok(html.includes("document.getElementById('tT').textContent=answeredToday();"));
});

test('the connection test says which channel carried it and waits for a real answer', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('id="pingBox"'));
  assert.ok(html.includes('id="pingBtn"'));
  assert.ok(html.includes('function pingPaint(){'));
  // Green only when a build newer than his tap actually landed.
  assert.ok(html.includes('Date.parse(built)>Date.parse(st.at)'));
});

test('the skin can be left to the phone or forced white or black', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('id="skinBox"'));
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

test('one card holds all four ways in, and nothing floats over the page', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes('<section class="talk" id="talkCard"'));
  // Speak, write, upload, photograph. All four on the same card.
  assert.ok(html.includes('id="micBtn"'));
  assert.ok(html.includes('id="wWrite"'));
  assert.ok(html.includes('id="urgBtn"'));
  assert.ok(html.includes('id="wShoot"'));
  assert.ok(html.includes('<b>העלאת קובץ</b><small>גם תמונה</small>'));
  // One microphone. The second one floated over whatever was underneath it.
  assert.strictEqual(html.split('micfab').length - 1, 0);
  assert.strictEqual(html.split('id="micFab"').length - 1, 0);
  assert.strictEqual(html.split('aria-label="דבר אליי"').length - 1, 1);
  // Writing opens the composer and puts the cursor in it; the camera is not
  // asked for until the button is pressed.
  assert.ok(html.includes("document.getElementById('wWrite').onclick"));
  assert.ok(html.includes('box.focus();box.scrollIntoView'));
  assert.ok(html.includes("document.getElementById('wShoot').onclick"));
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

test('what got better is on the home screen, with whether anyone checked it', () => {
  const html = renderPage(fixture({
    improve: [
      { at: '2026-09-12T10:00:00+03:00', why: 'ב1', what: 'מ1', effect: 'א1', verified: 'נבדק באתר החי', proof: 'https://example.com/x' },
      { at: '2026-09-11T10:00:00+03:00', why: 'ב2', what: 'מ2', effect: 'א2' },
      { at: '2026-09-10T10:00:00+03:00', why: 'ב3', what: 'מ3', effect: 'א3' },
      { at: '2026-09-09T10:00:00+03:00', why: 'ב4', what: 'מ4', effect: 'א4' },
    ],
  }));
  // Shut, and one line tall. He asked three times to be able to close this,
  // which is what putting it on screen open earned: a wall of text about my
  // own work, above everything he came here for.
  assert.ok(html.includes('<details class="grows" id="growHome" hidden>'));
  assert.ok(html.includes('<summary id="growSum">מה השתפר</summary>'));
  assert.ok(!/<details class="grows"[^>]*open/.test(html), 'it must not ship open');
  assert.ok(html.includes("home.open=open==='1';"), 'closed unless he opened it before');
  assert.ok(html.includes("localStorage.setItem('growOpen',home.open?'1':'0');"), 'and the choice sticks');
  assert.ok(html.includes("body.innerHTML=G.slice(0,3).map(growCard)"));
  // The problem, the change, what it changes for him, and the verification.
  assert.ok(html.includes('<b>מה לא עבד</b>'));
  assert.ok(html.includes('<b>מה שיניתי</b>'));
  assert.ok(html.includes('<b>מה זה משנה לך</b>'));
  // A change nobody checked says so rather than staying quiet about it.
  assert.ok(html.includes("+'<div class=\"l\"><b>נבדק</b>'+(u.verified?esc(u.verified):'עוד לא נבדק.')"));
  // The rest are one tap away, not filling the home screen.
  assert.ok(html.includes("G.length>3?'<button type=\"button\" class=\"reqall\" id=\"growAll\">"));
  assert.ok(html.includes("if(all)all.onclick=function(){pane('w');};"));
  // Nothing empty pretends to be a list.
  assert.ok(html.includes('if(!G.length){home.hidden=true;}'));
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
  assert.ok(html.includes('id="reqBox"'));
  assert.ok(html.includes('function markSent(kind,text){'));
  assert.ok(html.includes('function reqStatus(r){'));
  assert.ok(html.includes('function renderReqs(){'));
  assert.ok(html.includes("boot('reqs',renderReqs);"));
  // The wording never claims more than the page can prove. A reply of mine that
  // landed after a request is not proof it was about that request, so it says
  // exactly that and nothing stronger.
  assert.ok(html.includes("return {k:'sent',t:'הגיע לתיבה',missing:'עוד לא סימנתי שקראתי.',reply:null};"));
  assert.ok(html.includes("if(after.length)return {k:'after',t:'יש תשובה אחרי זה',"));
  assert.ok(!html.includes("t:'נעניתי'"), 'nothing may claim the request itself was answered');
});

test('the last two requests are cards he can read, and never invented', () => {
  const html = renderPage(fixture({}));
  assert.ok(html.includes("'<b>שתי הבקשות האחרונות</b>'+a.slice(0,2)"));
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
  // It has to come before the tile grid, or he has to scroll past everything.
  assert.ok(html.indexOf('id="pinBox"') < html.indexOf('id="blkTiles"'));
  assert.ok(html.indexOf('id="reqBox"') < html.indexOf('id="pinBox"'));
});

test('the codex thread never says delivered while the mailbox only stores', () => {
  const html = renderPage(fixture({
    codex: [{ at: '2026-09-12T13:04:00', from: 'codex', to: 'user', text: 'שלום', state: 'received' }],
  }));
  assert.ok(html.includes('id="codexBox"'));
  assert.ok(html.includes('function renderCodex(){'));
  assert.ok(html.includes("boot('codex',renderCodex);"));
  // Three states, each literal. `delivered` exists only because a real
  // `codex queue` call succeeded, so `stored` must never borrow its wording.
  assert.ok(html.includes("stored:'מחכה בתיבה, לא נמסר לשיחה'"));
  assert.ok(html.includes("delivered:'נמסר לשיחה של קודקס'"));
  assert.ok(html.includes('זה מ־Codex'));
  assert.ok(!html.includes('קודקס ענה'));
});
