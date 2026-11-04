'use strict';
/*
  The designs in settings.

  24.10.2026 there were six colour skins, 26.10.2026 three worlds (7 עיתון, 8 פנקס, 9 רדיו).
  4.11.2026, Itzik: "מה שיש לנו עכשיו בהגדרות, כמו למשל דף עיתון וזה, זה פחות מעניין, אתה
  יכול להוריד את זה, העיצובים שם לא עניינו אותי בכלל." He loves the look the monitor has
  (design 1: the microphone, the icons, the shortcuts at the bottom). So the picker and the
  worlds are gone, and a device that had picked one is put back on design 1 on its next load.

  What stays: window.DZ_META, read by build.js skinApply (the day and night choice, which is
  a different setting and stays).
*/
const DESIGNS = [{ n: '1', name: 'הרגיל', ground: '#f5f6f4', accent: '#0f6e5c' }];

const head = `
<script>
window.DZ_META={};
/* 4.11.2026: no designs any more. A saved choice of an old world is cleared, so every device shows design 1. */
(function(){try{localStorage.removeItem('designSkin');}catch(e){}document.documentElement.removeAttribute('data-skin');})();
</script>
`;

const css = '';
const html = '';
const js = `
function dzBoot(){try{localStorage.removeItem('designSkin');}catch(e){}document.documentElement.removeAttribute('data-skin');}
`;

module.exports = { DESIGNS, head, css, html, js };
