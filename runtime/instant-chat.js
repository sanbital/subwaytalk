(function(){
  'use strict';
  var cfg=window.SAMEWAY_CONFIG||{},base=String(cfg.SUPABASE_URL||'').replace(/\/$/,''),anon=String(cfg.SUPABASE_ANON_KEY||'');
  var endpoint=base+'/functions/v1/subway-message';

  var sid=sessionStorage.getItem('sameway:ride-session')||('ride_'+Math.random().toString(36).slice(2)+Date.now().toString(36));
  sessionStorage.setItem('sameway:ride-session',sid);
  var nick=sessionStorage.getItem('sameway:ride-nick')||['졸린참새','출근한수달','커피찾는판다','퇴근바라기','달리는고양이'][Math.floor(Math.random()*5)];
  sessionStorage.setItem('sameway:ride-nick',nick);

  var token=sessionStorage.getItem('sameway:ride-token')||'';
  var seen=new Map(),lastIso='1970-01-01T00:00:00Z',me='',timer=null,mounted=false;
  var currentRoom=null;

  // 폴링 주기: 대화가 있으면 촘촘히, 조용하면 점점 느리게. 탭이 숨으면 아예 멈춘다.
  // (이전에는 650ms 고정이라 사용자 1명당 시간당 5,500회 넘게 edge function 을 호출했다.)
  var MIN_INTERVAL=2000, MAX_INTERVAL=15000, interval=MIN_INTERVAL;

  function headers(){return {'Content-Type':'application/json',apikey:anon,Authorization:'Bearer '+anon};}
  async function api(payload){
    var r=await fetch(endpoint,{method:'POST',headers:headers(),body:JSON.stringify(payload)});
    var j={};try{j=await r.json();}catch(_){}
    if(!r.ok)throw Object.assign(new Error(j.category||j.error||('HTTP '+r.status)),{status:r.status,data:j});
    return j;
  }
  async function ensureToken(){
    if(token)return token;
    var j=await api({action:'join',session_id:sid});
    token=j.token||'';
    if(token)sessionStorage.setItem('sameway:ride-token',token);
    return token;
  }

  // 방 키는 "노선 + 진행 방향"으로만 만든다.
  // 이전에는 다음 역 이름을 넣어서 한 정거장마다 방이 갈라졌고, 방이 바뀌어도
  // 이전 방 메시지가 화면에 남고 새 방의 기존 메시지는 영영 불러오지 못했다.
  function roomKey(){
    var l=window.SAMEWAY_LOCATION_STATE||{},a=window.SAMEWAY_ACCESS_STATE||{};
    var line=l.line||a.line;
    var dir=Number(l.direction);
    if(!line||!dir)return null;
    return line+'|'+(dir>0?'up':'down');
  }
  function esc(s){return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c;});}

  function resetRoom(room){
    currentRoom=room;seen.clear();lastIso='1970-01-01T00:00:00Z';interval=MIN_INTERVAL;draw();
  }

  function draw(){
    var box=document.getElementById('sameway-fast-messages');if(!box)return;
    var arr=Array.from(seen.values()).sort(function(a,b){return new Date(a.created_at)-new Date(b.created_at);});
    if(arr.length){
      box.innerHTML=arr.map(function(m){
        var mine=m.pending||(me&&m.author===me);
        return '<div class="sw-fast-msg '+(mine?'me':'')+'">'+
          '<div class="n">'+(mine?'나':esc(m.nick))+(m.is_ai?'<span class="ai">AI</span>':'')+'</div>'+
          '<div class="b">'+esc(m.body)+'</div></div>';
      }).join('');
      box.scrollTop=box.scrollHeight;
      return;
    }
    box.innerHTML=roomKey()
      ? '<div class="sw-fast-empty"><div class="e-i">💬</div>같은 방향 사람에게<br/>가볍게 한마디 남겨보세요.</div>'
      : '<div class="sw-fast-empty"><div class="e-i">🧭</div>이동 방향을 확인하는 중이에요.<br/><span>한두 정거장 지나면 같은 방향 라운지가 열려요.</span></div>';
  }

  async function poll(){
    if(document.hidden)return;
    var room=roomKey();
    if(!room)return;
    if(room!==currentRoom)resetRoom(room);
    try{
      await ensureToken();
      var loc=window.SAMEWAY_LOCATION_STATE||{};
      var j=await api({action:'list',room_key:room,session_id:sid,token:token,after:lastIso,station:loc.stationKey||null});
      if(j.me)me=j.me;
      var fresh=0;
      (j.messages||[]).forEach(function(m){
        if(!seen.has(m.id))fresh++;
        seen.set(m.id,m);
        if(m.created_at>lastIso)lastIso=m.created_at;
      });
      if(fresh){interval=MIN_INTERVAL;draw();}
      else interval=Math.min(MAX_INTERVAL,Math.round(interval*1.5));
    }catch(e){
      if(e&&e.status===401){token='';sessionStorage.removeItem('sameway:ride-token');}
      // 서버가 아직 준비되지 않았으면(함수 미배포·시크릿 미설정) 조용히 죽지 말고 알린다.
      if(e&&(e.status===400||e.status===503))warn('대화 서버를 준비 중이에요. 잠시 후 다시 열립니다.');
      interval=Math.min(MAX_INTERVAL,Math.round(interval*2));
    }
    schedulePoll();
  }
  function schedulePoll(){
    clearTimeout(timer);
    timer=setTimeout(poll,interval);
  }

  async function send(text){
    var body=String(text||'').trim();if(!body)return false;
    var room=roomKey();
    if(!room){warn('아직 이동 방향을 확인하는 중이에요.');return false;}
    var temp='tmp_'+Date.now();
    seen.set(temp,{id:temp,nick:nick,body:body,created_at:new Date().toISOString(),pending:true});draw();
    try{
      await ensureToken();
      var j=await api({action:'send',room_key:room,session_id:sid,token:token,nick:nick,body:body});
      seen.delete(temp);
      if(j.message)seen.set(j.message.id,j.message);
      interval=MIN_INTERVAL;draw();schedulePoll();
      return true;
    }catch(e){
      seen.delete(temp);draw();
      warn(e&&e.data&&e.data.blocked?'보낼 수 없는 표현이 포함되어 있어요.'
        :e&&e.status===429?'조금 천천히 보내주세요.':'메시지를 보내지 못했어요.');
      return false;
    }
  }
  function warn(msg){
    var w=document.getElementById('sameway-fast-warning');
    if(!w)return;
    w.textContent=msg;setTimeout(function(){if(w.textContent===msg)w.textContent='';},2600);
  }

  async function leave(){
    clearTimeout(timer);
    try{ if(token) await api({action:'leave',session_id:sid,token:token}); }catch(_){}
    seen.clear();lastIso='1970-01-01T00:00:00Z';currentRoom=null;me='';draw();
    sessionStorage.removeItem('sameway:ride-session');
    sessionStorage.removeItem('sameway:ride-nick');
    sessionStorage.removeItem('sameway:ride-token');
  }

  function mount(){
    var feed=document.querySelector('.feed'),comp=document.querySelector('.comp');if(!feed||!comp)return;
    var legacyMsgs=feed.querySelector('.msgs');if(legacyMsgs)legacyMsgs.style.display='none';
    var legacyIpt=comp.querySelector('.ipt');if(legacyIpt)legacyIpt.style.display='none';
    var nk=comp.querySelector('.nk');if(nk)nk.style.display='none';
    if(!document.getElementById('sameway-fast-chat')){
      var wrap=document.createElement('div');wrap.id='sameway-fast-chat';
      wrap.innerHTML='<div id="sameway-fast-messages"></div>';
      if(legacyMsgs)legacyMsgs.parentNode.insertBefore(wrap,legacyMsgs);else feed.appendChild(wrap);
    }
    if(!document.getElementById('sameway-fast-composer')){
      var c=document.createElement('div');c.id='sameway-fast-composer';
      c.innerHTML='<div id="sameway-fast-warning"></div><div class="sw-fast-row"><textarea maxlength="300" rows="1" placeholder="가볍게 한마디"></textarea><button type="button">↑</button></div><div class="sw-fast-note">'+esc(nick)+' · 내리면 이 대화와 이름이 사라져요<br/>사람이 적을 땐 <b>AI</b> 표시가 붙은 동행이 함께해요</div>';
      comp.appendChild(c);
      var ta=c.querySelector('textarea'),btn=c.querySelector('button');
      var go=async function(){var v=ta.value;ta.value='';await send(v);};
      btn.onclick=go;
      ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go();}});
    }
    syncComposer();
    if(!mounted){mounted=true;schedulePoll();poll();draw();}
  }

  // 방 상태에 따라 입력창을 열고 닫는다.
  function syncComposer(){
    var c=document.getElementById('sameway-fast-composer');if(!c)return;
    var ready=!!roomKey();
    var ta=c.querySelector('textarea'),btn=c.querySelector('button');
    if(ta){ta.disabled=!ready;ta.placeholder=ready?'가볍게 한마디':'이동 방향 확인 중…';}
    if(btn)btn.disabled=!ready;
    c.classList.toggle('locked',!ready);
  }
  window.addEventListener('subway:location',function(){
    var room=roomKey();
    if(room!==currentRoom){syncComposer();draw();}
  });

  document.addEventListener('click',function(e){
    var t=e.target;if(t&&t.closest&&t.closest('.getoff'))leave();
  },true);
  window.addEventListener('subway:access',function(e){if(e.detail&&e.detail.status==='blocked'&&mounted)leave();});
  document.addEventListener('visibilitychange',function(){
    if(document.hidden)clearTimeout(timer);
    else {interval=MIN_INTERVAL;poll();}
  });

  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  mount();

  var style=document.createElement('style');
  style.textContent='#sameway-fast-chat{display:flex;flex-direction:column;flex:1;min-height:0}#sameway-fast-messages{display:flex;flex-direction:column;justify-content:flex-end;gap:8px;flex:1;min-height:0;overflow-y:auto}.sw-fast-msg{max-width:82%;background:#fff;border:1px solid #E1E5EB;border-radius:15px;padding:10px 12px;box-shadow:0 2px 8px rgba(20,30,48,.05)}.sw-fast-msg.me{align-self:flex-end;background:#E7FAF5;border-color:#CFF3EB}.sw-fast-msg .n{font-size:10.5px;color:#727A86;font-weight:800;margin-bottom:3px}.sw-fast-msg .b{font-size:14px;line-height:1.45}.sw-fast-empty{text-align:center;color:#A4ABB6;font-size:12.5px;line-height:1.7;padding:38px 20px;font-weight:650}.sw-fast-empty .e-i{font-size:30px;margin-bottom:10px;opacity:.75}.sw-fast-empty span{font-size:11.5px;color:#C2C8D0}.sw-fast-msg .n .ai{margin-left:5px;padding:1px 5px;border-radius:5px;background:#EEF1F5;color:#8A93A0;font-size:9px;font-weight:800;vertical-align:1px}#sameway-fast-composer.locked{opacity:.55}#sameway-fast-composer{padding:0 12px 10px}.sw-fast-row{display:flex;gap:8px}.sw-fast-row textarea{flex:1;border:1px solid #E1E5EB;border-radius:14px;padding:11px 12px;resize:none;font:inherit;outline:none}.sw-fast-row button{width:44px;border:0;border-radius:14px;background:#16C7A6;color:#fff;font-size:18px;font-weight:900}.sw-fast-note{font-size:10.5px;color:#A4ABB6;margin-top:5px}#sameway-fast-warning{font-size:11px;color:#E5484D;margin-bottom:4px}';
  document.head.appendChild(style);

  window.SAMEWAY_INSTANT_CHAT={version:'5.0.0',send:send,leave:leave,poll:poll,roomKey:roomKey};
})();
