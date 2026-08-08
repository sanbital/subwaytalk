(function () {
  'use strict';

  var VERSION='4.0.0';
  var lines=window.SAMEWAY_LINES||{};
  if(!Object.keys(lines).length)return;

  var LINE_ALIASES={
    '경부선':'1호선','경인선':'1호선','경원선':'1호선','장항선':'1호선',
    '일산선':'3호선','과천선':'4호선','안산선':'4호선','진접선':'4호선',
    '중앙선':'경의중앙선','분당선':'수인분당선','수인선':'수인분당선',
    '9호선(연장)':'9호선','7호선(인천)':'7호선','신분당선(연장)':'신분당선',
    '신분당선(연장2)':'신분당선','공항철도1호선':'공항철도','별내선':'8호선'
  };
  function lineKey(v){return LINE_ALIASES[v]||v;}
  function stationKey(v){return String(v||'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rad(v){return v*Math.PI/180;}
  function dist(aLat,aLng,bLat,bLng){
    var R=6371000,dLat=rad(bLat-aLat),dLng=rad(bLng-aLng);
    var q=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
  }
  function bearing(aLat,aLng,bLat,bLng){
    var y=Math.sin(rad(bLng-aLng))*Math.cos(rad(bLat));
    var x=Math.cos(rad(aLat))*Math.sin(rad(bLat))-Math.sin(rad(aLat))*Math.cos(rad(bLat))*Math.cos(rad(bLng-aLng));
    return (Math.atan2(y,x)*180/Math.PI+360)%360;
  }
  function angleDiff(a,b){var d=Math.abs(a-b)%360;return d>180?360-d:d;}
  function project(lat,lng,a,b){
    var mx=111320*Math.cos(rad(lat)),my=110540;
    var ax=(a.lng-lng)*mx,ay=(a.lat-lat)*my,bx=(b.lng-lng)*mx,by=(b.lat-lat)*my;
    var vx=bx-ax,vy=by-ay,den=vx*vx+vy*vy;
    var t=den?clamp((-(ax*vx+ay*vy))/den,0,1):0;
    var px=ax+t*vx,py=ay+t*vy;
    return {t:t,dist:Math.sqrt(px*px+py*py)};
  }

  var MAX_GAP=6500;

  // 순환선의 마지막 역 인덱스를 데이터에서 찾아낸다.
  // 이전에는 2호선 루프 끝을 42로 하드코딩해서, stations.js 의 역 순서가 조금만
  // 바뀌어도 방향 판정이 조용히 틀어졌다. 지금은 "0번 역 근처로 돌아오는 가장 먼 지점"을
  // 실제 좌표로 계산하고, 그 뒤에 붙은 지선 구간은 루프에서 제외한다.
  // 단순히 "0번 역 근처로 돌아오는 지점"만 찾으면 곡선 구간이 있는 일반 노선까지
  // 순환선으로 오인한다(1호선·9호선 등). 진짜 순환선은 아래를 모두 만족한다.
  //   ① 노선 대부분을 소진한 뒤 시작역 근처로 복귀하고
  //   ② 복귀 전에 시작역에서 충분히 멀어진 적이 있으며
  //   ③ 그 구간에 끊긴 데가 없다.
  //   ④ 그리고 닫히는 구간이 일반 역간 거리 수준이어야 한다. 이게 없으면
  //      끝점이 우연히 시작점에서 6km 안쪽인 짧은 직선 노선까지 걸린다.
  var LOOP_MIN_SPAN_RATIO=0.6;
  var LOOP_MIN_EXCURSION=5000;
  function medianGap(arr){
    var gaps=[];
    for(var i=0;i<arr.length-1;i++)gaps.push(dist(arr[i].lat,arr[i].lng,arr[i+1].lat,arr[i+1].lng));
    if(!gaps.length)return 0;
    gaps.sort(function(a,b){return a-b;});
    return gaps[Math.floor(gaps.length/2)];
  }
  function findLoopEnd(arr){
    if(arr.length<8)return -1;
    var minEnd=Math.max(7,Math.floor((arr.length-1)*LOOP_MIN_SPAN_RATIO));
    var closeLimit=Math.min(MAX_GAP,Math.max(2500,medianGap(arr)*1.6));
    for(var i=arr.length-1;i>=minEnd;i--){
      if(dist(arr[i].lat,arr[i].lng,arr[0].lat,arr[0].lng)>closeLimit)continue;
      var contiguous=true,excursion=0;
      for(var j=0;j<i;j++){
        if(dist(arr[j].lat,arr[j].lng,arr[j+1].lat,arr[j+1].lng)>MAX_GAP){contiguous=false;break;}
        excursion=Math.max(excursion,dist(arr[j].lat,arr[j].lng,arr[0].lat,arr[0].lng));
      }
      if(contiguous&&excursion>=LOOP_MIN_EXCURSION)return i;
    }
    return -1;
  }

  // window.SAMEWAY_LINES 는 앱(app.js)도 읽는 공유 데이터다.
  // 이전 버전은 여기서 st.n 을 정규화된 이름으로 덮어써서
  // 앱 화면의 역명까지 같이 바뀌어 버렸다("올림픽공원(한국체대)" → "올림픽공원").
  // 원본은 건드리지 않고 내부 인덱스에만 정규화 키를 둔다.
  var segments=[],stations=[],loopEnd={};
  Object.keys(lines).forEach(function(sourceLine){
    var arr=(lines[sourceLine]&&lines[sourceLine].stations)||[];
    var normalized=lineKey(sourceLine);
    arr.forEach(function(st,idx){
      stations.push({sourceLine:sourceLine,line:normalized,idx:idx,st:st,key:stationKey(st.n)});
    });
    for(var i=0;i<arr.length-1;i++){
      var len=dist(arr[i].lat,arr[i].lng,arr[i+1].lat,arr[i+1].lng);
      if(len>=120&&len<=MAX_GAP){
        segments.push({sourceLine:sourceLine,line:normalized,aIdx:i,bIdx:i+1,a:arr[i],b:arr[i+1],len:len});
      }
    }
    var end=findLoopEnd(arr);
    if(end>0){
      loopEnd[sourceLine]=end;
      var loopLen=dist(arr[end].lat,arr[end].lng,arr[0].lat,arr[0].lng);
      if(loopLen<=MAX_GAP){
        segments.push({sourceLine:sourceLine,line:normalized,aIdx:end,bIdx:0,a:arr[end],b:arr[0],len:loopLen,loop:true});
      }
    }
  });

  var state={version:VERSION,line:null,sourceLine:null,stationKey:null,nextStation:null,direction:0,
    directionLabel:'방향 분석 중',distanceToStation:null,accuracy:null,routeDistance:null,
    confidence:'low',arrived:false,timestamp:0};
  var previous=null,history=[],votes=[],watchIds=[],started=false;
  window.SAMEWAY_LOCATION_STATE=state;

  function nearestStation(sourceLine,lat,lng){
    var arr=(lines[sourceLine]&&lines[sourceLine].stations)||[],best=null;
    arr.forEach(function(st,idx){
      var d=dist(lat,lng,st.lat,st.lng);
      if(!best||d<best.d)best={st:st,idx:idx,d:d};
    });
    return best;
  }
  function metric(m){
    var end=loopEnd[m.sourceLine];
    return (m.loop&&end!=null)?end+m.t:m.aIdx+m.t;
  }
  function directionFor(m,coords){
    var mt=metric(m),prev=null,end=loopEnd[m.sourceLine];
    for(var i=history.length-1;i>=0;i--){if(history[i].sourceLine===m.sourceLine){prev=history[i];break;}}
    if(prev){
      var delta=mt-prev.metric;
      // 순환선에서는 마지막 역 → 0번 역으로 넘어갈 때 지표가 크게 튄다. 한 바퀴 길이로 되돌린다.
      if(end!=null&&m.aIdx<=end&&prev.metric<=end+1){
        var loopSpan=end+1;
        if(delta>loopSpan/2)delta-=loopSpan;
        if(delta<-loopSpan/2)delta+=loopSpan;
      }
      if(Math.abs(delta)>=0.035){votes.push(delta>0?1:-1);if(votes.length>5)votes.shift();}
    }
    if(Number.isFinite(coords.heading)&&Number(coords.speed)>=1.2){
      var fwd=bearing(m.a.lat,m.a.lng,m.b.lat,m.b.lng);
      votes.push(angleDiff(coords.heading,fwd)<=angleDiff(coords.heading,(fwd+180)%360)?1:-1);
      if(votes.length>5)votes.shift();
    }
    var sum=votes.reduce(function(a,b){return a+b;},0),dir=Math.abs(sum)>=2?(sum>0?1:-1):0;
    history.push({sourceLine:m.sourceLine,metric:mt,ts:Date.now()});
    if(history.length>10)history.shift();
    return dir;
  }
  function nextFor(m,near,dir){
    if(!dir||!near)return null;
    var arr=(lines[m.sourceLine]&&lines[m.sourceLine].stations)||[],idx=near.idx+dir,end=loopEnd[m.sourceLine];
    if(end!=null&&near.idx<=end){if(idx<0)idx=end;if(idx>end)idx=0;}
    if(idx<0||idx>=arr.length)return null;
    if(dist(near.st.lat,near.st.lng,arr[idx].lat,arr[idx].lng)>MAX_GAP)return null;
    return stationKey(arr[idx].n);
  }

  function analyze(pos){
    var c=pos.coords||{},lat=Number(c.latitude),lng=Number(c.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
    var accuracy=Number.isFinite(c.accuracy)?Math.round(c.accuracy):999,candidates=[];
    segments.forEach(function(seg){
      var p=project(lat,lng,seg.a,seg.b);
      if(p.dist>Math.max(2500,accuracy*4))return;
      var score=p.dist;
      if(previous){
        if(seg.line===previous.line)score-=Math.min(260,100+accuracy*.35);
        else score+=Math.min(520,160+accuracy*.7);
        if(seg.sourceLine===previous.sourceLine){
          var jump=Math.min(Math.abs(seg.aIdx-previous.aIdx),Math.abs(seg.bIdx-previous.bIdx));
          if(jump<=2)score-=120;else if(jump>6)score+=180;
        }
      }
      candidates.push({sourceLine:seg.sourceLine,line:seg.line,aIdx:seg.aIdx,bIdx:seg.bIdx,
        a:seg.a,b:seg.b,loop:!!seg.loop,t:p.t,dist:p.dist,score:score});
    });
    candidates.sort(function(a,b){return a.score-b.score;});
    var m=candidates[0];
    if(!m){
      var best=null;
      stations.forEach(function(x){var d=dist(lat,lng,x.st.lat,x.st.lng);if(!best||d<best.d)best={x:x,d:d};});
      if(!best)return;
      m={sourceLine:best.x.sourceLine,line:best.x.line,aIdx:best.x.idx,bIdx:best.x.idx,
         a:best.x.st,b:best.x.st,t:0,dist:best.d,score:best.d};
    }
    if(previous&&previous.sourceLine!==m.sourceLine){history=[];votes=[];}
    var near=nearestStation(m.sourceLine,lat,lng),dir=directionFor(m,c),next=nextFor(m,near,dir);
    var arrivalRadius=clamp(Math.round(90+accuracy*.8),120,350),routeLimit=Math.max(220,accuracy*2.2);
    state={
      version:VERSION,sourceLine:m.sourceLine,line:m.line,
      stationKey:near?stationKey(near.st.n):null,nextStation:next,direction:dir,
      directionLabel:next?next+' 방면':'방향 분석 중',
      distanceToStation:near?Math.round(near.d):null,
      accuracy:accuracy,routeDistance:Math.round(m.dist),
      confidence:m.dist<=routeLimit?(accuracy<=120?'high':'medium'):'low',
      arrived:!!near&&near.d<=arrivalRadius,timestamp:Date.now()
    };
    previous=m;window.SAMEWAY_LOCATION_STATE=state;
    try{window.dispatchEvent(new CustomEvent('subway:location',{detail:state}));}catch(_){ }
  }

  // 이 엔진이 앱 전체의 유일한 위치 공급원이다(예전에는 앱이 별도로 watchPosition 을 또 돌렸다).
  // 지하 구간에서는 위성 기반 고정밀 fix 가 잡히지 않으므로 두 경로를 동시에 연다.
  //   · 저정밀(와이파이/기지국) — 터널 안에서 실제로 응답하는 경로
  //   · 고정밀(GPS) — 지상 구간에서 더 정확한 좌표
  // analyze() 는 accuracy 를 반영해 confidence 를 계산하므로 둘을 섞어 받아도 안전하다.
  function start(){
    if(started||!navigator.geolocation)return;started=true;
    try{
      watchIds.push(navigator.geolocation.watchPosition(analyze,function(){},
        {enableHighAccuracy:false,maximumAge:30000,timeout:30000}));
    }catch(_){ }
    try{
      watchIds.push(navigator.geolocation.watchPosition(analyze,function(){},
        {enableHighAccuracy:true,maximumAge:10000,timeout:30000}));
    }catch(_){ }
  }
  function stop(){
    if(navigator.geolocation){
      watchIds.forEach(function(id){try{navigator.geolocation.clearWatch(id);}catch(_){}});
    }
    watchIds=[];started=false;
  }

  document.addEventListener('click',function(e){
    var t=e.target;
    if(t&&t.closest&&t.closest('.perm-sheet .cta'))start();
  },true);

  window.SAMEWAY_LOCATION_ENGINE={version:VERSION,start:start,stop:stop,analyze:analyze,
    getState:function(){return window.SAMEWAY_LOCATION_STATE;},
    stationKey:stationKey,lineKey:lineKey,loopEnd:loopEnd};
})();
