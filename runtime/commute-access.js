(function(){
  'use strict';
  var samples=[],verifiedAt=0,bad=0;
  var state={status:'checking',score:0,reason:'탑승 확인 중',estimatedSpeedMps:0,updatedAt:0};
  window.SAMEWAY_ACCESS_STATE=state;
  function emit(next){state=next;window.SAMEWAY_ACCESS_STATE=state;try{window.dispatchEvent(new CustomEvent('subway:access',{detail:state}));}catch(_){}}
  function evaluate(loc){
    if(!loc||!loc.timestamp)return;
    var prev=samples.length?samples[samples.length-1]:null;
    var dt=prev?Math.max(1,(loc.timestamp-prev.ts)/1000):1;
    var dNow=Number(loc.distanceToStation),dPrev=prev?Number(prev.stationDistance):NaN;
    var est=isFinite(dNow)&&isFinite(dPrev)?Math.min(45,Math.abs(dNow-dPrev)/dt):0;
    var route=Number(loc.routeDistance),acc=Number(loc.accuracy||999);
    var aligned=isFinite(route)&&route<=Math.max(220,acc*1.8);
    var near=isFinite(dNow)&&dNow<=320;
    var moving=est>=1.5&&est<=42;
    var dir=Number(loc.direction)!==0;
    samples.push({ts:loc.timestamp,line:loc.line,station:loc.stationKey,stationDistance:dNow,aligned:aligned,moving:moving,dir:dir});if(samples.length>8)samples.shift();
    var sameLine=samples.filter(function(x){return x.line&&x.line===loc.line&&x.aligned;}).length;
    var directional=samples.filter(function(x){return x.dir&&x.aligned;}).length;
    var stationChange=samples.some(function(x){return x.station&&loc.stationKey&&x.station!==loc.stationKey;});
    var score=0;if(aligned)score+=35;if(loc.confidence==='high')score+=20;else if(loc.confidence==='medium')score+=12;if(dir)score+=20;if(moving)score+=10;if(near)score+=10;if(sameLine>=3)score+=10;if(directional>=2)score+=10;if(stationChange)score+=15;
    if(acc>350||(!aligned&&isFinite(route)&&route>700))bad++;else bad=Math.max(0,bad-1);
    var status='checking',reason='선로와 이동 방향을 확인하고 있어요';
    if(score>=70&&sameLine>=3&&(dir||stationChange)){status='verified';reason='지하철 탑승 확인';verifiedAt=verifiedAt||Date.now();}
    else if(near&&acc<=180){status='provisional';reason='역에서 탑승 확인 중';}
    else if(bad>=3){status='blocked';reason='지하철 선로에서 벗어난 위치로 보여요';}
    if(verifiedAt&&Date.now()-verifiedAt<90000&&aligned&&status!=='blocked'){status='verified';reason='지하철 탑승 확인';}
    emit({status:status,score:Math.min(100,score),reason:reason,estimatedSpeedMps:Math.round(est*10)/10,accuracy:acc,line:loc.line||null,station:loc.stationKey||null,directionLabel:loc.directionLabel||null,updatedAt:Date.now()});
  }
  function render(){
    var phone=document.querySelector('.phone'),perm=document.querySelector('.perm-screen'),match=document.querySelector('.match-stage');if(!phone||perm||match)return;
    var el=document.getElementById('sameway-access-gate');
    if(state.status==='verified'||state.status==='provisional'){if(el)el.remove();return;}
    if(!el){el=document.createElement('div');el.id='sameway-access-gate';el.style.cssText='position:absolute;inset:0;z-index:80;background:rgba(234,237,241,.97);display:flex;align-items:center;justify-content:center;padding:24px';phone.appendChild(el);}
    el.innerHTML='<div style="max-width:330px;background:#fff;border:1px solid #E1E5EB;border-radius:22px;padding:24px;text-align:center;box-shadow:0 14px 40px rgba(20,30,48,.12)"><div style="font-size:32px">🚇</div><div style="font-size:18px;font-weight:900;margin-top:10px">'+(state.status==='blocked'?'지하철에 탑승하면 열려요':'탑승 확인 중')+'</div><div style="font-size:13px;color:#727A86;line-height:1.6;margin-top:8px">'+state.reason+'<br/>선로·이동방향·속도 패턴을 함께 확인합니다.</div><div style="margin-top:14px;font-size:11px;color:#A4ABB6">정확한 위치는 서버에 저장하지 않아요.</div></div>';
  }
  window.addEventListener('subway:location',function(e){evaluate(e.detail);render();});window.addEventListener('subway:access',render);
  new MutationObserver(render).observe(document.documentElement,{childList:true,subtree:true});
  window.SAMEWAY_COMMUTE_ACCESS={version:'4.0.0',getState:function(){return state;},evaluate:evaluate};
})();