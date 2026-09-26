// שורת שיתוף לדרייב. navigator.share נקרא ישר מתוך הלחיצה, בלי await לפניו,
// אחרת ספארי ואנדרואיד זורקים את ההרשאה והחלון לא נפתח.
(function(){
 var FOLDER='https://drive.google.com/drive/folders/12HFBqrfb7jmNC2oWCB2ghmV9iqhOFBJP';
 var el=document.getElementById('shareBar');if(!el)return;
 var file=el.getAttribute('data-file'),name=el.getAttribute('data-name');
 var fileUrl='https://drive.google.com/file/d/'+file+'/view';
 el.innerHTML='<a class="sb sb1" href="'+fileUrl+'" target="_blank" rel="noopener">פתיחה בדרייב</a>'
  +'<button type="button" class="sb" data-s="file">שיתוף הקובץ מהדרייב</button>'
  +'<button type="button" class="sb" data-s="folder">שיתוף כל התיקייה</button>'
  +'<a class="sb sbw" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(name+'\n'+fileUrl)+'">וואטסאפ</a>'
  +'<span class="sbmsg" role="status"></span>';
 var msg=el.querySelector('.sbmsg');
 function copy(u){
  function ok(){msg.textContent='הקישור הועתק';setTimeout(function(){msg.textContent=''},2500)}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(ok,function(){prompt('הקישור:',u)})}
  else prompt('הקישור:',u);
 }
 el.addEventListener('click',function(e){
  var k=e.target.getAttribute&&e.target.getAttribute('data-s');if(!k)return;
  var u=k==='file'?fileUrl:FOLDER,t=k==='file'?name:'הקטלוג הבא קיץ 2027, כל הקבצים';
  if(navigator.share){navigator.share({title:t,text:t,url:u}).catch(function(err){if(err&&err.name!=='AbortError')copy(u)})}
  else copy(u);
 });
})();
