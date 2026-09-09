'use strict';
// Builds the slide pages for the explainer video. Each slide is one screen of
// the monitor with a Hebrew caption, rendered in the browser so the RTL text
// comes out right, then screenshotted and stitched by ffmpeg.
const fs=require('fs'), http=require('http'), path=require('path');
const slides=[
 {img:'shot1.jpg', t:'המסך הראשי', s:'מה חדש, מה דחוף, וקיצור לכל רשת'},
 {img:'shot5.jpg', t:'מסך לכל רשת', s:'לחיצה על טיקטוק מראה רק את טיקטוק'},
 {img:'shot2.jpg', t:'התור', s:'מי פנה, ממה רשת, ומה כבר נענה'},
 {img:'shot3.jpg', t:'לידים', s:'מאיפה הגיע, ומה הסטטוס שלו'},
 {img:'shot4.jpg', t:'דוחות', s:'סיכום כל סבב עבודה, נשמר אוטומטית'},
];
function b64(f){ return 'data:image/jpeg;base64,'+fs.readFileSync(path.join(__dirname,f)).toString('base64'); }
function page(n){
 const d=slides[n];
 return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;500;800&display=swap">
<style>
html,body{margin:0;height:100%;background:#0b0e14;overflow:hidden}
.w{width:540px;height:960px;display:flex;flex-direction:column;align-items:center;
 justify-content:center;gap:18px;font-family:Heebo,sans-serif;color:#eef1f7;
 background:radial-gradient(120% 60% at 50% 0,#16243c 0,#0b0e14 60%)}
h1{font:800 40px Heebo;margin:0;letter-spacing:-.5px}
p{font:300 20px Heebo;margin:0;color:#9aa5b8;text-align:center;max-width:440px}
img{width:470px;border-radius:22px;border:1px solid #263149;box-shadow:0 20px 50px rgba(0,0,0,.55)}
.n{font:500 14px Heebo;color:#8ab4f8;letter-spacing:.16em}
</style></head><body><div class="w">
<div class="n">${n+1} מתוך ${slides.length}</div>
<h1>${d.t}</h1><p>${d.s}</p>
<img src="${b64(d.img)}" alt=""></div></body></html>`;
}
http.createServer((req,res)=>{
 const m=/^\/(\d+)$/.exec(req.url||'');
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
 res.end(m&&slides[+m[1]]?page(+m[1]):'<h1>ok</h1>');
}).listen(8899,()=>console.log('slides on http://127.0.0.1:8899/0 .. /'+(slides.length-1)));
