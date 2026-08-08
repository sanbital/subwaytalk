(function(){
  'use strict';
  var cfg=window.SAMEWAY_CONFIG||{},ads=[],current=null,dismissed=null,queued=false;
  var session=(function(){try{var k='subway:v3:session',v=sessionStorage.getItem(k);if(!v){v='s_'+Math.random().toString(36).slice(2)+Date.now().toString(36);sessionStorage.setItem(k,v);}return v;}catch(_){return 's_'+Date.now().toString(36);}})();
  function key(v){return window.SAMEWAY_LOCATION_ENGINE?window.SAMEWAY_LOCATION_ENGINE.stationKey(v):String(v||'').replace(/\([^)]*\)/g,'').trim();}
  function headers(extra){var h={apikey:cfg.SUPABASE_ANON_KEY,Authorization:'Bearer '+cfg.SUPABASE_ANON_KEY,Accept:'application/json'};if(extra)Object.keys(extra).forEach(function(k){h[k]=extra[k];});return h;}
  async function hash(v){try{var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0');}).join('').slice(0,40);}catch(_){return ('00000000'+Math.abs(v.split('').reduce(function(a,c){return ((a<<5)-a)+c.charCodeAt(0)|0;},0)).toString(16)).slice(-8).repeat(4);}}
  async function load(){
    if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
    try{
      var url=cfg.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/subway_ads?select=id,station_key,line_key,brand,offer,cta,target_url,image_url,radius_m,priority&order=priority.asc';
      var r=await fetch(url,{headers:headers()});if(r.ok){ads=await r.json();schedule();}
    }catch(_){ }
  }
  function pick(st){
    if(!st||!st.stationKey||st.confidence==='low'||st.distanceToStation==null)return null;
    for(var i=0;i<ads.length;i++){
      var a=ads[i],radius=Number(a.radius_m)||220;
      if(key(a.station_key)!==st.stationKey)continue;
      if(a.line_key&&a.line_key!==st.line)continue;
      if(st.distanceToStation>radius)continue;
      if(dismissed===a.id+':'+st.stationKey)continue;
      return a;
    }
    return null;
  }
  function seenKey(a,st){return 'subway:v3:adseen:'+a.id+':'+st.stationKey;}
  function seen(a,st){try{return sessionStorage.getItem(seenKey(a,st))==='1';}catch(_){return false;}}
  function markSeen(a,st){try{sessionStorage.setItem(seenKey(a,st),'1');}catch(_){ }}
  // 노출/클릭은 subway-ad-event 함수를 통해서만 기록한다.
  // 브라우저가 테이블에 직접 INSERT 하던 시절에는 curl 반복만으로 광고 성과를 위조할 수 있었다.
  // 이제 캠페인 실재 여부·타겟 일치·세션당 빈도를 서버가 검증한다.
  async function event(type,a,st){
    if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
    try{
      var sh=await hash(session);
      await fetch(cfg.SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/subway-ad-event',{
        method:'POST',
        headers:headers({'Content-Type':'application/json'}),
        body:JSON.stringify({event_type:type,ad_id:a.id,station_key:st.stationKey,line_key:st.line,session_hash:sh,accuracy_m:st.accuracy,distance_m:st.distanceToStation})
      });
    }catch(_){ }
  }
  function style(){
    if(document.getElementById('subway-v3-ad-style'))return;
    var s=document.createElement('style');s.id='subway-v3-ad-style';
    s.textContent='\n.phone .adbanner{display:none!important}\n.subway-v3-ad{display:flex;align-items:center;gap:9px;padding:7px 10px;background:#fff;border-bottom:1px solid #E1E5EB}\n.subway-v3-ad .bar{width:3px;align-self:stretch;border-radius:2px;background:#16C7A6;flex:none}.subway-v3-ad img{width:46px;height:46px;border-radius:10px;object-fit:cover;border:1px solid #E1E5EB}\n.subway-v3-ad .body{flex:1;min-width:0}.subway-v3-ad .label{font-size:10px;font-weight:800;color:#A4ABB6}.subway-v3-ad .head{font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.subway-v3-ad .offer{font-size:11px;color:#727A86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.subway-v3-ad .cta{border:1px solid #16C7A6;background:#E7FAF5;color:#0A8F77;border-radius:9px;padding:6px 10px;font-size:11.5px;font-weight:800;white-space:nowrap}.subway-v3-ad .close{background:none;border:0;color:#A4ABB6;padding:4px}\n';
    document.head.appendChild(s);
  }
  function render(){
    queued=false;style();
    var st=window.SAMEWAY_LOCATION_STATE||{},slot=document.getElementById('sw-slot-ad');if(!slot)return;
    var a=pick(st),old=document.getElementById('subway-v3-ad');
    if(!a){if(old)old.remove();current=null;return;}
    if(old&&current===a.id)return;if(old)old.remove();
    var d=document.createElement('div');d.id='subway-v3-ad';d.className='subway-v3-ad';
    if(a.image_url){var img=document.createElement('img');img.src=a.image_url;img.alt='';d.appendChild(img);}else{var bar=document.createElement('div');bar.className='bar';d.appendChild(bar);}
    var body=document.createElement('div');body.className='body';
    var label=document.createElement('div');label.className='label';label.textContent='광고';
    var head=document.createElement('div');head.className='head';head.textContent=a.brand;
    var offer=document.createElement('div');offer.className='offer';offer.textContent=a.offer;body.append(label,head,offer);d.appendChild(body);
    var cta=document.createElement('button');cta.className='cta';cta.textContent=a.cta||'매장 보기';cta.onclick=function(){event('click',a,st);window.open(a.target_url,'_blank','noopener,noreferrer');};d.appendChild(cta);
    var close=document.createElement('button');close.className='close';close.textContent='✕';close.setAttribute('aria-label','광고 닫기');close.onclick=function(){dismissed=a.id+':'+st.stationKey;d.remove();current=null;};d.appendChild(close);
    slot.appendChild(d);current=a.id;
    if(!seen(a,st)){markSeen(a,st);event('impression',a,st);}
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(render);}
  window.addEventListener('subway:location',schedule);
  document.addEventListener('DOMContentLoaded',function(){style();load();setInterval(load,60000);schedule();});
  window.SAMEWAY_AD_RUNTIME={reload:load,getAds:function(){return ads.slice();}};
})();
