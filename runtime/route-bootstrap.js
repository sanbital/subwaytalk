(function(){
  'use strict';

  function wantedMode(){
    var p=location.pathname.replace(/\/+$/,'');
    if(/\/admin$/.test(p))return '관리자';
    if(/\/advertiser$/.test(p))return '광고주';
    return '사용자 앱';
  }

  function apply(){
    var target=wantedMode();
    var buttons=[].slice.call(document.querySelectorAll('.lg-topbar button'));
    if(!buttons.length)return false;
    var current=buttons.find(function(b){return (b.textContent||'').trim()===target;});
    if(current&&!current.classList.contains('on'))current.click();

    // 상단 모드 전환바는 개발용이다. 어느 경로에서도 사용자에게 보일 이유가 없다.
    var bar=document.querySelector('.lg-topbar');
    if(bar)bar.style.display='none';
    return true;
  }

  if(!apply()){
    var mo=new MutationObserver(function(){if(apply())mo.disconnect();});
    mo.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(function(){try{mo.disconnect();}catch(_){ }},10000);
  }

  window.SAMEWAY_ROUTE={version:'3.1.0',mode:wantedMode()};
})();
