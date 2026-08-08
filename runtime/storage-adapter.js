(function(){
  'use strict';

  var cfg=window.SAMEWAY_CONFIG||{};
  var url=String(cfg.SUPABASE_URL||'').replace(/\/$/,'');
  var key=String(cfg.SUPABASE_ANON_KEY||'');
  var ready=!!(url&&key);
  var PREFIX='sameway:';

  function localGet(k){
    try{var v=localStorage.getItem(PREFIX+k);return v==null?null:{value:v};}catch(_){return null;}
  }
  function localSet(k,v){
    try{localStorage.setItem(PREFIX+k,String(v));return {ok:true,mode:'local'};}catch(e){return {ok:false,error:String(e)};}
  }
  function headers(extra){
    var h={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
    if(extra)Object.keys(extra).forEach(function(k){h[k]=extra[k];});
    return h;
  }
  function parseValue(v){
    if(typeof v!=='string')return v;
    try{return JSON.parse(v);}catch(_){return v;}
  }
  function stringifyValue(v){return typeof v==='string'?v:JSON.stringify(v);}
  function allowed(k){return /^lounge:/.test(k)||/^admin:/.test(k);}

  async function remoteGet(k){
    var q=url+'/rest/v1/subway_runtime_state?select=value&key=eq.'+encodeURIComponent(k)+'&limit=1';
    var r=await fetch(q,{headers:headers()});
    if(!r.ok)throw new Error('state get '+r.status);
    var rows=await r.json();
    if(!rows||!rows.length)return null;
    return {value:stringifyValue(rows[0].value)};
  }
  async function remoteSet(k,v){
    if(!allowed(k))return localSet(k,v);
    var q=url+'/rest/v1/subway_runtime_state?on_conflict=key';
    var body={key:k,value:parseValue(v),updated_at:new Date().toISOString()};
    var r=await fetch(q,{method:'POST',headers:headers({Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(body)});
    if(!r.ok)throw new Error('state set '+r.status);
    localSet(k,v);
    return {ok:true,mode:'supabase'};
  }

  window.storage={
    get:async function(k){
      if(!ready||!allowed(k))return localGet(k);
      try{var r=await remoteGet(k);return r||localGet(k);}catch(e){console.warn('[sameway storage] remote get fallback',e);return localGet(k);}
    },
    set:async function(k,v){
      if(!ready||!allowed(k))return localSet(k,v);
      try{return await remoteSet(k,v);}catch(e){console.warn('[sameway storage] remote set fallback',e);return localSet(k,v);}
    }
  };

  window.SAMEWAY_STORAGE={
    version:'3.1.0',
    mode:ready?'supabase':'local',
    table:'subway_runtime_state',
    get:window.storage.get,
    set:window.storage.set
  };
})();
