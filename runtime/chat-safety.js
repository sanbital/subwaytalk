(function(){
  'use strict';
  var re=/(섹스|성관계|자위|딸딸|좆|자지|보지|야동|강간|씨발|시발|ㅅㅂ|개새끼|병신|ㅂㅅ|지랄|sex|fuck|fucking|dick|cock|pussy|cunt|porn|rape|blowjob|asshole|bitch|性交|做爱|做愛|自慰|阴茎|陰莖|阴道|陰道|强奸|強姦|黄片|黃片|傻逼|妈的|媽的|操你|セックス|オナニー|ちんこ|まんこ|レイプ|死ね|くそ|クソ|バカ|アホ|01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|오픈채팅|telegram|텔레그램|instagram|인스타|몇\s*번째\s*칸|몇\s*번\s*칸|문\s*앞|내\s*옆)/i;
  function norm(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[\s._\-~`'"*+|\\/]+/g,'');}
  function unsafe(v){return re.test(v)||re.test(norm(v));}
  function block(e){var root=e.target&&e.target.closest&&e.target.closest('#sameway-fast-composer');if(!root)return;var ta=root.querySelector('textarea');if(!ta||!ta.value.trim())return;if(!unsafe(ta.value))return;e.preventDefault();e.stopImmediatePropagation();var w=document.getElementById('sameway-fast-warning');if(w){w.textContent='보낼 수 없는 표현이 포함되어 있어요.';setTimeout(function(){w.textContent='';},2600);}}
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#sameway-fast-composer button'))block(e);},true);
  document.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey)block(e);},true);
  window.SAMEWAY_CHAT_SAFETY={version:'4.0.0',unsafe:unsafe};
})();