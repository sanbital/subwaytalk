(function(){
  'use strict';
  var cfg=window.SAMEWAY_CONFIG||{},base=String(cfg.SUPABASE_URL||'').replace(/\/$/,''),anon=String(cfg.SUPABASE_ANON_KEY||'');
  var sessionHash=sessionStorage.getItem('sameway:play-session')||('p_'+Math.random().toString(36).slice(2)+Date.now().toString(36));sessionStorage.setItem('sameway:play-session',sessionHash);
  var questions=[],games=[],mounted=false;
  var STICKERS=['⭐','☕','🚇','☁️','💚','🐱','🌙','🍀'];
  function h(extra){return Object.assign({apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'},extra||{});}
  async function q(path,init){var r=await fetch(base+'/rest/v1/'+path,Object.assign({headers:h()},init||{}));if(!r.ok)throw new Error('rest '+r.status);return r.status===204?null:r.json();}
  function daypart(){var x=new Date().getHours();return x<6?'dawn':x<10?'morning':x<17?'day':x<21?'evening':'night';}
  function ctx(){var l=window.SAMEWAY_LOCATION_STATE||{},m=window.SAMEWAY_MUSIC_STATE||{};return {line:l.line||null,station:l.stationKey||null,weather:m.context&&m.context.weather||null,daypart:daypart(),room:[l.line||'unknown',l.directionLabel||'unknown'].join('|')};}
  function hash(s){var n=2166136261;for(var i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619);}return Math.abs(n);}
  function chooseQuestion(c){var fit=questions.filter(function(x){return (!x.line_key||x.line_key===c.line)&&(!x.weather_tag||x.weather_tag===c.weather)&&(!x.daypart||x.daypart===c.daypart);});if(!fit.length)fit=questions;fit.sort(function(a,b){return (b.priority||0)-(a.priority||0);});var top=fit.slice(0,Math.min(5,fit.length));if(!top.length)return null;var k=new Date().toISOString().slice(0,10)+'|'+c.room+'|'+c.weather+'|'+c.daypart;return top[hash(k)%top.length];}
  function esc(v){return String(v||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c;});}
  async function load(){if(!base||!anon)return;try{questions=await q('subway_context_questions?select=*&enabled=eq.true&order=priority.desc');games=await q('subway_daily_games?select=*&enabled=eq.true&game_date=eq.'+new Date().toISOString().slice(0,10));render();}catch(e){console.warn('[sameway play]',e);}}
  async function vote(question,choice,c){try{await q('subway_question_votes',{method:'POST',headers:h({Prefer:'resolution=ignore-duplicates,return=minimal'}),body:JSON.stringify({question_id:question.id,room_key:c.room,session_hash:sessionHash,choice:choice})});}catch(_){}renderQuestionResults(question,c);}
  async function renderQuestionResults(question,c){try{var rows=await q('subway_question_votes?select=choice&question_id=eq.'+question.id+'&room_key=eq.'+encodeURIComponent(c.room));var counts=[];(question.options||[]).forEach(function(){counts.push(0);});(rows||[]).forEach(function(r){if(counts[r.choice]!=null)counts[r.choice]++;});var total=counts.reduce(function(a,b){return a+b;},0)||1;document.querySelectorAll('[data-sw-qopt]').forEach(function(el){var i=+el.getAttribute('data-sw-qopt');var pct=Math.round((counts[i]||0)/total*100);el.querySelector('span').textContent=pct+'%';});}catch(_){} }
  async function gameEntries(game,c){try{return await q('subway_game_entries?select=entry,created_at&game_id=eq.'+game.id+'&room_key=eq.'+encodeURIComponent(c.room)+'&order=created_at.asc');}catch(_){return [];}}
  async function enterGame(game,c,entry){try{await q('subway_game_entries',{method:'POST',headers:h({Prefer:'return=minimal'}),body:JSON.stringify({game_id:game.id,room_key:c.room,session_hash:sessionHash,entry:entry})});renderGames(c);}catch(_){} }
  async function placeSticker(cell,sticker,c){var today=new Date().toISOString().slice(0,10);var prior=(await q('subway_sticker_board?select=id&board_date=eq.'+today+'&room_key=eq.'+encodeURIComponent(c.room)+'&session_hash=eq.'+encodeURIComponent(sessionHash)))||[];if(prior.length>=3)return alert('이번 탑승에서는 스티커를 3개까지 남길 수 있어요.');try{await q('subway_sticker_board',{method:'POST',headers:h({Prefer:'return=minimal'}),body:JSON.stringify({board_date:today,room_key:c.room,session_hash:sessionHash,cell:cell,sticker:sticker})});renderSticker(c);}catch(_){}}
  async function renderSticker(c){var board=document.getElementById('sameway-sticker-grid');if(!board)return;var today=new Date().toISOString().slice(0,10),rows=[];try{rows=await q('subway_sticker_board?select=cell,sticker&board_date=eq.'+today+'&room_key=eq.'+encodeURIComponent(c.room));}catch(_){}var map={};(rows||[]).forEach(function(r){map[r.cell]=r.sticker;});board.querySelectorAll('button').forEach(function(b){var i=+b.dataset.cell;b.textContent=map[i]||'·';b.disabled=!!map[i];});var n=document.getElementById('sameway-sticker-count');if(n)n.textContent=(rows||[]).length+'개의 흔적';}
  function renderQuestion(){var host=document.getElementById('sameway-context-question');if(!host)return;var c=ctx(),x=chooseQuestion(c);if(!x)return;var opts=Array.isArray(x.options)?x.options:[];host.innerHTML='<div class="sw-play-tag">오늘 같은 방향</div><div class="sw-play-q">'+esc(x.prompt)+'</div><div class="sw-play-options">'+opts.map(function(o,i){return '<button data-sw-qopt="'+i+'">'+esc(o)+' <span>·</span></button>';}).join('')+'</div>';host.querySelectorAll('[data-sw-qopt]').forEach(function(b){b.onclick=function(){vote(x,+b.dataset.swQopt,c);};});renderQuestionResults(x,c);}
  async function renderGames(c){var host=document.getElementById('sameway-games');if(!host)return;host.innerHTML='';var majority=games.find(function(g){return g.game_type==='majority';}),relay=games.find(function(g){return g.game_type==='relay';}),sticker=games.find(function(g){return g.game_type==='sticker';});
    if(majority){var p=majority.payload||{},card=document.createElement('div');card.className='sw-game-card';card.innerHTML='<div class="sw-play-tag">🔮 다수결 맞히기</div><div class="sw-game-title">'+esc(p.question||majority.title)+'</div><div class="sw-game-buttons">'+(p.options||[]).map(function(o,i){return '<button data-m="'+i+'">'+esc(o)+'</button>';}).join('')+'</div><div class="sw-game-meta" id="sameway-majority-meta">참여하면 현재 흐름이 보여요.</div>';host.appendChild(card);card.querySelectorAll('[data-m]').forEach(function(b){b.onclick=function(){enterGame(majority,c,{choice:+b.dataset.m});};});var er=await gameEntries(majority,c),counts=[0,0];er.forEach(function(e){if(e.entry&&counts[e.entry.choice]!=null)counts[e.entry.choice]++;});var meta=card.querySelector('#sameway-majority-meta');if(er.length)meta.textContent='현재 '+er.length+'명 · '+(p.options&&p.options[0]||'A')+' '+Math.round(counts[0]/er.length*100)+'% / '+(p.options&&p.options[1]||'B')+' '+Math.round(counts[1]/er.length*100)+'%';}
    if(relay){var fragments=['그래도 일단 커피를 샀다.','그 순간 안내방송이 들렸다.','옆 사람도 조용히 웃었다.','나는 한 정거장 더 가보기로 했다.'];var r=document.createElement('div');r.className='sw-game-card';var entries=await gameEntries(relay,c);var story=[(relay.payload||{}).seed||'오늘도 지각이었다.'].concat(entries.slice(-3).map(function(e){return e.entry&&e.entry.fragment||'';}));r.innerHTML='<div class="sw-play-tag">✍️ 한 줄 릴레이</div><div class="sw-story">'+story.map(esc).join(' ')+'</div><div class="sw-game-buttons">'+fragments.map(function(f,i){return '<button data-r="'+i+'">'+esc(f)+'</button>';}).join('')+'</div>';host.appendChild(r);r.querySelectorAll('[data-r]').forEach(function(b){b.onclick=function(){enterGame(relay,c,{fragment:fragments[+b.dataset.r]});};});}
    if(sticker){var s=document.createElement('div');s.className='sw-game-card';s.innerHTML='<div class="sw-play-tag">🎨 오늘의 열차 그림판</div><div class="sw-game-meta">자유 그림 대신 승인된 도트 스티커만 남겨요 · 1회 탑승 3개</div><div class="sw-stickers">'+STICKERS.map(function(x){return '<button type="button" data-sticker="'+x+'">'+x+'</button>';}).join('')+'</div><div id="sameway-sticker-grid">'+Array.from({length:64}).map(function(_,i){return '<button data-cell="'+i+'">·</button>';}).join('')+'</div><div class="sw-game-meta" id="sameway-sticker-count"></div>';host.appendChild(s);var selected=STICKERS[0];var palette=s.querySelector('.sw-stickers');
      palette.onclick=function(e){
        var btn=e.target.closest('[data-sticker]');if(!btn)return;
        selected=btn.dataset.sticker;
        palette.querySelectorAll('[data-sticker]').forEach(function(b){b.classList.toggle('on',b===btn);});
      };
      palette.querySelector('[data-sticker]').classList.add('on');s.querySelectorAll('#sameway-sticker-grid button').forEach(function(b){b.onclick=function(){placeSticker(+b.dataset.cell,selected,c);};});renderSticker(c);}
  }
  function render(){var feed=document.querySelector('.feed');if(!feed)return;var legacy=feed.querySelector(':scope > .card');if(legacy)legacy.style.display='none';if(!document.getElementById('sameway-play-hub')){var hub=document.createElement('div');hub.id='sameway-play-hub';hub.innerHTML='<div class="sw-play-card" id="sameway-context-question"></div><div id="sameway-games"></div>';feed.insertBefore(hub,feed.firstChild);}renderQuestion();renderGames(ctx());mounted=true;}
  var style=document.createElement('style');style.textContent='#sameway-play-hub{display:flex;flex-direction:column;gap:12px}.sw-play-card,.sw-game-card{background:#fff;border:1px solid #E1E5EB;border-radius:18px;padding:16px;box-shadow:0 2px 12px rgba(20,30,48,.05)}.sw-play-tag{font-size:10.5px;color:#0A8F77;font-weight:900;margin-bottom:8px}.sw-play-q,.sw-game-title{font-size:16px;font-weight:900;line-height:1.4}.sw-play-options,.sw-game-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.sw-play-options button,.sw-game-buttons button{border:1px solid #E1E5EB;background:#fff;border-radius:12px;padding:11px 8px;font-weight:800}.sw-play-options span{font-size:11px;color:#0A8F77}.sw-game-meta{font-size:11px;color:#727A86;margin-top:8px}.sw-story{font-size:13px;line-height:1.6;background:#F4F6F9;padding:11px;border-radius:12px}.sw-stickers{display:flex;flex-wrap:wrap;gap:4px;margin:10px 0}.sw-stickers button{border:1px solid #E1E5EB;background:#fff;border-radius:9px;padding:6px 8px;font-size:18px;line-height:1;cursor:pointer}.sw-stickers button.on{border-color:#16C7A6;background:#E7FAF5}#sameway-sticker-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:3px}#sameway-sticker-grid button{aspect-ratio:1;border:0;border-radius:5px;background:#F4F6F9;font-size:15px}#sameway-games{display:flex;flex-direction:column;gap:12px}';document.head.appendChild(style);
  // 위치 이벤트는 GPS 틱마다 오므로 그대로 받으면 초당 여러 번 REST 질의를 던지고
  // 사용자가 만지던 UI 를 매번 새로 그려버린다. 컨텍스트 서명이 바뀔 때만 다시 그린다.
  var lastSignature='';
  function contextChanged(){
    var c=ctx();
    var signature=[c.line,c.station,c.weather,c.daypart,c.room].join('|');
    if(signature===lastSignature)return null;
    lastSignature=signature;
    return c;
  }
  window.addEventListener('subway:location',function(){
    if(!mounted)return;
    var c=contextChanged();
    if(c){renderQuestion();renderGames(c);}
  });
  window.addEventListener('subway:music',function(){
    if(!mounted)return;
    if(contextChanged())renderQuestion();
  });
  new MutationObserver(function(){if(!mounted)render();}).observe(document.documentElement,{childList:true,subtree:true});
  load();
  window.SAMEWAY_SOCIAL_PLAY={version:'4.0.0',reload:load};
})();