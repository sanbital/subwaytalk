import React, { useState, useEffect, useRef, useCallback } from "react";

/* =========================================================================
   같은 방향 — 위치기반 익명 지하철 라운지 (Alpha v0.2)
   테마: 통근의 빛 (쿨 라이트 배경 × 선셋 코랄 액센트)
   - 상단: 노선 위를 달리는 열차 + 흐르는 레일
   - 하차: 다음 역 접근 시 "○○역에서 내릴게요" 버튼이 직관적으로 강조
   ========================================================================= */

const CSS = `
:root{
  --bg:#EAEDF1; --paper:#FFFFFF; --paper2:#F4F6F9; --ink:#15181D; --muted:#727A86;
  --faint:#A4ABB6; --line:#E1E5EB; --line2:#EDF0F4;
  --c:#16C7A6; --c-d:#0A8F77; --c-soft:#CFF3EB; --c-soft2:#E7FAF5;
  --rail:#CDD4DD; --danger:#E5484D; --warn:#E8983A;
  --sh:0 1px 2px rgba(20,30,48,.04), 0 6px 20px rgba(20,30,48,.06);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.lg-root{font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  background:#D9DEE5;color:var(--ink);min-height:100vh;display:flex;flex-direction:column;align-items:center;letter-spacing:-0.011em}
.lg-topbar{width:100%;background:#fff;border-bottom:1px solid var(--line);display:flex;justify-content:center;gap:6px;padding:9px}
.lg-topbar button{background:#fff;border:1px solid var(--line);color:var(--muted);padding:7px 15px;border-radius:999px;
  font-size:12.5px;font-weight:700;cursor:pointer;transition:.15s}
.lg-topbar button.on{background:var(--c);border-color:var(--c);color:#fff}
.lg-topbar .brand{color:var(--faint);font-size:12px;align-self:center;margin-right:auto;padding-left:10px;font-weight:800}
.lg-topbar .brand b{color:var(--c)}

.phone{width:100%;max-width:430px;min-height:100vh;background:var(--bg);position:relative;display:flex;flex-direction:column;overflow:hidden}
@media(min-width:520px){.phone{min-height:780px;max-height:94vh;margin:16px 0;border-radius:38px;border:1px solid #cfd5dd;
  box-shadow:0 34px 90px rgba(40,55,80,.28)}}
.scr{flex:1;display:flex;flex-direction:column;min-height:0}
.center{flex:1;display:flex;flex-direction:column;justify-content:center;padding:36px 28px}
.muted{color:var(--muted)} .faint{color:var(--faint)}
.btn{background:var(--c);color:#fff;border:none;border-radius:15px;padding:16px;font-size:15px;font-weight:800;width:100%;
  cursor:pointer;transition:.15s;box-shadow:0 6px 16px rgba(22,199,166,.28)} .btn:active{transform:scale(.985)} .btn:disabled{opacity:.4;box-shadow:none}
.btn.ghost{background:#fff;color:var(--muted);border:1px solid var(--line);font-weight:700;box-shadow:none}

/* permission */
.perm h1{font-size:25px;font-weight:800;line-height:1.34;margin:0 0 14px;letter-spacing:-0.02em}
.perm .pill{display:inline-flex;align-items:center;gap:7px;background:var(--c-soft2);border:1px solid var(--c-soft);
  border-radius:999px;padding:7px 14px;font-size:12.5px;color:var(--c-d);font-weight:800;margin-bottom:22px;align-self:flex-start}
.perm .note{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:16px;font-size:13px;
  line-height:1.65;color:var(--muted);margin:22px 0;box-shadow:var(--sh)}
.dot-live{width:7px;height:7px;border-radius:50%;background:var(--c);animation:pulse 1.7s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(22,199,166,.45)}70%{box-shadow:0 0 0 9px rgba(22,199,166,0)}100%{box-shadow:0 0 0 0 rgba(22,199,166,0)}}

/* matching — 열차 진입 */
.match-stage{height:80px;position:relative;margin:34px 0 8px;overflow:hidden}
.match-stage .rail{position:absolute;left:0;right:0;top:50%;height:3px;background:repeating-linear-gradient(90deg,var(--rail) 0 12px,transparent 12px 22px);
  transform:translateY(-50%);animation:railflow 0.7s linear infinite}
@keyframes railflow{to{background-position:-22px 0}}
.match-stage .train{position:absolute;top:50%;transform:translateY(-50%);left:-70px;display:flex;align-items:center;gap:3px;
  animation:arrive 2s cubic-bezier(.25,.6,.2,1) forwards}
@keyframes arrive{to{left:calc(50% - 34px)}}
.match-stage .car{width:30px;height:22px;border-radius:7px;background:var(--c);box-shadow:0 4px 10px rgba(22,199,166,.4)}
.match-stage .car.b{background:var(--ink);opacity:.85;width:26px}
.match-stage .head{width:0;height:0;border-top:11px solid transparent;border-bottom:11px solid transparent;border-left:12px solid var(--c)}

/* lounge header — 달리는 열차 */
.lh{padding:13px 16px 12px;background:var(--paper);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5;
  transition:background .4s} 
.lh.arr{background:linear-gradient(180deg,var(--c-soft2),var(--paper))}
.lh .row1{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800}
.lh .row1 .ico{font-size:14px}
.lh.arr .row1{color:var(--c-d)}
.lh .cnt{margin-left:auto;font-size:12px;color:var(--muted);font-weight:700;font-variant-numeric:tabular-nums}
.track{position:relative;height:30px;margin-top:12px}
.track .base{position:absolute;left:5px;right:5px;top:14px;height:4px;border-radius:3px;background:var(--rail);overflow:hidden}
.track .base::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.5) 0 6px,transparent 6px 14px);
  animation:railflow 0.8s linear infinite}
.track .fill{position:absolute;left:5px;top:14px;height:4px;border-radius:3px;background:var(--c);transition:width .25s linear}
.track .stop{position:absolute;top:9px;width:11px;height:11px;border-radius:50%;background:#fff;border:2.5px solid var(--rail);transform:translateX(-50%)}
.track .stop.passed{border-color:var(--c)}
.track .train{position:absolute;top:4px;transform:translateX(-50%);transition:left .25s linear;z-index:2}
.track .train .tcar{width:20px;height:15px;border-radius:5px;background:var(--c);box-shadow:0 3px 8px rgba(22,199,166,.45)}
.track .train .tnose{width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:8px solid var(--c)}
.stn{display:flex;justify-content:space-between;font-size:11px;margin-top:7px}
.stn .from{color:var(--faint)} .stn .to{color:var(--c-d);font-weight:800}

/* 역 도착 광고 배너 */
.adbanner{display:flex;align-items:center;gap:11px;padding:11px 13px 11px 12px;background:var(--paper);border-bottom:1px solid var(--line);
  animation:addown .32s cubic-bezier(.2,.7,.2,1)}
@keyframes addown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
.adbanner .adbar{width:3px;align-self:stretch;border-radius:2px;background:var(--c);flex:none}
.adbanner .adbody{flex:1;min-width:0}
.adbanner .adlabel{font-size:10px;font-weight:800;color:var(--faint);letter-spacing:.02em}
.adbanner .adhead{font-size:13.5px;font-weight:800;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.adbanner .adoffer{font-size:12px;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.adbanner .adcta{flex:none;border:1.5px solid var(--c);background:var(--c-soft2);color:var(--c-d);border-radius:11px;padding:9px 13px;
  font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;text-decoration:none}
.adbanner .adx{flex:none;background:none;border:none;color:var(--faint);font-size:13px;cursor:pointer;padding:4px 2px}
.adbanner .adthumb{width:46px;height:46px;border-radius:10px;object-fit:cover;flex:none;border:1px solid var(--line)}

/* 광고주 센터 */
.adv{width:100%;min-height:100vh;background:var(--bg);padding:28px 24px 40px;overflow-y:auto}
.adv .ahead{max-width:1000px;margin:0 auto 22px} .adv h2{font-size:22px;font-weight:800;margin:0 0 4px}
.adv .grid{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
@media(max-width:780px){.adv .grid{grid-template-columns:1fr}}
.uploader{border:1.5px dashed var(--line);border-radius:13px;padding:20px;text-align:center;cursor:pointer;background:var(--paper2);transition:.15s}
.uploader:hover{border-color:var(--c);background:var(--c-soft2)}
.uploader .up-ico{font-size:22px;color:var(--c-d)} .uploader .up-t{font-size:13px;font-weight:700;margin-top:6px} .uploader .up-s{font-size:11.5px;color:var(--muted);margin-top:3px}
.uploader img{max-width:100%;max-height:150px;border-radius:9px;display:block;margin:0 auto}
.advmsg{font-size:12.5px;color:var(--c-d);font-weight:700;margin-top:10px}

.feed{flex:1;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:12px}
.feed::-webkit-scrollbar{width:0}
.card{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:var(--sh)}
.card .tag{font-size:10.5px;font-weight:800;letter-spacing:.03em;color:var(--c-d);margin-bottom:9px}
.card .q{font-size:16px;font-weight:800;line-height:1.4;margin-bottom:14px;letter-spacing:-0.01em}
.opt{position:relative;border:1.5px solid var(--line);border-radius:13px;padding:12px 14px;margin-bottom:8px;cursor:pointer;
  overflow:hidden;font-size:14px;font-weight:700;display:flex;justify-content:space-between;align-items:center;transition:.15s;background:#fff}
.opt .bar{position:absolute;left:0;top:0;bottom:0;background:var(--c-soft2);z-index:0;transition:width .55s cubic-bezier(.2,.7,.2,1)}
.opt .lbl,.opt .pct{position:relative;z-index:1}
.opt .pct{color:var(--c-d);font-variant-numeric:tabular-nums;font-size:13px;font-weight:800}
.opt.sel{border-color:var(--c)} .opt.sel .lbl{color:var(--c-d)}
.opt:active{transform:scale(.99)}
.card .meta{font-size:11.5px;color:var(--faint);margin-top:8px;display:flex;gap:10px}
.card .meta .hint{color:var(--c-d);font-weight:700}
.card.mini{padding:13px 15px}
.cardhead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.cardhead .tag{margin-bottom:0}
.vtoggle{background:none;border:none;color:var(--c-d);font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;padding:2px 0}
.q.qmini{font-size:14.5px;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vsum{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700}
.vsum .chk{display:inline-flex;width:19px;height:19px;border-radius:50%;background:var(--c);color:#fff;align-items:center;justify-content:center;font-size:11px;flex:none}
.vsum .vlbl b{color:var(--c-d)}
.vsum .vpct{margin-left:auto;color:var(--c-d);font-weight:800;font-variant-numeric:tabular-nums}
.vsum .vtot{color:var(--faint);font-weight:600;font-size:12px}

.pl{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:13px 15px;display:flex;align-items:center;gap:12px;
  box-shadow:var(--sh);text-decoration:none}
.pl .ico{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--c),#4FDEC6);display:flex;align-items:center;
  justify-content:center;flex:none;font-size:18px;color:#fff}
.pl .t{flex:1;min-width:0} .pl .t .a{font-size:14px;font-weight:800;color:var(--ink)} .pl .t .b{font-size:11.5px;color:var(--muted);margin-top:2px}
.pl .play{color:var(--c-d);font-size:12.5px;font-weight:800;white-space:nowrap;border:1.5px solid var(--c-soft);background:var(--c-soft2);padding:8px 13px;border-radius:11px}

.msgs{display:flex;flex-direction:column;gap:11px;padding-top:2px}
.msg{display:flex;flex-direction:column;gap:3px;animation:rise .32s ease}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.msg .nm{font-size:11.5px;font-weight:800;color:var(--ink)}
.msg.me .nm{color:var(--c-d)}
.msg .bd{font-size:14.5px;line-height:1.46;color:#2a2f37;word-break:break-word}
.msg.me .bd{background:var(--c-soft2);border:1px solid var(--c-soft);padding:8px 12px;border-radius:4px 13px 13px 13px;align-self:flex-start;max-width:88%}
.msg .ft{display:flex;align-items:center;gap:13px;margin-top:1px}
.msg .like{display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--muted);background:none;border:none;cursor:pointer;
  padding:0;font-weight:700;font-variant-numeric:tabular-nums}
.msg .like.on{color:var(--c-d)} .msg .rep{font-size:11px;color:var(--faint);background:none;border:none;cursor:pointer}
.msg.gone{animation:gone .8s forwards}
@keyframes gone{to{opacity:0;transform:translateY(-22px);filter:blur(4px)}}
.empty{color:var(--faint);font-size:13px;padding:18px 14px;text-align:center;line-height:1.5}

/* composer + 하차 */
.comp{border-top:1px solid var(--line);padding:9px 12px 12px;background:var(--paper)}
.getoff-wrap{margin-bottom:9px}
.getoff{width:100%;border:1.5px solid var(--c);background:#fff;color:var(--c-d);border-radius:13px;padding:11px;font-size:13.5px;
  font-weight:800;cursor:pointer;transition:.25s;display:flex;align-items:center;justify-content:center;gap:7px}
.getoff.hot{background:var(--c);color:#fff;padding:15px;font-size:15.5px;box-shadow:0 8px 20px rgba(22,199,166,.4);animation:beat 1.1s infinite}
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.018)}}
.nk{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);margin-bottom:9px;padding:0 2px}
.nk b{color:var(--c-d);font-weight:800} .nk button{background:none;border:none;color:var(--faint);text-decoration:underline;cursor:pointer;font-size:11px}
.ipt{display:flex;gap:8px;align-items:flex-end}
.ipt textarea{flex:1;background:var(--paper2);border:1.5px solid var(--line);border-radius:14px;color:var(--ink);padding:12px 14px;
  font-size:14.5px;resize:none;font-family:inherit;max-height:90px;outline:none}
.ipt textarea:focus{border-color:var(--c);background:#fff}
.send{width:46px;height:46px;border-radius:14px;background:var(--c);border:none;color:#fff;font-size:19px;cursor:pointer;flex:none;
  font-weight:800;box-shadow:0 4px 12px rgba(22,199,166,.3)} .send:disabled{opacity:.35;box-shadow:none}
.warn-line{font-size:11.5px;color:var(--danger);padding:0 2px 8px;font-weight:600}

.ov{position:absolute;inset:0;background:rgba(20,28,40,.42);display:flex;align-items:flex-end;z-index:30;animation:fade .2s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.sheet{background:#fff;border-radius:24px 24px 0 0;padding:22px 20px 28px;width:100%;animation:up .25s cubic-bezier(.2,.7,.2,1)}
@keyframes up{from{transform:translateY(40px)}to{transform:none}}
.sheet h3{margin:0 0 5px;font-size:18px;font-weight:800} .sheet p{margin:0 0 16px;font-size:13px;color:var(--muted);line-height:1.5}
.sheet input{width:100%;background:var(--paper2);border:1.5px solid var(--line);border-radius:13px;color:var(--ink);padding:14px;font-size:15px;outline:none;font-family:inherit}
.sheet input:focus{border-color:var(--c)}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin:13px 0 18px}
.chips button{background:var(--paper2);border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:8px 13px;font-size:12px;cursor:pointer}
.chips button:hover{border-color:var(--c);color:var(--c-d);background:var(--c-soft2)}

.end{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:32px;gap:18px}
.end .ill{width:64px;height:64px;border-radius:20px;background:linear-gradient(135deg,var(--c),#5FE3CB);display:flex;align-items:center;
  justify-content:center;font-size:30px;color:#fff;box-shadow:0 10px 28px rgba(22,199,166,.35)}
.end .big{font-size:22px;font-weight:800;line-height:1.42} .end .sub{font-size:13.5px;color:var(--muted);line-height:1.65}

/* ADMIN — 라이트 */
.admin{width:100%;min-height:100vh;background:var(--bg);display:flex;color:var(--ink)}
.adside{width:212px;flex:none;background:#fff;border-right:1px solid var(--line);padding:18px 12px;display:flex;flex-direction:column;gap:3px}
.adside .lo{font-size:14.5px;font-weight:800;padding:6px 10px 18px} .adside .lo span{color:var(--c)}
.adside a{padding:10px 12px;border-radius:11px;font-size:13.5px;color:var(--muted);cursor:pointer;font-weight:700;display:flex;align-items:center;gap:9px}
.adside a.on{background:var(--c-soft2);color:var(--c-d)} .adside a:hover{color:var(--ink)}
.admain{flex:1;padding:28px 32px;overflow-y:auto;min-width:0}
.admain h2{margin:0 0 4px;font-size:21px;font-weight:800} .admain .desc{color:var(--muted);font-size:13px;margin-bottom:22px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:16px;padding:17px;box-shadow:var(--sh)}
.kpi .n{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--c-d)} .kpi.alt .n{color:var(--ink)}
.kpi .l{font-size:12px;color:var(--muted);margin-top:3px}
.panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:18px;box-shadow:var(--sh)}
.panel h3{margin:0 0 14px;font-size:14.5px;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--faint);font-weight:800;font-size:11px;letter-spacing:.03em;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:11px 10px;border-bottom:1px solid var(--line2);color:var(--ink);vertical-align:top} tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800}
.badge.low{background:#EEF1F4;color:var(--muted)} .badge.medium{background:#FCEFD9;color:var(--warn)}
.badge.high{background:#FCE3E3;color:var(--danger)} .badge.critical{background:var(--danger);color:#fff}
.badge.g{background:var(--c-soft2);color:var(--c-d)}
.adbtn{background:var(--c);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:800;font-size:12.5px;cursor:pointer}
.adbtn.sm{padding:6px 11px;font-size:11.5px} .adbtn.danger{background:var(--danger)} .adbtn.ghost{background:#fff;border:1px solid var(--line);color:var(--muted)}
.fld{margin-bottom:13px} .fld label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:700}
.fld input,.fld select{width:100%;background:var(--paper2);border:1.5px solid var(--line);border-radius:10px;color:var(--ink);padding:11px;font-size:13px;outline:none;font-family:inherit}
.fld input:focus,.fld select:focus{border-color:var(--c)}
.optrow{display:flex;gap:8px;margin-bottom:7px} .optrow input{flex:1}
.mono{font-variant-numeric:tabular-nums}
.stream{max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.stream .it{border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:12.5px;background:var(--paper2)}
.stream .it .h{display:flex;justify-content:space-between;color:var(--faint);font-size:11px;margin-bottom:3px}
.bars{display:flex;flex-direction:column;gap:10px}
.bars .b{display:flex;align-items:center;gap:10px;font-size:12.5px}
.bars .b .nm{width:120px;flex:none;color:var(--muted);font-weight:600} .bars .b .track2{flex:1;height:10px;background:var(--paper2);border-radius:5px;overflow:hidden}
.bars .b .fill{height:100%;background:var(--c);border-radius:5px;transition:width .6s} .bars .b .v{width:62px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
`;

/* ---------------- 상수 / 데이터 ---------------- */
const K = {
  msgs:"lounge:2line:messages", votes:"lounge:2line:votes", pres:"lounge:2line:presence",
  cards:"admin:cards", reports:"admin:reports", modlog:"admin:modlog",
  ads:"admin:ads", adstats:"admin:adstats",
};
const STATIONS = ["성수","건대입구","구의","강변","잠실나루"];
const STATION_GEO = { "성수":[37.5447,127.0558], "건대입구":[37.5404,127.0701], "구의":[37.5372,127.0857], "강변":[37.5349,127.0946], "잠실나루":[37.5206,127.1031] };
function haversine(la1,lo1,la2,lo2){ const R=6371000,r=Math.PI/180;
  const dLa=(la2-la1)*r, dLo=(lo2-lo1)*r;
  const a=Math.sin(dLa/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
function nearestStation(lat,lng){ let best=null;
  STATIONS.forEach((nm,idx)=>{ const g=STATION_GEO[nm]; if(!g) return;
    const d=haversine(lat,lng,g[0],g[1]); if(!best||d<best.distM) best={name:nm,idx,distM:Math.round(d)}; });
  return best; }
const RANDOM_NICKS = ["오늘도 이동 중","창가 자리","느린 환승","막차 전","퇴근하는 사람","초록 신호","비 오는 귀가길","커피 한 잔","2호선 승객","잠깐 쉬는 중"];
const SEED_CARDS = [
  { id:"card_coffee", cat:"생활 · 라운지 진행", q:"오늘 모닝커피는 어디서 마실 거예요?",
    opts:[["스타벅스","o1"],["투썸플레이스","o2"],["이디야","o3"],["편의점 커피","o4"]],
    playlist:{ title:"출근길을 여는 30분", sub:"월요일 출근길 · 32곡", url:"https://music.youtube.com/playlist?list=PLFgquLnL59alW3xmYiWRaoz0oh3Ffb6tZ" } },
  { id:"card_tired", cat:"공감 · 라운지 진행", q:"오늘 하루 피로도는 몇 점인가요?",
    opts:[["가뿐해요 (1–3)","o1"],["보통 (4–6)","o2"],["지쳤어요 (7–8)","o3"],["방전 (9–10)","o4"]],
    playlist:{ title:"조용한 밤길", sub:"심야 이동 · 28곡", url:"https://music.youtube.com/playlist?list=PLFgquLnL59alW3xmYiWRaoz0oh3Ffb6tZ" } },
  { id:"card_seongsu", cat:"지역 · 라운지 진행", q:"성수에서 혼자 보내기 좋은 한 시간은?",
    opts:[["카페에서 책","o1"],["골목 산책","o2"],["편집숍 구경","o3"],["한강 바람","o4"]],
    playlist:{ title:"성수 산책 플레이리스트", sub:"성수역 도착 전 · 24곡", url:"https://music.youtube.com/playlist?list=PLFgquLnL59alW3xmYiWRaoz0oh3Ffb6tZ" } },
];
const SEED_ADS = [
  { id:"ad_twosome", station:"강변", brand:"투썸플레이스", offer:"오전 10시까지 아메리카노 1+1", cta:"매장 보기", url:"https://www.twosome.co.kr", active:true },
  { id:"ad_oy", station:"건대입구", brand:"올리브영", offer:"오늘만 단독 헬스앤뷰티 쿠폰", cta:"혜택 받기", url:"https://www.oliveyoung.co.kr", active:true },
];

/* 옆모습 전동차 아이콘 */
function TrainMark({size=22, color="#16C7A6"}){
  return (
    <svg width={size} height={Math.round(size*0.64)} viewBox="0 0 42 26" fill="none" style={{display:"block"}}>
      <path d="M5 8c0-2.5 2-4.5 4.5-4.5H28c5 0 9 4 9 9v5.5c0 1.9-1.5 3.5-3.5 3.5H8c-1.9 0-3-1.4-3-3.2z" fill={color}/>
      <rect x="8.5" y="7.5" width="6.6" height="6.4" rx="1.6" fill="#fff" opacity="0.92"/>
      <rect x="17.5" y="7.5" width="6.6" height="6.4" rx="1.6" fill="#fff" opacity="0.92"/>
      <path d="M28 7.5h0.5c4 0 6.6 2.6 7.2 6.4H28z" fill="#fff" opacity="0.95"/>
      <circle cx="33.5" cy="18" r="1.4" fill="#FFE08A"/>
      <circle cx="13" cy="22.5" r="2.2" fill="#15181D"/>
      <circle cx="28" cy="22.5" r="2.2" fill="#15181D"/>
    </svg>
  );
}

/* ---------------- 스토리지 ---------------- */
const sget = async (key, def) => { try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : def; } catch { return def; } };
const sset = (key, val) => { try { return window.storage.set(key, JSON.stringify(val), true); } catch { return null; } };
const uid = (p="id") => p + "_" + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3);
const now = () => Date.now();

/* ---------------- 모더레이션 ---------------- */
const LOCAL_BLOCK = [
  /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/,
  /(카톡|카카오|kakao|오픈채팅|텔레|telegram|라인|line\s?id|인스타|insta|디엠|dm)\s*[:：]?\s*\w/i,
  /(몇\s*번째\s*칸|앞에\s*있|빨간\s*옷|파란\s*옷|문\s*앞|내\s*옆)/,
];
function localScreen(text){ for(const re of LOCAL_BLOCK){ if(re.test(text)) return { risk:"high", category:"개인정보/위치특정", reason:"패턴 차단" }; } return null; }
async function moderate(text){
  const local = localScreen(text);
  if(local) return { ...local, ok:false, source:"local" };
  try{
    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000,
        messages:[{ role:"user", content:
`너는 익명 지하철 라운지 채팅의 실시간 모더레이터다. 한국어/영어/일본어/중국어(간·번체) 혼용, 철자변형·공백삽입·숫자치환·자음분리도 탐지한다.
다음 메시지를 평가해 JSON만 출력(설명·코드펜스 금지):
{"risk":"low|medium|high|critical","category":"<짧은 분류>","reason":"<한 줄>"}
기준 - low: 정상/가벼운 표현. medium: 반복욕설·조롱·외모품평. high: 성적표현·혐오·협박·연락처/SNS/위치특정 공유. critical: 폭력·자해·범죄위협·아동성착취.
메시지: """${text}"""` }] })
    });
    const data = await res.json();
    const raw = (data.content||[]).map(c=>c.type==="text"?c.text:"").join("").replace(/```json|```/g,"").trim();
    const j = JSON.parse(raw);
    const risk = ["low","medium","high","critical"].includes(j.risk)?j.risk:"low";
    return { risk, category:j.category||"-", reason:j.reason||"-", ok: risk==="low", source:"ai" };
  }catch{ return { risk:"low", category:"-", reason:"필터 미적용(폴백)", ok:true, source:"fallback" }; }
}

/* ============================================================ 사용자 앱 */
function LoungeApp(){
  const [screen, setScreen] = useState("perm");
  const [sid] = useState(()=>uid("g"));
  const [nick, setNick] = useState(null);
  const [nickModal, setNickModal] = useState(false);
  const [pendingSend, setPendingSend] = useState(null);
  const [cards, setCards] = useState(SEED_CARDS);
  const [cardIdx] = useState(0);
  const [ads, setAds] = useState(SEED_ADS);
  const [votes, setVotes] = useState({});
  const [messages, setMessages] = useState([]);
  const [count, setCount] = useState(1);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [warn, setWarn] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [adClosed, setAdClosed] = useState(false);
  const [activeAd, setActiveAd] = useState(null);
  const [locMode, setLocMode] = useState("mock");   // mock | real
  const [nearest, setNearest] = useState(null);      // {name,idx,distM}
  const [geoErr, setGeoErr] = useState("");

  // 열차 진행
  const [seg, setSeg] = useState(1);      // 출발역 index
  const [prog, setProg] = useState(0.15); // 구간 내 진행 0~1
  const [arriving, setArriving] = useState(false);
  const arrLock = useRef(false);
  const goneRef = useRef(false);
  const feedRef = useRef(null);

  const card = cards[cardIdx] || cards[0];
  const fromStn = STATIONS[seg];
  const toStn = STATIONS[Math.min(STATIONS.length-1, seg+1)];
  const trainPos = (seg + prog) / (STATIONS.length-1) * 100;
  const adSeenRef = useRef("");

  const applyGeo = useCallback((pos)=>{
    const { latitude, longitude } = pos.coords;
    const best = nearestStation(latitude, longitude);
    if(best){ setNearest(best); setSeg(best.idx); setProg(0.02); }
  },[]);

  const startMatch = async () => {
    setScreen("match");
    const loaded = await sget(K.cards, null);
    if(loaded && loaded.length) setCards(loaded);
    const la = await sget(K.ads, null);
    if(la && la.length) setAds(la);
    if(typeof navigator!=="undefined" && navigator.geolocation){
      navigator.geolocation.getCurrentPosition(
        (pos)=>{ setLocMode("real"); applyGeo(pos); setTimeout(()=>setScreen("lounge"), 1200); },
        ()=>{ setLocMode("mock"); setGeoErr("위치 동의가 없어 데모(모의) 모드로 시작해요."); setTimeout(()=>setScreen("lounge"), 1600); },
        { enableHighAccuracy:true, timeout:8000, maximumAge:0 }
      );
    } else { setLocMode("mock"); setTimeout(()=>setScreen("lounge"), 1600); }
  };

  // 실시간 위치 추적 (real 모드)
  useEffect(()=>{
    if(screen!=="lounge" || locMode!=="real" || typeof navigator==="undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(applyGeo, ()=>{}, { enableHighAccuracy:true, maximumAge:4000, timeout:10000 });
    return ()=> navigator.geolocation.clearWatch(id);
  },[screen, locMode, applyGeo]);

  // 데이터 폴링
  useEffect(()=>{
    if(screen!=="lounge") return;
    let alive = true;
    const tick = async () => {
      if(!alive) return;
      const pres = await sget(K.pres, {}); pres[sid]=now();
      for(const k of Object.keys(pres)){ if(now()-pres[k]>25000) delete pres[k]; }
      await sset(K.pres, pres); if(alive) setCount(Object.keys(pres).length||1);
      const m = await sget(K.msgs, []); if(alive) setMessages(m.slice(-120));
      const v = await sget(K.votes, {}); if(alive) setVotes(v);
      const a = await sget(K.ads, null); if(alive && a && a.length) setAds(a);
    };
    tick(); const t = setInterval(tick, 3000);
    return ()=>{ alive=false; clearInterval(t); };
  },[screen, sid]);

  // 열차 모션 (모의 모드)
  useEffect(()=>{
    if(screen!=="lounge" || locMode!=="mock") return;
    const t = setInterval(()=>{
      if(arrLock.current) return;
      setProg(p=>{
        const np = +(p+0.05).toFixed(3);
        if(np>=1){
          arrLock.current = true; setArriving(true);
          setTimeout(()=>{ setSeg(s=> s>=STATIONS.length-2?0:s+1); setProg(0.02); setArriving(false); arrLock.current=false; }, 1600);
          return 1;
        }
        return np;
      });
    }, 230);
    return ()=>clearInterval(t);
  },[screen, locMode]);

  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; },[messages.length]);

  // 역 도착 시 광고 활성화 (모의 모드, 닫기 전까지 유지)
  useEffect(()=>{
    if(screen!=="lounge" || locMode!=="mock" || !arriving) return;
    const ad = ads.find(a=>a.active!==false && a.station===toStn);
    if(ad && adSeenRef.current !== ad.id+seg){
      adSeenRef.current = ad.id+seg;
      setActiveAd(ad); setAdClosed(false);
      (async()=>{ const s=await sget(K.adstats,{}); s[ad.id]=s[ad.id]||{imp:0,clk:0}; s[ad.id].imp++; await sset(K.adstats,s); })();
    }
  },[arriving, locMode]);

  // 실위치 광고 활성화 (가장 가까운 역 1.5km 이내)
  useEffect(()=>{
    if(screen!=="lounge" || locMode!=="real" || !nearest) return;
    const ad = ads.find(a=>a.active!==false && a.station===nearest.name);
    if(ad && nearest.distM < 1500 && adSeenRef.current !== ad.id+"R"+nearest.name){
      adSeenRef.current = ad.id+"R"+nearest.name;
      setActiveAd(ad); setAdClosed(false);
      (async()=>{ const s=await sget(K.adstats,{}); s[ad.id]=s[ad.id]||{imp:0,clk:0}; s[ad.id].imp++; await sset(K.adstats,s); })();
    }
  },[nearest, locMode]);

  const clickAd = async (ad) => {
    const s=await sget(K.adstats,{}); s[ad.id]=s[ad.id]||{imp:0,clk:0}; s[ad.id].clk++; await sset(K.adstats,s);
  };

  const vote = async (optId) => {
    const v = await sget(K.votes, {});
    const cv = v[card.id] || { counts:{}, voters:{} };
    const prev = cv.voters[sid]; if(prev===optId) return;
    if(prev) cv.counts[prev] = Math.max(0,(cv.counts[prev]||1)-1);
    cv.counts[optId] = (cv.counts[optId]||0)+1; cv.voters[sid]=optId;
    v[card.id]=cv; setVotes(v); await sset(K.votes, v);
  };
  const myVote = votes[card?.id]?.voters?.[sid];
  const counts = votes[card?.id]?.counts || {};
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const myOpt = card?.opts.find(o=>o[1]===myVote);
  const myPct = total ? Math.round((counts[myVote]||0)/total*100) : 0;

  const ensureNick = (after) => { if(nick){ after(); return; } setPendingSend(()=>after); setNickModal(true); };
  const confirmNick = (chosen) => {
    const n = (chosen||"").trim() || RANDOM_NICKS[Math.floor(Math.random()*RANDOM_NICKS.length)];
    setNick(n); setNickModal(false);
    const f = pendingSend; setPendingSend(null); if(f) setTimeout(f, 60);
  };

  const doSend = async () => {
    const body = text.trim(); if(!body || sending) return;
    ensureNick(async ()=>{
      setSending(true); setWarn("");
      const verdict = await moderate(body);
      const log = await sget(K.modlog, []);
      log.push({ id:uid("ml"), sid, nick:nick||"-", text:body, risk:verdict.risk, category:verdict.category, reason:verdict.reason, source:verdict.source, ts:now() });
      await sset(K.modlog, log.slice(-200));
      if(!verdict.ok){
        setSending(false);
        setWarn(verdict.risk==="critical"||verdict.risk==="high"
          ? "안전한 대화를 위해 일부 표현은 사용할 수 없어요. 표현을 바꿔 다시 보내주세요."
          : "조금 더 부드러운 표현으로 바꿔주세요."); return;
      }
      const m = await sget(K.msgs, []);
      m.push({ id:uid("m"), sid, nick:nick||"익명의 승객", content:body, likes:[], ts:now() });
      const trimmed = m.slice(-120); setMessages(trimmed); await sset(K.msgs, trimmed);
      setText(""); setSending(false);
    });
  };

  const like = async (mid) => {
    const m = await sget(K.msgs, []); const t = m.find(x=>x.id===mid); if(!t) return;
    t.likes = t.likes||[]; const i = t.likes.indexOf(sid);
    if(i>=0) t.likes.splice(i,1); else t.likes.push(sid);
    setMessages([...m].slice(-120)); await sset(K.msgs, m);
  };
  const report = async (msg) => {
    const r = await sget(K.reports, []);
    r.push({ id:uid("rp"), msgId:msg.id, content:msg.content, nick:msg.nick, by:sid, status:"open", ts:now() });
    await sset(K.reports, r); setMessages(prev=> prev.filter(x=>x.id!==msg.id));
  };
  const getOff = async () => {
    if(goneRef.current) return; goneRef.current = true;
    setMessages(prev=> prev.map(x=> x.sid===sid? {...x,_gone:true}:x));
    setTimeout(async ()=>{
      const m = await sget(K.msgs, []); await sset(K.msgs, m.filter(x=>x.sid!==sid));
      const pres = await sget(K.pres, {}); delete pres[sid]; await sset(K.pres, pres);
      setScreen("end");
    }, 850);
  };

  /* ---- 렌더 ---- */
  if(screen==="perm") return (
    <div className="scr"><div className="center perm">
      <div className="pill"><span className="dot-live"/> 같은 방향</div>
      <h1>같은 방향으로 이동 중인 사람들과,<br/>탑승한 시간 동안만 연결돼요.</h1>
      <p className="muted" style={{fontSize:14,lineHeight:1.65,margin:0}}>프로필도, 친구도, 다음도 없어요.<br/>내리면 남긴 말은 사라집니다.</p>
      <div className="note">위치정보는 <b style={{color:"var(--c-d)"}}>라운지 연결 · 자동 하차 감지 · 역 도착 안내</b>에만 쓰여요. 다른 이용자나 광고주에게 제공되지 않고, 세션이 끝나면 수집을 멈춰요.</div>
      <button className="btn" onClick={startMatch}>위치 허용하고 시작하기</button>
      <p className="faint" style={{textAlign:"center",fontSize:11.5,marginTop:14}}>동의하면 실제 가까운 2호선 역 기준으로 연결돼요 · 거부하면 데모(모의) 모드</p>
    </div></div>
  );

  if(screen==="match") return (
    <div className="scr"><div className="center" style={{alignItems:"flex-start"}}>
      <div className="pill" style={{display:"inline-flex",alignItems:"center",gap:7,background:"var(--c-soft2)",border:"1px solid var(--c-soft)",
        borderRadius:999,padding:"7px 14px",fontSize:12.5,color:"var(--c-d)",fontWeight:800}}><span className="dot-live"/> 이동 경로 확인 중</div>
      <h1 style={{fontSize:23,fontWeight:800,margin:"16px 0 0",lineHeight:1.4,letterSpacing:"-0.02em"}}>이동 중인 라운지로<br/>들어가고 있어요</h1>
      <div className="match-stage">
        <div className="rail"/>
        <div className="train"><TrainMark size={56}/></div>
      </div>
      <p className="muted" style={{fontSize:13.5}}>현재 위치와 방향을 분석하는 중이에요.</p>
    </div></div>
  );

  if(screen==="end") return (
    <div className="scr"><div className="end">
      <div className="ill">✓</div>
      <div className="big">{toStn}역에 도착했어요.</div>
      <div className="sub">이 라운지에서 남긴 말은 사라졌어요.<br/>오늘도 이동하느라 수고했어요.</div>
      <a className="pl" href={card.playlist.url} target="_blank" rel="noreferrer" style={{marginTop:8,width:"100%",maxWidth:300}}>
        <div className="ico">♫</div><div className="t"><div className="a">오늘의 플레이리스트 다시 듣기</div><div className="b">{card.playlist.title}</div></div></a>
      <button className="btn ghost" style={{maxWidth:300,marginTop:4}} onClick={()=>{ goneRef.current=false; setSeg(1); setProg(0.15); setScreen("perm"); }}>홈으로</button>
    </div></div>
  );

  const isReal = locMode==="real";
  const curIdx = isReal ? (nearest? nearest.idx : seg) : seg;
  const posPct = isReal ? (nearest? nearest.idx/(STATIONS.length-1)*100 : 0) : trainPos;
  const passedTo = isReal ? curIdx : (seg+prog);
  const arrNow = isReal ? (nearest && nearest.distM < 300) : arriving;
  const headTitle = isReal
    ? (nearest ? (arrNow ? `${nearest.name}역 도착` : `${nearest.name}역 부근`) : "위치 확인 중")
    : (arriving ? `곧 ${toStn}역 도착` : "2호선 외선 이동 중");

  return (
    <div className="scr">
      <div className={"lh"+(arrNow?" arr":"")}>
        <div className="row1"><span className="ico" style={{display:"inline-flex",alignItems:"center"}}><TrainMark size={19} color={arrNow?"#0A8F77":"#16C7A6"}/></span>
          {headTitle}
          <span className="cnt">함께 이동 중 {count}명</span></div>
        <div className="track">
          <div className="base"/>
          <div className="fill" style={{width:`${posPct}%`}}/>
          {STATIONS.map((_,i)=>{
            const left = i/(STATIONS.length-1)*100;
            return <div key={i} className={"stop"+(passedTo>=i?" passed":"")} style={{left:`calc(${left}% )`}}/>;
          })}
          <div className="train" style={{left:`${posPct}%`}}><TrainMark size={30}/></div>
        </div>
        <div className="stn">
          <span className="from">{isReal ? "📍 실시간 위치" : fromStn}</span>
          <span className="to">{isReal ? (nearest ? `${nearest.distM.toLocaleString()}m` : "측정 중") : (arriving?`${toStn} 도착`:`다음 · ${toStn}`)}</span>
        </div>
      </div>

      {activeAd && !adClosed && (
        <div className="adbanner">
          {activeAd.image ? <img className="adthumb" src={activeAd.image} alt=""/> : <div className="adbar"/>}
          <div className="adbody">
            <div className="adlabel">광고 · {activeAd.station}역</div>
            <div className="adhead">{activeAd.brand} {activeAd.station}역점</div>
            <div className="adoffer">{activeAd.offer}</div>
          </div>
          <a className="adcta" href={activeAd.url} target="_blank" rel="noreferrer" onClick={()=>clickAd(activeAd)}>{activeAd.cta||"매장 보기"}</a>
          <button className="adx" onClick={()=>setAdClosed(true)} aria-label="광고 닫기">✕</button>
        </div>
      )}

      <div className="feed" ref={feedRef}>
        <div className={"card"+(myVote && !showResult ? " mini":"")}>
          <div className="cardhead">
            <div className="tag">{card.cat}</div>
            {myVote && <button className="vtoggle" onClick={()=>setShowResult(s=>!s)}>{showResult?"접기 ▴":"전체 결과 ▾"}</button>}
          </div>
          <div className={"q"+(myVote && !showResult ? " qmini":"")}>{card.q}</div>

          {(!myVote || showResult) && <>
            {card.opts.map(([label,oid])=>{
              const c = counts[oid]||0; const pct = total? Math.round(c/total*100):0;
              return (
                <div key={oid} className={"opt"+(myVote===oid?" sel":"")} onClick={()=>vote(oid)}>
                  <div className="bar" style={{width:(myVote?pct:0)+"%"}}/>
                  <span className="lbl">{label}</span>{myVote && <span className="pct">{pct}%</span>}
                </div>);
            })}
            <div className="meta"><span>{total}명 참여</span>{!myVote && <span className="hint">탭해서 투표하면 결과가 보여요</span>}</div>
          </>}

          {myVote && !showResult && (
            <div className="vsum">
              <span className="chk">✓</span>
              <span className="vlbl">내 선택 <b>{myOpt?.[0]}</b></span>
              <span className="vpct">{myPct}%</span>
              <span className="vtot">· {total}명</span>
            </div>
          )}
        </div>

        <a className="pl" href={card.playlist.url} target="_blank" rel="noreferrer">
          <div className="ico">♫</div><div className="t"><div className="a">{card.playlist.title}</div><div className="b">{card.playlist.sub}</div></div>
          <span className="play">▶ 재생</span></a>

        <div className="msgs">
          {messages.length===0 && <div className="empty">첫 한 줄을 남겨보세요.<br/>카드에 대한 생각이면 좋아요.</div>}
          {messages.map(m=>{
            const liked = (m.likes||[]).includes(sid);
            return (
              <div key={m.id} className={"msg"+(m.sid===sid?" me":"")+(m._gone?" gone":"")}>
                <div className="nm">{m.sid===sid?"나":m.nick}</div>
                <div className="bd">{m.content}</div>
                <div className="ft">
                  <button className={"like"+(liked?" on":"")} onClick={()=>like(m.id)}>👍 {(m.likes||[]).length||0}</button>
                  {m.sid!==sid && <button className="rep" onClick={()=>report(m)}>신고</button>}
                </div></div>);
          })}
        </div>
      </div>

      <div className="comp">
        {warn && <div className="warn-line">{warn}</div>}
        <div className="getoff-wrap">
          <button className={"getoff"+(arriving?" hot":"")} onClick={getOff}>
            {arriving ? `🚉 ${toStn}역에서 내릴게요` : "여기서 내릴게요"}
          </button>
        </div>
        <div className="nk">
          {nick ? <>이 라운지에서 <b>{nick}</b> <button onClick={()=>setNickModal(true)}>변경</button></>
                : <>이름 없이 참여 중 · 첫 메시지에 이름을 정할 수 있어요</>}
        </div>
        <div className="ipt">
          <textarea rows={1} maxLength={100} value={text} placeholder="한 줄 남기기 (100자)"
            onChange={e=>{ setText(e.target.value); if(warn) setWarn(""); }}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); doSend(); } }}/>
          <button className="send" disabled={!text.trim()||sending} onClick={doSend}>{sending?"…":"↑"}</button>
        </div>
      </div>

      {nickModal && (
        <div className="ov" onClick={()=>setNickModal(false)}>
          <div className="sheet" onClick={e=>e.stopPropagation()}>
            <h3>이 라운지에서 쓸 이름</h3>
            <p>비워두면 랜덤 이름으로 참여해요. 내리면 이름도 사라집니다.</p>
            <input id="nkin" maxLength={12} defaultValue={nick||""} placeholder="최대 12자" onKeyDown={e=>{ if(e.key==="Enter") confirmNick(e.target.value); }}/>
            <div className="chips">{RANDOM_NICKS.slice(0,6).map(n=><button key={n} onClick={()=>confirmNick(n)}>{n}</button>)}</div>
            <button className="btn" onClick={()=>confirmNick(document.getElementById("nkin").value)}>이 이름으로 참여</button>
            <button className="btn ghost" style={{marginTop:8}} onClick={()=>confirmNick("")}>랜덤으로 참여하기</button>
          </div></div>
      )}
    </div>
  );
}

/* ============================================================ 관리자 */
function Admin(){
  const [tab, setTab] = useState("dash");
  const [cards, setCards] = useState([]); const [reports, setReports] = useState([]);
  const [modlog, setModlog] = useState([]); const [msgs, setMsgs] = useState([]);
  const [votes, setVotes] = useState({}); const [pres, setPres] = useState({});
  const [ads, setAds] = useState([]); const [adstats, setAdstats] = useState({});
  const refresh = useCallback(async ()=>{
    const c = await sget(K.cards, null); setCards(c && c.length ? c : SEED_CARDS);
    setReports(await sget(K.reports, [])); setModlog(await sget(K.modlog, []));
    setMsgs(await sget(K.msgs, [])); setVotes(await sget(K.votes, {}));
    const a = await sget(K.ads, null); setAds(a && a.length ? a : SEED_ADS);
    setAdstats(await sget(K.adstats, {}));
    const p = await sget(K.pres, {}); for(const k of Object.keys(p)){ if(now()-p[k]>25000) delete p[k]; } setPres(p);
  },[]);
  useEffect(()=>{ refresh(); const t=setInterval(refresh,3000); return ()=>clearInterval(t); },[refresh]);
  const liveCount = Object.keys(pres).length;
  const openReports = reports.filter(r=>r.status==="open").length;
  const totalVotes = Object.values(votes).reduce((a,v)=>a+Object.values(v.counts||{}).reduce((x,y)=>x+y,0),0);
  const blocked = modlog.filter(m=>m.risk!=="low").length;
  const adClicks = Object.values(adstats).reduce((a,s)=>a+(s.clk||0),0);
  return (
    <div className="admin">
      <div className="adside">
        <div className="lo"><span>●</span> 같은 방향 <span style={{color:"var(--faint)",fontWeight:600}}>운영</span></div>
        {[["dash","대시보드","◧"],["cards","대화카드","▣"],["ads","역 도착 광고","◈"],["monitor","실시간 모니터링","◉"],["reports","신고 큐","⚑"],["mod","모더레이션 로그","⛨"]].map(([k,l,i])=>(
          <a key={k} className={tab===k?"on":""} onClick={()=>setTab(k)}><span style={{width:14}}>{i}</span>{l}
            {k==="reports"&&openReports>0 && <span className="badge high" style={{marginLeft:"auto"}}>{openReports}</span>}</a>
        ))}
      </div>
      <div className="admain">
        {tab==="dash" && <Dash {...{liveCount,msgs,totalVotes,openReports,blocked,votes,cards,adClicks}}/>}
        {tab==="cards" && <Cards {...{cards,setCards,refresh}}/>}
        {tab==="ads" && <Ads {...{ads,setAds,adstats,refresh}}/>}
        {tab==="monitor" && <Monitor {...{msgs,liveCount}}/>}
        {tab==="reports" && <Reports {...{reports,setReports,refresh}}/>}
        {tab==="mod" && <ModLog {...{modlog}}/>}
      </div>
    </div>
  );
}
function Dash({liveCount,msgs,totalVotes,openReports,blocked,votes,cards,adClicks}){
  const card = cards[0]||SEED_CARDS[0]; const cv = votes[card.id]?.counts||{};
  const ctot = Object.values(cv).reduce((a,b)=>a+b,0);
  return (<>
    <h2>대시보드</h2><div className="desc">2호선 외선 라운지 · 실시간 운영 현황 (3초 갱신)</div>
    <div className="kpis">
      <div className="kpi"><div className="n">{liveCount}</div><div className="l">현재 접속</div></div>
      <div className="kpi alt"><div className="n">{msgs.length}</div><div className="l">누적 메시지</div></div>
      <div className="kpi alt"><div className="n">{totalVotes}</div><div className="l">투표 참여</div></div>
      <div className="kpi alt"><div className="n">{adClicks||0}</div><div className="l">광고 클릭</div></div>
      <div className="kpi"><div className="n" style={{color:openReports?"var(--danger)":"var(--c-d)"}}>{openReports}</div><div className="l">미처리 신고</div></div>
      <div className="kpi alt"><div className="n" style={{color:blocked?"var(--warn)":"var(--ink)"}}>{blocked}</div><div className="l">차단·검토 건</div></div>
    </div>
    <div className="panel"><h3>현재 카드 투표 분포 — {card.q}</h3>
      {ctot===0 ? <div className="empty">아직 투표가 없어요.</div> :
        <div className="bars">{card.opts.map(([label,oid])=>{ const c=cv[oid]||0; const pct=ctot?Math.round(c/ctot*100):0;
          return <div className="b" key={oid}><div className="nm">{label}</div><div className="track2"><div className="fill" style={{width:pct+"%"}}/></div><div className="v mono">{pct}% ({c})</div></div>; })}</div>}
    </div></>);
}
function Cards({cards,setCards,refresh}){
  const [q,setQ]=useState(""); const [cat,setCat]=useState("생활"); const [opts,setOpts]=useState(["",""]); const [pl,setPl]=useState(""); const [url,setUrl]=useState("");
  const add = async ()=>{
    if(!q.trim()||opts.filter(o=>o.trim()).length<2) return;
    const card={ id:uid("card"), cat:cat+" · 라운지 진행", q:q.trim(), opts:opts.filter(o=>o.trim()).map((o,i)=>[o.trim(),"o"+(i+1)]),
      playlist:{ title:pl.trim()||"라운지 플레이리스트", sub:cat+" · 운영 선정", url:url.trim()||"https://music.youtube.com" } };
    const next=[...cards,card]; setCards(next); await sset(K.cards,next); setQ(""); setOpts(["",""]); setPl(""); setUrl(""); refresh();
  };
  const del = async (id)=>{ const next=cards.filter(c=>c.id!==id); setCards(next); await sset(K.cards,next); refresh(); };
  return (<>
    <h2>대화카드</h2><div className="desc">라운지에 노출되는 카드·앙케이트·연결 플레이리스트를 관리해요.</div>
    <div className="panel"><h3>새 카드 등록</h3>
      <div className="fld"><label>카드 질문</label><input value={q} onChange={e=>setQ(e.target.value)} placeholder="예: 오늘 점심은 뭘 드실 건가요?"/></div>
      <div className="fld"><label>카테고리</label><select value={cat} onChange={e=>setCat(e.target.value)}>{["생활","공감","추천","지역","광고"].map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="fld"><label>선택지 (2–5개)</label>
        {opts.map((o,i)=>(<div className="optrow" key={i}>
          <input value={o} onChange={e=>{const n=[...opts];n[i]=e.target.value;setOpts(n);}} placeholder={`선택지 ${i+1}`}/>
          {opts.length>2 && <button className="adbtn ghost sm" onClick={()=>setOpts(opts.filter((_,j)=>j!==i))}>−</button>}</div>))}
        {opts.length<5 && <button className="adbtn ghost sm" onClick={()=>setOpts([...opts,""])}>+ 선택지 추가</button>}</div>
      <div className="fld"><label>플레이리스트 제목</label><input value={pl} onChange={e=>setPl(e.target.value)} placeholder="예: 출근길을 여는 30분"/></div>
      <div className="fld"><label>플레이리스트 URL</label><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://music.youtube.com/..."/></div>
      <button className="adbtn" onClick={add}>카드 등록</button></div>
    <div className="panel"><h3>등록된 카드 ({cards.length})</h3>
      <table><thead><tr><th>카테고리</th><th>질문</th><th>선택지</th><th>플레이리스트</th><th/></tr></thead>
        <tbody>{cards.map(c=>(<tr key={c.id}><td><span className="badge g">{(c.cat||"").split(" · ")[0]}</span></td><td>{c.q}</td>
          <td className="muted">{c.opts.map(o=>o[0]).join(" / ")}</td><td className="muted">{c.playlist?.title}</td>
          <td><button className="adbtn danger sm" onClick={()=>del(c.id)}>삭제</button></td></tr>))}</tbody></table></div></>);
}
function Ads({ads,setAds,adstats,refresh}){
  const [station,setStation]=useState(STATIONS[3]); const [brand,setBrand]=useState("");
  const [offer,setOffer]=useState(""); const [cta,setCta]=useState("매장 보기"); const [url,setUrl]=useState("");
  const add = async ()=>{
    if(!brand.trim()||!offer.trim()) return;
    const ad={ id:uid("ad"), station, brand:brand.trim(), offer:offer.trim(), cta:cta.trim()||"매장 보기", url:url.trim()||"#", active:true };
    const next=[...ads,ad]; setAds(next); await sset(K.ads,next); setBrand(""); setOffer(""); setUrl(""); refresh();
  };
  const toggle = async (id)=>{ const next=ads.map(a=>a.id===id?{...a,active:!(a.active!==false)}:a); setAds(next); await sset(K.ads,next); refresh(); };
  const del = async (id)=>{ const next=ads.filter(a=>a.id!==id); setAds(next); await sset(K.ads,next); refresh(); };
  const totImp=Object.values(adstats).reduce((a,s)=>a+(s.imp||0),0);
  const totClk=Object.values(adstats).reduce((a,s)=>a+(s.clk||0),0);
  const ctr = totImp? (totClk/totImp*100).toFixed(1):"0.0";
  return (<>
    <h2>역 도착 광고</h2><div className="desc">해당 역에 도착할 때만 라운지 상단에 한 번 노출됩니다. 광고는 항상 “광고”로 표기돼요.</div>
    <div className="kpis">
      <div className="kpi"><div className="n">{totImp}</div><div className="l">총 노출</div></div>
      <div className="kpi alt"><div className="n">{totClk}</div><div className="l">총 클릭</div></div>
      <div className="kpi alt"><div className="n">{ctr}%</div><div className="l">평균 CTR</div></div>
    </div>
    <div className="panel"><h3>새 역 도착 광고</h3>
      <div className="fld"><label>도착역</label><select value={station} onChange={e=>setStation(e.target.value)}>{STATIONS.map(s=><option key={s}>{s}</option>)}</select></div>
      <div className="fld"><label>브랜드 / 매장</label><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="예: 투썸플레이스"/></div>
      <div className="fld"><label>혜택 문구</label><input value={offer} onChange={e=>setOffer(e.target.value)} placeholder="예: 오전 10시까지 아메리카노 1+1"/></div>
      <div className="fld"><label>버튼 문구</label><input value={cta} onChange={e=>setCta(e.target.value)} placeholder="매장 보기"/></div>
      <div className="fld"><label>연결 URL</label><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/></div>
      <button className="adbtn" onClick={add}>광고 등록</button></div>
    <div className="panel"><h3>등록된 광고 ({ads.length})</h3>
      <table><thead><tr><th>도착역</th><th>브랜드</th><th>혜택</th><th>노출</th><th>클릭</th><th>CTR</th><th>상태</th><th/></tr></thead>
        <tbody>{ads.map(a=>{ const s=adstats[a.id]||{imp:0,clk:0}; const c=s.imp?(s.clk/s.imp*100).toFixed(1):"0.0";
          return (<tr key={a.id}><td><span className="badge g">{a.station}역</span></td><td>{a.brand}</td><td className="muted">{a.offer}</td>
            <td className="mono">{s.imp||0}</td><td className="mono">{s.clk||0}</td><td className="mono">{c}%</td>
            <td><span className={"badge "+(a.active!==false?"g":"low")}>{a.active!==false?"노출":"중지"}</span></td>
            <td style={{display:"flex",gap:6}}><button className="adbtn ghost sm" onClick={()=>toggle(a.id)}>{a.active!==false?"중지":"재개"}</button>
              <button className="adbtn danger sm" onClick={()=>del(a.id)}>삭제</button></td></tr>); })}</tbody></table></div></>);
}
function Monitor({msgs,liveCount}){
  return (<>
    <h2>실시간 모니터링</h2><div className="desc">읽기 전용 스트림 · 일반 채팅은 보관하지 않으며 운영 화면에서만 흐릅니다.</div>
    <div className="kpis"><div className="kpi"><div className="n">{liveCount}</div><div className="l">현재 접속</div></div>
      <div className="kpi alt"><div className="n">{msgs.length}</div><div className="l">표시 중 메시지</div></div></div>
    <div className="panel"><h3>메시지 스트림</h3><div className="stream">
      {msgs.length===0 && <div className="empty">아직 메시지가 없어요.</div>}
      {[...msgs].reverse().map(m=>(<div className="it" key={m.id}>
        <div className="h"><span style={{color:"var(--c-d)",fontWeight:700}}>{m.nick}</span>
          <span className="mono">{new Date(m.ts).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} · 👍{(m.likes||[]).length}</span></div>
        <div>{m.content}</div></div>))}</div></div></>);
}
function Reports({reports,setReports,refresh}){
  const act = async (id,status)=>{ const next=reports.map(r=>r.id===id?{...r,status}:r); setReports(next); await sset(K.reports,next); refresh(); };
  const open=reports.filter(r=>r.status==="open"); const done=reports.filter(r=>r.status!=="open");
  return (<>
    <h2>신고 큐</h2><div className="desc">신고된 메시지는 이용자 화면에서 즉시 숨김 처리됩니다. 여기서 조치를 기록해요.</div>
    <div className="panel"><h3>미처리 ({open.length})</h3>
      {open.length===0 ? <div className="empty">처리할 신고가 없어요.</div> :
        <table><thead><tr><th>닉네임</th><th>내용</th><th>시각</th><th>조치</th></tr></thead>
          <tbody>{open.map(r=>(<tr key={r.id}><td>{r.nick}</td><td>{r.content}</td>
            <td className="muted mono">{new Date(r.ts).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}</td>
            <td style={{display:"flex",gap:6}}><button className="adbtn danger sm" onClick={()=>act(r.id,"hidden")}>숨김 확정</button>
              <button className="adbtn ghost sm" onClick={()=>act(r.id,"kept")}>유지</button></td></tr>))}</tbody></table>}</div>
    {done.length>0 && <div className="panel"><h3>처리됨 ({done.length})</h3>
      <table><thead><tr><th>닉네임</th><th>내용</th><th>결과</th></tr></thead>
        <tbody>{done.map(r=>(<tr key={r.id}><td>{r.nick}</td><td className="muted">{r.content}</td>
          <td><span className={"badge "+(r.status==="hidden"?"high":"low")}>{r.status==="hidden"?"숨김":"유지"}</span></td></tr>))}</tbody></table></div>}</>);
}
function ModLog({modlog}){
  const cnt = (r)=>modlog.filter(m=>m.risk===r).length;
  return (<>
    <h2>모더레이션 로그</h2><div className="desc">다국어 비속어·유해표현·개인정보 탐지 결과 (Claude 모더레이션 + 패턴 폴백)</div>
    <div className="kpis">{["low","medium","high","critical"].map(r=>(
      <div className="kpi alt" key={r}><div className="n" style={{color:r==="low"?"var(--c-d)":r==="critical"?"var(--danger)":"var(--warn)"}}>{cnt(r)}</div><div className="l">{r}</div></div>))}</div>
    <div className="panel"><h3>최근 평가 ({modlog.length})</h3>
      {modlog.length===0 ? <div className="empty">아직 기록이 없어요.</div> :
        <table><thead><tr><th>위험도</th><th>분류</th><th>메시지</th><th>판정 근거</th><th>출처</th></tr></thead>
          <tbody>{[...modlog].reverse().map(m=>(<tr key={m.id}><td><span className={"badge "+m.risk}>{m.risk}</span></td>
            <td className="muted">{m.category}</td><td>{m.text}</td><td className="muted">{m.reason}</td><td className="muted mono">{m.source}</td></tr>))}</tbody></table>}</div></>);
}

/* ============================================================ 광고주 센터 */
function Advertiser(){
  const [ads, setAds] = useState([]); const [adstats, setAdstats] = useState({});
  const [station,setStation]=useState(STATIONS[3]); const [brand,setBrand]=useState("");
  const [offer,setOffer]=useState(""); const [cta,setCta]=useState("매장 보기"); const [url,setUrl]=useState("");
  const [image,setImage]=useState(null); const [msg,setMsg]=useState("");
  const fileRef = useRef(null);

  const load = useCallback(async ()=>{
    const a = await sget(K.ads, null); setAds(a && a.length ? a : SEED_ADS);
    setAdstats(await sget(K.adstats, {}));
  },[]);
  useEffect(()=>{ load(); const t=setInterval(load,3000); return ()=>clearInterval(t); },[load]);

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max=480; const scale=Math.min(1, max/img.width);
        const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
        const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
        cv.getContext("2d").drawImage(img,0,0,w,h);
        setImage(cv.toDataURL("image/jpeg",0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if(!brand.trim()||!offer.trim()){ setMsg("브랜드와 혜택 문구를 입력해주세요."); return; }
    const ad={ id:uid("ad"), station, brand:brand.trim(), offer:offer.trim(), cta:cta.trim()||"매장 보기",
      url:url.trim()||"#", image:image||null, active:true };
    const cur = await sget(K.ads, []); const next=[...(cur&&cur.length?cur:SEED_ADS), ad];
    await sset(K.ads, next); setAds(next);
    setBrand(""); setOffer(""); setUrl(""); setImage(null); if(fileRef.current) fileRef.current.value="";
    setMsg(`등록 완료 · ${station}역 도착 시 앱 라운지에 노출됩니다.`);
    setTimeout(()=>setMsg(""), 4000);
  };

  const mine = ads;
  const totImp=Object.values(adstats).reduce((a,s)=>a+(s.imp||0),0);
  const totClk=Object.values(adstats).reduce((a,s)=>a+(s.clk||0),0);
  const ctr = totImp? (totClk/totImp*100).toFixed(1):"0.0";

  return (
    <div className="adv">
      <div className="ahead"><h2>광고주 센터</h2><div className="desc">소재를 올리고 도착역을 고르면, 그 역에 도착하는 라운지 상단에 바로 노출됩니다.</div></div>
      <div className="kpis" style={{maxWidth:1000,margin:"0 auto 18px"}}>
        <div className="kpi"><div className="n">{totImp}</div><div className="l">총 노출</div></div>
        <div className="kpi alt"><div className="n">{totClk}</div><div className="l">총 클릭</div></div>
        <div className="kpi alt"><div className="n">{ctr}%</div><div className="l">평균 CTR</div></div>
      </div>
      <div className="grid">
        <div>
          <div className="panel"><h3>새 캠페인 만들기</h3>
            <div className="fld"><label>소재 이미지 (로고·배너)</label>
              <div className="uploader" onClick={()=>fileRef.current&&fileRef.current.click()}>
                {image ? <img src={image} alt="소재 미리보기"/> :
                  <><div className="up-ico">＋</div><div className="up-t">이미지 업로드</div><div className="up-s">정사각형 로고나 가로 배너 · 자동으로 480px로 최적화돼요</div></>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{display:"none"}}/>
              {image && <button className="adbtn ghost sm" style={{marginTop:8}} onClick={()=>{setImage(null); if(fileRef.current)fileRef.current.value="";}}>소재 제거</button>}
            </div>
            <div className="fld"><label>도착역</label><select value={station} onChange={e=>setStation(e.target.value)}>{STATIONS.map(s=><option key={s}>{s}</option>)}</select></div>
            <div className="fld"><label>브랜드 / 매장</label><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="예: 투썸플레이스"/></div>
            <div className="fld"><label>혜택 문구</label><input value={offer} onChange={e=>setOffer(e.target.value)} placeholder="예: 오전 10시까지 아메리카노 1+1"/></div>
            <div className="fld"><label>버튼 문구</label><input value={cta} onChange={e=>setCta(e.target.value)} placeholder="매장 보기"/></div>
            <div className="fld"><label>연결 URL</label><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/></div>
            <button className="adbtn" onClick={submit}>캠페인 등록</button>
            {msg && <div className="advmsg">{msg}</div>}
          </div>
        </div>
        <div>
          <div className="panel"><h3>앱 배너 미리보기</h3>
            <div className="adbanner" style={{border:"1px solid var(--line)",borderRadius:13}}>
              {image ? <img className="adthumb" src={image} alt=""/> : <div className="adbar"/>}
              <div className="adbody"><div className="adlabel">광고 · 곧 {station}역</div>
                <div className="adhead">{brand||"브랜드명"} {station}역점</div>
                <div className="adoffer">{offer||"혜택 문구가 여기에 표시돼요"}</div></div>
              <span className="adcta">{cta||"매장 보기"}</span></div>
            <div className="desc" style={{marginTop:12,marginBottom:0}}>실제 앱에서는 사용자가 {station}역에 도착할 때만 이렇게 노출됩니다.</div>
          </div>
          <div className="panel"><h3>내 캠페인 ({mine.length})</h3>
            {mine.length===0 ? <div className="empty">아직 등록한 캠페인이 없어요.</div> :
              <table><thead><tr><th>소재</th><th>도착역</th><th>브랜드</th><th>노출</th><th>클릭</th><th>CTR</th></tr></thead>
                <tbody>{mine.map(a=>{ const s=adstats[a.id]||{imp:0,clk:0}; const c=s.imp?(s.clk/s.imp*100).toFixed(1):"0.0";
                  return (<tr key={a.id}>
                    <td>{a.image ? <img src={a.image} alt="" style={{width:34,height:34,borderRadius:7,objectFit:"cover",border:"1px solid var(--line)"}}/> : <span className="muted">—</span>}</td>
                    <td><span className="badge g">{a.station}역</span></td><td>{a.brand}</td>
                    <td className="mono">{s.imp||0}</td><td className="mono">{s.clk||0}</td><td className="mono">{c}%</td></tr>); })}</tbody></table>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ 루트 */
export default function App(){
  const [mode, setMode] = useState("app");
  return (
    <div className="lg-root">
      <style>{CSS}</style>
      <div className="lg-topbar">
        <span className="brand"><b>●</b> 같은 방향 · Alpha v0.2</span>
        <button className={mode==="app"?"on":""} onClick={()=>setMode("app")}>사용자 앱</button>
        <button className={mode==="adv"?"on":""} onClick={()=>setMode("adv")}>광고주</button>
        <button className={mode==="admin"?"on":""} onClick={()=>setMode("admin")}>관리자</button>
      </div>
      {mode==="app" ? <div className="phone"><LoungeApp/></div> : mode==="adv" ? <Advertiser/> : <Admin/>}
    </div>
  );
}
