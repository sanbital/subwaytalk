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

  function isLounge(k){return /^lounge:/.test(k);}
  function isAdmin(k){return /^admin:/.test(k);}
  function isKnown(k){return isLounge(k)||isAdmin(k);}

  // 운영 콘솔 토큰. subway-admin 함수의 login 으로만 발급된다.
  function adminToken(){
    try{return window.SAMEWAY_ADMIN_TOKEN||sessionStorage.getItem('sameway:admin-token')||'';}catch(_){return window.SAMEWAY_ADMIN_TOKEN||'';}
  }

  async function remoteGet(k){
    var q=url+'/rest/v1/subway_runtime_state?select=value&key=eq.'+encodeURIComponent(k)+'&limit=1';
    var r=await fetch(q,{headers:headers()});
    if(!r.ok)throw new Error('state get '+r.status);
    var rows=await r.json();
    if(!rows||!rows.length)return null;
    return {value:stringifyValue(rows[0].value)};
  }

  // lounge:* 만 익명으로 직접 쓴다. admin:* 은 RLS 에서 막혀 있으므로
  // 서버가 코드로 검증해 발급한 토큰을 들고 edge function 을 통해서만 쓴다.
  async function remoteSet(k,v){
    if(isAdmin(k)){
      var token=adminToken();
      if(!token)return {ok:false,error:'admin_token_required'};
      var r=await fetch(url+'/functions/v1/subway-admin',{
        method:'POST',headers:headers(),
        body:JSON.stringify({action:'state.set',token:token,key:k,value:parseValue(v)})
      });
      if(!r.ok)return {ok:false,error:'admin set '+r.status};
      return {ok:true,mode:'supabase-admin'};
    }
    var q=url+'/rest/v1/subway_runtime_state?on_conflict=key';
    var body={key:k,value:parseValue(v),updated_at:new Date().toISOString()};
    var res=await fetch(q,{method:'POST',headers:headers({Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(body)});
    if(!res.ok)throw new Error('state set '+res.status);
    localSet(k,v);
    return {ok:true,mode:'supabase'};
  }

  window.storage={
    get:async function(k){
      if(!ready||!isKnown(k))return localGet(k);
      try{var r=await remoteGet(k);return r||localGet(k);}
      catch(e){console.warn('[sameway storage] remote get fallback',e);return localGet(k);}
    },
    set:async function(k,v){
      if(!ready||!isKnown(k))return localSet(k,v);
      try{return await remoteSet(k,v);}
      catch(e){console.warn('[sameway storage] remote set fallback',e);return localSet(k,v);}
    }
  };

  // 운영/광고주 콘솔 로그인. 접근 코드는 서버 시크릿과만 비교된다.
  window.SAMEWAY_ADMIN_AUTH={
    login:async function(role,code){
      if(!ready)return {ok:false,error:'unconfigured'};
      var r=await fetch(url+'/functions/v1/subway-admin',{
        method:'POST',headers:headers(),
        body:JSON.stringify({action:'login',role:role,code:code})
      });
      var j={};try{j=await r.json();}catch(_){}
      if(!r.ok||!j.ok)return {ok:false,error:(j&&j.error)||('HTTP '+r.status)};
      window.SAMEWAY_ADMIN_TOKEN=j.token;
      try{sessionStorage.setItem('sameway:admin-token',j.token);}catch(_){}
      return {ok:true};
    },
    logout:function(){
      window.SAMEWAY_ADMIN_TOKEN='';
      try{sessionStorage.removeItem('sameway:admin-token');}catch(_){}
    },
    token:adminToken,
    adStats:async function(){
      var token=adminToken();
      if(!ready||!token)return {};
      try{
        var r=await fetch(url+'/functions/v1/subway-admin',{
          method:'POST',headers:headers(),
          body:JSON.stringify({action:'ad.stats',token:token})
        });
        var j=await r.json();
        return (j&&j.stats)||{};
      }catch(_){return {};}
    }
  };

  window.SAMEWAY_STORAGE={
    version:'5.0.0',
    mode:ready?'supabase':'local',
    table:'subway_runtime_state',
    get:window.storage.get,
    set:window.storage.set
  };
})();
