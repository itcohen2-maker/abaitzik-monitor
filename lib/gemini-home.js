'use strict';
/*
  10.11.2026, Itzik: "turn every monitor to the new form, like the demo, mine included. Do not change the colours
  of my tiles and not the colours of the icons, only the general look."
  The home screen of EVERY monitor: one big greeting, one big write box in the middle, the microphone and the two
  small ways (file, camera) under it, then the AI line, and nothing else shouting. No glowing frames, no tag lines.
  CSS only, and it never touches the tiles (.gt) or the round icons (.ic .c): their colours stay exactly as they are.
  It reads the theme variables, so dark, light and every skin still work.
  To take it off, delete the one line in build.js that requires this file.
*/
const css = `
/* ---- the new form of the home screen (10.11): all monitors ---- */
body .hd{margin:4px 0 6px!important}
body .hd .s{opacity:.7}
body #talkCard{display:flex!important;flex-direction:column;align-items:stretch;gap:0;background:transparent!important;
 border:0!important;box-shadow:none!important;padding:0!important;margin:0 0 14px!important}
body #talkCard::before{content:"במה אפשר לעזור?";display:block;order:0;text-align:center;margin:5vh 4px 22px;
 font:800 32px/1.2 Heebo,sans-serif;background:linear-gradient(100deg,var(--accent),#7c3aed 60%,#db2777);
 -webkit-background-clip:text;background-clip:text;color:transparent}
body #talkCard .tkHead,body #talkCard .vtxt,body #talkCard .firsthint{display:none!important}
body #talkCard .quickwrite{order:1;gap:10px;align-items:flex-end;padding:10px 12px 10px 10px;margin:0;border-radius:30px;
 background:var(--surface)!important;border:1px solid var(--line)!important;box-shadow:0 8px 28px rgba(0,0,0,.14)!important}
body #talkCard .quickwrite textarea{min-height:112px;padding:10px 10px;font-size:17px;background:transparent!important;
 border:0!important;outline:none!important;box-shadow:none!important;resize:none}
body #talkCard .quickwrite button{min-height:46px;border-radius:23px;padding:0 22px;box-shadow:none}
body #talkCard .mic{order:2;align-self:center;margin:16px 0 0;width:60px;height:60px;flex:0 0 60px;box-shadow:none!important}
body #talkCard .ways{order:3;justify-content:center;gap:8px;margin-top:14px}
body #talkCard .way{min-height:40px;padding:0 16px;border-radius:999px;background:transparent!important;
 border:1px solid var(--line)!important;box-shadow:none!important;color:var(--dim)}
body #talkCard .way b{font-size:14px;font-weight:600;color:var(--dim)}
body .fcrow{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;margin:6px 0 10px!important}
body .fcrow .fch{justify-content:center}
body .fcrow .fci{font-size:18px}
body .fcrow b{font:600 14px Heebo,sans-serif;color:var(--dim)}
body .fcrow .fcQuick{background:var(--surface)!important;border:1px solid var(--line)!important;box-shadow:none!important}
body .reloadbig{border:0!important;background:transparent!important;box-shadow:none!important;color:var(--dim)!important;
 margin:0 auto 8px!important;height:36px}
body .morebtn{border-radius:999px!important;box-shadow:none!important}
/* 10.11: the microphone sits inside the write line, on its left side, like Gemini (moved there by the js below) */
body #talkCard .quickwrite .mic{order:3!important;align-self:flex-end!important;margin:0!important;width:46px!important;height:46px!important;
 flex:0 0 46px!important;box-shadow:none!important}
body #talkCard .quickwrite .mic svg{width:22px;height:22px}
`;
// Moves the microphone button into the write form, so it sits in the same line as the text, on the left (RTL: last).
// The button keeps its id and its listeners; it is type="button", so it never submits the form.
const js = `
(function(){
 function micIn(){var m=document.getElementById('micBtn'),f=document.querySelector('#talkCard .quickwrite');if(m&&f&&m.parentNode!==f)f.appendChild(m);}
 if(document.readyState!=='loading')micIn();else document.addEventListener('DOMContentLoaded',micIn);
})();
`;
module.exports = { css, js };
