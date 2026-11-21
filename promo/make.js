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
.w{width:100vw;height:100vh;display:flex;flex-direction:row-reverse;align-items:center;
 justify-content:center;gap:5vw;font-family:Heebo,sans-serif;color:#eef1f7;
 background:radial-gradient(90% 120% at 80% 0,#16243c 0,#0b0e14 60%)}
.txt{max-width:520px;text-align:right}
h1{font:800 56px Heebo;margin:0 0 14px;letter-spacing:-1px}
p{font:300 26px Heebo;margin:0;color:#9aa5b8;line-height:1.5}
img{height:70vh;max-height:560px;border-radius:20px;border:1px solid #263149;box-shadow:0 24px 60px rgba(0,0,0,.6)}
.n{font:500 15px Heebo;color:#8ab4f8;letter-spacing:.18em;margin-bottom:10px}
</style></head><body><div class="w">
<img src="${b64(d.img)}" alt="">
<div class="txt"><div class="n">${n+1} מתוך ${slides.length}</div>
<h1>${d.t}</h1><p>${d.s}</p></div></div></body></html>`;
}
http.createServer((req,res)=>{
 const m=/^\/(\d+)$/.exec(req.url||'');
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
 res.end(m&&slides[+m[1]]?page(+m[1]):'<h1>ok</h1>');
}).listen(8899,()=>console.log('slides on http://127.0.0.1:8899/0 .. /'+(slides.length-1)));
