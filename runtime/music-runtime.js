(function(){
  'use strict';

  var cfg=window.SAMEWAY_CONFIG||{};
  var base=String(cfg.SUPABASE_URL||'').replace(/\/$/,'');
  var anon=String(cfg.SUPABASE_ANON_KEY||'');
  var rules=[];
  var current=null;
  var weatherCache={key:'',tag:null,ts:0};

  function stationKey(v){return String(v||'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();}
  function daypart(){
    var h=new Date().getHours();
    if(h<6)return 'dawn';
    if(h<10)return 'morning';
    if(h<17)return 'day';
    if(h<21)return 'evening';
    return 'night';
  }
  function weatherTag(code){
    code=Number(code);
    if([0,1].indexOf(code)>=0)return 'clear';
    if([2,3].indexOf(code)>=0)return 'cloudy';
    if((code>=51&&code<=67)||(code>=80&&code<=82))return 'rain';
    if((code>=71&&code<=77)||(code>=85&&code<=86))return 'snow';
    if(code>=95)return 'storm';
    if(code===45||code===48)return 'fog';
    return null;
  }
  function findStation(state){
    var lines=window.SAMEWAY_LINES||{},best=null;
    Object.keys(lines).forEach(function(ln){
      var normalized=(window.SAMEWAY_LOCATION_ENGINE&&window.SAMEWAY_LOCATION_ENGINE.lineKey)?window.SAMEWAY_LOCATION_ENGINE.lineKey(ln):ln;
      if(state.line&&normalized!==state.line)return;
      ((lines[ln]&&lines[ln].stations)||[]).forEach(function(s){
        if(stationKey(s.n)===stationKey(state.stationKey))best=s;
      });
    });
    return best;
  }
  async function getWeather(state){
    var st=findStation(state);if(!st)return null;
    var k=stationKey(state.stationKey);
    if(weatherCache.key===k&&Date.now()-weatherCache.ts<30*60*1000)return weatherCache.tag;
    try{
      var q='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(st.lat)+'&longitude='+encodeURIComponent(st.lng)+'&current=weather_code&timezone=Asia%2FSeoul';
      var r=await fetch(q);if(!r.ok)throw new Error('weather '+r.status);
      var j=await r.json();
      var tag=weatherTag(j&&j.current&&j.current.weather_code);
      weatherCache={key:k,tag:tag,ts:Date.now()};return tag;
    }catch(_){return null;}
  }
  async function loadRules(){
    if(!base||!anon)return [];
    try{
      var q=base+'/rest/v1/subway_music_rules?select=id,title,playlist_url,line_key,station_key,weather_tag,daypart,hashtags,priority&enabled=eq.true&order=priority.desc';
      var r=await fetch(q,{headers:{apikey:anon,Authorization:'Bearer '+anon}});
      if(!r.ok)throw new Error('rules '+r.status);
      rules=await r.json();return rules;
    }catch(e){console.warn('[sameway music] rules fallback',e);return rules;}
  }
  function score(rule,ctx){
    var s=Number(rule.priority)||0;
    if(rule.station_key){if(stationKey(rule.station_key)!==stationKey(ctx.station))return -1e9;s+=500;}
    if(rule.line_key){if(rule.line_key!==ctx.line)return -1e9;s+=250;}
    if(rule.weather_tag){if(rule.weather_tag!==ctx.weather)return -1e9;s+=160;}
    if(rule.daypart){if(rule.daypart!==ctx.daypart)return -1e9;s+=120;}
    s+=Math.min(40,((rule.hashtags||[]).length)*5);
    return s;
  }
  function choose(ctx){
    var best=null,bestScore=-1e9;
    rules.forEach(function(r){var s=score(r,ctx);if(s>bestScore){best=r;bestScore=s;}});
    return bestScore<=-1e8?null:best;
  }
  function parseYT(url){
    try{
      var u=new URL(url),list=u.searchParams.get('list'),v=u.searchParams.get('v');
      if(list)return {kind:'playlist',id:list};
      if(u.hostname.indexOf('youtu.be')>=0)return {kind:'video',id:u.pathname.replace(/^\//,'')};
      if(v)return {kind:'video',id:v};
    }catch(_){ }
    return null;
  }
  function mount(rule,ctx){
    if(!rule||!rule.playlist_url)return;
    var parsed=parseYT(rule.playlist_url);if(!parsed)return;
    var legacy=document.querySelector('.feed .music');
    if(!legacy)return;
    legacy.style.display='none';
    var host=document.getElementById('sameway-music-v3');
    if(!host){
      host=document.createElement('div');host.id='sameway-music-v3';host.className='music';
      legacy.parentNode.insertBefore(host,legacy.nextSibling);
    }
    var src=parsed.kind==='playlist'
      ? 'https://www.youtube.com/embed/videoseries?list='+encodeURIComponent(parsed.id)+'&playsinline=1&rel=0'
      : 'https://www.youtube.com/embed/'+encodeURIComponent(parsed.id)+'?playsinline=1&rel=0';
    host.innerHTML='<div style="display:flex;align-items:center;gap:10px"><div style="font-size:20px">🎵</div><div style="flex:1;min-width:0"><div style="font-size:11px;color:#0A8F77;font-weight:800">'+escapeHtml([ctx.line,ctx.station,ctx.weather,ctx.daypart].filter(Boolean).join(' · '))+'</div><div style="font-size:13.5px;font-weight:800;margin-top:2px">'+escapeHtml(rule.title)+'</div></div></div><iframe title="'+escapeHtml(rule.title)+'" src="'+src+'" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;height:96px;border:0;border-radius:12px;margin-top:10px"></iframe>';
  }
  function escapeHtml(v){return String(v||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c;});}
  async function refresh(state){
    if(!state||!state.stationKey||state.confidence==='low')return;
    if(!rules.length)await loadRules();
    var ctx={line:state.line,station:state.stationKey,weather:await getWeather(state),daypart:daypart()};
    var rule=choose(ctx);if(!rule)return;
    var key=[rule.id,ctx.line,ctx.station,ctx.weather,ctx.daypart].join('|');
    if(current===key)return;current=key;
    mount(rule,ctx);
    window.SAMEWAY_MUSIC_STATE={rule:rule,context:ctx,updatedAt:Date.now()};
    try{window.dispatchEvent(new CustomEvent('subway:music',{detail:window.SAMEWAY_MUSIC_STATE}));}catch(_){ }
  }

  window.addEventListener('subway:location',function(e){refresh(e.detail);});
  var mo=new MutationObserver(function(){var s=window.SAMEWAY_LOCATION_STATE;if(s&&s.stationKey)refresh(s);});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(function(){try{mo.disconnect();}catch(_){ }},20000);
  loadRules();
  window.SAMEWAY_MUSIC={version:'3.1.0',reload:loadRules,refresh:refresh,select:choose};
})();
