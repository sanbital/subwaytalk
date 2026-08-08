(function () {
  'use strict';

  var VERSION='3.0.0';
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

  Object.keys(lines).forEach(function(sourceLine){
    ((lines[sourceLine]&&lines[sourceLine].stations)||[]).forEach(function(st){
      if(!st.fullName)st.fullName=st.n;
      st.n=stationKey(st.n);
    });
  });

  var segments=[],stations=[];
  Object.keys(lines).forEach(function(sourceLine){
    var arr=(lines[sourceLine]&&lines[sourceLine].stations)||[];
    arr.forEach(function(st,idx){stations.push({sourceLine:sourceLine,line:lineKey(sourceLine),idx:idx,st:st});});
    for(var i=0;i<arr.length-1;i++){
      var len=dist(arr[i].lat,arr[i].lng,arr[i+1].lat,arr[i+1].lng);
      if(len>=120&&len<=6500)segments.push({sourceLine:sourceLine,line:lineKey(sourceLine),aIdx:i,bIdx:i+1,a:arr[i],b:arr[i+1],len:len});
    }
    if(sourceLine==='2호선'&&arr.length>42){
      var loopLen=dist(arr[42].lat,arr[42].lng,arr[0].lat,arr[0].lng);
      if(loopLen<6500)segments.push({sourceLine:sourceLine,line:'2호선',aIdx:42,bIdx:0,a:arr[42],b:arr[0],len:loopLen,loop:true});
    }
  });

  var state={version:VERSION,line:null,sourceLine:null,stationKey:null,nextStation:null,direction:0,directionLabel:'방향 분석 중',distanceToStation:null,accuracy:null,routeDistance:null,confidence:'low',arrived:false,timestamp:0};
  var previous=null,history=[],votes=[],watchId=null,started=false;
  window.SAMEWAY_LOCATION_STATE=state;

  function nearestStation(sourceLine,lat,lng){
    var arr=(lines[sourceLine]&&lines[sourceLine].stations)||[],best=null;
    arr.forEach(function(st,idx){var d=dist(lat,lng,st.lat,st.lng);if(!best||d<best.d)best={st:st,idx:idx,d:d};});
    return best;
  }
  function metric(m){return m.loop?42+m.t:m.aIdx+m.t;}
  function directionFor(m,coords){
    var mt=metric(m),prev=null;
    for(var i=history.length-1;i>=0;i--){if(history[i].sourceLine===m.sourceLine){prev=history[i];break;}}
    if(prev){
      var delta=mt-prev.metric;
      if(m.sourceLine==='2호선'&&m.aIdx<=42&&prev.metric<=43){if(delta>21.5)delta-=43;if(delta<-21.5)delta+=43;}
      if(Math.abs(delta)>=0.035){votes.push(delta>0?1:-1);if(votes.length>5)votes.shift();}
    }
    if(Number.isFinite(coords.heading)&&Number(coords.speed)>=1.2){
      var fwd=bearing(m.a.lat,m.a.lng,m.b.lat,m.b.lng);
      votes.push(angleDiff(coords.heading,fwd)<=angleDiff(coords.heading,(fwd+180)%360)?1:-1);
      if(votes.length>5)votes.shift();
    }
    var sum=votes.reduce(function(a,b){return a+b;},0),dir=Math.abs(sum)>=2?(sum>0?1:-1):0;
    history.push({sourceLine:m.sourceLine,metric:mt,ts:Date.now()});if(history.length>10)history.shift();
    return dir;
  }
  function nextFor(m,near,dir){
    if(!dir||!near)return null;
    var arr=(lines[m.sourceLine]&&lines[m.sourceLine].stations)||[],idx=near.idx+dir;
    if(m.sourceLine==='2호선'&&near.idx<=42){if(idx<0)idx=42;if(idx>42)idx=0;}
    if(idx<0||idx>=arr.length)return null;
    if(dist(near.st.lat,near.st.lng,arr[idx].lat,arr[idx].lng)>6500)return null;
    return arr[idx].n;
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
        if(seg.line===previous.line)score-=Math.min(260,100+accuracy*.35);else score+=Math.min(520,160+accuracy*.7);
        if(seg.sourceLine===previous.sourceLine){
          var jump=Math.min(Math.abs(seg.aIdx-previous.aIdx),Math.abs(seg.bIdx-previous.bIdx));
          if(jump<=2)score-=120;else if(jump>6)score+=180;
        }
      }
      candidates.push({sourceLine:seg.sourceLine,line:seg.line,aIdx:seg.aIdx,bIdx:seg.bIdx,a:seg.a,b:seg.b,loop:!!seg.loop,t:p.t,dist:p.dist,score:score});
    });
    candidates.sort(function(a,b){return a.score-b.score;});
    var m=candidates[0];
    if(!m){
      var best=null;stations.forEach(function(x){var d=dist(lat,lng,x.st.lat,x.st.lng);if(!best||d<best.d)best={x:x,d:d};});
      if(!best)return;
      m={sourceLine:best.x.sourceLine,line:best.x.line,aIdx:best.x.idx,bIdx:best.x.idx,a:best.x.st,b:best.x.st,t:0,dist:best.d,score:best.d};
    }
    var near=nearestStation(m.sourceLine,lat,lng),dir=directionFor(m,c),next=nextFor(m,near,dir);
    var arrivalRadius=clamp(Math.round(90+accuracy*.8),120,350),routeLimit=Math.max(220,accuracy*2.2);
    state={
      version:VERSION,sourceLine:m.sourceLine,line:m.line,
      stationKey:near?stationKey(near.st.n):null,nextStation:next,direction:dir,
      directionLabel:next?next+' 방면':'방향 분석 중',distanceToStation:near?Math.round(near.d):null,
      accuracy:accuracy,routeDistance:Math.round(m.dist),confidence:m.dist<=routeLimit?(accuracy<=120?'high':'medium'):'low',
      arrived:!!near&&near.d<=arrivalRadius,timestamp:Date.now()
    };
    previous=m;window.SAMEWAY_LOCATION_STATE=state;
    try{window.dispatchEvent(new CustomEvent('subway:location',{detail:state}));}catch(_){ }
  }

  function start(){
    if(started||!navigator.geolocation)return;started=true;
    watchId=navigator.geolocation.watchPosition(analyze,function(){}, {enableHighAccuracy:true,maximumAge:2000,timeout:12000});
  }
  function stop(){if(watchId!=null&&navigator.geolocation){navigator.geolocation.clearWatch(watchId);watchId=null;}started=false;}

  document.addEventListener('click',function(e){
    var t=e.target;
    if(t&&t.closest&&t.closest('.perm-sheet .cta'))start();
  },true);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')stop();});

  window.SAMEWAY_LOCATION_ENGINE={version:VERSION,start:start,stop:stop,analyze:analyze,getState:function(){return window.SAMEWAY_LOCATION_STATE;},stationKey:stationKey,lineKey:lineKey};
})();
