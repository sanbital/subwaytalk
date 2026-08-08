(function(){
  'use strict';
  // 위치 상태를 라운지 헤더에 반영한다.
  // 이전 버전은 MutationObserver 콜백에서 innerHTML 을 매번 새로 써서
  // 자기 변경이 다시 콜백을 부르는 되먹임 루프를 만들었다(13초에 2만 회 이상 변경).
  // 지금은 노드를 한 번만 만들고 이후에는 textContent 만 바꾼다.
  var queued=false,observer=null,lastHeadline='';

  function ensureStyle(){
    if(document.getElementById('subway-v3-ui-style'))return;
    var s=document.createElement('style');s.id='subway-v3-ui-style';
    s.textContent='\n.phone.v3-location-on .lh .track,.phone.v3-location-on .lh .stn{display:none}\n'+
      '.subway-v3-routebox{margin:9px 0 1px;padding:10px 12px;border-radius:12px;background:#F4F6F9;border:1px solid #E1E5EB}\n'+
      '.subway-v3-routebox .main{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#15181D}\n'+
      '.subway-v3-routebox .line{color:#0A8F77}.subway-v3-routebox .arrow{color:#A4ABB6}\n'+
      '.subway-v3-routebox .sub{margin-top:4px;font-size:11.5px;font-weight:650;color:#727A86}\n'+
      '.subway-v3-routebox.low .main,.subway-v3-routebox.low .line{color:#E8983A}\n';
    document.head.appendChild(s);
  }

  function withObserverPaused(fn){
    if(observer)observer.disconnect();
    try{ fn(); }
    finally{ if(observer)observer.observe(document.body,{childList:true,subtree:true}); }
  }

  function setHeadline(row,text){
    if(!row||text===lastHeadline)return;
    var nodes=Array.prototype.slice.call(row.childNodes);
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i];
      if(n.nodeType===3&&n.nodeValue.trim()){n.nodeValue=' '+text+' ';lastHeadline=text;return;}
    }
  }

  function buildBox(lh){
    var box=lh.querySelector('.subway-v3-routebox');
    if(box)return box;
    box=document.createElement('div');
    box.className='subway-v3-routebox';
    var main=document.createElement('div');main.className='main';
    var line=document.createElement('span');line.className='line';
    var arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='→';
    var dir=document.createElement('span');dir.className='dir';
    main.append(line,arrow,dir);
    var sub=document.createElement('div');sub.className='sub';
    box.append(main,sub);
    lh.appendChild(box);
    return box;
  }

  function render(){
    queued=false;ensureStyle();
    var st=window.SAMEWAY_LOCATION_STATE||{},
        phone=document.querySelector('.phone'),
        lh=document.querySelector('.phone .lh');
    if(!phone||!lh||!st.timestamp)return;

    withObserverPaused(function(){
      phone.classList.add('v3-location-on');
      setHeadline(lh.querySelector('.row1'),
        st.arrived&&st.stationKey?st.stationKey+'역 도착':(st.line?st.line+' 이동 중':'위치 분석 중'));

      var box=buildBox(lh);
      box.classList.toggle('low',st.confidence==='low');
      var near=st.stationKey?(st.arrived?st.stationKey+'역':st.stationKey+'역 부근'):'역 분석 중';
      var acc=st.accuracy!=null?'GPS ±'+st.accuracy+'m':'';
      var quality=st.confidence==='low'?' · 위치 정확도 낮음':'';
      // textContent 만 갱신하므로 childList 변경이 발생하지 않는다.
      box.querySelector('.line').textContent=st.line||'노선 분석 중';
      box.querySelector('.dir').textContent=st.nextStation?st.nextStation+' 방면':'방향 분석 중';
      box.querySelector('.sub').textContent=[near,acc].filter(Boolean).join(' · ')+quality;

      var btn=document.querySelector('.phone .getoff');
      if(btn){
        if(st.arrived&&st.stationKey){btn.textContent='🚉 '+st.stationKey+'역에서 내릴게요';btn.classList.add('hot');}
        else if(st.nextStation){btn.textContent='다음 · '+st.nextStation+' 방면';btn.classList.remove('hot');}
        else{btn.textContent='방향 확인 중';btn.classList.remove('hot');}
      }
      var end=document.querySelector('.phone .end .big');
      if(end&&st.stationKey)end.textContent=st.stationKey+'역에 도착했어요.';
    });
  }

  function schedule(){if(queued)return;queued=true;requestAnimationFrame(render);}

  window.addEventListener('subway:location',schedule);
  document.addEventListener('DOMContentLoaded',function(){
    ensureStyle();
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    schedule();
  });
})();
