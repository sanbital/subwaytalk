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

  // ---- 실제로 보이는 높이(--vvh) ----
  //
  // 100dvh 는 주소창은 반영하지만 키보드는 반영하지 않는다. 그래서 키보드가 올라오면
  // 입력창이 화면 밖으로 밀리고, iOS 가 그걸 보이게 하려고 문서를 통째로 스크롤한다.
  // 그 결과 헤더가 상태바 뒤로 올라가 버리고 — 상태바 영역의 탭은 페이지가 아니라
  // iOS 가 먹으므로 — 하차·참여자·노선 버튼이 통째로 안 눌리는 상태가 된다.
  // 키보드를 닫아도 스크롤은 되돌아오지 않아서 그대로 고착된다.
  //
  // visualViewport 로 실측한 높이를 루트에 박아 두면 밀려날 입력창이 애초에 없다.
  (function(){
    var vv=window.visualViewport;
    if(!vv)return;
    var raf=0;
    function apply(){
      raf=0;
      document.documentElement.style.setProperty('--vvh',vv.height+'px');
      // 이미 스크롤됐다면(키보드가 뜨는 순간 등) 원위치로 돌린다.
      if(window.scrollY||window.scrollX)window.scrollTo(0,0);
    }
    function schedule(){ if(!raf)raf=requestAnimationFrame(apply); }
    vv.addEventListener('resize',schedule);
    vv.addEventListener('scroll',schedule);
    window.addEventListener('orientationchange',schedule);
    apply();
  })();

  window.SAMEWAY_ROUTE={version:'4.0.0',mode:wantedMode()};
})();
