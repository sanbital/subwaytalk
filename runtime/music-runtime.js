(function(){
  'use strict';
  // 상황(노선·역·날씨·시간대)에 맞는 플레이리스트를 "고르기만" 한다.
  //
  // 이전 버전은 DOM 에 직접 1px 짜리 숨긴 iframe 을 심어 autoplay 를 걸었는데,
  //  - iOS 는 사용자 제스처 없는 자동재생을 막아 실제 기기에서는 소리가 나지 않았고
  //  - 숨긴 임베드 재생은 YouTube 정책상으로도 위험했으며
  //  - MutationObserver 안에서 innerHTML 을 다시 써서 iframe 이 무한 재생성됐다.
  // 재생은 앱 안의 정식 플레이어(YouTube IFrame API, 차단 시 재생 버튼 노출)가 담당하고
  // 이 모듈은 선택 결과만 window.SAMEWAY_MUSIC_STATE 로 알린다.

  var cfg=window.SAMEWAY_CONFIG||{},base=String(cfg.SUPABASE_URL||'').replace(/\/$/,''),anon=String(cfg.SUPABASE_ANON_KEY||'');
  var rules=[],weatherCache={key:'',tag:null,ts:0},lastSignature='';

  function stationKey(v){return String(v||'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();}
  function daypart(){var h=new Date().getHours();return h<6?'dawn':h<10?'morning':h<17?'day':h<21?'evening':'night';}
  function weatherTag(code){
    code=Number(code);
    if([0,1].indexOf(code)>=0)return'clear';
    if([2,3].indexOf(code)>=0)return'cloudy';
    if((code>=51&&code<=67)||(code>=80&&code<=82))return'rain';
    if((code>=71&&code<=77)||(code>=85&&code<=86))return'snow';
    if(code>=95)return'storm';
    if(code===45||code===48)return'fog';
    return null;
  }
  function findStation(state){
    var lines=window.SAMEWAY_LINES||{},target=stationKey(state.stationKey),best=null;
    Object.keys(lines).forEach(function(ln){
      var normalized=window.SAMEWAY_LOCATION_ENGINE&&window.SAMEWAY_LOCATION_ENGINE.lineKey
        ? window.SAMEWAY_LOCATION_ENGINE.lineKey(ln) : ln;
      if(state.line&&normalized!==state.line)return;
      ((lines[ln]&&lines[ln].stations)||[]).forEach(function(s){
        if(stationKey(s.n)===target)best=s;
      });
    });
    return best;
  }
  async function getWeather(state){
    var st=findStation(state);if(!st)return null;
    var k=stationKey(state.stationKey);
    if(weatherCache.key===k&&Date.now()-weatherCache.ts<30*60*1000)return weatherCache.tag;
    try{
      var r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(st.lat)+
        '&longitude='+encodeURIComponent(st.lng)+'&current=weather_code&timezone=Asia%2FSeoul');
      if(!r.ok)throw 0;
      var j=await r.json(),tag=weatherTag(j&&j.current&&j.current.weather_code);
      weatherCache={key:k,tag:tag,ts:Date.now()};
      return tag;
    }catch(_){return null;}
  }
  async function loadRules(){
    if(!base||!anon)return[];
    try{
      var r=await fetch(base+'/rest/v1/subway_music_rules?select=id,title,playlist_url,line_key,station_key,weather_tag,daypart,hashtags,priority&enabled=eq.true',
        {headers:{apikey:anon,Authorization:'Bearer '+anon}});
      if(!r.ok)throw 0;
      rules=await r.json();
      return rules;
    }catch(_){return rules;}
  }
  function score(rule,c){
    var s=Number(rule.priority)||0;
    if(rule.station_key){if(stationKey(rule.station_key)!==stationKey(c.station))return-1e9;s+=500;}
    if(rule.line_key){if(rule.line_key!==c.line)return-1e9;s+=250;}
    if(rule.weather_tag){if(rule.weather_tag!==c.weather)return-1e9;s+=160;}
    if(rule.daypart){if(rule.daypart!==c.daypart)return-1e9;s+=120;}
    s+=Math.min(40,((rule.hashtags||[]).length)*5);
    return s;
  }
  function choose(c){
    var ranked=rules.map(function(r){return {r:r,s:score(r,c)};})
      .filter(function(x){return x.s>-1e8;})
      .sort(function(a,b){return b.s-a.s;}).slice(0,5);
    if(!ranked.length)return null;
    var min=ranked[ranked.length-1].s,total=0;
    ranked.forEach(function(x){x.w=Math.max(1,x.s-min+12);total+=x.w;});
    var key='sameway:music:'+new Date().toISOString().slice(0,10)+'|'+c.line+'|'+c.station+'|'+c.weather+'|'+c.daypart;
    var saved=sessionStorage.getItem(key);
    if(saved){
      var hit=ranked.find(function(x){return String(x.r.id)===saved;});
      if(hit)return hit.r;
    }
    var n=Math.random()*total,pick=ranked[0].r;
    for(var i=0;i<ranked.length;i++){n-=ranked[i].w;if(n<=0){pick=ranked[i].r;break;}}
    sessionStorage.setItem(key,String(pick.id));
    return pick;
  }
  function playlistTitle(c){
    var w={rain:'비 오는',snow:'눈 오는',clear:'맑은',cloudy:'흐린',storm:'비바람 부는',fog:'안개 낀'}[c.weather]||'';
    var d={dawn:'이른 새벽',morning:'출근길',day:'낮의 이동',evening:'퇴근길',night:'늦은 밤'}[c.daypart]||'이동 중';
    var tails=['조금만 더 가요','같은 방향으로 듣는 음악','오늘도 잘 지나가고 있어요','창밖 보면서 듣기 좋은 편성','잠깐 같이 듣고 갈까요'];
    var seed=(String(c.line||'')+String(c.station||'')+new Date().getDate())
      .split('').reduce(function(a,v){return a+v.charCodeAt(0);},0);
    return [w,d,tails[seed%tails.length]].filter(Boolean).join(' · ');
  }

  async function refresh(state){
    if(!state||!state.stationKey||state.confidence==='low')return;
    if(!rules.length)await loadRules();
    var c={line:state.line,station:state.stationKey,weather:await getWeather(state),daypart:daypart()};
    var rule=choose(c);
    if(!rule)return;
    // 같은 편성이면 아무것도 알리지 않는다(플레이어 재시작 방지).
    var signature=[rule.id,c.line,c.station,c.weather,c.daypart].join('|');
    if(signature===lastSignature)return;
    lastSignature=signature;
    window.SAMEWAY_MUSIC_STATE={
      ruleId:rule.id,playlistUrl:rule.playlist_url,playlistTitle:playlistTitle(c),
      context:c,updatedAt:Date.now()
    };
    try{window.dispatchEvent(new CustomEvent('subway:music',{detail:window.SAMEWAY_MUSIC_STATE}));}catch(_){ }
  }

  window.addEventListener('subway:location',function(e){refresh(e.detail);});
  loadRules();

  window.SAMEWAY_MUSIC={version:'5.0.0',reload:loadRules,refresh:refresh,select:choose};
})();
